# Referensi 8 — Diksi / Pilihan Kata (Ilham dkk. 2025)

Sumber: Ilham, M., Repelita, T., Kurniawan, A., & Nafisatustsani, R.
(2025). Analisis Bentuk dan Pilihan Kata (Diksi) dalam Penulisan Bahasa
Indonesia. *Jurnal Ilmiah Wahana Pendidikan*, 11(2.B), 176–181.
https://jurnal.peneliti.net/index.php/JIWP/article/view/11560
(Keberadaan terverifikasi via situs jurnal + Garuda Kemdikbud; isi
disarikan dari tempelan user.)

Status file ini: **landasan interpretasi** (lihat
`validation-rules.md` §51) — kriteria diksi untuk menilai ketepatan
kata, BUKAN aturan `keyword = AI`.

## 1. Aturan diksi → panduan detector & humanizer

- **Tepat + selaras konteks** (KBBI): kata dinilai dari kesesuaian
  dengan konteks paragraf/wacana dan audiens — dukung penilaian
  `Frequency → Context → Combination` (bukan kata lepas).
- **Denotatif vs konotatif**: makna lugas vs tambahan (sosial/budaya).
  Humanizer dilarang menggeser konotasi (mis. formal → kasual).
- **Kata khusus > kata umum** untuk presisi ("fortuner" vs "mobil"):
  dukung sinyal specificity — tulisan spesifik = kontekstual (bukan
  bukti manusia otomatis).
- **Ragam baku, bukan lisan**: tulisan ilmiah memakai "argumentasi"
  bukan "pembuktian", hindari ragam lisan ("kencing" → "buang air
  kecil" bila konteks menuntut). Dukung register formal humanizer.
- **Idiom baku**: "sesuai dengan" (benar) vs "sesuai bagi" (salah) →
  aturan koreksi di `REF_HUMANIZE_EXTRA` (guarded, formal).
- **Sinonim tidak identik**: "meneliti" ≠ "menyelidiki" ≠ "mengamati"
  — dukung larangan sinonim-membabi-buta di `humanizer-rules.md`.

## 2. Fungsi diksi ilmiah (validasi output)

Diksi menyampaikan konsep/bukti/solusi; menghindari multitafsir dan
kesalahpahaman; membangun citra profesional penulis. Quality gate
"clarity" memakai kriteria ini.

## 3. Ejaan & tanda baca (lanjutan artikel yang sama)

- **Baku vs tidak baku** (koreksi pasti, masuk `REF_HUMANIZE_EXTRA`
  guarded): "hakekat"→"hakikat", "dilegalisir"→"dilegalisasi",
  "bukan hanya... melainkan juga"→"bukan hanya... tetapi juga".
- **Butuh konteks, JANGAN otomatis**: "interferensi" vs "inferensi",
  "sarat" vs "syarat" — maknanya beda; humanizer dilarang menebak
  maksud penulis. Dokumentasi saja, tanpa aturan rewrite.
- Ragam lisan tidak masuk tulisan formal; ejaan benar = kredibilitas.

## 4. Batasan

- Objek: bahasa Indonesia umum/akademik; bukan daftar kata AI.
- Jangan mengklaim artikel ini sebagai "penelitian sistem ini".
