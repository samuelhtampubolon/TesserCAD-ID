/**
 * What actually kills a large CAD file.
 *
 * The complaints are specific and they are never about the modelling: "contains
 * proxy objects from Civil 3D... very high coordinates... objects are far away
 * ... zoom extents makes objects smaller than a pixel", and crashes diagnosed
 * as "remove proxy objects", and empty groups that freeze a scene. None of
 * that is a geometry problem. It is a data-hygiene problem, and the software
 * is in a far better position to find it than the user is.
 *
 * Four things are checked here, each with a repair where the intent is
 * recoverable:
 *
 *   Far from the origin. Geometry at survey coordinates loses precision,
 *   because a float32 has about seven significant digits: at 500 km from the
 *   origin the smallest representable step is tens of millimetres, so a 0.1mm
 *   feature cannot be represented at all. This is the one that makes a model
 *   look subtly wrong in ways nobody can explain, and it is arithmetic rather
 *   than opinion, so the report gives the actual precision loss in millimetres.
 *
 *   Duplicated payloads. Two imported meshes with identical triangles are two
 *   copies of the same megabytes. Hashing them and pointing the duplicates at
 *   one copy is what game engines call deduplication, and it costs nothing.
 *
 *   Empty and degenerate features. A feature with a zero dimension, a pattern
 *   of one, a boolean with nothing to combine: each contributes no geometry and
 *   some cost, and every one of them is a thing the user meant to finish.
 *
 *   Weight. Where the document's bytes actually are, so "why is this file 40
 *   megabytes" has an answer.
 *
 * Nothing here changes the document. Every finding carries a `fix` the caller
 * applies on the user's say-so, one undo step each.
 */
import { CATALOG } from '../core/doc.js';
import { isi } from '../core/teks.js';

/**
 * A float32 step as a unit the reader can act on.
 *
 * Sub-millimetre steps read as microns because "0.000031 mm" is a number
 * nobody compares against a tolerance, and the whole point of the finding is
 * that the number should be compared against one.
 */
const stepLabel = (step) => (step < 1 ? isi('{n} µm', { n: (step * 1000).toFixed(2) }) : isi('{n} mm', { n: step.toFixed(3) }));

/** float32 keeps ~24 bits of mantissa, so this is its step at a given size. */
export function precisionAt(distanceMm) {
  const d = Math.abs(distanceMm);
  if (d < 1) return 1.2e-7;
  // The gap between consecutive floats near d.
  return Math.pow(2, Math.floor(Math.log2(d)) - 23);
}

/** Where a feature sits, as far as the document can say without rebuilding. */
function positionOf(f) {
  const p = f?.transform?.pos;
  if (!Array.isArray(p)) return [0, 0, 0];
  return [0, 1, 2].map(i => (typeof p[i] === 'number' ? p[i] : 0));
}

/** A cheap, stable hash of a mesh payload, for spotting duplicates. */
export function payloadHash(data) {
  const a = data?.positions;
  if (!a || !a.length) return null;
  // FNV-1a over a sample plus the length: a full pass over a million floats
  // costs more than it buys, and a collision needs the same length, the same
  // 512 sampled values and the same total.
  let h = 0x811c9dc5;
  const step = Math.max(1, Math.floor(a.length / 512));
  let sum = 0;
  for (let i = 0; i < a.length; i += step) {
    const v = Math.round(a[i] * 1000);
    sum += v;
    h ^= v & 0xff; h = Math.imul(h, 0x01000193);
    h ^= (v >>> 8) & 0xff; h = Math.imul(h, 0x01000193);
  }
  return `${a.length}:${(h >>> 0).toString(36)}:${sum}`;
}

/** Roughly how many bytes a feature contributes to the saved file. */
export function weightOf(f) {
  if (!f) return 0;
  let bytes = 200;                                  // the record itself
  if (f.data?.positions) bytes += f.data.positions.length * 9;   // JSON floats
  if (f.data?.normals) bytes += f.data.normals.length * 9;
  if (f.profile?.length) bytes += f.profile.length * 12;
  return bytes;
}

const SEVERITY = { block: 3, warn: 2, note: 1 };

/**
 * The centre of the built geometry, when there is a build to ask.
 *
 * This is a better reference than the feature transforms for the reason that
 * makes a real document awkward: a position may be an expression, and a
 * transform alone cannot say where `plate_w / 2 - inset` puts something. The
 * build has already resolved every expression, so its bounding box is where
 * the geometry actually is.
 */
function boxCentre(build) {
  const b = build?.stats?.box;
  if (!b || b.isEmpty?.() || !b.min || !b.max) return null;
  const c = [0, 1, 2].map(i => ((['x', 'y', 'z'].map(k => b.min[k])[i]) + (['x', 'y', 'z'].map(k => b.max[k])[i])) / 2);
  return c.every(Number.isFinite) ? c : null;
}

/**
 * Inspect a document for the problems that make big files unusable.
 *
 * @param {object} doc
 * @param {object|null} build  optional; a build lets the far-origin check use
 *        real geometry bounds rather than feature transforms alone
 * @returns {{issues: object[], weight: object, clean: boolean}}
 */
export function inspect(doc, build = null) {
  const issues = [];
  const add = (i) => issues.push(i);

  /* ------------------------------------------------------- far from origin */

  let worst = 0, worstName = null;
  for (const f of doc.features || []) {
    if (!f) continue;
    const p = positionOf(f);
    const d = Math.hypot(p[0], p[1], p[2]);
    if (d > worst) { worst = d; worstName = f.name; }
  }
  if (build?.stats?.box && !build.stats.box.isEmpty?.()) {
    const b = build.stats.box;
    for (const v of [b.min, b.max]) {
      const d = Math.hypot(v.x, v.y, v.z);
      if (d > worst) { worst = d; worstName = worstName || 'modelnya'; }
    }
  }

  // A float32 step of a micron is the point at which normal CAD tolerances
  // start to be unrepresentable, and that happens around 8 metres.
  const step = precisionAt(worst);
  if (worst > 100000) {
    add({
      id: 'far-origin', severity: 'block', title: 'Geometri berada di koordinat survei',
      detail: isi('Titik terjauh berjarak {metres} m dari origin. Float 32-bit menyimpan sekitar tujuh angka penting, jadi jarak terkecil yang bisa diwakili di sana adalah {step}. Fitur yang lebih kecil dari itu tidak bisa diposisikan dengan akurat, dan gejalanya adalah model yang terlihat sedikit salah tanpa penjelasan apa pun di pohon fitur.', { metres: (worst / 1000).toFixed(1), step: stepLabel(step) }),
      why: 'Ini aritmetika, bukan selera. Memindahkan desain ke origin dan menyimpan koordinat dunia nyata sebagai catatan adalah yang dilakukan setiap paket yang bertahan di proyek besar.',
      fix: recentreFix(doc, boxCentre(build)),
    });
  } else if (worst > 8000) {
    add({
      id: 'far-origin', severity: 'warn', title: isi('Geometri berjarak {metres} m dari origin', { metres: (worst / 1000).toFixed(1) }),
      detail: isi('Langkah terkecil yang bisa diwakili di sana adalah {step}. Itu masih memadai untuk pekerjaan milimeter dan tidak memadai untuk mikron.', { step: stepLabel(step) }),
      why: isi('{name} paling jauh ke luar. Memusatkan desain tidak berbiaya apa pun dan mengembalikan presisi.', { name: worstName || ('Sebuah fitur') }),
      fix: recentreFix(doc, boxCentre(build)),
    });
  }

  /* --------------------------------------------------- duplicate payloads */

  const byHash = new Map();
  for (const f of doc.features || []) {
    const h = payloadHash(f?.data);
    if (!h) continue;
    if (!byHash.has(h)) byHash.set(h, []);
    byHash.get(h).push(f);
  }
  for (const [h, group] of byHash) {
    if (group.length < 2) continue;
    const bytes = group.slice(1).reduce((n, f) => n + weightOf(f), 0);
    add({
      id: `dup-${h}`, severity: 'warn',
      title: isi('{n} salinan mesh yang sama', { n: group.length }),
      detail: isi('{names} menyimpan segitiga yang identik. Itu {kb} kB dari berkas yang mengatakan hal sama lebih dari sekali.', { names: group.map(f => f.name).join(', '), kb: (bytes / 1024).toFixed(0) }),
      why: 'Mengarahkan duplikatnya ke satu salinan membiarkan setiap body tepat di tempatnya: geometrinya dipakai bersama, transformnya tetap terpisah. Inilah yang disebut deduplikasi di mesin game.',
      fix: dedupFix(group),
    });
  }

  /* ------------------------------------------- empty and degenerate features */

  for (const f of doc.features || []) {
    const cat = CATALOG[f?.type];
    if (!cat) continue;
    const zero = [];
    for (const [k, v] of Object.entries(f.params || {})) {
      if (typeof v !== 'number') continue;              // an expression may resolve fine
      const field = (cat.fields || []).find(x => x.key === k);
      if (!field || field.kind !== 'len') continue;
      if (v === 0) zero.push(k);
    }
    if (zero.length) {
      add({
        id: `zero-${f.id}`, severity: 'warn', title: isi('{name} punya dimensi nol', { name: f.name }),
        detail: isi('{fields} bernilai nol, jadi fitur ini tidak menghasilkan geometri tetapi tetap memakan satu rebuild.', { fields: zero.join((' dan ')) }),
        why: 'Entah ditinggalkan belum selesai atau dikendalikan parameter yang bernilai nol. Keduanya layak diketahui sebelum pelanggan melihat berkasnya.',
        fix: null,
      });
    }
    if ((f.type === 'patternLinear' || f.type === 'patternCircular') && Math.round(f.params?.count ?? 0) <= 1) {
      add({
        id: `pat1-${f.id}`, severity: 'note', title: isi('{name} adalah pattern berisi satu', { name: f.name }),
        detail: 'Pattern dengan jumlah satu adalah salinan masukannya, tidak lebih.',
        why: 'Tidak berbahaya, tetapi menyembunyikan kenyataan bahwa jumlahnya tidak pernah diatur, dan pembaca pohon fitur tidak bisa melihatnya.',
        fix: null,
      });
    }
    if (f.type === 'boolean' && (f.inputs?.length ?? 0) < 2) {
      add({
        id: `bool-${f.id}`, severity: 'warn', title: isi('{name} tidak punya apa pun untuk digabungkan', { name: f.name }),
        detail: isi('Boolean butuh dua body dan punya {n}.', { n: f.inputs?.length ?? 0 }),
        why: 'Biasanya masukannya yang lain dihapus. Design Doctor bisa menyambungnya kembali; sampai itu terjadi ia tidak menghasilkan apa pun.',
        fix: null,
      });
    }
  }

  /* --------------------------------------------------------------- weight */

  const rows = (doc.features || []).filter(Boolean).map(f => ({ name: f.name, type: f.type, bytes: weightOf(f) }))
    .sort((a, b) => b.bytes - a.bytes);
  const total = rows.reduce((n, r) => n + r.bytes, 0);
  const meshBytes = (doc.features || []).filter(f => f?.data?.positions).reduce((n, f) => n + weightOf(f), 0);
  const weight = {
    totalBytes: total,
    meshBytes,
    meshShare: total ? meshBytes / total : 0,
    features: (doc.features || []).length,
    heaviest: rows.slice(0, 8),
    params: (doc.params || []).length,
    drawEntities: doc.draw?.entities?.length || 0,
  };

  if (meshBytes > 4e6) {
    add({
      id: 'heavy-mesh', severity: 'note', title: 'Sebagian besar berkas ini adalah mesh impor',
      detail: isi('{mb} MB segitiga, {percent}% dari dokumen.', { mb: (meshBytes / 1e6).toFixed(1), percent: (weight.meshShare * 100).toFixed(0) }),
      why: 'Segitiga impor tidak bisa diparameterkan dan tidak terkompresi di JSON. Kalau sebuah mesh hanya untuk rujukan, menghapusnya setelah fitur parametrik terbangun menjaga berkas tetap kecil.',
      fix: null,
    });
  }

  issues.sort((a, b) => SEVERITY[b.severity] - SEVERITY[a.severity]);
  return { issues, weight, clean: issues.length === 0 };
}

/* ------------------------------------------------------------------ fixes */

/**
 * Move the whole design to the origin, keeping the offset in the notes.
 *
 * Only features with no inputs are moved, and all of them by the same vector.
 * That is exactly the right set, for two reasons that pull in opposite
 * directions until you look at what a transform means.
 *
 * A leaf primitive's position is absolute, so moving it moves the geometry.
 * A derived feature's position is an offset applied on top of whatever its
 * inputs produced, so moving it as well would move the result twice. Leaves
 * carry the coordinates; everything downstream follows them for free.
 *
 * And the leaves are the set that has to move: moving only the top-level
 * bodies would leave a boolean's inputs out at survey coordinates, so the
 * boolean would still be *computed* there, in floats whose step is tens of
 * microns, and the precision problem this repair exists to fix would survive
 * it. The result would merely appear near the origin afterwards.
 *
 * The reference point is the centre of the leaves' bounding box rather than
 * their mean, so one distant fixing hole does not drag the whole design off
 * centre. A position written as an expression is left alone and reported,
 * because rewriting somebody's formula is not this function's business.
 */
function recentreFix(doc, reference = null) {
  return {
    label: 'Pindahkan desain ke origin',
    apply: (store) => {
      store.edit('Pindahkan desain ke origin', (d) => {
        const leaves = (d.features || []).filter(f => f && !(f.inputs?.length));
        if (!leaves.length) return;

        let off;
        if (reference) {
          off = reference.map(v => Math.round(v * 1000) / 1000);
        } else {
          // No build to ask, so fall back to the centre of the leaves'
          // bounding box, rounded to a micron.
          const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
          for (const f of leaves) {
            const p = positionOf(f);
            for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p[i]); hi[i] = Math.max(hi[i], p[i]); }
          }
          off = [0, 1, 2].map(i => Math.round(((lo[i] + hi[i]) / 2) * 1000) / 1000);
        }
        if (!off.some(v => Math.abs(v) > 1e-6)) return;

        let skipped = 0;
        for (const f of leaves) {
          const p = f.transform?.pos;
          if (!Array.isArray(p)) continue;
          for (let i = 0; i < 3; i++) {
            if (typeof p[i] === 'number') p[i] = Math.round((p[i] - off[i]) * 1000) / 1000;
            else skipped++;
          }
        }
        const note = isi('Origin desain bergeser dari koordinat aslinya: {p1} mm.', { p1: off.join(', ') }) +
          (skipped ? isi(' {skipped} koordinat dibiarkan karena berupa ekspresi.', { skipped }) : '');
        d.meta.notes = d.meta.notes ? `${d.meta.notes}\n${note}` : note;
      });
    },
  };
}

/**
 * Point duplicate payloads at one shared copy.
 *
 * Every body keeps its own transform, so nothing moves; only the triangles are
 * shared. The document stays plain JSON, so the share is by reference within
 * the in-memory document and by a single copy on save.
 */
function dedupFix(group) {
  return {
    label: isi('Pakai satu salinan bersama untuk {count} body', { count: group.length }),
    apply: (store) => {
      store.edit('Pakai bersama mesh duplikat', (d) => {
        const ids = new Set(group.map(f => f.id));
        const features = d.features.filter(f => ids.has(f.id));
        if (features.length < 2) return;
        const keep = features[0].data;
        for (let i = 1; i < features.length; i++) features[i].data = keep;
      });
    },
  };
}

/** One line for the status bar or a report. */
export function summary(result) {
  const { issues, weight } = result;
  if (!issues.length) return `Clean. ${weight.features} features, ${(weight.totalBytes / 1024).toFixed(0)} kB.`;
  const blocks = issues.filter(i => i.severity === 'block').length;
  const warns = issues.filter(i => i.severity === 'warn').length;
  return [
    blocks ? `${blocks} serious` : '',
    warns ? `${warns} worth fixing` : '',
    `${(weight.totalBytes / 1024).toFixed(0)} kB`,
  ].filter(Boolean).join(', ');
}
