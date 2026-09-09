# Humanizer Rules — Faraz Detector AI

Pedoman utama `humanizer.js` (+ `REF_HUMANIZE_EXTRA` di `referensi.js`).
Tujuan: **tulisan akademik yang terlalu generik/berpola → akademik yang
lebih natural, spesifik, jelas, bervariasi**. BUKAN mengakali detector.

## 1. Aturan utama

> NEVER ASSUME THAT HUMANIZATION IMPROVES THE TEXT. Selalu verifikasi;
> bila lebih buruk → REJECT; bila sama → KEEP ORIGINAL / MINIMAL EDIT;
> bila lebih baik → ACCEPT.

## 2. Register akademik (jangan jadikan percakapan)

- Dilarang massal: `merupakan → adalah`, `dapat → bisa`,
  `terdapat → ada`, `menggunakan → memakai`, `memanfaatkan → pakai`.
  Ganti kata hanya bila konteks mendukung; "dapat", "merupakan",
  "terdapat", "dengan demikian" yang muncul wajar JANGAN diubah.
- Dilarang: slang, filler, bahasa chat/santai, emoji, kesalahan/typo
  disengaja, struktur sengaja diberantakkan, sinonim berlebihan.
- Formalitas dipertahankan; kalimat akademik yang sudah baik
  ("Penelitian ini bertujuan untuk...", "Berdasarkan hasil
  penelitian...") JANGAN diubah hanya agar terlihat "manusia".

## 3. Perbaiki struktur, bukan sekadar sinonim

- Buruk: "memiliki tujuan untuk mengetahui" → "mempunyai maksud untuk
  mengetahui". Baik: "bertujuan untuk mengetahui" / "mengkaji".
- Variasikan pola berulang ("Penelitian ini..." ×4 → "Hasil observasi
  menunjukkan...", "Temuan tersebut...", "Dalam penelitian ini..."),
  TAPI jangan memaksakan bila merusak alur, dan jangan mengarang
  konteks (mis. "hasil observasi" padahal tidak ada datanya).
- Ide yang sama di kalimat berbeda dalam satu paragraf → gabung/susun
  ulang, jangan biarkan repetitif.

## 4. Fakta & makna & suara penulis

- WAJIB pertahankan: angka, %, responden, tahun, institusi, istilah
  teknis, metode, variabel, hasil, kutipan, referensi, DOI, makna asli,
  relasi sebab-akibat. Jangan tambah/kurangi/arang data.
- Butuh detail tapi tak tersedia → JANGAN mengarang; beri saran
  "dapat diperkuat dengan data/contoh konkret jika tersedia" atau
  biarkan umum / tandai `[detail spesifik diperlukan]`.
- Improve, bukan replace author: gaya konsisten penulis dipertahankan;
  sitasi/nama/tahun/judul/format citation tidak diubah.

## 5. Minimal necessary edit

- Ubah sesedikit mungkin: 2 kalimat bermasalah → sentuh 2 kalimat itu;
  paragraf/kalimat yang sudah baik dipertahankan (alurnya
  indikasi → review → keputusan, BUKAN indikasi → wajib rewrite).
- Dilarang overhumanization: ganti hampir semua kata, pecah/gabung
  semua kalimat, tambah transition words paksa, pola rewrite sama tiap
  paragraf, buat lebih panjang tanpa alasan.
- Prioritas: perbaiki masalah → pertahankan bagian baik → makna →
  fakta. Kualitas > skor; jangan kejar angka detector (V1 yang natural
  boleh dipilih walau skornya lebih tinggi dari V3 yang rusak).

## 6. Sebelum/sesudah + status jujur

- Output: VERSI ASLI + VERSI PERBAIKAN + PERUBAHAN (struktur
  divariasikan, repetisi dikurangi, frasa disederhanakan, hubungan
  diperjelas) + HASIL CEK ULANG + STATUS (DITERIMA / asli
  dipertahankan / perubahan minimal).
- Bahasa: "Diperbaiki agar lebih natural, jelas, dan sesuai konteks
  akademik." DILARANG: "dibuat agar lolos detector".
- Status UI harus dari state sebenarnya; hasil yang ditolak regresi
  tidak boleh dilaporkan "Humanized successfully".
- Kode terkait: `humanizeSentence()` (aturan formal + skip kemunculan
  tunggal), `humanizeText()` (skip kalimat baik skor<45, pecah >26 kata,
  gabung <10 kata, regresi per kalimat → revert bila +10), handler
  `btnHumanize` (verdict BETTER/EQUIVALENT/WORSE + restore asli),
  `btnApplyHumanize` (rescan + peringatan bila tidak membaik).
