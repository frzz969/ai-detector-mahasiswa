'use strict';
// ============================================================
// api/material.js — Pencari materi akademik (Vercel, CommonJS)
// Arsitektur (user): query → fan-out paralel (Wikipedia, Wikidata,
//   OpenAlex, Crossref, Semantic Scholar, PubMed, arXiv)
//   → RESULT FILTER → RELEVANCE RANKING → SOURCE VALIDATION → hasil.
// Tier: Jurnal/paper (OpenAlex, Semantic Scholar, Crossref, PubMed,
//   arXiv) > Wikipedia/Wikidata > Umum.
// Aturan yang dipakai:
// - detector-rules §1: jangan mengarang hasil (tanpa data karangan;
//   sumber gagal → warnings jujur, bukan item karangan).
// - validation-rules §2: no silent failure (sumber gagal → warnings,
//   bukan gagal total); §5: bahasa indikasi, tanpa klaim absolut.
// - Pola validasi {v,hash,canonicalText} + send + fetchWithTimeout
//   mengikuti api/summarize.js.
// ============================================================

const crypto = require('crypto');
const { SUPPORTED_V, MAX_CHARS } = require('./config');

const TOTAL_BUDGET_MS = 10000;
const UA = 'FarazDetectorAI/1.0 (pencari materi akademik; kontak: faraz-detector@example.com)';
const MAILTO = 'faraz-detector@example.com';
const MAX_RESULTS = 10;

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

async function fetchWithTimeout(url, options, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try { return await fetch(url, { ...options, signal: ctrl.signal }); }
  catch (e) {
    if (e && e.name === 'AbortError') { const err = new Error('Timeout sumber materi'); err.code = 'TIMEOUT'; throw err; }
    throw e;
  } finally { clearTimeout(t); }
}

// Stopword ID/EN sederhana (inline, ~60 kata).
const STOPWORDS = new Set(String(
  'yang dan atau dengan untuk dari pada pada adalah ini itu sebagai dalam juga tidak akan telah oleh karena ' +
  'dapat telah antara terhadap serta bagi secara telah yaitu yakni namun tetapi sehingga agar supaya ' +
  'the and or with for from that this these those are was were been has have had will would can could ' +
  'which such their there here from into about over under between through during within study research ' +
  'paper using used based'
).split(/\s+/).filter(Boolean));

function buildQuery(canonicalText) {
  const tokens = String(canonicalText || '').toLowerCase().match(/[a-z\xe0-\xff]{4,}/g) || [];
  const freq = new Map();
  tokens.forEach((tok) => {
    if (STOPWORDS.has(tok)) return;
    freq.set(tok, (freq.get(tok) || 0) + 1);
  });
  const terms = [...freq.entries()]
    .sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : 1))
    .slice(0, 8)
    .map((e) => e[0]);
  return { q: terms.join(' '), terms };
}

function cleanStr(s, max) {
  const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  return max ? t.slice(0, max) : t;
}

function numOrNull(x) {
  const n = typeof x === 'number' ? x : Number(x);
  return Number.isFinite(n) ? n : null;
}

// ---- Fan-out per sumber (fail-soft: lempar Error → ditampung jadi warnings) ----

async function srcOpenAlex(q) {
  const url = 'https://api.openalex.org/works?search=' + encodeURIComponent(q) +
    '&per-page=10&select=id,title,doi,publication_year,cited_by_count&mailto=' + encodeURIComponent(MAILTO);
  const r = await fetchWithTimeout(url, { headers: { 'User-Agent': UA } }, 8000);
  if (!r.ok) throw new Error('OpenAlex HTTP ' + r.status);
  const j = await r.json();
  const items = Array.isArray(j.results) ? j.results : [];
  return items.map((w) => ({
    title: cleanStr(w.title, 300),
    authors: [],
    year: numOrNull(w.publication_year),
    venue: 'OpenAlex',
    doi: cleanStr(w.doi, 200),
    url: cleanStr(w.doi || w.id, 300),
    citations: numOrNull(w.cited_by_count),
    tier: 'Jurnal/paper',
    source: 'OpenAlex',
  }));
}

async function srcCrossref(q) {
  const url = 'https://api.crossref.org/works?query.bibliographic=' + encodeURIComponent(q) +
    '&rows=5&select=DOI,title,publisher,published,is-referenced-by-count&mailto=' + encodeURIComponent(MAILTO);
  const r = await fetchWithTimeout(url, { headers: { 'User-Agent': UA } }, 8000);
  if (!r.ok) throw new Error('Crossref HTTP ' + r.status);
  const j = await r.json();
  const items = (j.message && Array.isArray(j.message.items)) ? j.message.items : [];
  return items.map((w) => {
    const title = cleanStr(Array.isArray(w.title) ? w.title[0] : w.title, 300);
    let year = null;
    try {
      const p = w.published || w['published-print'] || w['published-online'];
      const dp = p && Array.isArray(p['date-parts']) ? p['date-parts'][0] : null;
      if (dp && dp[0]) year = numOrNull(dp[0]);
    } catch (_) { year = null; }
    const doi = cleanStr(w.DOI, 200);
    return {
      title, authors: [], year,
      venue: cleanStr(w.publisher, 200),
      doi, url: doi ? 'https://doi.org/' + doi : '',
      citations: numOrNull(w['is-referenced-by-count']),
      tier: 'Jurnal/paper', source: 'Crossref',
    };
  });
}

async function srcSemanticScholar(q) {
  const url = 'https://api.semanticscholar.org/graph/v1/paper/search?query=' + encodeURIComponent(q) +
    '&limit=10&fields=title,year,citationCount,venue,externalIds,url,authors';
  const r = await fetchWithTimeout(url, { headers: { 'User-Agent': UA } }, 5000);
  if (!r.ok) throw new Error('Semantic Scholar HTTP ' + r.status);
  const j = await r.json();
  const items = Array.isArray(j.data) ? j.data : [];
  return items.map((p) => {
    const ext = p.externalIds || {};
    const doi = cleanStr(ext.DOI, 200);
    return {
      title: cleanStr(p.title, 300),
      authors: Array.isArray(p.authors) ? p.authors.map((a) => cleanStr(a.name, 120)).filter(Boolean).slice(0, 5) : [],
      year: numOrNull(p.year),
      venue: cleanStr(p.venue, 200),
      doi, url: cleanStr(p.url || (doi ? 'https://doi.org/' + doi : ''), 300),
      citations: numOrNull(p.citationCount),
      tier: 'Jurnal/paper', source: 'Semantic Scholar',
    };
  });
}

async function srcPubMed(q) {
  const es = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=' +
    encodeURIComponent(q) + '&retmax=10&retmode=json';
  const r1 = await fetchWithTimeout(es, { headers: { 'User-Agent': UA } }, 4000);
  if (!r1.ok) throw new Error('PubMed esearch HTTP ' + r1.status);
  const j1 = await r1.json();
  const ids = (j1.esearchresult && Array.isArray(j1.esearchresult.idlist)) ? j1.esearchresult.idlist : [];
  if (!ids.length) return [];
  const su = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=' +
    encodeURIComponent(ids.join(',')) + '&retmode=json';
  const r2 = await fetchWithTimeout(su, { headers: { 'User-Agent': UA } }, 4000);
  if (!r2.ok) throw new Error('PubMed esummary HTTP ' + r2.status);
  const j2 = await r2.json();
  const res = (j2.result && typeof j2.result === 'object') ? j2.result : {};
  return ids.map((id) => {
    const d = res[String(id)] || {};
    return {
      title: cleanStr(d.title, 300),
      authors: Array.isArray(d.authors) ? d.authors.map((a) => cleanStr(a.name, 120)).filter(Boolean).slice(0, 5) : [],
      year: numOrNull(String(d.pubdate || '').slice(0, 4)),
      venue: cleanStr(d.source, 200),
      doi: cleanStr((Array.isArray(d.elocationid) ? '' : '') || '', 200),
      url: 'https://pubmed.ncbi.nlm.nih.gov/' + encodeURIComponent(String(id)) + '/',
      citations: null,
      tier: 'Jurnal/paper', source: 'PubMed',
    };
  });
}

function unescXml(s) {
  return String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

async function srcArxiv(q) {
  const url = 'http://export.arxiv.org/api/query?search_query=all:' + encodeURIComponent(q) +
    '&start=0&max_results=5&sortBy=relevance&sortOrder=descending';
  const r = await fetchWithTimeout(url, { headers: { 'User-Agent': UA } }, 8000);
  if (!r.ok) throw new Error('arXiv HTTP ' + r.status);
  const xml = await r.text();
  const entries = String(xml).split(/<entry>/).slice(1);
  return entries.map((en) => {
    const pick = (re) => { const m = en.match(re); return m ? unescXml(cleanStr(m[1], 300)) : ''; };
    const id = pick(/<id>\s*([\s\S]*?)\s*<\/id>/);
    const title = pick(/<title>\s*([\s\S]*?)\s*<\/title>/).replace(/\s+/g, ' ');
    const pub = pick(/<published>\s*([\s\S]*?)\s*<\/published>/);
    return {
      title, authors: [], year: numOrNull(pub.slice(0, 4)),
      venue: 'arXiv', doi: '', url: id,
      citations: null, tier: 'Jurnal/paper', source: 'arXiv',
    };
  });
}

async function srcWikipedia(q, lang) {
  const api = 'https://' + lang + '.wikipedia.org/w/api.php';
  const su = api + '?action=query&list=search&srsearch=' + encodeURIComponent(q) + '&srlimit=5&format=json&origin=*';
  const r = await fetchWithTimeout(su, { headers: { 'User-Agent': UA } }, 5000);
  if (!r.ok) throw new Error('Wikipedia(' + lang + ') HTTP ' + r.status);
  const j = await r.json();
  const hits = (j.query && Array.isArray(j.query.search)) ? j.query.search : [];
  return hits.map((h) => ({
    title: cleanStr(h.title, 300),
    authors: [], year: null,
    venue: 'Wikipedia (' + lang + ')',
    doi: '', url: 'https://' + lang + '.wikipedia.org/wiki/' + encodeURIComponent(String(h.title).replace(/ /g, '_')),
    pageid: h.pageid,
    citations: null, tier: 'Wikipedia/Wikidata', source: 'Wikipedia-' + lang,
  }));
}

async function srcWikidata(q) {
  const url = 'https://www.wikidata.org/w/api.php?action=wbsearchentities&search=' + encodeURIComponent(q) +
    '&language=id|en&limit=5&format=json&origin=*';
  const r = await fetchWithTimeout(url, { headers: { 'User-Agent': UA } }, 5000);
  if (!r.ok) throw new Error('Wikidata HTTP ' + r.status);
  const j = await r.json();
  const hits = Array.isArray(j.search) ? j.search : [];
  return hits.map((h) => ({
    title: cleanStr(h.label || h.title, 300),
    authors: [], year: null,
    venue: cleanStr(h.description, 200),
    doi: '', url: h.id ? 'https://www.wikidata.org/wiki/' + encodeURIComponent(h.id) : '',
    pageid: h.id,
    citations: null, tier: 'Wikipedia/Wikidata', source: 'Wikidata',
  }));
}

// RESULT FILTER + SOURCE VALIDATION: wajib title + (doi|url|pageid).
function passesFilter(m) {
  if (!m || typeof m.title !== 'string' || !m.title.trim()) return false;
  const id = (m.doi && String(m.doi).trim()) || (m.url && String(m.url).trim()) || (m.pageid != null ? String(m.pageid) : '');
  return !!String(id).trim();
}

// RELEVANCE RANKING: tier dulu, lalu citations desc, lalu year desc.
const TIER_ORDER = { 'Jurnal/paper': 0, 'Wikipedia/Wikidata': 1, Umum: 2 };
function rankMaterials(items) {
  return items.slice().sort((a, b) => {
    const ta = TIER_ORDER[a.tier] != null ? TIER_ORDER[a.tier] : 2;
    const tb = TIER_ORDER[b.tier] != null ? TIER_ORDER[b.tier] : 2;
    if (ta !== tb) return ta - tb;
    const ca = typeof a.citations === 'number' ? a.citations : -1;
    const cb = typeof b.citations === 'number' ? b.citations : -1;
    if (cb !== ca) return cb - ca;
    const ya = typeof a.year === 'number' ? a.year : -1;
    const yb = typeof b.year === 'number' ? b.year : -1;
    return yb - ya;
  });
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

  const { q } = buildQuery(canonicalText);
  const base = { modelId: 'material-fanout', coverage: 1, hash: actual.toLowerCase(), v };
  if (!q) {
    return send(res, 200, {
      ...base,
      materials: [], query: '',
      warnings: ['Kueri kosong setelah penyaringan kata umum — tempel teks dengan kata kunci topik agar materi dapat dicari.'],
      method: 'pencari materi: kueri tidak dapat dibentuk dari teks ini (terindikasi terlalu umum/pendek).',
    });
  }

  const jobs = [
    ['OpenAlex', () => srcOpenAlex(q)],
    ['Crossref', () => srcCrossref(q)],
    ['Semantic Scholar', () => srcSemanticScholar(q)],
    ['PubMed', () => srcPubMed(q)],
    ['arXiv', () => srcArxiv(q)],
    ['Wikipedia-id', () => srcWikipedia(q, 'id')],
    ['Wikipedia-en', () => srcWikipedia(q, 'en')],
    ['Wikidata', () => srcWikidata(q)],
  ];
  const settled = await Promise.race([
    Promise.allSettled(jobs.map((j) => j[1]())),
    new Promise((resolve) => setTimeout(() => resolve(null), TOTAL_BUDGET_MS)),
  ]);
  const warnings = [];
  let merged = [];
  if (settled === null) {
    warnings.push('Batas waktu pencarian terlampaui — hasil yang terkumpul ditampilkan, sebagian sumber terindikasi belum merespons.');
  } else {
    settled.forEach((s, i) => {
      const name = jobs[i][0];
      if (s && s.status === 'fulfilled' && Array.isArray(s.value)) merged = merged.concat(s.value);
      else {
        const why = (s && s.reason && s.reason.message) ? String(s.reason.message).slice(0, 120) : 'tidak merespons';
        warnings.push('Sumber ' + name + ' tidak tersedia (' + why + ') — hasil dari sumber lain tetap ditampilkan.');
      }
    });
  }

  const filtered = merged.filter(passesFilter);
  const ranked = rankMaterials(filtered).slice(0, MAX_RESULTS);
  const materials = ranked.map((m) => ({
    title: m.title, authors: Array.isArray(m.authors) ? m.authors : [],
    year: typeof m.year === 'number' ? m.year : null,
    venue: m.venue || '', doi: m.doi || '', url: m.url || '',
    citations: typeof m.citations === 'number' ? m.citations : null,
    tier: m.tier || 'Umum', source: m.source || 'Umum',
  }));
  if (!materials.length && !warnings.length) {
    warnings.push('Tidak ada materi yang cocok untuk kueri ini — coba tambah kata kunci topik.');
  }

  return send(res, 200, {
    ...base,
    materials, query: q, warnings,
    method: 'pencari materi: fan-out paralel (' + jobs.map((j) => j[0]).join(', ') +
      ') lalu filter, perangkingan relevansi, dan validasi sumber — hasil terindikasi relevan, perlu ditinjau.',
  });
};
