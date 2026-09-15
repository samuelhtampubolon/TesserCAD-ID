/**
 * Teks: dua utilitas kecil untuk teks yang tampil ke pengguna.
 *
 * TesserCADIna menyimpan literal bahasa Inggris di sumber lalu
 * menerjemahkannya saat render, lewat tabel 1.938 baris yang harus ikut
 * terkirim ke peramban. TesserCAD-ID tidak punya bahasa kedua untuk dilayani,
 * jadi bahasanya ada di literalnya sendiri dan tabel itu tidak ada. Yang
 * tersisa hanya dua hal yang memang butuh fungsi:
 *
 *   isi()      menyulih `{nama}` di dalam kalimat yang sudah berbahasa
 *              Indonesia. Tidak ada pencarian kamus - hanya substitusi.
 *   istilah()  menerjemahkan nilai enum yang tersimpan di dokumen. Kata
 *              seperti `none` atau `distance` adalah nilai yang ditulis ke
 *              berkas, bukan teks tampilan: kalau literalnya diterjemahkan,
 *              dokumen lama berhenti terbaca. Jadi nilainya tetap, dan
 *              terjemahannya terjadi di tempat ia ditampilkan.
 */

/** Sulih `{nama}` di `s` dengan `vars.nama`. */
export function isi(s, vars = {}) {
  let out = String(s ?? '');
  for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v ?? ''));
  return out;
}

/**
 * Nilai enum yang tersimpan di dokumen, dan kata Indonesianya untuk tampilan.
 * Sengaja pendek: setiap entri di sini adalah nilai yang benar-benar ditulis
 * ke berkas `.tcad` atau dibandingkan di dalam kode, sehingga literalnya tidak
 * boleh ikut diterjemahkan.
 */
const ISTILAH = {
  millimetres: 'milimeter',
  centimetres: 'sentimeter',
  metres: 'meter',
  inches: 'inci',
  feet: 'kaki',
  degrees: 'derajat',
  distance: 'jarak',
  angle: 'sudut',
  point: 'titik',
  none: 'tidak ada',
  select: 'pilih',
  active: 'aktif',
  selected: 'dipilih',
  removed: 'dihapus',
  conflicts: 'konflik',
  features: 'fitur',
  parameters: 'parameter',
  document: 'dokumen',
  objects: 'objek',
  bodies: 'body',
  layers: 'layer',
  configs: 'konfigurasi',
  commands: 'perintah',
  quick: 'cepat',
};

/** Kata Indonesia untuk sebuah nilai enum; nilai tak dikenal lewat apa adanya. */
export function istilah(v) {
  if (v == null || v === '') return v;
  const k = String(v);
  return Object.prototype.hasOwnProperty.call(ISTILAH, k) ? ISTILAH[k] : k;
}
