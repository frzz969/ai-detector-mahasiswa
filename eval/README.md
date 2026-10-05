# Eval — Dataset Evaluasi Detektor (Fase 2)

Dataset evaluasi 500 sampel Bahasa Indonesia (300 human + 200 machine),
dibangun 100% gratis tanpa API key: Wikipedia ID + OpenAlex OA + M4-ID.
Aturan yang dipakai: `.slim/deepwork/dataset-eval.md` (Fase 2: sumber manusia
pre-2022 + AI publik berlabel; split per topik; dedupe; TEST beku) dan
`referensi/validation-rules.md` §2 (gagal → exit non-nol + pesan jelas, tanpa
fallback diam-diam) + §4 (quality gate eksplisit).

## Komposisi final (`eval/dataset.jsonl`, 500 baris)

| Sel | Label | Genre | Train | Dev | Test | Total |
|---|---|---|---|---|---|---|
| idwiki-20211201 | human | encyclopedia | 120 | 40 | 40 | 200 |
| openalex | human | abstract | 60 | 20 | 20 | 100 |
| m4-id-newspaper | human | news | 60 | 20 | 20 | 100 |
| m4-id-newspaper | machine | news | 60 | 20 | 20 | 100 |

## Sumber, lisensi & date-gate

- **Wikipedia Indonesia** (`idwiki-20211201`): Action API resmi, revisi yang
  berlaku per 2021-12-31 (`rvstart` + `rvdir=older`). Lisensi CC BY-SA 3.0.
  Date-gate: `rev_date < 2022-01-01`, judul baru pasca-2021 dibuang.
- **OpenAlex** (`openalex`): API resmi gratis, filter
  `2000-01-01..2021-12-31, language:id, has_abstract, is_oa`. Hanya lisensi
  terbuka yang tercatat; `unknown`/kosong ditolak di gate. Date-gate sama.
- **M4-ID** (`m4-id-newspaper`): subset resmi `id-newspaper_chatGPT.jsonl`
  (human + pasangan generasi ChatGPT, 100 pasang). Provenance human (koreksi
  Fase 3, Gate 2 ora-2): korpus `id_newspapers_2018` per Tabel 1 Wang et al.
  2023 — koleksi 2018, pre-2022 dan pre-LLM. `pub_date=null,
  date_verified:false` karena rilis M4 tak mencatat tanggal per artikel
  (isi menyebut 2018, konsisten). Lisensi: CC-BY-NC-SA (via paper + syarat
  M4GT-Bench/SemEval-2024 Task 8; file LICENSE tidak ada di repo M4 —
  dasar via paper, bukan klaim repo). Riset non-komersial + sitasi wajib
  (lihat bawah).

Gate di `build_dataset.py`: license-gate → date-gate (human wiki/OA wajib
pre-2022) → length 50–3000 kata → kuota sel → dedupe sha256 + Jaccard≥0.8
(pasangan se-`pair_id` dikecualikan) → split 60/20/20 per
(source, genre, label), pasangan M4 selalu se-split.

Keputusan `other-oa` (Fase 3 SLIM, dipilih yang bersih: pertahankan +
flag, dataset beku tidak diubah): 2 baris final (`oah-0009` dev,
`oah-0016` train) berlisensi persis `other-oa` dari API OpenAlex — status OA
terverifikasi (`is_oa:true`), hanya string lisensinya samar, dan varian
mentah yang lebih rinci tidak tersimpan di `raw_openalex.jsonl`. Karena
TEST sudah dibekukan, keduanya dipertahankan dengan flag keterbatasan ini
(BUKAN dibuang diam-diam). Aturan rebuild berikutnya: simpan string lisensi
mentah (`license_raw`) dan tolak `other-oa`/samar di license-gate
(ragu → buang).

## Reproduksi

```powershell
py eval/build_wiki.py --contact "nama <email>" --keep 260 --min-chars 500 --workers 4
py eval/build_openalex.py --mailto "nama <email>" --keep 100
py eval/build_m4.py --n-human 100 --n-machine 100
py eval/build_dataset.py   # -> dataset.jsonl + dataset_stats.json + test_hashes.txt + audit_sample.jsonl
```

Hanya membaca/menulis `eval/`; `dataset/` lama tidak pernah dipakai
(anti-bocor, dicek di `build_dataset.py`). TEST dibekukan:
`eval/test_hashes.txt` (`TEST-HASH: a7a7d6d1eda91c2d33373ea58b5f21b33632861fed803363adf97770f181b538`).
Tune hanya di DEV — dilarang ubah ambang agar cocok TEST.

## Skema per baris

`{id,text,label,source,url,license,pub_date,genre,lang,ai_kind,generator,prompt_id,pair_id,words,sha256,split}`

## Batasan & follow-up

Detail di `eval/report.md`. Sisa: harness eval + baseline DEV (Fase 3),
audit manual 50+50 (`audit_sample.jsonl` sudah disiapkan, kolom
`reviewer_verdict` kosong).
Bahasa hasil: "terindikasi / perlu ditinjau / confidence" — dilarang klaim
"100% AI", "pasti", "dijamin lolos", "bebas AI".

## Sitasi

Wang et al. 2023 (M4, arXiv:2305.14908); M4GT-Bench / SemEval-2024 Task 8
(arXiv:2404.14183). Konten wiki: atribusi CC BY-SA 3.0 per URL artikel.
Pakai sel M4: riset non-komersial + atribusi/sitasi (syarat M4GT-Bench).
