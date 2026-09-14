/**
 * The why-tutor.
 *
 * Every CAD package has documentation and none of it is read at the moment it
 * would matter. Help explains which button does what; the thing a student or a
 * new engineer actually lacks is knowing *why* one choice is better than another
 * at the point where they are about to make it.
 *
 * So this is not a tour and not a tooltip. Lessons are bound to observable
 * states of the document, they surface at most one at a time, they surface only
 * when their condition is genuinely true right now, and each one is dismissed
 * for good once it has been read. A lesson that fires twice has failed.
 *
 * Precedence is deliberate: a Doctor finding always outranks a general lesson,
 * because a concrete problem in front of you teaches better than a principle in
 * the abstract. The tutor is an explanation layer over the checks rather than a
 * separate stream of advice competing with them.
 */
import { MATERIALS } from '../core/doc.js';
import { processOf } from './process.js';
import { standards } from './standards.js';

const SEEN_KEY = 'tessercad-id.why.seen.v1';

function seen() {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); }
  catch { return new Set(); }
}

function markSeen(id) {
  const s = seen();
  s.add(id);
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...s])); } catch { /* optional */ }
}

export function resetSeen() {
  try { localStorage.removeItem(SEEN_KEY); } catch { /* optional */ }
}

/**
 * A lesson is { id, title, body, when(ctx) }.
 *
 * `when` must be cheap: this runs after every rebuild. It must also be specific
 * — a condition that is true of most documents is a banner, not a lesson.
 */
const LESSONS = [
  {
    id: 'parameters',
    title: 'Mengapa mengetik ekspresi, bukan angka',
    body: 'Anda punya beberapa fitur yang membawa dimensi yang sama. Beri nama sekali sebagai parameter lalu rujuk namanya, dan model berhenti menjadi gambar satu part dan menjadi deskripsi setiap part dalam keluarganya. Inilah alasan pohon fitur ada, dan inilah beda antara mengubah desain di satu tempat dan mengubahnya di sebelas tempat.',
    when: (c) => c.doc.features.length >= 3 && c.doc.params.length <= 1 && c.repeatedDimension,
  },
  {
    id: 'boolean-order',
    title: 'Mengapa urutan boolean penting',
    body: 'Subtract mengambil masukan pertama dan membuang sisanya, jadi menukar masukan sebuah subtract memberi Anda pemotongnya, bukan partnya. Union dan intersect tidak peduli urutan. Kalau sebuah boolean menghasilkan sesuatu yang terbalik, periksa body mana yang terdaftar pertama sebelum mengubah geometri apa pun.',
    when: (c) => c.doc.features.some(f => f.type === 'boolean' && f.params.op === 'subtract'),
  },
  {
    id: 'tessellation',
    title: 'Mengapa jumlah segmen lebih mahal dari kelihatannya',
    body: 'Silinder dengan 128 segmen membawa kira-kira delapan kali lipat segitiga dibanding yang 16, dan setiap boolean yang menyentuhnya membayar ongkos itu lagi di kedua sisi. Permukaan lengkung hanya perlu segmen secukupnya untuk toleransi yang Anda kerjakan: pada 48, radius 20mm meleset kurang dari 0,02mm. Raih jumlah segmen lebih dulu sebelum apa pun yang lain saat rebuild melambat.',
    when: (c) => c.build.stats.tris > 30000,
  },
  {
    id: 'wall-thickness',
    title: 'Mengapa proses yang menentukan dinding minimum, bukan material',
    body: 'Dinding 0,4mm wajar pada ABS cetak injeksi dan mustahil pada cor pasir, pada material yang sama. Batasnya ditentukan oleh cara material masuk ke bentuknya: apa yang bisa mengalir, apa yang bisa mendingin tanpa melengkung, apa yang bisa dijangkau pemotong tanpa melentur. Itulah sebabnya Doctor menanyakan proses yang Anda pakai sebelum mengatakan apa pun tentang dinding Anda.',
    when: (c) => c.doc.features.some(f => f.type === 'tube'),
  },
  {
    id: 'machining-cost',
    title: 'Mengapa part mesin yang lebih ringan sering lebih mahal',
    body: 'Permesinan ditagih atas balok awalnya dan waktu yang dipakai membuang semua yang bukan partnya. Mengosongkan part membuatnya lebih ringan dan lebih lambat dipotong, jadi harganya naik. Aditif sebaliknya: Anda membayar apa yang Anda simpan. Arah mana yang berlaku seharusnya mengubah cara Anda mendesain, bukan hanya ke mana Anda mengirimkannya.',
    when: (c) => c.process.kind === 'subtractive' && c.build.stats.bodies > 0,
  },
  {
    id: 'draft-angle',
    title: 'Mengapa part cetak dan cor butuh draft',
    body: 'Dinding tegak di dalam cetakan harus meluncur keluar melawan gesekan sepanjang seluruh panjangnya, dan ia akan macet, menyeret, atau lengket. Satu sampai dua derajat draft pada setiap muka tegak lurus garis belah hampir tidak berbiaya secara fungsi dan menjadi pembeda antara cetakan yang bekerja dan yang tidak. Tambahkan sejak awal: memasang draft belakangan biasanya berarti memotong ulang modelnya.',
    when: (c) => c.process.kind === 'formative',
  },
  {
    id: 'mass-vs-weight',
    title: 'Mengapa ini menulis massa, bukan berat',
    body: 'Panel ini melaporkan kilogram, yang merupakan massa dan tidak berubah menurut tempat partnya berada. Berat adalah gaya dan satuannya newton. Ini penting di sini karena setiap beban yang Anda masukkan di design brief adalah gaya: part 10kg yang menggantung pada braket memberi sekitar 98N, bukan 10.',
    when: (c) => c.build.stats.mass > 0.5,
  },
  {
    id: 'watertight',
    title: 'Mengapa mesh harus tertutup',
    body: 'Solid adalah permukaan yang memisahkan bagian dalam dari bagian luar. Kalau ada lubang di mana pun padanya, "dalam" kehilangan makna, sehingga volume, massa, titik berat, dan setiap jalur slicer menjadi tak terdefinisi. Sebagian besar pengekspor akan menulis mesh terbuka tanpa keberatan, itulah sebabnya ini gagal di mesin, bukan di dialog ekspor.',
    when: (c) => c.doc.features.some(f => f.type === 'mesh'),
  },
  {
    id: 'safety-factor',
    title: 'Apa yang sebenarnya ditutup faktor keamanan',
    body: 'Ini bukan tambal sulam untuk hitungan yang buruk. Ia menutupi beban yang ternyata lebih besar dari yang ditentukan, material yang ada di batas bawah spesifikasinya, konsentrasi tegangan di sudut yang tidak dimodelkan siapa pun, dan part yang dibuat sedikit meleset. Dua sampai tiga wajar untuk beban statis yang dipahami baik; apa pun yang siklik, terbeban kejut, atau menyangkut nyawa butuh lebih besar dan butuh perhitungan kelelahan yang tidak dilakukan aplikasi ini.',
    when: (c) => !!c.doc.meta.notes && /safety factor/i.test(c.doc.meta.notes),
  },
  {
    id: 'undo-history',
    title: 'Mengapa pohon fitur mengalahkan Undo',
    body: 'Undo berjalan mundur menembus waktu dan membawa serta semua yang ada sesudahnya. Pohon fitur memungkinkan Anda menjangkau ke tengah riwayat, mengubah satu dimensi, dan membangun ulang ke depan dengan semua yang lain utuh. Itulah sebabnya memasukkan dimensi ke dalam fitur lebih berharga daripada menyeret geometri ke tempatnya: seretan bisa di-undo, fitur bisa disunting.',
    when: (c) => c.doc.features.length >= 5,
  },
];

/**
 * Pick the single most relevant unseen lesson, or null.
 *
 * @param {object} doc
 * @param {object} build
 * @param {object} report  the Doctor's output, so findings can take precedence
 */
export function nextLesson(doc, build, report = null) {
  const s = standards();
  const done = seen();

  // A live finding always wins: it is concrete, it is on screen, and it is the
  // moment the explanation is worth most.
  const finding = report?.issues.find(i => i.why && i.severity >= 2 && !done.has(`finding:${i.check}`));
  if (finding) {
    return {
      id: `finding:${finding.check}`,
      kind: 'finding',
      title: finding.title,
      body: finding.why,
      severity: finding.severity,
    };
  }

  const ctx = {
    doc, build,
    process: processOf(doc.studio?.process || s.process),
    repeatedDimension: hasRepeatedDimension(doc),
  };

  for (const l of LESSONS) {
    if (done.has(l.id)) continue;
    let ok = false;
    try { ok = !!l.when(ctx); } catch { ok = false; }
    if (ok) return { id: l.id, kind: 'lesson', title: l.title, body: l.body };
  }
  return null;
}

export function dismissLesson(id) { markSeen(id); }

export function progress() {
  const done = seen();
  const total = LESSONS.length;
  const read = LESSONS.filter(l => done.has(l.id)).length;
  return { read, total };
}

/** Every lesson, for the help dialog, with whether it has been seen. */
export function allLessons() {
  const done = seen();
  return LESSONS.map(l => ({ id: l.id, title: l.title, body: l.body, read: done.has(l.id) }));
}

/**
 * Does the same length appear as a literal in three or more places?
 * That is the signal that a parameter is missing, and it is much more specific
 * than "this document has no parameters".
 */
function hasRepeatedDimension(doc) {
  const counts = new Map();
  for (const f of doc.features) {
    for (const v of Object.values(f.params)) {
      if (typeof v !== 'number' || v === 0 || v === 1) continue;
      counts.set(v, (counts.get(v) || 0) + 1);
    }
  }
  for (const n of counts.values()) if (n >= 3) return true;
  return false;
}

export { MATERIALS };
