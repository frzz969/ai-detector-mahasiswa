# Audit Triage — eval/audit_sample_v2.jsonl (100 baris)

> Read-only. `reviewer_verdict` tetap kosong (tidak diisi di sini).
> Skor/metrik di bawah adalah metadata/baseline reproduksi, BUKAN vonis
> kepengarangan dan BUKAN klaim akurasi detector.

## 1. Tabel ringkas

| Dimensi | Hasil |
|---|---|
| n baris | 100 |
| label | human=50, machine=50 |
| source | m4-peerread-chatgpt=26, m4-peerread-llama=25, m4-id-newspaper=24, openalex=14, idwiki-20211201=11 |
| machine per source | m4-id-newspaper=18, m4-peerread-chatgpt=16, m4-peerread-llama=16, openalex=0, idwiki=0 |
| split | train=58, test=20, dev=22 |
| words | min=75, median=306, maks=1595 |
| words per source (min/med/maks) | m4-peerread-llama 84/265/525; m4-id-newspaper 198/323/1388; idwiki 89/255/1595; m4-peerread-chatgpt 133/313.5/1029; openalex 75/179.5/397 |
| auto_checks | license_ok=true 100/100; len_ok=true 100/100; date_ok=true 25/100 (wiki+openalex), date_ok=unverified-m4 75/100 |
| reviewer_verdict terisi | 0 (semua kosong — benar, belum direview) |

### Anomali otomatis (hasil scan, bukan verdict)

| Cek | Hasil |
|---|---|
| url kosong | 0 |
| license kosong | 0 |
| words < 50 | 0 (terpendek oah-0055=75 kata) |
| duplikat id | 0 |
| duplikat teks | TIDAK DAPAT DICEK — sampel audit tidak memuat kolom `text` (hanya metadata); cek duplikat/Jaccard harus di `dataset_v2.jsonl` |
| sel mixed / sentence-interleave | 0 baris mixed di sampel audit maupun `dataset_v2.jsonl` (900 baris, mixed_rows=0); konstruksi interleave hanya relevan bila `build_mixed.py`/`raw_mixed*.jsonl` dipakai — di luar sampel ini |
| pub_date null | 75/100 (seluruh sel M4; date_ok=unverified-m4) |
| lisensi klaim tak terverifikasi | 75/100 sel M4 mengandung frasa "TIDAK TERVERIFIKASI / via paper, bukan klaim repo" — wajib review manusia |
| sampel flag other-oa (oah-0009/oah-0016) | tidak ada di sampel audit ini |

## 2. Maksimal 15 sampel paling curiga (flag → yang harus dicek manusia)

Tanpa verdict — hanya prioritas antrean review.

| # | id | Alasan flag | Yang harus dicek manusia |
|---|---|---|---|
| 1 | wikih-0164 | Terpanjang (1595 kata, human/wiki/test) | Potongan/trunkasi, relevansi judul vs isi (buka URL), tanggal revisi pre-2022 |
| 2 | wikih-0102 | 1590 kata (human/wiki/dev) | Sama seperti #1; pastikan bukan artikel gabungan |
| 3 | m4h-0007 | 1388 kata (human/newspaper/train, terpanjang di sel M4) | Integritas pasangan pair_id di dataset_v2, bukan ringkasan/duplikat |
| 4 | m4pr1h-0036 | 1029 kata (human/peerread-chatgpt/train) | Bahasa EN akademik, pastikan human asli bukan generasi |
| 5 | oah-0055 | Terpendek (75 kata, human/openalex/dev) | Apakah abstrak utuh atau terpotong; kecukupan konteks |
| 6 | m4pr2h-0060 | 84 kata (human/peerread-llama/train) | Ketipisan isi; bandingkan dengan pasangan machine-nya |
| 7 | m4pr2m-0078 | 85 kata (machine/peerread-llama/train) | Sama; pastikan label machine benar dari generator |
| 8 | wikih-0141 | 89 kata (human/wiki/train) | Artikel rintisan vs utuh; cek URL revisi |
| 9 | m4pr2h-0073 | M4 test human (472 kata) | Perwakilan sel M4-test: lisensi + tanggal tak terverifikasi |
| 10 | m4h-0065 | M4 test human newspaper (413 kata) | Sama; verifikasi provenance id-newspaper 2018 |
| 11 | m4pr1h-0086 | M4 test human terpendek relatif (168 kata) | Kecukupan panjang untuk review adil |
| 12 | m4m-0068 (contoh) | Perwakilan machine/newspaper | Pastikan teks memang output ChatGPT (ai_kind/generator/prompt_id di dataset_v2) |
| 13 | m4pr1m-0085 (contoh) | Perwakilan machine/peerread-chatgpt | Sama; cek gaya EN akademik vs human |
| 14 | m4pr2m-0100 (contoh) | Perwakilan machine/peerread-llama | Sama; cek generator llama vs chatgpt tidak tertukar |
| 15 | oah-0027 | 121 kata (human/openalex/train, pendek) | Abstrak pendek: utuh vs terpotong |

## 3. Panduan 5 langkah review manual

1. Buka sumber: kunjungi `url`, cocokkan judul/isi dan tanggal (`pub_date` pre-2022 untuk wiki/openalex; M4 = koleksi 2018/paper, catat bila ragu).
2. Cek lisensi: wiki CC BY-SA 3.0 per URL; openalex hanya lisensi terbuka tercatat; M4 = riset non-komersial + sitasi wajib, frasa "TIDAK TERVERIFIKASI" berarti jangan hapus flag sampai bukti ditemukan.
3. Cek integritas teks di `dataset_v2.jsonl` (bukan di file audit ini): panjang kata, pasangan human↔machine se-`pair_id` se-split, tidak ada duplikat sha256/Jaccard≥0.8 lintas split.
4. Isi `reviewer_verdict` hanya setelah 1–3 lolos: `ok` / `ragu` / `buang:<alasan>` + `reviewer_note` singkat (sumber dibuka, apa yang diverifikasi).
5. Jangan ubah ambang/dataset/split agar cocok review; TEST tetap beku (`test_hashes_v2.txt` tidak dibuka saat review).

## 4. Konfirmasi re-run baseline DEV v2 (read-only, tanpa tuning)

Perintah: `node eval/run.js --dataset=eval/dataset_v2.jsonl --out=<TEMP>/dev_rerun_v2.json`
(output dialihkan ke TEMP agar repo tidak berubah; ambang eksisting 50 dipakai apa adanya).

Hasil rerun DEV (n=180: human=120, machine=60) — IDENTIK dengan `eval/dev_baseline_v2.json`:

- confusion TP=23 TN=120 FP=0 FN=37; AUC=0.901; akurasi=79.4%; presisi=100.0%; recall/TPR=38.3%; F1=55.4%; FPR=0.0%; FNR=61.7%
- per lang id (n=100): ak=83.0% P=100% R=15.0% F1=26.1% AUC=0.757
- per lang en (n=80): ak=75.0% P=100% R=50.0% F1=66.7% AUC=0.968
- TPR genre news=15.0% (n=20), academic=50.0% (n=40); median skor human=19 vs machine=42

Status: KONFIRMASI SAMA (7/7 metrik sama persis). Ini reproduksi baseline,
bukan klaim kemampuan detector; skor adalah indikasi yang perlu ditinjau manusia.

## 5. Protokol audit blind 1-reviewer

1. Blind + acak: reviewer hanya melihat ID + teks dari `dataset_v2.jsonl`
   (sembunyikan `label`/`source`/`generator` asli); acak urutan 100 sampel
   sebelum review agar tidak ada bias urutan/split.
2. Form per sampel (satu baris per ID): ID | bahasa (id/en) | domain
   (news/encyclopedia/abstract/academic) | verdict (AI / Human / Uncertain) |
   confidence (Low / Med / High) | catatan singkat (sinyal yang diamati).
3. Uncertain wajib: bila ragu sedikit pun, pilih Uncertain (jangan menebak
   AI/Human). Keraguan adalah data, bukan kegagalan.
4. Metadata bukan dasar verdict: `pub_date`/`license`/panjang kata adalah
   data-quality issue (dicatat di catatan) — verdict hanya dari isi teks.
5. Cakupan + adjudikasi: kerjakan 15 sampel prioritas (§2) dulu; setelah
   100 selesai, adjudikasi ulang SEMUA Uncertain + semua baris yang
   disagree-vs-label (banding label asli BARU dibuka tahap ini), lalu
   tentukan ok / ragu-persisten / buang beserta alasan.

## 6. Catatan P1: S1 test-informed fix + hasil DEV v2 post-S1 (ukur saja, tanpa tuning)

> Aturan pakai: `referensi/validation-rules.md` (TEST beku, tune hanya di DEV),
> `referensi/detector-rules.md` §6 dan AGENTS.md §2 (hanya bahasa indikasi:
> terindikasi / perlu ditinjau / confidence rendah-sedang-tinggi).
> Hasil di bawah adalah indikasi yang perlu ditinjau manusia, bukan vonis.

### 6.1. S1 adalah TEST-INFORMED FIX (bukan temuan buta)

- Commit S1 `9447317` (ID-Scaffold Dispersion) menaikkan skor item
  `te-ai-generic` 44→52, `te-ai-academic` 46→55, `te-ai-formal` 48→56.
- Item `te-ai-*` di `tests/dataset.js:119-127` adalah split "test" HELD-OUT
  dengan freeze note (`tests/dataset.js` baris 20-23, 41-42: DILARANG tuning
  pakai item test). S1 ditarget ke item-item itu, jadi S1 = test-informed fix.
- Keputusan: perilaku S1 dipertahankan (tidak di-revert), TAPI angka
  te-ai-* post-S1 (52/55/56) tidak boleh dikutip sebagai evaluasi held-out
  murni. Bukti keamanan yang sah hanya dari DEV v2 eksternal
  (`eval/dev_baseline_v2.json`, n=180).

### 6.2. FREEZE (beku — berlaku mulai catatan ini)

- Angka te-ai-* post-S1 (52/55/56) adalah BASELINE BARU yang dibekukan.
- Dilarang tuning lanjutan terhadap item test mana pun.
- Perubahan berikut wajib membawa bukti dari DEV eksternal dulu
  (bukan dari item test).
- Konstanta S1 + caps + bobot combine DILARANG diutak-atik tanpa rerun
  DEV v2 (`node eval/run.js --dataset=eval/dataset_v2.jsonl`).

### 6.3. Hasil DEV v2 post-S1 (prosedur sama seperti §4, read-only)

Perintah: `node eval/run.js --dataset=eval/dataset_v2.jsonl --out=eval/dev_s1_post.json`
(`js/` read-only, ambang 50 dipakai apa adanya, TEST-blind, tanpa tuning).
Hasil mentah: `eval/dev_s1_post.json` (n=180: human=120, machine=60).

| Metrik | Pre (`dev_baseline_v2.json`) | Post (`dev_s1_post.json`) | Selisih |
|---|---|---|---|
| confusion | TP=23 TN=120 FP=0 FN=37 | TP=22 TN=120 FP=0 FN=38 | −1 TP |
| recall/TPR keseluruhan | 38.3% | 36.7% | −1.7pp |
| recall-ID (machine id, n=20) | 15.0% (3/20) | 10.0% (2/20) | −5.0pp |
| FPR human (n=120) | 0.0% | 0.0% | tetap |
| FPR human-ID (n=80) | 0.0% | 0.0% | tetap |
| FPR manusia-formal/abstract (n=20) | 0.0% | 0.0% | tetap |
| presisi | 100.0% | 100.0% | tetap |
| F1 | 55.4% | 53.7% | −1.7pp |
| akurasi | 79.4% | 78.9% | −0.5pp |
| AUC | 0.901 (0.9006) | 0.901 (0.9010) | +0.0004 (praktis tetap) |
| TPR news (machine, n=20) | 15.0% | 10.0% | −5.0pp |
| TPR academic (machine, n=40) | 50.0% | 50.0% | tetap |
| per-lang en (n=80) | ak=75.0% P=100% R=50.0% F1=66.7% AUC=0.968 | sama persis | tetap |
| per-lang id (n=100) | ak=83.0% P=100% R=15.0% F1=26.1% AUC=0.758 | ak=82.0% P=100% R=10.0% F1=18.2% AUC=0.758 | recall −5.0pp |
| median skor human vs machine | 19 vs 42 | 19 vs 41.5 | machine −0.5 |

Satu-satunya baris yang pindah prediksi: `m4m-0090` (machine/news/id,
301 kata) skor 54→49, lewat di bawah ambang 50 sehingga luput terdeteksi.
5 baris lain berubah skor tanpa pindah prediksi: `oah-0004` (human) 31→28,
`m4m-0011` 43→41, `m4m-0041` 67→62 (tetap terdeteksi), `m4m-0068` 41→40,
`m4h-0070` (human) 39→40 (tetap di bawah ambang).

### 6.4. Kesimpulan jujur (termasuk regresi — tidak disembunyikan)

1. Di DEV eksternal S1 tidak menambah temuan machine: recall keseluruhan turun 38.3%→36.7% (satu TP hilang), F1 turun 55.4%→53.7%, akurasi turun 79.4%→78.9%.
2. Regresi terkonsentrasi di sel machine-ID/news (TPR 15.0%→10.0%, satu baris `m4m-0090` skor 54→49); sel academic dan sel en tidak berubah sama sekali (50.0%/50.0%).
3. Tidak ada biaya tuduhan keliru: FPR human tetap 0.0% (termasuk human-ID dan formal-abstract), presisi tetap 100.0%, AUC praktis tetap 0.901 — S1 aman dari sisi human di data eksternal.
4. Kenaikan skor te-ai-* di test adalah efek yang ditarget ke item test itu sendiri, bukan generalisasi: angka test post-S1 (52/55/56) adalah baseline beku, bukan bukti held-out, dan tidak boleh dikutip sebagai evaluasi murni.
5. Tindak lanjut: bekukan konstanta S1 + caps + bobot; bila recall-ID mau diperbaiki, tuning hanya boleh memakai DEV (bukan item test) dan wajib rerun DEV v2.

## 7. Catatan P2: keterbatasan wasit + rekap final 102 ID

Keterbatasan wasit (jujur): dari 102 ID yang direview, 21 ID BEDA semuanya diputus ikut zhu (21/21, field `wasit_ikut=zhu` di `eval/audit_review.jsonl`) — ini tie-break satu arah, BUKAN blind re-review independen, jadi audit ini belum bisa dikutip sebagai angka kualitas; statusnya "review terkumpul, rekap final tersedia".

Rekap final: `eval/audit_final_102.json` (dari 166 baris `audit_review.jsonl`: 25 lama + 120 reviewer — 15 frz, 15 kink dawus, 15 maisya, 75 zhu — + 21 wasit) — 102 ID: sepakat=22, wasit=21, tunggal=59; final AI=30, Human=61, Uncertain=11. Aturan final: ada wasit → ikut wasit; tanpa wasit dan semua sepakat → ikut itu; satu reviewer → ikut itu; tanpa majority vote otomatis, tanpa mengarang. Hasil berupa indikasi yang perlu ditinjau manusia, bukan vonis.
