# Detector Rules — Faraz Detector AI

Pedoman utama `detector.js` (+ `core.js`). Tujuan: penilaian **konsisten,
dapat dijelaskan, tidak asal menilai**. Implementasi wajib merujuk ke sini
sebelum mengubah logika skor.

## 1. Prinsip utama

- Jangan mengarang hasil: setiap kesimpulan harus punya bukti dari teks
  (pola, frekuensi, statistik). Dilarang: pola karangan, kutipan karangan,
  statistik karangan, skor perkiraan (`Math.random()`, angka tetap).
- Alur wajib: terima teks → bersihkan tanpa buang info penting → cek
  panjang → pecah kalimat + paragraf → analisis seluruh teks → hitung
  semua sinyal → cek konteks → skor → penjelasan berbasis bukti.
- Skor = kombinasi beberapa indikator, mis. konsep:
  `signal + repetition + generic + structure + uniformity
   − academic_adjustment − specificity_adjustment`.
- `referensi.js` (termasuk 3 file rules ini + referensi-1..4) adalah
  **landasan interpretasi**, bukan aturan `keyword = AI`.

## 2. Sepuluh sinyal (WAJIB semua dihitung)

1. Variasi struktur kalimat
2. Penggunaan frasa (template/generik + frekuensinya)
3. Gaya penulisan (konsisten/kaku/terlalu sempurna polanya)
4. Variasi panjang kalimat
5. Kata penghubung (pola + frekuensi, BUKAN pemakaiannya)
6. Pola/template sintaksis berulang
7. Suara & sudut pandang penulis
8. Variasi ekspresi antar gagasan
9. Detail dan contoh konkret (data, objek, konteks spesifik)
10. Keunikan tulisan (generik = bisa dipakai di banyak konteks)

Setiap sinyal harus punya **evidence**: frasa apa, muncul berapa kali,
proporsional terhadap panjang dokumen (`count / total kata`), di konteks
(paragraf) mana. Format: Indikator → Bukti → Konteks → Interpretasi.

## 3. Satu sinyal bukan bukti

Kata/frasa berikut adalah bahasa akademik normal, BUKAN bukti AI:
"penelitian ini bertujuan untuk", "oleh karena itu", "dengan demikian",
"berdasarkan hasil penelitian", "selain itu", "dapat disimpulkan",
"merupakan", "terdapat". Rantai keputusan wajib:
`Signal → Frequency → Context → Combination → Confidence`.

## 4. Akademik ≠ AI (false positive protection)

- Formal, rapi, baku, terstruktur, istilah teknis, sitasi, penghubung,
  argumentasi jelas = **academic convention**, bukan bukti AI.
- Academic context check sebelum confidence: nama/tujuan penelitian,
  metode, variabel, populasi, sampel, data, observasi, kuesioner, angka,
  teori, sitasi, penulis, tahun, pembahasan, kesimpulan, istilah teknis.
  Semakin kuat konteksnya, semakin hati-hati menyimpulkan.
- Technical terms (TF-IDF, Naive Bayes, API, QoS, ...) boleh berulang
  karena dibutuhkan topik — bukan repetisi buruk otomatis.
- Sitasi bukan bukti AI; pengulangan istilah penelitian (variabel,
  responden, metode, dataset) wajar — fokus ke repetisi frasa/kalimat
  yang tidak perlu.
- Hanya SATU pola → confidence rendah (butuh multiple signals).
- Teks <50 kata / <3 kalimat → cap skor rendah + warning
  "terlalu singkat untuk analisis yang meyakinkan".
- Asal tidak diketahui → jangan klaim "ini AI"/"ini manusia"; pakai
  kalimat: pola tsb juga dapat ditemukan pada tulisan akademik manusia.

## 5. Output detector (minimal)

`Score + Confidence (rendah/sedang/tinggi) + Classification
(HUMAN/AI/HYBRID/UNKNOWN/perlu ditinjau) + Key indicators + Evidence +
Context + Warning`. UNKNOWN lebih baik daripada klaim palsu.
Contoh kesimpulan: "Terdapat beberapa pola yang perlu ditinjau, tetapi
hasil ini bukan bukti pasti bahwa teks dibuat AI."

## 6. Bahasa yang dilarang vs dianjurkan

Dilarang: "100% AI", "pasti AI/manusia", "dijamin lolos",
"tidak mungkin terdeteksi", "bebas AI".
Gunakan: "terindikasi", "memiliki pola", "perlu ditinjau",
"confidence rendah/sedang/tinggi", "kemungkinan", "indikator".

## 7. Konsistensi & pengujian

- Preprocessing + pipeline SAMA untuk original dan humanized.
- Setiap ubah kode detector: uji ulang ke
  HUMAN ACADEMIC, HUMAN GENERAL, AI GENERATED, HYBRID, SHORT TEXT,
  TECHNICAL TEXT, TEXT WITH CITATIONS, TEXT WITH DATA — pastikan tidak
  asal klasifikasi dan tidak merusak perilaku yang sudah benar.
  Jurnal dosen/paper manusia = test case utama (formalitasnya tidak
  boleh jadi bukti AI otomatis).
- Kode terkait: `heuristic()` (10 sinyal + academic dampening +
  single-signal cap + short-text cap), `splitReferences()`,
  `cleanAcademic()`, `render()` + `buildPrint()` (output + provenance).
