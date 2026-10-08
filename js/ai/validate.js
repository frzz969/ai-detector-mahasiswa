// FarazValidate — 10 checks murni untuk gerbang kualitas.
// Aturan: validation-rules §4; humanizer-rules (fakta/angka/sitasi tetap).
// Pure, tanpa DOM/fetch. Bahasa indikasi.
//
// KONTEKS RINGKASAN: kandidat dengan rasio token < SUMMARY_RATIO (0,45)
// diperlakukan sebagai ringkasan, bukan rewrite.
// Yang TIDAK dilonggarkan: angka, sitasi, DOI, kutipan, penambahan negasi.
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
    var m;
    var re1 = /\[\d+(\s*[-–,]\s*\d+)*\]/g;

    while ((m = re1.exec(s))) {
      out.push(m[0]);
    }

    var re2 = /\([A-Z][a-z]+(?: et al\.)?,?\s?\d{4}[a-z]?\)/g;

    while ((m = re2.exec(s))) {
      out.push(m[0]);
    }

    var re3 = /\bet al\./gi;

    while ((m = re3.exec(s))) {
      out.push(m[0].toLowerCase());
    }

    return out;
  }

  function doiUrlTokens(t) {
    var s = String(t);
    var out = [];
    var m;
    var re1 = /https?:\/\/\S+/gi;

    while ((m = re1.exec(s))) {
      out.push(m[0]);
    }

    var re2 = /\bDOI:\S+/gi;

    while ((m = re2.exec(s))) {
      out.push(m[0]);
    }

    return out;
  }

  function quotedSpans(t) {
    var s = String(t);
    var out = [];
    var m;
    var re = /"[^"]+"|“[^”]+”|'[^']{4,}'/g;

    while ((m = re.exec(s))) {
      out.push(m[0]);
    }

    return out;
  }

  // Kata yang boleh berkapital HANYA karena awal kalimat/daftar/subjudul.
  // Kalau masuk daftar ini, TIDAK dihitung sebagai istilah.
  var CAP_FUNCTION_WORDS = [
    // Penghubung & kata tugas.
    "yang", "dan", "atau", "tetapi", "namun", "sehingga", "karena", "untuk",
    "dari", "pada", "dalam", "dengan", "sebagai", "oleh", "tentang", "antara",
    "adalah", "yaitu", "bahwa", "ini", "itu", "mereka", "kita", "kamu",
    "akan", "dapat", "sudah", "masih", "juga", "hanya", "seperti", "tidak",
    "bukan", "telah", "harus", "boleh", "mulai", "selama", "ketika",
    "setelah", "sebelum", "melalui", "berdasarkan", "umumnya", "biasanya",
    "selain", "kemudian", "serta", "hingga", "sampai", "bagi",
    // Kata isi generik: sah kapital terus tapi bukan istilah yang dilindungi.
    "kelinci", "hewan", "spesies", "mamalia", "tumbuhan", "manusia",
    "sistem", "proses", "kondisi", "hasil", "penelitian", "peran", "role"
  ];

  var CAP_FUNCTION_SET = null;

  function capStopSet() {
    if (!CAP_FUNCTION_SET) {
      CAP_FUNCTION_SET = {};

      CAP_FUNCTION_WORDS.forEach(function (w) {
        CAP_FUNCTION_SET[w] = 1;
      });
    }

    return CAP_FUNCTION_SET;
  }

  // Pecah teks jadi token + tandai batas kalimat.
  // Aturan: validation-rules §4 — penghitungan istilah harus benar dulu.
  var WORD_RE = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;

  function tokenizeWithSentences(text) {
    var s = String(text == null ? "" : text);
    var toks = [];
    var sentStart = [];
    var fresh = true;
    var m;

    // Pemisah kalimat: titik/tanda tanya + spasi, atau baris baru.
    var re = /([^.!?\n]*)([.!?\n]+|\s*$)/g;
    var guard = 0;

    while ((m = re.exec(s)) !== null && guard++ < 10000) {
      var chunk = m[1];

      if (chunk.trim()) {
        var local = chunk.match(WORD_RE);

        if (local) {
          for (var k = 0; k < local.length; k++) {
            toks.push(local[k]);
            sentStart.push(fresh && k === 0);
          }

          fresh = false;
        }
      }

      if (m[2]) {
        fresh = true;
      }

      if (m[0] === "") {
        re.lastIndex++;
      }
    }

    return { toks: toks, sentStart: sentStart };
  }

  // Istilah = kata yang (a) tak pernah huruf kecil, (b) kapital bukan cuma
  // karena awal kalimat, (c) muncul minimal sekali di TENGAH kalimat.
  function properNouns(t) {
    var tk = tokenizeWithSentences(t);
    var toks = tk.toks;
    var sentStart = tk.sentStart;

    if (!toks.length) {
      return [];
    }

    var stop = capStopSet();
    var i;
    var key;
    var lowerSeen = {};
    var capMid = {};
    var capAny = {};

    for (i = 0; i < toks.length; i++) {
      key = toks[i].toLowerCase();

      if (!/^\p{Lu}/u.test(toks[i])) {
        lowerSeen[key] = 1;
        continue;
      }

      capAny[key] = 1;

      if (!sentStart[i]) {
        capMid[key] = 1;
      }
    }

    var set = {};
    var used = new Array(toks.length);

    for (i = 0; i < toks.length; i++) {
      used[i] = false;
    }

    for (i = 0; i < toks.length; i++) {
      if (used[i]) {
        continue;
      }

      key = toks[i].toLowerCase();

      if (key.length < 3) {
        continue;
      }

      if (stop[key]) {
        continue;
      }

      if (lowerSeen[key]) {
        continue;
      }

      if (!capMid[key]) {
        continue;
      }

      var phrase = key;

      // Binomial/nama majemuk: dua token kapital berurutan DALAM kalimat sama.
      if (i + 1 < toks.length && !used[i + 1] && !sentStart[i + 1]) {
        var key2 = toks[i + 1].toLowerCase();

        if (
          /^\p{Lu}/u.test(toks[i + 1]) &&
          key2.length >= 3 &&
          !stop[key2] &&
          !lowerSeen[key2] &&
          capMid[key2]
        ) {
          phrase = key + " " + key2;
          used[i + 1] = true;
        }
      }

      used[i] = true;
      set[phrase] = 1;
    }

    void capAny;

    return Object.keys(set);
  }

  function countRe(re, t) {
    var m = String(t).match(re);
    return m ? m.length : 0;
  }

  function jaccard(a, b) {
    var sa = {};
    var sb = {};

    a.forEach(function (x) { sa[x] = 1; });
    b.forEach(function (x) { sb[x] = 1; });

    var inter = 0;

    for (var k in sa) {
      if (sb[k]) {
        inter++;
      }
    }

    var union = Object.keys(sa).length + Object.keys(sb).length - inter;

    return union ? inter / union : 1;
  }

  function checkNumbers(orig, rev) {
    var a = numberTokens(orig);
    var b = numberTokens(rev);
    var counts = {};

    a.forEach(function (x) { counts[x] = (counts[x] || 0) + 1; });
    b.forEach(function (x) { counts[x] = (counts[x] || 0) - 1; });

    var missing = Object.keys(counts).filter(function (k) {
      return counts[k] > 0;
    });

    if (missing.length) {
      return {
        check: "numbers",
        detail: missing.length + " angka asli tidak identik byte (" +
          missing.slice(0, 3).join(", ") + ")."
      };
    }

    return null;
  }

  function checkCitations(orig, rev) {
    var a = citeTokens(orig);

    if (!a.length) {
      return null;
    }

    var rl = String(rev);
    var missing = a.filter(function (c) {
      return rl.indexOf(c) === -1 &&
        rl.toLowerCase().indexOf(c.toLowerCase()) === -1;
    });

    if (missing.length) {
      return {
        check: "citations",
        detail: missing.length + " sitasi asli tidak terbawa (" +
          missing.slice(0, 2).join("; ") + ")."
      };
    }

    return null;
  }

  function checkDoiUrl(orig, rev) {
    var a = doiUrlTokens(orig);

    if (!a.length) {
      return null;
    }

    var rl = String(rev);
    var missing = a.filter(function (u) { return rl.indexOf(u) === -1; });

    if (missing.length) {
      return {
        check: "doi-url",
        detail: missing.length + " DOI/URL asli berubah/hilang — harus byte-identik."
      };
    }

    return null;
  }

  function checkProtected(orig, rev) {
    var a = quotedSpans(orig);

    if (!a.length) {
      return null;
    }

    var rl = String(rev);
    var missing = a.filter(function (q) { return rl.indexOf(q) === -1; });

    if (missing.length) {
      return {
        check: "protected",
        detail: missing.length + " kutipan langsung berubah" +
          " — kutipan harus dipertahankan."
      };
    }

    return null;
  }

  // Rasio istilah minimal. Rewrite wajib 0,7; ringkasan boleh 0,3.
  var TERM_MIN_REWRITE = 0.7;
  var TERM_MIN_SUMMARY = 0.3;

  function checkTerminology(orig, rev) {
    var a = properNouns(orig);

    // Guard: < 2 istilah = tidak ada yang bisa diverifikasi.
    if (a.length < 2) {
      return null;
    }

    var b = {};

    properNouns(rev).forEach(function (x) { b[x] = 1; });

    var kept = a.filter(function (x) { return b[x]; }).length;
    var ratio = kept / a.length;
    var min = isSummaryLike(orig, rev) ? TERM_MIN_SUMMARY : TERM_MIN_REWRITE;

    if (ratio < min) {
      return {
        check: "terminology",
        detail: "hanya " + kept + "/" + a.length +
          " istilah/nama asli terbawa — istilah tidak boleh diubah."
      };
    }

    return null;
  }

  // Konteks ringkasan: kandidat jauh lebih pendek dari asli.
  var SUMMARY_RATIO = 0.45;
  var SUMMARY_MIN = 0.12;
  var REWRITE_MIN = 0.45;
  var SUMMARY_RELEVANCE = 0.5;

  function isSummaryLike(orig, rev) {
    var o = tokensLower(orig);
    var r = tokensLower(rev);

    if (!o.length || !r.length) {
      return false;
    }

    if (r.length >= o.length) {
      return false;
    }

    return (r.length / o.length) < SUMMARY_RATIO;
  }

  function checkMeaning(orig, rev) {
    var j = jaccard(tokensLower(orig), tokensLower(rev));
    var min = isSummaryLike(orig, rev) ? SUMMARY_MIN : REWRITE_MIN;

    if (j < min) {
      return {
        check: "meaning",
        detail: "kesamaan kata Jaccard " + j.toFixed(2) + " < " + min.toFixed(2) +
          " — makna kemungkinan bergeser, perlu ditinjau."
      };
    }

    return null;
  }

  function checkCausality(orig, rev) {
    var negRe = /\b(tidak|bukan|jangan|tanpa|belum|tak|non|kurang)\b/gi;
    var a = countRe(negRe, orig);
    var b = countRe(negRe, rev);

    // Ringkasan: negasi boleh BERKURANG (kompresi isi). Yang ditolak:
    // ringkasan yang MENAMBAH negasi tak ada di asli.
    if (isSummaryLike(orig, rev)) {
      if (b > a) {
        return {
          check: "causality",
          detail: "ringkasan menambah penanda negasi (" + a + " → " + b + ")" +
            " yang tidak ada di teks asli — arah sebab-akibat perlu ditinjau."
        };
      }

      return null;
    }

    if (a !== b) {
      return {
        check: "causality",
        detail: "penanda negasi berubah " + a + " → " + b +
          " — arah sebab-akibat perlu ditinjau."
      };
    }

    return null;
  }

  function checkHedge(orig, rev) {
    var hedgeRe = /\b(mungkin|kemungkinan|dapat|cenderung|relatif|kira-kira|seolah|tampaknya|diperkirakan)\b/gi;
    var a = countRe(hedgeRe, orig);
    var b = countRe(hedgeRe, rev);

    if (a > 0 && b === 0) {
      // Ringkasan: kalimat ber-hedge boleh dibuang (kompresi isi).
      if (isSummaryLike(orig, rev)) {
        return null;
      }

      return {
        check: "uncertainty",
        detail: "ketidakpastian (" + a + " penanda) hilang semua" +
          " — versi baru terdengar overclaim, perlu ditinjau."
      };
    }

    return null;
  }

  // Kata fungsi bukan bukti karangan: ringkasan wajar memakai penghubung baru.
  var LINK_WORDS = {
    "yang": 1, "dan": 1, "atau": 1, "tetapi": 1, "namun": 1, "sehingga": 1,
    "karena": 1, "untuk": 1, "dari": 1, "pada": 1, "dalam": 1, "dengan": 1,
    "sebagai": 1, "oleh": 1, "tentang": 1, "antara": 1, "adalah": 1,
    "yaitu": 1, "bahwa": 1, "ini": 1, "itu": 1, "akan": 1, "dapat": 1,
    "sudah": 1, "masih": 1, "juga": 1, "hanya": 1, "seperti": 1, "tidak": 1,
    "bukan": 1, "telah": 1, "harus": 1, "boleh": 1, "mulai": 1, "selama": 1,
    "ketika": 1, "setelah": 1, "sebelum": 1, "melalui": 1, "berdasarkan": 1,
    "umumnya": 1, "biasanya": 1, "selain": 1, "kemudian": 1, "serta": 1,
    "hingga": 1, "sampai": 1, "bagi": 1, "agar": 1, "ke": 1,
    "di": 1, "pun": 1, "saja": 1
  };

  function checkRelevance(orig, rev) {
    var a = {};
    var b = tokensLower(rev);

    if (!b.length) {
      return { check: "relevance", detail: "teks baru kosong." };
    }

    tokensLower(orig).forEach(function (x) { a[x] = 1; });

    var summaryLike = isSummaryLike(orig, rev);
    var freshAll = b.filter(function (x) { return !a[x]; });

    // Ringkasan: hanya kata ISI baru yang diawasi (penghubung diabaikan).
    if (summaryLike) {
      var freshContent = freshAll.filter(function (x) {
        return !LINK_WORDS[x] && x.length >= 4;
      });

      if (freshContent.length / b.length > SUMMARY_RELEVANCE) {
        return {
          check: "relevance",
          detail: Math.round(freshContent.length / b.length * 100) +
            "% kata isi baru tidak ada di asli" +
            " — kemungkinan tambahan tak relevan/karangan."
        };
      }

      return null;
    }

    if (freshAll.length / b.length > 0.4) {
      return {
        check: "relevance",
        detail: Math.round(freshAll.length / b.length * 100) +
          "% kata baru tidak ada di asli" +
          " — kemungkinan tambahan tak relevan/karangan."
      };
    }

    return null;
  }

  // Regression: rev > orig + 10 → tolak.
  function checkRegression(orig, rev, opts) {
    var o = opts || {};

    if (typeof o.origScore !== "number" || typeof o.revScore !== "number") {
      return null;
    }

    if (o.revScore > o.origScore + 10) {
      return {
        check: "regression",
        detail: "skor indikasi naik " + o.origScore + " → " + o.revScore +
          " (pola generatif bertambah) — kembalikan ke asli."
      };
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

    checks.forEach(function (f) {
      if (f) {
        fails.push(f);
      }
    });

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
})(
  typeof globalThis !== "undefined"
    ? globalThis
    : typeof window !== "undefined"
      ? window
      : this
);
