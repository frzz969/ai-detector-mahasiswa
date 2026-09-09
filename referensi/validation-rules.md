# Validation Rules — Faraz Detector AI

Pedoman gerbang validasi untuk seluruh alur (`main.js`, `humanizer.js`,
`detector.js`). Prinsip: **DO NOT GUESS, INVENT, OVERCLAIM, OVERWRITE,
atau CHASE THE SCORE. ALWAYS VERIFY.** Bila ragu → UNKNOWN / WARNING /
KEEP ORIGINAL.

## 1. Pipeline final (tidak boleh dilompati)

USER INPUT → VALIDATE → PREPROCESS → CHECK LENGTH → 10 SIGNALS →
ACADEMIC/TECH/CITATION/DATA CHECK → SCORE + CONFIDENCE → EVIDENCE +
EXPLANATION → (opsional) HUMANIZE minimal → SAME DETECTOR RESCAN →
COMPARE → REGRESSION CHECK → QUALITY GATE → BETTER? ACCEPT : RESTORE →
(max 3–5 iterasi, pilih versi terbaik) → COPY/EXPORT.

## 2. Input, reset, error (no silent failure)

- Validasi: kosong → tolak; terlalu pendek → warning; valid → analisis.
  Jangan jalankan detector pada input kosong.
- RESET harus benar-benar menghapus teks, skor, klasifikasi, evidence,
  teks humanized, perbandingan, loading & error state.
- Detector/humanizer/model/referensi gagal → tampilkan pesan jelas
  ("Analisis belum dapat dilakukan...", "Teks asli tetap
  dipertahankan..."). DILARANG fallback skor palsu (mis. selalu 50).
- Setiap kegagalan penting harus terlihat user; progress/status
  ("Memindai...", "Menganalisis...") harus sesuai proses sebenarnya,
  bukan animasi. Jangan klaim "Analysis complete"/"AI detected" bila
  kondisi tidak terpenuhi.

## 3. No stale score & export final saja

- TERAPKAN & CEK ULANG wajib: teks baru → preprocessing baru →
  deteksi baru → hasil baru. Dilarang pakai cache/skor demo/skor lama.
- Export (PDF/.txt) HANYA dari versi final yang sudah lewat rescan +
  regression check + quality gate; teks berubah sesudah hasil keluar →
  hasil ditandai basi dan export diblokir sampai cek ulang.
- Kode terkait: `markStale()`, `refreshRail()`, guard `resultStale`
  di `btnPrint`/`btnDownload`, `buildPrint()`.

## 4. Regression & quality gate

- Bandingkan ORIGINAL vs HUMANIZED (skor, pola generik, repetisi,
  variasi, struktur, kejelasan, koherensi, formalitas, makna, fakta,
  sitasi) dengan detector + preprocessing yang SAMA → BETTER /
  EQUIVALENT / WORSE. WORSE → REJECT + restore; EQUIVALENT → minimal
  change; hanya BETTER yang ACCEPT.
- Level validasi: paragraf bermasalah saja yang diubah; per kalimat:
  yang membaik dipakai, yang memburuk/tetap dikembalikan ke asli.
- Quality gate (makna, fakta, sitasi, nada akademik, grammar, kejelasan,
  koherensi, repetisi, generik, naturalness, regresi detector): satu
  aspek penting gagal → tolak sebagai final. Urutan prioritas: makna →
  fakta → kebenaran akademik → kejelasan → koherensi → naturalness →
  analisis pola → skor detector.

## 5. Kejujuran produk

- Klaim dilarang: "100% akurat/human", "pasti lolos/tidak terdeteksi",
  "jaminan bebas AI". Gunakan: indikator, estimasi, confidence,
  perlu ditinjau.
- Privasi: teks diproses lokal; jangan klaim "100% private" bila ada
  data keluar (download model ±130MB / pustaka CDN = unduhan, bukan
  pengiriman teks). Local model = enhancement opsional, bukan kebenaran
  tunggal; offline → pipeline dasar tetap jalan.
- Demo ≠ analisis produksi: data demo hanya untuk preview; analisis
  teks user selalu jalur real.

## 6. Uji regresi wajib tiap ubah kode

- Detector: HUMAN ACADEMIC, HUMAN GENERAL, AI GENERATED, HYBRID,
  SHORT TEXT, TECHNICAL TEXT, TEXT WITH CITATIONS, TEXT WITH DATA
  (jurnal dosen = utama). Humanizer: Original → Humanize → Rescan →
  Compare (tidak lebih generik/repetitif/kaku/panjang/informal).
- Jangan perbaiki false positive sampai merusak humanizer, atau
  sebaliknya. Harness: `faraztest.js` (temp) menjalankan
  `heuristic()` + `humanizeText()` asli via node.
