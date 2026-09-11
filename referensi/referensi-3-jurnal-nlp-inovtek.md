# Referensi 3 — Jurnal: Analisis Perbedaan Teks AI dan Manusia dengan NLP

> Sumber: JURNAL INOVTEK POLBENG – SERI INFORMATIKA, VOL. 10, NO. 2,
> JULI 2025, ISSN: 2527-9866, hal. 1016–1025.
> Judul: "ANALYSIS OF DIFFERENCES BETWEEN AI AND HUMAN TEXTS USING THE
> NATURAL LANGUAGE PROCESSING METHOD / ANALISIS PERBEDAAN TEKS BUATAN
> ARTIFICIAL INTELLIGENCE DAN MANUSIA MENGGUNAKAN METODE NATURAL
> LANGUAGE PROCESSING" — Dinda Cahyana, VitoReyLukito Sijabat,
> Mohammad Irfan Fahmi (Universitas Prima Indonesia).
> Dipakai mesin pada: validasi sinyal konsistensi/emosi/budaya, peringatan
> generalisasi & false-positive, catatan keterbatasan bahasa Inggris.

## Abstract

Artificial Intelligence has become increasingly proficient in generating text
that mimics human writing, yet existing detection tools remain limited in
accuracy and adaptability. Previous studies indicate that systems like
Turnitin and GPTZero often perform below 80% accuracy and struggle with
paraphrased or advanced AI-generated content. This study addresses that gap
by analyzing linguistic differences between AI-generated and human-written
texts using Natural Language Processing. A dataset of 487,235 texts
(305,797 human-written and 181,438 AI-generated) was processed using TF-IDF
vectorization and classified with the Multinomial Naive Bayes algorithm.
The model achieved 99.35% accuracy and an F1-score of 0.9948, with balanced
performance in detecting both text types. Results show that while
AI-generated texts are structurally consistent, they often lack the
emotional depth and cultural nuance found in human writing.

Keywords: generative text, artificial intelligence, human writing, NLP,
linguistic study.

## Abstrak

Kecerdasan buatan kini semakin mampu menghasilkan teks yang menyerupai
tulisan manusia, namun alat deteksi yang ada masih terbatas dalam hal
akurasi dan fleksibilitas. Studi sebelumnya menunjukkan bahwa alat seperti
Turnitin dan GPTZero sering memiliki akurasi di bawah 80% dan kesulitan
mengenali teks hasil parafrase atau buatan model AI canggih. Sebanyak
487.235 teks (305.797 teks manusia dan 181.438 teks AI) diproses
menggunakan TF-IDF dan diklasifikasikan dengan algoritma Multinomial Naive
Bayes. Model mencapai akurasi 99,35% dan F1-score 0,9948. Hasil menunjukkan
bahwa meskipun teks AI terstruktur rapi, teks tersebut cenderung kurang
ekspresif dan tidak menangkap konteks budaya seperti tulisan manusia.

Kata kunci: teks generatif, kecerdasan buatan, tulisan manusia, NLP, studi
linguistik.

## I. Pendahuluan (inti)

- AI (GPT, BERT, Transformer — bagian dari NLP) terbukti sangat bagus
  membuat teks mirip tulisan manusia: artikel berita, konten pemasaran,
  karya ilmiah.
- Masih ada perbedaan yang bisa ditemukan: susunan kalimat, makna, dan
  pola bahasa — tetapi makin sulit dikenali seiring kecanggihan NLP.
- Tantangan utama: merancang metode yang lebih akurat mengidentifikasi
  teks AI; alat yang ada terbatas akurasinya dan rentan dimanipulasi model
  AI yang makin canggih.
- Teks AI cenderung kaku dan kurang mencerminkan dinamika linguistik alami
  tulisan manusia, karena model masih terbatas menangkap konteks kompleks
  dan ekspresi bahasa yang beragam.
- Tujuan: model deteksi teks AI yang lebih akurat dan berimbang + memperdalam
  pemahaman perbedaan linguistik (ekstraksi fitur, analisis statistik:
  akurasi, precision, recall, F1-score; CountVectorizer, TfidfTransformer,
  MultinomialNB).

## II. Signifikansi studi — studi literatur (inti)

- Ippolito et al. (2020): manusia hanya sedikit lebih baik dari peluang acak
  dalam mengenali teks GPT-2 — kualitas teks AI makin menyerupai manusia;
  tidak membedah ciri linguistik secara mendalam.
- Bakhtin et al. (2019): klasifikasi ML dengan fitur panjang kalimat,
  frekuensi kata, skor perplexity — efektif di kondisi tertentu, tetapi
  sensitif terhadap perubahan model AI dan mudah dikalahkan generasi baru.
- Gehrmann et al. (2019) — GLTR: teks AI cenderung memakai kata-kata
  berprobabilitas tinggi secara konsisten, tulisan manusia lebih bervariasi;
  kurang akurat untuk GPT-3/GPT-4.
- Zellers et al. (2019) — Grover: detektor yang dilatih teks satu model
  bekerja baik pada model itu, gagal pada model lain (keterbatasan
  generalisasi).
- Dataset: 487.235 teks (305.797 manusia, 181.438 AI), format CSV
  (kolom "text" dan "generated"), dimuat dengan pandas.
- Preprocessing: lowercase, hapus link, tanda baca, angka, spasi berlebih;
  stopword removal ("yang", "di", "itu", dsb.); stemming ("pembelajaran" →
  "belajar").
- Ekstraksi fitur: CountVectorizer → matriks frekuensi kata, lalu
  TfidfTransformer (skor TF-IDF) sebagai input Multinomial Naive Bayes.
- Hasil: akurasi 99,35%, rata-rata F1-score 0,99.

## III. Hasil dan pembahasan (inti)

- Confusion matrix: TP 60.962 (AI benar sebagai AI), FN 150 (AI lolos
  sebagai manusia), FP 488 (manusia salah sebagai AI), TN 35.847.
- Classification report: Human precision 0,99 / recall 1,00 / F1 0,99
  (support 61.112); AI precision 1,00 / recall 0,99 / F1 0,99 (support
  36.335).
- Kesalahan kecil: 150 FN kemungkinan teks AI bergaya sangat manusiawi
  (variasi tutur/emosi natural); 488 FP kemungkinan teks manusia formal,
  terstruktur, minim variasi → menyerupai pola mesin.
- Keterbatasan: hanya teks berbahasa Inggris (tidak mencerminkan bahasa
  lain — tiap bahasa punya karakteristik unik); distribusi kelas tidak
  seimbang (305.797 vs 181.438) sehingga berpotensi memengaruhi precision
  dan recall.

## IV. Kesimpulan (inti)

- Teks AI: struktur teratur dan konsisten, tetapi datar, kurang ekspresi
  emosional dan kedalaman konteks budaya.
- Teks manusia: keragaman gaya bahasa, pilihan kata, penyampaian makna —
  mencerminkan pengalaman pribadi dan nilai sosial.
- Akurasi 99,35%, F1-score 0,9948; tantangan tersisa saat teks AI meniru
  gaya manusia natural, atau teks manusia terstruktur seperti pola mesin.
- Rekomendasi: model semantik lanjutan (BERT) untuk konteks; perluasan
  dataset lintas domain dan lintas bahasa; evaluasi dampak preprocessing
  (stemming/stopword removal dapat menghapus ciri khas teks manusia);
  transparansi dan etika untuk pendidikan, media, pemantauan konten digital.

## Implikasi untuk aplikasi ini

1. Sinyal struktur-konsisten vs emosi-budaya di jurnal ini SEJALAN dengan
   sinyal 1–5 (burst, TTR, personal, lively, konkret) — validasi eksternal.
2. Peringatan generalisasi (Grover) → heuristik umum + model lokal boleh
   beda hasil; keduanya ditampilkan (ensemble), bukan satu vonis.
3. Peringatan preprocessing → aplikasi TIDAK stemming/menghapus stopword
   sebelum menilai (ciri manusia tidak dibuang).
4. Peringatan FP (manusia formal → mirip AI) dan FN (AI natural → lolos)
   → pesan jujur di UI + kunci hasil basi + larangan vonis mutlak.
5. Keterbatasan bahasa Inggris → teks Indonesia minim validasi eksternal;
   klaim aplikasi tidak boleh melebihi bukti (lihat aturan jujur di
   main.js).

## Referensi jurnal [1]–[20] (ringkas)

[1] Agusman (2025) perlindungan hak cipta NFT; 
[2] Cunliffe et al. (2022)
NLP Welsh; 
[3] Zhou et al. (2023) survei foundation models; 
[4] Wang et al.
(2024) deteksi teks AI berbasis BERT; 
[5] Noor & Prova (n.d.) deteksi AI
via NLP+ML; 
[6] Perbandingan SVM vs Naive Bayes (skripsi, media X);
[7] Liu et al. (2024) AI generatif dalam asesmen; 
[8] Sulartopo et al.
(2023) AI dalam project management; [9] Picciotto & Pemantle (2024);
[10] Georgiou (2023) fitur linguistik otomatis; 
[11] Sandler et al. (2024)
perbandingan linguistik manusia vs ChatGPT; 
[12] Muñoz-Ortiz et al. (2024)
pola linguistik berita manusia vs LLM; 
[13] Sitanggang et al. (2024)
analisis sentimen Naïve Bayes; 
[14] Fariello et al. (2024) review deteksi
human-vs-machine; 
[15] Gunawan et al. (2024) asisten virtual kampus;
[16] Prismala & Nuryana (2024) opinion mining ChatGPT; 
[17] SVM untuk
deteksi penipuan online; 
[18] Widaad et al. (2024) analisis sentimen SVM
dan CNN; 
[19] Widiawati et al. (2024) klasifikasi kualitas udara Naive
Bayes; 
[20] Putri Kumala Sari (2024) komparasi SVM vs Random Forest.
