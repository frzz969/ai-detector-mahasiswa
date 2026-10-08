// FarazPre — preprocess hybrid (wrapper, bukan duplikasi logika).
// Aturan: detector-rules §1, §4.
// Memakai fungsi existing — JANGAN duplikasi regex.
(function (global) {
  "use strict";

  var PREPROCESS_V = 1;

  // Hash FNV-1a 32-bit (hex 8 char): korelasi echo, bukan kriptografi.
  function hashText(s) {
    var h = 0x811c9dc5;
    var str = String(s);

    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      // Math.imul agar 32-bit konsisten di semua browser/node.
      h = Math.imul(h, 0x01000193);
    }

    return ("0000000" + (h >>> 0).toString(16)).slice(-8);
  }

  // Deteksi bahasa ringan: LOGIKA SAMA dengan detector.js. Jangan ubah sepihak.
  function collectLangExclusions(cleaned) {
    var excl = {};
    var multi = String(cleaned).match(
      /\b[A-ZÀ-Þ][a-zà-ÿ]+(?:\s+[A-ZÀ-Þ][a-zà-ÿ]+)+/g
    ) || [];

    for (var k = 0; k < multi.length; k++) {
      var parts = multi[k].toLowerCase().split(/[^a-zà-ÿ]+/);

      for (var j = 0; j < parts.length; j++) {
        if (parts[j]) {
          excl[parts[j]] = 1;
        }
      }
    }

    var acr = String(cleaned).match(/\b[A-ZÀ-Þ]{2,}\b/g) || [];

    for (var a = 0; a < acr.length; a++) {
      excl[acr[a].toLowerCase()] = 1;
    }

    return excl;
  }

  function detectLangInfo(cleaned, tokens) {
    var hasIdFw = typeof ID_FW !== "undefined" &&
      ID_FW &&
      typeof ID_FW.has === "function";
    var hasEnFw = typeof EN_FW !== "undefined" &&
      EN_FW &&
      typeof EN_FW.has === "function";
    var FALLBACK_ID = {
      yang: 1,
      dan: 1,
      dengan: 1,
      untuk: 1,
      pada: 1,
      ini: 1,
      itu: 1,
      adalah: 1,
      dalam: 1,
      oleh: 1,
      sebagai: 1,
      tidak: 1,
      dari: 1
    };
    var FALLBACK_EN = {
      the: 1,
      and: 1,
      of: 1,
      to: 1,
      in: 1,
      is: 1,
      are: 1,
      that: 1,
      this: 1,
      with: 1,
      for: 1,
      as: 1,
      by: 1
    };
    var excl = collectLangExclusions(cleaned);
    var fwId = 0;
    var fwEn = 0;

    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];

      if (excl[t]) {
        continue;
      }

      if (hasIdFw) {
        if (ID_FW.has(t)) {
          fwId++;
        }
      } else if (FALLBACK_ID[t]) {
        fwId++;
      }

      if (hasEnFw) {
        if (EN_FW.has(t)) {
          fwEn++;
        }
      } else if (FALLBACK_EN[t]) {
        fwEn++;
      }
    }

    var totalW = tokens.length;
    var fwTotal = fwId + fwEn;
    var fwRate = totalW ? Math.max(fwId, fwEn) / totalW : 0;
    var idProp = fwTotal ? fwId / fwTotal : 0;
    var enProp = fwTotal ? fwEn / fwTotal : 0;
    var majority = fwEn > fwId ? "en" : "id";
    var language = majority;
    var mixed = false;

    if (fwTotal < 4 || fwRate < 0.02) {
      language = "unknown";
    } else if (Math.min(idProp, enProp) >= 0.30) {
      language = "mixed";
      mixed = true;
    }

    var languageConfidence = Math.round(Math.min(1, fwRate / 0.2) * 100) / 100;

    if (language === "unknown") {
      languageConfidence = Math.min(languageConfidence, 0.3);
    }

    if (mixed) {
      languageConfidence = Math.min(languageConfidence, 0.6);
    }

    return {
      language: language,
      majority: majority,
      mixed: mixed,
      fwRate: fwRate,
      languageConfidence: languageConfidence
    };
  }

  // Kompatibilitas: kembalikan string bahasa saja.
  function detectLang(tokens, cleaned) {
    return detectLangInfo(cleaned || "", tokens).language;
  }

  function tokenizeLower(t) {
    return (String(t).toLowerCase().match(/[\p{L}\p{N}']+/gu) || []);
  }

  // Preprocess utama: normalize → splitReferences → cleanAcademic → kalimat.
  function preprocess(rawText) {
    var raw = String(rawText == null ? "" : rawText);

    // NFKC: samakan bentuk unicode (fullwidth, ligatur, dsb).
    var normalized = typeof raw.normalize === "function"
      ? raw.normalize("NFKC")
      : raw;

    // 1) Pisahkan daftar pustaka via fungsi existing (detector.js).
    var main = normalized;
    var refs = "";
    var cut = 0;

    if (typeof splitReferences === "function") {
      try {
        var s = splitReferences(normalized);

        if (s && typeof s.main === "string") {
          main = s.main;
          refs = typeof s.refs === "string" ? s.refs : "";
          cut = typeof s.cut === "number" ? s.cut : 0;
        }
      } catch (_) {
        main = normalized;
        refs = "";
        cut = 0;
      }
    }

    // 2) Bersihkan sitasi/URL/DOI via fungsi existing (tanpa buang fakta).
    var cleaned = main;

    if (typeof cleanAcademic === "function") {
      try {
        cleaned = cleanAcademic(main);
      } catch (_) {
        cleaned = main;
      }
    }

    // canonicalText: kanonis untuk hash + kirim AI.
    var canonicalText = cleaned.replace(/\s+/g, " ").trim();

    // 3) Pecah kalimat via fungsi existing.
    var sents = [];

    if (typeof splitSentences === "function") {
      try {
        sents = splitSentences(cleaned) || [];
      } catch (_) {
        sents = [];
      }
    } else if (canonicalText) {
      sents = [canonicalText];
    }

    // 4) Hitung kata via fungsi existing bila ada.
    var wordCount = 0;

    if (typeof countWords === "function") {
      try {
        wordCount = countWords(cleaned);
      } catch (_) {
        wordCount = 0;
      }
    } else {
      wordCount = (cleaned.trim().match(/[\p{L}\p{N}']+/gu) || []).length;
    }

    var langInfo = detectLangInfo(cleaned, tokenizeLower(cleaned));
    var lang = (langInfo.language === "id" || langInfo.language === "en")
      ? langInfo.language
      : langInfo.majority;
    var hash = hashText(canonicalText);

    return {
      v: PREPROCESS_V,
      hash: hash,
      canonicalText: canonicalText,
      sents: sents,
      lang: lang,
      language: langInfo.language,
      languageConfidence: langInfo.languageConfidence,
      mixed: langInfo.mixed,
      words: wordCount,
      refCut: cut,
      refText: refs
    };
  }

  global.FarazPre = {
    preprocess: preprocess,
    hashText: hashText,
    detectLang: detectLang,
    detectLangInfo: detectLangInfo,
    PREPROCESS_V: PREPROCESS_V
  };
})(
  typeof globalThis !== "undefined"
    ? globalThis
    : typeof window !== "undefined"
      ? window
      : this
);
