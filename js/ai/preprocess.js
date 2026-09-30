// ============================================================
// FarazPre — preprocess hybrid (wrapper, bukan duplikasi logika)
// Aturan: detector-rules §1 (alur wajib: bersihkan → cek panjang →
// pecah kalimat), §4 (sitasi bukan bukti AI → pisahkan pustaka).
// Memakai fungsi existing: splitReferences(), cleanAcademic(),
// splitSentences(), countWords() — JANGAN duplikasi regex mereka.
// File vanilla JS global (tanpa import/export ES).
// ============================================================
(function (global) {
  "use strict";

  var PREPROCESS_V = 1;

  // Hash FNV-1a 32-bit → hex 8 char. Sync, deterministik, cukup untuk
  // echo hash/v ke /api/analyze (bukan kriptografi, hanya korelasi).
  function hashText(s) {
    var h = 0x811c9dc5;
    var str = String(s);
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      // Math.imul agar 32-bit konsisten di semua browser/node
      h = Math.imul(h, 0x01000193);
    }
    // >>> 0 → unsigned, pad hex 8 digit
    return ("0000000" + (h >>> 0).toString(16)).slice(-8);
  }

  // Deteksi bahasa ringan: pakai set global ID_FW/EN_FW bila ada
  // (core.js), else fallback daftar kecil. Output "id"|"en".
  function detectLang(tokens) {
    var hasIdFw = typeof ID_FW !== "undefined" && ID_FW && typeof ID_FW.has === "function";
    var hasEnFw = typeof EN_FW !== "undefined" && EN_FW && typeof EN_FW.has === "function";
    var fwId = 0, fwEn = 0;
    var FALLBACK_ID = { yang: 1, dan: 1, dengan: 1, untuk: 1, pada: 1, ini: 1, itu: 1, adalah: 1, dalam: 1, oleh: 1, sebagai: 1, tidak: 1, dari: 1 };
    var FALLBACK_EN = { the: 1, and: 1, of: 1, to: 1, in: 1, is: 1, are: 1, that: 1, this: 1, with: 1, for: 1, as: 1, by: 1 };
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      if (hasIdFw) { if (ID_FW.has(t)) fwId++; }
      else if (FALLBACK_ID[t]) fwId++;
      if (hasEnFw) { if (EN_FW.has(t)) fwEn++; }
      else if (FALLBACK_EN[t]) fwEn++;
    }
    return (fwEn > fwId && fwEn > 0) ? "en" : "id";
  }

  function tokenizeLower(t) {
    return (String(t).toLowerCase().match(/[\p{L}\p{N}']+/gu) || []);
  }

  // Preprocess utama. Input string mentah → objek deterministik.
  // Tahap: normalize NFKC → splitReferences() → cleanAcademic() →
  // splitSentences() → lang/words/hash. Tidak mengubah file existing.
  function preprocess(rawText) {
    var raw = String(rawText == null ? "" : rawText);
    // NFKC: samakan bentuk unicode (fullwidth, ligatur, dsb.)
    var normalized = typeof raw.normalize === "function" ? raw.normalize("NFKC") : raw;

    // 1) Pisahkan daftar pustaka via fungsi existing (detector.js).
    var main = normalized, refs = "", cut = 0;
    if (typeof splitReferences === "function") {
      try {
        var s = splitReferences(normalized);
        if (s && typeof s.main === "string") {
          main = s.main;
          refs = typeof s.refs === "string" ? s.refs : "";
          cut = typeof s.cut === "number" ? s.cut : 0;
        }
      } catch (_) { main = normalized; refs = ""; cut = 0; }
    }

    // 2) Bersihkan sitasi/URL/DOI via fungsi existing (tanpa buang fakta).
    var cleaned = main;
    if (typeof cleanAcademic === "function") {
      try { cleaned = cleanAcademic(main); } catch (_) { cleaned = main; }
    }

    // canonicalText: bentuk kanonis untuk hash + kirim ke AI (whitespace
    // dinormalisasi, isi tidak diubah selain cleanAcademic di atas).
    var canonicalText = cleaned.replace(/\s+/g, " ").trim();

    // 3) Pecah kalimat via fungsi existing.
    var sents = [];
    if (typeof splitSentences === "function") {
      try { sents = splitSentences(cleaned) || []; } catch (_) { sents = []; }
    } else if (canonicalText) {
      sents = [canonicalText];
    }

    // 4) Hitung kata via fungsi existing bila ada.
    var wordCount = 0;
    if (typeof countWords === "function") {
      try { wordCount = countWords(cleaned); } catch (_) { wordCount = 0; }
    } else {
      wordCount = (cleaned.trim().match(/[\p{L}\p{N}']+/gu) || []).length;
    }

    var lang = detectLang(tokenizeLower(cleaned));
    var hash = hashText(canonicalText);

    return {
      v: PREPROCESS_V,
      hash: hash,
      canonicalText: canonicalText,
      sents: sents,
      lang: lang,
      words: wordCount,
      refCut: cut,
      refText: refs
    };
  }

  global.FarazPre = {
    preprocess: preprocess,
    hashText: hashText,
    PREPROCESS_V: PREPROCESS_V
  };
})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this);
