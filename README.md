# TesserCAD-ID

**Studio CAD parametrik berbahasa Indonesia yang berjalan sepenuhnya di peramban.**
Pemodelan solid 3D, drafting 2D, dan simulasi 4D (tiga dimensi plus waktu).
Satuan metrik, gambar kerja sudut pertama ISO/SNI, mata uang Rupiah.
Dua fitur utamanya adalah **AI Chat ke 3D** dan **AI Chat ke simulasi 4D**:
satu kalimat Bahasa Indonesia, satu rakitan parametrik yang bisa disunting.

![MIT licence](https://img.shields.io/badge/licence-MIT-3da639)
![Tanpa langkah build](https://img.shields.io/badge/build-none-4c9fff)
![Bahasa Indonesia saja](https://img.shields.io/badge/UI-Bahasa%20Indonesia%20saja-4c9fff)
![200 commands](https://img.shields.io/badge/commands-200-8957e5)
![1087 tes headless](https://img.shields.io/badge/tes%20headless-1087%20lolos-3da639)
![Unduhan 88 MB](https://img.shields.io/badge/unduhan-88%20MB-3da639)
![Siap sentuh](https://img.shields.io/badge/touch-ready-4c9fff)

> **▶ Pakai sekarang, tanpa instalasi:**
> https://samuelhtampubolon.github.io/TesserCAD-ID/
>
> **⬇ Unduh untuk dipakai offline:**
> [**Releases**](https://github.com/samuelhtampubolon/TesserCAD-ID/releases)
> - ambil `TesserCAD-ID-1.1.0-portable.exe`, jalankan. Tidak ada installer,
> tidak perlu hak administrator. Ada `TesserCAD-ID-1.1.0-setup.exe` (installer
> NSIS per-pengguna) dan build Linux (AppImage, tar.gz) di rilis yang sama.
> Arsip `TesserCAD-ID-1.1.0-windows-x64.7z` juga terlampir: unduhan Windows
> terkecil, tapi perlu 7-Zip untuk membukanya. Ia tidak ada di v1.0.0, karena
> glob langkah rilisnya baru diperbaiki setelah tag itu dibuat.
> **Tidak ada build macOS**: `.dmg` tanpa tanda tangan
> ditolak Gatekeeper, jadi yang ditawarkan hanya versi web dan Windows/Linux.
>
> Apa yang berubah di tiap versi: [CHANGELOG.md](CHANGELOG.md). Versi web
> selalu mengikuti `main`; unduhan desktop hanya berubah kalau ada tag baru.
>
> Salinan web juga bekerja offline setelah dibuka: **Bantuan → Offline dan
> kepemilikan** memasangnya, lalu jaringan boleh dimatikan.

TesserCAD-ID adalah edisi Indonesia-saja dari
[TesserCAD](https://github.com/samuelhtampubolon/TesserCAD): mesin geometri,
Boolean, command registry, Design Doctor, gambar kerja, toleransi, dan simulasi
4D yang sama. Bedanya tiga hal, dan semuanya terukur di
[COMPARISON.md](COMPARISON.md):

1. **Bahasanya ada di sumbernya, bukan di atasnya.**
   [TesserCADIna](https://github.com/samuelhtampubolon/TesserCADIna) menyimpan
   literal bahasa Inggris lalu menerjemahkannya saat render, lewat kamus 1.938
   baris yang harus ikut diunduh peramban. Di sini tidak ada kamus: setiap teks
   yang dilihat pengguna sudah Bahasa Indonesia di kodenya. Istilah CAD yang
   sudah akrab tetap Inggris (Extrude, Boolean, STL, Gizmo, Undo, Draft, Snap,
   Ortho, ISO, DXF) karena itu yang dipakai ruang gambar setiap hari.
2. **Lebih ringan.** Halaman webnya 8,1% lebih kecil dari TesserCADIna setelah
   gzip, dan unduhan desktopnya **88 MB terukur** - bukan 135 MB.
3. **Dua fitur AI yang tidak ada di keduanya.** Keduanya berjalan lokal.

## Dua fitur utamanya

Keduanya **perencana lokal, bukan model bahasa dan bukan layanan awan**. Tidak
ada server, tidak ada kunci API, tidak ada yang meninggalkan peramban Anda.
Yang dilakukannya: membaca kosa kata Bahasa Indonesia - bentuk, rakitan, angka,
satuan, callout ulir, jumlah, waktu - lalu menghasilkan **fitur katalog yang
sama persis seperti hasil klik**, bukan mesh mati. Setiap turn ditunjukkan dulu
sebagai rencana; Anda yang bilang "ya".

### 1. AI Chat ke 3D  ·  `Ctrl ⇧ K`

```
Anda    : buatkan kotak panel 400 x 300 x 150 tebal 3 dengan 6 lubang gland 20
Studio  : Yang saya baca:
          · kotak panel: lebar dalam 400 mm, dalam dalam 300 mm, tinggi dalam 150 mm,
            tebal dinding 3 mm, jumlah gland 6, diameter gland 20 mm
          Rencananya 22 fitur dan 6 parameter bernama.
          Yang saya asumsikan:
          · Dimensi yang Anda sebut dipakai sebagai ruang dalam; ukuran luarnya 406 × 306 mm.
          · Boss pemasangan di-tap M4 dan sejajar dengan lubang tutup.
          Setara sekitar 480 langkah-klik jika dikerjakan manual.
          Katakan "ya" untuk membangunnya, atau sebut yang perlu diubah.
```

Sebelas resep rakitan, semuanya berkonteks Indonesia dan metrik: pelat berbaut,
braket L, flens pipa, kotak panel, poros bertingkat, rangka rak, tangga baja,
simpul kolom-balok, dudukan motor, saluran U precast, dan tumpukan lantai.
Bentuk tunggal juga bisa (`silinder Ø40 tinggi 100`), begitu pula suntingan
(`tebalnya jadi 16`, `ganti materialnya jadi aluminium`) dan pertanyaan
(`berapa massanya`).

Satu kalimat berat - tumpukan dua belas lantai - **setara 868 langkah-klik**.
Itu angka terukur, bukan klaim: modelnya ada di
[`src/ai/klik.js`](src/ai/klik.js), ditulis sebagai data, dan
[`tools/tests/chat3d.mjs`](tools/tests/chat3d.mjs) menguji bahwa resep terberat
memang jatuh di pita 700-900 itu. Biayanya dihitung konservatif: tiap fitur
empat klik (buka Create, telusuri submenu, pilih, seleksi), tiap field angka dua,
tiap Boolean empat. Salah klik, scroll, dan Undo dihitung nol.

### 2. AI Chat ke simulasi 4D  ·  `Ctrl ⇧ M`

```
Anda    : jadwalkan urutan bangun, tiap lantai 3 hari, dari bawah ke atas
Studio  : Yang saya baca:
          · 8 body (lantai, dari nama fitur) dijadwalkan berurutan
          · 3 hari per body, mode "Tumbuh dari tengah"
          · timeline 6.4 detik untuk 24 hari
          Yang perlu Anda tahu:
          · Waktu nyata dipetakan ke timeline: 1 detik animasi ≈ 3.75 hari.
          Setara sekitar 40 langkah-klik jika dikerjakan manual.
```

Urutan bangun 4D, motor (`putar porosnya 120 rpm`), keyframe (`angkat tutupnya
200 mm dalam 2 detik`), fisika rigid-body (`jatuhkan dari 500 mm, restitusi
0,3`), durasi, dan laju frame. Ia **mencari sendiri body yang Anda maksud dari
nama fitur di dokumen**, jadi `jadwalkan lantainya` cukup - tidak perlu memilih
dua belas body satu-satu di pohon fitur.

Pita di sini memang lebih rendah dan itu jujur: satu setup 4D lengkap - jadwal,
motor, fisika, durasi, laju frame - **setara 60-80 langkah-klik**, bukan
ratusan. Untuk motor dan keyframe ia menolak menebak target: kalau tidak ada
body yang disebut atau dipilih, ia bertanya.

## Yang ada di dalamnya

| | Gaya SolidWorks | Gaya AutoCAD | Dimensi keempat |
|---|---|---|---|
| **Workspace** | **Model** | **Draft** | **Simulasi** |
| AI Chat Bahasa Indonesia | ✔ | | ✔ |
| Riwayat fitur parametrik | ✔ | | |
| Primitif solid + boolean | ✔ | | |
| Extrude / revolve sketch | ✔ | ✔ | |
| Pattern, mirror, transform | ✔ | ✔ | |
| Layer, object snap, dimensi | | ✔ | |
| Tukar DXF / SVG | | ✔ | |
| Timeline, keyframe, easing | | | ✔ |
| Urutan konstruksi (4D BIM) | | | ✔ |
| Dinamika rigid-body & motor | | | ✔ |
| Rekam video animasi | | | ✔ |

Semua dikendalikan **parameter bernama**. Ketik `pelat_w / 2 - kelonggaran` di
field dimensi mana pun - itulah yang membuat ini CAD, bukan program gambar 3D.
Resep AI pun menulis ekspresi, bukan angka, supaya hasilnya tetap bisa diubah
dari satu field.

Satuan internal selalu milimeter. Mata uang default studio: **Rp**. Proyeksi
gambar kerja default: **sudut pertama (ISO/SNI)**. Kertas A4/A3.

## Seberapa dekat dengan keduanya, diukur bukan diklaim

```bash
node tools/parity.mjs ../TesserCAD ../TesserCADIna
```

| | TesserCAD | TesserCADIna |
|---|---|---|
| Kemiripan sumber | **78,4%** | **79,7%** |
| Perintah upstream yang hilang di sini | 4 | 4 |
| Perintah baru di sini | 2 | 2 |
| Unduhan web (gzip) | 0,547 vs 0,532 MB (**+2,9%**) | 0,547 vs 0,596 MB (**−8,1%**) |
| Unduhan Windows, terukur di CI | 88,3 vs 98 MB installer (**−10%**) | 88,3 vs 135 MB arsip (**−35%**) |
| Kalimat sumber yang masih Inggris | 1,6% vs 19,2% | 1,6% vs 22,3% |

Empat perintah sengaja tidak dibawa, karena edisi ini memilih lebih ringan:
peta deviasi mesh (`dev.compare`), merge tiga arah antar cabang (`vcs.merge`),
dan dua ekspor glTF (`export.glb`, `export.gltf`) yang membawa serta 24 KB
gzip vendor. Alasan tiap penghapusan ada di [COMPARISON.md](COMPARISON.md).

**Soal angka +2,9% itu, terus terang.** Halaman web di sini sedikit lebih besar
dari TesserCAD karena membawa lapisan AI 34,6 KB gzip yang TesserCAD tidak
punya. Tanpa lapisan itu payload-nya 0,514 MB - 3,5% lebih kecil dari
TesserCAD. Jadi klaim "lebih ringan" berlaku penuh terhadap TesserCADIna
(−8,1%) dan terhadap unduhan desktop keduanya; terhadap halaman web TesserCAD
ia lebih ringan pada fitur yang sama dan 2,9% lebih besar kalau dua fitur AI
itu ikut dihitung. Angkanya dihasilkan `tools/parity.mjs`, jadi siapa pun bisa
memeriksanya sendiri.

**Dan soal 79,7% terhadap TesserCADIna, juga terus terang.** Target awalnya
65-75%. Itu tidak bisa dipenuhi bersamaan dengan 75-85% terhadap TesserCAD,
dan aritmetikanya sederhana: TesserCADIna sendiri 89,6% identik dengan
TesserCAD, jadi apa pun yang 80% mirip TesserCAD pasti kira-kira sama miripnya
dengan TesserCADIna. Menurunkan yang satu tanpa menurunkan yang lain berarti
merusak kode dengan sengaja. Jadi angkanya dilaporkan apa adanya.

## Menjalankan secara lokal

Tidak ada langkah build. Sajikan folder ini:

```bash
python3 -m http.server 8080
```

Lalu buka `http://localhost:8080`.

```bash
npm test              # 1087 pemeriksaan headless, di bawah setengah menit
npm run test:browser  # 407 pemeriksaan di 11 suite Chromium sungguhan
```

## Build desktop

Dijalankan di GitHub Actions saat Anda menandai rilis `v*`, atau secara lokal:

```bash
cd desktop
npm install
npm run dist
```

Artefak: `TesserCAD-ID-1.1.0-portable.exe` (jalan langsung, tanpa instalasi),
`TesserCAD-ID-1.1.0-setup.exe` (installer per-pengguna), dan
`TesserCAD-ID-1.1.0-windows-x64.7z` (arsip, unduhan terkecil).

### Ukuran unduhannya: 88 MB, terukur - bukan 70 MB

**Halaman ini pernah menjanjikan "sekitar 70 MB, di bawah 80 MB". Itu tidak
benar, dan gerbang ukuran di CI yang membuktikannya** pada build Windows
pertama yang pernah berjalan:

| Berkas | Terukur |
|---|---|
| `TesserCAD-ID-1.1.0-portable.exe` | **88,26 MB** |
| `TesserCAD-ID-1.1.0-setup.exe` | **88,48 MB** |
| `TesserCAD-ID-1.1.0-windows-x64.7z` | **87,86 MB** |

Ketiga angka itu dari build v1.1.0 sendiri, diambil dari ukuran berkas yang
benar-benar terlampir di rilisnya (92.545.591, 92.776.300 dan 92.129.282 bita).
Sebelumnya tabel ini memuat angka build v1.0.0; ketiganya bergeser 0,01 MB, yang
memberi tahu satu hal yang berguna: yang menentukan ukuran adalah Electron dan
LZMA, bukan isi aplikasinya. Gerbang ukuran mengukur ulang setiap build, jadi
kalau tag berikutnya keluar berbeda, yang berubah adalah tabel ini.

Angka itu dikoreksi di sini alih-alih batas gerbangnya dinaikkan supaya
janjinya tetap "lolos". Ketiganya berjarak 0,7 MB satu dari yang lain, yang
memberi tahu satu hal penting: **format arsipnya bukan variabelnya, Electron 44
yang variabelnya.** Satu-satunya tuas yang benar-benar mencapai di bawah 80 MB
adalah mem-pin Electron major yang lebih lama, dan itu berarti melepas
pembaruan keamanan Chromium - keputusan pemilik repositori, bukan efek samping
sebuah konfigurasi. Lihat **Yang perlu Anda lakukan sendiri** di bawah.

Yang tetap benar: ini **10% lebih kecil dari installer TesserCADIna (98 MB) dan
35% lebih kecil dari arsipnya (135 MB)** untuk aplikasi yang sama, dan itu
berat Electron 44, bukan berat aplikasinya - sumber aplikasi ini sendiri sekitar
2 MB. Tiga hal dipilih berbeda dari kedua edisi lain untuk sampai ke situ:

1. **LZMA solid** (`compression: maximum`) alih-alih deflate. Ini yang terbesar
   pengaruhnya.
2. **Satu locale Chromium** (`id`) alih-alih dua atau semuanya. Antarmuka ini
   hanya satu bahasa, jadi pack lain tidak mungkin terbaca.
3. **Tanpa arsip zip.** Yang ditawarkan `portable` - satu `.exe` yang jalan
   tanpa instalasi, yang memang alasan orang memilih zip - plus installer dan
   `.7z`. Ketiganya dibangun sejak v1.0.0, tapi `.7z`-nya baru terlampir sejak
   v1.1.0: glob langkah rilisnya masih menyebut `zip` saat v1.0.0 ditandai. Dua
   pemeriksaan sekarang menjaga agar unduhan yang ditawarkan halaman ini selalu
   unduhan yang benar-benar dilampirkan.

**Harga yang harus disebut:** LZMA solid dan self-extractor sama-sama terlihat
seperti executable terpaket bagi sebagian antivirus, jadi jalan pertama bisa
memunculkan peringatan tambahan di atas peringatan SmartScreen yang memang
sudah muncul untuk berkas tanpa tanda tangan. TesserCAD dan TesserCADIna
memilih menghindari itu; edisi ini memilih ukurannya, dan menyebut harganya di
sini dan di [SECURITY.md](SECURITY.md). Yang tersedia sebagai gantinya adalah
SHA-256 di samping tiap berkas dan atestasi provenance bertanda tangan.

Ukurannya diperiksa setiap build: langkah **The Windows download is the size
the README promises** di `.github/workflows/desktop.yml` mencetak ukuran
sebenarnya dan **menggagalkan build** kalau melewati 90 MB - sekitar 1,5 MB di
atas yang dihasilkannya sekarang. Batas itu adalah janjinya, bukan plafon yang
dipilih agar selalu lolos: kalau ia merah, yang berubah adalah halaman ini,
bukan angka di gerbangnya. Itulah yang terjadi pada build pertama.

## Yang perlu Anda lakukan sendiri

Dua hal di bawah ini sudah selesai dan dicatat karena keduanya sekali jalan
per repositori; yang ketiga masih terbuka dan memang keputusan Anda.

1. ~~**Nyalakan GitHub Pages**~~ - **sudah menyala.** Settings → Pages →
   Source: **GitHub Actions**. Setiap push ke `main` sekarang menerbitkan ulang
   halamannya sendiri, dengan job `test` sebagai gerbangnya, jadi commit yang
   merusak mesin geometri tidak bisa sampai ke situs publik.

   Tidak ada workflow yang bisa menyalakannya sendiri: membuat situs Pages
   butuh hak admin repositori yang tidak dibawa `GITHUB_TOKEN`. Kalau suatu
   saat ia dimatikan, workflow "Deploy" akan merah dengan anotasi yang menyebut
   klik persis itu, bukan REST 404 yang tidak menolong siapa pun.

2. ~~**Rilis desktop**~~ - **v1.0.0 sudah terbit**, dan rilis berikutnya
   dilakukan dengan cara yang sama. Halaman [Releases][rel] kosong sampai ada
   tag `v*`, dan tag itulah yang menyuruh Actions membangun serta melampirkan
   berkasnya. Nomor tag harus sama dengan `desktop/package.json`; workflow
   menolak tag yang tidak cocok, karena nama setiap berkas diambil dari
   manifes, bukan dari tag.

   Lewat peramban, tanpa baris perintah: **Releases → Draft a new release →
   Choose a tag →** ketik `v1.1.0` **→ Create new tag: v1.1.0 on publish →**
   Target: `main` **→ Publish release**.

   Lewat baris perintah, yang juga memeriksa versi dan tag ganda lebih dulu:

   ```bash
   bash tools/release.sh --dry-run   # lihat apa yang akan ditandai
   bash tools/release.sh             # tandai dan dorong
   ```

   **Kenapa v1.1.0 ada:** binari v1.0.0 dibangun dari commit sebelum dua
   perbaikan keamanan di [SECURITY.md](SECURITY.md) masuk, jadi unduhan desktop
   v1.0.0 masih membawa bug yang membuat `.tcad` bikinan bisa menggantung tab.
   Versi web selalu ikut `main`, jadi ia sudah bersih sejak merge; unduhan
   desktop hanya berubah kalau ada tag baru. Itu sebabnya versi di sini 1.1.0.

3. **Putuskan soal 88 MB versus 80 MB.** Ini satu-satunya hal di repositori
   ini yang tidak memenuhi spesifikasi awalnya, dan keputusannya milik Anda
   karena harganya keamanan, bukan konfigurasi.

   Yang terukur sekarang: 88,26 MB. Yang diminta: di bawah 80 MB. Satu-satunya
   tuas yang mencapainya adalah **mem-pin Electron major yang lebih lama** -
   kira-kira Electron 33 atau 34 akan cukup, karena raw Electron 44 sekitar
   190 MB dan LZMA-nya menahan rasio 0,46. Harganya: pembaruan keamanan
   Chromium berhenti sampai major itu.

   Argumen bahwa itu **bisa** diterima di sini: proses desktop ini menolak
   setiap hostname di tingkat proses (`--host-resolver-rules=MAP * ~NOTFOUND`)
   dan hanya memuat berkas lokal lewat skema privat, jadi permukaan serangan
   jaringan Chromium praktis tidak terpakai - model ancaman di
   [SECURITY.md](SECURITY.md) menyebut berkas, bukan jaringan, sebagai
   masukan tak terpercayanya.

   Argumen bahwa itu **tetap keputusan Anda**: `tools/tests/desktop.mjs`
   dengan sengaja menuntut Electron major yang masih didukung, dan menukar itu
   diam-diam demi 8 MB persis kebalikan dari cara repositori ini bekerja.

   Kalau Anda memilih Electron lama: turunkan `electron` di
   `desktop/package.json`, ubah ambang di `tools/tests/desktop.mjs`, turunkan
   `cap` di `.github/workflows/desktop.yml` ke 80, dan perbaiki angka di
   halaman ini. Kalau Anda memilih tetap di Electron 44, tidak ada yang perlu
   dikerjakan: semua angka di repositori ini sudah yang terukur.

**Belum menandai, tapi butuh `.exe`-nya sekarang?** Setiap build menyimpan
artefaknya di tab **Actions**: buka run **Desktop build** yang hijau, gulir ke
**Artifacts**, ambil `tessercad-id-windows`. Isinya sama persis dengan yang akan
dilampirkan ke rilis. Bedanya: artefak Actions hanya bisa diunduh sambil masuk
ke akun GitHub, terbungkus satu lapis arsip tambahan, dan dihapus otomatis
setelah 90 hari. Rilis tidak.

[rel]: https://github.com/samuelhtampubolon/TesserCAD-ID/releases

## Lisensi

MIT. Lihat [LICENSE](LICENSE), [NOTICE](NOTICE), dan
[ATTRIBUTION.md](ATTRIBUTION.md). Mesin dan arsitektur berasal dari TesserCAD,
MIT, © Samuel Tampubolon.
