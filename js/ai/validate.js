// FarazValidate — 10 checks murni untuk gerbang kualitas.
// Aturan: validation-rules §4 (makna → fakta → akademik → kejelasan → koherensi →
// naturalness → pola → skor); humanizer-rules (fakta/angka/sitasi/istilah tetap;
// tanpa karangan; hedge tidak overclaim). Pure, tanpa DOM/fetch. Bahasa indikasi.
(function (global) {
  "use strict";

  function tokensLower(t) {
    return (String(t).toLowerCase().match(/[\p{L}\p{N}']+/gu) || []);
  }

  function numberTokens(t) {
    return (String(t).match(/\b\d+([.,]\d+)?\b/g) || []);
  }

  function citeTokens(t) {
    var s = String(t);
    var out = [];
    var re1 = /\[\d+(\s*[-–,]\s*\d+)*\]/g, m;
    while ((m = re1.exec(s))) out.push(m[0]);
    var re2 = /\([A-Z][a-z]+(?: et al\.)?,?\s?\d{4}[a-z]?\)/g;
    while ((m = re2.exec(s))) out.push(m[0]);
    var re3 = /\bet al\./gi;
    while ((m = re3.exec(s))) out.push(m[0].toLowerCase());
    return out;
  }

  function doiUrlTokens(t) {
    var s = String(t);
    var out = [];
    var re1 = /https?:\/\/\S+/gi, m;
    while ((m = re1.exec(s))) out.push(m[0]);
    var re2 = /\bDOI:\S+/gi;
    while ((m = re2.exec(s))) out.push(m[0]);
    return out;
  }

  function quotedSpans(t) {
    var s = String(t);
    var out = [];
    var re = /"[^"]+"|“[^”]+”|'[^']{4,}'/g, m;
    while ((m = re.exec(s))) out.push(m[0]);
    return out;
  }

  function properNouns(t) {
    var s = String(t);
    var m = s.match(/\s[A-ZÀ-Þ][a-zà-ÿ]{2,}/g) || [];
    var set = {};
    m.forEach(function (x) { set[x.trim().toLowerCase()] = 1; });
    return Object.keys(set);
  }

  function countRe(re, t) {
    var m = String(t).match(re);
    return m ? m.length : 0;
  }

  function jaccard(a, b) {
    var sa = {}, sb = {};
    a.forEach(function (x) { sa[x] = 1; });
    b.forEach(function (x) { sb[x] = 1; });
    var inter = 0;
    for (var k in sa) if (sb[k]) inter++;
    var union = Object.keys(sa).length + Object.keys(sb).length - inter;
    return union ? inter / union : 1;
  }

  function checkNumbers(orig, rev) {
    var a = numberTokens(orig), b = numberTokens(rev);
    var counts = {};
    a.forEach(function (x) { counts[x] = (counts[x] || 0) + 1; });
    b.forEach(function (x) { counts[x] = (counts[x] || 0) - 1; });
    var missing = Object.keys(counts).filter(function (k) { return counts[k] > 0; });
    if (missing.length) {
      return { check: "numbers", detail: missing.length + " angka asli tidak identik byte (" + missing.slice(0, 3).join(", ") + ")." };
    }
    return null;
  }

  function checkCitations(orig, rev) {
    var a = citeTokens(orig);
    if (!a.length) return null;
    var rl = String(rev);
    var missing = a.filter(function (c) { return rl.indexOf(c) === -1 && rl.toLowerCase().indexOf(c.toLowerCase()) === -1; });
    if (missing.length) {
      return { check: "citations", detail: missing.length + " sitasi asli tidak terbawa (" + missing.slice(0, 2).join("; ") + ")." };
    }
    return null;
  }

  function checkDoiUrl(orig, rev) {
    var a = doiUrlTokens(orig);
    if (!a.length) return null;
    var rl = String(rev);
    var missing = a.filter(function (u) { return rl.indexOf(u) === -1; });
    if (missing.length) {
      return { check: "doi-url", detail: missing.length + " DOI/URL asli berubah/hilang — harus byte-identik." };
    }
    return null;
  }

  function checkProtected(orig, rev) {
    var a = quotedSpans(orig);
    if (!a.length) return null;
    var rl = String(rev);
    var missing = a.filter(function (q) { return rl.indexOf(q) === -1; });
    if (missing.length) {
      return { check: "protected", detail: missing.length + " kutipan langsung berubah — kutipan harus dipertahankan." };
    }
    return null;
  }

  function checkTerminology(orig, rev) {
    var a = properNouns(orig);
    if (a.length < 2) return null;
    var b = {};
    properNouns(rev).forEach(function (x) { b[x] = 1; });
    var kept = a.filter(function (x) { return b[x]; }).length;
    if (kept / a.length < 0.7) {
      return { check: "terminology", detail: "hanya " + kept + "/" + a.length + " istilah/nama asli terbawa — istilah tidak boleh diubah." };
    }
    return null;
  }

  function checkMeaning(orig, rev) {
    var j = jaccard(tokensLower(orig), tokensLower(rev));
    if (j < 0.45) {
      return { check: "meaning", detail: "kesamaan kata Jaccard " + j.toFixed(2) + " < 0,45 — makna kemungkinan bergeser, perlu ditinjau." };
    }
    return null;
  }

  function checkCausality(orig, rev) {
    var negRe = /\b(tidak|bukan|jangan|tanpa|belum|tak|non|kurang)\b/gi;
    var a = countRe(negRe, orig), b = countRe(negRe, rev);
    if (a !== b) {
      return { check: "causality", detail: "penanda negasi berubah " + a + " → " + b + " — arah sebab-akibat perlu ditinjau." };
    }
    return null;
  }

  function checkHedge(orig, rev) {
    var hedgeRe = /\b(mungkin|kemungkinan|dapat|cenderung|relatif|kira-kira|seolah|tampaknya|diperkirakan)\b/gi;
    var a = countRe(hedgeRe, orig), b = countRe(hedgeRe, rev);
    if (a > 0 && b === 0) {
      return { check: "uncertainty", detail: "ketidakpastian (" + a + " penanda) hilang semua — versi baru terdengar overclaim, perlu ditinjau." };
    }
    return null;
  }

  function checkRelevance(orig, rev) {
    var a = {}, b = tokensLower(rev);
    if (!b.length) return { check: "relevance", detail: "teks baru kosong." };
    tokensLower(orig).forEach(function (x) { a[x] = 1; });
    var fresh = b.filter(function (x) { return !a[x]; }).length;
    if (fresh / b.length > 0.4) {
      return { check: "relevance", detail: Math.round(fresh / b.length * 100) + "% kata baru tidak ada di asli — kemungkinan tambahan tak relevan/karangan." };
    }
    return null;
  }

  // Regression: butuh skor detector yang sama (rev > orig + 10 → tolak).
  function checkRegression(orig, rev, opts) {
    var o = opts || {};
    if (typeof o.origScore !== "number" || typeof o.revScore !== "number") return null;
    if (o.revScore > o.origScore + 10) {
      return { check: "regression", detail: "skor indikasi naik " + o.origScore + " → " + o.revScore + " (pola generatif bertambah) — kembalikan ke asli." };
    }
    return null;
  }

  function validate(original, revised, opts) {
    var orig = String(original == null ? "" : original);
    var rev = String(revised == null ? "" : revised);
    var fails = [];
    var checks = [
      checkNumbers(orig, rev),
      checkCitations(orig, rev),
      checkDoiUrl(orig, rev),
      checkProtected(orig, rev),
      checkTerminology(orig, rev),
      checkMeaning(orig, rev),
      checkCausality(orig, rev),
      checkHedge(orig, rev),
      checkRelevance(orig, rev),
      checkRegression(orig, rev, opts)
    ];
    checks.forEach(function (f) { if (f) fails.push(f); });
    return { pass: fails.length === 0, fails: fails };
  }

  global.FarazValidate = {
    validate: validate,
    checks: {
      numbers: checkNumbers,
      citations: checkCitations,
      doiUrl: checkDoiUrl,
      protected: checkProtected,
      terminology: checkTerminology,
      meaning: checkMeaning,
      causality: checkCausality,
      uncertainty: checkHedge,
      relevance: checkRelevance,
      regression: checkRegression
    }
  };
})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this);
