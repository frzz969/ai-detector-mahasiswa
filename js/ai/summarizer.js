// FarazSummarize — ringkasan EKSTRAKTIF lokal (tanpa AI key).
// Aturan: humanizer-rules §4 (verbatim, tanpa karangan); validation-rules §5.
// Skor kalimat = frekuensi kata isi + bonus posisi/data/panjang. Vanilla JS.
(function (global) {
  "use strict";

  var MAX_KEEP = 5;
  var MIN_KEEP = 2;

  function getSents(text) {
    // Markdown dibersihkan dulu — ekstraktif verbatim tampil teks polos.
    try { if (typeof stripMarkdown === "function") text = stripMarkdown(String(text)); } catch (_) {}
    if (typeof splitSentences === "function") {
      try {
        var s = splitSentences(text);
        if (s && s.length) return s;
      } catch (_) { /* jatuh ke pemecah lokal */ }
    }
    var norm = String(text).replace(/\s+/g, " ").trim();
    if (!norm) return [];
    return (norm.match(/[^.!?]+[.!?]+["”']?|\S.+$/g) || [norm])
      .map(function (x) { return x.trim(); })
      .filter(function (x) { return x.split(/\s+/).length > 3; });
  }

  function countW(s) {
    if (typeof countWords === "function") {
      try { return countWords(s); } catch (_) { /* hitung lokal */ }
    }
    return (String(s).trim().match(/[\p{L}\p{N}']+/gu) || []).length;
  }

  // Kata isi: panjang >=4, bukan function word (pakai set global bila ada).
  function contentTokens(s) {
    var toks = (String(s).toLowerCase().match(/[\p{L}\p{N}']+/gu) || []);
    var hasId = typeof ID_FW !== "undefined" && ID_FW && typeof ID_FW.has === "function";
    var hasEn = typeof EN_FW !== "undefined" && EN_FW && typeof EN_FW.has === "function";
    return toks.filter(function (t) {
      if (t.length < 4) return false;
      if (hasId && ID_FW.has(t)) return false;
      if (hasEn && EN_FW.has(t)) return false;
      return true;
    });
  }

  // Jaccard kemiripan (pola validator): >0.7 = near-duplikat.
  function jaccard(a, b) {
    var sa = {}, sb = {};
    a.forEach(function (x) { sa[x] = 1; });
    b.forEach(function (x) { sb[x] = 1; });
    var inter = 0;
    for (var k in sa) if (sb[k]) inter++;
    var union = Object.keys(sa).length + Object.keys(sb).length - inter;
    return union ? inter / union : 1;
  }

  // Pecah satu paragraf jadi kalimat (fallback lokal bila splitSentences tak ada).
  function splitPara(p) {
    try {
      if (typeof splitSentences === "function") {
        var s = splitSentences(p);
        if (s && s.length) return s;
      }
    } catch (_) {}
    var norm = String(p).replace(/\s+/g, " ").trim();
    if (!norm) return [];
    return (norm.match(/[^.!?]+[.!?]+["”']?|\S.+$/g) || [norm])
      .map(function (x) { return x.trim(); })
      .filter(function (x) { return x.split(/\s+/).length > 3; });
  }

  // Paragraf asal tiap kalimat (untuk cakupan lintas bagian). Tak selaras → semua 0.
  function paraOfSents(text, sents) {
    var zeros = sents.map(function () { return 0; });
    try {
      var clean = String(text);
      if (typeof stripMarkdown === "function") clean = stripMarkdown(clean);
      var paras = clean.split(/\n\s*\n/).map(function (p) { return p.trim(); }).filter(Boolean);
      if (paras.length < 2) return zeros;
      var counts = paras.map(function (p) { return splitPara(p).length; });
      var total = 0, ci;
      for (ci = 0; ci < counts.length; ci++) total += counts[ci];
      if (total !== sents.length) return zeros;
      var out = [], pi = 0, left = counts[0];
      sents.forEach(function () {
        out.push(pi);
        left--;
        if (left <= 0 && pi < counts.length - 1) { pi++; left = counts[pi]; }
      });
      return out;
    } catch (_) { return zeros; }
  }

  // summarize(text, opts{max}) → kalimat ASLI verbatim dalam urutan naskah.
  function summarize(text, opts) {
    var o = opts || {};
    var maxKeep = typeof o.max === "number" ? Math.max(MIN_KEEP, Math.min(MAX_KEEP, Math.round(o.max))) : MAX_KEEP;
    var sents = getSents(text);
    if (!sents.length) {
      return { sentences: [], picked: [], method: "ringkasan ekstraktif: teks kosong — tidak ada kalimat untuk diringkas." };
    }
    if (sents.length <= 3) {
      return {
        sentences: sents.slice(),
        picked: sents.map(function (_, i) { return i; }),
        method: "ringkasan ekstraktif: teks hanya " + sents.length + " kalimat — ditampilkan utuh, tanpa ubah fakta."
      };
    }
    // Frekuensi kata isi sedokumen (TF sederhana).
    var freq = {};
    var toksPer = sents.map(function (s) {
      var c = contentTokens(s);
      c.forEach(function (t) { freq[t] = (freq[t] || 0) + 1; });
      return c;
    });
    var scored = sents.map(function (s, i) {
      var c = toksPer[i];
      var tf = 0;
      c.forEach(function (t) { tf += freq[t] || 0; });
      var sc = c.length ? tf / c.length : 0;
      var wl = countW(s);
      if (i === 0) sc += 1.2;                    // pembuka: konteks topik
      if (i === sents.length - 1) sc += 0.8;    // penutup: simpulan
      if (/\d/.test(s)) sc += 1.5;              // data konkret
      if (wl >= 8 && wl <= 30) sc += 0.5;       // panjang informatif
      else if (wl < 6 || wl > 40) sc -= 0.5;
      return { i: i, sc: sc };
    });
    scored.sort(function (a, b) { return b.sc - a.sc || a.i - b.i; });
    // keep proporsional: ~1 per 5 kalimat (min 2, maks 5).
    var keep = Math.max(MIN_KEEP, Math.min(maxKeep, Math.round(sents.length / 5)));
    // Pilih greedy: dedupe near-duplikat (Jaccard >0.7 → skor lebih rendah dibuang)
    // + cakupan lintas paragraf (maks 2 per paragraf; teks pendek/1 paragraf bebas).
    var sets = toksPer.map(function (c) {
      var s = {};
      c.forEach(function (t) { s[t] = 1; });
      return Object.keys(s);
    });
    var paraOf = paraOfSents(text, sents);
    var distinctParas = {};
    paraOf.forEach(function (p) { distinctParas[p] = 1; });
    var useParaCap = Object.keys(distinctParas).length > 1 && sents.length > 6;
    var picked = [], paraCount = {};
    var isDup = function (i) {
      for (var k = 0; k < picked.length; k++) {
        var j = picked[k];
        if (!sets[i].length || !sets[j].length) {
          if (sents[i] === sents[j]) return true;
        } else if (jaccard(sets[i], sets[j]) > 0.7) return true;
      }
      return false;
    };
    var tryPass = function (withCap) {
      scored.forEach(function (e) {
        if (picked.length >= keep || picked.indexOf(e.i) !== -1) return;
        if (isDup(e.i)) return;
        if (withCap && useParaCap) {
          var pc = paraCount[paraOf[e.i]] || 0;
          if (pc >= 2) return;
        }
        picked.push(e.i);
        paraCount[paraOf[e.i]] = (paraCount[paraOf[e.i]] || 0) + 1;
      });
    };
    tryPass(true);
    if (picked.length < keep) tryPass(false); // longgarkan cap paragraf, dedupe tetap
    picked.sort(function (a, b) { return a - b; });
    return {
      sentences: picked.map(function (i) { return sents[i]; }),
      picked: picked,
      method: "ringkasan ekstraktif: " + picked.length + " dari " + sents.length +
        " kalimat asli dipilih (skor frekuensi+posisi+data, dedupe kemiripan, sebar lintas paragraf), ditampilkan verbatim — tanpa ubah fakta, tanpa simpulan baru."
    };
  }

  global.FarazSummarize = {
    summarize: summarize,
    MAX_KEEP: MAX_KEEP
  };
})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this);
