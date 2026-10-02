#!/usr/bin/env bash
#
# Menghapus hello.exe dan hello.c dari SELURUH riwayat git, dengan aman.
#
# Kedua berkas itu dibawa oleh commit pertama repositori ini, sebelum aplikasinya
# ada. Mereka sudah lama tidak ada di pohon kerja dan tidak pernah masuk ke rilis
# mana pun, tapi masih bisa dijangkau lewat riwayat. Alasan lengkap dan harga
# penghapusannya ada di SECURITY.md.
#
# INI MERUSAK. Membaca dulu sebelum menjalankan:
#
#   - setiap SHA commit di main, di semua cabang, dan di kedua tag berubah;
#   - atestasi provenance v1.0.0 dan v1.1.0 menyebut SHA lama, jadi berhenti
#     cocok dengan riwayat baru (berkas rilisnya sendiri tetap utuh);
#   - setiap pull request yang terbuka kehilangan dasarnya;
#   - GitHub tetap menyajikan objek lama lewat URL-nya sampai GitHub Support
#     menjalankan garbage collection. Menghapusnya sepenuhnya butuh tiket ke
#     support.github.com, dan skrip ini tidak bisa menggantikannya.
#
# Cara kerja yang disengaja membosankan:
#
#   - bekerja di klon cermin SEMENTARA, tidak pernah di klona Anda sekarang;
#   - tanpa argumen ia hanya SIMULASI: ia menulis ulang klon sementara itu,
#     membuktikan bahwa kedua berkas hilang dari setiap ref, mencetak laporan,
#     lalu berhenti. Tidak ada yang didorong;
#   - hanya `--push` yang menyentuh GitHub, dan ia menolak jalan kalau
#     verifikasinya gagal;
#   - yang didorong hanya cabang dan tag, bukan refs/pull/*, yang memang
#     ditolak GitHub.
#
#   bash tools/purge-history.sh                 # simulasi, aman
#   bash tools/purge-history.sh --push          # menulis ulang GitHub, merusak
#   bash tools/purge-history.sh --repo <url>    # sumber lain (untuk uji lokal)
#
# Prasyarat: git dan git-filter-repo (pip install git-filter-repo).
set -euo pipefail

push=0
repo="https://github.com/samuelhtampubolon/TesserCAD-ID.git"
while [ $# -gt 0 ]; do
  case "$1" in
    --push) push=1 ;;
    --repo) repo="${2:?--repo butuh nilai}"; shift ;;
    *) echo "Argumen tidak dikenal: $1" >&2; exit 2 ;;
  esac
  shift
done

PATHS=(hello.exe hello.c)

command -v git >/dev/null || { echo "git tidak ditemukan" >&2; exit 1; }
git filter-repo --version >/dev/null 2>&1 || {
  echo "git-filter-repo tidak ditemukan. Pasang dulu:  pip install git-filter-repo" >&2
  exit 1
}

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
echo "Mengklon cermin ke direktori sementara ..."
git clone --mirror --quiet "$repo" "$work/m"
cd "$work/m"

# Yang akan dihapus harus persis yang dimaksud, dan tidak ada yang lain.
echo "Blob yang cocok di riwayat sekarang:"
found=$(git rev-list --objects --all | git cat-file --batch-check='%(objecttype) %(objectsize) %(rest)' \
  | awk '$1=="blob" && $3!="" {print $2, $3}' | sort -u | grep -E "^[0-9]+ ($(IFS='|'; echo "${PATHS[*]}"))$" || true)
echo "$found" | sed 's/^/    /'
[ -n "$found" ] || { echo "Tidak ada yang perlu dihapus: riwayatnya sudah bersih."; exit 0; }

before=$(git for-each-ref --format='%(refname) %(objectname)' refs/heads refs/tags | sort)

args=()
for p in "${PATHS[@]}"; do args+=(--path "$p"); done
git filter-repo --invert-paths "${args[@]}" --force --quiet

# Bukti, bukan harapan: tidak ada ref yang masih menjangkau salah satunya.
left=$(git rev-list --objects --all | git cat-file --batch-check='%(objecttype) %(rest)' \
  | awk '$1=="blob" {print $2}' | grep -E "^($(IFS='|'; echo "${PATHS[*]}"))$" || true)
if [ -n "$left" ]; then
  echo "GAGAL: masih terjangkau setelah penulisan ulang: $left" >&2
  exit 1
fi
echo "Terverifikasi: ${PATHS[*]} tidak terjangkau dari ref mana pun."

after=$(git for-each-ref --format='%(refname) %(objectname)' refs/heads refs/tags | sort)
echo
echo "Ref yang berubah (lama -> baru):"
join -j1 <(echo "$before") <(echo "$after") | awk '{ printf "    %-28s %.9s -> %.9s%s\n", $1, $2, $3, ($2==$3 ? "  (sama)" : "") }'

if [ "$push" != 1 ]; then
  echo
  echo "Ini SIMULASI. Tidak ada yang didorong dan klon sementara dibuang."
  echo "Kalau Anda sudah membaca peringatan di kepala berkas ini:  bash tools/purge-history.sh --push"
  exit 0
fi

echo
read -r -p "Ketik HAPUS untuk menulis ulang $repo: " answer
[ "$answer" = "HAPUS" ] || { echo "Dibatalkan."; exit 1; }
git remote add target "$repo" 2>/dev/null || git remote set-url target "$repo"
git push --force target 'refs/heads/*:refs/heads/*' 'refs/tags/*:refs/tags/*'
echo
echo "Selesai. Berikutnya, yang tidak bisa dilakukan skrip ini:"
echo "  1. buka tiket di https://support.github.com minta garbage collection repositori ini;"
echo "  2. semua klona lain harus diklon ulang, bukan di-pull."
