/**
 * The design brief: requirements in, an engineered parametric model out.
 *
 * The gap this addresses is the largest of the ten and also the easiest to fake.
 * The honest version of "describe what you want and get a model" needs a
 * language model and a server, and this application has neither by design —
 * nothing here touches the network and nothing is uploaded. So rather than
 * pretend, this does the part that can be done properly and completely offline:
 *
 *   requirements → engineering calculation → named parameters → feature tree
 *
 * over a bounded catalogue of part archetypes. You state the load, the envelope,
 * the fixings and the material; it sizes the part from first principles, writes
 * the sizing *as expressions* so the reasoning stays visible and editable in the
 * model, and reports every assumption it made.
 *
 * What that buys over a template: a template gives you a bracket. This gives you
 * a bracket whose thickness is `sqrt(6 * load * arm / (width * allow))`, so when
 * the load doubles the part follows, and an engineer can read the intent and
 * disagree with it.
 *
 * What it is not: a substitute for analysis. Every calculation here is a
 * textbook closed-form one on an idealised section, with a stated safety factor
 * and no stress concentrations, no fatigue, no buckling and no real boundary
 * conditions. The generated model says so, in the document notes, where it
 * cannot be lost.
 */
import { MATERIALS } from '../core/doc.js';
import { processOf } from './process.js';
import { standards, limits } from './standards.js';
import { isi } from '../core/teks.js';

/**
 * Yield strength in MPa (N/mm²), and a note on where the number comes from.
 * Conservative ends of common ranges: sizing should err heavy.
 */
export const STRENGTH = {
  steel:     { yield: 250, label: 'Baja lunak, S275 di ujung bawah' },
  stainless: { yield: 210, label: 'Stainless 304, anil' },
  aluminium: { yield: 215, label: '6061-T6' },
  brass:     { yield: 130, label: 'CZ121 mudah dibubut' },
  copper:    { yield: 70,  label: 'C101 anil' },
  titanium:  { yield: 830, label: 'Ti-6Al-4V' },
  abs:       { yield: 40,  label: 'ABS, cetak injeksi' },
  pla:       { yield: 50,  label: 'PLA, dicetak padat searah bidang layer' },
  nylon:     { yield: 45,  label: 'Nylon 12' },
  acrylic:   { yield: 65,  label: 'Akrilik cor, getas: waspadai di bawah beban kejut' },
  wood:      { yield: 35,  label: 'Pinus, searah serat' },
  concrete:  { yield: 3,   label: 'Tanpa tulangan, dalam tarik. Jangan dibebani seperti ini.' },
  glass:     { yield: 30,  label: 'Kaca float anil, getas' },
  rubber:    { yield: 5,   label: 'Bukan material struktural' },
  custom:    { yield: 100, label: 'Sementara: isi angka sebenarnya sebelum mempercayai apa pun di bawah' },
};

/** Metric clearance holes, mm. */
export const BOLTS = {
  M3: { clear: 3.4, head: 6.0, washer: 7 },
  M4: { clear: 4.5, head: 8.0, washer: 9 },
  M5: { clear: 5.5, head: 10.0, washer: 10 },
  M6: { clear: 6.6, head: 11.0, washer: 12 },
  M8: { clear: 9.0, head: 15.0, washer: 17 },
  M10: { clear: 11.0, head: 18.0, washer: 21 },
  M12: { clear: 13.5, head: 21.0, washer: 24 },
};

/* ------------------------------------------------------------- archetypes */

/**
 * Each archetype declares the questions it needs answered and how to turn the
 * answers into parameters, features and a rationale. Adding one is a matter of
 * writing a `fields` list and a `build`; nothing else in the application has to
 * know about it.
 */
export const ARCHETYPES = {
  bracket: {
    label: 'Braket L',
    icon: 'wedge',
    blurb: 'Braket siku yang diukur agar lengan tegaknya tahan beban lentur.',
    fields: [
      { key: 'load', label: 'Beban di ujung', unit: 'N', kind: 'num', def: 300, min: 1 },
      { key: 'arm', label: 'Panjang lengan', unit: 'mm', kind: 'len', def: 80, min: 5 },
      { key: 'width', label: 'Lebar braket', unit: 'mm', kind: 'len', def: 40, min: 5 },
      { key: 'sf', label: 'Faktor keamanan', kind: 'num', def: 2.5, min: 1, max: 10 },
      { key: 'bolt', label: 'Pengikat', kind: 'select', def: 'M6', options: Object.keys(BOLTS) },
    ],
    build: (v, ctx) => {
      const allow = ctx.yield / v.sf;
      // Cantilever, rectangular section: t = sqrt(6 F L / (b σ))
      const t = Math.sqrt((6 * v.load * v.arm) / (v.width * allow));
      const thick = ctx.round(Math.max(t, ctx.lim.minWall));
      const bolt = BOLTS[v.bolt];
      const base = ctx.round(Math.max(v.arm * 0.6, bolt.washer * 2.5));
      return {
        params: [
          ['load', v.load, 'Beban rencana di ujung lengan, newton'],
          ['arm', v.arm, 'Jarak dari dinding ke beban'],
          ['width', v.width, 'Lebar braket'],
          ['sf', v.sf, 'Faktor keamanan terhadap leleh'],
          ['allow', `${ctx.yield} / sf`,
            isi('Tegangan izin, N/mm². Kuat leleh {material} adalah {yield} MPa.', { material: ctx.matLabel, 'yield': ctx.yield })],
          ['thick', `max(sqrt(6 * load * arm / (width * allow)), ${ctx.lim.minWall})`,
            'Tebal dinding dari lentur kantilever, dibatasi minimum proses'],
          ['base', base, 'Panjang kaki yang dijepit'],
          ['hole', bolt.clear, `${v.bolt} clearance hole`],
        ],
        features: [
          { type: 'box', name: 'Vertical arm', params: { w: 'thick', d: 'width', h: 'arm' }, pos: ['thick/2', 0, 'arm/2'] },
          { type: 'box', name: 'Base leg', params: { w: 'base', d: 'width', h: 'thick' }, pos: ['base/2', 0, 'thick/2'] },
          { type: 'boolean', name: 'Bracket', params: { op: 'union' }, inputs: [0, 1] },
          { type: 'cylinder', name: 'Fixing hole', params: { r: 'hole/2', h: 'thick*3' }, pos: ['base*0.7', 0, 'thick/2'] },
          { type: 'patternLinear', name: 'Fixing holes', params: { dx: 0, dy: `width*0.5`, dz: 0, count: 2 }, inputs: [3], pos: [0, `-width*0.25`, 0] },
          { type: 'boolean', name: 'Braket L', params: { op: 'subtract' }, inputs: [2, 4] },
        ],
        rationale: [
          isi('Diperlakukan sebagai kantilever dengan beban di {arm}mm: momen lentur {moment} N·m.', { arm: v.arm, moment: (v.load * v.arm / 1000).toFixed(1) }),
          isi('Tegangan izin {allow} N/mm², dari kuat leleh {yield} MPa dibagi faktor keamanan {sf}.', { allow: allow.toFixed(0), 'yield': ctx.yield, sf: v.sf }),
          isi('Tebal yang dibutuhkan {needed}mm; dipakai {used}mm setelah batas bawah proses {floor}mm.', { needed: t.toFixed(2), used: thick, floor: ctx.lim.minWall }),
          ('Pangkal tekukan adalah sudut dalam yang tajam, dan di situlah ia akan benar-benar gagal. Tambahkan fillet atau gusset sebelum membebaninya mendekati batas.'),
        ],
      };
    },
  },

  plate: {
    label: 'Pelat baut',
    icon: 'plate',
    blurb: 'Pelat dudukan dengan pola baut pada lingkaran pitch atau persegi panjang.',
    fields: [
      { key: 'w', label: 'Lebar', unit: 'mm', kind: 'len', def: 120, min: 10 },
      { key: 'd', label: 'Kedalaman', unit: 'mm', kind: 'len', def: 80, min: 10 },
      { key: 'load', label: 'Beban, tengah', unit: 'N', kind: 'num', def: 500, min: 0 },
      { key: 'sf', label: 'Faktor keamanan', kind: 'num', def: 2.5, min: 1, max: 10 },
      { key: 'bolt', label: 'Pengikat', kind: 'select', def: 'M6', options: Object.keys(BOLTS) },
      { key: 'count', label: 'Jumlah baut', kind: 'int', def: 4, min: 2, max: 24 },
    ],
    build: (v, ctx) => {
      const allow = ctx.yield / v.sf;
      const span = Math.min(v.w, v.d);
      // Simply-supported plate strip, load at mid-span: t = sqrt(1.5 F L / (b σ))
      const t = Math.sqrt((1.5 * Math.max(v.load, 1) * span) / (Math.max(v.w, v.d) * allow));
      const thick = ctx.round(Math.max(t, ctx.lim.minWall, 3));
      const bolt = BOLTS[v.bolt];
      const inset = ctx.round(bolt.washer * 0.9);
      return {
        params: [
          ['plate_w', v.w, 'Plate width'],
          ['plate_d', v.d, 'Plate depth'],
          ['load', v.load, 'Beban tengah, newton'],
          ['sf', v.sf, 'Faktor keamanan terhadap leleh'],
          ['allow', `${ctx.yield} / sf`,
            isi('Tegangan izin, N/mm², untuk {material}', { material: ctx.matLabel })],
          ['thick', `max(sqrt(1.5 * load * min(plate_w, plate_d) / (max(plate_w, plate_d) * allow)), ${Math.max(ctx.lim.minWall, 3)})`,
            'Tebal dari strip tumpuan sederhana, dibatasi'],
          ['bolt_r', bolt.clear / 2, `${v.bolt} clearance radius`],
          ['inset', inset, 'Jarak pusat baut dari tepi, diukur untuk washer'],
        ],
        features: [
          { type: 'plate', name: 'Pelat', params: { w: 'plate_w', d: 'plate_d', h: 'thick', fillet: 'inset', hole: 0 } },
          { type: 'cylinder', name: 'Lubang baut', params: { r: 'bolt_r', h: 'thick*3' }, pos: [`plate_w/2 - inset`, `plate_d/2 - inset`, 0] },
          { type: 'patternCircular', name: 'Pola baut', params: { axis: 'z', count: v.count, angle: 360, rotate: false }, inputs: [1] },
          { type: 'boolean', name: 'Pelat baut', params: { op: 'subtract' }, inputs: [0, 2] },
        ],
        rationale: [
          isi('Diukur sebagai strip tumpuan sederhana melintasi bentang {span}mm dengan beban di tengah bentang.', { span }),
          isi('Tegangan izin {allow} N/mm² dari kuat leleh {yield} MPa dan faktor keamanan {sf}.', { allow: allow.toFixed(0), 'yield': ctx.yield, sf: v.sf }),
          isi('Tebal yang dibutuhkan {needed}mm; dipakai {used}mm setelah dibatasi di {floor}mm.', { needed: t.toFixed(2), used: thick, floor: Math.max(ctx.lim.minWall, 3) }),
          ('Baut disusun melingkar mengelilingi pusat. Untuk pola persegi panjang, ubah tipe fitur pattern-nya di pohon fitur.'),
        ],
      };
    },
  },

  shaft: {
    label: 'Poros',
    icon: 'cylinder',
    blurb: 'Poros bulat yang diukur untuk torsi, dengan bore tembus opsional.',
    fields: [
      { key: 'torque', label: 'Torsi', unit: 'N·m', kind: 'num', def: 40, min: 0.1 },
      { key: 'len', label: 'Panjang', unit: 'mm', kind: 'len', def: 150, min: 5 },
      { key: 'sf', label: 'Faktor keamanan', kind: 'num', def: 3, min: 1, max: 10 },
      { key: 'hollow', label: 'Bore tembus', kind: 'bool', def: false },
    ],
    build: (v, ctx) => {
      // Shear yield taken as 0.577 of tensile (von Mises).
      const allow = (ctx.yield * 0.577) / v.sf;
      const T = v.torque * 1000;                        // N·mm
      const d = Math.cbrt((16 * T) / (Math.PI * allow));
      const dia = ctx.round(Math.max(d, ctx.lim.minFeature * 3, 4));
      return {
        params: [
          ['torque', v.torque, 'Transmitted torque, N·m'],
          ['shaft_len', v.len, 'Shaft length'],
          ['sf', v.sf, 'Faktor keamanan terhadap leleh geser'],
          ['allow', `${(ctx.yield * 0.577).toFixed(0)} / sf`,
            isi('Geser izin, N/mm². Kuat leleh geser diambil 0,577 × {yield} MPa tarik, von Mises.', { 'yield': ctx.yield })],
          ['shaft_d', `max(cbrt(16 * torque * 1000 / (pi * allow)), 4)`,
            'Diameter dari torsi penampang bulat pejal'],
          ...(v.hollow ? [['bore', `shaft_d * 0.5`, 'Bore tembus, separuh diameter luar']] : []),
        ],
        features: v.hollow
          ? [{ type: 'tube', name: 'Poros', params: { ro: 'shaft_d/2', ri: 'bore/2', h: 'shaft_len' } }]
          : [{ type: 'cylinder', name: 'Poros', params: { r: 'shaft_d/2', h: 'shaft_len' } }],
        rationale: [
          ('Penampang bulat pejal dalam torsi murni: d = cbrt(16T / πτ).'),
          isi('Geser izin {allow} N/mm², dari kuat leleh tarik {yield} MPa, faktor von Mises 0,577, dan faktor keamanan {sf}.', { allow: allow.toFixed(0), 'yield': ctx.yield, sf: v.sf }),
          isi('Diameter yang dibutuhkan {needed}mm; dipakai {used}mm.', { needed: d.toFixed(2), used: dia }),
          v.hollow
            ? ('Bore selebar separuh diameter luar membuang seperempat massa dan hanya sekitar 6% kekakuan torsi, karena material di dekat sumbu nyaris tidak bekerja.')
            : ('Torsi hampir seluruhnya ditahan material terluar, jadi bore tembus hanya mengorbankan sedikit kekuatan kalau Anda perlu menghemat massa.'),
          ('Tanpa alur pasak, tanpa bahu, dan tanpa kelonggaran kelelahan. Poros berputar di bawah beban bolak-balik butuh pemeriksaan kelelahan yang tidak dilakukan di sini.'),
        ],
      };
    },
  },

  pressureTube: {
    label: 'Tabung bertekanan',
    icon: 'tube',
    blurb: 'Silinder yang dindingnya diukur untuk tekanan dalam lewat tegangan lingkar.',
    fields: [
      { key: 'bore', label: 'Diameter dalam', unit: 'mm', kind: 'len', def: 60, min: 2 },
      { key: 'pressure', label: 'Tekanan dalam', unit: 'bar', kind: 'num', def: 10, min: 0.1 },
      { key: 'len', label: 'Panjang', unit: 'mm', kind: 'len', def: 200, min: 5 },
      { key: 'sf', label: 'Faktor keamanan', kind: 'num', def: 4, min: 1, max: 12 },
    ],
    build: (v, ctx) => {
      const allow = ctx.yield / v.sf;
      const p = v.pressure * 0.1;                 // bar → N/mm²
      const t = (p * v.bore) / (2 * allow);       // thin-wall hoop stress
      const wall = ctx.round(Math.max(t, ctx.lim.minWall));
      return {
        params: [
          ['bore', v.bore, 'Diameter dalam'],
          ['pressure', v.pressure, 'Internal pressure, bar'],
          ['tube_len', v.len, 'Panjang'],
          ['sf', v.sf, 'Faktor keamanan terhadap leleh'],
          ['allow', `${ctx.yield} / sf`,
            isi('Tegangan izin, N/mm², untuk {material}', { material: ctx.matLabel })],
          ['wall', `max(pressure * 0.1 * bore / (2 * allow), ${ctx.lim.minWall})`,
            'Tebal dinding dari tegangan lingkar dinding tipis, dibatasi minimum proses'],
        ],
        features: [
          { type: 'tube', name: 'Tabung bertekanan', params: { ro: 'bore/2 + wall', ri: 'bore/2', h: 'tube_len' } },
        ],
        rationale: [
          isi('Tegangan lingkar dinding tipis: t = pD / 2σ, dengan {bar} bar sebagai {nmm} N/mm².', { bar: v.pressure, nmm: p.toFixed(2) }),
          isi('Tegangan izin {allow} N/mm² dari kuat leleh {yield} MPa dan faktor keamanan {sf}.', { allow: allow.toFixed(0), 'yield': ctx.yield, sf: v.sf }),
          isi('Dinding yang dibutuhkan {needed}mm; dipakai {used}mm setelah batas bawah proses {floor}mm.', { needed: t.toFixed(3), used: wall, floor: ctx.lim.minWall }),
          t / v.bore > 0.05
            ? isi('Pada {percent}% dari bore ini sudah bukan dinding tipis lagi, jadi rumusnya meremehkan tegangan puncak. Pakai perhitungan dinding tebal (Lamé) sebelum membangunnya.', { percent: (t / v.bore * 100).toFixed(0) })
            : ('Rasio dinding terhadap bore di bawah 5%, jadi asumsi dinding tipis berlaku.'),
          ('Ujung, sambungan, dan fitting tidak tercakup. Bejana tekan adalah barang yang diatur di sebagian besar yurisdiksi.'),
        ],
      };
    },
  },

  enclosure: {
    label: 'Kotak pelindung',
    icon: 'box',
    blurb: 'Kotak yang diukur mengelilingi isinya, dengan dinding pada minimum proses.',
    fields: [
      { key: 'iw', label: 'Lebar dalam', unit: 'mm', kind: 'len', def: 100, min: 5 },
      { key: 'id', label: 'Kedalaman dalam', unit: 'mm', kind: 'len', def: 70, min: 5 },
      { key: 'ih', label: 'Tinggi dalam', unit: 'mm', kind: 'len', def: 40, min: 5 },
      { key: 'clear', label: 'Kelonggaran di sekitar isi', unit: 'mm', kind: 'len', def: 1.5, min: 0 },
    ],
    build: (v, ctx) => {
      const wall = ctx.round(Math.max(ctx.lim.minWall * 1.5, 1.6));
      return {
        params: [
          ['inner_w', v.iw, 'Lebar dalam, sebelum kelonggaran'],
          ['inner_d', v.id, 'Kedalaman dalam, sebelum kelonggaran'],
          ['inner_h', v.ih, 'Tinggi dalam, sebelum kelonggaran'],
          ['clear', v.clear, 'Kelonggaran di sekeliling isi pada setiap sisi'],
          ['wall', wall, isi('Tebal dinding: 1,5 × minimum {process} sebesar {mm}mm', { process: ctx.process.label, mm: ctx.lim.minWall })],
          ['cav_w', 'inner_w + clear*2', 'Cavity width'],
          ['cav_d', 'inner_d + clear*2', 'Cavity depth'],
          ['cav_h', 'inner_h + clear*2', 'Cavity height'],
        ],
        features: [
          { type: 'box', name: 'Cangkang', params: { w: 'cav_w + wall*2', d: 'cav_d + wall*2', h: 'cav_h + wall' }, pos: [0, 0, '(cav_h + wall)/2'] },
          { type: 'box', name: 'Rongga', params: { w: 'cav_w', d: 'cav_d', h: 'cav_h' }, pos: [0, 0, 'wall + cav_h/2'] },
          { type: 'boolean', name: 'Kotak pelindung', params: { op: 'subtract' }, inputs: [0, 1] },
        ],
        rationale: [
          isi('Dinding {wall}mm: satu setengah kali minimum {minimum}mm untuk {process}, dan di situlah sebuah dinding berhenti rapuh.', { wall, minimum: ctx.lim.minWall, process: ctx.process.label }),
          ('Dimensi luar mengikuti isinya lewat ekspresi, jadi mengubah apa yang masuk ke dalam mengubah ukuran kotaknya.'),
          ('Tanpa tutup: ini baki sampai Anda menambahkan tutup. Modelkan tutupnya sebagai body kedua supaya keduanya bisa dibuat dalam satu kali produksi.'),
          ctx.process.kind === 'formative'
            ? ('Proses ini butuh draft pada setiap muka tegak, dan di sini belum ada. Tambahkan sebelum memotong cetakan.')
            : isi('Tanpa draft, dan itu benar untuk {process}.', { process: ctx.process.label }),
        ],
      };
    },
  },
};

export const ARCHETYPE_IDS = Object.keys(ARCHETYPES);

/* -------------------------------------------------------------- synthesis */

/**
 * Turn a brief into parameters, features and the reasoning behind them.
 *
 * @param {string} id       archetype key
 * @param {object} values   answers to that archetype's fields
 * @param {object} opts     { material, process }
 * @returns {{ params, features, rationale, warnings, label }}
 */
export function synthesise(id, values = {}, opts = {}) {
  const arch = ARCHETYPES[id];
  if (!arch) throw new Error(isi('Arketipe “{id}” tidak dikenal', { id }));

  const s = standards();
  const material = opts.material || s.material || 'aluminium';
  const process = processOf(opts.process || s.process);
  const strength = STRENGTH[material] || STRENGTH.custom;

  const v = {};
  for (const f of arch.fields) {
    const raw = values[f.key];
    if (f.kind === 'bool') { v[f.key] = !!raw; continue; }
    if (f.kind === 'select') { v[f.key] = f.options.includes(raw) ? raw : f.def; continue; }
    const n = Number(raw);
    v[f.key] = Number.isFinite(n) ? clamp(n, f.min, f.max) : f.def;
  }

  const ctx = {
    material,
    matLabel: MATERIALS[material]?.name || material,
    yield: strength.yield,
    process,
    lim: limits(process),
    round: (x) => Math.round(x * 100) / 100,
  };

  const out = arch.build(v, ctx);
  const warnings = [];

  if (material === 'concrete' || material === 'rubber' || material === 'glass') {
    warnings.push(isi('{material} bukan material struktural dalam arti yang diandaikan perhitungan ini. Angka di bawah adalah aritmetika, bukan rekayasa.', { material: ctx.matLabel }));
  }
  if (material === 'pla' || material === 'abs' || material === 'nylon') {
    warnings.push('Plastik cetak jauh lebih lemah melintang layer daripada searah layer, dan merayap di bawah beban tetap. Orientasi di atas build plate sama pentingnya dengan ketebalan di sini.');
  }
  if (v.sf != null && v.sf < 1.5) {
    warnings.push(isi('Faktor keamanan {sf} tidak menyisakan apa pun untuk variasi material, konsentrasi tegangan, atau beban yang ternyata lebih besar dari dugaan Anda.', { sf: v.sf }));
  }

  return {
    id,
    label: arch.label,
    material,
    process: process.label,
    params: out.params.map(([name, value, note]) => ({ name, value, note })),
    features: out.features,
    rationale: out.rationale,
    warnings,
    strengthNote: `${strength.label}, ${strength.yield} MPa yield.`,
  };
}

/**
 * The disclaimer written into every generated document.
 * It lives in the document rather than only in a dialog because a dialog is
 * dismissed once and the file outlives it.
 */
export function briefNotes(result, values) {
  const answers = Object.entries(values).map(([k, x]) => `${k}=${x}`).join(', ');
  return [
    isi('Dihasilkan dari sebuah design brief: {label}.', { label: result.label }),
    `Requirements: ${answers}`,
    `Material: ${result.material} (${result.strengthNote})`,
    `Process assumed: ${result.process}`,
    '',
    'Sizing:',
    ...result.rationale.map(r => `  - ${r}`),
    ...(result.warnings.length ? ['', 'Peringatan:', ...result.warnings.map(w => `  - ${w}`)] : []),
    '',
    'Ini perhitungan tertutup dari buku teks pada penampang ideal. Tidak memperhitungkan',
    'konsentrasi tegangan, kelelahan, buckling, impak, suhu, atau syarat batas nyata,',
    'dan bukan pengganti analisis atau tanda tangan insinyur yang berkualifikasi.',
  ].join('\n');
}

function clamp(v, lo, hi) {
  if (lo != null && v < lo) return lo;
  if (hi != null && v > hi) return hi;
  return v;
}
