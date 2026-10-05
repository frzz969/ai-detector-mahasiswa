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
// Batas tampilan hanya pagar keamanan, BUKAN target jumlah: hasil boleh kosong
// (detector-rules —1 jangan karang; validation-rules —2 no silent failure).
const MAX_RESULTS = 10;

// ---- RELEVANCE GATE (regression case EXPLAINER) ----
// Root cause lama: keyword overlap dianggap bukti relevansi → judul yang hanya
// menyebut entitas (mis. "kelinci" pada judul skripsi sistem informasi) atau
// topik lain yang kebetulan sama ikut masuk sebagai "materi terkait".
// Aturan: relevance = semantic*0.45 + topic*0.25 + context*0.20 + entity*0.10
// (bobot dari requirement; jumlah = 1.0 → kualitas sumber jadi pengali, bukan
// bobot tambahan). Ambang 0.70; di bawah ambang TIDAK ditampilkan.
const MIN_SOURCE_RELEVANCE = 0.70;
const W_SEM = 0.45, W_TOPIC = 0.25, W_CTX = 0.20, W_ENT = 0.10;
// Sinyal jenuh (saturating): AMBANG PENUH tiap bukti. Komponen = "berapa
// bukti yang terkumpul", bukan rata-rata panjang - supaya judul yang benar-benar
//
// kata kunci (mis. "…Kelinci" pada judul sistem informasi) tetap rendah.
// ada di teks" JANGAN dipakai sebagai komponen relevance. Untuk teks
// akademik Indonesia, judul paper teknis sah memakai istilah yang tidak ada
// di teks (contoh nyata: "PENGARUH PEMBERIAN JENIS HIJAUAN TERHADAP
// PERFORMANS TERNAK KELINCI" presisi hanya 0,20, sedangkan judul keyword-only
// "Perancangan Sistem Informasi Penjualan Hewan Peliharaan Kelinci" presisi
// 0,50). Memakai presisi = membalik urutan relevansi. Presisi tetap
// DILAPORKAN untuk audit, bukan untuk_gate.
const RECALL_FULL = 0.35;  // 35% bobot topik tertutup = on-topik penuh.
                            // KALIBRASI (diukur, bukan tebakan): 0,45 membuat teks
                            // pendek5 kalimat kehilangan2 sumber on-topic;0,35
                            // memulihkan keduanya tanpa menambah kebocoran
                            // keyword-only (0 pada 4 domain uji).
const TOPIC_BREADTH_FULL = 3; // 3 topik berbeda tertutup = breadth penuh
const MIN_TOPIC_BREADTH = 2; // gate keras: 1 topik saja (mis. hanya entitas) DITOLAK
const CTX_FULL = 0.35;     // 35% bobot konteks ko-occurrence = konteks penuh
const CTX_NEUTRAL_BELOW = 0.15; // di bawah ini konteks dianggap NETRAL (bukan sinyal negatif)
const CTX_GATE = 0.30;        // coverage konteks >= ini = bukti subtopik (jalur sah gate)
const ENT_FULL = 2;        // 2 entitas cocok = entitas penuh
const ENT_NEUTRAL = 0.6;   // profil tanpa entitas -> netral, bukan kontra
const ANCHOR_N = 2;        // topik jangkar untuk query + gate
const TOPIC_N = 6;        // topik utama untuk coverage
const CONTEXT_N = 6;      // term konteks (ko-occurrence)
const ENTITY_N = 6;

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
  'masih sudah harus bisa bahwa hanya tanpa agar supaya pula hal ini tersebut karena ' +
  'the and or with for from that this these those are was were been has have had will would can could ' +
  'which such their there here from into about over under between through during within study research ' +
  'paper using used based'
).split(/\s+/).filter(Boolean));

// Kata generik: noise akademik. Tidak pernah jadi topik - justru sumber
// keyword-overlap palsu (regression case kelinci) muncul karena noise ini
// ikut terbawa sebagai "topik".
const GENERIC_TERMS = new Set(String(
  'penelitian artikel abstrak jurnal prosiding makalah skripsi tesis disertasi bidang ' +
  'ilmunya ilmu pengetahuan teknologi masyarakat hasil analisis pendahuluan pembahasan ' +
  'kesimpulan saran metode metodologi pendekatan landasan kerangka kontribusi tujuan latar ' +
  'belakang tinjauan pustaka referensi publikasi menurut digunakan dilakukan ' +
  'ditunjukkan berdasarkan terdapat merupakan menjadi sehingga hal dapat ini tersebut ' +
  'tetapi namun serta dalam pada dengan dari untuk yang perlu satu banyak semua harus lain ' +
  'masa hal cara dapat mesti agar supaya bahwa hanya telah masih juga kedua ketiga keempat'
).split(/\s+/).filter(Boolean));

// Hipernim generik: TIDAK boleh dihitung sebagai bukti subtopik (breadth).
// Bukti nyata (terukur): "Perancangan Sistem Informasi Penjualan Hewan Peliharaan
// Kelinci" hanya cocok "kelinci" + "hewan"; tanpa daftar ini, "hewan" dianggap
//=subtopik kedua dan sumber keyword-only lolos.
const GENERIC_NOUNS = new Set(String(
  'hewan ternak makhluk benda tumbuhan hasil orang negara daerah kota'
).split(/\s+/).filter(Boolean));

function splitSents(t) {
  const norm = String(t == null ? '' : t).replace(/\s+/g, ' ').trim();
  if (!norm) return [];
  return (norm.match(/[^.!?]+[.!?]+["\u201d']?|\S.+$/g) || [norm])
    .map((s) => s.trim())
    .filter(Boolean);
}

// Token isi: >=4 huruf/angka, stopword + generik dibuang.
function contentToks(s) {
  const toks = String(s == null ? '' : s).toLowerCase().match(/[a-z0-9\xe0-\xff]{4,}/g) || [];
  return toks.filter((t) => !STOPWORDS.has(t) && !GENERIC_TERMS.has(t));
}

function round2(x) { return Math.round(Number(x) * 100) / 100; }

// Entitas: nama proper (kapital DI TENGAH kalimat - kapital di awal kalimat
// bukan nama proper), binomial latin, angka+satuan.
function findEntities(text) {
  const s = String(text == null ? '' : text);
  const out = [];
  const push = (raw) => {
    const v = cleanStr(raw, 80).toLowerCase();
    if (v.length >= 4 && out.indexOf(v) === -1) out.push(v);
  };
  // Nama proper + binomial latin: scan per kalimat, lewati kata pertama
// (selalu kapital awal kalimat - bukan nama proper). Tanpa ini, kalimat
// seperti "Kelinci termasuk hewan." terbaca sebagai entitas "kelinci termasuk".
const properRe = /\b([A-Z][a-z\u00e0-\u00ff]{2,}(?:\s+[A-Z][a-z\u00e0-\u00ff]{2,}){0,2})\b/g;
const latinRe = /\b([A-Z][a-z\u00e0-\u00ff]{3,}\s+[a-z\u00e0-\u00ff]{4,})\b/g;
  splitSents(s).forEach((sent) => {
    const body = sent.replace(/^\S+\s+/, '');
    let m;
    properRe.lastIndex = 0;
    while ((m = properRe.exec(body))) push(m[1]);
    latinRe.lastIndex = 0;
    while ((m = latinRe.exec(body))) push(m[1]);
  });
  // Angka + satuan/ukuran.
  const unitRe = /\b\d+(?:[.,]\d+)?\s*(%|persen|gram|kg|mg|ml|liter|ton|cm|mm|hari|bulan|tahun|minggu|hektar|orang|ekor|unit|item)\b/gi;
  let m;
  while ((m = unitRe.exec(s))) push(m[0]);
  return out.slice(0, ENTITY_N);
}

// PROFIL TEKS: topics (inti isi), context (pendukung), entities, idf.
// Dipakai untuk query generation DAN relevance scoring (bukan keyword mentah).
function buildProfile(canonicalText) {
  const text = String(canonicalText == null ? '' : canonicalText);
  const sents = splitSents(text);
  const N = Math.max(1, sents.length);
  const tf = new Map(), df = new Map();
  sents.forEach((s) => {
    const seen = new Set();
    contentToks(s).forEach((t) => {
      tf.set(t, (tf.get(t) || 0) + 1);
      if (!seen.has(t)) { seen.add(t); df.set(t, (df.get(t) || 0) + 1); }
    });
  });
  let maxRaw = 0;
  const idf = new Map();
  df.forEach((d, t) => {
    const raw = Math.log((N + 1) / (d + 0.5)) / Math.log(N + 1);
    idf.set(t, raw);
    if (raw > maxRaw) maxRaw = raw;
  });
  const idfNorm = (t) => (maxRaw > 0 ? (idf.get(t) || 0) / maxRaw : 0);
  // Topik = isi YANG DIBAHAS (freq tinggi), IDF hanya penyeimbang kecil.
  // purely-IDF salah: term langka (mis. "hari") akan mengalahkan topik utama.
  const scored = [...tf.entries()]
    .filter((e) => !/^\d+$/.test(e[0])) // angka bukan topik (dipakai sebagai entitas)
    .map((e) => [e[0], e[1], e[1] * (1 + 0.5 * idfNorm(e[0]))])
    .sort((a, b) => (b[2] - a[2]) || (a[0] < b[0] ? -1 : 1));
  // Topik inti isi. Butuh frekuensi =2 (teks cukup panjang) supaya term
  // sekali pakai tidak mendominasi (term sekali pakai = kebetulan).
  const minFreq = N >= 6 ? 2 : 1;
  let topics = scored.filter((e) => e[1] >= minFreq).slice(0, TOPIC_N);
  if (!topics.length) topics = scored.slice(0, 3);
  const topicTerms = new Set(topics.map((e) => e[0]));
  const sumW = topics.reduce((a, e) => a + e[2], 0) || 1;
  // Jangkar = topik utama yang PALING SPESIFIK. Term pendek/sCOPA (mis. "besar",
  // "hari") tidak dipakai sebagai jangkar bila ada alternatif =6 huruf.
  const specific = topics.filter((e) => e[0].length >= 6);
  const anchorPool = (specific.length >= 2 ? specific : topics).slice(0, ANCHOR_N);
  const anchors = anchorPool.map((e) => e[0]);
  // Context = term yang MUNCUL BERSAMA topik utama (ko-occurrence), bukan
  // sekadar peringkat berikutnya: hanya ini yang merepresentasikan "konteks".
  const cooc = new Map();
  sents.forEach((s) => {
    const toks = contentToks(s).filter((t) => !/^\d+$/.test(t));
    if (!toks.some((t) => anchors.indexOf(t) !== -1)) return;
    toks.forEach((t) => { if (!topicTerms.has(t)) cooc.set(t, (cooc.get(t) || 0) + 1); });
  });
  const ctxTotal = [...cooc.values()].reduce((a, b) => a + b, 0) || 1;
  const coocRanked = [...cooc.entries()]
    .sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : 1));
  // Hanya term ko-occurrence yang muncul di =2 kalimat jangkar yang dianggap
// konteks nyata. Kalau tidak ada → context = [] → komponen konteks NETRAL
  // (tidak mengarang bukti, tapi juga tidak menghukum sumber yang relevan).
  const solid = coocRanked.filter((e) => e[1] >= 2);
  const contextSrc = solid.length >= 2 ? solid : [];
  const context = contextSrc.slice(0, CONTEXT_N)
    .map((e) => ({ term: e[0], weight: round2(e[1] / ctxTotal), count: e[1] }));
  return {
    topics: topics.map((e) => ({ term: e[0], weight: round2(e[2] / sumW), freq: e[1] })),
    anchors,
    context,
    entities: findEntities(text),
    idf,
    sentCount: sents.length,
    termFreq: tf,
  };
}

// Query generation: 2-3 query dari profil (bukan dump token frekuensi).
function buildQueries(profile) {
  const p = profile || {};
  const topics = (p.topics || []).map((t) => t.term);
  const ents = (p.entities || []).slice(0, 2);
  const ctx = (p.context || []).slice(0, 2).map((c) => c.term);
  const out = [];
  const add = (arr) => {
    const q = arr.filter(Boolean).join(' ').trim();
    if (q && out.indexOf(q) === -1) out.push(q);
  };
  add(topics.slice(0, 4));                                  // topik utama
  if (ents.length) add([ents[0], topics[0], topics[1]].filter(Boolean)); // entitas + topik
  else if (ctx.length) add([topics[0], topics[1], ctx[0]].filter(Boolean)); // topik + konteks
  if (ctx.length) add([topics[0], ctx[0], ctx[1]].filter(Boolean));       // topik + konteks
  return out.slice(0, 3);
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

// RELEVANCE SCORING (pengganti rankMaterials lama yang hanya tier+citations).
// relevance = semantic*0.45 + topic*0.25 + context*0.20 + entity*0.10, lalu
// dikalikan qualityFactor (tier). Keyword/entitas TIDAK boleh naik sendiri:
// kandidat harus menutup minimal satu topik jangkar + presisi isi = floor.
const TIER_ORDER = { 'Jurnal/paper': 0, 'Wikipedia/Wikidata': 1, Umum: 2 };
const TIER_QUALITY = { 'Jurnal/paper': 1, 'Wikipedia/Wikidata': 0.92, Umum: 0.85 };

function normTitleKey(t) {
  return String(t == null ? '' : t).toLowerCase()
    .replace(/[^a-z0-9\xe0-\xff]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// Coverage berbobot: berapa banyak bobot item yang term-nya muncul di haystack.
function weightedCoverage(items, haystack) {
  let hit = 0, total = 0;
  items.forEach((it) => {
    total += it.weight;
    if (haystack.indexOf(it.term) !== -1) hit += it.weight;
  });
  return total > 0 ? hit / total : 0;
}

function sat(x, full) { return full > 0 ? Math.max(0, Math.min(1, x / full)) : 0; }

// scoreCandidate(candidate, profile) -> skor relevansi + alasan spesifik.
// relevance = semantic*0.45 + topic*0.25 + context*0.20 + entity*0.10 (x quality)
//   semantic = berapa bobot topik UTAMA teks yang tertutup kandidat (apakah sumber
//              ini membahas isi teks, bukan sekadar menyebut kata kuncinya)
//   topic    = BREADTH: berapa topik berbeda yang tertutup (bukan cuma 1)
//   context  = bobot ko-occurrence konteks yang ikut tertutup
//   entity   = entitas yang cocok (bobot kecil; entitas saja tidak sah relevansi)
function scoreCandidate(candidate, profile) {
  const p = profile || {};
  const topics = p.topics || [];
  const context = p.context || [];
  const anchors = p.anchors || topics.slice(0, ANCHOR_N).map((t) => t.term);
  const entities = p.entities || [];
  const title = cleanStr(candidate && candidate.title, 400);
  const venue = cleanStr(candidate && candidate.venue, 200);
  const hay = (' ' + title + ' ' + venue + ' ').toLowerCase();

  const candToks = Array.from(new Set(contentToks(title + ' ' + venue)));
  const matchedCand = candToks.filter((t) => !!(p.termFreq && p.termFreq.has(t)));
  const precision = candToks.length ? matchedCand.length / candToks.length : 0;
  const matchedTopics = topics.filter((t) => hay.indexOf(t.term) !== -1);
  const matchedContext = context.filter((c) => hay.indexOf(c.term) !== -1);
  const topicRecall = weightedCoverage(topics, hay);
  const ctxCoverage = weightedCoverage(context, hay);
  // Breadth: topik yang cocok DAN bukan hipernim generik (hewan/ternak/...).
  // Pengecualian: bila hipernim itu justru topik jangkar/utama dokumen, tetap
  // dihitung (user yang menulis tentang peternakan tidak boleh dirugikan).
  const breadthTopics = matchedTopics.filter((t) =>
    !GENERIC_NOUNS.has(t.term) || anchors.indexOf(t.term) !== -1);

  const semantic = sat(topicRecall, RECALL_FULL);
  const topic = sat(breadthTopics.length, TOPIC_BREADTH_FULL);
  // Konteks: coverage ko-occurrence. Bila konteks tidak terukur (tidak ada term
  // ko-occurrence) ATAU hampir tidak ada yang cocok (< CTX_NEUTRAL_BELOW),
  // komponen = NETRAL: satu term konteks yang tidak muncul BUKAN bukti sumber
  // tidak relevan. Kalau dipaksa 0, sumber on-topik lintasbahasa terbuang hanya
  // karena kosakata teknisnya berbeda (terukur: relevansi 0,62 vs 0,74).
  // CATATAN: gate memakai ctxCoverage (mentah), bukan contextScore (yang bisa netral).
  const contextScore = (context.length === 0 || ctxCoverage < CTX_NEUTRAL_BELOW)
    ? ENT_NEUTRAL
    : sat(ctxCoverage, CTX_FULL);
  const matchedEntities = entities.filter((e) => hay.indexOf(e) !== -1);
  const entityScore = entities.length === 0
    ? ENT_NEUTRAL
    : sat(matchedEntities.length, ENT_FULL);

  const tier = (candidate && candidate.tier) || 'Umum';
  const quality = TIER_QUALITY[tier] != null ? TIER_QUALITY[tier] : TIER_QUALITY.Umum;
  const raw = W_SEM * semantic + W_TOPIC * topic + W_CTX * contextScore + W_ENT * entityScore;
  const relevance = round2(Math.max(0, Math.min(1, raw * quality)));

// Alasan SPESIFIK (wajib menyebut term yang cocok; kalau tidak bisa → tolak).
  const bits = [];
  if (matchedTopics.length) bits.push('topik: ' + matchedTopics.slice(0, 3).map((t) => t.term).join(', '));
  if (matchedContext.length) bits.push('konteks: ' + matchedContext.slice(0, 2).map((c) => c.term).join(', '));
  if (matchedEntities.length) bits.push('entitas: ' + matchedEntities.slice(0, 2).join(', '));
  const reason = bits.join('; ');

  // Gerbang keras: skor numerik BUKAN satu-satunya syarat. Sumber yang hanya
  // cocok SATU kata kunci gagal di sini walau sitasinya 9999. Dua jalur sah:
  //   (a) menutup >= 2 topik non-hipernim, ATAU
//   (b) menutup konteks/subtopik dengan kuat (mis. "kebutuhan + klasifikasi")
  //       - terukur: judul "Klasifikasi dan kebutuhan nutrisi kelinci rumah"
//         hanya cocok 1 topik, tapi context 0,95 → ini tidak boleh ditolak.
  const gateAnchor = anchors.some((a) => hay.indexOf(a) !== -1);
  const gateBreadth = breadthTopics.length >= MIN_TOPIC_BREADTH;
  const gateContext = ctxCoverage >= CTX_GATE;
  const gateReason = !!reason;
  const passes = gateAnchor && (gateBreadth || gateContext) && gateReason;

  return {
    relevance, semantic: round2(semantic), topic: round2(topic),
    context: round2(contextScore), contextCoverage: round2(ctxCoverage), entity: round2(entityScore), quality,
    // Audit: presisi & recall ditampilkan di "Detail teknis", bukan dipakai gate.
    precision: round2(precision), topicRecall: round2(topicRecall),
    topicBreadth: breadthTopics.length, topicMatched: matchedTopics.length,
    reason, matchedTopics: matchedTopics.map((t) => t.term), matchedEntities,
    passes,
    gates: { anchor: gateAnchor, breadth: gateBreadth, context: gateContext, reason: gateReason },
  };
}

// selectMaterials(candidates, profile, opts) — MURNI (tanpa fetch) supaya bisa
// diuji offline dengan kandidat mock. Dedupe + ambang + gate + urutan.
function selectMaterials(candidates, profile, opts) {
  const o = opts || {};
  const threshold = typeof o.minRelevance === 'number' ? o.minRelevance : MIN_SOURCE_RELEVANCE;
  const cap = typeof o.max === 'number' && o.max > 0 ? Math.round(o.max) : MAX_RESULTS;
  const list = Array.isArray(candidates) ? candidates : [];
  const seen = { doi: new Set(), url: new Set(), title: new Set() };
  const materials = [];
  let rejectedLowRelevance = 0, rejectedNoReason = 0, rejectedDuplicate = 0, rejectedGate = 0;

  list.forEach((m) => {
    if (!passesFilter(m)) return;
    const kTitle = normTitleKey(m.title);
    const kDoi = cleanStr(m.doi, 200).toLowerCase();
    const kUrl = cleanStr(m.url, 300).toLowerCase();
    if ((kDoi && seen.doi.has(kDoi)) || (kUrl && seen.url.has(kUrl)) ||
        (kTitle && seen.title.has(kTitle))) { rejectedDuplicate++; return; }
    const sc = scoreCandidate(m, profile);
    if (!sc.passes) {
      if (!sc.gates.reason || sc.reason === '') rejectedNoReason++;
      else rejectedGate++;
      return;
    }
    if (sc.relevance < threshold) { rejectedLowRelevance++; return; }
    if (kDoi) seen.doi.add(kDoi);
    if (kUrl) seen.url.add(kUrl);
    if (kTitle) seen.title.add(kTitle);
    materials.push({
      title: m.title, authors: Array.isArray(m.authors) ? m.authors : [],
      year: typeof m.year === 'number' ? m.year : null,
      venue: m.venue || '', doi: m.doi || '', url: m.url || '',
      citations: typeof m.citations === 'number' ? m.citations : null,
      tier: m.tier || 'Umum', source: m.source || 'Umum',
      relevance: sc.relevance, relevanceReason: sc.reason,
    });
  });

  materials.sort((a, b) => {
    if (b.relevance !== a.relevance) return b.relevance - a.relevance;
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

  return {
    materials: materials.slice(0, cap),
    rejectedLowRelevance, rejectedNoReason, rejectedDuplicate, rejectedGate,
    threshold,
  };
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

  const profile = buildProfile(canonicalText);
  const queries = buildQueries(profile);
  const base = { modelId: 'material-fanout', coverage: 1, hash: actual.toLowerCase(), v };
  if (!queries.length) {
    return send(res, 200, {
      ...base,
      materials: [], query: '',
      warnings: ['Kueri kosong setelah penyaringan kata umum — tempel teks dengan kata kunci topik agar materi dapat dicari.'],
      method: 'pencari materi: profil topik tidak dapat dibentuk dari teks ini (terindikasi terlalu umum/pendek).',
    });
  }

  // Fan-out per query. Jurnal/paper untuk semua query; Ensiklopedia (Wikipedia,
// Wikidata) hanya untuk query topik utama — sumber weak relevance tidak
  // perlu dikalikan (relevance gate akan menolak yang tidak nyambung).
  const main = queries[0];
  const jobs = [
    ['OpenAlex', () => srcOpenAlex(main)],
    ['Crossref', () => srcCrossref(main)],
    ['Semantic Scholar', () => srcSemanticScholar(main)],
    ['PubMed', () => srcPubMed(main)],
    ['arXiv', () => srcArxiv(main)],
    ['Wikipedia-id', () => srcWikipedia(main, 'id')],
    ['Wikipedia-en', () => srcWikipedia(main, 'en')],
    ['Wikidata', () => srcWikidata(main)],
  ];
  queries.slice(1).forEach((q2, qi) => {
    const tag = '+q' + (qi + 2);
    jobs.push(['OpenAlex' + tag, () => srcOpenAlex(q2)]);
    jobs.push(['Crossref' + tag, () => srcCrossref(q2)]);
    jobs.push(['SemanticScholar' + tag, () => srcSemanticScholar(q2)]);
    if (qi === 0) jobs.push(['Wikipedia-id' + tag, () => srcWikipedia(q2, 'id')]);
  });
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

  // RELEVANCE GATE: saring dulu, baru urutkan. Tidak memaksa jumlah sumber.
  const sel = selectMaterials(merged, profile, {});
  const materials = sel.materials;
  const dropped = sel.rejectedLowRelevance + sel.rejectedNoReason + sel.rejectedGate;
  if (!materials.length) {
    // Empty result state JUJUR — tanpa diisi sumber keyword-match (regression
    // case kelinci: dulu 10 sumber sampah, kini 0 + penjelasan).
    warnings.push('Tidak ditemukan materi yang cukup relevan dengan teks (' +
      sel.rejectedLowRelevance + ' kandidat ditolak: relevansi di bawah ' +
      sel.threshold + '; ' + sel.rejectedGate + ' kandidat ditolak: hanya cocok kata kunci; ' +
      sel.rejectedNoReason + ' kandidat ditolak: alasan relevansi tidak spesifik) — ' +
      'sumber yang kemungkinan tidak nyambung tidak ditampilkan.');
  } else if (dropped > 0) {
    warnings.push(dropped + ' kandidat tidak ditampilkan (relevansi di bawah ' + sel.threshold +
      ' atau hanya cocok kata kunci) — materi terkait bersifat indikasi, perlu ditinjau.');
  }

  return send(res, 200, {
    ...base,
    materials, query: main, queries, warnings,
    threshold: sel.threshold,
    topics: profile.topics.map((t) => t.term),
    method: 'pencari materi: profil topik + ' + queries.length + ' kueri, fan-out paralel (' +
      jobs.map((j) => j[0]).join(', ') + '), gerbang relevansi (ambang ' + sel.threshold +
      ': semantic 0,45 + topik 0,25 + konteks 0,20 + entitas 0,10) lalu validasi sumber — ' +
      'hasil terindikasi relevan, perlu ditinjau.',
  });
};

module.exports.MIN_SOURCE_RELEVANCE = MIN_SOURCE_RELEVANCE;
module.exports.buildProfile = buildProfile;
module.exports.buildQueries = buildQueries;
module.exports.scoreCandidate = scoreCandidate;
module.exports.selectMaterials = selectMaterials;
