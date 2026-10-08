'use strict';
// api/analyze.js — Vercel Function (CommonJS, vanilla Node)
// Kontrak: POST { v, hash, canonicalText }
//   -> sukses: { score, confidence, modelId, coverage, hash, v }
//   -> gagal:  { error, code } (MALFORMED / UNSUPPORTED_VERSION /
//      HASH_MISMATCH / METHOD_NOT_ALLOWED / UNAUTHORIZED /
//      RATE_LIMITED / TIMEOUT / PROVIDER_ERROR / PROVIDER_MISCONFIGURED)
// Alur: validasi hash/v -> chunking (cermin js/detector.js localScore,
//   MAX_CHUNKS=6, ~900 char/chunk) -> Gemini primer, fallback Groq.
// Bahasa hasil: indikasi saja ("terindikasi / perlu ditinjau /
//   cenderung natural" + confidence rendah/sedang/tinggi).
// Secret: hanya process.env (GEMINI_API_KEY / GROQ_API_KEY).

const crypto = require('crypto');
const {
  SUPPORTED_V,
  MAX_CHUNKS,
  CHUNK_CHAR_LIMIT,
  MAX_CHARS,
  PROVIDER_TIMEOUT_MS,
  MAX_RETRY,
  GEMINI_MODEL,
  GROQ_MODEL,
  getKeys,
} = require('./config');

function send(res, status, obj) {
  if (res && typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(status).json(obj);
  }
  const body = JSON.stringify(obj);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(body);
}

function readBody(req) {
  const b = req.body;
  if (b && typeof b === 'object') return b;
  if (typeof b === 'string') {
    try { return JSON.parse(b); } catch (_) { return null; }
  }
  return null;
}

function sha256Hex(s) {
  return crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
}

// Cermin js/detector.js splitSentences(): pecah kalimat, buang <=3 kata.
function splitSentences(t) {
  const norm = String(t).replace(/\s+/g, ' ').trim();
  if (!norm) return [];
  const parts = norm.match(/[^.!?]+[.!?]+["”']?|\S.+$/g) || [norm];
  return parts.map((s) => s.trim()).filter((s) => s.split(/\s+/).length > 3);
}

// Cermin js/detector.js localScore(): akumulasi kalimat sampai >900 char,
// potong ke MAX_CHUNKS=6. Kembalikan { usedText, coverage }.
function chunkForProvider(canonicalText) {
  const total = String(canonicalText);
  const chunks = [];
  let cur = '';
  splitSentences(total).forEach((s) => {
    if ((cur + ' ' + s).length > CHUNK_CHAR_LIMIT) {
      if (cur) chunks.push(cur);
      cur = s;
    } else {
      cur = (cur + ' ' + s).trim();
    }
  });
  if (cur) chunks.push(cur);
  const use = chunks.slice(0, MAX_CHUNKS);
  const usedText = use.join('\n');
  const coverage = total.length
    ? Math.max(0, Math.min(1, usedText.length / total.length))
    : 0;
  return { usedText, coverage: Math.round(coverage * 100) / 100, parts: { n: use.length,
    of: chunks.length } };
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...options, signal: ctrl.signal });
    return r;
  } catch (e) {
    if (e && e.name === 'AbortError') {
      const err = new Error('Provider timeout');
      err.code = 'TIMEOUT';
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(t);
  }
}

function buildAnalyzePrompt(excerpt, coverage, parts) {
  return [
    'Tugas: beri INDIKASI gaya generatif pada kutipan naskah akademik berikut.',
    'Konteks: cakupan teks yang terbaca provider ' + coverage + ' (' + parts.n + '/' + parts.of + ' potongan, maks 6 potongan ~900 karakter, cermin localScore).',
    'Bahasa hasil HANYA: "terindikasi" / "perlu ditinjau" / "cenderung natural".',
    'Dilarang: klaim absolut, vonis kepengarangan, angka kepastian mutlak.',
    'Balas HANYA JSON valid tanpa markdown: {"score": <15-98>, "confidence": "<rendah|sedang|tinggi>"}.',
    'Kutipan:',
    '"""',
    excerpt.slice(0, 6000),
    '"""',
  ].join('\n');
}

function parseScoreConfidence(text) {
  const m = String(text || '').match(/\{[\s\S]*\}/);
  if (!m) throw Object.assign(new Error('Respons provider bukan JSON'), { code: 'PROVIDER_ERROR',
    status: 502 });
  let o;
  try { o = JSON.parse(m[0]); } catch (_) {
    throw Object.assign(new Error('Respons provider tidak dapat diparse'), { code: 'PROVIDER_ERROR',
      status: 502 });
  }
  let score = Number(o.score);
  if (!Number.isFinite(score)) throw Object.assign(new Error('Skor provider tidak valid'),
    { code: 'PROVIDER_ERROR', status: 502 });
  score = Math.max(15, Math.min(98, Math.round(score)));
  const conf = ['rendah', 'sedang', 'tinggi'].includes(o.confidence) ? o.confidence : 'rendah';
  return { score, confidence: conf };
}

function classifyHttpError(status, text) {
  if (status === 401 || status === 403) {
    return { status: 401, code: 'UNAUTHORIZED', error: 'Kunci provider tidak valid / tanpa izin.' };
  }
  if (status === 429) {
    return { status: 429, code: 'RATE_LIMITED',
      error: 'Provider membatasi laju (429). Coba lagi nanti.' };
  }
  if (status >= 500) {
    return { status: 502, code: 'PROVIDER_ERROR', error: 'Provider gagal (' + status + ').' };
  }
  return { status: 502, code: 'PROVIDER_ERROR',
    error: 'Provider menolak permintaan (' + status + '). ' + String(text || '').slice(0, 200) };
}

async function callGemini(apiKey, model, prompt) {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(apiKey);
  let lastErr = null;
  for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
    try {
      const r = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }, PROVIDER_TIMEOUT_MS);
      if (!r.ok) {
        const t = await r.text().catch(() => '');
        const mapped = classifyHttpError(r.status, t);
        if ((r.status === 429 || r.status >= 500)
          && attempt < MAX_RETRY) { lastErr = mapped; continue; }
        const err = new Error(mapped.error);
        err.code = mapped.code; err.status = mapped.status;
        throw err;
      }
      const j = await r.json();
      const text = (j.candidates && j.candidates[0] && j.candidates[0].content
        && j.candidates[0].content.parts || [])
        .map((p) => p.text || '').join('\n');
      return parseScoreConfidence(text);
    } catch (e) {
      if (e && (e.code === 'TIMEOUT') && attempt < MAX_RETRY) { lastErr = e; continue; }
      throw e;
    }
  }
  throw lastErr || Object.assign(new Error('Gemini gagal'), { code: 'PROVIDER_ERROR',
    status: 502 });
}

async function callGroq(apiKey, model, prompt) {
  const url = 'https://api.groq.com/openai/v1/chat/completions';
  let lastErr = null;
  for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
    try {
      const r = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system',
              content: 'Balas HANYA JSON valid {"score": <15-98>, "confidence": "<rendah|sedang|tinggi>"}.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0,
          response_format: { type: 'json_object' },
        }),
      }, PROVIDER_TIMEOUT_MS);
      if (!r.ok) {
        const t = await r.text().catch(() => '');
        const mapped = classifyHttpError(r.status, t);
        if ((r.status === 429 || r.status >= 500)
          && attempt < MAX_RETRY) { lastErr = mapped; continue; }
        const err = new Error(mapped.error);
        err.code = mapped.code; err.status = mapped.status;
        throw err;
      }
      const j = await r.json();
      const text = j.choices && j.choices[0]
        && j.choices[0].message ? j.choices[0].message.content : '';
      return parseScoreConfidence(text);
    } catch (e) {
      if (e && (e.code === 'TIMEOUT') && attempt < MAX_RETRY) { lastErr = e; continue; }
      throw e;
    }
  }
  throw lastErr || Object.assign(new Error('Groq gagal'), { code: 'PROVIDER_ERROR', status: 502 });
}

function errorFromProviderFailure(primaryErr, fallbackErr) {
  const e = fallbackErr || primaryErr;
  if (e && e.code === 'TIMEOUT') return { status: 504,
    body: { error: 'Provider timeout. Coba lagi.', code: 'TIMEOUT' } };
  if (e && e.code === 'RATE_LIMITED') return { status: 429,
    body: { error: 'Provider membatasi laju (429). Coba lagi nanti.', code: 'RATE_LIMITED' } };
  if (e && e.code === 'UNAUTHORIZED') return { status: 401,
    body: { error: 'Kunci provider tidak valid / tanpa izin.', code: 'UNAUTHORIZED' } };
  if (e && e.status && e.code) return { status: e.status, body: { error: e.message
    || 'Provider gagal.', code: e.code } };
  return { status: 502, body: { error: 'Semua provider gagal. Coba lagi.',
    code: 'PROVIDER_ERROR' } };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return send(res, 405, { error: 'Gunakan POST.', code: 'METHOD_NOT_ALLOWED' });
  }
  const body = readBody(req);
  if (!body || typeof body.v === 'undefined' || typeof body.hash !== 'string'
    || typeof body.canonicalText !== 'string') {
    return send(res, 400, { error: 'Body harus JSON {v, hash, canonicalText}.',
      code: 'MALFORMED' });
  }
  const { v, hash, canonicalText } = body;
  if (!SUPPORTED_V.includes(v)) {
    return send(res, 400, { error: 'Versi tidak didukung. Didukung: ' + SUPPORTED_V.join(','),
      code: 'UNSUPPORTED_VERSION' });
  }
  if (!canonicalText.trim() || canonicalText.length > MAX_CHARS) {
    return send(res, 400, { error: 'canonicalText kosong atau melebihi ' + MAX_CHARS + ' karakter.',
      code: 'MALFORMED' });
  }
  if (!/^[a-f0-9]{64}$/i.test(hash)) {
    return send(res, 400, { error: 'hash harus SHA-256 hex dari canonicalText.',
      code: 'MALFORMED' });
  }
  const actual = sha256Hex(canonicalText);
  if (actual.toLowerCase() !== hash.toLowerCase()) {
    return send(res, 400, { error: 'hash tidak cocok dengan canonicalText.',
      code: 'HASH_MISMATCH' });
  }

  const { usedText, coverage, parts } = chunkForProvider(canonicalText);
  const excerpt = usedText || canonicalText.slice(0, CHUNK_CHAR_LIMIT);
  const prompt = buildAnalyzePrompt(excerpt, coverage, parts);
  const keys = getKeys();

  let primaryErr = null;
  if (keys.gemini) {
    try {
      const out = await callGemini(keys.gemini, GEMINI_MODEL, prompt);
      return send(res, 200, { score: out.score, confidence: out.confidence,
        modelId: 'gemini:' + GEMINI_MODEL, coverage, hash: actual.toLowerCase(), v });
    } catch (e) { primaryErr = e; }
  } else {
    primaryErr = Object.assign(new Error('GEMINI_API_KEY belum diset'),
      { code: 'PROVIDER_MISCONFIGURED', status: 500 });
  }

  if (keys.groq) {
    try {
      const out = await callGroq(keys.groq, GROQ_MODEL, prompt);
      return send(res, 200, { score: out.score, confidence: out.confidence,
        modelId: 'groq:' + GROQ_MODEL, coverage, hash: actual.toLowerCase(), v });
    } catch (e) {
      const mapped = errorFromProviderFailure(primaryErr, e);
      if (mapped.body.code === 'PROVIDER_MISCONFIGURED') {
        return send(res, 500,
          { error: 'Provider belum dikonfigurasi (set GEMINI_API_KEY / GROQ_API_KEY).',
            code: 'PROVIDER_MISCONFIGURED' });
      }
      return send(res, mapped.status, mapped.body);
    }
  }

  // Tanpa fallback tersedia -> petakan error primer apa adanya.
  if (primaryErr && primaryErr.code === 'PROVIDER_MISCONFIGURED') {
    return send(res, 500,
      { error: 'Provider belum dikonfigurasi (set GEMINI_API_KEY / GROQ_API_KEY).',
        code: 'PROVIDER_MISCONFIGURED' });
  }
  const mapped = errorFromProviderFailure(primaryErr, null);
  return send(res, mapped.status, mapped.body);
};
