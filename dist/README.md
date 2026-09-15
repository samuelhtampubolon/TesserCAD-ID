# Unduhan

**Build tidak ada di folder ini, dan tidak bisa ada.** Jika Anda mencarinya,
mereka ada di
[**halaman Releases**](https://github.com/samuelhtampubolon/TesserCAD-ID/releases).

## Mengapa tidak di sini

Build desktop TesserCAD-ID adalah aplikasi Electron, jadi Chromium lengkap ikut
tersertakan dan berkasnya jauh lebih besar daripada batas **100 MB per berkas**
yang diberlakukan GitHub di dalam repositori. Releases ada tepat untuk itu.

Ukurannya tidak ditulis ulang di halaman ini. Satu-satunya tempat yang
menyebutkannya adalah [README](../README.md#build-desktop), karena angka di
sana dicetak ulang oleh CI pada setiap build dan build merah kalau angkanya
bergeser. Menyalinnya ke sini berarti membuat tempat kedua yang bisa basi, dan
memang pernah basi dua kali: halaman ini menjanjikan "sekitar 80 MB" sampai ada
yang benar-benar mengukurnya, dan README-nya menjanjikan "di bawah 80 MB" sampai
build Windows pertama mengukur 88,25 MB.

## Di mana mendapatkannya

| | |
|---|---|
| **Releases** | [github.com/samuelhtampubolon/TesserCAD-ID/releases](https://github.com/samuelhtampubolon/TesserCAD-ID/releases) |
| **Belum ada rilis?** | Setiap build "Desktop build" yang hijau menyimpan berkas yang sama sebagai artefak di tab **Actions** |
| **Tanpa unduhan** | Versi web adalah aplikasi yang sama dan tidak memasang apa pun |

Di Windows, ambil **`TesserCAD-ID-1.0.0-portable.exe`** dan jalankan. Tidak ada
installer, tidak perlu hak administrator, dan ekstraksi pertamanya dipakai ulang
di jalan berikutnya. Ada juga installer NSIS per-pengguna
(`TesserCAD-ID-1.0.0-setup.exe`). Arsip `.7z` ikut mulai rilis setelah v1.0.0.
Tidak ada build macOS.

Karena berkasnya terkompresi LZMA solid dan berkasnya tidak bertanda tangan,
Windows bisa memperingatkan dua kali pada jalan pertama. Yang tersedia sebagai
ganti sertifikat adalah SHA-256 di samping tiap berkas dan atestasi provenance
bertanda tangan — lihat [SECURITY.md](../SECURITY.md).

## Membangun sendiri

```bash
cd desktop
npm install
npm run dist
```
