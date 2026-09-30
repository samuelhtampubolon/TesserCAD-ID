# Panduan Pengguna TesserCAD-ID

**Studio CAD parametrik 3D/4D berbahasa Indonesia**

Versi 1.1.1 · Hak Cipta © 2026 Samuel Hasudungan Tampubolon · Lisensi MIT

---

## Tentang panduan ini

**Versi Word.** Panduan yang sama tersedia sebagai berkas `.docx` di
`docs/Panduan-Pengguna-TesserCAD-ID.docx`, untuk dicetak atau dibaca luring. Ia
dihasilkan dari berkas ini oleh `tools/build-panduan-docx.mjs`, dan sebuah
pemeriksaan memastikan keduanya tidak pernah berbeda isi.

Panduan ini ditulis supaya bisa diikuti sambil membuka aplikasinya, bukan
dibaca lebih dulu sampai habis. Tiga bab pertama sudah cukup untuk mulai
bekerja; sisanya adalah rujukan yang dibuka saat diperlukan.

Setiap angka, nama perintah, dan nama parameter di panduan ini diambil dari
kode sumber aplikasinya, bukan dari ingatan. Tabel perintah di Bab 16 dan
lampiran di Bab 17 dihasilkan dari `src/ui/commands.js` dan `src/core/doc.js`,
jadi kalau aplikasinya berubah dan panduan ini tidak, pemeriksaan di
`tools/tests/docs.mjs` yang gagal lebih dulu.

**Yang perlu diketahui sebelum mulai:** aplikasi ini tidak punya server, tidak
punya akun, dan tidak mengirim apa pun ke mana pun. Semua pekerjaan Anda ada di
mesin Anda. Itu bukan slogan; Bab 13 menjelaskan bagaimana hal itu ditegakkan
oleh peramban, bukan dijanjikan oleh dokumen.

### Daftar isi

1. [Memulai: memasang dan menjalankan](#1-memulai-memasang-dan-menjalankan)
2. [Antarmuka](#2-antarmuka)
3. [Dua fitur AI](#3-dua-fitur-ai)
4. [Dasar-dasar](#4-dasar-dasar)
5. [Model: solid parametrik](#5-model-solid-parametrik)
6. [Draft: gambar 2D](#6-draft-gambar-2d)
7. [Simulasi: dimensi keempat](#7-simulasi-dimensi-keempat)
8. [Berkas dan pertukaran](#8-berkas-dan-pertukaran)
9. [Studio: periksa, hitung biaya, rilis](#9-studio-periksa-hitung-biaya-rilis)
10. [Analisis: potongan, tabrakan, varian, versi](#10-analisis-potongan-tabrakan-varian-versi)
11. [Gambar kerja, toleransi, dan fastener](#11-gambar-kerja-toleransi-dan-fastener)
12. [Di ponsel dan tablet](#12-di-ponsel-dan-tablet)
13. [Keamanan, privasi, dan data Anda](#13-keamanan-privasi-dan-data-anda)
14. [Pemecahan masalah](#14-pemecahan-masalah)
15. [Referensi papan ketik](#15-referensi-papan-ketik)
16. [Referensi perintah lengkap](#16-referensi-perintah-lengkap)
17. [Lampiran A: katalog fitur dan parameternya](#17-lampiran-a-katalog-fitur-dan-parameternya)
18. [Lampiran B: material dan densitas](#18-lampiran-b-material-dan-densitas)
19. [Glosarium](#19-glosarium)
20. [Tanya jawab](#20-tanya-jawab)
21. [Lisensi dan hak cipta](#21-lisensi-dan-hak-cipta)
22. [Contoh terpandu](#22-contoh-terpandu)

---

## 1. Memulai: memasang dan menjalankan

Ada tiga cara memakai TesserCAD-ID, dan semuanya menjalankan aplikasi yang
sama persis dari kode yang sama persis. Yang berbeda hanya di mana ia berjalan.

### 1.1 Di peramban, tanpa memasang apa pun

Buka https://samuelhtampubolon.github.io/TesserCAD-ID/ dan aplikasinya menyala.
Tidak ada pendaftaran, tidak ada instalasi, tidak ada langkah build. Ini cara
tercepat dan cara yang paling disarankan untuk mencoba.

Peramban yang dibutuhkan: satu yang mendukung WebGL2 dan ES module. Semua
peramban arus utama sejak 2021 memenuhinya. Kalau viewport-nya kosong tetapi
antarmukanya muncul, biasanya WebGL yang dimatikan atau akselerasi perangkat
kerasnya nonaktif; Bab 14 membahasnya.

### 1.2 Di peramban, tetapi bisa dipakai tanpa jaringan

Setelah aplikasinya terbuka sekali, buka **Bantuan → Offline dan kepemilikan**
lalu pasang. Sejak itu jaringan boleh dimatikan sama sekali: seluruh aplikasi,
termasuk three.js, tersimpan di peramban Anda dan dilayani dari sana.

Ini yang membedakan "berjalan di peramban" dari "berjalan di awan". Tidak ada
bagian dari aplikasi ini yang tinggal di server orang lain setelah Anda
memasangnya, dan itu memang tujuannya.

### 1.3 Sebagai aplikasi desktop

Unduhannya ada di halaman **Releases** repositori:
https://github.com/samuelhtampubolon/TesserCAD-ID/releases

| Berkas | Untuk siapa |
|---|---|
| `TesserCAD-ID-1.1.1-windows-x64.zip` | **Coba ini lebih dulu.** Ekstrak, lalu jalankan `TesserCAD-ID.exe` dari folder hasil ekstraknya. |
| `TesserCAD-ID-1.1.1-portable.exe` | Satu berkas, langsung jalan, tanpa installer dan tanpa hak administrator. |
| `TesserCAD-ID-1.1.1-setup.exe` | Installer NSIS per-pengguna, dengan integrasi menu Start. |
| `TesserCAD-ID-1.1.1-windows-x64.7z` | Unduhan Windows terkecil. Perlu 7-Zip untuk membukanya. |
| `.AppImage` dan `.tar.gz` | Linux. AppImage: beri izin eksekusi, lalu jalankan. |

**Kenapa `.zip` disarankan lebih dulu.** Tiga unduhan Windows yang lain adalah
program yang mengekstrak dirinya sendiri, dan itu bentuk yang paling sering
dicurigai antivirus untuk berkas tanpa tanda tangan digital. Sebuah `.zip`
bukan program sampai diekstrak, jadi ia jalan keluar kalau yang lain diblokir.

**Tidak ada build macOS.** Sebuah `.dmg` tanpa tanda tangan ditolak Gatekeeper,
jadi yang ditawarkan hanya versi web dan Windows/Linux. Di macOS, pakai versi
peramban; ia tidak kurang apa pun.

### 1.4 Memastikan unduhan Anda utuh

Di samping setiap berkas di halaman Releases ada berkas `.sha256`. Isinya
sidik jari berkas itu. Cara memeriksanya:

```
# Windows, PowerShell
Get-FileHash .\TesserCAD-ID-1.1.1-windows-x64.zip -Algorithm SHA256

# Linux atau macOS
sha256sum TesserCAD-ID-1.1.1-windows-x64.zip
```

Kalau angkanya sama dengan isi berkas `.sha256`, unduhan Anda sama persis
dengan yang dibangun. Kalau berbeda, unduh ulang: unduhan yang terpotong adalah
sebab paling umum aplikasi tidak mau jalan.

Setiap berkas juga punya **atestasi provenance bertanda tangan**, yang
membuktikan commit, workflow, dan runner mana yang memproduksinya. Cara
memeriksanya ada di [SECURITY.md](../SECURITY.md).

### 1.5 Aplikasi desktop tidak jalan: apa yang terjadi

Kalau antarmukanya gagal dimuat, versi 1.1.1 membuka jendela yang **menyebutkan
sebabnya** dengan kode galat, halaman yang diminta, dan versi sistem operasi
Anda. Itu perubahan penting dari versi sebelumnya, yang gagal tanpa suara: tidak
ada jendela, tidak ada pesan, tidak ada yang bisa dilaporkan.

Urutan yang layak dicoba ada di halaman itu sendiri, dan diulang di Bab 14.

---

## 2. Antarmuka

**Menu bar.** Tiga belas menu di atas: Berkas, Sunting, Buat, Ubah, Tampilan,
Ukur, Draft, Simulasi, Ekspor, Jendela, Studio, Analisis, Bantuan. Submenu
terbuka saat disentuh kursor, toggle menampilkan tanda centang, dan yang tidak
berlaku saat ini dibuat kelabu - bukan disembunyikan - supaya Anda tetap tahu
ia ada dan bisa menebak kenapa belum bisa dipakai.

**Ribbon.** Baris kedua adalah toolbar kontekstual yang berubah mengikuti
workspace, dikelompokkan dan diberi label (Buat, Gabung, Ulang, Transform…).
Ia menggulir ke samping kalau jendelanya sempit.

**Command palette - `Ctrl K`.** Pencarian fuzzy berperingkat atas seluruh 200
perintah. Perintah yang baru Anda pakai muncul lebih dulu saat kotaknya masih
kosong. Ini cara tercepat mencapai apa pun yang shortcut-nya belum Anda hafal,
dan cara yang disarankan untuk menjelajah: ketik kata yang Anda cari, bukan
kata yang Anda hafal.

**Menu cepat - `Q`.** Delapan favorit bernomor tepat di kursor, berbeda di
tiap workspace. Tekan `Q` lalu `1`–`8` tanpa menggerakkan mouse.

**Menu konteks.** Klik kanan sebuah body di viewport, atau sebuah baris di
pohon fitur, untuk tepat operasi yang berlaku padanya.

**Panel.** `T` membuka-tutup panel kiri (outline), `N` panel kanan (properti).
Keduanya bisa dilipat supaya viewport memakai seluruh jendela. `Ctrl ⇧ Z`
masuk mode zen: kedua panel hilang sekaligus.

**Panel kiri** berisi pohon fitur di workspace Model, daftar layer di Draft,
dan daftar body beserta jadwalnya di Simulasi. Urutan di pohon fitur adalah
urutan bangun: sebuah Boolean hanya bisa memakan body yang ada di atasnya.

**Panel kanan** berisi properti apa pun yang sedang dipilih, dan kalau tidak
ada yang dipilih, properti dokumen. Di sinilah parameter bernama dikelola, dan
di sinilah setiap field menerima ekspresi.

**Status bar.** Sisi kiri memberi tahu apa yang diminta alat yang sedang aktif.
Sisi kanan menampilkan peta tombol mouse untuk workspace ini, jumlah seleksi,
satuan, dan statistik model termasuk berapa lama rebuild terakhir. Indikator
Design Doctor juga di sini: ia berwarna kalau ada temuan.

**Kartu belajar.** Daftar periksa kecil di sudut viewport melacak delapan hal
yang paling layak dicoba lebih dulu dan mencentangnya sendiri. Tutup dengan ✕,
atau kembalikan dari **Bantuan → Tampilkan kartu belajar**.

**Tema.** `Ctrl ⇧ L` bergantian gelap dan terang. Latar viewport punya empat
pilihan sendiri di **Tampilan**: Studio, Grafit, Kertas, dan Blueprint.

---

## 3. Dua fitur AI

Keduanya **perencana lokal, bukan model bahasa dan bukan layanan awan.** Tidak
ada server, tidak ada kunci API, tidak ada yang meninggalkan peramban Anda.
Keduanya membaca kosa kata Bahasa Indonesia lalu menghasilkan **fitur katalog
yang sama seperti hasil klik** - bisa disunting, digeser, dan dikendalikan
parameter setelahnya - bukan mesh mati.

Pola pemakaiannya sama untuk keduanya:

1. Ketik satu kalimat, tekan `Enter`.
2. Studio menjawab dengan **rencana**: apa yang ia baca, apa yang akan
   dibangun, apa yang ia asumsikan, dan setara berapa langkah-klik manual.
3. Belum ada yang berubah di dokumen Anda. Balas `ya` untuk menerapkan, atau
   sebut yang perlu diubah, atau `batal`.
4. Satu turn masuk sebagai **satu langkah Undo**.

### 3.1 AI Chat ke 3D - `Ctrl ⇧ K`

Buka dari **Buat → AI Chat ke 3D…**, dari ribbon, atau dengan `Ctrl ⇧ K`.

**Sebelas resep rakitan**, semuanya metrik dan berkonteks Indonesia:

| Resep | Kata yang mencapainya |
|---|---|
| Pelat berbaut | `pelat`, `plat`, `pelat sambung` |
| Braket L | `braket`, `siku`, `penyangga` |
| Flens pipa | `flens`, `sambungan pipa` |
| Kotak panel | `kotak panel`, `boks`, `enclosure`, `casing` |
| Poros bertingkat | `poros`, `as`, `shaft` |
| Rangka rak | `rangka`, `rak`, `meja`, `kerangka` |
| Tangga baja | `tangga`, `anak tangga` |
| Simpul kolom-balok | `kolom`, `balok`, `beton`, `simpul` |
| Dudukan motor | `dudukan motor`, `braket motor` |
| Saluran U | `saluran`, `drainase`, `got`, `kanal` |
| Tumpukan lantai | `menara`, `lantai`, `tingkat`, `gedung` |

Ukurannya diambil dari kalimat yang sama. Semua bentuk ini dipahami:

```
kotak panel 400 x 300 x 150 tebal 3 dengan 6 lubang gland 20
pelat baut 250 kali 150 tebal 12, baut M12, 8 lubang
braket L sayap 150 dan 100, lebar 90, tebal 10, baut M10
tumpukan lantai 12 lantai, denah 9 meter kali 7 meter, tinggi lantai 3,6 meter
saluran u lebar 400 tinggi 400, empat segmen 1200
kotak panel 300 x 200 x 100 tanpa ventilasi
```

Yang membuatnya bekerja: angka boleh dituliskan dengan huruf (`dua ribu tiga
ratus`, `delapan lantai`, `dua setengah meter`), satuan boleh menempel di
tiap angka (`9 meter kali 7 meter`), koma adalah pemisah desimal (`3,6 meter`),
callout baut dibaca sebagai ukuran (`M12`), pasangan dibaca dengan kata
sambung (`sayap 150 dan 100`), dan `tanpa` mematikan sebuah opsi.

**Beberapa perintah dalam satu pesan.** Pisahkan dengan `lalu`, `terus`,
`kemudian`, atau titik koma:

```
buatkan pelat baut 200 kali 120, lalu braket L, terus saluran u lebar 300
```

**Bentuk tunggal** juga bisa, lewat tata bahasa yang sama dengan
**Buat → Katakan yang Anda inginkan** (`Ctrl ⇧ B`):

```
silinder Ø40 tinggi 100 dari aluminium
6 lubang M8 jarak 30
```

**Menyunting yang sudah ada:**

```
tebalnya jadi 16
ganti materialnya jadi aluminium
```

**Bertanya:**

```
berapa massanya
berapa volumenya
berapa ukurannya
```

**Kalau di luar kosa katanya, ia menolak** dan menyebutkan apa saja yang ia
tahu. Itu fiturnya, bukan kekurangannya: asisten yang diam-diam membangun hal
yang salah lebih mahal daripada yang mengaku tidak mengikuti.

**Angka langkah-klik** yang ia laporkan berasal dari model di
`src/ai/klik.js`, ditulis sebagai data: tiap fitur empat klik (buka Create,
telusuri submenu, pilih, seleksi), tiap field angka dua, tiap Boolean empat.
Salah klik, scroll, dan Undo dihitung nol - jadi angkanya adalah batas bawah.

### 3.2 AI Chat ke simulasi 4D - `Ctrl ⇧ M`

Buka dari **Simulasi → AI Chat ke simulasi 4D…** atau dengan `Ctrl ⇧ M`.
Ia butuh dokumen yang sudah berisi body; kalau kosong, ia menyuruh Anda
membangun dulu.

```
jadwalkan urutan bangun, tiap lantai 3 hari, dari bawah ke atas
jadwalkan kolomnya dua hari lalu pelatnya satu hari
putar porosnya 120 rpm sumbu z
ayun tutupnya 30 derajat 0,5 hz
aktifkan fisika, jatuhkan dari 500 mm, restitusi 0,3 gesekan 0,5
angkat tutupnya 200 mm dalam 2 detik
durasi 30 detik, 24 fps
urutan bangun dengan mode cor bertahap
bersihkan jadwalnya
```

**Ia mencari sendiri body yang Anda maksud** dari nama fitur di dokumen, dalam
urutan pohon fitur. `jadwalkan lantainya` cukup - tidak perlu memilih dua belas
body satu-satu. Kata `-nya` dipahami, jadi `porosnya` sama dengan `poros`.
Kelompok yang dikenalinya: lantai, kolom, balok, pelat, tutup, segmen, poros,
anak tangga, baut, rangka, dinding, tulangan.

**Untuk motor dan keyframe ia menolak menebak.** Kalau tidak ada nama yang
disebut dan tidak ada yang dipilih, ia bertanya - karena motor pada semua body
sekaligus hampir selalu bukan yang dimaksud.

**Waktu nyata dipetakan ke timeline.** "Tiap lantai 3 hari" untuk delapan
lantai adalah 24 hari nyata; timeline-nya jadi sekitar 6,4 detik, dan
transkripnya menyebut rasionya (1 detik animasi ≈ 3,75 hari). Itu cara 4D BIM
menampilkannya, dan satu-satunya cara yang jujur sekaligus bisa ditonton.

**Fisika memakai bounding-sphere** tiap body: cepat, deterministik, dan cukup
untuk uji jatuh, konveyor, dan studi packing. **Ini bukan analisis tegangan**
dan tidak pernah mengaku begitu.

Satu setup 4D lengkap - jadwal, motor, fisika, durasi, laju frame - setara
**60-80 langkah-klik**. Pitanya lebih rendah dari sisi 3D, dan itu memang
apa adanya.

---

## 4. Dasar-dasar

**Tiga workspace**, tombolnya di tengah menu bar atau `Ctrl 1/2/3`:

| | Untuk apa |
|---|---|
| **Model** | Solid 3D parametrik, gaya SolidWorks: riwayat fitur, Boolean, pattern |
| **Draft** | Gambar 2D, gaya AutoCAD: layer, snap, dimensi, DXF |
| **Simulasi** | Dimensi keempat: timeline, keyframe, urutan bangun, fisika |

**Satuan internal selalu milimeter.** Mengubah satuan tampilan di
**Properti → Dokumen** hanya mengubah apa yang Anda baca dan ekspor, bukan
geometrinya.

**Setiap field angka menerima ekspresi.** Ketik `pelat_w / 2 - kelonggaran`
di field dimensi mana pun. Itulah yang membuat ini CAD dan bukan program
gambar 3D. Parameter bernama dikelola di **Properti → Parameter**.

**Undo adalah pohon, bukan tumpukan.** Suntingan setelah Undo membuat cabang
alih-alih memotong: keadaan yang sudah Anda lewati tetap bisa dijangkau.
Buka **`Shift H`** untuk melihat dan kembali ke mana pun, termasuk cabang yang
Anda tinggalkan.

**Autosave** menyimpan ke penyimpanan peramban ini, bukan ke server mana pun.
Ia ikut mesin, bukan ikut dokumen. Untuk memindahkan pekerjaan, simpan berkas
`.tcad`.

---

## 5. Model: solid parametrik

**Primitif** dari **Buat**: box, silinder, bola, kerucut, torus, tabung, baji,
prisma, piramida, pelat, heliks. Masing-masing punya field sendiri di panel
kanan, dan semuanya menerima ekspresi.

**Boolean** dari **Ubah**: Union (`Ctrl +`), Subtract (`Ctrl -`), Intersect.
Subtract memotong setiap body berikutnya dari body pertama yang dipilih, jadi
urutan seleksinya penting.

**Pattern dan mirror**: linear (dua sumbu sekaligus), melingkar, dan mirror
terhadap bidang. Pattern adalah fitur, bukan salinan - jumlahnya masih bisa
diubah nanti, dan itu sebabnya resep AI selalu memakai pattern.

**Transform**: `G` geser, `R` rotasi, `S` skala secara modal (gerakkan mouse,
tahan `Shift` untuk presisi, tahan `Ctrl` untuk mematikan snap), atau gizmo
dengan `W` / `⇧E` / `⇧R`. `D` menjatuhkan body ke lantai.

**Dari gambar**: pilih geometri tertutup di workspace Draft, lalu
**Buat → Extrude** atau **Revolve**. Menyunting gambarnya membangun ulang
solidnya.

**Material** mengatur tampilan sekaligus densitas yang dipakai properti massa.

---

## 6. Draft: gambar 2D

Alat gambar, masing-masing satu tombol: `L` garis, `P` polyline, `R` persegi,
`C` lingkaran, `A` arc, `E` elips, `G` poligon, `S` spline, `X` teks,
`D` dimensi, `O` offset, `M` ukur.

**Bantuan presisi**: `F3` object snap, `F8` ortho, `F9` snap grid, `F10`
polar tracking. Penanda snap: □ endpoint · △ midpoint · ○ centre · ◇ quadrant
· ✕ intersection.

**Layer** dikelola di panel kiri: nama, warna, visibilitas, kunci, ketebalan
garis, dan gaya. Layer aktif menerima objek baru.

**DXF** ditulis sebagai AutoCAD R12, yang bisa dibaca setiap paket CAD dan CAM.
Impor DXF juga ada, dan round-trip-nya diuji.

---

## 7. Simulasi: dimensi keempat

Tiga hal berbeda hidup di sini, dan `Space` memutar ketiganya.

**Keyframe.** Pilih body, geser playhead, ubah salah satu dari sebelas
properti animasi (geser X/Y/Z, putar X/Y/Z, skala X/Y/Z, opasitas, terlihat),
lalu kunci. Dua belas kurva easing tersedia. Timeline di bawah viewport bisa
digeser, di-zoom, dan keyframe-nya ditarik.

**Urutan bangun 4D.** Beri tiap body waktu mulai dan durasi - urutan
konstruksi klasik. Body tetap tersembunyi sampai slotnya dimulai, jadi
menggeser playhead menunjukkan progres di tanggal mana pun. Delapan mode
kemunculan: langsung, memudar, tumbuh dari tengah, naik, jatuh, geser X,
geser Y, dan cor bertahap.

**Fisika rigid-body.** Gravitasi, lantai, massa, restitusi, gesekan, dan motor
per body. Motor adalah penggerak analitik - ia berjalan tepat sesuai jadwal
tanpa peduli gaya, yang justru diinginkan untuk mekanisme. Lima tipe: putar
terus, ayun, bolak-balik, orbit, dan tidak ada.

**Rekam animasi** memutar ulang timeline frame demi frame dan menyimpan WebM
dengan encoder peramban Anda. Biarkan tab ini di depan sampai selesai.

Untuk semua di atas, **AI Chat ke 4D biasanya lebih cepat** daripada menyetel
tiap body satu-satu. Lihat [bagian 3.2](#32-ai-chat-ke-simulasi-4d---ctrl--m).

---

## 8. Berkas dan pertukaran

| Arah | Format |
|---|---|
| Simpan / buka | `.tcad` (JSON, bisa dibaca manusia dan di-diff) |
| Impor | STL, OBJ, DXF, `.tcad`, design-intent JSON |
| Ekspor 3D | STL biner, STL ASCII, OBJ, PLY |
| Ekspor 2D | DXF R12, SVG |
| Ekspor data | Bill of materials (CSV), design intent (JSON), PNG |

**Kualitas ekspor** (`Ekspor → Kualitas`) mengatur toleransi chord, yaitu
seberapa halus permukaan lengkung ditessellasi. Naikkan untuk cetak 3D,
turunkan untuk pratinjau cepat.

Tidak ada ekspor glTF di edisi ini; itu pertukaran yang sengaja dilepas supaya
unduhannya lebih ringan. Lihat [COMPARISON.md](../COMPARISON.md).

---

## 9. Studio: periksa, hitung biaya, rilis

**Mulai dari kebutuhan** (`Studio → Mulai dari kebutuhan`). Nyatakan
kebutuhannya - beban, bentang, tekanan, isi yang harus masuk - dan dapatkan
model parametrik beserta perhitungan ukurannya, lengkap dengan peringatan atas
apa yang tidak dihitungnya.

**Design Doctor** menjalankan enam belas pemeriksaan berkelanjutan dengan
perbaikan: fitur gagal bangun, parameter yang tidak menggerakkan apa pun, body
tidak kedap, dinding di bawah minimum proses, nama ganda, Boolean satu
masukan, dan seterusnya. Indikatornya ada di status bar.

**Biaya** memperkirakan ongkos per unit dalam Rupiah dari model tarif generik,
memilih proses, dan menunjukkan kuantitas persilangannya. **Baca bentuk
jawabannya** - proses mana yang menang, dimensi mana yang mendorong harga -
dan abaikan angka mutlaknya. Itu perkiraan orde besaran, bukan penawaran.

**Kesehatan dokumen** memeriksa presisi (titik jauh dari origin), muatan
duplikat, dan berat berkas.

**Rilis** membungkus satu paket serah-terima: gambar kerja, BOM, spesifikasi
teks, dan catatan, dalam satu arsip.

**Desain sebagai kode** (`Ctrl ⇧ C`) menampilkan dokumen sebagai teks yang
bisa disunting, dua arah, dengan diff sebelum diterapkan.

---

## 10. Analisis: potongan, tabrakan, varian, versi

**Potongan** memotong model dengan bidang dan melaporkan sifat penampang:
momen inersia kedua, modulus, dan kasus beban sederhana.

**Tabrakan** menghitung volume bentrokan secara eksak lewat Boolean, bukan
lewat perkiraan bounding box.

**Konfigurasi** menyimpan beberapa nilai parameter sebagai varian, dan
mengekspor keluarganya sebagai CSV.

**Versi** menyimpan snapshot bernama di penyimpanan peramban ini, dengan
cabang. Merge tiga arah antar cabang **tidak ada** di edisi ini; lihat
[COMPARISON.md](../COMPARISON.md) untuk alasannya.

**Pengenalan fitur** memulihkan lubang dan silinder dari mesh impor, yang
membuat mesh orang lain bisa diberi dimensi.

---

## 11. Gambar kerja, toleransi, dan fastener

**Gambar kerja** (`Ctrl ⇧ D`) membuat lembar ortografik dengan hidden-line
removal sungguhan, blok judul, skala, dan proyeksi **sudut pertama (ISO/SNI)**
sebagai bawaan. Kertas A4/A3. Lembar bisa diekspor ke SVG atau DXF, atau
dikembalikan ke workspace Draft untuk disunting.

**Toleransi** menghitung stack-up rantai (kasus terburuk dan RSS), Cp/Cpk, dan
suaian ISO 286 - sepuluh suaian bernama dari jalan longgar sampai suaian pukul,
masing-masing dengan catatan kapan dipakai.

**Fastener** adalah pustaka baut metrik ISO dengan data teknik: proof load,
torsi, lubang clearance ISO 273, bor tap, dan catatan kedalaman ulir per
material.

---

## 12. Di ponsel dan tablet

Di bawah 700 px, antarmukanya menjadi antarmuka sentuh: panel muncul sebagai
bottom sheet, menu jadi lembar penuh, target sentuh diperbesar, dan tidak ada
zoom saat field angka difokuskan. Di tablet satu panel ter-dock sekaligus.
Gestur: satu jari orbit, dua jari pan dan zoom, tekan-tahan untuk menu konteks.

Kedua chat AI bekerja sama saja di ponsel - dan di sanalah keduanya paling
berguna, karena mengetik satu kalimat jauh lebih mudah daripada mengejar
submenu dengan jempol.

---

## 13. Keamanan, privasi, dan data Anda

Bab ini ada karena pertanyaan "ke mana data saya pergi" layak dijawab dengan
mekanisme, bukan dengan janji. Uraian lengkapnya di
[SECURITY.md](../SECURITY.md); yang di bawah ini ringkasannya untuk pengguna.

### 13.1 Tidak ada server, dan itu ditegakkan peramban

Aplikasi ini adalah situs statis. Ia tidak punya backend, tidak punya akun,
tidak punya kunci API, dan tidak punya tempat untuk mengirim apa pun.

Yang membuat itu lebih dari sekadar pernyataan: `index.html` membawa
**Content-Security-Policy** dengan `default-src 'none'`. Artinya peramban
menolak memuat apa pun dari mana pun kecuali yang diizinkan satu per satu, dan
yang diizinkan hanya origin aplikasi ini sendiri. Kalau suatu hari ada kode di
dalamnya yang mencoba menghubungi alamat luar, peramban yang memblokirnya, bukan
kebijakan internal. Kebijakan itu diuji di peramban sungguhan dengan percobaan
injeksi nyata, dan hasilnya nol pelanggaran.

Import map di halaman itu **dipin dengan SHA-256** di dalam kebijakan tersebut.
Kalau satu byte saja di dalamnya berubah, peramban menolak menjalankannya sampai
sidik jarinya diperbarui.

### 13.2 Tidak ada eksekusi kode dinamis

Tidak ada `eval`, tidak ada `new Function`, tidak ada `setTimeout` dengan
string, dan tidak ada `innerHTML` di jalur yang menerima teks dari luar.
Termasuk field ekspresi: parser di `src/core/expr.js` ditulis tangan justru
supaya `pelat_w / 2` tidak pernah menjadi kode yang dijalankan.

Ini yang membedakan aplikasi ini dari beberapa paket CAD yang punya mesin
skrip: di sana sebuah berkas proyek bisa membawa makro, dan membuka berkas orang
lain berarti menjalankan kode orang lain. Di sini sebuah `.tcad` adalah data,
selalu, dan tidak ada jalan baginya untuk menjadi perintah.

### 13.3 Berkas yang orang lain tulis

Yang benar-benar datang dari luar adalah berkas yang Anda buka: `.tcad`, STL,
OBJ, DXF, dan design-intent JSON. Semuanya diperlakukan sebagai masukan yang
tidak dipercaya, dan setiap angka di dalamnya dibatasi di satu batas
kepercayaan sebelum menyentuh dokumen Anda.

Itu bukan teori. Versi 1.1.0 memperbaiki empat temuan nyata dari kelas ini,
termasuk sebuah `.tcad` yang bisa membuat tab menggantung selamanya dengan satu
angka yang sah menurut JSON. Rinciannya, termasuk apa yang diperiksa dan ternyata
sudah benar, ada di [SECURITY.md](../SECURITY.md). Yang perlu Anda lakukan:
tidak ada. Itulah maksudnya.

### 13.4 Di mana pekerjaan Anda disimpan

**Autosave** menyimpan ke penyimpanan peramban di mesin ini, bukan ke server
mana pun. Konsekuensinya penting dan sering disalahpahami: autosave **ikut
mesin dan peramban**, bukan ikut dokumen. Membersihkan data situs akan
menghapusnya, dan membuka aplikasi di komputer lain tidak akan menemukannya.

Untuk memindahkan pekerjaan, satu-satunya cara yang benar adalah **menyimpan
berkas `.tcad`** dan membawa berkasnya. Formatnya JSON polos, bisa dibaca
manusia, bisa di-diff, dan tidak mengunci Anda pada aplikasi ini.

**Versi** (Bab 10) juga disimpan di penyimpanan peramban yang sama, dengan
batasan yang sama.

### 13.5 Aplikasi desktop

Versi desktop menjalankan halaman yang sama di dalam jendela Electron dengan
posisi yang sengaja dikunci:

- **Tidak ada socket yang mendengarkan.** Halamannya dilayani lewat skema
  privat `app://tessercad-id`, bukan lewat server HTTP lokal. Tidak ada port
  yang terbuka, jadi tidak ada yang bisa menyambung dari luar.
- **Setiap izin Electron ditolak.** Kamera, mikrofon, lokasi, notifikasi,
  clipboard-read: semuanya dijawab tidak, tanpa daftar pengecualian.
- **Node tidak tersedia di halaman.** Halaman itu tidak punya akses ke sistem
  berkas selain lewat dialog buka/simpan yang Anda picu sendiri.
- **Permintaan navigasi ke luar ditolak.** Tautan eksternal dibuka di peramban
  Anda, bukan di dalam jendela aplikasi.

### 13.6 Apa yang tidak dilindungi

Jujur juga soal batasnya:

- **Binarinya tidak ditandatangani secara digital.** Itu sebabnya Windows dan
  antivirus kadang memperingatkan. Sertifikat code-signing berbayar dan
  disewakan per tahun; yang ditawarkan sebagai gantinya adalah SHA-256 dan
  atestasi provenance, yang justru membuktikan lebih banyak daripada sertifikat.
- **Tidak ada enkripsi berkas.** Sebuah `.tcad` adalah JSON polos. Kalau
  isinya rahasia, yang melindunginya adalah tempat Anda menyimpannya.
- **Fisika rigid-body bukan analisis tegangan**, dan perhitungan biaya bukan
  penawaran. Keduanya menyatakan itu sendiri di antarmukanya.

---

## 14. Pemecahan masalah

### 14.1 Aplikasi desktop tidak mau jalan

Ini keluhan yang paling sering, dan versi 1.1.1 dibuat untuk menjawabnya. Kalau
antarmukanya gagal dimuat, sebuah jendela terbuka dan **menyebutkan sebabnya**.
Salin seluruh isi kotak di jendela itu kalau Anda melaporkannya; teks itulah
yang membuat masalahnya bisa ditelusuri.

Urutan yang layak dicoba:

1. **Jalankan lagi.** Kalau berkasnya baru diunduh, antivirus kadang masih
   memeriksanya saat dijalankan pertama kali.
2. **Pakai versi `.zip`**, bukan yang portable atau installer. Ekstrak dulu,
   lalu jalankan dari folder hasil ekstraknya. Berkas yang mengekstrak dirinya
   sendiri lebih sering dicurigai antivirus.
3. **Jalankan dari folder biasa** seperti `Documents`, bukan dari `Downloads`
   atau folder jaringan.
4. **Kalau pesannya menyebut `-6` atau `ERR_FILE_NOT_FOUND`**, berkas
   programnya tidak lengkap: unduh ulang, lalu periksa SHA-256-nya (Bab 1.4).

Kalau tidak ada jendela sama sekali dan tidak ada pesan, itu informasi juga: ia
menunjuk ke sesuatu yang terjadi sebelum aplikasinya menyala, biasanya kebijakan
perangkat atau antivirus yang memblokir binari sepenuhnya. Versi peramban tetap
bekerja penuh dalam keadaan itu.

### 14.2 Windows memperingatkan tentang berkasnya

Windows SmartScreen menampilkan peringatan untuk berkas yang belum pernah
dilihatnya dan tidak ditandatangani. Ini bukan deteksi virus; ini ketidakhadiran
reputasi. Pilihan Anda:

- Periksa SHA-256-nya terhadap berkas `.sha256` di halaman Releases. Kalau sama,
  berkas Anda sama dengan yang dibangun oleh workflow publik yang bisa dibaca
  siapa pun.
- Atau pakai versi peramban, yang tidak melibatkan berkas sama sekali.

Penjelasan lengkap kenapa ini terjadi, dan apa yang edisi ini pilih, ada di
[SECURITY.md](../SECURITY.md).

### 14.3 Viewport kosong, tetapi antarmukanya muncul

Hampir selalu WebGL. Periksa:

- Apakah akselerasi perangkat keras aktif di pengaturan peramban.
- Apakah driver kartu grafisnya terpasang (di mesin baru sering belum).
- Buka `about:gpu` di Chrome atau `about:support` di Firefox untuk melihat
  apakah WebGL2 dilaporkan tersedia.

### 14.4 Model tidak mau dibangun, atau hasilnya aneh

Buka **Analisis → Kesehatan dokumen** dan lihat indikator **Design Doctor** di
status bar. Enam belas pemeriksaan berjalan terus dan sebagian besar menawarkan
perbaikan langsung: fitur gagal bangun, parameter yang tidak menggerakkan apa
pun, body tidak kedap, dinding di bawah minimum proses, nama ganda, dan Boolean
dengan satu masukan.

Untuk Boolean khususnya: **urutan seleksi menentukan hasil.** Subtract memotong
setiap body berikutnya dari body pertama yang Anda pilih.

### 14.5 Rebuild terasa lambat

Angka rebuild terakhir ada di status bar. Kalau naik tajam, tersangka pertama
adalah jumlah segmen: sebuah heliks atau torus dengan `seg` dan `steps` tinggi
bisa menghasilkan ratusan ribu triangle sendirian. Turunkan `seg` saat bekerja,
naikkan lagi sebelum mengekspor.

Tersangka kedua adalah pattern besar di atas Boolean. Pattern adalah fitur, jadi
mengubah `count` sementara ke angka kecil membuat sisa pekerjaan jauh lebih
nyaman, dan angkanya bisa dinaikkan lagi kapan saja.

**Kualitas ekspor** (`Ekspor → Kualitas`) terpisah dari ini: ia hanya
mempengaruhi berkas yang ditulis, bukan kecepatan bekerja.

### 14.6 Pekerjaan saya hilang

Coba, berurutan:

1. `Ctrl Z`, dan kalau sudah terlalu jauh, **`⇧ H`** untuk riwayat. Undo di sini
   adalah pohon, jadi keadaan yang Anda lewati setelah membuat cabang **masih
   ada** dan bisa dijangkau dari sana.
2. **Berkas → Pulihkan autosave…**
3. Kalau Anda berpindah komputer atau membersihkan data peramban, autosave tidak
   ikut (Bab 13.4). Yang ikut hanya berkas `.tcad` yang Anda simpan sendiri.

### 14.7 Chat AI menolak permintaan saya

Itu perilaku yang disengaja. Kalau kalimatnya di luar kosa katanya, ia menolak
dan menyebutkan apa saja yang ia tahu, alih-alih membangun sesuatu yang
sebetulnya bukan maksud Anda. Bandingkan kalimat Anda dengan pola di Bab 3, atau
pakai **Buat → Katakan yang Anda inginkan** (`Ctrl ⇧ B`) untuk satu bentuk saja.

Untuk motor dan keyframe di sisi 4D, ia memang menolak menebak target: sebutkan
nama body-nya atau pilih body-nya lebih dulu.

### 14.8 Rekaman animasi gagal atau terpotong

Perekaman memakai encoder peramban Anda dan berjalan frame demi frame. Biarkan
tab-nya di depan sampai selesai; tab latar belakang di-throttle oleh peramban
dan itu memotong rekaman.

---

## 15. Referensi papan ketik

### Di mana saja

| | |
|---|---|
| `Ctrl K` | command palette |
| `Ctrl ⇧ K` | **AI Chat ke 3D** |
| `Ctrl ⇧ M` | **AI Chat ke simulasi 4D** |
| `Ctrl ⇧ B` | katakan yang Anda inginkan (satu bentuk) |
| `Ctrl ⇧ D` | gambar kerja |
| `Ctrl ⇧ C` | desain sebagai kode |
| `⇧ H` | riwayat, termasuk cabang yang ditinggalkan |
| `Q` | menu cepat |
| `Ctrl S` / `Ctrl ⇧ S` | simpan / simpan sebagai |
| `Ctrl O` / `Ctrl N` / `Ctrl I` | buka / baru / impor |
| `Ctrl Z` / `Ctrl ⇧ Z` | undo / redo |
| `Ctrl D` | duplikat |
| `Ctrl A` / `Alt A` / `Ctrl ⇧ I` | pilih semua / tidak ada / balik |
| `Del` | hapus seleksi |
| `F2` | ganti nama |
| `Ctrl ,` | preferensi |
| `T` / `N` | panel kiri / kanan |
| `Esc` | batalkan, lalu lepas seleksi |
| `F1` | bantuan ini |

### Model dan Simulasi

| | |
|---|---|
| `G` / `R` / `S` | geser / rotasi / skala modal |
| `W` / `⇧E` / `⇧R` | gizmo geser / rotasi / skala |
| `F` / `⇧F` | zoom pas / ke seleksi |
| `5` | kamera ortografik |
| `1` / `3` / `7` | depan / kanan / atas (tambah `⇧` untuk kebalikannya) |
| `0` | isometrik |
| `Z` | putar mode shading |
| `H` / `Alt H` / `/` | sembunyikan / tampilkan semua / isolasi |
| `D` | jatuhkan ke lantai |
| `M` | ukur jarak |
| `Space` | putar / jeda timeline |
| `,` / `.` | maju satu frame |
| `Home` / `End` | awal / akhir timeline |

### Draft

| | |
|---|---|
| `L` `P` `R` `C` `A` `E` `G` `S` `X` | garis, polyline, persegi, lingkaran, arc, elips, poligon, spline, teks |
| `D` / `O` / `M` | dimensi, offset, ukur |
| `F3` / `F8` / `F10` | object snap / ortho / polar tracking |
| `Enter` | selesaikan polyline atau spline |
| `C` | tutup polyline |
| `F9` | snap ke grid |
| `F` | zoom seluruh gambar |

---

## 16. Referensi perintah lengkap

Setiap perintah di bawah ini bisa dijalankan dari command palette (`Ctrl K`)
dengan mengetik sebagian namanya. Kolom **Id** adalah nama internalnya, yang
berguna kalau Anda melaporkan masalah atau membaca kode sumbernya.

Daftar ini dihasilkan dari `src/ui/commands.js`, jadi ia daftar yang benar-benar
terdaftar dan bukan daftar yang diingat: **200 perintah** di seluruh
aplikasi. Kolom pintasan hanya terisi kalau perintahnya memang punya satu.

Perintah yang kelabu di menu bukan perintah yang hilang: ia ada, tetapi tidak
berlaku untuk keadaan sekarang. Biasanya karena belum ada yang dipilih, atau
karena Anda sedang di workspace yang lain.

### Berkas (11)

| Perintah | Id | Pintasan |
|---|---|---|
| Dokumen baru | `file.new` | `Ctrl N` |
| Baru dari templat… | `file.template` |  |
| Buka proyek… | `file.open` | `Ctrl O` |
| Simpan proyek | `file.save` | `Ctrl S` |
| Simpan sebagai… | `file.saveAs` | `Ctrl ⇧ S` |
| Impor berkas… | `file.import` | `Ctrl I` |
| Kembalikan ke simpanan terakhir | `file.revert` |  |
| Properti dokumen… | `file.props` |  |
| Pulihkan autosave… | `file.autosave` |  |
| Hapus sesi tersimpan | `file.clearAutosave` |  |
| Muat model demo | `file.sample` |  |

### Sunting (11)

| Perintah | Id | Pintasan |
|---|---|---|
| Undo | `edit.undo` | `Ctrl Z` |
| Redo | `edit.redo` | `Ctrl ⇧ Z` |
| Riwayat Undo… | `edit.history` | `Ctrl ⇧ H` |
| Duplikat | `edit.duplicate` | `Ctrl D` |
| Hapus | `edit.delete` | `Del` |
| Ganti nama… | `edit.rename` | `F2` |
| Pilih semua | `edit.selectAll` | `Ctrl A` |
| Batalkan pilihan | `edit.selectNone` | `Alt A` |
| Balik pilihan | `edit.selectInvert` | `Ctrl ⇧ I` |
| Pilih jenis yang sama | `edit.selectSameType` |  |
| Preferensi… | `edit.prefs` | `Ctrl ,` |

### Buat (17)

| Perintah | Id | Pintasan |
|---|---|---|
| Extrude gambar | `sketch.extrude` | `E` |
| Revolve gambar | `sketch.revolve` |  |
| Impor mesh… | `add.import` |  |
| AI Chat ke 3D… | `ai.chat3d` |  |
| Katakan yang Anda inginkan… | `speak.build` |  |
| Fastener… | `lib.fasteners` |  |
| Box | `add.box` |  |
| Cylinder | `add.cylinder` |  |
| Sphere | `add.sphere` |  |
| Cone / Frustum | `add.cone` |  |
| Torus | `add.torus` |  |
| Tube / Pipa | `add.tube` |  |
| Wedge | `add.wedge` |  |
| Prism | `add.prism` |  |
| Pyramid | `add.pyramid` |  |
| Pelat sudut bulat | `add.plate` |  |
| Helix / Pegas | `add.helix` |  |

### Ubah (12)

| Perintah | Id | Pintasan |
|---|---|---|
| Union | `bool.union` | `Ctrl +` |
| Subtract | `bool.subtract` | `Ctrl -` |
| Intersect | `bool.intersect` |  |
| Linear pattern | `mod.linear` |  |
| Circular pattern | `mod.circular` |  |
| Mirror | `mod.mirror` |  |
| Suppress / unsuppress | `mod.suppress` |  |
| Sembunyikan pilihan | `mod.hide` | `H` |
| Tampilkan semua | `mod.showAll` | `Alt H` |
| Isolasi pilihan | `mod.isolate` | `/` |
| Tetapkan material… | `mod.material` |  |
| Atur warna… | `mod.colour` |  |

### Transform (14)

| Perintah | Id | Pintasan |
|---|---|---|
| Geser | `op.move` | `G` |
| Rotate | `op.rotate` | `R` |
| Scale | `op.scale` | `S` |
| Gizmo geser | `gizmo.translate` | `W` |
| Gizmo putar | `gizmo.rotate` | `Shift E` |
| Gizmo skala | `gizmo.scale` | `Shift R` |
| Tanpa gizmo | `gizmo.off` |  |
| Reset transform | `xf.reset` |  |
| Jatuhkan ke lantai | `xf.drop` | `D` |
| Pusatkan di origin | `xf.centre` |  |
| Ratakan di X | `xf.alignX` |  |
| Ratakan di Y | `xf.alignY` |  |
| Ratakan di Z | `xf.alignZ` |  |
| Sebarkan merata | `xf.distribute` |  |

### Tampilan (27)

| Perintah | Id | Pintasan |
|---|---|---|
| Zoom pas | `view.fit` | `F` |
| Zoom ke pilihan | `view.selection` | `⇧ F` |
| Perbesar | `view.zoomIn` | `+` |
| Perkecil | `view.zoomOut` | `-` |
| Kamera ortografis | `view.ortho` | `5` |
| Tampilkan grid | `view.grid` |  |
| Tampilkan sumbu dunia | `view.axes` |  |
| Tampilkan bayangan lantai | `view.ground` |  |
| Ganti mode shading | `view.shadingCycle` | `Z` |
| Tampilan section | `view.section` |  |
| Tema terang / gelap | `view.theme` | `Ctrl ⇧ L` |
| Layar penuh | `view.fullscreen` | `F11` |
| Tampilan Isometric | `view.iso` | `0` |
| Tampilan depan | `view.front` | `1` |
| Tampilan belakang | `view.back` | `⇧ 1` |
| Tampilan kanan | `view.right` | `3` |
| Tampilan kiri | `view.left` | `⇧ 3` |
| Tampilan atas | `view.top` | `7` |
| Tampilan bawah | `view.bottom` | `⇧ 7` |
| Shaded dengan tepi | `shade.shaded-edges` |  |
| Shaded | `shade.shaded` |  |
| Wireframe | `shade.wire` |  |
| X-ray | `shade.xray` |  |
| Latar Studio | `bg.studio` |  |
| Latar Grafit | `bg.graphite` |  |
| Latar Kertas | `bg.white` |  |
| Latar Blueprint | `bg.blueprint` |  |

### Ukur (5)

| Perintah | Id | Pintasan |
|---|---|---|
| Ukur jarak | `measure.distance` | `M` |
| Ukur sudut | `measure.angle` |  |
| Probe titik | `measure.point` |  |
| Properti massa… | `measure.mass` |  |
| Hentikan pengukuran | `measure.off` |  |

### Draft (26)

| Perintah | Id | Pintasan |
|---|---|---|
| Object snap | `draft.snap` | `F3` |
| Mode Ortho | `draft.ortho` | `F8` |
| Polar tracking | `draft.polar` | `F10` |
| Snap ke grid | `draft.gridSnap` | `F9` |
| Zoom seluruh gambar | `draft.zoomExtents` |  |
| Layer baru… | `draft.addLayer` |  |
| Putar 90° | `draft.rotate90` |  |
| Mirror terhadap X | `draft.mirrorX` |  |
| Mirror terhadap Y | `draft.mirrorY` |  |
| Pilih | `draft.select` | `Esc` |
| Baris | `draft.line` | `L` |
| Polyline | `draft.polyline` | `P` |
| Rectangle | `draft.rect` | `R` |
| Circle | `draft.circle` | `C` |
| Arc | `draft.arc` | `A` |
| Ellipse | `draft.ellipse` | `Shift E` |
| Polygon | `draft.polygon` | `G` |
| Spline | `draft.spline` | `S` |
| Point | `draft.point` |  |
| Teks | `draft.text` | `X` |
| Dimensi linear | `draft.dimLinear` | `D` |
| Dimensi aligned | `draft.dimAligned` |  |
| Dimensi radius | `draft.dimRadial` |  |
| Dimensi sudut | `draft.dimAngular` |  |
| Offset | `draft.offset` | `O` |
| Ukur | `draft.measure` | `M` |

### Simulasi (18)

| Perintah | Id | Pintasan |
|---|---|---|
| Putar / jeda | `sim.play` | `Space` |
| Stop dan ulang | `sim.stop` |  |
| Ke awal | `sim.rewind` | `Home` |
| Ke akhir | `sim.end` | `Akhir` |
| Mundur satu frame | `sim.stepBack` | `,` |
| Maju satu frame | `sim.stepFwd` | `.` |
| Putar berulang | `sim.loop` |  |
| Keyframe pose saat ini | `sim.key` | `K` |
| Hapus animasi pada pilihan | `sim.clearKeys` |  |
| Urutkan bangun otomatis | `sim.autoSchedule` |  |
| Hapus urutan bangun | `sim.clearSchedule` |  |
| Urutan bangun | `sim.schedule` |  |
| Dinamika rigid-body | `sim.physics` |  |
| Siapkan uji jatuh | `sim.dropTest` |  |
| Tambah motor putar | `sim.motor` |  |
| Bake dinamika ke keyframe | `sim.bake` |  |
| Rekam ke video | `sim.record` |  |
| AI Chat ke simulasi 4D… | `ai.chat4d` |  |

### Ekspor (12)

| Perintah | Id | Pintasan |
|---|---|---|
| STL - biner | `export.stl` |  |
| STL - ASCII | `export.stlAscii` |  |
| OBJ | `export.obj` |  |
| PLY | `export.ply` |  |
| Gambar DXF | `export.dxf` |  |
| Gambar SVG | `export.svg` |  |
| PNG viewport - 1× | `export.png1` |  |
| PNG viewport - 2× | `export.png` |  |
| PNG viewport - 4× | `export.png4` |  |
| Daftar material / BOM (CSV) | `export.bom` |  |
| Laporan properti massa | `export.report` |  |
| Kualitas ekspor… | `export.quality` |  |

### Gambar kerja (3)

| Perintah | Id | Pintasan |
|---|---|---|
| Gambar kerja… | `draw.sheet` |  |
| Gambar ke SVG | `draw.sheetSVG` |  |
| Gambar ke DXF | `draw.sheetDXF` |  |

### Jendela (8)

| Perintah | Id | Pintasan |
|---|---|---|
| Panel kerangka | `win.left` | `T` |
| Panel properti | `win.right` | `N` |
| Timeline | `win.timeline` |  |
| Mode zen (sembunyikan panel) | `win.zen` | `Ctrl ⇧ Z` |
| Reset tata letak | `win.reset` |  |
| Workspace Model | `ws.model` |  |
| Workspace Draft | `ws.draft` |  |
| Workspace Simulasi | `ws.sim` |  |

### Studio (13)

| Perintah | Id | Pintasan |
|---|---|---|
| Baru dari brief desain… | `studio.brief` |  |
| Design doctor | `studio.doctor` |  |
| Perkiraan biaya | `studio.cost` |  |
| Rilis desain… | `release.package` |  |
| Ekspor design intent | `studio.intent` |  |
| Rekam makro | `macro.record` |  |
| Stop rekaman | `macro.stop` |  |
| Makro… | `macro.manage` |  |
| Standar studio… | `studio.standards` |  |
| Catatan teknik | `studio.lessons` |  |
| Impor design intent… | `studio.intentIn` |  |
| Desain sebagai kode… | `spec.edit` |  |
| Salin teks spesifikasi | `spec.copy` |  |

### Analisis (6)

| Perintah | Id | Pintasan |
|---|---|---|
| Properti section… | `studio.section` |  |
| Pemeriksaan clash | `studio.clash` |  |
| Periksa mesh impor… | `studio.inspect` |  |
| Stack-up toleransi… | `tol.stack` |  |
| Fits dan limits… | `tol.fits` |  |
| Kesehatan dokumen… | `doc.health` |  |

### Configure (4)

| Perintah | Id | Pintasan |
|---|---|---|
| Konfigurasi… | `cfg.manage` |  |
| Konfigurasi baru | `cfg.add` |  |
| Konfigurasi berikutnya | `cfg.next` |  |
| Ekspor tabel family | `cfg.family` |  |

### Versions (3)

| Perintah | Id | Pintasan |
|---|---|---|
| Simpan versi… | `vcs.commit` |  |
| Riwayat versi… | `vcs.browse` |  |
| Cabang baru… | `vcs.branch` |  |

### Bantuan (10)

| Perintah | Id | Pintasan |
|---|---|---|
| Palet perintah | `help.palette` | `Ctrl K` |
| Mulai cepat | `help.quickstart` |  |
| Pintasan papan ketik | `help.shortcuts` | `F1` |
| Referensi ekspresi | `help.expressions` |  |
| Tampilkan kartu belajar | `help.learn` |  |
| Panduan pengguna (buka GitHub) | `help.guide` |  |
| Kode sumber | `help.source` |  |
| Laporkan masalah | `help.issue` |  |
| Tentang TesserCAD-ID | `help.about` |  |
| Offline dan kepemilikan… | `app.ownership` |  |

---

## 17. Lampiran A: katalog fitur dan parameternya

Setiap baris di bawah ini adalah satu jenis fitur yang bisa ada di dokumen, dan
kolom terakhir adalah nama parameter yang muncul di panel kanan saat fitur itu
dipilih. **Setiap parameter angka menerima ekspresi**, jadi `w` boleh berisi
`pelat_w / 2 - kelonggaran` dan bukan hanya sebuah angka.

Nama-nama ini juga nama yang dipakai di dalam berkas `.tcad`, sehingga sebuah
dokumen bisa dibaca dan di-diff tanpa aplikasi ini.

| Fitur | Label | Parameter |
|---|---|---|
| `box` | Box | `w`, `d`, `h` |
| `cylinder` | Cylinder | `r`, `h`, `arc`, `seg` |
| `sphere` | Sphere | `r`, `seg` |
| `cone` | Cone / Frustum | `r1`, `r2`, `h`, `seg` |
| `torus` | Torus | `R`, `r`, `arc`, `seg`, `tseg` |
| `tube` | Tube / Pipa | `ro`, `ri`, `h`, `seg` |
| `wedge` | Wedge | `w`, `d`, `h` |
| `prism` | Prism | `r`, `h`, `sides` |
| `pyramid` | Pyramid | `r`, `h`, `sides` |
| `plate` | Pelat sudut bulat | `w`, `d`, `h`, `fillet`, `hole`, `seg` |
| `helix` | Helix / Pegas | `R`, `r`, `pitch`, `turns`, `seg`, `steps` |
| `extrude` | Extrude sketch | `dist`, `symmetric`, `plane`, `offset`, `taper`, `twist`, `steps` |
| `revolve` | Revolve sketch | `angle`, `axis`, `plane`, `seg` |
| `boolean` | Boolean | `op` |
| `patternLinear` | Linear pattern | `count`, `dx`, `dy`, `dz`, `count2`, `dx2`, `dy2`, `dz2` |
| `patternCircular` | Circular pattern | `count`, `angle`, `axis`, `cx`, `cy`, `cz`, `rotate` |
| `mirror` | Mirror | `plane`, `offset`, `keep` |
| `mesh` | Mesh impor | `scale` |

Tabel ini dihasilkan dari `CATALOG` di `src/core/doc.js`. Batas atas untuk
`seg`, `steps`, `turns`, dan `sides` juga ditegakkan di sana, di batas
kepercayaan dokumen, sehingga sebuah berkas tidak bisa meminta pekerjaan yang
tak terbatas. Lihat Bab 13.3.

---

## 18. Lampiran B: material dan densitas

Material mengatur dua hal sekaligus: tampilan body di viewport, dan densitas
yang dipakai perhitungan properti massa di **Ukur → Properti massa…**.

| Nama | Kunci | Densitas (kg/mm3) | Densitas (kg/m3) |
|---|---|---|---|
| Baja | `steel` | 7.85e-6 | 7850 |
| Aluminium | `aluminium` | 2.70e-6 | 2700 |
| Stainless | `stainless` | 8.00e-6 | 8000 |
| Kuningan | `brass` | 8.50e-6 | 8500 |
| Tembaga | `copper` | 8.96e-6 | 8960 |
| Titanium | `titanium` | 4.50e-6 | 4500 |
| Plastik ABS | `abs` | 1.04e-6 | 1040 |
| PLA | `pla` | 1.24e-6 | 1240 |
| Nilon | `nylon` | 1.15e-6 | 1150 |
| Akrilik | `acrylic` | 1.18e-6 | 1180 |
| Kayu (pinus) | `wood` | 5.00e-7 | 500 |
| Beton | `concrete` | 2.40e-6 | 2400 |
| Kaca | `glass` | 2.50e-6 | 2500 |
| Karet | `rubber` | 1.20e-6 | 1200 |
| Kustom | `custom` | 1.00e-6 | 1000 |

Densitas internal disimpan dalam kg/mm³ karena satuan internal aplikasi ini
selalu milimeter. Kolom kg/m³ ada karena itu angka yang biasa dipakai orang.
`custom` ada supaya Anda bisa memasukkan densitas sendiri untuk material yang
tidak ada di daftar.

Satuan tampilan yang tersedia: `mm`, `cm`, `m`, `in`, `ft`. Mengubahnya di
**Properti → Dokumen** hanya mengubah apa yang Anda baca dan ekspor, bukan
geometrinya.

---

## 19. Glosarium

Istilah CAD yang sudah akrab tetap ditulis dalam bahasa Inggris di seluruh
aplikasi ini, karena itu yang dipakai ruang gambar setiap hari. Daftar ini
menjelaskannya dalam Bahasa Indonesia.

| Istilah | Artinya di sini |
|---|---|
| **Boolean** | Menggabung (union), memotong (subtract), atau mengambil bagian bersama (intersect) dua solid. |
| **Body** | Satu benda padat di dalam dokumen. Satu fitur biasanya menghasilkan satu body. |
| **Chord tolerance** | Seberapa dekat permukaan datar hasil tessellasi mengikuti permukaan lengkung yang sebenarnya. Makin kecil, makin halus dan makin berat. |
| **CSG** | *Constructive solid geometry*: membangun bentuk dari operasi Boolean atas bentuk lain. Cara kerja mesin di aplikasi ini. |
| **Design intent** | Dokumen sebagai maksud, bukan sebagai mesh: parameter, hubungan, dan alasan. Bisa diekspor dan diimpor kembali menjadi model parametrik hidup. |
| **Draft** | Workspace gambar 2D. Juga berarti sudut tirus pada `extrude` (`taper`). |
| **DXF** | Format pertukaran gambar 2D. Ditulis sebagai AutoCAD R12, yang dibaca hampir semua paket CAD dan CAM. |
| **Extrude** | Menarik geometri 2D tertutup menjadi solid. |
| **Fitur** | Satu langkah di pohon riwayat. Menyuntingnya membangun ulang semua yang bergantung padanya. |
| **Fillet** | Pembulatan sudut. |
| **Gizmo** | Pegangan di viewport untuk menggeser, memutar, atau menskala dengan mouse. |
| **Hidden-line removal** | Menghapus garis yang tertutup benda lain, supaya gambar kerja terbaca seperti gambar teknik dan bukan seperti wireframe. |
| **Keyframe** | Nilai sebuah properti pada satu titik waktu. Di antara dua keyframe, nilainya dihitung dengan kurva easing. |
| **Ortho** | Kunci arah ke horizontal dan vertikal saat menggambar. |
| **Parameter bernama** | Angka yang diberi nama dan dipakai di banyak tempat lewat ekspresi. Inti dari CAD parametrik. |
| **Pattern** | Pengulangan sebuah fitur, linear atau melingkar. Ia tetap fitur, jadi jumlahnya bisa diubah kapan saja. |
| **Playhead** | Penunjuk waktu di timeline. |
| **Proyeksi sudut pertama** | Tata letak pandangan standar ISO/SNI, dan bawaan di edisi ini. |
| **Rebuild** | Menghitung ulang geometri dari pohon fitur. Lamanya tampil di status bar. |
| **Revolve** | Memutar geometri 2D di sekeliling sumbu menjadi solid. |
| **Rigid body** | Benda yang tidak berubah bentuk di simulasi fisika. |
| **Snap** | Menempelkan kursor ke titik penting: ujung, tengah, pusat, kuadran, perpotongan. |
| **Stack-up toleransi** | Penjumlahan toleransi sepanjang rantai dimensi, kasus terburuk maupun statistik (RSS). |
| **STL** | Format mesh untuk cetak 3D. Hanya triangle, tanpa parameter. |
| **Tessellasi** | Mengubah permukaan lengkung menjadi kumpulan triangle agar bisa digambar dan diekspor. |
| **Workspace** | Salah satu dari tiga mode kerja: Model, Draft, Simulasi. |

---

## 20. Tanya jawab

**Apakah ini butuh internet?**
Untuk membukanya pertama kali, ya. Setelah dipasang lewat **Bantuan → Offline
dan kepemilikan**, tidak. Versi desktop tidak butuh internet sama sekali.

**Apakah data saya dikirim ke mana pun?**
Tidak, dan itu ditegakkan oleh Content-Security-Policy peramban, bukan hanya
dijanjikan. Lihat Bab 13.

**Apakah ada model bahasa besar (LLM) di dalam fitur AI-nya?**
Tidak. Keduanya perencana lokal yang membaca kosa kata Bahasa Indonesia dan
menghasilkan fitur katalog. Tidak ada model, tidak ada kunci API, tidak ada
layanan awan. Konsekuensinya jujur: ia hanya mengerti apa yang memang
diprogramkan, dan menolak sisanya alih-alih menebak.

**Kenapa ia menolak kalimat saya?**
Karena menolak lebih murah daripada membangun hal yang salah tanpa memberi
tahu. Bab 3 berisi pola yang dipahaminya.

**Berapa besar model yang bisa ditangani?**
Batasnya jumlah triangle dan memori peramban, bukan jumlah fitur. Ratusan
fitur biasa; yang lebih dulu terasa adalah `seg` dan `steps` tinggi pada
banyak body sekaligus. Lihat Bab 14.5.

**Bisakah berkas saya dibuka di SolidWorks atau AutoCAD?**
Tidak langsung, karena `.tcad` adalah format aplikasi ini. Yang bisa dibawa:
STL, OBJ, PLY untuk 3D, dan DXF atau SVG untuk 2D. Riwayat fiturnya tidak
ikut lewat jalur itu, dan tidak ada format netral yang membawanya.

**Apakah `.tcad` akan tetap bisa dibuka nanti?**
Ia JSON polos dengan nomor skema, dan `migrate()` membereskan dokumen versi
lama saat dibuka. Berkas dari v1.0.0 dan v1.1.0 terbuka apa adanya di v1.1.1.

**Apakah simulasi fisikanya bisa dipakai untuk perhitungan kekuatan?**
Tidak. Ia memakai bounding-sphere per body: cepat, deterministik, dan cukup
untuk uji jatuh, konveyor, dan studi packing. Ini bukan analisis tegangan dan
tidak pernah mengaku begitu. Untuk sifat penampang dan kasus beban sederhana,
pakai **Analisis → Potongan**, dan tetap perlakukan hasilnya sebagai orde
besaran.

**Apakah angka biayanya bisa dipakai menawar?**
Bacalah bentuk jawabannya - proses mana yang menang, dimensi mana yang mendorong
harga - dan abaikan angka mutlaknya. Itu perkiraan orde besaran dari model tarif
generik, bukan penawaran.

**Apakah ada versi macOS?**
Tidak ada build desktop untuk macOS, karena `.dmg` tanpa tanda tangan ditolak
Gatekeeper. Versi peramban bekerja penuh di macOS.

**Apakah gratis, dan boleh dipakai untuk pekerjaan komersial?**
Ya, keduanya. Lisensinya MIT. Lihat Bab 21.

**Bagaimana cara tahu versi mana yang saya pakai?**
**Bantuan → Tentang TesserCAD-ID.** Di sana juga tertera hak ciptanya. Untuk
unduhan desktop, itu satu-satunya cara tahu perbaikan mana yang sudah Anda
punya, karena versi web selalu mengikuti kode terbaru sedangkan unduhan hanya
berubah kalau ada rilis baru.

---

## 21. Lisensi dan hak cipta

**TesserCAD-ID. Hak Cipta © 2026 Samuel Hasudungan Tampubolon.**

Perangkat lunak ini dilisensikan di bawah **Lisensi MIT**. Teks lengkapnya ada
di [LICENSE](../LICENSE). Ringkasnya, dalam bahasa biasa dan bukan sebagai
pengganti teks aslinya: Anda boleh memakai, menyalin, mengubah,
menggabungkan, menerbitkan, mendistribusikan, melisensikan ulang, dan menjual
salinan perangkat lunak ini, termasuk untuk keperluan komersial, dengan satu
syarat - pemberitahuan hak cipta dan izin di atas harus disertakan pada setiap
salinan atau bagian penting darinya. Perangkat lunak ini diberikan apa adanya,
tanpa jaminan apa pun.

### Komponen pihak ketiga

**three.js r169** disertakan tanpa modifikasi di `vendor/`, hak cipta pemilik
masing-masing, lisensi MIT. Teks lisensinya ikut di `vendor/THREE-LICENSE.txt`.
Ia **bukan** bagian dari karya yang dimiliki pemegang hak cipta di atas.

Dekomposisi Boolean BSP di `src/core/csg-core.js` mengikuti pendekatan csg.js
karya Evan Wallace (2011), MIT, ditulis ulang di atas typed array. Header
berkasnya mencatat derivasi itu.

Daftar lengkap, termasuk metode matematika yang dipublikasikan dan proyek
pendahulu yang memengaruhi kebutuhan tanpa menyumbang kode, ada di
[ATTRIBUTION.md](../ATTRIBUTION.md) dan [NOTICE](../NOTICE).

### Standar yang dirujuk

Dokumen standar ISO dan SNI yang dirujuk aplikasi ini **berhak cipta pada
badan penerbitnya masing-masing dan tidak direproduksi di sini**. Yang dipakai
hanya nilai tabel yang bersifat fakta teknis. Untuk pekerjaan yang akan
disertifikasi, rujuk dokumen standar yang berlaku, bukan aplikasi ini.

### Asal-usul dan keterbukaan

TesserCAD-ID adalah edisi Bahasa Indonesia dari TesserCAD, karya pemegang hak
cipta yang sama, juga MIT. Seberapa banyak yang dibagi antara keduanya diukur
dan dilaporkan, bukan dikira-kira: lihat [COMPARISON.md](../COMPARISON.md).

Catatan kepengarangan yang lengkap, termasuk pernyataan terbuka bahwa kodenya
ditulis dengan bantuan AI yang substansial, ada di
[PROVENANCE.md](../PROVENANCE.md). Kalau Anda mendaftarkan atau menilai karya
ini, bacalah dokumen itu lebih dulu.

---

## 22. Contoh terpandu

### Panel listrik, dari nol, dalam satu kalimat

1. `Ctrl ⇧ K`.
2. Ketik: `kotak panel 400 x 300 x 150 tebal 3 dengan 6 lubang gland 20`.
3. Baca rencananya. Perhatikan bahwa ukuran yang Anda sebut dipakai sebagai
   **ruang dalam** - itu urutan yang benar: yang harus masuk ke kotak
   menentukan kotaknya.
4. Balas `ya`.
5. Buka **Properti → Parameter**. Ubah `kotak_w` menjadi 500. Seluruh kotak,
   bibir tutup, boss, tutupnya, dan pola lubangnya ikut.
6. `Ctrl ⇧ D` untuk gambar kerjanya.

### Menara delapan lantai, dijadwalkan sebagai konstruksi 4D

1. `Ctrl ⇧ K`, ketik
   `tumpukan lantai 8 lantai, denah 9 meter kali 7 meter, tinggi lantai 3,6 meter`,
   balas `ya`.
2. `Ctrl ⇧ M`, ketik
   `jadwalkan urutan bangun, tiap lantai 3 hari, dari bawah ke atas`,
   balas `ya`.
3. `Space`. Geser playhead untuk melihat progres di hari mana pun.
4. `durasi 20 detik` kalau ingin animasinya lebih lambat.

### Braket yang diperiksa dan dihitung biayanya

1. `Ctrl ⇧ K`, ketik
   `braket L sayap 150 dan 100, lebar 90, tebal 10, baut M10, 3 lubang per sayap`,
   balas `ya`.
2. **Analisis → Kesehatan dokumen** untuk memeriksanya.
3. **Studio → Biaya** untuk perkiraan Rupiah per unit dan proses yang menang.
4. `ganti materialnya jadi aluminium` di chat, lalu lihat biayanya berubah.
