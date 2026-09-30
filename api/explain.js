'use strict';
// ============================================================
// api/explain.js — Thin proxy penjelasan indikasi (Vercel, CommonJS)
// Warisi AI Core Rules:
// - NO HALLUCINATION: dilarang mengarang fakta/statistik/nama/DOI/URL/kutipan.
// - PRESERVE: angka, sitasi, makna, ketidakpastian, kausalitas.
// - RELEVANCE GATE: input tak relevan/kosong -> warnings, bukan karangan.
// - Bahasa: HANYA indikasi ("terindikasi / perlu ditinjau /
//   cenderung natural" + confidence rendah/sedang/tinggi), bukan vonis.
// - Output terstruktur: {result,sourceFacts,contextualFacts,inferences,
//   protectedElements,warnings,confidence} + echo {modelId,coverage,hash,v}.
// Primer Gemini -> fallback Groq. Secret hanya dari process.env.
// ============================================================

const crypto = require('crypto');
const {
  SUPPORTED_V, MAX_CHUNKS, CHUNK_CHAR_LIMIT, MAX_CHARS,
  PROVIDER_TIMEOUT_MS, MAX_RETRY, GEMINI_MODEL, GROQ_MODEL, getKeys,
} = require('./config');

const TASK_INSTRUCTION = [
  'Tugas: jelaskan MENGAPA sebuah kutipan naskah akademik terindikasi / perlu ditinjau / cenderung natural.',
  'Fokus pada pola bahasa yang teramati (bukan vonis kepengarangan).',
  'Gunakan bahasa indikasi + confidence rendah/sedang/tinggi; dilarang klaim absolut.',
].join('\n');

const CORE_RULES = [
  'AI CORE RULES (wajib):',
  '1. NO HALLUCINATION: dilarang menambah/mengarang fakta, statistik, nama, DOI, URL, atau kutipan baru.',
  '2. PRESERVE: angka, sitasi, istilah, makna, tingkat ketidakpastian (hedge), dan arah kausalitas WAJIB sama.',
  '3. RELEVANCE GATE: bila input kosong/tak relevan untuk dijelaskan, kembalikan result="" dan jelaskan di warnings; JANGAN mengarang.',
  '4. Balas HANYA JSON valid tanpa markdown dengan skema:',
  '{"result": string, "sourceFacts": string[], "contextualFacts": string[], "inferences": string[], "protectedElements": string[], "warnings": string[], "confidence": "<rendah|sedang|tinggi>"}',
].join('\n');

function send(res, status, obj) {
  if (res && typeof res.status === 'function' && typeof res.json === 'function') return res.status(status).json(obj);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  const b = req.body;
  if (b && typeof b === 'object') return b;
  if (typeof b === 'string') { try { return JSON.parse(b); } catch (_) { return null; } }
  return null;
}

function sha256Hex(s) { return crypto.createHash('sha256').update(String(s), 'utf8').digest('hex'); }

function splitSentences(t) {
  const norm = String(t).replace(/\s+/g, ' ').trim();
  if (!norm) return [];
  return (norm.match(/[^.!?]+[.!?]+["”']?|\S.+$/g) || [norm]).map((s) => s.trim()).filter(Boolean);
}

function chunkForProvider(canonicalText) {
  const total = String(canonicalText);
  const chunks = [];
  let cur = '';
  splitSentences(total).forEach((s) => {
    if ((cur + ' ' + s).length > CHUNK_CHAR_LIMIT) { if (cur) chunks.push(cur); cur = s; }
    else cur = (cur + ' ' + s).trim();
  });
  if (cur) chunks.push(cur);
  const use = chunks.slice(0, MAX_CHUNKS);
  const usedText = use.join('\n');
  const coverage = total.length ? Math.max(0, Math.min(1, usedText.length / total.length)) : 0;
  return { usedText, coverage: Math.round(coverage * 100) / 100 };
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try { return await fetch(url, { ...options, signal: ctrl.signal }); }
  catch (e) {
    if (e && e.name === 'AbortError') { const err = new Error('Provider timeout'); err.code = 'TIMEOUT'; throw err; }
    throw e;
  } finally { clearTimeout(t); }
}

function validateStructured(o) {
  if (!o || typeof o !== 'object' || typeof o.result !== 'string' || !Array.isArray(o.sourceFacts) ||
    !Array.isArray(o.contextualFacts) || !Array.isArray(o.inferences) ||
    !Array.isArray(o.protectedElements) || !Array.isArray(o.warnings)) {
    throw Object.assign(new Error('Skema provider tidak valid'), { code: 'PROVIDER_ERROR', status: 502 });
  }
  if (!['rendah', 'sedang', 'tinggi'].includes(o.confidence)) o.confidence = 'rendah';
  return o;
}

function parseStructured(text) {
  const m = String(text || '').match(/\{[\s\S]*\}/);
  if (!m) throw Object.assign(new Error('Respons provider bukan JSON'), { code: 'PROVIDER_ERROR', status: 502 });
  try { return validateStructured(JSON.parse(m[0])); }
  catch (e) { if (e && e.code) throw e; throw Object.assign(new Error('Respons provider tidak dapat diparse'), { code: 'PROVIDER_ERROR', status: 502 }); }
}

function classifyHttpError(status, text) {
  if (status === 401 || status === 403) return { status: 401, code: 'UNAUTHORIZED', error: 'Kunci provider tidak valid / tanpa izin.' };
  if (status === 429) return { status: 429, code: 'RATE_LIMITED', error: 'Provider membatasi laju (429). Coba lagi nanti.' };
  if (status >= 500) return { status: 502, code: 'PROVIDER_ERROR', error: 'Provider gagal (' + status + ').' };
  return { status: 502, code: 'PROVIDER_ERROR', error: 'Provider menolak permintaan (' + status + '). ' + String(text || '').slice(0, 200) };
}

async function callGemini(apiKey, model, prompt) {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(apiKey);
  let lastErr = null;
  for (let a = 0; a <= MAX_RETRY; a++) {
    try {
      const r = await fetchWithTimeout(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) }, PROVIDER_TIMEOUT_MS);
      if (!r.ok) {
        const t = await r.text().catch(() => '');
        const m = classifyHttpError(r.status, t);
        if ((r.status === 429 || r.status >= 500) && a < MAX_RETRY) { lastErr = m; continue; }
        const err = new Error(m.error); err.code = m.code; err.status = m.status; throw err;
      }
      const j = await r.json();
      const text = ((j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || []).map((p) => p.text || '').join('\n');
      return parseStructured(text);
    } catch (e) { if (e && e.code === 'TIMEOUT' && a < MAX_RETRY) { lastErr = e; continue; } throw e; }
  }
  throw lastErr || Object.assign(new Error('Gemini gagal'), { code: 'PROVIDER_ERROR', status: 502 });
}

async function callGroq(apiKey, model, prompt) {
  const url = 'https://api.groq.com/openai/v1/chat/completions';
  let lastErr = null;
  for (let a = 0; a <= MAX_RETRY; a++) {
    try {
      const r = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
        body: JSON.stringify({ model, messages: [{ role: 'system', content: 'Balas HANYA JSON valid sesuai skema.' }, { role: 'user', content: prompt }], temperature: 0, response_format: { type: 'json_object' } }),
      }, PROVIDER_TIMEOUT_MS);
      if (!r.ok) {
        const t = await r.text().catch(() => '');
        const m = classifyHttpError(r.status, t);
        if ((r.status === 429 || r.status >= 500) && a < MAX_RETRY) { lastErr = m; continue; }
        const err = new Error(m.error); err.code = m.code; err.status = m.status; throw err;
      }
      const j = await r.json();
      const text = j.choices && j.choices[0] && j.choices[0].message ? j.choices[0].message.content : '';
      return parseStructured(text);
    } catch (e) { if (e && e.code === 'TIMEOUT' && a < MAX_RETRY) { lastErr = e; continue; } throw e; }
  }
  throw lastErr || Object.assign(new Error('Groq gagal'), { code: 'PROVIDER_ERROR', status: 502 });
}

function mapFailure(primaryErr, fallbackErr) {
  const e = fallbackErr || primaryErr;
  if (e && e.code === 'TIMEOUT') return { status: 504, body: { error: 'Provider timeout. Coba lagi.', code: 'TIMEOUT' } };
  if (e && e.code === 'RATE_LIMITED') return { status: 429, body: { error: 'Provider membatasi laju (429). Coba lagi nanti.', code: 'RATE_LIMITED' } };
  if (e && e.code === 'UNAUTHORIZED') return { status: 401, body: { error: 'Kunci provider tidak valid / tanpa izin.', code: 'UNAUTHORIZED' } };
  if (e && e.status && e.code) return { status: e.status, body: { error: e.message || 'Provider gagal.', code: e.code } };
  return { status: 502, body: { error: 'Semua provider gagal. Coba lagi.', code: 'PROVIDER_ERROR' } };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Gunakan POST.', code: 'METHOD_NOT_ALLOWED' });
  const body = readBody(req);
  if (!body || typeof body.v === 'undefined' || typeof body.hash !== 'string' || typeof body.canonicalText !== 'string') {
    return send(res, 400, { error: 'Body harus JSON {v, hash, canonicalText}.', code: 'MALFORMED' });
  }
  const { v, hash, canonicalText } = body;
  if (!SUPPORTED_V.includes(v)) return send(res, 400, { error: 'Versi tidak didukung.', code: 'UNSUPPORTED_VERSION' });
  if (!canonicalText.trim() || canonicalText.length > MAX_CHARS) {
    return send(res, 400, { error: 'canonicalText kosong atau melebihi ' + MAX_CHARS + ' karakter.', code: 'MALFORMED' });
  }
  if (!/^[a-f0-9]{64}$/i.test(hash)) return send(res, 400, { error: 'hash harus SHA-256 hex dari canonicalText.', code: 'MALFORMED' });
  const actual = sha256Hex(canonicalText);
  if (actual.toLowerCase() !== hash.toLowerCase()) return send(res, 400, { error: 'hash tidak cocok dengan canonicalText.', code: 'HASH_MISMATCH' });

  const { usedText, coverage } = chunkForProvider(canonicalText);
  const excerpt = (usedText || canonicalText).slice(0, 6000);
  const prompt = TASK_INSTRUCTION + '\n' + CORE_RULES + '\nTeks:\n"""\n' + excerpt + '\n"""';
  const keys = getKeys();

  let primaryErr = null;
  if (keys.gemini) {
    try {
      const out = await callGemini(keys.gemini, GEMINI_MODEL, prompt);
      return send(res, 200, { ...out, modelId: 'gemini:' + GEMINI_MODEL, coverage, hash: actual.toLowerCase(), v });
    } catch (e) { primaryErr = e; }
  } else { primaryErr = Object.assign(new Error('GEMINI_API_KEY belum diset'), { code: 'PROVIDER_MISCONFIGURED', status: 500 }); }

  if (keys.groq) {
    try {
      const out = await callGroq(keys.groq, GROQ_MODEL, prompt);
      return send(res, 200, { ...out, modelId: 'groq:' + GROQ_MODEL, coverage, hash: actual.toLowerCase(), v });
    } catch (e) {
      if (primaryErr && primaryErr.code === 'PROVIDER_MISCONFIGURED' && !(e && e.status)) {
        return send(res, 500, { error: 'Provider belum dikonfigurasi (set GEMINI_API_KEY / GROQ_API_KEY).', code: 'PROVIDER_MISCONFIGURED' });
      }
      const m = mapFailure(primaryErr, e);
      return send(res, m.status, m.body);
    }
  }
  if (primaryErr && primaryErr.code === 'PROVIDER_MISCONFIGURED') {
    return send(res, 500, { error: 'Provider belum dikonfigurasi (set GEMINI_API_KEY / GROQ_API_KEY).', code: 'PROVIDER_MISCONFIGURED' });
  }
  const m = mapFailure(primaryErr, null);
  return send(res, m.status, m.body);
};
