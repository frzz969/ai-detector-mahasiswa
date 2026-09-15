// tests/dataset.js — Registry + loader dataset berlabel Faraz Detector AI.
//
// Aturan pakai:
// - detector-rules §4 (Akademik ≠ AI), §7 (kasus uji wajib) + validation-rules §6.
// - Kolom: { id, label: human|ai|mixed, language: id|en,
//            category, split: train|validation|test, edge[], text }.
// - Isi teks tinggal di dataset/<split>/<dir>/<id>.txt (evaluation data);
//   file ini hanya metadata + loader (baca via fs). Bentuk export tetap { DATASET }.
// - Kategori = Human Personal/Academic/Formal/Discussion,
//   AI Generic/Academic/Formal (+Rewritten), Mixed AI-Edited/Human-Edited/Paraphrased.
// - length (short/medium/long) dihitung harness dari jumlah kata; kolom
//   `edge` menandai kasus uji wajib: short, single-signal, mixed,
//   ai-edited-human, formal-extreme, repetitive, structured-academic,
//   academic-human, academic-ai.
// - Pemetaan direktori: label human → human/, label ai → ai/,
//   mixed/ai-edited-human → ai_edited_human/, mixed/human-edited-ai →
//   human_edited_ai/, mixed/paraphrased → paraphrased/ (category asli utuh).
// - Detector/JS DILARANG membaca dataset/ saat runtime (hanya data evaluasi harness).
//
// FREEZE NOTE (Gate 1 rationale, upgrade-akurasi.md):
// split "test" adalah HELD-OUT. DILARANG memakai item test untuk tuning
// threshold/bobot. Tuning hanya boleh menyentuh train (+validation untuk
// konfirmasi). Fase 1: threshold pakai yang ada (50/75/30), tanpa tuning.
"use strict";

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.join(__dirname, "..");

const REGISTRY = [
  { id: "tr-human-personal", label: "human", language: "id",
    category: "human/personal", split: "train", edge: [],
    file: "dataset/train/human/tr-human-personal.txt" },
  { id: "tr-human-academic", label: "human", language: "id",
    category: "human/academic", split: "train", edge: ["academic-human","structured-academic"],
    file: "dataset/train/human/tr-human-academic.txt" },
  { id: "tr-ai-generic", label: "ai", language: "id",
    category: "ai/generic", split: "train", edge: [],
    file: "dataset/train/ai/tr-ai-generic.txt" },
  { id: "tr-ai-academic", label: "ai", language: "id",
    category: "ai/academic", split: "train", edge: ["academic-ai"],
    file: "dataset/train/ai/tr-ai-academic.txt" },
  { id: "tr-mixed-ai-edited", label: "mixed", language: "id",
    category: "mixed/ai-edited-human", split: "train", edge: ["mixed","ai-edited-human"],
    file: "dataset/train/ai_edited_human/tr-mixed-ai-edited.txt" },
  { id: "tr-short-human", label: "human", language: "id",
    category: "human/personal", split: "train", edge: ["short"],
    file: "dataset/train/human/tr-short-human.txt" },
  { id: "tr-short-ai", label: "ai", language: "id",
    category: "ai/generic", split: "train", edge: ["short"],
    file: "dataset/train/ai/tr-short-ai.txt" },
  { id: "tr-human-discussion", label: "human", language: "id",
    category: "human/discussion", split: "train", edge: [],
    file: "dataset/train/human/tr-human-discussion.txt" },
  { id: "tr-ai-formal", label: "ai", language: "id",
    category: "ai/formal", split: "train", edge: [],
    file: "dataset/train/ai/tr-ai-formal.txt" },
  { id: "tr-human-formal", label: "human", language: "id",
    category: "human/formal", split: "train", edge: [],
    file: "dataset/train/human/tr-human-formal.txt" },
  { id: "tr-single-signal", label: "human", language: "id",
    category: "human/discussion", split: "train", edge: ["single-signal"],
    file: "dataset/train/human/tr-single-signal.txt" },
  { id: "va-human-personal", label: "human", language: "id",
    category: "human/personal", split: "validation", edge: [],
    file: "dataset/validation/human/va-human-personal.txt" },
  { id: "va-human-academic", label: "human", language: "id",
    category: "human/academic", split: "validation", edge: ["academic-human","structured-academic"],
    file: "dataset/validation/human/va-human-academic.txt" },
  { id: "va-ai-generic", label: "ai", language: "id",
    category: "ai/generic", split: "validation", edge: ["repetitive"],
    file: "dataset/validation/ai/va-ai-generic.txt" },
  { id: "va-ai-rewritten", label: "ai", language: "id",
    category: "ai/rewritten", split: "validation", edge: [],
    file: "dataset/validation/ai/va-ai-rewritten.txt" },
  { id: "va-mixed-human-edited", label: "mixed", language: "id",
    category: "mixed/human-edited-ai", split: "validation", edge: ["mixed"],
    file: "dataset/validation/human_edited_ai/va-mixed-human-edited.txt" },
  { id: "va-mixed-paraphrase", label: "mixed", language: "id",
    category: "mixed/paraphrased", split: "validation", edge: ["mixed"],
    file: "dataset/validation/paraphrased/va-mixed-paraphrase.txt" },
  { id: "va-formal-extreme", label: "human", language: "id",
    category: "human/formal", split: "validation", edge: ["formal-extreme"],
    file: "dataset/validation/human/va-formal-extreme.txt" },
  { id: "va-ai-formal", label: "ai", language: "id",
    category: "ai/formal", split: "validation", edge: ["academic-ai"],
    file: "dataset/validation/ai/va-ai-formal.txt" },
  { id: "va-human-discussion", label: "human", language: "id",
    category: "human/discussion", split: "validation", edge: [],
    file: "dataset/validation/human/va-human-discussion.txt" },
  { id: "va-ai-en-generic", label: "ai", language: "en",
    category: "ai/generic", split: "validation", edge: [],
    file: "dataset/validation/ai/va-ai-en-generic.txt" },
  { id: "tr-human-academic-long", label: "human", language: "id",
    category: "human/academic", split: "train", edge: ["academic-human","structured-academic"],
    file: "dataset/train/human/tr-human-academic-long.txt" },
  { id: "tr-ai-long", label: "ai", language: "id",
    category: "ai/generic", split: "train", edge: ["academic-ai"],
    file: "dataset/train/ai/tr-ai-long.txt" },
  { id: "va-human-academic-long", label: "human", language: "id",
    category: "human/academic", split: "validation", edge: ["academic-human","structured-academic"],
    file: "dataset/validation/human/va-human-academic-long.txt" },
  { id: "te-human-personal", label: "human", language: "id",
    category: "human/personal", split: "test", edge: [],
    file: "dataset/test/human/te-human-personal.txt" },
  { id: "te-human-academic", label: "human", language: "id",
    category: "human/academic", split: "test", edge: ["academic-human"],
    file: "dataset/test/human/te-human-academic.txt" },
  { id: "te-human-formal", label: "human", language: "id",
    category: "human/formal", split: "test", edge: ["formal-extreme"],
    file: "dataset/test/human/te-human-formal.txt" },
  { id: "te-human-discussion", label: "human", language: "id",
    category: "human/discussion", split: "test", edge: [],
    file: "dataset/test/human/te-human-discussion.txt" },
  { id: "te-human-en", label: "human", language: "en",
    category: "human/personal", split: "test", edge: [],
    file: "dataset/test/human/te-human-en.txt" },
  { id: "te-ai-generic", label: "ai", language: "id",
    category: "ai/generic", split: "test", edge: [],
    file: "dataset/test/ai/te-ai-generic.txt" },
  { id: "te-ai-academic", label: "ai", language: "id",
    category: "ai/academic", split: "test", edge: ["academic-ai"],
    file: "dataset/test/ai/te-ai-academic.txt" },
  { id: "te-ai-formal", label: "ai", language: "id",
    category: "ai/formal", split: "test", edge: [],
    file: "dataset/test/ai/te-ai-formal.txt" },
  { id: "te-ai-en", label: "ai", language: "en",
    category: "ai/generic", split: "test", edge: [],
    file: "dataset/test/ai/te-ai-en.txt" },
  { id: "te-mixed-ai-edited", label: "mixed", language: "id",
    category: "mixed/ai-edited-human", split: "test", edge: ["mixed","ai-edited-human"],
    file: "dataset/test/ai_edited_human/te-mixed-ai-edited.txt" },
  { id: "te-mixed-human-edited", label: "mixed", language: "id",
    category: "mixed/human-edited-ai", split: "test", edge: ["mixed"],
    file: "dataset/test/human_edited_ai/te-mixed-human-edited.txt" },
  { id: "te-mixed-paraphrase", label: "mixed", language: "id",
    category: "mixed/paraphrased", split: "test", edge: ["mixed"],
    file: "dataset/test/paraphrased/te-mixed-paraphrase.txt" },
  { id: "te-short-human", label: "human", language: "id",
    category: "human/personal", split: "test", edge: ["short"],
    file: "dataset/test/human/te-short-human.txt" },
];

const DATASET = REGISTRY.map((e) => ({
  id: e.id, label: e.label, language: e.language,
  category: e.category, split: e.split, edge: e.edge,
  text: fs.readFileSync(path.join(REPO_ROOT, e.file), "utf8"),
}));

module.exports = { DATASET, REGISTRY };
