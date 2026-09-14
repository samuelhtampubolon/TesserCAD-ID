/**
 * Design intent, dibaca kembali.
 *
 * Mengekspor design intent bersama sebuah mesh baru setengah janji. Setengah
 * sisanya adalah membacanya: berkas yang tidak bisa diimpor apa pun adalah
 * berkas yang tidak dipercaya siapa pun. Jadi modul ini membalik
 * `designIntent` — mengubah JSON-nya kembali menjadi dokumen parametrik yang
 * hidup — lalu memeriksa pembalikan itu dengan benar-benar melakukannya dan
 * mendiffkan hasilnya. Sebuah round trip entah berhasil pada dokumen Anda atau
 * tidak, dan itu pertanyaan yang seharusnya dijawab perangkat lunaknya, bukan
 * dokumentasinya.
 *
 * TesserCAD punya sepasang fitur lagi di sekitar ini: peta deviasi untuk mesh
 * yang datang dari pemasok, dan merge tiga arah antar cabang dokumen. Edisi ini
 * tidak membawa keduanya — lihat COMPARISON.md untuk alasannya dan untuk apa
 * yang dipakai sebagai gantinya.
 */
import { CATALOG, MATERIALS, UNITS, makeFeature, newDocument } from '../core/doc.js';
import { isi } from '../core/teks.js';

/**
 * Rebuild a document from a design-intent file.
 *
 * `designIntent` writes names rather than ids on purpose, so another program
 * can read it. That means the inverse has to resolve `consumes` by name, and
 * say so clearly when two features share a name and the reference is
 * ambiguous, rather than picking one.
 */
export function importIntent(json) {
  const notes = [];
  const errors = [];
  let data = json;
  if (typeof json === 'string') {
    try { data = JSON.parse(json); } catch (e) { return { doc: null, errors: [isi('Bukan JSON yang sah: {message}', { message: e.message })], notes }; }
  }
  if (!data || typeof data !== 'object') return { doc: null, errors: ['Bukan berkas design intent.'], notes };
  if (data.format && data.format !== 'tessercad.design-intent') {
    return { doc: null, errors: [isi('Ini berkas "{format}", bukan berkas design intent.', { format: data.format })], notes };
  }
  if (!Array.isArray(data.features)) return { doc: null, errors: ['Tidak ada daftar fitur di berkas ini.'], notes };

  const doc = newDocument(data.document?.name || 'Imported');
  doc.meta.units = UNITS[data.document?.units] ? data.document.units : 'mm';
  doc.meta.author = data.document?.author || '';
  doc.meta.notes = data.document?.notes || '';
  doc.params = (data.parameters || []).map((p, i) => ({
    id: `pi${i}`,
    name: p.name,
    value: p.expression ?? p.resolved ?? 0,
    note: p.note || '',
  }));

  // Names to ids, with duplicates flagged rather than silently collapsed.
  const counts = new Map();
  for (const f of data.features) counts.set(f.name, (counts.get(f.name) || 0) + 1);
  const idOfName = new Map();
  doc.features = data.features.map((f, i) => {
    const type = CATALOG[f.type] ? f.type : null;
    if (!type) { errors.push(isi('Fitur "{name}" bertipe "{type}" yang tidak dikenal.', { name: f.name, type: f.type })); return null; }
    const made = makeFeature(type, { name: f.name || CATALOG[type].label });
    made.id = `fi${i}`;
    made.params = { ...made.params, ...(f.parameters || {}) };
    // The exporter writes `placement` with spelled-out key names so another
    // program can read it without a schema. Accept the internal spelling too,
    // in case the file came from somewhere that copied the document instead.
    const place = f.placement || f.transform;
    if (place) {
      made.transform = {
        pos: place.position || place.pos || [0, 0, 0],
        rot: place.rotationDegXYZ || place.rotationDegrees || place.rot || [0, 0, 0],
        scale: place.scale || [1, 1, 1],
      };
    }
    made.suppressed = !!f.suppressed;
    if (MATERIALS[f.material]) {
      made.material = f.material;
      const m = MATERIALS[f.material];
      made.appearance = { ...made.appearance, color: m.color, metalness: m.metal, roughness: m.rough };
    } else if (f.material) {
      notes.push(isi('Fitur "{feature}" menyebut material "{material}", yang tidak ada di pustaka ini. Memakai baja.', { feature: f.name, material: f.material }));
    }
    if (!idOfName.has(f.name)) idOfName.set(f.name, made.id);
    return made;
  }).filter(Boolean);

  data.features.forEach((f, i) => {
    const made = doc.features.find(x => x.id === `fi${i}`);
    if (!made) return;
    made.inputs = (f.consumes || []).map(name => {
      if ((counts.get(name) || 0) > 1) {
        notes.push(isi('"{feature}" mengonsumsi "{name}", dan lebih dari satu fitur bernama itu. Yang pertama yang dipakai.', { feature: f.name, name }));
      }
      const id = idOfName.get(name);
      if (!id) errors.push(isi('"{name}" mengonsumsi "{p1}", yang tidak didefinisikan berkas ini.', { name: f.name, p1: name }));
      return id;
    }).filter(Boolean);
  });

  if (data.version && data.version > 1) {
    notes.push(isi('Berkas ini ditulis oleh format intent yang lebih baru (versi {version}); apa pun yang ditambahkannya diabaikan.', { version: data.version }));
  }
  return { doc: errors.length ? null : doc, errors, notes };
}

/**
 * Export intent, read it straight back, and report what survived.
 *
 * This is the check that keeps the interoperability claim honest. Anything the
 * format cannot carry shows up here as a difference, on the user's own
 * document, in one click.
 */
export function intentRoundTrip(intent) {
  const { doc, errors, notes } = importIntent(intent);
  if (!doc) return { ok: false, errors, notes, differences: ['Berkas intent gagal diimpor.'] };

  const differences = [];
  const src = intent;
  if ((src.document?.name || '') !== doc.meta.name) differences.push('Document name changed.');
  if ((src.parameters || []).length !== doc.params.length) differences.push('Parameter count changed.');
  (src.parameters || []).forEach((p, i) => {
    const q = doc.params[i];
    if (!q) { differences.push(isi('Parameter {name} hilang.', { name: p.name })); return; }
    if (q.name !== p.name) differences.push(`Parameter ${i}: ${p.name} menjadi ${q.name}.`);
    if (String(q.value) !== String(p.expression ?? p.resolved)) differences.push(`Parameter ${p.name}: ${p.expression} menjadi ${q.value}.`);
  });
  (src.features || []).forEach((f, i) => {
    const g = doc.features[i];
    if (!g) { differences.push(isi('Fitur {name} hilang.', { name: f.name })); return; }
    if (g.name !== f.name) differences.push(`Fitur ${i}: ${f.name} menjadi ${g.name}.`);
    if (g.type !== f.type) differences.push(`${f.name}: tipe ${f.type} menjadi ${g.type}.`);
    for (const [k, v] of Object.entries(f.parameters || {})) {
      if (String(g.params[k]) !== String(v)) differences.push(`${f.name}.${k}: ${v} menjadi ${g.params[k]}.`);
    }
    const consumes = (f.consumes || []).length;
    if (consumes !== (g.inputs || []).length) differences.push(`${f.name}: ${consumes} input menjadi ${(g.inputs || []).length}.`);
  });

  return { ok: differences.length === 0, doc, errors, notes, differences };
}
