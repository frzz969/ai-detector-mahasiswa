// tools/audit-helper.js - Helper audit blind 1-reviewer (tanpa dependensi).
// Baca eval/audit_sample_v2.jsonl, sembunyikan label asli (blind), SODORKAN
// TEKS sampel otomatis dari eval/dataset_v2.jsonl (kolom id + text + pair_id),
// pandu reviewer mengisi verdict + confidence + catatan per sampel.
// Kalau id tak ketemu di dataset: pesan jujur "teks tidak ketemu, buka URL" -
// JANGAN karang teks. Kalau sampel punya pasangan pair_id: tampilkan juga
// teks pasangannya; keduanya dilabel "A"/"B" ACAK tanpa bocoran mana machine,
// verdict tetap untuk sampel berjalan. Teks dipotong ±800 karakter + Jumlah kata.
// Hasil append ke eval/audit_review.jsonl per baris:
//   { id, verdict: "AI"|"Human"|"Uncertain", confidence: "Low"|"Med"|"High",
//     note, reviewed_at }
// File sampel & dataset TIDAK PERNAH diubah. Resume otomatis: id yang sudah ada
// di review file dilewati. Urutan: 15 prioritas (audit_triage.md §2) dulu,
// lalu sisanya sesuai urutan file.
// Perintah saat prompt: a=AI, h=human, u=uncertain, s=skip, p=progress, q=keluar.
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT = path.resolve(__dirname, '..');
const SAMPLE = path.join(ROOT, 'eval', 'audit_sample_v2.jsonl');
const REVIEW = path.join(ROOT, 'eval', 'audit_review.jsonl');
const DATASET = path.join(ROOT, 'eval', 'dataset_v2.jsonl');
const TEXT_LIMIT = 800;

// 15 ID prioritas (audit_triage.md §2); yang tidak ada di file dilewati.
const PRIORITY = [
  'wikih-0164', 'wikih-0102', 'm4h-0007', 'm4pr1h-0036', 'oah-0055',
  'm4pr2h-0060', 'm4pr2m-0078', 'wikih-0141', 'm4pr2h-0073', 'm4h-0065',
  'm4pr1h-0086', 'm4m-0068', 'm4pr1m-0085', 'm4pr2m-0100', 'oah-0027',
];

function loadRows() {
  const raw = fs.readFileSync(SAMPLE, 'utf8').split(/\r?\n/).filter((l) => l.trim());
  return raw.map((l) => JSON.parse(l));
}

function loadReviewed() {
  const done = new Set();
  if (!fs.existsSync(REVIEW)) return done;
  fs.readFileSync(REVIEW, 'utf8').split(/\r?\n/).filter((l) => l.trim()).forEach((l) => {
    try {
      const o = JSON.parse(l);
      if (o && o.id) done.add(String(o.id));
    } catch (_) { /* baris rusak diabaikan, tidak menghentikan */ }
  });
  return done;
}

function checksSummary(r) {
  const a = (r && r.auto_checks) || {};
  return 'license_ok=' + a.license_ok + ' date=' + a.date_ok + ' len=' + a.len_ok;
}

// dataset_v2.jsonl: kolom id, text, label, source, url, license, pub_date,
// genre, lang, ai_kind, generator, prompt_id, pair_id, words, sha256, split.
// Hanya id/text/pair_id yang dipakai di sini; label/generator/ai_kind TIDAK
// PERNAH dibaca/ditampilkan (blind).
function loadDataset() {
  try {
    const byId = {};
    const byPair = {};
    fs.readFileSync(DATASET, 'utf8').split(/\r?\n/).filter((l) => l.trim()).forEach((l) => {
      const o = JSON.parse(l);
      if (!o || o.id == null) return;
      byId[String(o.id)] = o;
      if (o.pair_id != null) {
        const k = String(o.pair_id);
        (byPair[k] = byPair[k] || []).push(o);
      }
    });
    return { byId: byId, byPair: byPair };
  } catch (_) { return null; }
}

function snippet(text) {
  const s = String(text == null ? '' : text);
  const words = s.trim() ? s.trim().split(/\s+/).length : 0;
  const cut = s.length > TEXT_LIMIT ? s.slice(0, TEXT_LIMIT) + ' …' : s;
  return { cut: cut, words: words, long: s.length > TEXT_LIMIT };
}

function printText(tag, text) {
  const s = snippet(text);
  console.log('  [' + tag + '] (' + s.words + ' kata' + (s.long ? ', dipotong ±' + TEXT_LIMIT + ' karakter' : '') + '):');
  console.log('  ' + s.cut.split(/\r?\n/).join('\n  '));
}

// Tampilkan teks sampel + (bila ada) teks pasangan pair sebagai A/B acak.
// Kembalian: selalu tanpa bocoran label. verdict tetap milik sampel berjalan.
function showTexts(r, ds) {
  if (!ds) {
    console.log('  teks: dataset tidak terbaca — buka URL di atas, JANGAN karang teks.');
    return 'tunggal';
  }
  const d = ds.byId[String(r.id)];
  if (!d || !d.text) {
    console.log('  teks: TIDAK KETEMU di dataset_v2.jsonl — buka URL di atas, JANGAN karang teks.');
    return 'tunggal';
  }
  const mates = (d.pair_id != null && ds.byPair[String(d.pair_id)] || [])
    .filter((m) => String(m.id) !== String(d.id) && m.text);
  if (!mates.length) {
    printText('teks sampel (yang dinilai)', d.text);
    return 'tunggal';
  }
  const mineFirst = Math.random() < 0.5;
  const slots = mineFirst
    ? [{ tag: 'A', mine: true, text: d.text }, { tag: 'B', mine: false, text: mates[0].text }]
    : [{ tag: 'A', mine: false, text: mates[0].text }, { tag: 'B', mine: true, text: d.text }];
  console.log('  bandingkan 2 teks (urutan ACAK, tanpa bocoran mana machine):');
  slots.forEach((s) => printText('teks ' + s.tag, s.text));
  const mySlot = slots.filter((s) => s.mine)[0].tag;
  console.log('  yang dinilai = teks ' + mySlot + ' (id ' + r.id + ')');
  return 'pasangan';
}

function orderRows(rows, done) {
  const byId = {};
  rows.forEach((r) => { byId[r.id] = r; });
  const out = [];
  const seen = new Set();
  PRIORITY.forEach((id) => {
    if (byId[id] && !done.has(id) && !seen.has(id)) { out.push(byId[id]); seen.add(id); }
  });
  rows.forEach((r) => {
    if (!done.has(r.id) && !seen.has(r.id)) { out.push(r); seen.add(r.id); }
  });
  return out;
}

// true bila semua ID prioritas yang ada di file sudah direview (sesi lalu + sesi ini).
function prioritiesComplete(rows, done, sessionIds) {
  const inFile = {};
  rows.forEach((r) => { inFile[String(r.id)] = true; });
  return PRIORITY
    .filter((id) => inFile[String(id)])
    .every((id) => done.has(String(id)) || sessionIds.has(String(id)));
}

async function main() {
  let rows;
  try {
    rows = loadRows();
  } catch (e) {
    console.log('GAGAL baca eval/audit_sample_v2.jsonl: ' + e.message);
    process.exit(2);
    return;
  }
  const done = loadReviewed();
  const ds = loadDataset();
  const queue = orderRows(rows, done);
  const total = rows.length;

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise((res) => rl.question(q, (a) => res(a)));

  console.log('AUDIT BLIND: ' + total + ' sampel, sudah direview ' + done.size + ', antre ' + queue.length + '.');
  console.log('Label asli DISEMBUNYIKAN. Teks disodorkan otomatis dari eval/dataset_v2.jsonl.');
  console.log('Perintah: a=AI h=human u=uncertain | l/m/h confidence | s=skip p=progress q=keluar');

  let wrote = 0, skipped = 0;
  const sessionIds = new Set();
  for (const r of queue) {
    console.log('');
    console.log('--- ' + r.id + ' (' + (done.size + wrote + 1) + '/' + total + ') ---');
    console.log('  source : ' + r.source);
    console.log('  split  : ' + r.split + ' | words: ' + r.words);
    console.log('  license: ' + r.license);
    console.log('  pub_date: ' + (r.pub_date == null ? '(kosong — khusus sel M4, catat bila ragu)' : r.pub_date));
    console.log('  url    : ' + r.url);
    console.log('  checks : ' + checksSummary(r));
    showTexts(r, ds);

    let verdict = null;
    for (;;) {
      const v = String(await ask('  verdict [a/h/u, s=skip, p=progress, q=keluar]: ')).trim().toLowerCase();
      if (v === 'q') {
        console.log('Keluar. Sudah=' + (done.size + wrote) + ' belum=' + (total - done.size - wrote) + ' (skipped sesi ini=' + skipped + ').');
        if (prioritiesComplete(rows, done, sessionIds)) {
          const b = String(await ask('Lanjut benchmark? (y/n): ')).trim().toLowerCase();
          if (b === 'y' || b === 'ya') {
            rl.close();
            require('child_process').spawnSync(process.execPath, [path.join(ROOT, 'tools',
              'benchmark-helper.js')], { stdio: 'inherit' });
            process.exit(0);
            return;
          }
        }
        console.log('Nanti lanjut benchmark: node tools/benchmark-helper.js');
        rl.close();
        process.exit(0);
        return;
      }
      if (v === 's' || v === 'skip') { skipped++; verdict = null; break; }
      if (v === 'p') { console.log('  progress: sudah=' + (done.size + wrote) + ' belum=' + (total - done.size - wrote)); continue; }
      if (v === 'a' || v === 'ai') { verdict = 'AI'; break; }
      if (v === 'h' || v === 'human') { verdict = 'Human'; break; }
      if (v === 'u' || v === 'uncertain') { verdict = 'Uncertain'; break; }
      console.log('  pilih a / h / u (ragu = u), s, p, atau q.');
    }
    if (verdict === null) continue;

    let confidence = null;
    for (;;) {
      const c = String(await ask('  confidence [l=Low/m=Med/h=High]: ')).trim().toLowerCase();
      if (c === 'l' || c === 'low') { confidence = 'Low'; break; }
      if (c === 'm' || c === 'med') { confidence = 'Med'; break; }
      if (c === 'h' || c === 'high') { confidence = 'High'; break; }
      console.log('  pilih l / m / h.');
    }
    const note = String(await ask('  note (opsional, Enter lewati): ')).trim();
    const rec = { id: r.id, verdict: verdict, confidence: confidence, note: note,
      reviewed_at: new Date().toISOString() };
    fs.appendFileSync(REVIEW, JSON.stringify(rec) + '\n');
    sessionIds.add(String(r.id));
    wrote++;
  }

  console.log('');
  console.log('SELESAI. Sudah=' + (done.size + wrote) + '/' + total + ' belum=' + (total - done.size - wrote) + ' (skipped sesi ini=' + skipped + ').');
  rl.close();
  process.exit(0);
}

main();
