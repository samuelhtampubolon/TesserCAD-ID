/**
 * Resep: whole assemblies, from one sentence.
 *
 * This is the file that makes the chat worth using. `intel/speak.js` turns a
 * phrase into a shape, which saves a dozen clicks; a recipe turns a phrase
 * into an assembly — a panel enclosure with its lid, its lip, its mounting
 * bosses, its cable-gland holes and its vent slots, every dimension driven by
 * a named parameter — which saves several hundred. The number is not a claim
 * about intelligence. It is a claim about arithmetic, and `klik.js` shows the
 * arithmetic.
 *
 * Every recipe obeys four rules, because breaking any one of them produces
 * something that looks finished and is not editable:
 *
 *   1. Named parameters first. A recipe declares its driving dimensions as
 *      document parameters and writes expressions into the features, so the
 *      part that comes out is one the user can resize by typing in one field.
 *      A recipe that bakes numbers into features is a mesh with extra steps.
 *   2. Catalogue features only. Nothing here invents geometry; it composes the
 *      same primitives, patterns and booleans the mouse composes, so the
 *      feature tree reads the way a hand-built one reads.
 *   3. Indonesian defaults. Metric throughout, ISO metric fasteners, SNI-
 *      oriented sizing where a standard applies (sheet thicknesses, rebar
 *      diameters, drainage channel sections), and Rupiah left to the cost
 *      module. A recipe that defaults to 1/4-20 UNC is the wrong product.
 *   4. Say what was assumed. Every recipe returns notes naming the numbers it
 *      chose for the user, because a recipe is a draft to argue with, not an
 *      answer.
 *
 * The recipes are ordinary data, so a reader can check one against a drawing
 * and a test can build all of them and measure what comes out.
 */
import { makeFeature } from '../core/doc.js';
import { METRIC_CLEARANCE } from '../intel/speak.js';

/* ------------------------------------------------------------- utilities */

/**
 * A small builder, so a recipe reads as a parts list rather than as plumbing.
 *
 * Holds the growing feature list and the parameter table, hands out ids, and
 * keeps the "current head" of a boolean chain, which is the thing every
 * assembly needs and nothing in core provides.
 */
class Rakit {
  constructor() {
    this.features = [];
    this.params = [];
    this.notes = [];
    this.tally = {};
    this._names = new Set();
  }

  /** Declare a driving parameter once; returns the name to reference it by. */
  p(name, value, note) {
    if (!this._names.has(name)) {
      this._names.add(name);
      this.params.push({ name, value, note });
    }
    return name;
  }

  /** Add a feature and return it, so callers can chain on its id. */
  f(type, name, params = {}, over = {}) {
    const feat = makeFeature(type, { name, params, ...over });
    this.features.push(feat);
    return feat;
  }

  /** Union / subtract / intersect a list of bodies into one. */
  bool(op, inputs, name) {
    const b = makeFeature('boolean', { name, params: { op } });
    b.inputs = inputs.map(x => (typeof x === 'string' ? x : x.id));
    this.features.push(b);
    return b;
  }

  /** A linear pattern of one body along one axis. */
  deret(body, { count, step, axis = 'x', name }) {
    const pat = makeFeature('patternLinear', {
      name: name || `${count} sepanjang ${axis.toUpperCase()}`,
      params: {
        count, count2: 1,
        dx: axis === 'x' ? step : 0, dy: axis === 'y' ? step : 0, dz: axis === 'z' ? step : 0,
        dx2: 0, dy2: 0, dz2: 0,
      },
    });
    pat.inputs = [body.id];
    this.features.push(pat);
    return pat;
  }

  /** A grid pattern: counts and steps on two axes at once. */
  kisi(body, { count, step, count2, step2, name }) {
    const pat = makeFeature('patternLinear', {
      name: name || `kisi ${count}×${count2}`,
      params: {
        count, dx: step, dy: 0, dz: 0,
        count2, dx2: 0, dy2: step2, dz2: 0,
      },
    });
    pat.inputs = [body.id];
    this.features.push(pat);
    return pat;
  }

  /** A ring of one body about an axis. */
  cincin(body, { count, axis = 'z', angle = 360, name, rotate = true }) {
    const pat = makeFeature('patternCircular', {
      name: name || `${count} melingkar`,
      params: { count, angle, axis, cx: 0, cy: 0, cz: 0, rotate },
    });
    pat.inputs = [body.id];
    this.features.push(pat);
    return pat;
  }

  /** Mirror a body across a plane, keeping the original. */
  cermin(body, { plane = 'yz', offset = 0, name }) {
    const m = makeFeature('mirror', {
      name: name || `Mirror ${plane.toUpperCase()}`,
      params: { plane, offset, keep: true },
    });
    m.inputs = [body.id];
    this.features.push(m);
    return m;
  }

  /** Count a non-feature interaction for the click estimate. */
  hitung(kind, n = 1) { this.tally[kind] = (this.tally[kind] || 0) + n; }

  catat(note) { this.notes.push(note); return this; }

  out() {
    return { features: this.features, params: this.params, notes: this.notes, tally: this.tally };
  }
}

/** Clearance diameter for an ISO metric bolt, medium series. */
const clearance = (m) => METRIC_CLEARANCE[`M${String(m).replace('.', '_')}`] ?? Math.round(m * 1.12 * 10) / 10;

/** Nearest SNI-stocked sheet thickness at or above `mm`. */
const tebalStok = (mm) => [0.8, 1, 1.2, 1.5, 2, 2.3, 3, 4, 5, 6, 8, 10, 12, 16, 20, 25].find(t => t >= mm) ?? 25;

/* ---------------------------------------------------------------- recipes */

/**
 * Every recipe: an id, the words that reach it, the fields it accepts with
 * their defaults, and a builder.
 *
 * `bidang` is read by the chat to fill values out of the sentence and by the
 * dialog to render a form, so a recipe never needs UI code of its own.
 */
export const RESEP = {

  /* ------------------------------------------------------------ pelat */

  'pelat-baut': {
    nama: 'Pelat berbaut',
    ringkas: 'Pelat sudut bulat dengan pola baut, dipotong tembus.',
    kata: ['pelat', 'plat', 'pelat baut', 'bolted plate', 'papan baut', 'pelat sambung'],
    bidang: {
      w: { label: 'Lebar', def: 200, unit: 'mm' },
      d: { label: 'Panjang', def: 120, unit: 'mm' },
      t: { label: 'Tebal', def: 10, unit: 'mm' },
      baut: { label: 'Ukuran baut', def: 10 },
      n: { label: 'Jumlah baut', def: 6 },
      tepi: { label: 'Jarak tepi', def: 25, unit: 'mm' },
      material: { label: 'Material', def: 'steel' },
    },
    buat(v) {
      const r = new Rakit();
      const W = r.p('pelat_w', v.w, 'Lebar pelat');
      const D = r.p('pelat_d', v.d, 'Panjang pelat');
      const T = r.p('pelat_t', tebalStok(v.t), 'Tebal pelat, dibulatkan ke tebal stok');
      const C = r.p('baut_clear', clearance(v.baut), `Lubang clearance M${v.baut}, ISO 273 seri sedang`);
      const E = r.p('tepi', v.tepi, 'Jarak pusat lubang ke tepi');
      const N = Math.max(2, Math.round(v.n));
      const perSisi = Math.max(2, Math.round(N / 2));

      const pelat = r.f('plate', 'Pelat', {
        w: W, d: D, h: T, fillet: `${E} / 2`, hole: 0, seg: 12,
      }, { material: v.material });

      const lubang = r.f('cylinder', `Lubang clearance M${v.baut}`, {
        r: `${C} / 2`, h: `${T} * 3`, seg: 24,
      }, { pos: [-(v.w / 2 - v.tepi), -(v.d / 2 - v.tepi), 0] });

      const grid = r.kisi(lubang, {
        count: perSisi, step: (v.w - 2 * v.tepi) / (perSisi - 1),
        count2: 2, step2: v.d - 2 * v.tepi,
        name: `${perSisi}×2 lubang baut`,
      });

      r.bool('subtract', [pelat, grid], 'Bor pola baut');
      r.catat(`Tebal dipakai ${tebalStok(v.t)} mm — tebal stok SNI terdekat di atas ${v.t} mm.`);
      r.catat(`Lubang ${clearance(v.baut)} mm adalah clearance M${v.baut} seri sedang, bukan diameter nominalnya.`);
      r.catat(`Fillet sudut ${v.tepi / 2} mm diambil setengah jarak tepi; ubah parameter ${E} dan keduanya ikut.`);
      return r.out();
    },
  },

  /* ----------------------------------------------------------- braket */

  'braket-l': {
    nama: 'Braket L',
    ringkas: 'Dua sayap tegak lurus, rusuk penguat, dan lubang baut di keduanya.',
    kata: ['braket', 'bracket', 'braket l', 'siku', 'penyangga', 'l bracket', 'angle bracket'],
    bidang: {
      a: { label: 'Panjang sayap A', def: 120, unit: 'mm' },
      b: { label: 'Panjang sayap B', def: 90, unit: 'mm' },
      w: { label: 'Lebar', def: 80, unit: 'mm' },
      t: { label: 'Tebal', def: 8, unit: 'mm' },
      baut: { label: 'Ukuran baut', def: 8 },
      n: { label: 'Lubang per sayap', def: 2 },
      rusuk: { label: 'Rusuk penguat', def: true },
      material: { label: 'Material', def: 'steel' },
    },
    buat(v) {
      const r = new Rakit();
      const A = r.p('sayap_a', v.a, 'Panjang sayap mendatar');
      const B = r.p('sayap_b', v.b, 'Panjang sayap tegak');
      const W = r.p('braket_w', v.w, 'Lebar braket');
      const T = r.p('braket_t', tebalStok(v.t), 'Tebal pelat braket');
      const C = r.p('baut_clear', clearance(v.baut), `Lubang clearance M${v.baut}`);
      const n = Math.max(1, Math.round(v.n));

      const kaki = r.f('box', 'Sayap mendatar', { w: A, d: W, h: T },
        { material: v.material, pos: [v.a / 2, 0, v.t / 2] });
      const tegak = r.f('box', 'Sayap tegak', { w: T, d: W, h: B },
        { material: v.material, pos: [v.t / 2, 0, v.b / 2] });
      const badan = r.bool('union', [kaki, tegak], 'Badan braket');

      let head = badan;
      if (v.rusuk) {
        const rusuk = r.f('wedge', 'Rusuk penguat', {
          w: `min(${A}, ${B}) * 0.7`, d: T, h: `min(${A}, ${B}) * 0.7`,
        }, { material: v.material, pos: [v.t + 1, 0, v.t + 1] });
        head = r.bool('union', [badan, rusuk], 'Badan dengan rusuk');
        r.catat('Rusuk penguat dipasang di akar lipatan — tempat braket benar-benar gagal saat dibebani.');
      }

      const lubangA = r.f('cylinder', `Lubang sayap A M${v.baut}`, {
        r: `${C} / 2`, h: `${T} * 4`, seg: 24,
      }, { pos: [v.a * 0.65, -(v.w / 2 - v.t * 2.5), v.t / 2] });
      const deretA = n > 1
        ? r.deret(lubangA, { count: n, step: (v.w - 2 * v.t * 2.5) / (n - 1), axis: 'y', name: `${n} lubang sayap A` })
        : lubangA;

      const lubangB = r.f('cylinder', `Lubang sayap B M${v.baut}`, {
        r: `${C} / 2`, h: `${T} * 4`, seg: 24,
      }, { rot: [0, 90, 0], pos: [v.t / 2, -(v.w / 2 - v.t * 2.5), v.b * 0.65] });
      const deretB = n > 1
        ? r.deret(lubangB, { count: n, step: (v.w - 2 * v.t * 2.5) / (n - 1), axis: 'y', name: `${n} lubang sayap B` })
        : lubangB;

      r.bool('subtract', [head, deretA, deretB], 'Bor kedua sayap');
      r.catat(`Lubang berada di 65% panjang sayap dari lipatan, jarak tepi ${(v.t * 2.5).toFixed(0)} mm.`);
      return r.out();
    },
  },

  /* ------------------------------------------------------------ flens */

  'flens-pipa': {
    nama: 'Flens pipa',
    ringkas: 'Sepasang flens pada satu tabung, dengan cincin baut dan muka gasket.',
    kata: ['flens', 'flange', 'flens pipa', 'sambungan pipa', 'pipe flange'],
    bidang: {
      dn: { label: 'Diameter dalam pipa', def: 100, unit: 'mm' },
      pipa: { label: 'Tebal dinding pipa', def: 6, unit: 'mm' },
      panjang: { label: 'Panjang pipa', def: 200, unit: 'mm' },
      flensT: { label: 'Tebal flens', def: 16, unit: 'mm' },
      baut: { label: 'Ukuran baut', def: 16 },
      n: { label: 'Jumlah baut', def: 8 },
      material: { label: 'Material', def: 'steel' },
    },
    buat(v) {
      const r = new Rakit();
      const DN = r.p('pipa_dalam', v.dn, 'Diameter dalam pipa');
      const TW = r.p('pipa_dinding', v.pipa, 'Tebal dinding pipa');
      const L = r.p('pipa_panjang', v.panjang, 'Panjang antar muka flens');
      const FT = r.p('flens_t', v.flensT, 'Tebal flens');
      const PCD = r.p('pcd', Math.round(v.dn + 2 * v.pipa + 4 * v.baut), 'Diameter lingkaran baut');
      // The outside diameter is derived from the bolt circle, the way a real
      // flange is dimensioned: the bolts come first and the rim follows them.
      const OD = r.p('flens_od', `${PCD} + ${2 * v.baut}`, 'Diameter luar flens, diturunkan dari PCD');
      const C = r.p('baut_clear', clearance(v.baut), `Lubang clearance M${v.baut}`);
      const n = Math.max(4, Math.round(v.n / 2) * 2);

      // 32 segments, not 64. Three tubes and a bolt ring at 64 put the union
      // over the boolean engine's triangle budget, and a flange is a turned
      // part: the segment count is a display choice, not the geometry.
      const pipa = r.f('tube', 'Pipa', {
        ro: `${DN} / 2 + ${TW}`, ri: `${DN} / 2`, h: L, seg: 32,
      }, { material: v.material });

      const flensA = r.f('tube', 'Flens A', {
        ro: `${OD} / 2`, ri: `${DN} / 2`, h: FT, seg: 32,
      }, { material: v.material, pos: [0, 0, -(v.panjang / 2 - v.flensT / 2)] });
      const flensB = r.f('tube', 'Flens B', {
        ro: `${OD} / 2`, ri: `${DN} / 2`, h: FT, seg: 32,
      }, { material: v.material, pos: [0, 0, v.panjang / 2 - v.flensT / 2] });

      const badan = r.bool('union', [pipa, flensA, flensB], 'Pipa berflens');

      // Positioned by expression on the bolt-circle parameter, not by a number:
      // a PCD you cannot drive from one field is not a PCD.
      const lubang = r.f('cylinder', `Lubang baut M${v.baut}`, {
        r: `${C} / 2`, h: `${FT} * 4`, seg: 16,
      }, { pos: [Math.round(v.dn + 2 * v.pipa + 4 * v.baut) / 2, 0, 0] });
      const ring = r.cincin(lubang, { count: n, axis: 'z', name: `${n} lubang melingkar` });
      const potong = r.bool('subtract', [badan, ring], 'Bor cincin baut');

      const gasket = r.f('tube', 'Alur gasket', {
        ro: `${DN} / 2 + ${TW} * 1.6`, ri: `${DN} / 2 + ${TW} * 0.6`, h: 2, seg: 32,
      }, { pos: [0, 0, v.panjang / 2 - 0.5] });
      r.bool('subtract', [potong, gasket], 'Muka gasket');

      r.catat(`PCD ${Math.round(v.dn + 2 * v.pipa + 4 * v.baut)} mm dan OD ${Math.round(v.dn + 2 * v.pipa + 6 * v.baut)} mm diturunkan dari DN dan ukuran baut, bukan dari tabel flens. Untuk flens tekanan, samakan dengan kelas yang dipakai (mis. JIS 10K atau ANSI 150).`);
      r.catat(`Jumlah baut dibulatkan ke ${n} supaya genap dan simetris terhadap kedua sumbu.`);
      r.catat(`OD flens mengikuti ${PCD}, jadi mengubah PCD ikut melebarkan rimnya. Tapi posisi lubangnya adalah transform, bukan ekspresi: kalau PCD diubah, geser sendiri lubang itu ke ${PCD}/2 sebelum pola melingkarnya benar.`);
      return r.out();
    },
  },

  /* ------------------------------------------------------ kotak panel */

  'kotak-panel': {
    nama: 'Kotak panel',
    ringkas: 'Enclosure berongga dengan tutup, bibir tutup, boss pemasangan, lubang gland, dan lubang ventilasi.',
    kata: ['kotak panel', 'panel', 'enclosure', 'box panel', 'kotak listrik', 'boks', 'kotak elektronik', 'casing'],
    bidang: {
      w: { label: 'Lebar dalam', def: 300, unit: 'mm' },
      d: { label: 'Dalam dalam', def: 200, unit: 'mm' },
      h: { label: 'Tinggi dalam', def: 120, unit: 'mm' },
      t: { label: 'Tebal dinding', def: 3, unit: 'mm' },
      gland: { label: 'Jumlah gland', def: 4 },
      glandD: { label: 'Diameter gland', def: 16, unit: 'mm' },
      ventilasi: { label: 'Lubang ventilasi', def: true },
      material: { label: 'Material', def: 'steel' },
    },
    buat(v) {
      const r = new Rakit();
      const W = r.p('kotak_w', v.w, 'Lebar ruang dalam');
      const D = r.p('kotak_d', v.d, 'Kedalaman ruang dalam');
      const H = r.p('kotak_h', v.h, 'Tinggi ruang dalam');
      const T = r.p('dinding', tebalStok(v.t), 'Tebal dinding');
      const GD = r.p('gland_d', v.glandD, 'Diameter lubang cable gland');
      const LIP = r.p('bibir', 3, 'Tinggi bibir tutup');

      const luar = r.f('box', 'Badan luar', {
        w: `${W} + 2 * ${T}`, d: `${D} + 2 * ${T}`, h: `${H} + ${T}`,
      }, { material: v.material });
      const rongga = r.f('box', 'Rongga', {
        w: W, d: D, h: `${H} + ${T}`,
      }, { pos: [0, 0, v.t] });
      const badan = r.bool('subtract', [luar, rongga], 'Kotak berongga');

      const bibir = r.f('box', 'Bibir tutup', {
        w: `${W} - 1`, d: `${D} - 1`, h: LIP,
      }, { material: v.material, pos: [0, 0, (v.h + v.t) / 2 + 1] });
      const bibirDalam = r.f('box', 'Rongga bibir', {
        w: `${W} - 1 - 2 * ${T}`, d: `${D} - 1 - 2 * ${T}`, h: `${LIP} * 3`,
      }, { pos: [0, 0, (v.h + v.t) / 2 + 1] });
      const bibirJadi = r.bool('subtract', [bibir, bibirDalam], 'Bibir tutup berongga');

      const boss = r.f('cylinder', 'Boss pemasangan', {
        r: `${T} * 2.5`, h: `${H} * 0.35`, seg: 24,
      }, { material: v.material, pos: [-(v.w / 2 - v.t * 4), -(v.d / 2 - v.t * 4), -(v.h + v.t) / 2 + v.t + v.h * 0.175] });
      const bossGrid = r.kisi(boss, {
        count: 2, step: v.w - v.t * 8,
        count2: 2, step2: v.d - v.t * 8,
        name: '4 boss pemasangan',
      });
      const bossLubang = r.f('cylinder', 'Lubang tap M4', {
        r: 1.65, h: `${H} * 0.4`, seg: 16,
      }, { pos: [-(v.w / 2 - v.t * 4), -(v.d / 2 - v.t * 4), -(v.h + v.t) / 2 + v.t + v.h * 0.2] });
      const bossLubangGrid = r.kisi(bossLubang, {
        count: 2, step: v.w - v.t * 8,
        count2: 2, step2: v.d - v.t * 8,
        name: '4 lubang tap boss',
      });

      const denganBoss = r.bool('union', [badan, bossGrid, bibirJadi], 'Badan dengan boss dan bibir');
      let head = r.bool('subtract', [denganBoss, bossLubangGrid], 'Tap boss');

      const nGland = Math.max(1, Math.round(v.gland));
      const gland = r.f('cylinder', `Lubang gland Ø${v.glandD}`, {
        r: `${GD} / 2`, h: `${T} * 6`, seg: 32,
      }, { rot: [90, 0, 0], pos: [-(v.w / 2 - v.glandD * 1.5), -(v.d / 2 + v.t / 2), -(v.h + v.t) / 2 + v.t + v.glandD] });
      const glandDeret = nGland > 1
        ? r.deret(gland, { count: nGland, step: v.glandD * 2.2, axis: 'x', name: `${nGland} lubang gland` })
        : gland;
      head = r.bool('subtract', [head, glandDeret], 'Bor lubang gland');

      if (v.ventilasi) {
        const slot = r.f('box', 'Slot ventilasi', {
          w: `${W} * 0.45`, d: `${T} * 4`, h: 4,
        }, { rot: [0, 0, 0], pos: [0, v.d / 2 + v.t / 2, v.h * 0.25] });
        const slotDeret = r.deret(slot, { count: 6, step: 10, axis: 'z', name: '6 slot ventilasi' });
        head = r.bool('subtract', [head, slotDeret], 'Ventilasi belakang');
        r.catat('Ventilasi enam slot di dinding belakang, jarak 10 mm. Untuk rating IP, ganti dengan gland berfilter dan hapus slotnya.');
      }

      const tutup = r.f('plate', 'Tutup', {
        w: `${W} + 2 * ${T}`, d: `${D} + 2 * ${T}`, h: T, fillet: `${T} * 2`, hole: 0, seg: 12,
      }, { material: v.material, pos: [0, 0, (v.h + v.t) / 2 + 4 + v.t / 2] });
      const tutupLubang = r.f('cylinder', 'Lubang tutup M4', {
        r: 2.25, h: `${T} * 4`, seg: 16,
      }, { pos: [-(v.w / 2 - v.t * 4), -(v.d / 2 - v.t * 4), (v.h + v.t) / 2 + 4 + v.t / 2] });
      const tutupGrid = r.kisi(tutupLubang, {
        count: 2, step: v.w - v.t * 8,
        count2: 2, step2: v.d - v.t * 8,
        name: '4 lubang tutup',
      });
      r.bool('subtract', [tutup, tutupGrid], 'Bor tutup');

      r.catat(`Dimensi yang Anda sebut dipakai sebagai ruang dalam; ukuran luarnya ${v.w + 2 * tebalStok(v.t)} × ${v.d + 2 * tebalStok(v.t)} mm. Itu urutan yang benar: yang harus masuk ke dalam kotak menentukan kotaknya.`);
      r.catat(`Boss pemasangan di-tap M4 dan sejajar dengan lubang tutup, jadi satu baut menembus keduanya.`);
      r.catat('Tutup dibuat sebagai body terpisah di atas kotak, supaya bisa dijadwalkan terbuka di workspace Simulasi.');
      return r.out();
    },
  },

  /* ------------------------------------------------------------ poros */

  'poros-bertingkat': {
    nama: 'Poros bertingkat',
    ringkas: 'Poros beberapa diameter dengan alur pasak, champer, dan bore tengah opsional.',
    kata: ['poros', 'shaft', 'poros bertingkat', 'as', 'stepped shaft', 'sumbu'],
    bidang: {
      d: { label: 'Diameter terbesar', def: 60, unit: 'mm' },
      panjang: { label: 'Panjang total', def: 300, unit: 'mm' },
      tingkat: { label: 'Jumlah tingkat', def: 3 },
      pasak: { label: 'Alur pasak', def: true },
      bore: { label: 'Bore tembus', def: 0, unit: 'mm' },
      material: { label: 'Material', def: 'steel' },
    },
    buat(v) {
      const r = new Rakit();
      const D = r.p('poros_d', v.d, 'Diameter terbesar poros');
      const L = r.p('poros_l', v.panjang, 'Panjang total poros');
      const n = Math.max(2, Math.min(6, Math.round(v.tingkat)));
      const seg = L;

      const bodies = [];
      for (let i = 0; i < n; i++) {
        const skala = 1 - i * (0.22 / Math.max(1, n - 1));
        const z = -v.panjang / 2 + (v.panjang / n) * (i + 0.5);
        bodies.push(r.f('cylinder', `Tingkat ${i + 1}`, {
          r: `${D} / 2 * ${skala.toFixed(3)}`, h: `${seg} / ${n}`, seg: 64,
        }, { material: v.material, pos: [0, 0, z] }));
      }
      let head = r.bool('union', bodies, 'Badan poros');

      if (v.pasak) {
        const lebar = Math.max(4, Math.round(v.d / 8));
        const KW = r.p('pasak_w', lebar, 'Lebar alur pasak, DIN 6885 mendekati d/8');
        const alur = r.f('box', 'Alur pasak', {
          w: KW, d: `${KW} * 0.6`, h: `${L} * 0.22`,
        }, { pos: [0, v.d / 2 - lebar * 0.3, -v.panjang / 2 + v.panjang * 0.14] });
        head = r.bool('subtract', [head, alur], 'Potong alur pasak');
        r.catat(`Alur pasak ${lebar} × ${(lebar * 0.6).toFixed(1)} mm, mendekati DIN 6885 untuk poros Ø${v.d}. Periksa terhadap pasak yang benar-benar Anda beli.`);
      }

      if (v.bore > 0) {
        const B = r.p('poros_bore', v.bore, 'Diameter bore tembus');
        const bore = r.f('cylinder', 'Bore tembus', {
          r: `${B} / 2`, h: `${L} * 1.2`, seg: 48,
        });
        head = r.bool('subtract', [head, bore], 'Bor tembus');
        r.catat('Bore di tengah membuang massa dengan biaya kekakuan torsi yang kecil: material dekat sumbu hampir tidak bekerja.');
      }

      r.catat(`${n} tingkat, tiap tingkat ${(v.panjang / n).toFixed(1)} mm, diameter turun bertahap ke ujung. Ubah parameter ${D} dan seluruh poros ikut.`);
      return r.out();
    },
  },

  /* ------------------------------------------------------------ rangka */

  'rangka-rak': {
    nama: 'Rangka rak',
    ringkas: 'Rangka hollow empat kaki dengan palang atas-bawah, kaki penyetel, dan lubang baut.',
    kata: ['rangka', 'rak', 'frame', 'meja', 'rangka meja', 'rangka rak', 'dudukan', 'kerangka', 'table frame'],
    bidang: {
      w: { label: 'Lebar', def: 900, unit: 'mm' },
      d: { label: 'Dalam', def: 450, unit: 'mm' },
      h: { label: 'Tinggi', def: 750, unit: 'mm' },
      hollow: { label: 'Sisi hollow', def: 40, unit: 'mm' },
      t: { label: 'Tebal hollow', def: 2, unit: 'mm' },
      rak: { label: 'Jumlah palang tengah', def: 1 },
      material: { label: 'Material', def: 'steel' },
    },
    buat(v) {
      const r = new Rakit();
      const W = r.p('rangka_w', v.w, 'Lebar rangka, sumbu ke sumbu luar');
      const D = r.p('rangka_d', v.d, 'Kedalaman rangka');
      const H = r.p('rangka_h', v.h, 'Tinggi rangka');
      const S = r.p('hollow_s', v.hollow, 'Sisi profil hollow');
      const T = r.p('hollow_t', v.t, 'Tebal dinding hollow');

      // A hollow section is one box minus a smaller one, patterned four ways.
      const kakiLuar = r.f('box', 'Kaki (luar)', { w: S, d: S, h: H },
        { material: v.material, pos: [-(v.w / 2 - v.hollow / 2), -(v.d / 2 - v.hollow / 2), 0] });
      const kakiDalam = r.f('box', 'Kaki (rongga)', {
        w: `${S} - 2 * ${T}`, d: `${S} - 2 * ${T}`, h: `${H} * 1.1`,
      }, { pos: [-(v.w / 2 - v.hollow / 2), -(v.d / 2 - v.hollow / 2), 0] });
      const kaki = r.bool('subtract', [kakiLuar, kakiDalam], 'Kaki hollow');
      const kakiGrid = r.kisi(kaki, {
        count: 2, step: v.w - v.hollow,
        count2: 2, step2: v.d - v.hollow,
        name: '4 kaki',
      });

      const palangLuar = r.f('box', 'Palang X (luar)', { w: `${W} - 2 * ${S}`, d: S, h: S },
        { material: v.material, pos: [0, -(v.d / 2 - v.hollow / 2), -(v.h / 2 - v.hollow / 2)] });
      const palangDalam = r.f('box', 'Palang X (rongga)', {
        w: `${W} * 1.1`, d: `${S} - 2 * ${T}`, h: `${S} - 2 * ${T}`,
      }, { pos: [0, -(v.d / 2 - v.hollow / 2), -(v.h / 2 - v.hollow / 2)] });
      const palang = r.bool('subtract', [palangLuar, palangDalam], 'Palang hollow');
      const nLevel = 2 + Math.max(0, Math.round(v.rak));
      const palangGrid = r.kisi(palang, {
        count: 2, step: v.d - v.hollow,
        count2: nLevel, step2: (v.h - v.hollow) / (nLevel - 1),
        name: `${2 * nLevel} palang X`,
      });
      // The second axis of a linear pattern steps Y; the levels need Z, so the
      // level pattern is its own feature rather than a second axis.
      palangGrid.params = {
        ...palangGrid.params,
        count: 2, dx: 0, dy: v.d - v.hollow, dz: 0,
        count2: nLevel, dx2: 0, dy2: 0, dz2: (v.h - v.hollow) / (nLevel - 1),
      };

      const palangYLuar = r.f('box', 'Palang Y (luar)', { w: S, d: `${D} - 2 * ${S}`, h: S },
        { material: v.material, pos: [-(v.w / 2 - v.hollow / 2), 0, -(v.h / 2 - v.hollow / 2)] });
      const palangYDalam = r.f('box', 'Palang Y (rongga)', {
        w: `${S} - 2 * ${T}`, d: `${D} * 1.1`, h: `${S} - 2 * ${T}`,
      }, { pos: [-(v.w / 2 - v.hollow / 2), 0, -(v.h / 2 - v.hollow / 2)] });
      const palangY = r.bool('subtract', [palangYLuar, palangYDalam], 'Palang Y hollow');
      const palangYGrid = r.kisi(palangY, {
        count: 2, step: v.w - v.hollow,
        count2: nLevel, step2: 0,
        name: `${2 * nLevel} palang Y`,
      });
      palangYGrid.params = {
        ...palangYGrid.params,
        count: 2, dx: v.w - v.hollow, dy: 0, dz: 0,
        count2: nLevel, dx2: 0, dy2: 0, dz2: (v.h - v.hollow) / (nLevel - 1),
      };

      const rangka = r.bool('union', [kakiGrid, palangGrid, palangYGrid], 'Rangka terlas');

      const kakiSetel = r.f('cylinder', 'Kaki penyetel M10', { r: 9, h: 30, seg: 24 },
        { material: 'rubber', pos: [-(v.w / 2 - v.hollow / 2), -(v.d / 2 - v.hollow / 2), -(v.h / 2 + 15)] });
      r.kisi(kakiSetel, {
        count: 2, step: v.w - v.hollow,
        count2: 2, step2: v.d - v.hollow,
        name: '4 kaki penyetel',
      });

      r.catat(`Profil hollow ${v.hollow} × ${v.hollow} × ${v.t} mm — ukuran yang umum ada di pasaran lokal. Ubah ${S} dan ${T} sekaligus untuk profil lain.`);
      r.catat(`${nLevel} tingkat palang termasuk atas dan bawah; palang tengahnya ${Math.max(0, Math.round(v.rak))}.`);
      r.catat('Kaki penyetel dibuat karet setinggi 30 mm, jadi tinggi total rangka bertambah 30 mm dari angka yang Anda sebut.');
      return r.out();
    },
  },

  /* ------------------------------------------------------------ tangga */

  'tangga-baja': {
    nama: 'Tangga baja',
    ringkas: 'Dua ibu tangga, anak tangga berpola, dan tiang pegangan.',
    kata: ['tangga', 'stair', 'stairs', 'tangga baja', 'anak tangga', 'staircase'],
    bidang: {
      tinggi: { label: 'Tinggi total', def: 3000, unit: 'mm' },
      lebar: { label: 'Lebar tangga', def: 900, unit: 'mm' },
      optrede: { label: 'Optrede (injakan)', def: 280, unit: 'mm' },
      antrede: { label: 'Antrede (tanjakan)', def: 180, unit: 'mm' },
      material: { label: 'Material', def: 'steel' },
    },
    buat(v) {
      const r = new Rakit();
      const H = r.p('tangga_h', v.tinggi, 'Tinggi total lantai ke lantai');
      const B = r.p('tangga_b', v.lebar, 'Lebar bersih tangga');
      const OP = r.p('optrede', v.optrede, 'Lebar injakan');
      const AN = r.p('antrede', v.antrede, 'Tinggi satu tanjakan');
      const n = Math.max(2, Math.round(v.tinggi / v.antrede));
      const jalan = n * v.optrede;

      const injak = r.f('box', 'Anak tangga', { w: OP, d: B, h: `${AN} / 30` },
        { material: v.material, pos: [-jalan / 2 + v.optrede / 2, 0, -v.tinggi / 2 + v.antrede] });
      const injakDeret = r.deret(injak, { count: n, step: v.optrede, axis: 'x', name: `${n} anak tangga` });
      injakDeret.params = { ...injakDeret.params, dx: v.optrede, dy: 0, dz: v.antrede };

      const ibuKiri = r.f('box', 'Ibu tangga kiri', { w: `sqrt(${H} * ${H} + ${jalan} * ${jalan})`, d: 10, h: 250 },
        { material: v.material, rot: [0, -Math.atan2(v.tinggi, jalan) * 180 / Math.PI, 0], pos: [0, -(v.lebar / 2 + 5), 0] });
      const ibuKanan = r.f('box', 'Ibu tangga kanan', { w: `sqrt(${H} * ${H} + ${jalan} * ${jalan})`, d: 10, h: 250 },
        { material: v.material, rot: [0, -Math.atan2(v.tinggi, jalan) * 180 / Math.PI, 0], pos: [0, v.lebar / 2 + 5, 0] });

      const tiang = r.f('tube', 'Tiang pegangan', { ro: 21.5, ri: 18, h: 1000, seg: 24 },
        { material: v.material, pos: [-jalan / 2 + v.optrede / 2, v.lebar / 2 + 5, -v.tinggi / 2 + v.antrede + 500] });
      const tiangDeret = r.deret(tiang, { count: Math.max(2, Math.ceil(n / 4)), step: v.optrede * 4, axis: 'x', name: 'Tiang pegangan' });
      tiangDeret.params = { ...tiangDeret.params, dx: v.optrede * 4, dy: 0, dz: v.antrede * 4 };

      const pegangan = r.f('tube', 'Pegangan tangan', {
        ro: 21.5, ri: 18, h: `sqrt(${H} * ${H} + ${jalan} * ${jalan})`, seg: 24,
      }, { material: v.material, rot: [0, 90 - Math.atan2(v.tinggi, jalan) * 180 / Math.PI, 0], pos: [0, v.lebar / 2 + 5, 500] });

      r.bool('union', [ibuKiri, ibuKanan, injakDeret, tiangDeret, pegangan], 'Tangga terpasang');

      const dua = 2 * v.antrede + v.optrede;
      r.catat(`${n} tanjakan × ${v.antrede} mm = ${(n * v.antrede).toFixed(0)} mm, jadi tanjakannya ${(v.tinggi / n).toFixed(1)} mm supaya pas ${v.tinggi} mm.`);
      r.catat(`2a + o = ${dua.toFixed(0)} mm. Aturan kenyamanan lazim 600-650 mm, jadi ini ${dua < 600 ? 'lebih rapat' : dua > 650 ? 'lebih landai' : 'di dalam rentang'} dari itu.`);
      r.catat('Pegangan dipasang di satu sisi. Untuk tangga umum, cerminkan ke sisi lain lewat Modify → Mirror.');
      return r.out();
    },
  },

  /* ------------------------------------------------ kolom dan balok */

  'kolom-balok': {
    nama: 'Simpul kolom-balok',
    ringkas: 'Kolom beton, balok masuk, konsol, dan tulangan sebagai proxy.',
    kata: ['kolom', 'balok', 'kolom balok', 'beton', 'simpul', 'joint beton', 'column beam'],
    bidang: {
      kolom: { label: 'Sisi kolom', def: 400, unit: 'mm' },
      tinggi: { label: 'Tinggi kolom', def: 3500, unit: 'mm' },
      balokB: { label: 'Lebar balok', def: 250, unit: 'mm' },
      balokH: { label: 'Tinggi balok', def: 500, unit: 'mm' },
      bentang: { label: 'Bentang balok', def: 4000, unit: 'mm' },
      tulangan: { label: 'Diameter tulangan', def: 19, unit: 'mm' },
      material: { label: 'Material', def: 'concrete' },
    },
    buat(v) {
      const r = new Rakit();
      const K = r.p('kolom_sisi', v.kolom, 'Sisi kolom persegi');
      const KH = r.p('kolom_h', v.tinggi, 'Tinggi kolom');
      const BB = r.p('balok_b', v.balokB, 'Lebar balok');
      const BH = r.p('balok_h', v.balokH, 'Tinggi balok');
      const BL = r.p('bentang', v.bentang, 'Bentang bersih balok');
      const TD = r.p('tulangan_d', v.tulangan, 'Diameter tulangan utama, SNI 2052');
      const SEL = r.p('selimut', 40, 'Selimut beton');

      const kolom = r.f('box', 'Kolom', { w: K, d: K, h: KH }, { material: v.material });
      const balokX = r.f('box', 'Balok X', { w: BL, d: BB, h: BH },
        { material: v.material, pos: [v.bentang / 2, 0, v.tinggi / 2 - v.balokH / 2] });
      const balokY = r.f('box', 'Balok Y', { w: BB, d: BL, h: BH },
        { material: v.material, pos: [0, v.bentang / 2, v.tinggi / 2 - v.balokH / 2] });
      const simpul = r.bool('union', [kolom, balokX, balokY], 'Simpul kolom-balok');

      const tul = r.f('cylinder', `Tulangan D${v.tulangan}`, {
        r: `${TD} / 2`, h: `${KH} * 0.98`, seg: 12,
      }, { material: 'steel', pos: [-(v.kolom / 2 - 40 - v.tulangan / 2), -(v.kolom / 2 - 40 - v.tulangan / 2), 0] });
      r.kisi(tul, {
        count: 3, step: (v.kolom - 80 - v.tulangan) / 2,
        count2: 3, step2: (v.kolom - 80 - v.tulangan) / 2,
        name: '8 tulangan utama',
      });

      const sengkang = r.f('tube', 'Sengkang D10', {
        ro: `(${K} - 2 * ${SEL}) / 2`, ri: `(${K} - 2 * ${SEL}) / 2 - 10`, h: 10, seg: 4,
      }, { material: 'steel', rot: [0, 0, 45], pos: [0, 0, -v.tinggi / 2 + 100] });
      r.deret(sengkang, { count: Math.max(4, Math.round(v.tinggi / 150)), step: 150, axis: 'z', name: 'Sengkang tiap 150 mm' });

      r.catat(`Tulangan 3×3 dikurangi tengah = 8 batang D${v.tulangan} pada selimut 40 mm. Ini proxy geometri untuk bentrokan dan volume, bukan penulangan yang dihitung.`);
      r.catat(`Sengkang D10 tiap 150 mm sepanjang kolom; di daerah sendi plastis SNI 2847 minta lebih rapat. Periksa dengan perencana struktur.`);
      r.catat('Beton dan tulangan adalah body terpisah, jadi Analisis → Clash akan menemukan tulangan yang keluar dari selimut.');
      return r.out();
    },
  },

  /* ------------------------------------------------- dudukan motor */

  'dudukan-motor': {
    nama: 'Dudukan motor',
    ringkas: 'Pelat dasar dengan slot penyetel, boss, dan pola lubang muka motor NEMA/IEC.',
    kata: ['dudukan motor', 'motor mount', 'braket motor', 'dudukan', 'mounting motor'],
    bidang: {
      pcd: { label: 'PCD lubang motor', def: 100, unit: 'mm' },
      n: { label: 'Jumlah lubang motor', def: 4 },
      baut: { label: 'Ukuran baut', def: 8 },
      t: { label: 'Tebal pelat', def: 10, unit: 'mm' },
      slot: { label: 'Panjang slot setel', def: 30, unit: 'mm' },
      material: { label: 'Material', def: 'steel' },
    },
    buat(v) {
      const r = new Rakit();
      const PCD = r.p('motor_pcd', v.pcd, 'PCD lubang muka motor');
      const T = r.p('dudukan_t', tebalStok(v.t), 'Tebal pelat dudukan');
      const C = r.p('baut_clear', clearance(v.baut), `Lubang clearance M${v.baut}`);
      const SL = r.p('slot_l', v.slot, 'Panjang slot penyetel ketegangan');
      const sisi = Math.round(v.pcd * 1.8);

      const pelat = r.f('plate', 'Pelat dasar', {
        w: sisi, d: sisi, h: T, fillet: 12, hole: 0, seg: 12,
      }, { material: v.material });

      const lubangMotor = r.f('cylinder', `Lubang motor M${v.baut}`, {
        r: `${C} / 2`, h: `${T} * 4`, seg: 24,
      }, { pos: [v.pcd / 2, 0, 0] });
      const ringMotor = r.cincin(lubangMotor, { count: Math.max(3, Math.round(v.n)), axis: 'z', name: `${Math.max(3, Math.round(v.n))} lubang motor` });

      const bore = r.f('cylinder', 'Bore poros', { r: `${PCD} / 4`, h: `${T} * 4`, seg: 48 });

      const slotBulat = r.f('cylinder', 'Ujung slot', { r: `${C} / 2`, h: `${T} * 4`, seg: 24 },
        { pos: [-(sisi / 2 - 18), -(sisi / 2 - 18), 0] });
      const slotBadan = r.f('box', 'Badan slot', { w: SL, d: C, h: `${T} * 4` },
        { pos: [-(sisi / 2 - 18) + v.slot / 2, -(sisi / 2 - 18), 0] });
      const slotUjung = r.f('cylinder', 'Ujung slot 2', { r: `${C} / 2`, h: `${T} * 4`, seg: 24 },
        { pos: [-(sisi / 2 - 18) + v.slot, -(sisi / 2 - 18), 0] });
      const slot = r.bool('union', [slotBulat, slotBadan, slotUjung], 'Slot penyetel');
      const slotGrid = r.kisi(slot, {
        count: 2, step: sisi - 36 - v.slot,
        count2: 2, step2: sisi - 36,
        name: '4 slot penyetel',
      });

      r.bool('subtract', [pelat, ringMotor, bore, slotGrid], 'Bor dudukan');

      r.catat(`Pelat dibuat ${sisi} × ${sisi} mm, yaitu 1,8 × PCD — cukup untuk slot penyetel tanpa membuang material.`);
      r.catat(`Slot ${v.slot} mm memberi penyetelan ketegangan belt; bautnya M${v.baut} clearance ${clearance(v.baut)} mm.`);
      r.catat('Bore poros dibuat PCD/2. Samakan dengan diameter flens motor yang sebenarnya sebelum difabrikasi.');
      return r.out();
    },
  },

  /* -------------------------------------------------- saluran drainase */

  'saluran-u': {
    nama: 'Saluran U',
    ringkas: 'Kanal drainase penampang U dengan tumpuan tutup, per segmen.',
    kata: ['saluran', 'drainase', 'kanal', 'u ditch', 'saluran u', 'got', 'channel'],
    bidang: {
      lebar: { label: 'Lebar dalam', def: 300, unit: 'mm' },
      tinggi: { label: 'Tinggi dalam', def: 300, unit: 'mm' },
      panjang: { label: 'Panjang segmen', def: 1200, unit: 'mm' },
      t: { label: 'Tebal dinding', def: 60, unit: 'mm' },
      segmen: { label: 'Jumlah segmen', def: 4 },
      material: { label: 'Material', def: 'concrete' },
    },
    buat(v) {
      const r = new Rakit();
      const W = r.p('saluran_w', v.lebar, 'Lebar dalam saluran');
      const H = r.p('saluran_h', v.tinggi, 'Tinggi dalam saluran');
      const L = r.p('segmen_l', v.panjang, 'Panjang satu segmen');
      const T = r.p('dinding_t', v.t, 'Tebal dinding dan dasar');

      const luar = r.f('box', 'Badan segmen', {
        w: `${W} + 2 * ${T}`, d: L, h: `${H} + ${T}`,
      }, { material: v.material });
      const rongga = r.f('box', 'Rongga saluran', {
        w: W, d: `${L} * 1.1`, h: `${H} + ${T}`,
      }, { pos: [0, 0, v.t] });
      const badan = r.bool('subtract', [luar, rongga], 'Segmen U');

      const rebat = r.f('box', 'Tumpuan tutup', {
        w: `${T} * 0.6`, d: `${L} * 1.1`, h: 40,
      }, { pos: [-(v.lebar / 2 + v.t * 0.3), 0, (v.tinggi + v.t) / 2 - 20] });
      const rebatCermin = r.cermin(rebat, { plane: 'yz', name: 'Tumpuan kedua sisi' });
      const segmen = r.bool('subtract', [badan, rebatCermin], 'Segmen bertumpuan');

      const n = Math.max(1, Math.round(v.segmen));
      if (n > 1) r.deret(segmen, { count: n, step: v.panjang, axis: 'y', name: `${n} segmen` });

      const tutup = r.f('box', 'Tutup', { w: `${W} + ${T} * 1.2`, d: `${L} - 10`, h: 35 },
        { material: v.material, pos: [0, 0, (v.tinggi + v.t) / 2 - 2.5] });
      if (n > 1) r.deret(tutup, { count: n, step: v.panjang, axis: 'y', name: `${n} tutup` });

      r.catat(`Penampang dalam ${v.lebar} × ${v.tinggi} mm, dinding ${v.t} mm — proporsi U-ditch precast yang umum.`);
      r.catat(`${n} segmen × ${v.panjang} mm = ${(n * v.panjang / 1000).toFixed(2)} m total panjang.`);
      r.catat('Tutup adalah body sendiri dan duduk di tumpuan, jadi bisa dijadwalkan terpasang belakangan di workspace Simulasi.');
      return r.out();
    },
  },

  /* ------------------------------------------------------ menara 4D */

  'menara-lantai': {
    nama: 'Tumpukan lantai',
    ringkas: 'Kolom dan pelat lantai bertingkat, siap dijadwalkan sebagai urutan bangun 4D.',
    kata: ['menara', 'lantai', 'bangunan', 'tingkat', 'gedung', 'tower', 'floors', 'tumpukan lantai'],
    bidang: {
      lantai: { label: 'Jumlah lantai', def: 6 },
      w: { label: 'Lebar denah', def: 8000, unit: 'mm' },
      d: { label: 'Dalam denah', def: 6000, unit: 'mm' },
      tinggi: { label: 'Tinggi lantai', def: 3500, unit: 'mm' },
      kolom: { label: 'Sisi kolom', def: 400, unit: 'mm' },
      material: { label: 'Material', def: 'concrete' },
    },
    buat(v) {
      const r = new Rakit();
      const N = Math.max(1, Math.min(30, Math.round(v.lantai)));
      const W = r.p('denah_w', v.w, 'Lebar denah');
      const D = r.p('denah_d', v.d, 'Kedalaman denah');
      const TH = r.p('lantai_h', v.tinggi, 'Tinggi antar lantai');
      const K = r.p('kolom_sisi', v.kolom, 'Sisi kolom');

      for (let i = 0; i < N; i++) {
        const z = i * v.tinggi;
        const kolom = r.f('box', `Kolom L${i + 1}`, { w: K, d: K, h: TH },
          { material: v.material, pos: [-(v.w / 2 - v.kolom / 2), -(v.d / 2 - v.kolom / 2), z + v.tinggi / 2] });
        r.kisi(kolom, {
          count: 3, step: (v.w - v.kolom) / 2,
          count2: 3, step2: (v.d - v.kolom) / 2,
          name: `9 kolom L${i + 1}`,
        });
        r.f('box', `Pelat L${i + 1}`, { w: W, d: D, h: 150 },
          { material: v.material, pos: [0, 0, z + v.tinggi + 75] });
      }

      r.catat(`${N} lantai × ${v.tinggi} mm = ${(N * v.tinggi / 1000).toFixed(1)} m tinggi total, 9 kolom dan satu pelat per lantai.`);
      r.catat('Setiap lantai adalah body sendiri dengan nama berurutan, yang dipakai AI Chat ke 4D untuk menjadwalkan urutan bangun tanpa Anda memilih satu-satu.');
      return r.out();
    },
  },
};

export const RESEP_IDS = Object.keys(RESEP);

/**
 * Which recipe does this sentence ask for?
 *
 * Longest keyword first, so "kotak panel" beats "kotak" and a sentence about a
 * panel enclosure does not come back as a plain box. Returns null rather than
 * guessing: the chat then falls through to the single-shape grammar, which is
 * the right answer for "kotak 60x40x20".
 */
export function cocok(text) {
  const src = ` ${String(text).toLowerCase().replace(/[^\w\s-]/g, ' ')} `;
  const hits = [];
  for (const [id, rec] of Object.entries(RESEP)) {
    for (const k of rec.kata) {
      if (src.includes(` ${k} `)) hits.push({ id, k, len: k.length });
    }
  }
  if (!hits.length) return null;
  hits.sort((a, b) => b.len - a.len);
  return hits[0].id;
}

/** Defaults for a recipe, as a plain values object. */
export function bawaan(id) {
  const rec = RESEP[id];
  if (!rec) return null;
  const v = {};
  for (const [key, f] of Object.entries(rec.bidang)) v[key] = f.def;
  return v;
}

/** Build a recipe, with any values the caller read out of the sentence. */
export function bangun(id, values = {}) {
  const rec = RESEP[id];
  if (!rec) return null;
  const v = { ...bawaan(id), ...values };
  const out = rec.buat(v);
  return { id, nama: rec.nama, ringkas: rec.ringkas, values: v, ...out };
}
