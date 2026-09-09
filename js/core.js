// ============================================================
// core.js — Fondasi: DOM refs, state, konstanta, util kecil
// File 1 dari 4. Muat PERTAMA (defer = berurutan).
// Cek error: ID tidak ketemu / konstanta salah → buka file ini.
// ============================================================

// ---- DOM refs (semua ID ada di index.html) ----
const $ = (id) => document.getElementById(id);

const inputText = $("inputText");
const statusEl  = $("status");
const wcEl      = $("wordCount");
const refInfo   = $("refInfo");
const fileInput = $("fileInput");
const fileChip  = $("fileChip");
const fileName  = $("fileName");
const fileMeta  = $("fileMeta");

// ---- State bersama (dipakai detector + main) ----
let localPipe = null;
let localLoading = false;
let lastResult = null;
let checking = false;
let pipeLoader = null;
let resultStale = false;
let localParts = null;
// resultStale=true artinya teks berubah sesudah hasil keluar —
// hasil di layar untuk teks LAMA dan dilarang di-export.
// localParts mencatat {n, of} potongan model (lapor jujur bila parsial).

// ---- Konstanta: frasa khas AI ----
const AI_ID = [
  "sebagai model bahasa", "penting untuk dicatat", "secara keseluruhan",
  "dalam konteks", "selain itu", "dengan demikian", "pada dasarnya",
  "perlu diingat", "kesimpulannya", "penelitian ini bertujuan",
  "artikel ini membahas", "dalam era digital", "memainkan peran penting",
  "tidak dapat dipungkiri",
];

const AI_EN = [
  "as an ai language model", "it is important to note", "overall,",
  "in conclusion", "in today's fast-paced", "delve into", "furthermore,",
  "moreover,", "plays a crucial role", "it is worth noting",
  "this article explores",
];

const AI_PHRASES = [...AI_ID, ...AI_EN];

const REF_HEADS = [
  "daftar pustaka", "references", "bibliography",
  "referensi", "daftar referensi",
];

// ---- Batas global (ubah di sini saja kalau perlu) ----
const MIN_WORDS     = 20;    // minimal kata untuk dicek
const MAX_CHARS     = 30000; // potong teks upload sepanjang ini
const MAX_PDF_PAGES = 30;    // halaman PDF yang dibaca
const MAX_CHUNKS    = 6;     // potongan teks ke model lokal
const MAX_FILE_MB   = 8;     // ukuran file maksimal

// ---- Util kecil ----
const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));

const countWords = (t) =>
  (t.trim().match(/[\p{L}\p{N}']+/gu) || []).length;

const formatBytes = (n) =>
  n > 1048576
    ? (n / 1048576).toFixed(1) + " MB"
    : Math.max(1, Math.round(n / 1024)) + " KB";
