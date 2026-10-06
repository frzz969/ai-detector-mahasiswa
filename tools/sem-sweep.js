// tools/sem-sweep.js - Sweep OFFLINE ambang SEM_GATE / SEM_HIGH untuk skor semantic.
// Baca eval/retrieval-benchmark.jsonl (30 query x 10 kandidat), hitung skor
// semantic tiap pasangan (query <-> kandidat) via embedBatch() yang DIEKSPOR
// dari api/material.js, lalu uji kombinasi ambang dan laporkan P@3/P@10.
// Rumus cosine + definisi relevan (relevance >= 1) + P@3/P@10 macro-avg per
// query mengikuti pola api/material.js (cosine/semanticScores) dan
// tests/retrieval-eval.js. Konstanta SEM_GATE/SEM_HIGH di api/material.js
// TIDAK dibaca untuk lalu ditulis balik — nilai 0.62/0.72 di bawah hanya
// dipakai sebagai baseline pembanding di laporan.
// Aturan jujur (referensi/validation-rules.md §2 + AGENTS.md §2):
//  - embedBatch gagal (key kosong / fallback / timeout / HTTP / respons tak
//    lengkap) -> cetak "FALLBACK: <alasan>" + exit 1. DILARANG mengarang
//    skor, memakai angka tetap/random, atau diam-diam memakai skor leksikal
//    sambil melapor seolah skor semantic.
//  - Skrip ini hanya BACA repo + tulis 1 file TEMP. Tidak mengubah file repo.
// Provider embedding (pilih via --provider=jina|gemini|auto, default auto):
//  - jina: POST https://api.jina.ai/v1/embeddings (OpenAI-compatible),
//    model jina-embeddings-v3, query memakai task 'retrieval.query' dan
//    kandidat memakai task 'retrieval.passage'. Key dibaca dari
//    process.env.JINA_API_KEY, kalau kosong dibaca manual dari file .env
//    di root repo (tanpa dependency dotenv).
//  - gemini: embedBatch() yang DIEKSPOR dari api/material.js (jalur lama,
//    tidak diubah). auto = jina bila JINA_API_KEY ada, bila tidak gemini.
// Pemakaian: node tools/sem-sweep.js [outputPath] [--provider=N] [--gap-ms=N]
//  - outputPath default: C:\Users\Atmint\AppData\Local\Temp\opencode\sem-sweep.json
//  - --provider default: auto (jina|gemini|auto)
//  - --gap-ms: jeda antar batch embed (default 1200 ms, konservatif agar
//    tidak memicu 429 dari provider; api/material.js tidak punya konstanta
//    jeda sehingga default ini dipakai).
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BENCH = path.join(ROOT, 'eval', 'retrieval-benchmark.jsonl');
const DEFAULT_OUT = 'C:\\Users\\Atmint\\AppData\\Local\\Temp\\opencode\\sem-sweep.json';

// Baseline pembanding saja (cermin nilai di api/material.js). Nilai ini
// dipakai untuk menghitung satu baris pembanding di laporan, TIDAK PERNAH
// ditulis balik ke api/material.js atau konstanta mana pun.
const BASE_GATE = 0.62;
const BASE_HIGH = 0.72;

// Grid sweep: SEM_GATE 0.55..0.70 dan SEM_HIGH 0.68..0.78, step 0.01.
const GATE_MIN = 55, GATE_MAX = 70, HIGH_MIN = 68, HIGH_MAX = 78, STEP_DIV = 100;

// Jeda antar batch embed (ms). Konservatif agar tidak memicu 429.
const DEFAULT_GAP_MS = 1200;

// ---- Provider Jina (OpenAI-compatible, tanpa dependency baru) ----
const JINA_URL = 'https://api.jina.ai/v1/embeddings';
const JINA_MODEL = 'jina-embeddings-v3';
const JINA_TASK_QUERY = 'retrieval.query';
const JINA_TASK_PASSAGE = 'retrieval.passage';
const JINA_TIMEOUT_MS = 15000;
const JINA_MAX_TRY = 3; // 1 percobaan awal + 2 ulangan untuk 429 saja
const JINA_MAX_CHARS = 2000;

function parseArgs(argv) {
  let out = DEFAULT_OUT;
  let gapMs = DEFAULT_GAP_MS;
  let provider = 'auto';
  argv.forEach((a) => {
    if (a === '--help' || a === '-h') {
      console.log('Pakai: node tools/sem-sweep.js [outputPath] [--provider=jina|gemini|auto] [--gap-ms=N]');
      console.log('  outputPath default: ' + DEFAULT_OUT);
      console.log('  --provider default: auto (jina bila JINA_API_KEY ada, bila tidak gemini)');
      console.log('  --gap-ms default: ' + DEFAULT_GAP_MS + ' (jeda antar batch embed)');
      process.exit(0);
    } else if (/^--gap-ms=/.test(a)) {
      const n = Number(a.slice('--gap-ms='.length));
      if (n >= 0 && isFinite(n)) gapMs = Math.floor(n);
    } else if (/^--provider=/.test(a)) {
      const p = a.slice('--provider='.length).toLowerCase();
      if (p === 'jina' || p === 'gemini' || p === 'auto') provider = p;
      else { console.log('Argumen --provider harus jina|gemini|auto (dapat: ' + p + ')'); process.exit(2); }
    } else if (/^-/.test(a)) {
      console.log('Argumen tidak dikenal: ' + a + ' (lihat --help)');
      process.exit(2);
    } else if (out === DEFAULT_OUT) {
      out = a;
    }
  });
  return { out: out, gapMs: gapMs, provider: provider };
}

// Cosine mengikuti pola api/material.js:284 (dot / (|a|*|b|), 0 bila invalid).
function cosine(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const den = Math.sqrt(na) * Math.sqrt(nb);
  return den ? dot / den : 0;
}

// Baris template dilewati, sama seperti tests/retrieval-eval.js.
function isTemplateRow(o) {
  if (!o || typeof o !== 'object') return true;
  if (/template/i.test(String(o.note == null ? '' : o.note))) return true;
  if (/template/i.test(String(o.text == null ? '' : o.text))) return true;
  return false;
}

// Relevan = relevance >= 1, sama seperti tests/retrieval-eval.js.
function isRelevant(c) {
  return Number(c && c.relevance) >= 1;
}

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

// Baca SATU key dari file .env di root repo (format KEY=value per baris;
// baris kosong dan komentar # diabaikan; tanpa dependency dotenv). SENGAJA
// tidak memuat seluruh .env ke process.env agar key lain (mis. GEMINI)
// tidak bocor ke jalur provider lain — tiap jalur hanya memakai key-nya
// sendiri. Kembalian: string ('' bila tak ketemu).
function readDotEnvKey(name) {
  let raw;
  try {
    raw = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
  } catch (_) { return ''; } // tanpa .env = wajar, bukan error
  const lines = raw.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t || t.charAt(0) === '#') continue;
    const m = t.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m || m[1] !== name) continue;
    let v = m[2].trim();
    const q = v.charAt(0);
    if ((q === '"' || q === "'") && v.length >= 2 && v.charAt(v.length - 1) === q) v = v.slice(1, -1);
    return v;
  }
  return '';
}

// Key Jina: env shell dulu, kalau kosong baca manual dari .env root repo.
// Env shell selalu menang; .env tidak pernah ditulis skrip ini.
function getJinaKey() {
  if (process.env.JINA_API_KEY) return String(process.env.JINA_API_KEY);
  return readDotEnvKey('JINA_API_KEY');
}

// fetch berbatas waktu, pola sama seperti api/material.js (AbortController;
// TIMEOUT dikodekan agar pesan jujur). Tanpa dependency baru (fetch global).
async function fetchWithTimeout(url, options, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, Object.assign({}, options, { signal: ctrl.signal }));
  } catch (e) {
    if (e && e.name === 'AbortError') { const err = new Error('timeout embedding'); err.code = 'TIMEOUT'; throw err; }
    throw e;
  } finally { clearTimeout(t); }
}

// Ubah header Retry-After jadi ms tunggu (angka detik atau tanggal HTTP;
// dibatasi 30 detik agar tidak menggantung; 0 bila tak terbaca).
function retryAfterMs(v) {
  if (v == null || v === '') return 0;
  const s = Number(v);
  if (isFinite(s) && s >= 0) return Math.min(s, 30) * 1000;
  const dt = Date.parse(String(v));
  if (!isNaN(dt)) return Math.max(0, Math.min(dt - Date.now(), 30000));
  return 0;
}

// Embed via Jina: jinaEmbedTexts(texts, task) -> { vectors } | { error }.
// Respons Jina: { data: [{ index, embedding }] } — dipetakan via index agar
// urutan vektor sejajar dengan urutan input. 429 dihormati: tunggu sesuai
// Retry-After (maks 3x coba), lalu lapor jujur bila tetap gagal.
async function jinaEmbedTexts(texts, task, key) {
  const list = (Array.isArray(texts) ? texts : [])
    .map((t) => String(t == null ? '' : t).slice(0, JINA_MAX_CHARS))
    .map((t) => (t.trim() ? t : '(tanpa judul)'));
  if (!list.length) return { error: 'tidak ada teks' };
  if (!key) return { error: 'JINA_API_KEY tidak diset' };
  let lastErr = 'gagal memanggil Jina';
  for (let attempt = 1; attempt <= JINA_MAX_TRY; attempt++) {
    let r;
    try {
      r = await fetchWithTimeout(JINA_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
        body: JSON.stringify({ model: JINA_MODEL, task: task, input: list }),
      }, JINA_TIMEOUT_MS);
    } catch (e) {
      if (e && e.code === 'TIMEOUT') return { error: 'timeout embedding (Jina)' };
      return { error: 'gagal: ' + String((e && e.message) || e).slice(0, 80) };
    }
    if (r.status === 429) {
      lastErr = 'HTTP 429 dari Jina (batas laju)';
      if (attempt < JINA_MAX_TRY) {
        let wait = 0;
        try { wait = retryAfterMs(r.headers && r.headers.get('retry-after')); } catch (_) { wait = 0; }
        await sleep(wait > 0 ? wait : 2000 * attempt);
        continue;
      }
      return { error: lastErr };
    }
    if (r.status === 401 || r.status === 403) return { error: 'HTTP ' + r.status + ' dari Jina (kunci ditolak)' };
    if (!r.ok) return { error: 'HTTP ' + r.status + ' dari Jina' };
    let j;
    try { j = await r.json(); } catch (_) { return { error: 'respons embedding tidak lengkap (Jina)' }; }
    const data = j && Array.isArray(j.data) ? j.data : null;
    if (!data || data.length !== list.length) return { error: 'respons embedding tidak lengkap (Jina)' };
    const vecs = new Array(list.length);
    data.forEach((d) => {
      const emb = d && (d.embedding || (d.values ? d.values : null));
      if (d && typeof d.index === 'number' && Array.isArray(emb)) vecs[d.index] = emb;
    });
    // Tanpa index (kompatibel): anggap urutan respons = urutan input.
    if (vecs.some((v) => !Array.isArray(v))) {
      data.forEach((d, i) => {
        const emb = d && (d.embedding || null);
        if (Array.isArray(emb) && i < vecs.length && !vecs[i]) vecs[i] = emb;
      });
    }
    if (vecs.some((v) => !Array.isArray(v))) return { error: 'respons embedding tidak lengkap (Jina)' };
    return { vectors: vecs };
  }
  return { error: lastErr };
}

function stats(arr) {
  const xs = arr.slice().sort((a, b) => a - b);
  const n = xs.length;
  if (!n) return { n: 0, mean: 0, median: 0, p25: 0, p75: 0 };
  const mean = xs.reduce((s, v) => s + v, 0) / n;
  const q = (p) => xs[Math.min(n - 1, Math.floor(p * n))];
  const mid = n % 2 ? xs[(n - 1) / 2] : (xs[n / 2 - 1] + xs[n / 2]) / 2;
  return { n: n, mean: mean, median: mid, p25: q(0.25), p75: q(0.75) };
}

function f3(v) {
  return (Math.round(v * 1000) / 1000).toFixed(3);
}

// Susun ulang kandidat memakai dua ambang:
//  - tier kuat (sem >= high): di depan, urut skor semantic menurun;
//  - tier tengah (gate <= sem < high): sesudah tier kuat, PERTAHANKAN urutan
//    berkas asli sebagai proksi urutan dasar (cermin pipeline asli: semantic
//    sedang butuh dukungan leksikal, jadi urutan dasar dipertahankan);
//  - tier bawah (sem < gate): paling belakang, urutan berkas asli.
// Kedua ambang memengaruhi susunan sehingga grid sweep tidak degenerat.
function rerank(cands, gate, high) {
  const strong = [], mid = [], low = [];
  cands.forEach((c) => {
    if (c.sem >= high) strong.push(c);
    else if (c.sem >= gate) mid.push(c);
    else low.push(c);
  });
  strong.sort((a, b) => b.sem - a.sem);
  return strong.concat(mid, low);
}

// P@3/P@10/recall macro-avg per query, definisi sama tests/retrieval-eval.js:
// relevan = relevance >= 1; p3 = relevan-di-top3 / 3; p10 = relevan-di-top10
// / 10; recall = relevan-di-top10 / total-relevan-di-pool.
function evalRanked(queries, gate, high) {
  let sP3 = 0, sP10 = 0, sRec = 0;
  queries.forEach((q) => {
    const rk = rerank(q.items, gate, high);
    const rel3 = rk.slice(0, 3).filter(isRelevant).length;
    const rel10 = rk.slice(0, 10).filter(isRelevant).length;
    const tot = q.items.filter(isRelevant).length;
    sP3 += rel3 / 3;
    sP10 += rk.length >= 10 ? rel10 / 10 : (rk.length ? rel10 / rk.length : 0);
    sRec += tot ? rel10 / tot : 1;
  });
  const n = queries.length;
  return { p3: sP3 / n, p10: sP10 / n, recall: sRec / n };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  let rows;
  try {
    const raw = fs.readFileSync(BENCH, 'utf8').split(/\r?\n/).filter((l) => l.trim());
    rows = raw.map((l) => JSON.parse(l));
  } catch (e) {
    console.log('GAGAL baca eval/retrieval-benchmark.jsonl: ' + e.message);
    process.exitCode = 2;
    return;
  }

  // Bentuk baris asli: { text, topic, query_id,
  // candidates: [{ source, title, url, relevance, hard_negative }] }.
  // Terima alias query/materials bila ada.
  const queries = [];
  let skipped = 0;
  rows.forEach((o, idx) => {
    if (isTemplateRow(o)) { skipped++; return; }
    const cands = o.candidates || o.materials;
    const qtext = o.text != null ? o.text : o.query;
    if (typeof qtext !== 'string' || !qtext.trim()) {
      console.log('  SKIP baris ' + (idx + 1) + ': teks query kosong');
      skipped++;
      return;
    }
    if (!Array.isArray(cands) || cands.length === 0) {
      console.log('  SKIP baris ' + (idx + 1) + ': tanpa kandidat');
      skipped++;
      return;
    }
    queries.push({
      query_id: String(o.query_id == null ? 'q' + (idx + 1) : o.query_id),
      text: qtext,
      cands: cands,
    });
  });

  if (!queries.length) {
    console.log('BUTUH LABEL MANUAL: eval/retrieval-benchmark.jsonl hanya berisi TEMPLATE (' + skipped + ' baris dilewati).');
    process.exitCode = 2;
    return;
  }

  // Pemilihan provider: auto = jina bila JINA_API_KEY ada (env atau .env),
  // bila tidak gemini seperti perilaku lama. Jalur gemini tidak diubah.
  let provider = args.provider;
  let jinaKey = '';
  if (provider === 'jina' || provider === 'auto') jinaKey = getJinaKey();
  if (provider === 'auto') provider = jinaKey ? 'jina' : 'gemini';

  let material = null;
  let modelName = 'tidak diketahui';
  if (provider === 'gemini') {
    try {
      material = require('../api/material.js');
    } catch (e) {
      console.log('FALLBACK: tidak dapat memuat api/material.js (' + String(e.message).slice(0, 80) + ')');
      process.exitCode = 1;
      return;
    }
    if (!material || typeof material.embedBatch !== 'function') {
      console.log('FALLBACK: embedBatch tidak tersedia di api/material.js');
      process.exitCode = 1;
      return;
    }
    try {
      const cfg = require('../api/config.js');
      if (cfg && cfg.EMBEDDING_MODEL) modelName = String(cfg.EMBEDDING_MODEL);
    } catch (_) { /* nama model opsional, lanjut tanpa itu */ }
  } else {
    if (!jinaKey) {
      console.log('FALLBACK: JINA_API_KEY tidak diset (env dan .env kosong)');
      process.exitCode = 1;
      return;
    }
    modelName = JINA_MODEL;
  }

  // Hitung skor semantic per pasangan. Teks kandidat mengikuti pola
  // sourceText() (judul + abstrak), tetapi kandidat benchmark hanya punya
  // title sehingga dipakai title apa adanya. Teks kosong diganti penanda
  // agar urutan vektor tetap sejajar dengan urutan kandidat (embedBatch
  // gemini membuang string kosong; jalur Jina dijaga dengan aturan sama).
  // Jalur Jina: query di-embed dengan task retrieval.query, kandidat dengan
  // task retrieval.passage (dua panggilan per query).
  const pairs = [];
  for (let qi = 0; qi < queries.length; qi++) {
    const q = queries[qi];
    const candTexts = q.cands.map((c) => {
      const t = String((c && (c.abstract ? c.title + '. ' + c.abstract : c.title)) || '').trim();
      return t || '(tanpa judul)';
    });
    let qv = null;
    let cvecs = null;
    if (provider === 'jina') {
      const rq = await jinaEmbedTexts([q.text], JINA_TASK_QUERY, jinaKey);
      if (!rq.vectors) {
        console.log('FALLBACK: ' + String(rq.error || 'embedding tidak tersedia'));
        process.exitCode = 1;
        return;
      }
      const rc = await jinaEmbedTexts(candTexts, JINA_TASK_PASSAGE, jinaKey);
      if (!rc.vectors || rc.vectors.length !== candTexts.length) {
        console.log('FALLBACK: ' + String((rc && rc.error) || 'jumlah embedding tidak lengkap'));
        process.exitCode = 1;
        return;
      }
      qv = rq.vectors[0];
      cvecs = rc.vectors;
    } else {
      const texts = [q.text].concat(candTexts);
      const res = await material.embedBatch(texts);
      if (!res || !res.vectors) {
        console.log('FALLBACK: ' + String((res && res.error) || 'embedding tidak tersedia'));
        process.exitCode = 1;
        return;
      }
      if (res.vectors.length !== texts.length) {
        console.log('FALLBACK: jumlah embedding tidak lengkap (' + res.vectors.length + '/' + texts.length + ')');
        process.exitCode = 1;
        return;
      }
      qv = res.vectors[0];
      cvecs = res.vectors.slice(1);
    }
    q.cands.forEach((c, i) => {
      pairs.push({
        query_id: q.query_id,
        idx: i,
        title: String(c.title || ''),
        relevance: Number(c.relevance),
        hard_negative: c.hard_negative === true,
        sem: cosine(qv, cvecs[i]),
      });
    });
    if (qi < queries.length - 1 && args.gapMs > 0) await sleep(args.gapMs);
  }

  // Kelompokkan skor per query untuk evaluasi ranking.
  const byQ = {};
  pairs.forEach((p) => { (byQ[p.query_id] = byQ[p.query_id] || []).push(p); });
  const ranked = Object.keys(byQ).map((qid) => ({ query_id: qid, items: byQ[qid] }));

  // Distribusi skor semantic per label relevance 0/1/2.
  const dist = {
    0: stats(pairs.filter((p) => p.relevance === 0).map((p) => p.sem)),
    1: stats(pairs.filter((p) => p.relevance === 1).map((p) => p.sem)),
    2: stats(pairs.filter((p) => p.relevance === 2).map((p) => p.sem)),
  };

  // Sweep grid + baseline pembanding (0.62/0.72, tidak ditulis balik ke kode).
  const sweep = [];
  for (let g = GATE_MIN; g <= GATE_MAX; g++) {
    for (let h = HIGH_MIN; h <= HIGH_MAX; h++) {
      const gate = g / STEP_DIV, high = h / STEP_DIV;
      const m = evalRanked(ranked, gate, high);
      sweep.push({ gate: gate, high: high, p3: m.p3, p10: m.p10, recall: m.recall });
    }
  }
  const bm = evalRanked(ranked, BASE_GATE, BASE_HIGH);
  const baseline = { gate: BASE_GATE, high: BASE_HIGH, p3: bm.p3, p10: bm.p10, recall: bm.recall };
  const top5 = sweep.slice().sort((a, b) => (b.p10 - a.p10) || (b.p3 - a.p3)).slice(0, 5);

  // Laporan console ringkas berbahasa Indonesia (indikasi rendah-sedang-
  // tinggi; tanpa klaim terlarang). Confidence di sini = keyakinan
  // pengukuran: tinggi bila tiap label punya n besar dan sebaran wajar.
  console.log('SEM-SWEEP: provider=' + provider + ' queries=' + ranked.length + ' pasangan=' + pairs.length +
    ' template-dilewati=' + skipped + ' model=' + modelName);
  console.log('Distribusi skor semantic per relevance (n, mean, median, p25, p75):');
  [0, 1, 2].forEach((r) => {
    const d = dist[r];
    console.log('  rel=' + r + ' n=' + d.n + ' mean=' + f3(d.mean) +
      ' median=' + f3(d.median) + ' p25=' + f3(d.p25) + ' p75=' + f3(d.p75));
  });
  console.log('Baseline SEM_GATE=' + BASE_GATE.toFixed(2) + ' SEM_HIGH=' + BASE_HIGH.toFixed(2) +
    ': P@3=' + f3(baseline.p3) + ' P@10=' + f3(baseline.p10) + ' recall=' + f3(baseline.recall));
  console.log('Top-5 kombinasi (P@10 terbaik, lalu P@3):');
  top5.forEach((t, i) => {
    console.log('  ' + (i + 1) + '. GATE=' + t.gate.toFixed(2) + ' HIGH=' + t.high.toFixed(2) +
      ' P@3=' + f3(t.p3) + ' P@10=' + f3(t.p10) + ' recall=' + f3(t.recall));
  });
  const conf = (dist[0].n >= 50 && dist[2].n >= 10) ? 'sedang-tinggi' : 'rendah-sedang';
  console.log('Confidence pengukuran: ' + conf + ' (berdasar jumlah pasangan per label).');
  console.log('Sweep ' + sweep.length + ' kombinasi: GATE 0.55..0.70 x HIGH 0.68..0.78 (step 0.01).');

  const out = {
    metadata: {
      provider: provider,
      model: modelName,
      waktu: new Date().toISOString(),
      jumlah_query: ranked.length,
      jumlah_pasangan: pairs.length,
      baris_dilewati: skipped,
      gap_ms: args.gapMs,
      bench_file: 'eval/retrieval-benchmark.jsonl',
    },
    scores: pairs.map((p) => ({
      query_id: p.query_id,
      idx: p.idx,
      title: p.title,
      relevance: p.relevance,
      hard_negative: p.hard_negative,
      sem: Math.round(p.sem * 1e6) / 1e6,
    })),
    distribusi: dist,
    sweep: sweep,
    baseline: baseline,
    top5: top5,
  };
  try {
    fs.mkdirSync(path.dirname(args.out), { recursive: true });
    fs.writeFileSync(args.out, JSON.stringify(out, null, 2) + '\n');
  } catch (e) {
    console.log('GAGAL tulis output TEMP ' + args.out + ': ' + e.message);
    process.exitCode = 2;
    return;
  }
  console.log('Hasil lengkap tersimpan di: ' + args.out);
  process.exitCode = 0;
}

if (require.main === module) { main(); }
module.exports = { cosine: cosine, rerank: rerank, evalRanked: evalRanked, isTemplateRow: isTemplateRow, getJinaKey: getJinaKey, jinaEmbedTexts: jinaEmbedTexts, readDotEnvKey: readDotEnvKey };
