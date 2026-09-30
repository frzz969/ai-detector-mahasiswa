// ============================================================
// FarazSummarize — ringkasan EKSTRAKTIF lokal (tanpa AI key)
// Aturan: humanizer-rules §4 (angka/fakta/istilah tidak diubah, tanpa
// data karangan) → kalimat diambil VERBATIM dari teks, hanya dipilih +
// diurutkan; validation-rules §5 (tanpa klaim absolut).
// Skor kalimat = frekuensi kata isi + bonus posisi/data/panjang.
// File vanilla JS global (tanpa import/export ES).
// ============================================================
(function (global) {
  "use strict";

  var MAX_KEEP = 5;
  var MIN_KEEP = 2;

  function getSents(text) {
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

  // summarize(text, opts{max}) → { sentences[], picked[], method }.
  // sentences = kalimat ASLI verbatim dalam urutan naskah.
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
    var keep = Math.max(MIN_KEEP, Math.min(maxKeep, Math.ceil(sents.length / 3)));
    var picked = scored.slice(0, keep).map(function (x) { return x.i; }).sort(function (a, b) { return a - b; });
    return {
      sentences: picked.map(function (i) { return sents[i]; }),
      picked: picked,
      method: "ringkasan ekstraktif: " + picked.length + " dari " + sents.length +
        " kalimat asli dipilih (skor frekuensi+posisi+data), ditampilkan verbatim — tanpa ubah fakta, tanpa simpulan baru."
    };
  }

  global.FarazSummarize = {
    summarize: summarize,
    MAX_KEEP: MAX_KEEP
  };
})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this);
