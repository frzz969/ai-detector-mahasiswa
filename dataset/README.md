# Dataset — Faraz Detector AI

> **STATUS: SINTETIS-DEV, tanpa provenance (tanpa sumber/URL/tanggal/lisensi/log generator),
> HANYA untuk smoke/regression CI via `tests/faraztest.js`.
> DILARANG untuk klaim akurasi atau tuning ambang; metrik resmi hanya dari `eval/`.
> Jangan tambah/edit isi tanpa audit.**

Aturan pakai (mengikat, turunan `referensi/validation-rules.md §5–§6`):

- §5 Kejujuran produk: dilarang klaim "100% akurat/human", "pasti lolos/tidak terdeteksi",
  "jaminan bebas AI". Dataset ini BUKAN bukti akurasi — hanya fixture smoke/regression.
  Angka apa pun dari dataset ini (mis. output `faraztest.js`) tidak boleh dikutip sebagai
  metrik produk. Metrik resmi hanya dari `eval/` dengan provenance lengkap.
- §6 Uji regresi wajib: harness `tests/faraztest.js` menjalankan `heuristic()` +
  `humanizeText()` asli via node (HUMAN ACADEMIC, HUMAN GENERAL, AI GENERATED, HYBRID,
  SHORT TEXT, TECHNICAL, CITATIONS, DATA). Dataset ini hanya groupes input untuk harness itu.

Struktur (37 file, 5 label direktori, tanpa provenance):

- `train/` (12): `ai/` ×5, `human/` ×6, `ai_edited_human/` ×1
- `test/` (13): `ai/` ×4, `human/` ×6, `ai_edited_human/` ×1, `human_edited_ai/` ×1, `paraphrased/` ×1
- `validation/` (12): `ai/` ×4, `human/` ×5, `human_edited_ai/` ×1, `paraphrased/` ×1

Label direktori: `ai` / `human` / `paraphrased` / `human_edited_ai` / `ai_edited_human`.
Tidak ada file provenance (sumber/URL/tanggal/lisensi/log generator) — itu disengaja:
dataset ini sintetis-dev dan tidak layak jadi dasar klaim.

## Audit cepat (2026-10-05, isi .txt TIDAK diubah)

- Duplikat isi (SHA256 penuh): **tidak ada** — 37 hash unik, tidak ada pasangan identik.
- Nyaris-sama (Jaccard himpunan kata, lowercase): semua pasangan nama-mirip ≤ 0,22
  → **tidak ada kembar isi**; kemiripan hanya pada nama file, bukan konten.
- Secret scan (`sk-|AIza|AKIA|ghp_|xoxb-|password\s*[:=]|api[_-]?key\s*[:=]`): **bersih**.
- Validasi harness: `node tests/faraztest.js` → **SMOKE: semua lolos.**

### Panjang kata per file (words) + flag nama-mirip

| File | Words | Flag |
| ---- | ----: | ---- |
| dataset/train/ai/tr-ai-academic.txt | 205 | — |
| dataset/train/ai/tr-ai-formal.txt | 215 | nama-mirip va-ai-formal (isi beda, J=0,22) |
| dataset/train/ai/tr-ai-generic.txt | 212 | nama-mirip va-ai-generic / te-ai-generic (isi beda, J≤0,17) |
| dataset/train/ai/tr-ai-long.txt | 214 | — |
| dataset/train/ai/tr-short-ai.txt | 23 | pendek, di-cap harness (skor 40) |
| dataset/train/ai_edited_human/tr-mixed-ai-edited.txt | 79 | — |
| dataset/train/human/tr-human-academic.txt | 238 | nama-mirip va-human-academic (isi beda, J=0,09) |
| dataset/train/human/tr-human-academic-long.txt | 216 | nama-mirip va-human-academic-long (isi beda, J=0,18) |
| dataset/train/human/tr-human-discussion.txt | 228 | — |
| dataset/train/human/tr-human-formal.txt | 208 | — |
| dataset/train/human/tr-human-personal.txt | 244 | — |
| dataset/train/human/tr-short-human.txt | 25 | nama-mirip te-short-human (isi beda, J=0,02) |
| dataset/train/human/tr-single-signal.txt | 60 | — |
| dataset/test/ai/te-ai-academic.txt | 56 | — |
| dataset/test/ai/te-ai-en.txt | 54 | — |
| dataset/test/ai/te-ai-formal.txt | 59 | — |
| dataset/test/ai/te-ai-generic.txt | 54 | nama-mirip tr-ai-generic / va-ai-generic (isi beda) |
| dataset/test/ai_edited_human/te-mixed-ai-edited.txt | 64 | — |
| dataset/test/human/te-human-academic.txt | 72 | — |
| dataset/test/human/te-human-discussion.txt | 56 | — |
| dataset/test/human/te-human-en.txt | 71 | — |
| dataset/test/human/te-human-formal.txt | 58 | — |
| dataset/test/human/te-human-personal.txt | 49 | — |
| dataset/test/human/te-short-human.txt | 25 | nama-mirip tr-short-human (isi beda, J=0,02) |
| dataset/test/human_edited_ai/te-mixed-human-edited.txt | 54 | nama-mirip va-mixed-human-edited (isi beda, J=0,08) |
| dataset/test/paraphrased/te-mixed-paraphrase.txt | 53 | nama-mirip va-mixed-paraphrase (isi beda, J=0,16) |
| dataset/validation/ai/va-ai-en-generic.txt | 52 | — |
| dataset/validation/ai/va-ai-formal.txt | 220 | nama-mirip tr-ai-formal (isi beda, J=0,22) |
| dataset/validation/ai/va-ai-generic.txt | 220 | nama-mirip tr-ai-generic / te-ai-generic (isi beda, J=0,17) |
| dataset/validation/ai/va-ai-rewritten.txt | 226 | — |
| dataset/validation/human/va-formal-extreme.txt | 67 | — |
| dataset/validation/human/va-human-academic.txt | 231 | nama-mirip tr-human-academic (isi beda, J=0,09) |
| dataset/validation/human/va-human-academic-long.txt | 207 | nama-mirip tr-human-academic-long (isi beda, J=0,18) |
| dataset/validation/human/va-human-discussion.txt | 196 | — |
| dataset/validation/human/va-human-personal.txt | 199 | — |
| dataset/validation/human_edited_ai/va-mixed-human-edited.txt | 58 | nama-mirip te-mixed-human-edited (isi beda, J=0,08) |
| dataset/validation/paraphrased/va-mixed-paraphrase.txt | 61 | nama-mirip te-mixed-paraphrase (isi beda, J=0,16) |

Catatan: "nama-mirip" = pola `tr-*/te-*/va-*` lintas split (train vs test vs validation)
yang wajar sebagai fixture paralel, BUKAN duplikat isi (hash unik + Jaccard rendah).
Risiko kebocoran split secara semantik tetap ada (tanpa provenance) — alasan tambahan
dataset ini dilarang untuk klaim akurasi/tuning ambang.
