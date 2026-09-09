# Referensi 4 — Teknik Humanisasi Teks (Lynote)

> Sumber: https://lynote.ai/id/blog/best-prompts-to-humanize-ai-text
> ("best prompts to humanize ai text", diakses via fetch).
> Dipakai mesin pada: kamus penyederhanaan humanizer, variasi ritme
> (burstiness), kontraksi/idiom, buang basa-basi transisi.
>
> CATATAN BATASAN (disengaja tidak dipakai): klaim pemasaran seperti
> "99–100% tidak terdeteksi", "jaminan lolos Turnitin", dan anjuran
> mengakali pengajuan akademik. Aplikasi ini tetap pada loop jujur:
> parafrase → ukur ulang beneran → lapor apa adanya.

## Putusan cepat: prompt manual vs humanizer otomatis

- Prompt manual mengubah gaya permukaan (nada/suara); sering gagal
  menghilangkan pola probabilitas token yang dicari detektor canggih.
- Klaim artikel: prompt manual ~60–70% lolos; humanizer khusus 99%+
  (klaim vendor — TIDAK diadopsi sebagai janji aplikasi ini).

## Teknik 1 — Perplexity & Burstiness (ritme tak menentu)

- AI memprediksi kata berikutnya yang paling mungkin → ritme datar monoton.
- Manusia campur kalimat panjang-kompleks dengan kalimat pendek-lugas.
- Prompt inti: variasikan panjang kalimat secara signifikan; campur kalimat
  pendek, terfragmentasi, dan klausa panjang; hindari pola standar
  "Subjek + Kata Kerja + Objek"; jangan pakai poin/daftar, tetap paragraf.
- Dipakai aplikasi: pemecah kalimat >26 kata + penggabung pola rapi
  (humanizer langkah 1–3).

## Teknik 2 — Nada percakapan

- Robot tidak pakai kontraksi, slang, atau idiom; terlalu sopan dan objektif.
- Prompt inti: tulis ulang dengan nada percakapan orang pertama; gunakan
  kontraksi ("don't" bukan "do not"); masukkan idiom alami; boleh langgar
  aturan kecil untuk gaya (mulai kalimat dengan "Dan"/"Tetapi"); buat
  seperti teman menjelaskan sambil minum kopi, bukan buku teks; hapus
  basa-basi/transisi ("Selanjutnya", "Kesimpulannya").
- Dipakai aplikasi: kontraksi EN + opini orang pertama + buang transisi
  (HUMANIZE_ID/EN + sinyal personal 6).

## Teknik 3 — Kesederhanaan (turunkan jargon)

- Ciri AI: jargon kompleks dan kata "SAT" berlebihan (utilize, leverage,
  paradigm); manusia pilih bahasa sederhana dan langsung.
- Prompt inti: tulis agar dipahami anak kelas 5; ganti kosakata kompleks
  dengan kata sehari-hari; suara aktif; paragraf 2–3 kalimat; kalimat
  >15 kata dipecah dua.
- Dipakai aplikasi: pasangan penyederhanaan ID — memanfaatkan→menggunakan,
  merupakan→adalah, terdapat→ada, hal tersebut→hal itu,
  perlu diperhatikan→yang layak diperhatikan,
  perlu diketahui→yang penting diketahui, dapat membantu→bisa membantu,
  berbagai macam→beragam.

## Teknik 4 — Transfer gaya (persona)

- Model default = asisten netral yang membantu (mudah ditandai).
- Persona ahli: beri jabatan + pengalaman → nada berwibawa, sedikit
  kontrarian; jargon industri natural; hindari kata basa-basi
  (transformative, landscape, delve); menasihati kolega, bukan artikel wiki;
  kalimat pendek lugas untuk poin penting.
- Penulis spesifik: pinjam ritme (Hemingway = pendek deklaratif,
  kata kerja kuat, tanpa pasif; Gladwell = cerita/analogi).
- Dipakai aplikasi: TIDAK meniru persona (berisiko mengubah makna) — yang
  dipakai hanya prinsipnya: kalimat pendek lugas + hapus pasif berlebihan
  bila aman. (Belum diotomatisasi penuh.)

## Teknik 5 — Edit manual hibrida (daftar edit)

- Langgar tata bahasa untuk efek: mulai dengan "Dan"/"Tetapi"; fragmen
  untuk penekanan.
- Hilangkan basa-basi transisi: "Kesimpulannya", "Selanjutnya",
  "Selain itu", "Penting untuk dicatat" → pernyataan langsung atau hapus.
- Suntik anekdot pribadi: "Saya pernah melihat...", "Dalam pengalaman
  saya..." — opini subjektif kecil memecah monoton objektif.
- Variasikan ritme: potong kalimat panjang jadi pendek-lugas, ikuti
  dengan kalimat lebih panjang dan kompleks.
- Idiom dan bahasa sehari-hari: "langsung ke intinya", dsb. (nuansa budaya
  yang sering dilewatkan mesin).
- Biaya: blog 1000 kata ≈ 10 menit generate + 2+ jam humanisasi manual;
  tidak scalable; kualitas tidak konsisten.
- Dipakai aplikasi: poin 2–5 sudah otomatis (kamus + ritme); anekdot
  TIDAK difabrikasi — aplikasi meminta user menambah pengalaman sendiri
  (status humanizer).

## Prompt vs detektor (realitas teknis)

- LLM memprediksi token berikutnya yang paling mungkin → perplexity rendah
  (prediktabilitas). Prompt mengubah gaya, jarang mengganggu pola statistik
  → "tanda air" logika AI tetap tertanam. Prompt manual = spekulasi,
  bukan jaminan.
- Dipakai aplikasi: TIDAK MENJANJIKAN lolos detektor eksternal; yang
  dijanjikan hanya skor internal yang diukur ulang beneran.

## Tips keamanan (SEO, plagiarisme)

- Jebakan kata kunci: parafrase agresif bisa menghapus kata kunci/istilah
  teknis → peringkat rusak. Solusi: audit output; pertahankan entitas penting.
- Dipakai aplikasi: penggantian bedah (surgical) per frasa, struktur dan
  istilah dipertahankan; user diminta baca ulang sebelum kumpul.
- Spinning (tukar sinonim) vs humanizing (restrukturisasi + nuansa):
  aplikasi memakai yang kedua; plagiarisme tetap tanggung jawab user
  (cek orisinalitas sendiri untuk konten komersial).
- Plagiarisme ≠ deteksi AI; halusinasi (fakta dibuat-buat) harus
  diverifikasi manual — humanizer aplikasi tidak menambah fakta baru.
