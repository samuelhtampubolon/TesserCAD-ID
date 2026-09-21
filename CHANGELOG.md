# Catatan perubahan

Format: versi terbaru di atas. Tanggalnya tanggal tag, bukan tanggal commit.

Versi web selalu mengikuti `main`, jadi ia berubah begitu sebuah perubahan
di-merge. Unduhan desktop hanya berubah kalau ada tag baru. Itu sebabnya
halaman ini ada: kalau Anda memakai `.exe`, nomor versi di **Bantuan → Tentang**
adalah satu-satunya cara tahu perbaikan mana yang sudah Anda punya.

---

## v1.1.1

**Kalau unduhan desktop v1.1.0 atau v1.0.0 tidak jalan di komputer Anda, versi
ini yang harus dipakai.** Ada laporan bahwa tidak satu pun berkas `.exe`-nya
jalan, dan yang paling parah dari masalah itu bukan kegagalannya, tapi
diamnya: tidak ada pesan apa pun yang bisa dibaca atau dilaporkan.

### Diperbaiki

- **Kegagalan yang tidak kelihatan sama sekali.** Jendela aplikasi hanya
  ditampilkan pada `ready-to-show`, dan peristiwa itu tidak pernah terjadi
  kalau halamannya gagal dimuat. Jadi prosesnya jalan, tidak ada jendela, tidak
  ada pesan: dari luar sama saja dengan aplikasi yang tidak mau start. Sekarang
  setiap kegagalan pemuatan membuka jendela berisi halaman penjelasan, dengan
  kode galatnya, halaman yang diminta, dan versi Windows atau Linux yang
  dipakai. Tiga jalur kegagalan diperiksa satu per satu dengan cara
  merusaknya dengan sengaja:
  - permintaan yang ditolak penangan skema (yang ternyata datang sebagai HTTP
    404 berisi badan, jadi Chromium menganggapnya berhasil dan jendelanya
    dulu terbuka cuma menampilkan tulisan "Not found"),
  - proses penampil yang berhenti sebelum gambar pertama,
  - dan halaman yang termuat tetapi modulnya tidak, yang dulu membuat layar
    penyalaan berhenti di "Menyalakan mesin geometri…" selamanya.
- **Arsip `.zip` untuk Windows.** Tiga unduhan Windows sebelumnya semuanya
  berupa program yang mengekstrak dirinya sendiri, dan itu bentuk yang paling
  dicurigai antivirus untuk berkas tanpa tanda tangan digital. Sebuah `.zip`
  bukan program sampai diekstrak, jadi ia jadi jalan keluar kalau yang lain
  diblokir. Ukurannya lebih besar; yang penting ia jalan.
- **Pak bahasa `en-US` ikut dikirim lagi.** Chromium menentukan bahasa
  antarmukanya dari sistem operasi, jadi komputer yang tidak berbahasa
  Indonesia mencari berkas yang sebelumnya dibuang oleh penyaringan bahasa.
  Di Linux hal itu terukur aman; di Windows belum pernah diuji, karena tidak
  ada yang pernah menjalankan hasil paketan Windows-nya.

### Berubah

- **CI sekarang menjalankan aplikasi yang sudah dipaket, di Windows dan
  Linux.** Sebelumnya CI membangun paketnya, lalu memverifikasinya dengan
  menjalankan Electron di atas kode sumber, di Linux saja. Jadi berkas yang
  benar-benar diunduh orang belum pernah dijalankan oleh apa pun. Pemeriksa
  baru menyalakan binari itu sendiri lalu menanyai halamannya lewat DevTools
  Protocol apakah aplikasinya benar-benar menyala.
- **Rilis bisa dijalankan dari tab Actions, dan urutannya dibalik.** Menerbitkan
  unduhan dulunya wajib lewat tag yang didorong dari klona, dan tag itu sudah
  ada sejak detik ia didorong, apa pun hasil pembangunannya sesudahnya. Rilis
  v1.0.0 adalah buktinya: ia ditandai sebelum daftar berkas rilisnya
  diperbaiki, jadi tag itu selamanya menunjuk build yang kehilangan satu
  berkas yang ditawarkan dua halaman. Sekarang **Actions → Desktop build → Run
  workflow** menerima nomor tag, dan tag-nya baru dibuat di akhir, dari commit
  yang sudah lulus seluruh pemeriksaan. Run yang merah tidak meninggalkan tag
  untuk dihapus. Nomor yang tidak berbentuk `v1.2.3` ditolak sebelum apa pun
  dibangun, begitu juga nomor yang sudah dipakai rilis lain.
- **Bahasa Indonesia antarmukanya dirapikan.** Enam belas teks yang masih
  Inggris atau setengah Inggris diterjemahkan: "Panels restored", label
  "Force (N)", "Span (mm)", "Length (mm)", "Surface area", "Total mass",
  "Total volume", "Area", pembacaan tegangan "… against … allowable", "g
  billed", "none", judul "Bill of materials", dan dua kalimat di Doctor. Satu
  catatan biaya yang terlalu santai ("receh per part") ditulis ulang.
- **Alat ukur bahasanya diperbaiki, dan angkanya berubah karena itu.**
  `tools/parity.mjs` menghitung potongan kode, sumber regex, media query CSS
  dan nama placeholder seperti `{when}` sebagai "kalimat yang masih Inggris".
  Setelah diperbaiki: **0,1%** di sini, dari yang dilaporkan 1,6%, dan 40,6%
  serta 31,9% di dua edisi lain, dari yang dilaporkan 19,2% dan 22,3%. Jaraknya
  jauh lebih lebar dari yang tertulis sebelumnya.

### Catatan

- Tidak ada perubahan format dokumen. Berkas `.tcad` dari v1.0.0 dan v1.1.0
  terbuka apa adanya.
- Kalau setelah versi ini unduhannya masih tidak jalan, jendela yang terbuka
  akan menyebutkan sebabnya. Teks di kotak itulah yang paling membantu kalau
  dilaporkan.

---

## v1.1.0

**Rilis perbaikan keamanan. Kalau Anda memakai unduhan desktop v1.0.0, versi
ini yang seharusnya dipakai.**

Empat temuan dari audit atas kode yang ditulis khusus untuk edisi ini, yaitu
lapisan `ai` dan batas kepercayaan yang ditulisinya. Tiap temuan direproduksi
lebih dulu sebelum diperbaiki, dan tiap tesnya dijalankan terhadap kode lama
untuk memastikan ia gagal di sana. Rinciannya, termasuk apa yang diperiksa dan
ternyata sudah benar, ada di [SECURITY.md](SECURITY.md).

### Diperbaiki

- **Dokumen `.tcad` bikinan bisa menggantung tab selamanya.** `migrate()` sudah
  membatasi setiap parameter fitur, tetapi `sim` disatukan di sebelahnya dengan
  object spread biasa, jadi `duration`, `gravity`, `groundZ`, baris jadwal dan
  waktu keyframe adalah apa pun yang ditulis berkas. `{"duration":1e999}` itu
  JSON yang sah dan `JSON.parse` mengembalikan `Infinity`, yang lalu masuk ke
  dua loop tak berujung: `bake()` di simulator dan penggambar penggaris
  timeline. Satu klik cukup untuk mencapainya: buka berkasnya, lalu tab
  Simulasi. Sekarang setiap angka di `sim` dikoersi dan dibatasi di batas
  kepercayaan, kedua loop punya penjaga sendiri, dan `transform` sebuah fitur
  divalidasi seperti parameternya, yang sebelumnya tidak pernah.
- **Input durasi di timeline menulis ke dokumen tanpa lewat batas itu.**
  `type="number"` tidak menahan nilai sebesar apa pun yang diketik. Sekarang ia
  memakai batas yang sama, diekspor dari satu tempat.
- **Tabel katalog menjawab untuk nama yang tidak pernah dideklarasikannya.**
  `CATALOG[f.type]`, `MATERIALS[f.material]` dan `units in UNITS` memvalidasi
  string dari berkas dengan mengindeks object literal, dan literal mewarisi
  `Object.prototype`, jadi ketiganya menjawab untuk `constructor`, `toString`,
  `hasOwnProperty` dan `__proto__`. Ketiganya sekarang dibuat tanpa prototype
  dan dibekukan.
- **Tidak ada lagi angka non-finit dari pesan chat.** `parseFloat`
  mengembalikan `Infinity` untuk deret angka yang cukup panjang, dan itu
  kalimat yang bisa diketik atau ditempel siapa pun. Setiap angka yang
  dikeluarkan pembaca teks sekarang lewat satu pemeriksaan.
- **Parameter yang ditulis sebagai ekspresi kini tetap kena batas katalog.**
  `{"turns":"200","seg":"48","steps":"96"}` pada helix lolos dari plafon
  segmen dan membangun 1.843.200 triangle, dibanding 238.000 pada bentuk
  angkanya. Keduanya sekarang sama.
- **Dialog yang melempar galat tidak lagi meninggalkan modal dengan tombol
  mati.**

### Berubah

- **Seluruh teks antarmuka tidak lagi memakai em dash.** 377 karakter itu
  diganti tanda hubung berspasi di 71 berkas, termasuk label, teks bantuan,
  pesan galat dan judul halaman. Sebuah pemeriksaan menjaga ia tidak kembali.
- **Arsip `TesserCAD-ID-1.1.0-windows-x64.7z` mulai terlampir ke rilis.** Ia
  dibangun sejak v1.0.0 tetapi tidak pernah ikut terlampir, karena glob langkah
  rilisnya masih menyebut `zip`.
- **Hanya satu workflow yang menerbitkan situs.** Dua workflow starter ikut
  masuk saat Pages dinyalakan dan ketiganya berlomba di setiap push ke `main`.
  Yang bertahan adalah satu-satunya yang menjalankan tes lebih dulu.
- **Id fitur `__proto__` diganti nama, bukan didiamkan.** Sebelumnya dokumen
  seperti itu menjadwal, menganimasi dan menyimulasi ke nol sementara setiap
  panel melaporkan sukses.

### Catatan

- Ukuran unduhan Windows **88 MB terukur**, bukan di bawah 80 MB seperti
  spesifikasi awalnya. Satu-satunya tuas yang mencapainya adalah mem-pin
  Electron major yang lebih lama, yang berarti melepas pembaruan keamanan
  Chromium. Alasannya ada di [README.md](README.md).
- Tidak ada perubahan format dokumen. `.tcad` dari v1.0.0 terbuka apa adanya,
  dan `migrate()` membereskan angka di luar jangkauan saat membukanya.

---

## v1.0.0

Rilis pertama: studio CAD 3D/4D yang seluruhnya Bahasa Indonesia, metrik dan
berorientasi SNI, dengan dua fitur AI yang dijalankan sepenuhnya di mesin Anda.

- **AI Chat ke 3D**: sebelas rakitan parametrik berkonteks Indonesia dari satu
  kalimat, direncanakan lebih dulu dan diterapkan setelah Anda menyetujuinya.
  Kalimat terberatnya setara 868 langkah-klik.
- **AI Chat ke simulasi 4D**: urutan pembangunan, motor, keyframe dan fisika
  rigid-body dari satu kalimat, dengan targetnya dicari sendiri dari nama fitur
  di dokumen. Satu penyiapan penuh setara 60 sampai 80 langkah-klik.
- **Tanpa langkah build.** ES module biasa, satu dependensi runtime (three.js,
  divendor tanpa modifikasi), dan `index.html` yang mem-pin import map-nya
  dengan SHA-256 di dalam Content-Security-Policy.
- Unduhan desktop untuk Windows dan Linux, dengan SHA-256 di samping tiap
  berkas dan atestasi provenance bertanda tangan.

Arsip `.7z` tidak ikut terlampir di rilis ini. Delapan berkas yang benar-benar
ada di v1.0.0 disebut satu per satu di halaman rilisnya.
