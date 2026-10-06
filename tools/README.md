# Tools — alat bantu kerja manual

Kumpulan skrip kecil Node tanpa dependensi. Cara pakai umum:
`node tools/<nama-file>.js` dari folder repo.

## Daftar tool

| Tool | Fungsi | Jalanin | Input → Output |
|---|---|---|---|
| `audit-helper.js` | Nemani audit blind 100 sampel: nyodorin teks otomatis, nanya verdict + confidence + catatan satu per satu | `node tools/audit-helper.js` | `eval/audit_sample_v2.jsonl` + `eval/dataset_v2.jsonl` → `eval/audit_review.jsonl` (nambah per baris, file lama tidak diubah) |
| `benchmark-helper.js` | Nemani nilai 30 query pilot: pilih query, isi 10 kandidat + relevance 0/1/2 + hard-negative, validasi lalu simpan ganti baris template | `node tools/benchmark-helper.js` | `eval/retrieval-benchmark.jsonl` → baris berlabel per query_id (tulis atomik, baris lain tidak disentuh) |

## Aturan main (berlaku buat semua tool di sini)

1. Blind: label asli tidak pernah ditampilkan. Jangan intip `label`/
   `generator` di file sumber sebelum verdict dikunci.
2. Jangan ngarang verdict: ragu sedikit = `Uncertain`. Jangan nebak AI/Human.
3. Jangan ubah file data (`eval/audit_sample_v2.jsonl`, `eval/dataset_v2.jsonl`).
   Hasil kerja selalu ke file output terpisah.
4. Ulangi aman: tool lewati otomatis yang sudah direview (resume),
   jadi boleh keluar (`q`) kapan saja dan lanjut nanti.
