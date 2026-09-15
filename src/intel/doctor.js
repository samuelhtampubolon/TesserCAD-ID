/**
 * The Design Doctor: continuous validation, and repairs that keep design intent.
 *
 * Conventional CAD answers "is this geometry valid?" and leaves the more useful
 * question alone: will this part actually work, and can the shop you are sending
 * it to make it? The Doctor runs after every rebuild and turns that into a
 * ranked list of findings, each one carrying three things a bare error message
 * never does - what is wrong, why it matters, and where possible a repair the
 * user can apply without understanding the internals.
 *
 * Two rules govern everything here.
 *
 * It never edits on its own. Every repair is a described, single-step, undoable
 * edit the user chooses. Software that silently "fixes" a model teaches you not
 * to trust it.
 *
 * It never claims more precision than it has. Several of these checks are honest
 * proxies rather than exact analyses: real minimum-wall detection wants a medial
 * axis, and interference wants a mesh-mesh intersection. Where a check is a
 * proxy the finding says so in its own text, so a user is never misled about
 * what has been verified. Nothing here is a substitute for FEA or a DFM review.
 */
import * as THREE from 'three';
import { MATERIALS, catalogOf } from '../core/doc.js';
import { massProperties } from '../core/rebuild.js';
import { TRI_BUDGET } from '../core/csg.js';
import { processOf, processSuits, PROCESSES } from './process.js';
import { limits } from './standards.js';
import { findClashes } from './interfere.js';
import { isi } from '../core/teks.js';

/** Ranked worst-first. `block` findings should stop a release. */
export const SEVERITY = { block: 3, warn: 2, note: 1 };
const SEV_LABEL = { 3: 'Menghalangi', 2: 'Peringatan', 1: 'Catatan' };
export const severityLabel = (s) => (SEV_LABEL[s] || 'Catatan');

/* ------------------------------------------------------------ body extraction */

/**
 * Mass properties for every visible top-level body, with the feature that owns
 * it. Computed once and shared by every check that needs geometry.
 */
function bodiesOf(doc, build) {
  const out = [];
  for (const f of build.topLevel) {
    const r = build.results.get(f.id);
    if (!r || r.error || !r.instances.length) continue;
    for (let i = 0; i < r.instances.length; i++) {
      const inst = r.instances[i];
      const mp = massProperties(inst.geometry, inst.matrix);
      out.push({
        feature: f, index: i, instances: r.instances.length,
        geometry: inst.geometry, matrix: inst.matrix,
        ...mp,
      });
    }
  }
  return out;
}

/* ----------------------------------------------------------------- the checks */

/**
 * Each check receives the shared context and pushes findings. Splitting them
 * this way means a check can be read, argued with, and tested on its own.
 */
const CHECKS = [];
const check = (id, fn) => CHECKS.push({ id, fn });

/* ---- build integrity, and the repairs that go with it ---- */

check('feature-failed', (ctx, add) => {
  for (const f of ctx.doc.features) {
    const r = ctx.build.results.get(f.id);
    if (!r || !r.error) continue;
    const repair = diagnoseFailure(f, r.error, ctx);
    add({
      severity: SEVERITY.block,
      featureId: f.id,
      title: isi('{name} gagal dibangun', { name: f.name }),
      detail: r.error,
      why: repair
        ? repair.why
        : 'Fitur yang gagal tidak menyumbang geometri, jadi apa pun di hilirnya dibangun di atas lubang pada model.',
      fix: repair ? repair.fix : null,
    });
  }
});

check('param-error', (ctx, add) => {
  for (const [name, msg] of Object.entries(ctx.build.paramErrors || {})) {
    add({
      severity: SEVERITY.block,
      title: isi('Parameter “{name}” tidak dapat dihitung', { name }),
      detail: msg,
      why: 'Setiap fitur yang merujuk parameter ini jatuh ke nilai bawaannya, jadi model yang Anda lihat bukan model yang Anda jelaskan.',
    });
  }
});

check('starved-boolean', (ctx, add) => {
  for (const f of ctx.doc.features) {
    if (!['boolean'].includes(f.type)) continue;
    const live = f.inputs.filter(id => {
      const g = ctx.doc.features.find(x => x.id === id);
      return g && !g.suppressed;
    });
    if (live.length >= 2 || ctx.build.results.get(f.id)?.error) continue;
    add({
      severity: SEVERITY.warn,
      featureId: f.id,
      title: isi('{name} punya {n} input aktif', { name: f.name, n: live.length, s: live.length === 1 ? '' : '' }),
      detail: 'Boolean butuh setidaknya dua body untuk digabungkan.',
      why: 'Boolean dengan satu masukan diam-diam meneruskan body itu tanpa perubahan, yang terlihat seperti berhasil - itulah sebabnya kerusakan jenis ini sampai ke lantai bengkel.',
    });
  }
});

/* ---- geometry you cannot manufacture ---- */

check('open-shell', (ctx, add) => {
  for (const b of ctx.bodies) {
    if (b.closed) continue;
    add({
      severity: SEVERITY.block,
      featureId: b.feature.id,
      title: isi('{name} bukan solid tertutup', { name: b.feature.name }),
      detail: 'Permukaannya tidak menutup sebuah volume, jadi tidak punya massa dan tidak punya bagian dalam.',
      why: 'Slicer, CAM, dan setiap perhitungan massa butuh solid kedap. Kulit terbuka biasanya terekspor tanpa keluhan lalu gagal di mesin.',
    });
  }
});

check('tiny-feature', (ctx, add) => {
  const p = ctx.process;
  for (const b of ctx.bodies) {
    const min = Math.min(b.size.x, b.size.y, b.size.z);
    if (!(min > 0) || min >= ctx.limits.minFeature) continue;
    add({
      severity: SEVERITY.warn,
      featureId: b.feature.id,
      title: isi('{name} {min} mm pada bagian tertipis', { name: b.feature.name, min: fmt(min) }),
      detail: `${p.label} holds about ${ctx.limits.minFeature}mm.`,
      why: 'Di bawah minimum proses, fiturnya entah hilang atau datang di luar toleransi. Ini mengukur kotak batas keseluruhan body, bukan dinding minimum sebenarnya, jadi anggap sebagai ajakan memeriksa, bukan vonis.',
    });
  }
});

check('thin-wall', (ctx, add) => {
  const p = ctx.process;
  for (const f of ctx.doc.features) {
    if (ctx.build.results.get(f.id)?.error) continue;
    // Tube is the one primitive whose wall thickness is exactly known from its
    // parameters, so it gets a real answer rather than a bounding-box proxy.
    if (f.type !== 'tube') continue;
    const wall = num(ctx, f.params.ro) - num(ctx, f.params.ri);
    if (!(wall > 0) || wall >= ctx.limits.minWall) continue;
    add({
      severity: SEVERITY.warn,
      featureId: f.id,
      title: isi('{name} punya dinding {wall} mm', { name: f.name, wall: fmt(wall) }),
      detail: isi('{process} butuh setidaknya {mm}mm.', { process: p.label, mm: ctx.limits.minWall }),
      why: 'Dinding di bawah minimum proses tidak akan terisi, tidak akan mengikat antar layer, atau akan jebol saat dikerjakan mesin.',
      fix: {
        label: isi('Tebalkan dindingnya ke {mm}mm', { mm: ctx.limits.minWall }),
        apply: (store) => store.edit('Thicken wall', (d) => {
          const t = d.features.find(x => x.id === f.id);
          if (t) t.params.ri = round2(num(ctx, t.params.ro) - ctx.limits.minWall);
        }),
      },
    });
  }
});

check('envelope', (ctx, add) => {
  const p = ctx.process;
  const s = ctx.build.stats;
  if (!s.bodies) return;
  const size = new THREE.Vector3(); s.box.getSize(size);
  // Compare the part's sorted dimensions against the sorted envelope, which is
  // the same thing as asking whether it fits in any orientation.
  const part = [size.x, size.y, size.z].sort((a, b) => b - a);
  const env = [...p.envelope].sort((a, b) => b - a);
  const over = part.findIndex((v, i) => v > env[i]);
  if (over < 0) return;
  add({
    severity: SEVERITY.warn,
    title: isi('Bagian tidak muat di envelope {label}', { label: p.label }),
    detail: `${fmt(part[0])} × ${fmt(part[1])} × ${fmt(part[2])}mm against ${env.join(' × ')}mm.`,
    why: 'Harus dibelah, diorientasikan ulang ke mesin yang lebih besar, atau dibuat dengan proses lain, dan masing-masing mengubah harga dan waktu tunggu.',
  });
});

check('material-process', (ctx, add) => {
  const mats = new Set(ctx.doc.features.filter(f => !f.suppressed).map(f => f.material));
  for (const m of mats) {
    if (processSuits(ctx.processId, m)) continue;
    add({
      severity: SEVERITY.warn,
      title: isi('{mat} tidak bisa dibuat dengan {proc}', { mat: MATERIALS[m]?.name || m, proc: ctx.process.label }),
      detail: 'Material dan proses di dokumen ini tidak cocok satu sama lain.',
      why: 'Massa, biaya, dan setiap pemeriksaan keterbuatan di bawah dihitung dari pasangan ini, jadi selama keduanya tidak cocok, tidak satu pun angka itu berarti.',
    });
  }
});

check('interference', (ctx, add) => {
  const b = ctx.bodies;
  if (b.length < 2 || b.length > 60) return;
  // Bounding boxes are the broad phase only. What gets reported is the real
  // shared solid, computed by the same boolean engine the model itself uses,
  // so the number is a volume rather than a suspicion.
  // A tight budget: this runs after every rebuild, and an exact intersection is
  // a full BSP boolean. Whatever does not fit the budget is reported as not yet
  // checked, and the Clash check command runs the same test without the hurry.
  const { clashes, skipped, unchecked } = findClashes(b, { budgetMs: 90, maxPairs: 40 });
  const seen = new Set();
  for (const c of clashes) {
    const key = [c.a.feature.id, c.b.feature.id].sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);

    if (!c.exact) {
      add({
        severity: SEVERITY.note,
        featureId: c.a.feature.id,
        title: isi('{a} dan {b} belum diperiksa clash-nya', { a: c.a.feature.name, b: c.b.feature.name }),
        detail: 'Pasangan ini membawa terlalu banyak segitiga untuk diiriskan dalam anggaran boolean.',
        why: 'Kotak batasnya bertumpang tindih, yang merupakan syarat perlu untuk tabrakan tetapi bukan syarat cukup. Turunkan jumlah segmen di salah satu body dan ini menjadi jawaban sungguhan, bukan mungkin.',
      });
      continue;
    }

    add({
      severity: c.fraction > 0.02 ? SEVERITY.warn : SEVERITY.note,
      featureId: c.a.feature.id,
      title: isi('{a} dan {b} berbagi {vol} mm³', { a: c.a.feature.name, b: c.b.feature.name, vol: fmt(c.volume) }),
      detail: isi('Keduanya benar-benar beririsan, berpusat di {x}, {y}, {z}', { x: fmt(c.at.x), y: fmt(c.at.y), z: fmt(c.at.z) }) +
        (c.fraction > 0 ? isi(' - {p1}% dari body yang lebih kecil.', { p1: (c.fraction * 100).toFixed(1) }) : '.'),
      why: 'Dua solid menempati ruang yang sama berarti tabrakan rakitan atau boolean yang tidak pernah diterapkan. Ini volume irisan terukur, bukan tebakan kotak batas, jadi tumpang tindihnya nyata.',
      fix: {
        label: 'Union menjadi satu body',
        apply: (store, makeFeature) => store.edit('Union body yang tumpang tindih', (d) => {
          d.features.push(makeFeature('boolean', {
            name: 'Union', params: { op: 'union' }, inputs: [c.a.feature.id, c.b.feature.id],
          }));
        }),
      },
    });
  }
  if (skipped + unchecked > 0) {
    add({
      severity: SEVERITY.note,
      title: isi('{n} pasangan body belum diperiksa clash', { n: skipped + unchecked }),
      detail: 'Pemeriksaan berkelanjutan memberi interferensi anggaran waktu tetap supaya penyuntingan tetap responsif.',
      why: 'Kotak pasangan-pasangan ini bertumpang tindih, syarat perlu untuk tabrakan tetapi bukan syarat cukup. Analisis → Cek tabrakan menjalankan uji persisnya pada semuanya tanpa terburu-buru.',
    });
  }
});

/* ---- intent that has gone missing ---- */

check('unused-param', (ctx, add) => {
  const used = referencedParams(ctx.doc);
  for (const p of ctx.doc.params) {
    if (used.has(p.name)) continue;
    add({
      severity: SEVERITY.note,
      title: isi('Parameter “{name}” tidak menggerakkan apa pun', { name: p.name }),
      detail: isi('Didefinisikan sebagai {value}, tidak dirujuk fitur mana pun.', { value: p.value }),
      why: 'Entah ada dimensi yang seharusnya dikendalikan olehnya tetapi tidak, atau ini sisa dari revisi sebelumnya. Keduanya menyesatkan orang berikutnya yang membuka berkas ini.',
      fix: {
        label: 'Hapus parameter itu',
        apply: (store) => store.edit('Hapus parameter yang tidak dipakai', (d) => {
          d.params = d.params.filter(x => x.name !== p.name);
        }),
      },
    });
  }
});

check('hardcoded', (ctx, add) => {
  if (!ctx.doc.params.length) return;
  const loose = ctx.doc.features.filter(f => {
    if (f.suppressed || f.type === 'mesh') return false;
    const fields = catalogOf(f.type).fields.filter(x => x.kind === 'len');
    if (!fields.length) return false;
    return fields.every(x => typeof f.params[x.key] !== 'string');
  });
  // One unparameterised feature is a judgement call; a model that is almost all
  // raw numbers while carrying named parameters is a broken intent.
  if (loose.length < 2 || loose.length < ctx.doc.features.length * 0.6) return;
  add({
    severity: SEVERITY.note,
    title: isi('{n} fitur memakai angka mentah, bukan parameter', { n: loose.length }),
    detail: isi('Dokumen ini mendefinisikan {n} parameter yang diabaikan fitur-fitur ini.', { n: ctx.doc.params.length }),
    why: 'Inti pohon fitur adalah mengubah satu angka mengubah semua yang bergantung padanya. Dimensi yang diketik manual terlihat sama persis dan tidak ikut bergerak.',
  });
});

check('duplicate-name', (ctx, add) => {
  const byName = new Map();
  for (const f of ctx.doc.features) {
    if (f.suppressed) continue;
    byName.set(f.name, (byName.get(f.name) || 0) + 1);
  }
  for (const [name, n] of byName) {
    if (n < 2) continue;
    add({
      severity: SEVERITY.note,
      title: isi('{n} fitur bernama “{name}”', { n, name }),
      detail: 'Nama adalah cara bill of materials membedakan part.',
      why: 'BOM, balon gambar, dan purchase order pemasok semuanya berpatokan pada nama. Duplikat berujung pada part yang salah dipesan.',
    });
  }
});

check('mesh-opaque', (ctx, add) => {
  for (const f of ctx.doc.features) {
    if (f.type !== 'mesh' || f.suppressed) continue;
    add({
      severity: SEVERITY.note,
      featureId: f.id,
      title: isi('{name} adalah mesh impor', { name: f.name }),
      detail: 'Hanya segitiga: tanpa parameter, tanpa fitur, tidak ada yang bisa disunting selain skala.',
      why: 'Geometri impor tidak bisa mengikuti perubahan parameter, jadi dimensi apa pun yang dikendalikan darinya diam-diam berhenti mengikuti sisa model.',
    });
  }
});

check('tri-budget', (ctx, add) => {
  const t = ctx.build.stats.tris;
  if (t < TRI_BUDGET * 0.7) return;
  add({
    severity: t > TRI_BUDGET * 0.95 ? SEVERITY.warn : SEVERITY.note,
    title: isi('{t} segitiga, dari anggaran {budget}', { t: t.toLocaleString(), budget: TRI_BUDGET.toLocaleString() }),
    detail: 'Boolean di atas ukuran ini ditolak, bukan dijalankan.',
    why: 'Jumlah segmen pada primitif lengkung biasanya penyebabnya, dan menurunkannya mengorbankan akurasi jauh lebih sedikit dari dugaan Anda.',
    fix: {
      label: 'Separuhkan jumlah segmen pada fitur lengkung',
      apply: (store) => store.edit('Reduce tessellation', (d) => {
        for (const f of d.features) {
          for (const k of ['seg', 'tseg']) {
            const v = f.params[k];
            if (typeof v === 'number' && v > 16) f.params[k] = Math.max(16, Math.round(v / 2));
          }
        }
      }),
    },
  });
});

check('scale-sanity', (ctx, add) => {
  const s = ctx.build.stats;
  if (!s.bodies) return;
  const size = new THREE.Vector3(); s.box.getSize(size);
  const max = Math.max(size.x, size.y, size.z);
  if (max > 0 && max < 1) {
    add({
      severity: SEVERITY.warn,
      title: ('Seluruh model di bawah 1 mm'),
      detail: `Largest dimension ${fmt(max)}mm.`,
      why: 'Hampir selalu satuan tertukar saat impor: model yang dibuat dalam meter atau inci terbaca sebagai milimeter. Periksa sebelum dikerjakan mesin.',
    });
  } else if (max > 10000) {
    add({
      severity: SEVERITY.note,
      title: isi('Model berukuran {m} m', { m: fmt(max / 1000) }),
      detail: 'Lebih besar daripada proses mana pun di model biaya.',
      why: 'Kalau memang disengaja tidak apa-apa; kalau tidak, ini satuan tertukar yang sama ke arah sebaliknya.',
    });
  }
});

check('no-bodies', (ctx, add) => {
  if (ctx.build.stats.bodies || !ctx.doc.features.length) return;
  add({
    severity: SEVERITY.warn,
    title: ('Dokumen punya fitur tetapi tidak ada body yang terlihat'),
    detail: 'Semuanya entah di-suppress, dikonsumsi boolean, atau gagal.',
    why: 'Model kosong terekspor sebagai berkas kosong, dan itu biasanya ditemukan oleh penerimanya, bukan oleh Anda.',
  });
});

/* -------------------------------------------------- failure diagnosis */

/**
 * Turn a thrown build error into an explanation and, where the intent is
 * recoverable, a repair.
 *
 * This is the half of self-healing that matters: not guessing at what the user
 * meant, but recognising the handful of breaks whose correct repair is genuinely
 * unambiguous, and saying plainly what is being changed.
 */
function diagnoseFailure(f, message, ctx) {
  const m = String(message).toLowerCase();

  if (m.includes('butuh setidaknya dua') || m.includes('butuh masukan')) {
    const candidates = ctx.doc.features.filter(x => x.id !== f.id && !x.suppressed && !ctx.build.results.get(x.id)?.error);
    const suppressed = f.inputs.map(id => ctx.doc.features.find(x => x.id === id)).filter(x => x && x.suppressed);
    if (suppressed.length) {
      return {
        why: isi(suppressed.length === 1
          ? 'Masukannya {names} di-suppress, jadi fitur ini tidak punya apa pun untuk dikerjakan. Intent-nya utuh; masukannya hanya dimatikan.'
          : 'Masukannya {names} di-suppress, jadi fitur ini tidak punya apa pun untuk dikerjakan. Intent-nya utuh; masukannya hanya dimatikan.',
        { names: suppressed.map(x => `“${x.name}”`).join((' dan ')) }),
        fix: {
          label: `Unsuppress ${suppressed.map(x => x.name).join(', ')}`,
          apply: (store) => store.edit('Aktifkan kembali masukan yang di-suppress', (d) => {
            for (const s of suppressed) {
              const t = d.features.find(x => x.id === s.id);
              if (t) t.suppressed = false;
            }
          }),
        },
      };
    }
    if (f.inputs.length === 0 && candidates.length >= 2) {
      const pick = candidates.slice(-2).map(x => x.id);
      return {
        why: 'Masukannya hilang, kemungkinan besar karena fitur yang dirujuknya dihapus. Dua body terbaru biasanya yang dimaksud.',
        fix: {
          label: `Use ${candidates.slice(-2).map(x => x.name).join(' dan ')}`,
          apply: (store) => store.edit('Sambungkan ulang masukan boolean', (d) => {
            const t = d.features.find(x => x.id === f.id);
            if (t) t.inputs = pick;
          }),
        },
      };
    }
    return { why: 'Fitur ini kehilangan body yang digabungkannya, dan tidak ada pengganti yang jelas di dokumen. Pilih masukannya di pohon fitur.', fix: null };
  }

  if (m.includes('tanpa geometri sketsa') || m.includes('tanpa area tertutup')) {
    const closed = ctx.doc.draw.entities.filter(e => e.closed || e.type === 'rect' || e.type === 'circle' || e.type === 'polygon' || e.type === 'ellipse');
    if (closed.length) {
      return {
        why: 'Entitas gambar yang ditautkan ke fitur ini sudah hilang, tetapi workspace Draft masih menyimpan profil tertutup yang bisa dipakai sebagai gantinya.',
        fix: {
          label: isi('Tautkan ulang ke {n} profil tertutup di Draft', { n: closed.length }),
          apply: (store) => store.edit('Relink profile', (d) => {
            const t = d.features.find(x => x.id === f.id);
            if (t) t.profile = closed.map(e => e.id);
          }),
        },
      };
    }
    return { why: 'Profil yang di-extrude sudah tidak ada, dan gambarnya tidak punya area tertutup sebagai penggantinya. Gambar satu di Draft, pilih, lalu pakai “Pakai sebagai profil”.', fix: null };
  }

  if (m.includes('lebih dari 2000 salinan')) {
    return {
      why: 'Jumlah pattern dikendalikan ekspresi yang tumbuh melewati batas yang bisa dihitung mesin. Pattern-nya sendiri baik-baik saja; angka yang memberinya makan tidak.',
      fix: {
        label: 'Batasi jumlahnya ke 200',
        apply: (store) => store.edit('Batasi jumlah pattern', (d) => {
          const t = d.features.find(x => x.id === f.id);
          if (t) t.params.count = 200;
        }),
      },
    };
  }

  if (m.includes('triangle') || m.includes('budget')) {
    return {
      why: 'Boolean ditolak karena operandnya membawa lebih banyak segitiga daripada yang diproses mesin, bukan karena geometrinya salah.',
      fix: {
        label: 'Separuhkan jumlah segmen lalu bangun ulang',
        apply: (store) => store.edit('Reduce tessellation', (d) => {
          for (const x of d.features) {
            for (const k of ['seg', 'tseg']) {
              const v = x.params[k];
              if (typeof v === 'number' && v > 16) x.params[k] = Math.max(16, Math.round(v / 2));
            }
          }
        }),
      },
    };
  }

  return null;
}

/* ------------------------------------------------------------------ helpers */

function referencedParams(doc) {
  const used = new Set();
  const scan = (v) => {
    if (typeof v !== 'string') return;
    for (const m of v.matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)) used.add(m[0]);
  };
  for (const f of doc.features) {
    for (const v of Object.values(f.params)) scan(v);
    for (const v of [...f.transform.pos, ...f.transform.rot, ...f.transform.scale]) scan(v);
  }
  for (const p of doc.params) scan(p.value);
  return used;
}

function num(ctx, v) {
  if (typeof v === 'number') return v;
  const n = Number(v);
  if (Number.isFinite(n)) return n;
  const s = ctx.build.scope?.[String(v)];
  return Number.isFinite(s) ? s : 0;
}

const fmt = (v) => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2));
const round2 = (v) => Math.round(v * 100) / 100;

/* -------------------------------------------------------------- the entry point */

/**
 * Run every check against a rebuilt document.
 *
 * @param {object} doc      the live document
 * @param {object} build    the result of rebuild(doc)
 * @param {object} opts     { process: processId }
 * @returns {{ issues: object[], counts: object, worst: number, checked: number }}
 */
export function diagnose(doc, build, { process: processId = 'cnc3' } = {}) {
  const ctx = {
    doc, build,
    processId,
    process: processOf(processId),
    // House minimums win over the process defaults: a shop that knows it can
    // hold 0.6mm should not be told off for holding 0.6mm.
    limits: limits(processOf(processId)),
    bodies: bodiesOf(doc, build),
  };
  const issues = [];
  for (const c of CHECKS) {
    const add = (issue) => issues.push({ check: c.id, severity: SEVERITY.note, ...issue });
    try { c.fn(ctx, add); }
    catch (err) {
      // A broken check must never take the panel down with it.
      issues.push({
        check: c.id, severity: SEVERITY.note,
        title: isi('Pemeriksaan “{id}” tidak dapat dijalankan', { id: c.id }),
        detail: String(err.message || err),
        why: 'Ini cacat pada Doctor, bukan pada model Anda.',
      });
    }
  }
  issues.sort((a, b) => b.severity - a.severity || a.title.localeCompare(b.title));
  const counts = { block: 0, warn: 0, note: 0 };
  for (const i of issues) counts[i.severity === 3 ? 'block' : i.severity === 2 ? 'warn' : 'note']++;
  return { issues, counts, worst: issues.length ? issues[0].severity : 0, checked: CHECKS.length };
}

export const CHECK_IDS = CHECKS.map(c => c.id);
export { PROCESSES };
