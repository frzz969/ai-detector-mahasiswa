// tools/benchmark-helper.js - Helper label manual 30 query pilot retrieval.
// Baca eval/retrieval-benchmark.jsonl apa adanya, tampilkan status per query_id
// (template vs SUDAH berlabel), pandu user mengisi 10 kandidat + relevance 0/1/2
// + hard_negative untuk 1 query, validasi, lalu GANTI baris template itu saja.
// Baris lain TIDAK disentuh; tulis atomik (file tmp + rename).
// Panduan relevance: 2 = sangat relevan, 1 = nyerempet, 0 = tidak relevan.
// hard_negative = y bila keyword cocok tapi konteks salah (wajib ≥2 ber-relevance 0).
// Perintah: s = lewati slot, q = batal/keluar. Tanpa dependensi.
// Opsi uji: node tools/benchmark-helper.js --file=<path> (default file asli).
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT = path.resolve(__dirname, '..');
const fileArg = (process.argv.slice(2).find((a) => a.indexOf('--file=') === 0)
  || '').slice('--file='.length);
const BENCH = fileArg ? path.resolve(fileArg) : path.join(ROOT, 'eval',
  'retrieval-benchmark.jsonl');

function isTemplate(o) {
  if (!o || typeof o !== 'object') return true;
  if (/template/i.test(String(o.note == null ? '' : o.note))) return true;
  if (/template/i.test(String(o.text == null ? '' : o.text))) return true;
  return false;
}

function loadFile() {
  const raw = fs.readFileSync(BENCH, 'utf8').split(/\r?\n/);
  const lines = raw.filter((l) => l.trim().length > 0);
  return lines.map((l) => JSON.parse(l));
}

function labeledCount(rows) {
  return rows.filter((r) => !isTemplate(r)).length;
}

function printList(rows) {
  console.log('QUERY (' + rows.length + '):');
  rows.forEach((r) => {
    console.log('  ' + r.query_id + ' | ' + r.topic + ' | ' + (isTemplate(r) ? 'template' : 'SUDAH berlabel'));
  });
  console.log('Sudah berlabel: ' + labeledCount(rows) + '/' + rows.length + '.');
}

function validate(cands) {
  const errs = [];
  if (!Array.isArray(cands)
    || cands.length !== 10) errs.push('harus tepat 10 kandidat (sekarang ' + (cands ? cands.length : 0) + ').');
  (cands || []).forEach((c, i) => {
    const n = i + 1;
    if (!c.source) errs.push('slot ' + n + ': source kosong.');
    if (!c.title) errs.push('slot ' + n + ': title kosong.');
    if (!/^https?:\/\//i.test(String(c.url || ''))) errs.push('slot ' + n + ': url harus diawali http(s).');
    if ([0, 1, 2].indexOf(Number(c.relevance)) === -1) errs.push('slot ' + n + ': relevance harus 0/1/2.');
  });
  const hn0 = (cands || []).filter((c) => c.hard_negative === true
    && Number(c.relevance) === 0).length;
  if (hn0 < 2) errs.push('hard_negative ber-relevance 0 kurang (ada ' + hn0 + ', wajib ≥2).');
  return errs;
}

// Ganti baris ber-query_id sama (pertahankan query_id/topic, hapus note
// TEMPLATE). Tulis atomik (tmp + rename). null = ok, string = error.
function replaceRow(benchPath, queryId, topic, text, cands) {
  const raw = fs.readFileSync(benchPath, 'utf8').split(/\r?\n/);
  let found = false;
  const out = raw.map((l) => {
    if (!l.trim()) return l;
    let o = null;
    try { o = JSON.parse(l); } catch (_) { return l; }
    if (String(o.query_id) !== String(queryId)) return l;
    found = true;
    return JSON.stringify({ text: text, topic: topic, query_id: String(queryId), candidates: cands,
      note: 'label manual ' + new Date().toISOString().slice(0, 10) });
  });
  if (!found) return 'query_id tidak ketemu di file.';
  const tmp = benchPath + '.tmp';
  fs.writeFileSync(tmp, out.join('\n').replace(/\n+$/, '\n').replace(/([^\n])$/, '$1\n'));
  fs.renameSync(tmp, benchPath);
  return null;
}

async function main() {
  let rows;
  try {
    rows = loadFile();
  } catch (e) {
    console.log('GAGAL baca ' + BENCH + ': ' + e.message);
    process.exit(2);
    return;
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise((res) => rl.question(q, (a) => res(a)));
  const loadFileSafe = () => { try { return loadFile(); } catch (_) { return rows; } };
  const statusLine = (rs) => ('Sudah berlabel: ' + labeledCount(rs) + '/' + rs.length + '.');

  console.log('BENCHMARK RETRIEVAL: nilai manual 0/1/2 (2=sangat relevan, 1=nyerempet, 0=tidak relevan).');
  printList(rows);

  for (;;) {
    const pick = String(await ask('pilih query_id (q=keluar): ')).trim();
    if (pick === 'q' || pick === '') {
      const rs = loadFileSafe();
      console.log('Keluar. ' + statusLine(rs));
      rl.close();
      process.exit(0);
      return;
    }
    const idx = rows.findIndex((r) => String(r.query_id) === pick);
    if (idx === -1) { console.log('  id tidak ketemu. Pilih dari daftar di atas.'); continue; }
    if (!isTemplate(rows[idx])) {
      const c = String(await ask('  ' + pick + ' SUDAH berlabel. Timpa? (y/n): ')).trim().toLowerCase();
      if (c !== 'y') continue;
    }
    const ok = await labelOne(rows[idx], ask);
    if (ok === 'quit') {
      const rs = loadFileSafe();
      console.log('Keluar. ' + statusLine(rs));
      rl.close();
      process.exit(0);
      return;
    }
    if (ok === true) {
      try { rows = loadFile(); } catch (_) {}
      console.log(statusLine(rows));
      const nx = String(await ask('label query lain? (ketik id / Enter=tidak): ')).trim();
      if (nx === '') {
        console.log('Selesai. ' + statusLine(rows));
        rl.close();
        process.exit(0);
        return;
      }
      const ni = rows.findIndex((r) => String(r.query_id) === nx);
      if (ni === -1) { console.log('  id tidak ketemu. Kembali ke daftar.'); printList(rows); continue; }
      if (!isTemplate(rows[ni])) {
        const c2 = String(await ask('  ' + nx + ' SUDAH berlabel. Timpa? (y/n): ')).trim().toLowerCase();
        if (c2 !== 'y') { printList(rows); continue; }
      }
      const ok2 = await labelOne(rows[ni], ask);
      void ok2;
      try { rows = loadFile(); } catch (_) {}
      console.log(statusLine(rows));
      printList(rows);
    }
  }

  // Label 1 query: kembalikan true (tersimpan), 'batal' (dibatalkan), 'quit' (keluar).
  async function labelOne(row, askFn) {
    console.log('');
    console.log('--- ' + row.query_id + ' | topik: ' + row.topic + ' ---');
    let text = '';
    for (;;) {
      const t = String(await askFn('  teks query (pengganti teks template, q=batal): ')).trim();
      if (t.toLowerCase() === 'q') return 'batal';
      if (!t) { console.log('  teks tidak boleh kosong.'); continue; }
      if (/template/i.test(t)) { console.log('  jangan pakai kata "template" (itu penanda baris belum dinilai).'); continue; }
      text = t;
      break;
    }
    const cands = new Array(10).fill(null);
    let pending = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    while (pending.length) {
      const i = pending[0];
      console.log('  slot ' + (i + 1) + '/10' + (row.candidates
        && row.candidates[i] ? ' (template: ' + String(row.candidates[i].title).slice(0,
          50) + ')' : ''));
      const one = await enterSlot(i, askFn);
      if (one === 'quit') return 'quit';
      if (one === 'abort') return 'batal';
      if (one !== null) cands[i] = one;
      pending = cands.map((c, k) => (c ? -1 : k)).filter((k) => k !== -1);
      if (pending.length
        && one === null) console.log('  slot ' + (i + 1) + ' dilewati, nanti dilengkapi.');
    }
    for (;;) {
      console.log('  ringkasan ' + row.query_id + ':');
      cands.forEach((c, i) => {
        console.log('    ' + (i + 1) + '. [' + c.source + '] ' + String(c.title).slice(0,
          45) + ' | rel=' + c.relevance + (c.hard_negative ? ' HN' : ''));
      });
      const cmd = String(await askFn('  simpan / ulang <1-10> / batal: ')).trim().toLowerCase();
      if (cmd === 'batal') return 'batal';
      if (cmd === 'simpan') {
        const errs = validate(cands);
        if (errs.length) {
          console.log('  DITOLAK, tidak disimpan:');
          errs.forEach((e) => console.log('   - ' + e));
          continue;
        }
        saveRow(row.query_id, row.topic, text, cands);
        console.log('  tersimpan: ' + row.query_id + ' (10 kandidat, HN0=' + cands.filter((c) => c.hard_negative
          && Number(c.relevance) === 0).length + ').');
        return true;
      }
      const m = cmd.match(/^ulang\s+(\d{1,2})$/);
      if (m) {
        const n = Number(m[1]);
        if (n < 1 || n > 10) { console.log('  nomor 1-10.'); continue; }
        const one = await enterSlot(n - 1, askFn);
        if (one === 'quit') return 'quit';
        if (one === 'abort') return 'batal';
        if (one !== null) cands[n - 1] = one;
        continue;
      }
      console.log('  perintah: simpan / ulang <1-10> / batal.');
    }
  }

  // Isi 1 slot: object / null (s=lewati) / 'abort' (q=batal).
  async function enterSlot(i, askFn) {
    const get = async (label, allowSkip) => {
      for (;;) {
        const a = String(await askFn('   ' + label + (allowSkip ? ' (s=lewati, q=batal)' : ' (q=batal)') + ': ')).trim();
        if (allowSkip && a.toLowerCase() === 's') return 'SKIP';
        if (a.toLowerCase() === 'q') return 'QUIT';
        if (!a) { console.log('   tidak boleh kosong.'); continue; }
        return a;
      }
    };
    const source = await get('source', true);
    if (source === 'QUIT') return 'abort';
    if (source === 'SKIP') return null;
    const title = await get('title', true);
    if (title === 'QUIT') return 'abort';
    if (title === 'SKIP') return null;
    let url = '';
    for (;;) {
      const u = String(await askFn('   url http(s) (s=lewati, q=batal): ')).trim();
      if (u.toLowerCase() === 's') return null;
      if (u.toLowerCase() === 'q') return 'abort';
      if (!/^https?:\/\//i.test(u)) { console.log('   url harus diawali http(s).'); continue; }
      url = u;
      break;
    }
    let relevance = null;
    for (;;) {
      const rR = String(await askFn('   relevance [2=sangat relevan/1=nyerempet/0=tidak relevan] (s=lewati, q=batal): ')).trim().toLowerCase();
      if (rR === 's') return null;
      if (rR === 'q') return 'abort';
      if (rR === '0' || rR === '1' || rR === '2') { relevance = Number(rR); break; }
      console.log('   isi 0, 1, atau 2.');
    }
    let hn = null;
    for (;;) {
      const h = String(await askFn('   hard_negative? [y/n] (y = keyword cocok tapi konteks salah): ')).trim().toLowerCase();
      if (h === 'y' || h === 'ya') { hn = true; break; }
      if (h === 'n' || h === 'tidak' || h === '') { hn = false; break; }
      console.log('   isi y atau n.');
    }
    return { source: source, title: title, url: url, relevance: relevance, hard_negative: hn };
  }

  function saveRow(queryId, topic, text, cands) {
    const err = replaceRow(BENCH, queryId, topic, text, cands);
    if (err) console.log('  GAGAL simpan: ' + err);
  }
}

if (require.main === module) { main(); }
module.exports = { validate: validate, isTemplate: isTemplate, replaceRow: replaceRow };
