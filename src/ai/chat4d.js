/**
 * AI Chat ke 4D: a conversation that sequences and animates the model.
 *
 * The fourth dimension in this studio is time, and the three things people
 * actually want from it are a construction sequence, a mechanism that turns,
 * and a drop test. All three are already in `sim/sim.js`; what is expensive is
 * setting them up. A twelve-storey sequence is twelve bodies to find in the
 * tree, twelve start times, twelve durations and twelve appearance modes, and
 * every one of those is a click. Saying "jadwalkan tiap lantai tiga hari, dari
 * bawah ke atas" is one sentence.
 *
 * So the ceiling here is lower than on the 3D side and that is honest: a 4D
 * setup is worth tens of clicks, not hundreds. The numbers this reports come
 * from the same model in `klik.js`, and a full session — sequence, a motor,
 * gravity, a couple of keyframes, duration and frame rate — lands in the
 * sixties and seventies rather than the hundreds.
 *
 * Two things make it work on a real document rather than on a toy:
 *
 *   It finds its own targets. "jadwalkan lantainya" resolves against the
 *   feature names in the open document, in tree order, so the bodies a recipe
 *   produced with names like "Pelat L1 … Pelat L12" sequence in the right
 *   order without the user selecting anything.
 *
 *   It never silently applies. Like the 3D chat, every turn returns a patch
 *   that has not been applied. The simulator is the one place in a CAD
 *   application where a wrong guess is invisible until you press play.
 *
 * No language model, no network, no telemetry — the same promise the rest of
 * the application makes. DOM-free, so tools/tests/chat4d.mjs drives it in Node.
 */
import { SCHEDULE_MODES, MOTOR_TYPES, EASINGS } from '../sim/sim.js';
import { klikProgram, klikKalimat } from './klik.js';
import { nilai, jumlah, satuanNilai, panjangPertama, pecah, ada, pertama, angkaKata, WAKTU } from './lex.js';

/* ------------------------------------------------------------- vocabulary */

const YA = ['ya', 'iya', 'oke', 'ok', 'sip', 'lanjut', 'terapkan', 'jalankan', 'gas', 'setuju', 'boleh', 'yes', 'apply'];
const TIDAK = ['tidak', 'jangan', 'batal', 'batalkan', 'stop', 'gak', 'nggak', 'no', 'cancel'];
const BANTUAN = ['bantuan', 'bantu', 'help', 'apa saja', 'bisa apa', 'contoh', 'daftar'];

const KATA_JADWAL = ['jadwal', 'jadwalkan', 'urutan', 'urutkan', 'sekuens', 'bangun', 'konstruksi', 'tahapan', 'schedule', 'sequence'];
const KATA_MOTOR = ['motor', 'putar', 'putaran', 'berputar', 'rpm', 'ayun', 'ayunkan', 'osilasi', 'bolak-balik', 'orbit', 'spin'];
const KATA_FISIKA = ['fisika', 'gravitasi', 'jatuh', 'jatuhkan', 'tabrak', 'tumbuk', 'dinamika', 'rigid', 'physics', 'gravity', 'drop'];
const KATA_KEYFRAME = ['keyframe', 'kunci', 'animasikan', 'animasi', 'gerakkan', 'angkat', 'turunkan', 'geser', 'buka', 'tutup'];
const KATA_DURASI = ['durasi', 'lama', 'panjang animasi', 'total waktu', 'duration'];
const KATA_FPS = ['fps', 'frame per detik', 'frame rate', 'laju frame'];
const KATA_REKAM = ['rekam', 'rekaman', 'video', 'webm', 'record'];
const KATA_BERSIH = ['bersihkan', 'hapus jadwal', 'kosongkan jadwal', 'reset jadwal', 'hapus animasi'];

/** Direction words, for a sequence that runs down or a motor that reverses. */
const TURUN = ['dari atas', 'atas ke bawah', 'turun', 'terbalik', 'reverse', 'descending'];
const BALIK = ['berlawanan', 'kebalikan', 'anticlockwise', 'ccw', 'kiri'];

/** Appearance modes, by the words people use for them. */
const MODE = {
  fade: ['memudar', 'fade', 'muncul perlahan', 'transparan'],
  grow: ['tumbuh', 'grow', 'membesar', 'dari tengah'],
  riseZ: ['naik', 'rise', 'terangkat', 'muncul dari bawah'],
  dropZ: ['jatuh', 'drop', 'turun dari atas', 'dijatuhkan'],
  slideX: ['geser x', 'masuk dari samping', 'slide x'],
  slideY: ['geser y', 'masuk dari depan', 'slide y'],
  build: ['cor', 'bertahap', 'sapuan', 'build up', 'dicor'],
  none: ['langsung', 'muncul', 'tanpa efek', 'instan'],
};

/** Words that name a group of bodies, and what they match in a feature name. */
const KELOMPOK = [
  ['lantai', /lantai|pelat l\d|slab|floor/i],
  ['kolom', /kolom|column|tiang/i],
  ['balok', /balok|beam/i],
  ['pelat', /pelat|plate|slab/i],
  ['tutup', /tutup|lid|cover/i],
  ['segmen', /segmen|segment/i],
  ['poros', /poros|shaft|as\b/i],
  ['anak tangga', /anak tangga|injak|tread/i],
  ['baut', /baut|bolt|lubang/i],
  ['rangka', /rangka|kaki|palang|frame/i],
  ['dinding', /dinding|wall|badan/i],
  ['tulangan', /tulangan|sengkang|rebar/i],
];

/* ---------------------------------------------------------------- session */

export function sesiBaru() {
  return { turns: [], patch: null, klikTotal: 0, diterapkan: 0 };
}

export function sapaan() {
  return [
    'Katakan bagaimana waktunya berjalan. Saya rencanakan dulu, Anda yang menyetujui.',
    'Bisa: urutan bangun 4D, motor, keyframe, fisika rigid-body, durasi dan laju frame.',
    'Targetnya saya cari sendiri dari nama fitur di dokumen — "jadwalkan lantainya" cukup.',
    'Semuanya lokal. Tidak ada yang dikirim ke mana pun.',
  ];
}

export const CONTOH = [
  'jadwalkan urutan bangun, tiap lantai 3 hari, dari bawah ke atas',
  'jadwalkan kolomnya dua hari lalu pelatnya satu hari',
  'putar porosnya 120 rpm sumbu z',
  'ayun tutupnya 30 derajat 0,5 hz',
  'aktifkan fisika, jatuhkan dari 500 mm, restitusi 0,3 gesekan 0,5',
  'angkat tutupnya 200 mm dalam 2 detik',
  'durasi 30 detik, 24 fps',
  'urutan bangun dengan mode cor bertahap',
  'bersihkan jadwalnya',
  'rekam videonya',
];

/* ----------------------------------------------------------- target lookup */

/**
 * Which bodies does this sentence mean?
 *
 * In tree order, always, because a construction sequence that runs in a
 * different order from the tree is a sequence nobody can check against the
 * drawing. Falls back to the selection, then to every visible solid, and says
 * which of those it used so a wrong guess is visible in the transcript.
 */
export function pilihTarget(doc, text, selection = [], { semua = true } = {}) {
  const features = (doc?.features || []).filter(f => !f.suppressed && f.type !== 'mesh');
  const src = String(text).toLowerCase();

  // `-nya` is how Indonesian says "its": "jadwalkan lantainya" is the same
  // request as "jadwalkan lantai", and a whole-word match misses it.
  const disebut = (word) => {
    const w = word.replace(/\s+/g, '\\s+');
    return new RegExp(`(?:^|[^a-z])${w}(?:nya|-nya|nya,|\\b)`).test(src);
  };

  for (const [word, re] of KELOMPOK) {
    if (!disebut(word) && !word.split(' ').some(disebut)) continue;
    const hit = features.filter(f => re.test(f.name || ''));
    if (hit.length) return { ids: hit.map(f => f.id), nama: word, dari: 'nama fitur' };
  }
  if (selection.length) {
    return { ids: [...selection], nama: `${selection.length} body terpilih`, dari: 'pilihan' };
  }
  if (!semua) return { ids: [], nama: 'tidak ada', dari: 'tidak disebut' };
  return features.length
    ? { ids: features.map(f => f.id), nama: 'semua body', dari: 'seluruh dokumen' }
    : { ids: [], nama: 'tidak ada', dari: 'dokumen kosong' };
}

/** The mode word in the sentence, or the default for a construction sequence. */
function modeDari(text, def = 'grow') {
  for (const [key, words] of Object.entries(MODE)) {
    if (ada(text, words)) return key;
  }
  return def;
}

/** Seconds from a phrase like "3 hari", "2 detik", "90 menit". */
function durasiDari(text, def = null) {
  const src = angkaKata(text).toLowerCase();
  const alt = Object.keys(WAKTU).sort((a, b) => b.length - a.length).join('|');
  const m = src.match(new RegExp(`(-?\\d+(?:[.,]\\d+)?)\\s*(${alt})\\b`));
  if (!m) return def;
  return parseFloat(m[1].replace(',', '.')) * WAKTU[m[2]];
}

/* ------------------------------------------------------------ the planners */

/**
 * A construction sequence.
 *
 * Every body gets a start and a duration, laid end to end in tree order. The
 * unit the user speaks in is preserved as a ratio rather than as seconds: "3
 * hari per lantai" becomes equal slots that fill the animation's duration, so
 * the timeline stays watchable while the label still says three days. That is
 * how 4D BIM tools present it and it is the only presentation that is both
 * honest and usable — nobody watches a fifteen-minute animation of a tower.
 */
function rencanaJadwal(doc, text, selection) {
  const t = pilihTarget(doc, text, selection);
  if (!t.ids.length) return null;

  const perItem = durasiDari(text) ?? 1;
  const mode = modeDari(text, 'grow');
  const terbalik = ada(text, TURUN);
  const ids = terbalik ? [...t.ids].reverse() : t.ids;

  // Compress real time onto a watchable timeline: the whole sequence occupies
  // the animation duration, and each slot keeps its share of it.
  const total = perItem * ids.length;
  const detikTimeline = Math.min(60, Math.max(6, ids.length * 0.8));
  const skala = detikTimeline / total;

  const items = {};
  ids.forEach((id, i) => {
    items[id] = {
      start: +(i * perItem * skala).toFixed(3),
      dur: +(perItem * skala).toFixed(3),
      mode,
      enabled: true,
    };
  });

  const satuan = satuanKata(text, perItem);
  return {
    kind: 'jadwal',
    sim: { schedule: { enabled: true, items }, durasiSaran: +detikTimeline.toFixed(2) },
    tally: { jadwal: ids.length, dinamika: 0 },
    understood: [
      `${ids.length} body (${t.nama}, dari ${t.dari}) dijadwalkan berurutan`,
      `${satuan} per body, mode “${labelMode(mode)}”${terbalik ? ', urutan dibalik dari atas ke bawah' : ''}`,
      `timeline ${detikTimeline.toFixed(1)} detik untuk ${satuanTotal(text, total)}`,
    ],
    notes: [
      `Waktu nyata dipetakan ke timeline: 1 detik animasi ≈ ${rasioKata(text, 1 / skala)}. Angka di panel jadwal tetap bisa Anda ubah per body.`,
      'Body tetap tersembunyi sampai slotnya dimulai, jadi geser playhead untuk melihat progres di tanggal mana pun.',
    ],
  };
}

const satuanKata = (text, detik) => {
  const src = angkaKata(String(text).toLowerCase());
  const m = src.match(/(\d+(?:[.,]\d+)?)\s*(hari|minggu|bulan|jam|menit|detik)/);
  return m ? `${m[1]} ${m[2]}` : `${detik} detik`;
};
const satuanTotal = (text, detik) => {
  const src = String(text).toLowerCase();
  if (src.includes('hari')) return `${Math.round(detik / 86400)} hari`;
  if (src.includes('minggu')) return `${Math.round(detik / 604800)} minggu`;
  if (src.includes('bulan')) return `${Math.round(detik / 2592000)} bulan`;
  return `${Math.round(detik)} detik`;
};
/** A compression ratio, said in the unit the user spoke in. */
const rasioKata = (text, detik) => {
  const src = String(text).toLowerCase();
  if (src.includes('bulan')) return `${(detik / 2592000).toFixed(2)} bulan`;
  if (src.includes('minggu')) return `${(detik / 604800).toFixed(2)} minggu`;
  if (src.includes('hari')) return `${(detik / 86400).toFixed(2)} hari`;
  if (src.includes('jam')) return `${(detik / 3600).toFixed(2)} jam`;
  if (src.includes('menit')) return `${(detik / 60).toFixed(2)} menit`;
  return `${detik.toFixed(2)} detik`;
};

const labelMode = (key) => (SCHEDULE_MODES.find(([k]) => k === key) || [key, key])[1];
const labelMotor = (key) => (MOTOR_TYPES.find(([k]) => k === key) || [key, key])[1];

/**
 * A motor.
 *
 * Analytic drivers, so they run exactly on schedule regardless of forces,
 * which is what a mechanism study wants. RPM is converted to degrees per
 * second here rather than left to the user, because rpm is the number written
 * on the motor's nameplate and °/s is the number the simulator takes.
 */
function rencanaMotor(doc, text, selection) {
  const t = pilihTarget(doc, text, selection, { semua: false });
  if (!t.ids.length) {
    return {
      kind: 'tanya',
      tanya: 'Motor dipasang pada body tertentu, bukan pada semuanya. Sebut namanya — "putar porosnya", "putar rodanya" — atau pilih body-nya di pohon fitur dulu.',
    };
  }

  const rpm = satuanNilai('rpm', text) ?? nilai('rpm', text, { mm: false });
  const derajat = satuanNilai('derajat', text) ?? nilai('derajat', text, { mm: false }) ?? nilai('deg', text, { mm: false });
  const hz = satuanNilai('hz', text) ?? nilai('hz', text, { mm: false }) ?? nilai('frekuensi', text, { mm: false });
  const amp = satuanNilai('amplitudo', text) ?? nilai('amplitudo', text, { mm: false }) ?? derajat;

  const type = ada(text, ['ayun', 'ayunkan', 'osilasi', 'oscillate']) ? 'oscillate'
    : ada(text, ['bolak-balik', 'bolak balik', 'reciprocate', 'maju mundur']) ? 'reciprocate'
      : ada(text, ['orbit', 'mengorbit']) ? 'orbit'
        : 'spin';

  const axis = pertama(text, ['sumbu x', 'sumbu y', 'sumbu z'])?.slice(-1)
    || (ada(text, ['mendatar', 'horizontal']) ? 'x' : 'z');
  const rate = (rpm != null ? rpm * 6 : derajat ?? 90) * (ada(text, BALIK) ? -1 : 1);

  const bodies = {};
  for (const id of t.ids) {
    bodies[id] = {
      mass: 1, static: true, vel: [0, 0, 0], spin: [0, 0, 0],
      bounce: 0.35, friction: 0.4, enabled: true,
      motor: { type, axis, rate, amp: amp ?? 30, freq: hz ?? 0.5, phase: 0, face: false },
    };
  }

  return {
    kind: 'motor',
    sim: { dynamics: { enabled: true, bodies } },
    tally: { motor: t.ids.length, dinamika: 1 },
    understood: [
      `motor “${labelMotor(type)}” pada ${t.ids.length} body (${t.nama})`,
      `sumbu ${axis.toUpperCase()}, ${Math.abs(rate).toFixed(0)}°/s${rpm != null ? ` (${rpm} rpm)` : ''}${rate < 0 ? ', arah berlawanan' : ''}`,
      ...(type === 'oscillate' || type === 'reciprocate' ? [`amplitudo ${amp ?? 30}, frekuensi ${hz ?? 0.5} Hz`] : []),
    ],
    notes: [
      'Motor adalah penggerak analitik: ia berjalan tepat sesuai jadwal tanpa peduli gaya, yang justru diinginkan untuk mekanisme.',
      'Body-nya dibuat statis supaya gravitasi tidak menjatuhkannya sambil berputar. Matikan “statis” di panel kanan kalau memang ingin ikut jatuh.',
    ],
  };
}

/**
 * Rigid-body physics.
 *
 * Collisions use each body's bounding sphere — fast, deterministic, and good
 * enough for drop tests, conveyors and packing studies. Saying that plainly is
 * part of the feature: a user who thinks this is FEA will trust a number it
 * never claimed to produce.
 */
function rencanaFisika(doc, text, selection) {
  const t = pilihTarget(doc, text, selection);
  if (!t.ids.length) return null;

  const tinggi = nilai('dari', text) ?? nilai('ketinggian', text) ?? nilai('jatuhkan', text);
  const bounce = nilai('restitusi', text, { mm: false }) ?? nilai('kepegasan', text, { mm: false });
  const friction = nilai('gesekan', text, { mm: false }) ?? nilai('friksi', text, { mm: false });
  const massa = nilai('massa', text, { mm: false }) ?? nilai('berat', text, { mm: false });
  const gravitasi = nilai('gravitasi', text, { mm: false });

  const bodies = {};
  for (const id of t.ids) {
    bodies[id] = {
      mass: massa ?? 1,
      static: false,
      vel: [0, 0, 0],
      spin: [0, 0, 0],
      bounce: bounce ?? 0.35,
      friction: friction ?? 0.4,
      enabled: true,
    };
  }

  const sim = {
    dynamics: {
      enabled: true,
      ground: true,
      groundZ: 0,
      gravity: gravitasi != null ? -Math.abs(gravitasi) * 1000 : -9810,
      bodies,
    },
    schedule: { enabled: false },
  };

  const understood = [
    `fisika rigid-body aktif untuk ${t.ids.length} body (${t.nama})`,
    `restitusi ${bounce ?? 0.35}, gesekan ${friction ?? 0.4}, massa ${massa ?? 1} kg per body`,
  ];
  const notes = [
    'Tabrakan memakai bounding-sphere tiap body: cepat, deterministik, dan cukup untuk uji jatuh, konveyor, dan studi packing. Ini bukan analisis tegangan.',
    'Urutan bangun dimatikan karena keduanya memperebutkan posisi body yang sama.',
  ];
  if (tinggi != null) {
    sim.angkat = { ids: t.ids, dz: tinggi };
    understood.push(`dijatuhkan dari ${tinggi} mm di atas lantai`);
    notes.push(`Body diangkat ${tinggi} mm lewat transform sebelum simulasi mulai, sehingga jatuhnya terukur dari ketinggian itu.`);
  }

  return { kind: 'fisika', sim, tally: { dinamika: 1, jadwal: 0, param: t.ids.length }, understood, notes };
}

/**
 * Keyframes for one movement.
 *
 * Two keys, not one: the property's value now and its value at the end of the
 * move. A single key animates nothing, which is the mistake this saves.
 */
function rencanaKeyframe(doc, text, selection) {
  const t = pilihTarget(doc, text, selection, { semua: false });
  if (!t.ids.length) {
    return {
      kind: 'tanya',
      tanya: 'Keyframe dipasang pada body tertentu. Sebut namanya — "angkat tutupnya 200 mm" — atau pilih body-nya dulu.',
    };
  }

  const jarak = nilai('angkat', text) ?? nilai('turunkan', text) ?? nilai('geser', text)
    ?? nilai('naik', text) ?? nilai('sejauh', text) ?? panjangPertama(text);
  const sudut = nilai('putar', text, { mm: false }) ?? nilai('buka', text, { mm: false });
  const detik = durasiDari(text, 2);
  const mulai = nilai('detik', text, { mm: false }) ?? 0;

  const naik = ada(text, ['angkat', 'naik', 'terangkat', 'buka']);
  const prop = sudut != null && jarak == null ? 'rz'
    : ada(text, ['geser y', 'ke depan', 'ke belakang']) ? 'py'
      : ada(text, ['geser x', 'ke samping', 'ke kanan', 'ke kiri']) ? 'px'
        : 'pz';
  const nilaiAkhir = sudut != null && jarak == null ? sudut : (naik ? 1 : -1) * Math.abs(jarak ?? 100);
  const ease = ada(text, ['halus', 'smooth', 'perlahan']) ? 'easeInOut'
    : ada(text, ['memantul', 'bounce']) ? 'bounce' : 'smooth';

  const tracks = {};
  for (const id of t.ids) {
    tracks[id] = {
      props: {
        [prop]: [
          { t: +mulai.toFixed(3), v: prop.startsWith('s') ? 1 : 0, ease },
          { t: +(mulai + detik).toFixed(3), v: +nilaiAkhir.toFixed(3), ease },
        ],
      },
    };
  }

  return {
    kind: 'keyframe',
    sim: { tracks, durasiSaran: Math.max(detik + mulai + 1, 6) },
    tally: { keyframe: t.ids.length * 2 },
    understood: [
      `${t.ids.length} body (${t.nama}) dianimasikan pada properti ${prop}`,
      `dari 0 ke ${nilaiAkhir.toFixed(1)}${prop.startsWith('r') ? '°' : ' mm'} antara detik ${mulai} dan ${(mulai + detik).toFixed(1)}`,
      `easing “${ease}”, salah satu dari ${Object.keys(EASINGS).length} kurva yang tersedia`,
    ],
    notes: ['Dua keyframe dipasang, bukan satu: satu kunci tidak menganimasikan apa pun.'],
  };
}

/* -------------------------------------------------------------- one turn */

/**
 * Take one user message and answer it.
 *
 * Clauses are handled one at a time and their patches merged, so "durasi 30
 * detik, jadwalkan lantainya 3 hari, lalu putar porosnya 60 rpm" is one turn
 * and one undo entry.
 */
export function respon(sesi, text, ctx = {}) {
  const raw = String(text || '').trim();
  if (!raw) return balas(sesi, { aksi: 'tolak', ucapan: ['Belum ada yang diketik.'] });
  sesi.turns.push({ dari: 'pengguna', teks: raw });
  const low = raw.toLowerCase();
  const doc = ctx.doc;
  const selection = ctx.selection || [];

  if (ada(low, BANTUAN)) {
    return balas(sesi, { aksi: 'jawab', ucapan: [...sapaan(), 'Contoh:', ...CONTOH.map(c => `· ${c}`)] });
  }
  if (sesi.patch && ada(low, YA) && raw.split(/\s+/).length <= 4) {
    const patch = sesi.patch;
    sesi.patch = null;
    sesi.klikTotal += patch.klik;
    sesi.diterapkan += 1;
    return balas(sesi, {
      aksi: 'terapkan', sim: patch.sim, angkat: patch.sim?.angkat || null,
      ucapan: ['Diterapkan. Tekan Space untuk memutarnya; Undo mengembalikan seluruh turn ini.', klikKalimat(sesi.klikTotal)],
    });
  }
  if (sesi.patch && ada(low, TIDAK)) {
    sesi.patch = null;
    return balas(sesi, { aksi: 'jawab', ucapan: ['Dibatalkan. Timeline tidak disentuh.'] });
  }
  if (ada(low, KATA_REKAM)) {
    return balas(sesi, {
      aksi: 'jawab',
      ucapan: [
        'Rekaman memutar ulang timeline frame demi frame dan menyimpan WebM dengan encoder peramban.',
        'Jalankan lewat Simulasi → Rekam animasi, dan biarkan tab ini di depan sampai selesai.',
      ],
    });
  }
  if (ada(low, KATA_BERSIH)) {
    return balas(sesi, {
      aksi: 'rencana',
      sim: { schedule: { enabled: false, items: {} }, tracks: {} },
      klik: 8,
      understood: ['jadwal dan keyframe dikosongkan'],
      ucapan: ['Saya kosongkan urutan bangun dan seluruh keyframe. Dinamika dan body-nya tidak disentuh.',
        'Katakan "ya" untuk menerapkannya.'],
    }, { simpan: true });
  }

  if (!doc?.features?.length) {
    return balas(sesi, {
      aksi: 'tolak',
      ucapan: ['Dokumennya masih kosong, jadi belum ada yang bisa dijadwalkan atau digerakkan.',
        'Bangun dulu sesuatu — AI Chat ke 3D bisa melakukannya dalam satu kalimat.'],
    });
  }

  const gabung = { sim: {}, tally: {}, understood: [], notes: [] };
  const ditolak = [];
  const tanya = [];
  let apa = 0;

  for (const k of pecah(raw)) {
    const durasi = nilai('durasi', k, { mm: false }) ?? (ada(k, KATA_DURASI) ? durasiDari(k) : null);
    const fps = ada(k, KATA_FPS) ? (nilai('fps', k, { mm: false }) ?? jumlah('fps', k)) : null;
    if (durasi != null || fps != null) {
      if (durasi != null) { gabung.sim.duration = durasi; gabung.understood.push(`durasi timeline ${durasi} detik`); }
      if (fps != null) { gabung.sim.fps = Math.max(1, Math.min(120, Math.round(fps))); gabung.understood.push(`${gabung.sim.fps} frame per detik`); }
      gabung.tally.param = (gabung.tally.param || 0) + 2;
      apa++;
      if (!ada(k, [...KATA_JADWAL, ...KATA_MOTOR, ...KATA_FISIKA, ...KATA_KEYFRAME])) continue;
    }

    const plan = ada(k, KATA_FISIKA) ? rencanaFisika(doc, k, selection)
      : ada(k, KATA_MOTOR) ? rencanaMotor(doc, k, selection)
        : ada(k, KATA_JADWAL) ? rencanaJadwal(doc, k, selection)
          : ada(k, KATA_KEYFRAME) ? rencanaKeyframe(doc, k, selection)
            : null;

    if (!plan) { ditolak.push(k); continue; }
    if (plan.kind === 'tanya') { tanya.push(plan.tanya); continue; }
    gabungkan(gabung, plan);
    apa++;
  }

  if (!apa && tanya.length) {
    return balas(sesi, { aksi: 'tanya', ucapan: tanya });
  }
  if (!apa) {
    return balas(sesi, {
      aksi: 'tolak',
      ucapan: [
        'Itu di luar yang saya baca untuk dimensi keempat.',
        'Yang bisa: urutan bangun, motor, keyframe, fisika, durasi, laju frame, dan mengosongkan jadwal.',
        'Ketik "bantuan" untuk contoh.',
      ],
    });
  }

  const klik = klikProgram({ features: [], params: [], tally: gabung.tally });
  const ucapan = ['Yang saya baca:', ...gabung.understood.map(u => `· ${u}`)];
  if (gabung.notes.length) {
    ucapan.push('Yang perlu Anda tahu:');
    ucapan.push(...gabung.notes.map(n => `· ${n}`));
  }
  if (ditolak.length) ucapan.push(`Yang tidak saya ikuti: ${ditolak.map(d => `“${d}”`).join(', ')}.`);
  if (tanya.length) ucapan.push(...tanya);
  ucapan.push(klikKalimat(klik));
  ucapan.push('Katakan "ya" untuk menerapkannya.');

  return balas(sesi, { aksi: 'rencana', sim: gabung.sim, klik, understood: gabung.understood, ucapan }, { simpan: true });
}

/* -------------------------------------------------------------- plumbing */

function gabungkan(into, plan) {
  into.understood.push(...(plan.understood || []));
  into.notes.push(...(plan.notes || []));
  for (const [k, n] of Object.entries(plan.tally || {})) into.tally[k] = (into.tally[k] || 0) + n;
  const s = plan.sim || {};
  // An explicit "durasi 20 detik" outranks the length a sequence works out
  // for itself, whichever clause came first in the sentence.
  if (s.duration != null) into.sim.duration = s.duration;
  else if (s.durasiSaran != null && into.sim.duration == null) into.sim.duration = s.durasiSaran;
  if (s.fps != null) into.sim.fps = s.fps;
  if (s.angkat) into.sim.angkat = s.angkat;
  if (s.schedule) {
    into.sim.schedule = {
      ...(into.sim.schedule || {}),
      ...s.schedule,
      items: { ...(into.sim.schedule?.items || {}), ...(s.schedule.items || {}) },
    };
  }
  if (s.tracks) into.sim.tracks = { ...(into.sim.tracks || {}), ...s.tracks };
  if (s.dynamics) {
    into.sim.dynamics = {
      ...(into.sim.dynamics || {}),
      ...s.dynamics,
      bodies: { ...(into.sim.dynamics?.bodies || {}), ...(s.dynamics.bodies || {}) },
    };
  }
  return into;
}

function balas(sesi, out, { simpan = false } = {}) {
  const reply = { ok: out.aksi !== 'tolak', klik: 0, understood: [], sim: null, ...out };
  if (simpan && reply.aksi === 'rencana') sesi.patch = { sim: reply.sim, klik: reply.klik };
  sesi.turns.push({ dari: 'studio', teks: reply.ucapan.join('\n') });
  return reply;
}
