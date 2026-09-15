/**
 * AI Chat ke 3D: a conversation that leaves a parametric model behind.
 *
 * What this is, said plainly before anything else. There is no language model
 * here and no server to send your drawing to. This is a planner: it reads
 * Indonesian, matches it against a vocabulary of shapes, assemblies, sizes and
 * edits, and emits the same catalogue features the mouse emits. Everything
 * runs in the tab, offline, and nothing about your part leaves the machine.
 * That is a design decision, not a limitation to apologise for — a studio you
 * can run with the network cable out is worth more than one that needs a
 * subscription to think.
 *
 * What makes it a chat rather than a command line is the part that matters:
 *
 *   It holds a subject.      "buatkan braket L" then "tebalnya 12" then
 *                            "kasih 4 lubang M10" is three turns about one
 *                            part, and the second two would be meaningless
 *                            on their own.
 *   It plans, then asks.     Every turn returns a program that has not been
 *                            applied yet, with the features it would add and
 *                            the assumptions it made. The user says ya.
 *   It says what it cost.    Each turn reports what the same result would have
 *                            taken with the mouse, by the model in klik.js.
 *                            A big assembly is several hundred clicks; that
 *                            number is the whole point of the feature.
 *   It refuses clearly.      Outside the vocabulary it says so and lists what
 *                            it does know. A co-pilot that quietly builds the
 *                            wrong thing is more expensive than one that
 *                            admits it did not follow.
 *
 * Three layers feed it, in order of how much they save: `resep.js` for whole
 * assemblies, `intel/speak.js` for a single shape, and the edit grammar below
 * for changing what is already there. A turn tries them in that order and
 * takes the first that fits.
 *
 * DOM-free on purpose, like every module below `ui`: the dialog in main.js
 * renders what `respond()` returns, and the suite in tools/tests/chat3d.mjs
 * drives the same function with no browser at all.
 */
import { CATALOG, MATERIALS } from '../core/doc.js';
import { interpret as speakInterpret, EXAMPLES as SPEAK_EXAMPLES } from '../intel/speak.js';
import { RESEP, RESEP_IDS, cocok, bawaan, bangun } from './resep.js';
import { klikProgram, klikKalimat } from './klik.js';
import { ukuran, dimensi, tanpaDimensi, nilai, jumlah, pasangan, baut, pecah, ada, pertama, angkaKata } from './lex.js';

/* ------------------------------------------------------------- vocabulary */

const YA = ['ya', 'iya', 'oke', 'ok', 'sip', 'lanjut', 'terapkan', 'bangun', 'gas', 'setuju', 'boleh', 'yes', 'apply'];
const TIDAK = ['tidak', 'jangan', 'batal', 'batalkan', 'stop', 'gak', 'nggak', 'no', 'cancel'];
const HAPUS = ['hapus', 'buang', 'bersihkan', 'reset', 'mulai ulang', 'kosongkan'];
const TANYA_MASSA = ['massa', 'berat', 'bobot', 'mass', 'weight'];
const TANYA_VOLUME = ['volume', 'isi', 'kubikasi'];
const TANYA_BIAYA = ['biaya', 'harga', 'ongkos', 'cost', 'rupiah'];
const TANYA_UKURAN = ['ukuran', 'dimensi', 'kotak batas', 'bounding'];
const TANYA_JUMLAH = ['berapa body', 'berapa fitur', 'jumlah body', 'jumlah fitur'];
const BANTUAN = ['bantuan', 'bantu', 'help', 'apa saja', 'bisa apa', 'contoh', 'daftar'];

/** Material words to catalogue keys. Same spellings the grammar accepts. */
const MATERIAL = {
  baja: 'steel', besi: 'steel', steel: 'steel',
  aluminium: 'aluminium', alumunium: 'aluminium', aluminum: 'aluminium',
  stainless: 'stainless', antikarat: 'stainless', 'anti karat': 'stainless',
  kuningan: 'brass', brass: 'brass',
  tembaga: 'copper', copper: 'copper',
  titanium: 'titanium',
  abs: 'abs', pla: 'pla', nilon: 'nylon', nylon: 'nylon',
  akrilik: 'acrylic', acrylic: 'acrylic',
  kayu: 'wood', wood: 'wood',
  beton: 'concrete', concrete: 'concrete',
  kaca: 'glass', glass: 'glass',
  karet: 'rubber', rubber: 'rubber',
};

/** Edit verbs, and what they change. */
const UBAH_TEBAL = ['tebal', 'tebalnya', 'ketebalan', 'thickness'];
const UBAH_LEBAR = ['lebar', 'lebarnya', 'width'];
const UBAH_PANJANG = ['panjang', 'panjangnya', 'length'];
const UBAH_TINGGI = ['tinggi', 'tingginya', 'height'];

/* ------------------------------------------------------------- the session */

/**
 * A conversation's memory.
 *
 * Small on purpose: the subject being discussed, the recipe and values behind
 * it so a follow-up can rebuild rather than patch, the program waiting for a
 * yes, and the running click total. Nothing here is persisted — a chat is a
 * working session, and the document is the artefact.
 */
export function sesiBaru() {
  return {
    turns: [],
    resep: null,
    values: {},
    program: null,      // planned, not yet applied
    subjek: null,       // the id of the feature the last turn produced
    klikTotal: 0,
    dibangun: 0,
  };
}

/** The opening message, which doubles as the help text. */
export function sapaan() {
  return [
    'Katakan apa yang mau dibuat, dalam Bahasa Indonesia. Saya rencanakan dulu, Anda yang menyetujui.',
    `Rakitan yang saya tahu: ${RESEP_IDS.map(id => RESEP[id].nama.toLowerCase()).join(', ')}.`,
    'Bentuk tunggal juga bisa: "silinder Ø40 tinggi 100", "6 lubang M8 jarak 30".',
    'Semua berjalan di peramban ini. Tidak ada yang dikirim ke mana pun.',
  ];
}

/** Worked examples for the dialog's help panel and for the suite. */
export const CONTOH = [
  'buatkan kotak panel 400 x 300 x 150 tebal 3 dengan 6 lubang gland 20',
  'pelat baut 250 kali 150 tebal 12, baut M12, 8 lubang',
  'braket L sayap 150 dan 100, lebar 90, tebal 10, baut M10',
  'flens pipa diameter dalam 150 tebal dinding 8, baut M16 delapan buah',
  'rangka rak 1200 x 600 x 900 hollow 40 tebal 2, dua palang tengah',
  'tangga baja tinggi 3600, lebar 1000, optrede 300, antrede 175',
  'simpul kolom balok kolom 500 balok 300 kali 600 bentang 5 meter',
  'tumpukan lantai 12 lantai, denah 9 meter kali 7 meter, tinggi lantai 3,6 meter',
  'saluran u lebar 400 tinggi 400, empat segmen 1200',
  'dudukan motor pcd 120, 4 lubang M10, tebal 12, slot 35',
  'poros bertingkat diameter 80 panjang 400, empat tingkat, bore 30',
  'ganti materialnya jadi aluminium',
  'tebalnya jadi 16',
  'berapa massanya',
];

/* --------------------------------------------------------- value reading */

/**
 * Pull a recipe's field values out of the sentence.
 *
 * Keywords come from the field's own label rather than from a second table,
 * so adding a field to a recipe makes it settable from the chat with no other
 * change. A bare dimension run — "400 x 300 x 150" — fills the length fields
 * in the order the recipe declares them, which is the order a drawing states
 * them in.
 */
export function bacaNilai(id, text) {
  const rec = RESEP[id];
  if (!rec) return {};
  const v = {};
  const src = String(text).toLowerCase();
  const bidang = Object.entries(rec.bidang);
  const panjang = bidang.filter(([, f]) => f.unit === 'mm' && typeof f.def === 'number');
  const cacah = bidang.filter(([, f]) => f.unit !== 'mm' && typeof f.def === 'number');

  /* 1. A bare dimension run fills the length fields in declaration order,
        which is the order a drawing states them in. Its numbers are then
        taken out of play: in "denah 9 m kali 7 m" the word `denah` sits in
        front of the run, and a named pass over the original text would
        answer both the width and the depth with 9. */
  const dims = dimensi(src);
  const dariRun = new Set();
  if (dims) {
    // "balok 300 kali 600" is a run about the beam, not about the first two
    // length fields the recipe happens to declare. If the word in front of the
    // run names a group of fields, that group takes it.
    const before = (dims.src.slice(0, dims.span[0]).match(/([a-z]+)[^a-z]*$/) || [])[1];
    const grup = before
      ? panjang.filter(([key, f]) => `${key} ${f.label}`.toLowerCase().includes(before))
      : [];
    const target = grup.length >= 2 ? grup : panjang;
    dims.forEach((mm, i) => {
      const entry = target[i];
      if (entry) { v[entry[0]] = mm; dariRun.add(entry[0]); }
    });
  }
  const rest = tanpaDimensi(src);

  /* 2. Sibling fields stated with a conjunction: "sayap 150 dan 100". Two
        fields are siblings when their labels differ only in the last word. */
  for (let i = 0; i < panjang.length - 1; i++) {
    const [ka, fa] = panjang[i];
    const [kb, fb] = panjang[i + 1];
    const wa = String(fa.label).toLowerCase().split(/\s+/);
    const wb = String(fb.label).toLowerCase().split(/\s+/);
    if (wa.length !== wb.length || wa.length < 2) continue;
    if (wa.slice(0, -1).join(' ') !== wb.slice(0, -1).join(' ')) continue;
    const kunci = wa.at(-2);
    const pair = pasangan(kunci, rest) || pasangan(wa.slice(0, -1).join(' '), rest);
    if (pair) { v[ka] = pair[0]; v[kb] = pair[1]; dariRun.delete(ka); dariRun.delete(kb); }
  }

  /* 3. Counts, before lengths. "empat segmen 1200" is four segments of 1200,
        and a named pass would read the 1200 as the count. */
  for (const [key, f] of cacah) {
    const noun = String(f.label).toLowerCase().replace(/^jumlah\s+/, '');
    const alt = [noun, key.toLowerCase(), ...(SINONIM[noun] || [])].join('|');
    const got = jumlah(alt, rest);
    if (got != null) { v[key] = got; continue; }
    const named = nilai(String(f.label).toLowerCase(), rest, { mm: false }) ?? nilai(key.toLowerCase(), rest, { mm: false });
    if (named != null) v[key] = named;
  }

  /* 4. A bolt callout answers any field that is about a bolt size. */
  const m = baut(rest);
  if (m != null) {
    for (const [key, f] of bidang) {
      if (!/baut|bolt/i.test(`${key} ${f.label}`)) continue;
      if (f.unit === 'mm' || typeof f.def !== 'number') continue;
      if (/jumlah|count/i.test(f.label)) continue;
      v[key] = m;
    }
  }

  /* 5. Named lengths, which override a run only when named explicitly. */
  const hitungKata = new Map();
  for (const [, f] of bidang) {
    for (const w of String(f.label).toLowerCase().split(/\s+/)) {
      hitungKata.set(w, (hitungKata.get(w) || 0) + 1);
    }
  }
  for (const [key, f] of panjang) {
    const label = String(f.label).toLowerCase();
    const words = [
      label,
      ...label.split(/\s+/).filter(w => w.length > 3 && hitungKata.get(w) === 1),
      key.toLowerCase(),
    ];
    if (v[key] != null && !dariRun.has(key)) continue;
    for (const w of words) {
      const got = nilai(w, rest, { mm: true });
      if (got != null && Number.isFinite(got)) { v[key] = got; break; }
    }
  }

  /* 6. Flags and material. */
  for (const [key, f] of bidang) {
    if (typeof f.def !== 'boolean') continue;
    const label = String(f.label).toLowerCase();
    const last = label.split(/\s+/).at(-1);
    if (ada(rest, [`tanpa ${label}`, `tanpa ${last}`])) v[key] = false;
    else if (ada(rest, [label, last])) v[key] = true;
  }
  const mat = pertama(src, Object.keys(MATERIAL));
  if (mat && rec.bidang.material) v.material = MATERIAL[mat];

  return v;
}

/**
 * Words that count the same thing.
 *
 * A bolted plate's "jumlah baut" is what a drawing office calls the number of
 * holes, and a stair's treads are counted as anak tangga. Kept here rather
 * than in the recipes so a recipe stays a parts list.
 */
const SINONIM = {
  baut: ['lubang', 'hole', 'bolt', 'holes'],
  gland: ['kabel', 'cable'],
  segmen: ['batang', 'potong', 'section'],
  lantai: ['tingkat', 'floor', 'floors', 'level'],
  'lubang motor': ['lubang', 'hole'],
  'palang tengah': ['palang', 'rak', 'tingkat'],
  tingkat: ['step', 'tahap'],
  'lubang per sayap': ['lubang', 'hole'],
};

/* ------------------------------------------------------------- edit turns */

/**
 * An edit to something already in the document.
 *
 * Returned as data rather than applied, for the same reason a build is: the
 * caller shows it first. Each edit names a document parameter or a feature
 * field, so applying one is a single `store.edit` in main.js and the undo
 * stack gets one entry per turn rather than one per field.
 */
function rencanaUbah(text, ctx, sesi) {
  const src = angkaKata(String(text).toLowerCase());
  const edits = [];
  const understood = [];
  const doc = ctx.doc;
  const params = doc?.params || [];

  /** Set a document parameter if the model has one by that name. */
  const setParam = (names, value, label) => {
    const hit = params.find(p => names.some(n => p.name.toLowerCase().includes(n)));
    if (!hit) return false;
    edits.push({ kind: 'param', name: hit.name, value });
    understood.push(`${label} ${hit.name} → ${value}`);
    return true;
  };

  const mat = pertama(src, Object.keys(MATERIAL));
  if (mat && ada(src, ['ganti', 'ubah', 'jadikan', 'pakai', 'bikin', 'set'])) {
    edits.push({ kind: 'material', material: MATERIAL[mat], targets: ctx.selection?.length ? ctx.selection : null });
    understood.push(`material → ${MATERIALS[MATERIAL[mat]]?.name || MATERIAL[mat]}`);
  }

  for (const [words, keys, label] of [
    [UBAH_TEBAL, ['tebal', '_t', 'dinding', 'tebal_t'], 'tebal'],
    [UBAH_LEBAR, ['lebar', '_w', 'w'], 'lebar'],
    [UBAH_PANJANG, ['panjang', '_d', '_l', 'd'], 'panjang'],
    [UBAH_TINGGI, ['tinggi', '_h', 'h'], 'tinggi'],
  ]) {
    const w = pertama(src, words);
    if (!w) continue;
    const value = nilai(w, src);
    if (value == null) continue;
    if (!setParam(keys, value, label)) {
      // No parameter by that name: offer it as a new one rather than guess
      // which feature field was meant.
      edits.push({ kind: 'paramBaru', name: `${label}_baru`, value });
      understood.push(`parameter baru ${label}_baru = ${value}`);
    }
  }

  const n = jumlah('lubang|baut|hole|bolt|salinan|copy', src);
  if (n != null && ada(src, ['jadi', 'jadikan', 'ganti', 'ubah', 'set'])) {
    edits.push({ kind: 'pattern', count: n });
    understood.push(`jumlah pola → ${n}`);
  }

  if (!edits.length) return null;
  return {
    aksi: 'ubah',
    edits,
    understood,
    program: { features: [], params: [], notes: [], tally: { param: edits.length } },
  };
}

/* ---------------------------------------------------------------- queries */

/**
 * Whole-word match that tolerates the possessive `-nya`.
 *
 * "berapa massanya" is the ordinary way to ask, and `ada()` alone misses it
 * because `massanya` is not the word `massa`. Used for the query words only,
 * where a false positive costs a wrong answer rather than a wrong model.
 */
function disebut(text, words) {
  const src = ` ${String(text).toLowerCase()} `;
  return words.some(w => new RegExp(`[^a-z]${w.replace(/\s+/g, '\\s+')}(?:nya|-nya)?(?![a-z])`).test(src));
}

/** Is this a question rather than an instruction? */
function bertanya(text) {
  const t = String(text).trim();
  if (t.endsWith('?')) return true;
  if (/^(berapa|apa|apakah|seberapa|bagaimana|mana|di mana|kapan)\b/.test(t)) return true;
  // "massanya?" with the question mark dropped, which is most of them.
  return /\b(berapa|seberapa)\b/.test(t) && !ada(t, ['buat', 'buatkan', 'bikin', 'tambah', 'jadikan', 'ganti', 'ubah']);
}

function jawabPertanyaan(text, ctx) {
  const s = ctx.stats || {};
  const rp = (n) => `Rp${Math.round(n).toLocaleString('id-ID')}`;
  if (disebut(text, TANYA_MASSA)) {
    return s.mass != null
      ? `Massanya ${s.mass.toFixed(3)} kg, dihitung dari mesh dan densitas material yang terpasang.`
      : 'Belum ada body yang terbangun, jadi belum ada massa untuk dilaporkan.';
  }
  if (disebut(text, TANYA_VOLUME)) {
    return s.volume != null
      ? `Volumenya ${s.volume.toFixed(1)} mm³ (${(s.volume / 1e9).toFixed(6)} m³), dari teorema divergensi pada tiap mesh tertutup.`
      : 'Belum ada body tertutup untuk dihitung volumenya.';
  }
  if (disebut(text, TANYA_BIAYA)) {
    return s.cost != null
      ? `Perkiraan ${rp(s.cost)} per unit — orde besaran dari model tarif generik, bukan penawaran. Buka Studio → Biaya untuk rinciannya.`
      : 'Buka Studio → Biaya untuk perkiraan biaya; itu butuh proses dan batch yang Anda pilih.';
  }
  if (disebut(text, TANYA_UKURAN)) {
    return s.size
      ? `Kotak batasnya ${s.size.map(v => v.toFixed(1)).join(' × ')} mm.`
      : 'Belum ada geometri untuk diukur.';
  }
  if (disebut(text, TANYA_JUMLAH)) {
    return `${s.bodies ?? 0} body dari ${ctx.doc?.features?.length ?? 0} fitur.`;
  }
  return null;
}

/* -------------------------------------------------------------- one turn */

/**
 * Take one user message and answer it.
 *
 * Returns everything the dialog needs and nothing it does not: what was
 * understood, the program that would be applied, the assumptions, the click
 * estimate, and the sentences to print. The caller applies `program` only
 * after the user agrees, which is why `aksi` is reported separately from the
 * program itself.
 */
export function respon(sesi, text, ctx = {}) {
  const raw = String(text || '').trim();
  if (!raw) return balas(sesi, { aksi: 'tolak', ucapan: ['Belum ada yang diketik.'] });

  sesi.turns.push({ dari: 'pengguna', teks: raw });
  const low = raw.toLowerCase();

  /* --- help --- */
  if (ada(low, BANTUAN) && !cocok(low)) {
    return balas(sesi, {
      aksi: 'jawab',
      ucapan: [...sapaan(), 'Contoh yang bisa disalin:', ...CONTOH.slice(0, 6).map(c => `· ${c}`)],
    });
  }

  /* --- confirming or dropping a plan --- */
  if (sesi.program && ada(low, YA) && raw.split(/\s+/).length <= 4) {
    const program = sesi.program;
    sesi.program = null;
    sesi.klikTotal += klikProgram(program);
    sesi.dibangun += 1;
    return balas(sesi, {
      aksi: 'terapkan',
      program,
      ucapan: ['Diterapkan. Undo mengembalikannya sebagai satu langkah.', klikKalimat(sesi.klikTotal)],
    });
  }
  if (sesi.program && ada(low, TIDAK)) {
    sesi.program = null;
    return balas(sesi, { aksi: 'jawab', ucapan: ['Dibatalkan. Tidak ada yang berubah.'] });
  }
  if (ada(low, HAPUS) && ada(low, ['obrolan', 'chat', 'percakapan', 'riwayat'])) {
    const fresh = sesiBaru();
    Object.assign(sesi, fresh);
    return balas(sesi, { aksi: 'jawab', ucapan: ['Obrolan dikosongkan. Dokumennya tidak disentuh.'] });
  }

  /* --- a question about the model --- */
  //
  // Gated on the sentence actually being a question. Without the gate,
  // "buatkan braket dengan massa rendah" is answered with the current mass
  // instead of building anything, because it contains the word `massa` —
  // which is how a query grammar quietly eats a build request.
  if (bertanya(low)) {
    const jawab = jawabPertanyaan(low, ctx);
    if (jawab) return balas(sesi, { aksi: 'jawab', ucapan: [jawab] });
  }

  /* --- the real work: one clause at a time --- */
  const klausa = pecah(raw);
  const gabung = { features: [], params: [], notes: [], tally: {} };
  const understood = [];
  const ucapan = [];
  const ditolak = [];
  let resepTerakhir = null;
  let editRencana = null;

  for (const k of klausa) {
    const id = cocok(k);
    if (id) {
      const values = { ...(sesi.resep === id ? sesi.values : {}), ...bacaNilai(id, k) };
      const built = bangun(id, values);
      tambah(gabung, built);
      understood.push(`${RESEP[id].nama.toLowerCase()}: ${ringkasNilai(id, built.values)}`);
      resepTerakhir = { id, values: built.values };
      continue;
    }

    const spoken = speakInterpret(k, { doc: ctx.doc, target: ctx.target || null });
    if (spoken.ok && spoken.features?.length) {
      tambah(gabung, spoken);
      understood.push(...(spoken.understood || []));
      continue;
    }

    const ubah = rencanaUbah(k, ctx, sesi);
    if (ubah) {
      editRencana = editRencana
        ? { ...editRencana, edits: [...editRencana.edits, ...ubah.edits], understood: [...editRencana.understood, ...ubah.understood] }
        : ubah;
      understood.push(...ubah.understood);
      continue;
    }

    ditolak.push({ teks: k, why: spoken.why });
  }

  /* --- an edit-only turn --- */
  if (!gabung.features.length && editRencana) {
    sesi.program = null;
    return balas(sesi, {
      aksi: 'ubah',
      edits: editRencana.edits,
      understood,
      ucapan: ['Saya ubah ini:', ...editRencana.understood.map(u => `· ${u}`), 'Katakan "ya" untuk menerapkannya.'],
      program: editRencana.program,
    });
  }

  /* --- nothing matched --- */
  if (!gabung.features.length) {
    const why = ditolak[0]?.why;
    return balas(sesi, {
      aksi: 'tolak',
      ucapan: [
        why || 'Itu di luar kosa kata yang saya baca.',
        `Rakitan: ${RESEP_IDS.map(id => RESEP[id].nama.toLowerCase()).join(', ')}.`,
        `Bentuk tunggal: ${Object.keys(CATALOG).filter(t => CATALOG[t].group === 'solid').join(', ')}.`,
        'Ketik "bantuan" untuk contoh lengkap.',
      ],
      understood,
    });
  }

  /* --- a build, planned but not applied --- */
  if (resepTerakhir) { sesi.resep = resepTerakhir.id; sesi.values = resepTerakhir.values; }
  sesi.program = gabung;
  sesi.subjek = gabung.features.at(-1)?.id || sesi.subjek;
  const klik = klikProgram(gabung);

  ucapan.push('Yang saya baca:');
  ucapan.push(...understood.map(u => `· ${u}`));
  ucapan.push(`Rencananya ${gabung.features.length} fitur dan ${gabung.params.length} parameter bernama.`);
  if (gabung.notes.length) {
    ucapan.push('Yang saya asumsikan:');
    ucapan.push(...gabung.notes.map(n => `· ${n}`));
  }
  if (ditolak.length) {
    ucapan.push(`Yang tidak saya ikuti: ${ditolak.map(d => `“${d.teks}”`).join(', ')}.`);
  }
  ucapan.push(klikKalimat(klik));
  ucapan.push('Katakan "ya" untuk membangunnya, atau sebut yang perlu diubah.');

  return balas(sesi, { aksi: 'rencana', program: gabung, understood, klik, ucapan, resep: resepTerakhir?.id || null });
}

/* -------------------------------------------------------------- plumbing */

/** Merge a built program into the turn's accumulator. */
function tambah(into, built) {
  if (!built) return into;
  into.features.push(...(built.features || []));
  for (const p of built.params || []) {
    if (!into.params.some(q => q.name === p.name)) into.params.push(p);
  }
  into.notes.push(...(built.notes || []));
  for (const [k, n] of Object.entries(built.tally || {})) into.tally[k] = (into.tally[k] || 0) + n;
  return into;
}

/** The values line the chat echoes back, so a wrong reading is visible. */
function ringkasNilai(id, values) {
  const rec = RESEP[id];
  const def = bawaan(id);
  const parts = [];
  for (const [key, f] of Object.entries(rec.bidang)) {
    const v = values[key];
    if (v === undefined) continue;
    const changed = v !== def[key];
    parts.push(`${String(f.label).toLowerCase()} ${v}${f.unit === 'mm' ? ' mm' : ''}${changed ? '' : ' (bawaan)'}`);
  }
  return parts.join(', ');
}

function balas(sesi, out) {
  const reply = { ok: out.aksi !== 'tolak', klik: 0, understood: [], program: null, edits: null, ...out };
  sesi.turns.push({ dari: 'studio', teks: reply.ucapan.join('\n') });
  return reply;
}

/** The single-shape examples, re-exported so the dialog shows one help list. */
export const CONTOH_BENTUK = SPEAK_EXAMPLES;

/** Every quantity the last message mentioned — used by the suite and debug. */
export const bacaUkuran = ukuran;
