# Report Mini — Build Dataset Eval (Fase 2, 2026-10-05)

Aturan: `.slim/deepwork/dataset-eval.md` + `referensi/validation-rules.md` §2/§4.

## Hasil per sel (final, dari `dataset_stats.json`)

| (source, label, split) | n |
|---|---|
| idwiki-20211201 human train / dev / test | 120 / 40 / 40 |
| openalex human train / dev / test | 60 / 20 / 20 |
| m4-id-newspaper human train / dev / test | 60 / 20 / 20 |
| m4-id-newspaper machine train / dev / test | 60 / 20 / 20 |
| **Total** | **500** (train 300 / dev 100 / test 100) |

TEST beku: 100 id, `TEST-HASH: a7a7d6d1eda91c2d33373ea58b5f21b33632861fed803363adf97770f181b538`
(`eval/test_hashes.txt`). Audit 50+50 selesai 100/100 (`eval/audit_sample.jsonl`,
tinjauan manual 2026-10-05: 88 lolos + 12 lolos-bersyarat M4, 0 buang). Dedupe pasca-kuota: 0 gugur
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

## Laporan Evaluasi Detektor (STEP 1–5, 2026-10-05)

Semuanya diukur `heuristic()` lokal (ambang 50, tidak ada tuning). Angka ini
indikasi, bukan vonis. Skor 0–100 **bukan probability** — kalibrasi tidak
diuji (`calibration: "not_tested"` di `dev_baseline*.json`).

### Baseline lama — `eval/dataset.jsonl` (500 baris, id)

```
n DEV=100 (human=80, machine=20)
AUC=0.743 | akurasi=81.0% | presisi=100.0% | recall=5.0% | F1=9.5%
FPR=0.0% | FNR=95.0%
   baseline tebak-semua-human = 80.0%  -> selisih hanya +1.0 poin
```

**Angka ini MENYESATKAN.** Akurasi 81% itu nyaris sama dengan majority baseline (80%). Presisi 100%
adalah artefak (hanya 1 klaim AI, kebetulan benar). F1 9.5% yang jujur.

### STEP 2 — `eval/dataset_v2.jsonl` (900 baris)

Cell baru: M4 **PeerRead** (`academic`, `lang=en`, 2 generator: chatgpt + llama)
= 400 baris. Dipakai untuk menutup gap `machine × academic = 0`.

```
n DEV=180 (human=120, machine=60)
AUC=0.901 | akurasi=79.4% | presisi=100.0% | recall=38.3% | F1=55.4%
FPR=0.0% | FNR=61.7%
   baseline tebak-semua-human = 66.7%  -> selisih +12.8 poin
```

Per bahasa (**jangan dicampur** — sel EN beda bahasa dari sel ID):

| lang | n | F1 | recall | FPR | AUC |
|---|---|---|---|---|---|
| id | 100 | 26.1% | 15.0% | 0.0% | 0.757 |
| en | 80 | **66.7%** | **50.0%** | 0.0% | **0.968** |

**Temuan: recall 5% pada dataset lama BUKAN "detektor lemah" — itu domain
effect.** Di domain academic F1 66.7% vs 26.1% pada news ID.

Konfound yang sudah diperiksa dan TIDAK jadi penyebab: review PeerRead manusia
berformat bullet (`- Strengths:`), machine mengalir. Setelah marker itu dibuang
dari teks manusia, skor tetap median 15, 0 baris ≥50. Jadi FPR 0% bukan artefak
format — tapi `format_confound: true` tetap dicatat di dataset.

### STEP 5 — Benchmark LOCAL vs AI (`tests/ai-live-eval.js`)

`--dataset=` + sampling stratified per `(label, lang)`. Rate-limit handling
(jeda antar-call + backoff 429) menaikkan coverage 71% → **100% (79/79)**;
sebelumnya 23 sampel hilang dan semuanya `429/RATE_LIMITED`.

```
metrik        LOCAL          AI
tp ...........           15            32
fp ...........            0            16
accuracy .....        69.6%         70.9%
precision ....       100.0%         66.7%
recall .......        38.5%         82.1%
f1 ...........        55.6%         73.6%
fpr ..........         0.0%        40.0%
fnr ..........        61.5%         17.9%
auc ..........        0.872        0.788
```

### STEP 6 — Bobot AI: JANGAN dinaikkan

Tiga bukti, semuanya ke arah yang sama:

1. **AUC AI (0.788) lebih buruk dari LOCAL (0.872).** AI bukan ranker yang lebih
   baik. F1 AI yang lebih tinggi adalah efek ambang, bukan kemampuan.
2. **AI menambah false positive: FPR 0% → 40%.** 16 dari 40 teks manusia
   akademik salah dikira AI. Untuk aplikasi yang dipakai mahasiswa, itu
  kerugian nyata.
3. Verdict gate `SEBAGIAN` (median terpisah, rentang tumpang tindih), bukan
   `DAPAT DIPERCAYA`.

Guard lokal yang selama ini dianggap terlalu konservatif justru berguna:
FPR 0%. Bobot AI konservatif di `combine.js` (langFactor 0.5, supremacy cap +5,
gerbang regresi) adalah keputusan yang terbukti benar. **Jangan diubah.**

### STEP 4 — Mixed (teks sebagian AI)

`eval/build_mixed.py` → 180 baris (ai_fraction 0.3 / 0.5 / 0.7, 60 masing-masing),
`eval/mixed-probe.js` untuk mengukur respons skor terhadap porsi AI.

Bug yang ketemu saat": versi pertama memakai SEMUA kalimat dari kedua
sisi, sehingga `ai_fraction=0.3` berakhir jadi **0.59–0.67** — label ground
truth bohong. Diperbaiki dengan `plan_counts()` yang benar-benar menghitung
rasio; drift maksimum sekarang ≤ 0.05 dan `ai_fraction_actual` disimpan
per baris.

Hasil (sesudah rasio benar):

```
porsi AI   n   median   >=50
   30%    60      27     1 (1.7%)
   50%    60      36     5 (8.3%)
   70%    60      46    16 (26.7%)
monotonik naik: YA (+9.0 | +10.0 median per bucket)
   pembanding: human murni median 15, machine murni median 51.5 (celah 36.5)
```

Detector **respon terhadap porsi AI** dan tidak over-flag teks campuran —
pada 70% AI masih hanya 26.7% yang lewat ambang. Ini perilaku yang benar untuk
alat student-facing.

KONFOUND WAJIB: sel ini dikonstruksi dengan sentence-interleave, jadi batas
kalimatnya artificial. Angka ini = "respons skor terhadap porsi AI", **BUKAN**
"akurasi deteksi tulisan campuran manusia". Tidak boleh diklaim sebagai yang
kedua.

Yang TIDAK ada dan sengaja tidak dikonstruksi: `human_edited_ai` dan
`ai_edited_human`. Butuh editor manusia sungguhan; mengedit sendiri akan
membuat label berasal dari tangan yang sama dengan sistem yang diuji.

### STEP 3 — Indonesian academic: TERBLOKIR

M4 Indonesia hanya punya `id-newspaper`. Korpus esai mahasiswa Indonesia
berlisensi nyaris tidak ada di sumber publik (Turnitin/iThenticate
proprietary). Sel `academic` sekarang hanya `lang=en`.

**Akibatnya yang terukur masih bukan domain aplikasi utama.** Perlu keputusan:
terima English-only untuk baseline, atau cari Indonesian journal OJS berlisensi
CC.

## Follow-up (sisa)

- [ ] STEP 3: Indonesian academic cell (butuh sumber berlisensi — keputusan produk)
- [ ] Audit manual 50+50 untuk sel academic + mixed (`audit_sample_v2.jsonl`
      sudah disiapkan, kolom `reviewer_verdict` masih kosong)
- [ ] Keputusan reviewer atas lisensi M4 (`license_verified: false` masih terbuka)
