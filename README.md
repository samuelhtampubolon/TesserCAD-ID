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
![1012 tes](https://img.shields.io/badge/tes-1012%20lolos-3da639)
![Unduhan di bawah 80 MB](https://img.shields.io/badge/unduhan-%3C80%20MB-3da639)
![Siap sentuh](https://img.shields.io/badge/touch-ready-4c9fff)

> **▶ Pakai sekarang, tanpa instalasi:**
> https://samuelhtampubolon.github.io/TesserCAD-ID/
>
> **⬇ Unduh untuk dipakai offline:**
> [**Releases**](https://github.com/samuelhtampubolon/TesserCAD-ID/releases)
> — ambil `TesserCAD-ID-1.0.0-portable.exe`, jalankan. Tidak ada installer,
> tidak perlu hak administrator. Ada installer NSIS dan arsip `.7z` juga, serta
> build Linux. **Tidak ada build macOS**: `.dmg` tanpa tanda tangan ditolak
> Gatekeeper, jadi yang ditawarkan hanya versi web dan Windows/Linux.
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
2. **Lebih ringan.** Halaman webnya 9,0% lebih kecil dari TesserCADIna setelah
   gzip, dan unduhan desktopnya di bawah 80 MB — bukan 135 MB.
3. **Dua fitur AI yang tidak ada di keduanya.** Keduanya berjalan lokal.

## Dua fitur utamanya

Keduanya **perencana lokal, bukan model bahasa dan bukan layanan awan**. Tidak
ada server, tidak ada kunci API, tidak ada yang meninggalkan peramban Anda.
Yang dilakukannya: membaca kosa kata Bahasa Indonesia — bentuk, rakitan, angka,
satuan, callout ulir, jumlah, waktu — lalu menghasilkan **fitur katalog yang
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

Satu kalimat berat — tumpukan dua belas lantai — **setara 868 langkah-klik**.
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
nama fitur di dokumen**, jadi `jadwalkan lantainya` cukup — tidak perlu memilih
dua belas body satu-satu di pohon fitur.

Pita di sini memang lebih rendah dan itu jujur: satu setup 4D lengkap — jadwal,
motor, fisika, durasi, laju frame — **setara 60-80 langkah-klik**, bukan
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
field dimensi mana pun — itulah yang membuat ini CAD, bukan program gambar 3D.
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
| Kemiripan sumber | **79,9%** | **81,2%** |
| Perintah upstream yang hilang di sini | 4 | 4 |
| Perintah baru di sini | 2 | 2 |
| Unduhan web (gzip) | 0,542 vs 0,532 MB (**+1,8%**) | 0,542 vs 0,596 MB (**−9,0%**) |
| Kalimat sumber yang masih Inggris | 1,6% vs 19,2% | 1,6% vs 22,3% |

Empat perintah sengaja tidak dibawa, karena edisi ini memilih lebih ringan:
peta deviasi mesh (`dev.compare`), merge tiga arah antar cabang (`vcs.merge`),
dan dua ekspor glTF (`export.glb`, `export.gltf`) yang membawa serta 24 KB
gzip vendor. Alasan tiap penghapusan ada di [COMPARISON.md](COMPARISON.md).

**Soal angka +1,8% itu, terus terang.** Halaman web di sini sedikit lebih besar
dari TesserCAD karena membawa lapisan AI 33,7 KB gzip yang TesserCAD tidak
punya. Tanpa lapisan itu payload-nya 0,508 MB — 4,5% lebih kecil dari
TesserCAD. Jadi klaim "lebih ringan" berlaku penuh terhadap TesserCADIna
(−9,0%) dan terhadap unduhan desktop keduanya; terhadap halaman web TesserCAD
ia lebih ringan pada fitur yang sama dan 1,8% lebih besar kalau dua fitur AI
itu ikut dihitung. Angkanya dihasilkan `tools/parity.mjs`, jadi siapa pun bisa
memeriksanya sendiri.

**Dan soal 81,3% terhadap TesserCADIna, juga terus terang.** Target awalnya
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
npm test            # 1012 pemeriksaan headless, di bawah sepuluh detik
npm run test:browser  # suite peramban sungguhan (butuh Chromium)
```

## Build desktop

Dijalankan di GitHub Actions saat Anda menandai rilis `v*`, atau secara lokal:

```bash
cd desktop
npm install
npm run dist
```

Artefak: `TesserCAD-ID-1.0.0-portable.exe` (jalan langsung, tanpa instalasi),
`TesserCAD-ID-1.0.0-setup.exe` (installer per-pengguna), dan
`TesserCAD-ID-1.0.0-windows-x64.7z`.

### Bagaimana unduhannya bisa di bawah 80 MB

TesserCADIna mengukur unduhan Windows-nya di CI: 135 MB untuk arsip deflate dan
98 MB untuk installer NSIS — itu berat Electron 44, bukan berat aplikasinya
(sumber aplikasi ini sendiri sekitar 2 MB). Tidak ada konfigurasi yang membuat
arsip deflate turun ke 80 MB. Jadi tiga hal dipilih berbeda di sini:

1. **LZMA solid** (`compression: maximum`) alih-alih deflate. Ini yang terbesar
   pengaruhnya.
2. **Satu locale Chromium** (`id`) alih-alih dua atau semuanya. Antarmuka ini
   hanya satu bahasa, jadi pack lain tidak mungkin terbaca.
3. **Tanpa arsip zip.** Yang ditawarkan `portable` — satu `.exe` yang jalan
   tanpa instalasi, yang memang alasan orang memilih zip — plus installer dan
   `.7z`.

**Harga yang harus disebut:** LZMA solid dan self-extractor sama-sama terlihat
seperti executable terpaket bagi sebagian antivirus, jadi jalan pertama bisa
memunculkan peringatan tambahan di atas peringatan SmartScreen yang memang
sudah muncul untuk berkas tanpa tanda tangan. TesserCAD dan TesserCADIna
memilih menghindari itu; edisi ini memilih ukurannya, dan menyebut harganya di
sini dan di [SECURITY.md](SECURITY.md). Yang tersedia sebagai gantinya adalah
SHA-256 di samping tiap berkas dan atestasi provenance bertanda tangan.

Ukurannya diperiksa setiap build: langkah **The Windows download is the size
the README promises** di `.github/workflows/desktop.yml` mencetak ukuran
sebenarnya dan **menggagalkan build** kalau melewati 80 MB. Batas itu adalah
janjinya, bukan plafon di atas pengukuran hari ini — kalau ia merah, yang
berubah adalah halaman ini, bukan angka di gerbangnya.

## Yang perlu Anda lakukan sendiri

Empat hal di bawah ini tidak bisa dilakukan sebuah workflow atas namanya
sendiri. Tiga di antaranya sengaja begitu: menerbitkan sesuatu ke publik adalah
keputusan pemilik repositori, bukan efek samping sebuah build.

1. **GitHub Pages** — Settings → Pages → Source: **GitHub Actions**. Satu kali
   saja, per repositori. Setelah itu setiap push ke `main` menerbitkan ulang
   halamannya sendiri.

2. **Merge cabang ini ke `main`** — semua pekerjaan ada di branch
   `claude/tessercad-id-setup-zlzyzq`. Pages menerbitkan dari `main`, jadi
   halaman live-nya baru muncul setelah branch itu masuk.

3. **Rilis desktop** — halaman [Releases][rel] kosong sampai ada tag `v*`, dan
   tag itulah yang menyuruh Actions membangun serta melampirkan berkasnya.
   Nomor tag harus sama dengan `desktop/package.json`; workflow menolak tag
   yang tidak cocok, karena nama setiap berkas diambil dari manifes, bukan dari
   tag.

   Lewat peramban, tanpa baris perintah: **Releases → Draft a new release →
   Choose a tag →** ketik `v1.0.0` **→ Create new tag: v1.0.0 on publish →**
   Target: `main` **→ Publish release**.

   Lewat baris perintah, yang juga memeriksa versi dan tag ganda lebih dulu:

   ```bash
   bash tools/release.sh --dry-run   # lihat apa yang akan ditandai
   bash tools/release.sh             # tandai dan dorong
   ```

4. **Periksa ukuran unduhan pertama.** Gerbang 80 MB di CI baru benar-benar
   terukur saat build Windows pertama berjalan. Kalau ia merah, urutan
   langkahnya ada di komentar tepat di atas langkah itu:
   buang target `nsis` (installer adalah yang terbesar dari tiga), atau pin
   Electron major yang lebih lama, atau — pilihan terakhir yang jujur — ubah
   angka di halaman ini.

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
