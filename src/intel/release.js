/**
 * Release: the deliverable, not the model.
 *
 * A finished model is an intermediate artifact. What actually ships is a folder
 * of things: geometry for the machine, a drawing for the shop, a bill of
 * materials for purchasing, a picture for the email, a cost basis for the
 * decision, and a record of what was checked before any of it went out. Today
 * that folder is assembled by hand, one export dialog at a time, and the step
 * everybody skips is the checking.
 *
 * `releasePackage` does the whole thing in one command, and puts the checks
 * first: the Doctor runs before anything is written, and a blocking finding
 * stops the release rather than being buried in a README nobody opens. Shipping
 * is the moment the cost of an error is highest, so it is the moment to be
 * least convenient about it.
 *
 * The package also carries design-intent.json, which is this project's answer to
 * the thing that gets lost in every CAD handoff. An STL is geometry with the
 * reasoning stripped out: it cannot tell you that this radius is `bolt_r` and
 * that three other dimensions follow it. The sidecar keeps the parameters, the
 * feature tree, the relationships and the material alongside the mesh, in plain
 * JSON that anything can read. It is not STEP and does not pretend to be; it is
 * the intent that STL and OBJ throw away, written down next to them.
 */
import * as THREE from 'three';
import { STLExporter } from 'three/addons/STLExporter.js';
import { OBJExporter } from 'three/addons/OBJExporter.js';
import { store, MATERIALS, APP_NAME, APP_VERSION, FILE_EXT, UNITS } from '../core/doc.js';
import { massProperties } from '../core/rebuild.js';
import { toDXF, toSVG } from '../draft/dxf.js';
import { exportGroup, disposeRoot, safeName, download } from '../io/io.js';
import { diagnose, severityLabel } from './doctor.js';
import { partsFrom, costDocument, compare, crossovers, levers } from './cost.js';
import { PROCESSES, processOf } from './process.js';
import { standards, limits } from './standards.js';
import { zip } from './zip.js';
import { QUALITY, cleanMesh } from './tessellate.js';
import { isi } from '../core/teks.js';

/* ------------------------------------------------------- design intent */

/**
 * Everything about the model that a triangle mesh cannot carry.
 *
 * Written to be read by a person or by another program with no knowledge of
 * this application: no ids where a name will do, units stated explicitly,
 * relationships spelled out rather than implied by array order.
 */
export function designIntent(doc, build) {
  const byId = new Map(doc.features.map(f => [f.id, f]));
  const nameOf = (id) => byId.get(id)?.name || null;

  return {
    format: 'tessercad.design-intent',
    version: 1,
    generator: `${APP_NAME} ${APP_VERSION}`,
    exported: new Date().toISOString(),
    note: 'Intent parametrik di balik berkas mesh yang menyertainya. Format mesh seperti STL dan OBJ hanya membawa geometri; ini membawa parameter, riwayat fitur, dan relasi yang menghasilkannya.',
    document: {
      name: doc.meta.name,
      units: doc.meta.units,
      unitDefinition: isi('1 mm = {p1} {units}. Setiap panjang di berkas ini dalam milimeter, itulah yang disimpan mesinnya; satuan di atas hanya cara menampilkannya.', { p1: UNITS[doc.meta.units]?.perMm ?? 1, units: doc.meta.units }),
      author: doc.meta.author || null,
      notes: doc.meta.notes || null,
      created: doc.meta.created,
      modified: doc.meta.modified,
    },
    parameters: doc.params.map(p => ({
      name: p.name,
      expression: p.value,
      resolved: build.scope?.[p.name] ?? null,
      note: p.note || null,
    })),
    features: doc.features.map(f => ({
      name: f.name,
      type: f.type,
      suppressed: !!f.suppressed,
      material: f.material,
      materialDensityKgPerMm3: (MATERIALS[f.material] || MATERIALS.steel).density,
      consumes: f.inputs.map(nameOf).filter(Boolean),
      parameters: f.params,
      placement: { position: f.transform.pos, rotationDegXYZ: f.transform.rot, scale: f.transform.scale },
      drivenBy: driversOf(f),
      profileEntities: f.profile ? f.profile.length : null,
      buildError: build.results.get(f.id)?.error || null,
    })),
    bodies: build.topLevel.map(f => ({
      name: f.name,
      instances: build.results.get(f.id)?.instances.length || 0,
      material: f.material,
    })),
    measured: {
      volumeMm3: build.stats.volume,
      surfaceAreaMm2: build.stats.area,
      massKg: build.stats.mass,
      triangles: build.stats.tris,
      boundingBoxMm: build.stats.box.isEmpty() ? null : {
        min: build.stats.box.min.toArray(),
        max: build.stats.box.max.toArray(),
      },
      centroidMm: build.stats.centroid.toArray(),
    },
  };
}

/** Which named parameters a feature's fields actually reference. */
function driversOf(f) {
  const found = new Set();
  const scan = (v) => {
    if (typeof v !== 'string') return;
    for (const m of v.matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)) found.add(m[0]);
  };
  for (const v of Object.values(f.params)) scan(v);
  for (const v of [...f.transform.pos, ...f.transform.rot, ...f.transform.scale]) scan(v);
  return [...found];
}

/* --------------------------------------------------------------- writers */

function bomCSV(doc, build) {
  const rows = [['No.', 'Part', 'Jenis', 'Material', 'Qty', 'Volume mm^3', 'Massa kg', 'Kotak batas mm']];
  let i = 1;
  for (const f of build.topLevel) {
    const r = build.results.get(f.id);
    if (!r || r.error || !r.instances.length) continue;
    const mp = massProperties(r.instances[0].geometry, r.instances[0].matrix);
    const dens = (MATERIALS[f.material] || MATERIALS.steel).density;
    rows.push([
      i++, f.name, f.type, MATERIALS[f.material]?.name || f.material, r.instances.length,
      mp.volume.toFixed(2), (mp.volume * dens).toFixed(5),
      `${mp.size.x.toFixed(1)} x ${mp.size.y.toFixed(1)} x ${mp.size.z.toFixed(1)}`,
    ]);
  }
  return csv(rows);
}

function checksCSV(report) {
  const rows = [['Tingkat', 'Pemeriksaan', 'Temuan', 'Rincian']];
  for (const i of report.issues) rows.push([severityLabel(i.severity), i.check, i.title, i.detail || '']);
  return csv(rows);
}

function costCSV(parts, batch, rates) {
  const rows = [['Part', 'Material', 'Proses', 'Per unit', 'Material', 'Mesin', 'Setup/part', 'Tooling/part', 'Jam mesin']];
  for (const part of parts) {
    const c = compare(part, { batch, rates }).best;
    if (!c) continue;
    rows.push([
      part.name, part.material, c.label,
      c.each.toFixed(2), c.material.toFixed(2), c.machine.toFixed(2),
      c.setup.toFixed(2), c.tooling.toFixed(2), c.hours.toFixed(2),
    ]);
  }
  return csv(rows);
}

const csv = (rows) => rows
  .map(r => r.map(c => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(','))
  .join('\n');

function readme(doc, build, report, estimate, cross, opts) {
  const s = standards();
  const p = processOf(opts.process);
  const lim = limits(p);
  const u = doc.meta.units;
  const L = [];

  L.push(`# ${doc.meta.name}`, '');
  L.push(isi('Paket rilis dihasilkan oleh {APP_NAME} {APP_VERSION} pada {p1}.', { APP_NAME, APP_VERSION, p1: new Date().toISOString().slice(0, 10) }), '');
  if (doc.meta.author) L.push(`Author: ${doc.meta.author}`, '');
  if (doc.meta.notes) L.push(doc.meta.notes, '');

  L.push('## Isi paket ini', '');
  L.push('| Berkas | Untuk apa |');
  L.push('|---|---|');
  L.push('| `model.stl` | Mesh kedap untuk cetak atau CAM. STL biner, milimeter. |');
  L.push('| `model.obj` | Geometri yang sama dengan nama per body, untuk apa pun yang membaca OBJ. |');
  L.push('| `design-intent.json` | Parameter, riwayat fitur, dan relasi di balik mesh. Baca ini sebelum menyunting apa pun. |');
  L.push(isi('| `{p1}` | Dokumen sumber yang bisa disunting. |', { p1: safeName(doc.meta.name, FILE_EXT) }));
  if (doc.draw.entities.length) {
    L.push('| `drawing.dxf` | 2D drawing, AutoCAD R12 DXF. |');
    L.push('| `drawing.svg` | Gambar yang sama untuk dilihat tanpa CAD. |');
  }
  L.push('| `bom.csv` | Bill of materials dengan jumlah, material, dan massa. |');
  L.push('| `cost-estimate.csv` | Perkiraan biaya per part menurut proses. |');
  L.push('| `checks.csv` | Setiap pemeriksaan yang berjalan, dan apa yang ditemukannya. |');
  L.push('| `preview.png` | Tampilan viewport saat dirilis. |');
  L.push('');

  L.push('## Pemeriksaan', '');
  if (!report.issues.length) {
    L.push(isi('Semua {checked} pemeriksaan lolos.', { checked: report.checked }), '');
  } else {
    L.push(`${report.checked} checks ran: ${report.counts.block} blocking, ${report.counts.warn} warnings, ${report.counts.note} notes.`, '');
    for (const i of report.issues.slice(0, 25)) {
      L.push(`- **${severityLabel(i.severity)} · ${i.title}**  `);
      if (i.detail) L.push(`  ${i.detail}  `);
      if (i.why) L.push(`  _${i.why}_`);
    }
    if (report.issues.length > 25) L.push(isi('- …dan {p1} lagi di `checks.csv`.', { p1: report.issues.length - 25 }));
    L.push('');
  }

  L.push('## Manufacturing basis', '');
  L.push(`- Process assumed: **${p.label}**`);
  L.push(isi('- Dinding minimum: {minWall}{u}, fitur minimum: {minFeature}{p1}, toleransi ±{tolerance}{p2}', { minWall: lim.minWall, u, minFeature: lim.minFeature, p1: u, tolerance: lim.tolerance, p2: u }));
  L.push(`- Ukuran batch: ${opts.batch}`);
  L.push(`- ${p.note}`);
  L.push('');

  if (estimate.rows.length) {
    L.push('## Indicative cost', '');
    L.push(isi('**{p1}{p2} per unit pada batch {batch}**, total {p3}.', { p1: estimate.each.toFixed(2), p2: s.currency ? ' ' + s.currency : '', batch: estimate.batch, p3: estimate.total.toFixed(2) }), '');
    L.push('| Part | Proses termurah | Satuan | Pendorong biaya terbesar |');
    L.push('|---|---|---|---|');
    for (const r of estimate.rows) {
      L.push(`| ${r.part.name} | ${r.cost.label} | ${r.cost.each.toFixed(2)} | ${r.cost.drivers[0]?.label || '—'} |`);
    }
    L.push('');
    if (cross?.changes.length) {
      L.push('Proses termurah berubah menurut jumlah:', '');
      for (const c of cross.changes) {
        L.push(isi('- Antara {qty} dan {p1} unit, **{label}** menyalip {p2}.', { qty: c.from.qty, p1: c.to.qty, label: c.to.label, p2: c.from.label }));
      }
      L.push('');
    }
    L.push('> Ini angka orde-besar dari model tarif umum, bukan penawaran harga. Gunanya menunjukkan proses mana yang menang dan dimensi mana yang mendorong harga; angka mutlaknya tidak akan cocok dengan pemasok Anda.', '');
  }

  if (opts.mesh) {
    const q = QUALITY[opts.mesh.quality] || QUALITY.standard;
    L.push('## Mesh', '');
    L.push(isi('- Kualitas: **{label}**{tol}', { label: q.label, tol: q.tol ? isi(', toleransi chord {mm} mm', { mm: q.tol }) : '' }));
    if (q.tol) L.push(isi('- Tidak ada titik pada `model.stl` yang berjarak lebih dari {tol} mm dari permukaan yang diwakilinya.', { tol: q.tol }));
    L.push(isi('- {p1} segitiga setelah penyatuan, dari {p2}{p3}.', { p1: opts.mesh.after.toLocaleString(), p2: opts.mesh.before.toLocaleString(), p3: opts.mesh.dropped ? ` (${opts.mesh.dropped} degenerate dibuang)` : '' }));
    L.push('');
    L.push('Mesh tanpa toleransinya adalah angka tanpa satuan — itulah sebabnya toleransi dinyatakan di sini, bukan dibiarkan ditebak.', '');
  }

  L.push('## Measured', '');
  L.push(`- Body: ${build.stats.bodies}`);
  L.push(`- Volume: ${build.stats.volume.toFixed(2)} mm³`);
  L.push(`- Massa: ${build.stats.mass.toFixed(4)} kg`);
  L.push(`- Segitiga: ${build.stats.tris.toLocaleString()}`);
  L.push('');
  L.push(('Massa dihitung dari mesh dan densitas material yang ditetapkan, jadi tepat untuk geometri yang ditampilkan dan sebaik pilihan materialnya saja.'), '');

  return L.join('\n');
}

/* ---------------------------------------------------------------- the command */

/**
 * Assemble and download the release package.
 *
 * @param {object} app  the application controller (for the viewport and build)
 * @param {object} opts { process, batch, force }
 * @returns {{ ok: boolean, blocked?: object[], files?: string[], name?: string }}
 */
export function releasePackage(app, { process: processId = null, batch = null, force = false } = {}) {
  const doc = store.doc;
  const build = app.build;
  if (!build) return { ok: false, reason: 'Modelnya belum dibangun.' };

  const s = standards();
  const proc = processId || doc.studio?.process || s.process;
  const qty = batch || doc.studio?.batch || s.batch;

  // Checks first. A release is exactly the wrong moment to be lenient.
  const report = diagnose(doc, build, { process: proc });
  const blocking = report.issues.filter(i => i.severity === 3);
  if (blocking.length && !force) return { ok: false, blocked: blocking, report };

  const parts = partsFrom(doc, build, massProperties);
  const estimate = costDocument(parts, { batch: qty, rates: { ...s.rates, materialPrice: s.materialPrice } });
  const cross = parts.length === 1 ? crossovers(parts[0], { rates: { ...s.rates, materialPrice: s.materialPrice } }) : null;

  const files = [];
  const add = (name, data) => { if (data != null) files.push({ name, data }); };

  // Weld and drop degenerates before writing. Boolean output carries a
  // duplicated vertex at every split and slivers of near-zero area, and both
  // are pure file size to whoever receives the package.
  const root = exportGroup(app.vp);
  let meshStats = null;
  if (root.children.length) {
    let before = 0, after = 0, dropped = 0;
    for (const child of root.children) {
      if (!child.isMesh) continue;
      const { geometry, stats } = cleanMesh(child.geometry);
      child.geometry.dispose();
      child.geometry = geometry;
      before += stats.trianglesBefore; after += stats.trianglesAfter; dropped += stats.dropped;
    }
    meshStats = { before, after, dropped, quality: s.exportQuality || 'standard' };
    add('model.stl', new Uint8Array(new STLExporter().parse(root, { binary: true })));
    add('model.obj', `# ${APP_NAME} ${APP_VERSION}\n${new OBJExporter().parse(root)}`);
  }
  disposeRoot(root);

  add('design-intent.json', JSON.stringify(designIntent(doc, build), null, 2));
  add(safeName(doc.meta.name, FILE_EXT), JSON.stringify({ ...doc, app: APP_NAME, appVersion: APP_VERSION }, null, 1));

  if (doc.draw.entities.length) {
    add('drawing.dxf', toDXF(doc.draw, { units: doc.meta.units }));
    add('drawing.svg', toSVG(doc.draw, { units: doc.meta.units }));
  }

  add('bom.csv', bomCSV(doc, build));
  add('checks.csv', checksCSV(report));
  if (parts.length) add('cost-estimate.csv', costCSV(parts, qty, { ...s.rates, materialPrice: s.materialPrice }));
  add('README.md', readme(doc, build, report, estimate, cross, { process: proc, batch: qty, mesh: meshStats }));

  const png = app.vp.snapshot(2);
  if (png) add('preview.png', dataURLToBytes(png));

  const name = safeName(`${doc.meta.name}-release`, '.zip');
  download(name, zip(files), 'application/zip');
  return { ok: true, name, files: files.map(f => f.name), report, estimate };
}

function dataURLToBytes(url) {
  const i = url.indexOf(',');
  if (i < 0) return null;
  const bin = atob(url.slice(i + 1));
  const out = new Uint8Array(bin.length);
  for (let k = 0; k < bin.length; k++) out[k] = bin.charCodeAt(k);
  return out;
}

/** The intent sidecar on its own, for handing to another CAD package. */
export function exportIntent(doc, build) {
  download(safeName(`${doc.meta.name}-intent`, '.json'), JSON.stringify(designIntent(doc, build), null, 2), 'application/json');
}

export { PROCESSES, THREE };
