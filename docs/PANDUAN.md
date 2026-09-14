# Panduan TesserCAD-ID

Panduan tiga workspace, ditulis supaya bisa diikuti sambil membuka aplikasinya.

- [0. Antarmuka](#0-antarmuka)
- [1. Dua fitur AI](#1-dua-fitur-ai)
- [2. Dasar-dasar](#2-dasar-dasar)
- [3. Model — solid parametrik](#3-model--solid-parametrik)
- [4. Draft — gambar 2D](#4-draft--gambar-2d)
- [5. Simulasi — dimensi keempat](#5-simulasi--dimensi-keempat)
- [6. Berkas dan pertukaran](#6-berkas-dan-pertukaran)
- [7. Studio: periksa, hitung biaya, rilis](#7-studio-periksa-hitung-biaya-rilis)
- [8. Analisis: potongan, tabrakan, varian, versi](#8-analisis-potongan-tabrakan-varian-versi)
- [9. Gambar kerja, toleransi, dan teks](#9-gambar-kerja-toleransi-dan-teks)
- [10. Di ponsel dan tablet](#10-di-ponsel-dan-tablet)
- [11. Referensi papan ketik](#11-referensi-papan-ketik)
- [12. Contoh terpandu](#12-contoh-terpandu)

---

## 0. Antarmuka

**Menu bar.** Tiga belas menu di atas: Berkas, Sunting, Buat, Ubah, Tampilan,
Ukur, Draft, Simulasi, Ekspor, Jendela, Studio, Analisis, Bantuan. Submenu
terbuka saat disentuh kursor, toggle menampilkan tanda centang, dan yang tidak
berlaku saat ini dibuat kelabu — bukan disembunyikan — supaya Anda tetap tahu
ia ada dan bisa menebak kenapa belum bisa dipakai.

**Ribbon.** Baris kedua adalah toolbar kontekstual yang berubah mengikuti
workspace, dikelompokkan dan diberi label (Buat, Gabung, Ulang, Transform…).
Ia menggulir ke samping kalau jendelanya sempit.

**Command palette — `Ctrl K`.** Pencarian fuzzy berperingkat atas seluruh 200
perintah. Perintah yang baru Anda pakai muncul lebih dulu saat kotaknya masih
kosong. Ini cara tercepat mencapai apa pun yang shortcut-nya belum Anda hafal.

**Menu cepat — `Q`.** Delapan favorit bernomor tepat di kursor, berbeda di
tiap workspace. Tekan `Q` lalu `1`–`8` tanpa menggerakkan mouse.

**Menu konteks.** Klik kanan sebuah body di viewport, atau sebuah baris di
pohon fitur, untuk tepat operasi yang berlaku padanya.

**Panel.** `T` membuka-tutup panel kiri (outline), `N` panel kanan (properti).
Keduanya bisa dilipat supaya viewport memakai seluruh jendela.

**Status bar.** Sisi kiri memberi tahu apa yang diminta alat yang sedang aktif.
Sisi kanan menampilkan peta tombol mouse untuk workspace ini, jumlah seleksi,
satuan, dan statistik model termasuk berapa lama rebuild terakhir.

**Kartu belajar.** Daftar periksa kecil di sudut viewport melacak delapan hal
yang paling layak dicoba lebih dulu dan mencentangnya sendiri. Tutup dengan ✕,
atau kembalikan dari **Bantuan → Tampilkan kartu belajar**.

---

## 1. Dua fitur AI

Keduanya **perencana lokal, bukan model bahasa dan bukan layanan awan.** Tidak
ada server, tidak ada kunci API, tidak ada yang meninggalkan peramban Anda.
Keduanya membaca kosa kata Bahasa Indonesia lalu menghasilkan **fitur katalog
yang sama seperti hasil klik** — bisa disunting, digeser, dan dikendalikan
parameter setelahnya — bukan mesh mati.

Pola pemakaiannya sama untuk keduanya:

1. Ketik satu kalimat, tekan `Enter`.
2. Studio menjawab dengan **rencana**: apa yang ia baca, apa yang akan
   dibangun, apa yang ia asumsikan, dan setara berapa langkah-klik manual.
3. Belum ada yang berubah di dokumen Anda. Balas `ya` untuk menerapkan, atau
   sebut yang perlu diubah, atau `batal`.
4. Satu turn masuk sebagai **satu langkah Undo**.

### 1.1 AI Chat ke 3D — `Ctrl ⇧ K`

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
Salah klik, scroll, dan Undo dihitung nol — jadi angkanya adalah batas bawah.

### 1.2 AI Chat ke simulasi 4D — `Ctrl ⇧ M`

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
urutan pohon fitur. `jadwalkan lantainya` cukup — tidak perlu memilih dua belas
body satu-satu. Kata `-nya` dipahami, jadi `porosnya` sama dengan `poros`.
Kelompok yang dikenalinya: lantai, kolom, balok, pelat, tutup, segmen, poros,
anak tangga, baut, rangka, dinding, tulangan.

**Untuk motor dan keyframe ia menolak menebak.** Kalau tidak ada nama yang
disebut dan tidak ada yang dipilih, ia bertanya — karena motor pada semua body
sekaligus hampir selalu bukan yang dimaksud.

**Waktu nyata dipetakan ke timeline.** "Tiap lantai 3 hari" untuk delapan
lantai adalah 24 hari nyata; timeline-nya jadi sekitar 6,4 detik, dan
transkripnya menyebut rasionya (1 detik animasi ≈ 3,75 hari). Itu cara 4D BIM
menampilkannya, dan satu-satunya cara yang jujur sekaligus bisa ditonton.

**Fisika memakai bounding-sphere** tiap body: cepat, deterministik, dan cukup
untuk uji jatuh, konveyor, dan studi packing. **Ini bukan analisis tegangan**
dan tidak pernah mengaku begitu.

Satu setup 4D lengkap — jadwal, motor, fisika, durasi, laju frame — setara
**60-80 langkah-klik**. Pitanya lebih rendah dari sisi 3D, dan itu memang
apa adanya.

---

## 2. Dasar-dasar

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

## 3. Model — solid parametrik

**Primitif** dari **Buat**: box, silinder, bola, kerucut, torus, tabung, baji,
prisma, piramida, pelat, heliks. Masing-masing punya field sendiri di panel
kanan, dan semuanya menerima ekspresi.

**Boolean** dari **Ubah**: Union (`Ctrl +`), Subtract (`Ctrl -`), Intersect.
Subtract memotong setiap body berikutnya dari body pertama yang dipilih, jadi
urutan seleksinya penting.

**Pattern dan mirror**: linear (dua sumbu sekaligus), melingkar, dan mirror
terhadap bidang. Pattern adalah fitur, bukan salinan — jumlahnya masih bisa
diubah nanti, dan itu sebabnya resep AI selalu memakai pattern.

**Transform**: `G` geser, `R` rotasi, `S` skala secara modal (gerakkan mouse,
tahan `Shift` untuk presisi, tahan `Ctrl` untuk mematikan snap), atau gizmo
dengan `W` / `⇧E` / `⇧R`. `D` menjatuhkan body ke lantai.

**Dari gambar**: pilih geometri tertutup di workspace Draft, lalu
**Buat → Extrude** atau **Revolve**. Menyunting gambarnya membangun ulang
solidnya.

**Material** mengatur tampilan sekaligus densitas yang dipakai properti massa.

---

## 4. Draft — gambar 2D

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

## 5. Simulasi — dimensi keempat

Tiga hal berbeda hidup di sini, dan `Space` memutar ketiganya.

**Keyframe.** Pilih body, geser playhead, ubah salah satu dari sebelas
properti animasi (geser X/Y/Z, putar X/Y/Z, skala X/Y/Z, opasitas, terlihat),
lalu kunci. Dua belas kurva easing tersedia. Timeline di bawah viewport bisa
digeser, di-zoom, dan keyframe-nya ditarik.

**Urutan bangun 4D.** Beri tiap body waktu mulai dan durasi — urutan
konstruksi klasik. Body tetap tersembunyi sampai slotnya dimulai, jadi
menggeser playhead menunjukkan progres di tanggal mana pun. Delapan mode
kemunculan: langsung, memudar, tumbuh dari tengah, naik, jatuh, geser X,
geser Y, dan cor bertahap.

**Fisika rigid-body.** Gravitasi, lantai, massa, restitusi, gesekan, dan motor
per body. Motor adalah penggerak analitik — ia berjalan tepat sesuai jadwal
tanpa peduli gaya, yang justru diinginkan untuk mekanisme. Lima tipe: putar
terus, ayun, bolak-balik, orbit, dan tidak ada.

**Rekam animasi** memutar ulang timeline frame demi frame dan menyimpan WebM
dengan encoder peramban Anda. Biarkan tab ini di depan sampai selesai.

Untuk semua di atas, **AI Chat ke 4D biasanya lebih cepat** daripada menyetel
tiap body satu-satu. Lihat [bagian 1.2](#12-ai-chat-ke-simulasi-4d--ctrl--m).

---

## 6. Berkas dan pertukaran

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

## 7. Studio: periksa, hitung biaya, rilis

**Mulai dari kebutuhan** (`Studio → Mulai dari kebutuhan`). Nyatakan
kebutuhannya — beban, bentang, tekanan, isi yang harus masuk — dan dapatkan
model parametrik beserta perhitungan ukurannya, lengkap dengan peringatan atas
apa yang tidak dihitungnya.

**Design Doctor** menjalankan enam belas pemeriksaan berkelanjutan dengan
perbaikan: fitur gagal bangun, parameter yang tidak menggerakkan apa pun, body
tidak kedap, dinding di bawah minimum proses, nama ganda, Boolean satu
masukan, dan seterusnya. Indikatornya ada di status bar.

**Biaya** memperkirakan ongkos per unit dalam Rupiah dari model tarif generik,
memilih proses, dan menunjukkan kuantitas persilangannya. **Baca bentuk
jawabannya** — proses mana yang menang, dimensi mana yang mendorong harga —
dan abaikan angka mutlaknya. Itu perkiraan orde besaran, bukan penawaran.

**Kesehatan dokumen** memeriksa presisi (titik jauh dari origin), muatan
duplikat, dan berat berkas.

**Rilis** membungkus satu paket serah-terima: gambar kerja, BOM, spesifikasi
teks, dan catatan, dalam satu arsip.

**Desain sebagai kode** (`Ctrl ⇧ C`) menampilkan dokumen sebagai teks yang
bisa disunting, dua arah, dengan diff sebelum diterapkan.

---

## 8. Analisis: potongan, tabrakan, varian, versi

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

## 9. Gambar kerja, toleransi, dan teks

**Gambar kerja** (`Ctrl ⇧ D`) membuat lembar ortografik dengan hidden-line
removal sungguhan, blok judul, skala, dan proyeksi **sudut pertama (ISO/SNI)**
sebagai bawaan. Kertas A4/A3. Lembar bisa diekspor ke SVG atau DXF, atau
dikembalikan ke workspace Draft untuk disunting.

**Toleransi** menghitung stack-up rantai (kasus terburuk dan RSS), Cp/Cpk, dan
suaian ISO 286 — sepuluh suaian bernama dari jalan longgar sampai suaian pukul,
masing-masing dengan catatan kapan dipakai.

**Fastener** adalah pustaka baut metrik ISO dengan data teknik: proof load,
torsi, lubang clearance ISO 273, bor tap, dan catatan kedalaman ulir per
material.

---

## 10. Di ponsel dan tablet

Di bawah 700 px, antarmukanya menjadi antarmuka sentuh: panel muncul sebagai
bottom sheet, menu jadi lembar penuh, target sentuh diperbesar, dan tidak ada
zoom saat field angka difokuskan. Di tablet satu panel ter-dock sekaligus.
Gestur: satu jari orbit, dua jari pan dan zoom, tekan-tahan untuk menu konteks.

Kedua chat AI bekerja sama saja di ponsel — dan di sanalah keduanya paling
berguna, karena mengetik satu kalimat jauh lebih mudah daripada mengejar
submenu dengan jempol.

---

## 11. Referensi papan ketik

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

## 12. Contoh terpandu

### Panel listrik, dari nol, dalam satu kalimat

1. `Ctrl ⇧ K`.
2. Ketik: `kotak panel 400 x 300 x 150 tebal 3 dengan 6 lubang gland 20`.
3. Baca rencananya. Perhatikan bahwa ukuran yang Anda sebut dipakai sebagai
   **ruang dalam** — itu urutan yang benar: yang harus masuk ke kotak
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
