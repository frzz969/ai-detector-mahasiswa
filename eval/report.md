# Report Mini — Build Dataset Eval (Fase 2, 2026-10-05)

Aturan: `.slim/deepwork/dataset-eval.md` + `referensi/validation-rules.md` §2/§4.

## Hasil per sel (final, dari `dataset_stats.json`)

| (source, label, split) | n |
|---|---|
| idwiki-20211201 human train / dev / test | 120 / 40 / 40 |
| openalex human train / dev / test | 60 / 20 / 20 |
| m4-id-newspaper human train / dev / test | 60 / 20 / 20 |
| m4-id-newspaper machine train / dev / test | 60 / 20 / 20 |
| **Total** | **500** (train 300 / dev 80 / test 100) |

TEST beku: 100 id, `TEST-HASH: a7a7d6d1eda91c2d33373ea58b5f21b33632861fed803363adf97770f181b538`
(`eval/test_hashes.txt`). Audit 50+50 disiapkan (`eval/audit_sample.jsonl`,
`reviewer_verdict` menunggu tinjauan manual). Dedupe pasca-kuota: 0 gugur
(sha256 & Jaccard≥0.8 bersih; pasangan yatim 0).

## Gugur (dua tahap)

Akuisisi mentah: wiki 1020 judul dilihat → 260 layak (gugur: no_oldrev/baru
pasca-2021 = 242, teks <500 char = 458, list/judul = 17); OpenAlex 400
diambil → 250 kandidat (lisensi kosong = 53); M4 3000 pasang → 115 pasang
(stride merata).
Gate `build_dataset.py`: wiki:length 1 (>3000 kata), oa:length 7 (<50 kata),
m4:length 4 (<50 kata, 4 pasang utuh tersisa 111 ≥ kuota 100). License/date
gate: 0 gugur tambahan (sudah disaring di akuisisi; M4 pengecualian
terdokumentasi `date_verified:false`).

## Waktu tempuh (sesi 2026-10-05)

OpenAlex + M4: ±09:08–09:26. Wiki run-1 (sekuensial, min 800 char):
10:28–10:43 ≈ 15 mnt, GAGAL kuota (132/260). Patch `build_wiki.py` (fetch
revisi paralel kecil 4 workers + min 500 char, tetap jeda + hormati
429/maxlag). Wiki run-2: ±10:44–10:48 ≈ 5 mnt, 260/260 (429 empat kali,
semua di-backoff, bukan bypass). Build final ≈ 10:49. Total sesi ≈ 1,5 jam;
waktu murni sesi cepat ini ≈ 20 mnt akuisisi wiki + <1 mnt build.

## Batasan (jujur)

1. Lisensi M4 TIDAK TERVERIFIKASI di repo (klaim CC-BY-NC-SA-4.0 via
   SemEval-2024 Task 8) — butuh review; bila ditolak, sel M4 diganti.
2. `pub_date` M4 = null (tak tercatat di rilis); date-gate <2022 hanya
   diberlakukan ke wiki/openalex.
3. Abstrak OpenAlex pendek (median 156 kata); 7 gugur length-gate — wajar,
   oversampling 2.5x menutup.
4. Wiki acak → didominasi artikel pendek/stub (gugur 75%); yield dinaikkan
   via ambang 500 char + oversampling, bukan via pelonggaran gate final.
5. Klaim dilarang: "100% AI / pasti / dijamin lolos / bebas AI".

## Follow-up (sisa)

- [ ] Audit manual 50+50 (`reviewer_verdict` di `audit_sample.jsonl`).
- [ ] Harness eval + baseline DEV — Fase 3 (Tune hanya di DEV).
- [ ] Keputusan reviewer atas lisensi M4 (pertahankan/ganti sel).
- [ ] Scale-up bertahap bila perlu (slot kuota: wiki/OA oversample siap).
