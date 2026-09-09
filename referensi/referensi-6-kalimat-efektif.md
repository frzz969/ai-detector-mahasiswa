# Referensi 6 — Kalimat Efektif (Trismanto 2016)

Sumber: Trismanto (2016). Kalimat Efektif dalam Berkomunikasi.
*Bangun Rekaprima: Majalah Ilmiah Pengembangan Rekayasa, Sosial dan
Humaniora*, 2(1, April), 3–40. Politeknik Negeri Semarang.
DOI: 10.32497/bangunrekaprima.v2i1.708. (Keberadaan terverifikasi via
Garuda Kemdikbud + disitasi jurnal lain; isi disarikan dari tempelan
user.)

Status file ini: **landasan interpretasi** (lihat
`validation-rules.md` §51) — kriteria kalimat efektif untuk menilai
kualitas, BUKAN aturan `keyword = AI`.

## 1. Enam ciri kalimat efektif → checklist quality gate

| Ciri | Arti operasional untuk mesin |
|------|-------------------------------|
| Kelugasan | Info pokok saja, tidak berbelit; buang filler ("mau tidak mau", "itu sendiri") |
| Ketepatan | Tidak multitafsir/ambigu; presisi diksi |
| Kejelasan | Struktur lengkap & apik (S-P-O-K); verba transitif diikuti objek |
| Kehematan | Tanpa sinonim ganda, tanpa penanda jamak ganda |
| Keutuhan | Unsur wajib kalimat terpenuhi |
| Kesejajaran | Imbuhan & klausa paralel (verba satu tipe) |

## 2. Pola redundansi → aturan humanizer (formal, guarded)

Berlaku sebagai aturan penyederhanaan di `REF_HUMANIZE_EXTRA`
(semuanya formal; aman untuk skripsi):

- "tersebut di atas" → "tersebut" (sinonim ganda)
- "mau tidak mau," → "" (filler; hanya bila muncul, guarded)
- "itu sendiri" → "itu" (filler penekanan berlebih)
- "beberapa X-X" (reduplikasi + penanda jamak) → "beberapa X"
  mis. "beberapa temuan-temuan" → "beberapa temuan"
- "dalam rangka peningkatan" → "untuk meningkatkan" (paralelisme
  verba; catatan: "dalam rangka" umum sudah ada di daftar)

Contoh before-after artikel (1a→1b-d, 2a→2b-d, ..., 10a→10b-c)
menjadi acuan gaya: pangkas yang berlebih, sejajarkan struktur,
jangan ubah makna.

## 3. Panduan untuk detector

- Redundansi di atas adalah masalah **kualitas/kejelasan**, bukan
  bukti AI — laporkan sebagai "perlu ditinjau", bukan vonis.
- Ambiguitas ("Rumah seniman yang antik itu...") tidak bisa
  diperbaiki otomatis (butuh konteks) → humanizer DILARANG menebak;
  cukup tandai perlu ditinjau.
- Kesejajaran imbuhan yang rusak + pemborosan kata berulang
  mendukung sinyal repetisi/pola, selalu bersama sinyal lain
  (single-signal cap tetap berlaku).

## 4. Batasan

- Artikel berbahasa Indonesia; contoh before-after adalah ilustrasi
  gaya, bukan template rewrite otomatis.
- Jangan mengklaim artikel ini sebagai "penelitian sistem ini".
