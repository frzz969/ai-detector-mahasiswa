# AGENTS.md — Faraz Detector AI

Instruksi wajib untuk setiap sesi agent yang menyentuh repo ini.
File lama TIDAK dihapus — file ini hanya mengikat urutan kerja.

## 0. Baca dulu sebelum bertindak (WAJIB)

Sebelum menilai teks user, memberi skor, atau mengubah mesin:

1. `referensi/detector-rules.md`
2. `referensi/humanizer-rules.md`
3. `referensi/validation-rules.md`
4. Relevan dari `referensi/referensi-1..8-*.md` bila perlu konteks.

Setiap hasil analisis/ubah kode WAJIB menyebut aturan mana yang dipakai
agar bisa diaudit balik. Dilarang asal angka, asal klaim, asal rewrite.

## 1. Peta kode (jangan tebak lokasi)

- `core.js` — DOM refs, state, `AI_PHRASES`, konstanta batas.
- `detector.js` — `heuristic()` (10 sinyal + academic dampening +
  single-signal cap + short-text cap), `splitReferences()`,
  `cleanAcademic()`, model lokal opsional.
- `referensi.js` — data referensi + `REF_HUMANIZE_EXTRA` (formal) +
  `REF_RULE_DOCS` (provenance dokumen aturan).
- `humanizer.js` — `humanizeSentence()` (aturan formal + skip
  kemunculan tunggal), `humanizeText()` (skip kalimat baik skor<45,
  regresi per kalimat → revert bila +10), handler tombol + verdict
  BETTER/EQUIVALENT/WORSE + restore asli.
- `main.js` — `render()` (bahasa indikasi), `doCheck()` (status
  bertahap + rescan), stale-guard export, demo hero.
- `index.html` — struktur + SEMUA ID fungsional (jangan rename/hapus).
- `style.css` — DESKTOP saja (biru langit + putih, full-width).
  `mobile.css` — HP/tablet ≤1100px (dimuat via media query).
  Edit salah satu, jangan sentuh yang lain. JANGAN ubah layout/
  visual kecuali user eksplisit minta; tugas mesin = `*.js` root.

## 2. Batasan keras

- Bahasa: "terindikasi / perlu ditinjau / confidence rendah-sedang-
  tinggi". Dilarang: "100% AI", "pasti", "dijamin lolos", "bebas AI".
- Humanizer: formal→formal, tanpa slang (`bisa`, `buat`, `banget`);
  "dapat/merupakan/terdapat/dengan demikian" tunggal tidak diubah;
  fakta/angka/sitasi/istilah tidak diubah; tanpa data karangan.
- Perubahan minimum: kalimat/paragraf baik dipertahankan; WORSE/
  EQUIVALENT → teks asli; tidak ada iterasi otomatis tanpa batas.
- Export hanya dari hasil final segar (rescan + regression + quality
  gate); teks berubah → basi → blokir sampai cek ulang.
- Demo hero ≠ analisis produksi; skor selalu dihitung ulang, dilarang
  dummy/random/angka tetap.

## 3. Verifikasi tiap ubah `*.js` (root)

1. `node --check` semua file yang diubah.
2. Uji fungsional: `node` harness temp (`faraztest.js`) yang me-load
   `core → referensi → detector → humanizer → main` dengan stub DOM,
   lalu cek: demo AI terindikasi, demo human rendah, teks pendek
   di-cap, formal akademik tidak overflag, humanize tidak regresi.
3. `grep` klaim terlarang (`100% AI|pasti AI|dijamin|bebas AI|khas AI`)
   pada output user-facing (komentar kode internal dikecualikan).
