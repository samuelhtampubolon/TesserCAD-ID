#!/usr/bin/env bash
#
# Menandai sebuah rilis, dan tidak lebih dari itu.
#
# Mendorong tag `v*` memicu workflow "Desktop build": ia membangun `.exe`
# portable Windows, penginstal NSIS, arsip `.7z`, dan artefak Linux,
# melampirkan SHA-256 serta atestasi provenance, lalu menerbitkan GitHub
# Release **publik**. Jadi skrip ini memeriksa dulu, baru mendorong.
#
# Versinya dibaca dari desktop/package.json, bukan ditulis di sini. Itu satu
# sumber kebenaran yang sama dengan yang dipakai electron-builder untuk menamai
# setiap berkas, dan yang diperiksa workflow sebelum membangun apa pun: sebuah
# tag yang tidak cocok dengan manifes akan menghasilkan artefak bernama versi
# lain. Menyalin nomor versi ke skrip ini berarti membuat tempat kedua yang bisa
# salah.
#
#   bash tools/release.sh          # tandai HEAD origin/main
#   bash tools/release.sh --dry-run  # tampilkan apa yang akan dilakukan
#
# Tidak punya akses baris perintah? Halaman Releases di GitHub bisa membuat tag
# sekaligus rilisnya: Releases > Draft a new release > Choose a tag > ketik
# nomornya > "Create new tag: ... on publish" > Target: main > Publish release.
set -euo pipefail

dry=0
[ "${1:-}" = "--dry-run" ] && dry=1

cd "$(git rev-parse --show-toplevel)"

git fetch origin main --quiet
commit=$(git rev-parse origin/main)

# Dibaca dari commit yang akan ditandai, bukan dari pohon kerja: pohon kerja
# bisa saja sudah diubah, dan yang dibangun nanti adalah isi commit itu.
version=$(git show "$commit:desktop/package.json" | node -p 'JSON.parse(require("fs").readFileSync(0,"utf8")).version')
tag="v$version"

if git ls-remote --exit-code --tags origin "refs/tags/$tag" >/dev/null 2>&1; then
  echo "Tag $tag sudah ada di origin. Naikkan versi di desktop/package.json lebih dulu." >&2
  exit 1
fi

echo "Akan menandai $tag pada $(git log -1 --format='%h %s' "$commit")"
if [ "$dry" = 1 ]; then
  echo "(--dry-run: tidak ada yang didorong)"
  exit 0
fi

git tag -a "$tag" "$commit" -m "TesserCAD-ID $version"
git push origin "$tag"

echo
echo "Terdorong. Pantau pembangunannya di tab Actions, workflow \"Desktop build\"."
echo "Setelah hijau, berkasnya muncul di halaman Releases."
