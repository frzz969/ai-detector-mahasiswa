'use strict';
// ============================================================
// api/config.js — Konstanta gateway Vercel (skeleton, TANPA deploy)
// Referensi: docs/PRD.md F-13 (model lokal, ensemble, fallback),
//   js/core.js (MAX_CHUNKS=6, MAX_CHARS=30000),
//   js/detector.js localScore() (chunking kalimat, ~900 char/chunk).
// Aturan: TIDAK ada secret di file ini — key hanya dari process.env.
// ============================================================

const SUPPORTED_V = [1];

const MAX_CHUNKS = 6; // cermin js/core.js + potongan localScore()
const CHUNK_CHAR_LIMIT = 900; // cermin localScore(): (cur + s).length > 900
const MAX_CHARS = 30000; // cermin js/core.js MAX_CHARS

const REQUEST_TIMEOUT_MS = 25000; // batas total handler (di bawah limit Vercel)
const PROVIDER_TIMEOUT_MS = 12000; // batas per panggilan provider
const MAX_RETRY = 1; // 1x coba ulang untuk 429/5xx/timeout saja

// Model dibaca dari env agar bisa diganti tanpa ubah kode.
// Default sama dengan bot WA (wa-ai-bot-w/config.js).
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
const GROQ_MODEL = process.env.GROQ_MODEL || 'qwen/qwen3.8-27b';

// Embedding untuk semantic relevance di api/material.js (semanticSimilarity
// jadi sinyal UTAMA; leksikal tetap dipakai sebagai sinyal pendukung).
// Nama model HARUS persis: "embedding-001"/"text-embedding-404" akan 404.
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'gemini-embedding-001';
// Set EMBEDDING_ENABLED=false untuk mematikan semantic (jatuh ke leksikal).
const EMBEDDING_ENABLED = String(process.env.EMBEDDING_ENABLED || 'true').toLowerCase() !== 'false';
const EMBEDDING_TIMEOUT_MS = 6000;

// Key TIDAK disimpan di sini — hanya dibaca dari env saat dipakai.
function getKeys() {
  return {
    gemini: process.env.GEMINI_API_KEY || '',
    groq: process.env.GROQ_API_KEY || '',
  };
}

module.exports = {
  SUPPORTED_V,
  MAX_CHUNKS,
  CHUNK_CHAR_LIMIT,
  MAX_CHARS,
  REQUEST_TIMEOUT_MS,
  PROVIDER_TIMEOUT_MS,
  MAX_RETRY,
  GEMINI_MODEL,
  GROQ_MODEL,
  EMBEDDING_MODEL,
  EMBEDDING_ENABLED,
  EMBEDDING_TIMEOUT_MS,
  getKeys,
};
