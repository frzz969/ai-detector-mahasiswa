// FarazSummarize — ringkasan EKSTRAKTIF LOKAL (fallback, tanpa AI key).
// Aturan: humanizer-rules §4 (verbatim, tanpa karangan); validation-rules §4-§5.
//
// Peran: FALLBACK. Jalur utama adalah /api/summarize (abstractive).
// Dipakai bila AI tak tersedia atau ditolak validasi.
//
// Pipeline (tetap EKSTRAKTIF, tanpa paraphrase):
//   SEGMENTASI > KANDIDAT > SKOR > FILTER redundansi (MMR) >
//   SWAP yatim > TOP-K > URUTAN ASLI.
// Output selalu kalimat verbatim, urutan posisi asli.
(function (global) {
  "use strict";

  var MAX_KEEP = 5;
  var MIN_KEEP = 2;

  // Penanda kalimat generik: pernyataan umum tanpa angka/entitas → skor turun.
  var GENERIC_PHRASES = [
    "salah satu", "memang", "cukup", "dekat", "umumnya", "terlihat",
    "tampak", "dapat dikatakan", "tidak sedikit", "bagi banyak", "bagi kita"
  ];

  var GENERIC_WORDS = [
    "umum", "umumnya", "sering", "kadang", "banyak", "beberapa", "salah",
    "seperti", "memang", "cukup", "dekat", "juga", "para", "hal", "kita",
    "mereka", "jadi", "terbanyak", "umumnya"
  ];

  var NUM_UNIT_RE = /\d+(?:[.,]\d+)?\s*(?:%|persen|gram|kg|mg|ml|cc|ton|cm|mm|hari|bulan|tahun|minggu|jam|hektar|orang|ekor|unit|item|rupiah)?/i;
  var PROPER_RE = /\b(\p{Lu}\p{Ll}{2,}(?:\s+\p{Lu}\p{Ll}{2,}){0,2})\b/gu;

  function getSents(text) {
    // Markdown dibersihkan dulu — ekstraktif tampil teks polos.
    try {
      if (typeof stripMarkdown === "function") {
        text = stripMarkdown(String(text));
      }
    } catch (_) {}

    if (typeof splitSentences === "function") {
      try {
        var s = splitSentences(text);

        if (s && s.length) {
          return s;
        }
      } catch (_) {}
    }

    var norm = String(text).replace(/\s+/g, " ").trim();

    if (!norm) {
      return [];
    }

    return (norm.match(/[^.!?]+[.!?]+["”’']?|\S.+$/g) || [norm])
      .map(function (x) { return x.trim(); })
      .filter(function (x) { return x.split(/\s+/).length > 3; });
  }

  function countW(s) {
    if (typeof countWords === "function") {
      try {
        return countWords(s);
      } catch (_) {}
    }

    return (String(s).trim().match(/[\p{L}\p{N}']+/gu) || []).length;
  }

  // Kata isi: panjang >= 4, bukan function word.
  function contentTokens(s) {
    var toks = (String(s).toLowerCase().match(/[\p{L}\p{N}']+/gu) || []);
    var hasId = typeof ID_FW !== "undefined" &&
      ID_FW &&
      typeof ID_FW.has === "function";
    var hasEn = typeof EN_FW !== "undefined" &&
      EN_FW &&
      typeof EN_FW.has === "function";

    return toks.filter(function (t) {
      if (t.length < 4) {
        return false;
      }

      if (hasId && ID_FW.has(t)) {
        return false;
      }

      if (hasEn && EN_FW.has(t)) {
        return false;
      }

      return true;
    });
  }

  // Jaccard kemiripan (pola validator): > 0,7 = near-duplikat.
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

  // Pecah satu paragraf jadi kalimat.
  function splitPara(p) {
    try {
      if (typeof splitSentences === "function") {
        var s = splitSentences(p);

        if (s && s.length) {
          return s;
        }
      }
    } catch (_) {}

    var norm = String(p).replace(/\s+/g, " ").trim();

    if (!norm) {
      return [];
    }

    return (norm.match(/[^.!?]+[.!?]+["”’']?|\S.+$/g) || [norm])
      .map(function (x) { return x.trim(); })
      .filter(function (x) { return x.split(/\s+/).length > 3; });
  }

  // Paragraf asal tiap kalimat (cakupan lintas bagian).
  function paraOfSents(text, sents) {
    var zeros = sents.map(function () { return 0; });

    try {
      var clean = String(text);

      if (typeof stripMarkdown === "function") {
        clean = stripMarkdown(clean);
      }

      var paras = clean
        .split(/\n\s*\n/)
        .map(function (p) { return p.trim(); })
        .filter(Boolean);

      if (paras.length < 2) {
        return zeros;
      }

      var counts = paras.map(function (p) { return splitPara(p).length; });
      var total = 0;
      var ci;

      for (ci = 0; ci < counts.length; ci++) {
        total += counts[ci];
      }

      if (total !== sents.length) {
        return zeros;
      }

      var out = [];
      var pi = 0;
      var left = counts[0];

      sents.forEach(function () {
        out.push(pi);
        left--;

        if (left <= 0 && pi < counts.length - 1) {
          pi++;
          left = counts[pi];
        }
      });

      return out;
    } catch (_) {
      return zeros;
    }
  }

  // Entitas ringkas: angka+satuan + nama proper.
  function entityTokens(s, lowerSet) {
    var out = [];
    var str = String(s == null ? "" : s);
    var m;

    NUM_UNIT_RE.lastIndex = 0;

    while ((m = NUM_UNIT_RE.exec(str))) {
      if (m[0].length > 1) {
        out.push(m[0].toLowerCase());
      }
    }

    PROPER_RE.lastIndex = 0;

    while ((m = PROPER_RE.exec(str))) {
      var low = m[1].toLowerCase();

      if (!lowerSet || !lowerSet[low]) {
        out.push(low);
      }
    }

    return out;
  }

  // Generik? Kalimat berisi pernyataan umum tanpa angka/entitas.
  function genericness(s, ctx) {
    var c = ctx || {};
    var topicSet = c.topicSet || {};
    var lowerSet = c.lowerSet || {};
    var df = c.df || {};
    var str = String(s == null ? "" : s);
    var low = " " + str.toLowerCase() + " ";
    var toks = contentTokens(str);
    var uniq = {};

    toks.forEach(function (t) { uniq[t] = 1; });

    // 1) Penanda pernyataan umum.
    var hits = 0;

    GENERIC_PHRASES.forEach(function (p) {
      if (low.indexOf(p) !== -1) {
        hits++;
      }
    });

    GENERIC_WORDS.forEach(function (w) {
      if (new RegExp("\\b" + w + "\\b", "i").test(low)) {
        hits++;
      }
    });

    // 2) Isi pengisi: porsi kalimat yang cuma topik + kata umum.
    var filler = 0;

    toks.forEach(function (t) {
      if (topicSet[t] || GENERIC_WORDS.indexOf(t) !== -1) {
        filler++;
      }
    });

    var fillerRatio = toks.length ? filler / toks.length : 0;

    // 3) Bukti konkret: angka, nama proper, atau istilah distinctive.
    var ents = entityTokens(str, lowerSet);
    var distinctive = 0;

    toks.forEach(function (t) {
      if ((df[t] || 0) <= 2 && !topicSet[t] && GENERIC_WORDS.indexOf(t) === -1) {
        distinctive++;
      }
    });

    var hasNumber = /\d/.test(str);
    var noEvidence = (!hasNumber && ents.length === 0) ? 1 : 0;
    var marker = Math.min(1, Math.max(0, hits - 2) / 4);
    var score = Math.min(1, 0.6 * marker + 0.4 * noEvidence);
    var uniqRatio = toks.length
      ? Object.keys(uniq).length / toks.length
      : 0;

    if (uniqRatio < 0.75) {
      // Kalimat repetitif.
      score = Math.min(1, score + 0.2);
    }

    return {
      score: Math.round(score * 100) / 100,
      markers: hits,
      fillerRatio: Math.round(fillerRatio * 100) / 100,
      entities: ents,
      distinctive: distinctive,
      hasNumber: hasNumber,
      uniqRatio: Math.round(uniqRatio * 100) / 100
    };
  }

  // Konjungsi adversatif/kausal kuat: kalimat yatim bila disalin utuh.
  // Penalti besar agar tenggelam kecuali tak ada kandidat lain.
  var ORPHAN_STRONG = [
    "namun", "tetapi", "sedangkan", "sedangkanpun", "namun demikian",
    "oleh karena itu", "karena itu", "dengan demikian", "oleh sebab itu",
    "akan tetapi", "melainkan", "sebaliknya", "sehingga", "maka dari itu"
  ];

  // Penanda ketergantungan lain, penalti sedang.
  var ORPHAN_LEADERS = [
    "selain itu", "selain", "menurut", "hal ini", "keadaan ini",
    "hal tersebut", "keadaan tersebut", "hal itu", "keadaan itu",
    "diketahui bahwa", "terlihat bahwa", "tampak bahwa",
    "ternyata", "sebab", "masih", "kemudian"
  ];

  // Kata ganti penunjuk sebagai kata kedua ("Hewan ini ...").
  var ORPHAN_PRONOUNS = ["ini", "itu", "tersebut"];

  // Penalti 0..0,95. Tidak menggeser kata pembuka (jaga verbatim).
  function orphanPenalty(sent) {
    var str = String(sent == null ? "" : sent);
    var body = str.replace(/^[^A-Za-zÀ-Þ]+/, "").toLowerCase();

    // Bandingkan per kata PADA AWAL kalimat saja.
    var words = body
      .split(/[^a-zÀ-ÞĀ-ſ]+/)
      .filter(Boolean);

    // 3 kata pertama: frasa penanda multi-kata harus dicocokkan utuh.
    var head = words.slice(0, 3).join(" ");
    var p = 0;

    var hit = function (list) {
      for (var k = 0; k < list.length; k++) {
        if (head === list[k] || head.indexOf(list[k] + " ") === 0) {
          return true;
        }
      }

      return false;
    };

    if (hit(ORPHAN_STRONG)) {
      p = 0.95;
    }

    if (!p && hit(ORPHAN_LEADERS)) {
      p = 0.55;
    }

    // "hewan ini", "proses tersebut" → subjek tak bermakna sendiri.
    if (!p && words.length >= 2 && ORPHAN_PRONOUNS.indexOf(words[1]) !== -1) {
      p = 0.7;
    }

    return Math.round(p * 100) / 100;
  }

  // Skor tiap kalimat (diekspor untuk audit + regression test).
  function scoreSentences(text) {
    var sents = getSents(text);

    if (!sents.length) {
      return [];
    }

    var toksPer = sents.map(function (s) { return contentTokens(s); });
    var n = sents.length;
    var df = {};
    var lowerSet = {};
    var i;
    var j;

    for (i = 0; i < n; i++) {
      for (j = 0; j < toksPer[i].length; j++) {
        var t = toksPer[i][j];
        df[t] = (df[t] || 0) + 1;
      }

      // lowerSet = kata yang SENGAJA huruf kecil (tanpa flag i).
      var mLow;
      var reLow = /[a-zà-ÿ]{4,}/g;

      while ((mLow = reLow.exec(sents[i]))) {
        lowerSet[mLow[0]] = 1;
      }
    }

    // Topik = token paling sering (isi utama).
    var topicSet = {};

    Object.keys(df)
      .sort(function (a, b) { return (df[b] - df[a]) || (a < b ? -1 : 1); })
      .slice(0, 3)
      .forEach(function (t) { topicSet[t] = 1; });

    var ctx = { df: df, lowerSet: lowerSet, topicSet: topicSet };
    var raw = [];

    for (i = 0; i < n; i++) {
      var toks = toksPer[i];
      var tfidf = 0;
      var distinctive = 0;

      for (j = 0; j < toks.length; j++) {
        var f = df[toks[j]] || 0;
        tfidf += f * Math.log(1 + n / (1 + f));

        if (f <= 2) {
          distinctive++;
        }
      }

      var topic = toks.length ? tfidf / toks.length : 0;

      // Kepadatan info = porsi isi yang distinctive (bukan sekadar unik).
      var dens = toks.length ? distinctive / toks.length : 0;
      var g = genericness(sents[i], ctx);
      var ents = g.entities.length;
      var wl = countW(sents[i]);

      raw.push({
        i: i,
        topic: topic,
        density: dens,
        entity: ents,
        words: wl,
        generic: g,
        sent: sents[i]
      });
    }

    var maxTopic = 0;
    var maxDens = 0;

    raw.forEach(function (r) {
      if (r.topic > maxTopic) {
        maxTopic = r.topic;
      }

      if (r.density > maxDens) {
        maxDens = r.density;
      }
    });

    return raw.map(function (r) {
      var topic = maxTopic > 0 ? r.topic / maxTopic : 0;
      var density = maxDens > 0 ? r.density / maxDens : 0;
      var entity = Math.min(1, r.entity / 2);

      // Posisi: pembuka/penutup tetap ada (konteks), bukan dominan.
      var position = 0;

      if (r.i === 0) {
        position = 0.25;
      } else if (r.i === n - 1) {
        position = 0.18;
      } else if (r.i === 1) {
        position = 0.08;
      }

      var generic = r.generic.score;
      var penal = (r.words < 6 || r.words > 40) ? 0.15 : 0;
      var orphan = orphanPenalty(r.sent);
      var total = 0.34 * topic +
        0.22 * density +
        0.16 * entity +
        0.10 * position -
        0.34 * generic -
        penal -
        orphan;

      return {
        i: r.i,
        sent: r.sent,
        parts: {
          topic: Math.round(topic * 100) / 100,
          density: Math.round(density * 100) / 100,
          entity: Math.round(entity * 100) / 100,
          position: position,
          generic: generic,
          filler: r.generic.fillerRatio,
          evidence: r.generic.entities.length +
            r.generic.distinctive +
            (r.generic.hasNumber ? 1 : 0),
          penalty: penal,
          orphan: orphan
        },
        generic: generic,
        total: Math.round(total * 1000) / 1000
      };
    });
  }

  // Normalisasi untuk cek verbatim: spasi rapi, isi & tanda baca utuh.
  function normForCheck(t) {
    return String(t == null ? "" : t).replace(/\s+/g, " ").trim();
  }

  // verifyExtractive(text, sentences) → null bila OK.
  function verifyExtractive(text, sentences) {
    var src = normForCheck(text);

    if (!Array.isArray(sentences) || !sentences.length) {
      return { check: "extractive", detail: "tidak ada kalimat ringkasan." };
    }

    var seen = {};

    for (var i = 0; i < sentences.length; i++) {
      var s = normForCheck(sentences[i]);

      if (!s) {
        return {
          check: "extractive",
          detail: "kalimat " + (i + 1) + " kosong."
        };
      }

      if (src.indexOf(s) === -1) {
        return {
          check: "extractive",
          detail: "kalimat " + (i + 1) +
            " bukan substring verbatim dari teks input."
        };
      }

      var key = s.toLowerCase();

      if (seen[key]) {
        return {
          check: "extractive",
          detail: "kalimat " + (i + 1) + " duplikat."
        };
      }

      seen[key] = 1;
    }

    return null;
  }

  // summarize(text, opts{max}) → kalimat ASLI verbatim dalam urutan naskah.
  function summarize(text, opts) {
    var o = opts || {};
    var maxKeep = typeof o.max === "number"
      ? Math.max(MIN_KEEP, Math.min(MAX_KEEP, Math.round(o.max)))
      : MAX_KEEP;
    var sents = getSents(text);

    if (!sents.length) {
      return {
        sentences: [],
        picked: [],
        method: "ringkasan ekstraktif:" +
          " teks kosong — tidak ada kalimat untuk diringkas."
      };
    }

    if (sents.length <= 3) {
      return {
        sentences: sents.slice(),
        picked: sents.map(function (_, i) { return i; }),
        method: "ringkasan ekstraktif: teks hanya " + sents.length +
          " kalimat — ditampilkan utuh, tanpa ubah fakta."
      };
    }

    var scored = scoreSentences(text);
    var sets = scored.map(function (e) {
      var s = {};

      contentTokens(e.sent).forEach(function (t) { s[t] = 1; });

      return Object.keys(s);
    });
    var ranked = scored.slice().sort(function (a, b) {
      return (b.total - a.total) || (a.i - b.i);
    });

    // Cakupan proporsional antar paragraf (anti hanya dari pembuka).
    var paraOf = paraOfSents(text, sents);
    var distinctParas = {};

    paraOf.forEach(function (p) { distinctParas[p] = 1; });

    var paraTotal = Object.keys(distinctParas).length;
    var useParaCap = paraTotal > 1 && sents.length > 6;

    // keep ~1 per 5 kalimat, minimal 3 bila teks panjang.
    var keep = Math.max(
      sents.length >= 10 ? 3 : MIN_KEEP,
      Math.min(maxKeep, Math.round(sents.length / 5))
    );

    if (useParaCap && keep > paraTotal) {
      keep = paraTotal;
    }

    if (keep < MIN_KEEP) {
      keep = MIN_KEEP;
    }

    var picked = [];
    var paraCount = {};

    function maxSim(i) {
      var worst = 0;

      for (var k = 0; k < picked.length; k++) {
        var j = picked[k];
        var sim = sets[i].length && sets[j].length
          ? jaccard(sets[i], sets[j])
          : 0;

        if (sim > worst) {
          worst = sim;
        }
      }

      return worst;
    }

    function tryPass(withCap) {
      ranked.forEach(function (e) {
        if (picked.length >= keep) {
          return;
        }

        if (picked.indexOf(e.i) !== -1) {
          return;
        }

        // Near-duplikat.
        if (maxSim(e.i) > 0.7) {
          return;
        }

        if (withCap && useParaCap) {
          var pc = paraCount[paraOf[e.i]] || 0;

          // Maksimal 1 per paragraf.
          if (pc >= 1) {
            return;
          }
        }

        picked.push(e.i);
        paraCount[paraOf[e.i]] = (paraCount[paraOf[e.i]] || 0) + 1;
      });
    }

    tryPass(true);

    // Longgarkan cap paragraf, dedupe tetap.
    if (picked.length < keep) {
      tryPass(false);
    }

    // Perbaikan kalimat bergantung: tukar dengan kandidat mandiri.
    if (useParaCap) {
      for (var oi = 0; oi < picked.length; oi++) {
        var oIdx = picked[oi];
        var oEntry = scored[oIdx];

        if (!oEntry || !oEntry.parts.orphan) {
          continue;
        }

        var samePara = ranked.filter(function (e) {
          return e.i !== oIdx &&
            picked.indexOf(e.i) === -1 &&
            !e.parts.orphan &&
            paraOf[e.i] === paraOf[oIdx] &&
            maxSim(e.i) <= 0.7;
        });
        var otherPara = ranked.filter(function (e) {
          return e.i !== oIdx &&
            picked.indexOf(e.i) === -1 &&
            !e.parts.orphan &&
            paraOf[e.i] !== paraOf[oIdx] &&
            (paraCount[paraOf[e.i]] || 0) === 0 &&
            maxSim(e.i) <= 0.7;
        });
        var swap = samePara[0] || otherPara[0];

        if (swap) {
          picked[oi] = swap.i;
        }
      }
    }

    // Urutan asli naskah.
    picked.sort(function (a, b) { return a - b; });

    var pickedScored = scored.filter(function (e) {
      return picked.indexOf(e.i) !== -1;
    });
    var genericLeft = pickedScored.filter(function (e) {
      return e.generic >= 0.5;
    }).length;
    var orphanLeft = pickedScored.filter(function (e) {
      return e.parts.orphan > 0;
    }).length;

    return {
      sentences: picked.map(function (i) { return sents[i]; }),
      picked: picked,
      method: "ringkasan ekstraktif: " + picked.length + " dari " + sents.length +
        " kalimat asli dipilih" +
        " (skor topik+kepadatan info+entitas+posisi," +
        " penalti kalimat generik " + genericLeft +
        ", penalti kalimat bergantung " + orphanLeft +
        ", filter kemiripan, sebar lintas paragraf)," +
        " ditampilkan verbatim — tanpa ubah fakta, tanpa simpulan baru."
    };
  }

  global.FarazSummarize = {
    summarize: summarize,
    scoreSentences: scoreSentences,
    verifyExtractive: verifyExtractive,
    genericness: genericness,
    MAX_KEEP: MAX_KEEP,
    MIN_KEEP: MIN_KEEP
  };
})(
  typeof globalThis !== "undefined"
    ? globalThis
    : typeof window !== "undefined"
      ? window
      : this
);
