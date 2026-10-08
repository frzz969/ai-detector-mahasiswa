// FarazCombine — gabungan evidence-based heuristik lokal + skor AI.
// Aturan: detector-rules §3-§4, §6; core.js caps.
// Bukan average buta: bobot dari confidence × coverage × faktor bahasa.
(function (global) {
  "use strict";

  var MAX_LIFT = 5;
  var AGREE_GAP = 30;
  var FLOOR = 15;
  var CEIL = 98;

  function num(x, fallback) {
    return (typeof x === "number" && isFinite(x)) ? x : fallback;
  }

  function clampScore(x) {
    return Math.max(FLOOR, Math.min(CEIL, Math.round(x)));
  }

  function confRank(c) {
    if (c === "tinggi") {
      return 3;
    }

    if (c === "sedang") {
      return 2;
    }

    // "rendah" + tak dikenal → paling konservatif.
    return 1;
  }

  function rankConf(r) {
    return r >= 3 ? "tinggi" : r === 2 ? "sedang" : "rendah";
  }

  function baseWeight(conf) {
    if (conf === "tinggi") {
      return 0.45;
    }

    if (conf === "sedang") {
      return 0.30;
    }

    return 0.15;
  }

  // Cap lokal dari evidence lokal: pendek → 45; satu sinyal → 60.
  function localCapOf(local) {
    var capShort = (typeof SHORT_TEXT_CAP === "number") ? SHORT_TEXT_CAP : 45;
    var capSingle = (typeof SINGLE_SIGNAL_CAP === "number") ? SINGLE_SIGNAL_CAP : 60;
    var cap = Infinity;
    var capKind = "none";
    var d = (local && local.detail) || {};
    var totalW = num(d.totalW, num(local && local.words, NaN));
    var sentsN = num(d.sentsN, num(local && local.sentsN, NaN));

    if (local && Array.isArray(local.sents)) {
      sentsN = local.sents.length;
    }

    if (isFinite(totalW) && totalW > 0 && totalW < 50) {
      cap = Math.min(cap, capShort);
      capKind = "short";
    }

    if (isFinite(sentsN) && sentsN > 0 && sentsN < 3) {
      cap = Math.min(cap, capShort);
      capKind = "short";
    }

    var posSig = num(d.posSig, NaN);

    if (isFinite(posSig) && posSig <= 1) {
      // Samakan detector: single-signal cap untuk teks >= 80.
      var reliable = !isFinite(totalW) || totalW >= 80;

      if (reliable) {
        if (capSingle < cap) {
          cap = capSingle;
          capKind = "single";
        } else if (cap === Infinity) {
          cap = capSingle;
          capKind = "single";
        }
      }
    }

    // Jejak akademik dicatat agar AI tidak mengangkat skor formal.
    return { cap: cap, kind: capKind };
  }

  // local/ai/aiErr → { final 15-98, confidence, method }.
  function combine(local, ai, aiErr) {
    var lScore = clampScore(num(local && local.score, 22));
    var lConf = (local && local.confidence) || "rendah";

    if (lConf !== "rendah" && lConf !== "sedang" && lConf !== "tinggi") {
      lConf = "rendah";
    }

    // Bahasa penuh dari heuristic (detail.language); fallback detail.lang.
    var d0 = (local && local.detail) || {};
    var textLang = d0.language || d0.lang || (local && local.lang) || "id";

    if (
      textLang !== "en" &&
      textLang !== "id" &&
      textLang !== "mixed" &&
      textLang !== "unknown"
    ) {
      textLang = "id";
    }

    var isMixed = textLang === "mixed" ||
      d0.mixed === true ||
      (local && local.mixed === true);

    var capInfo = localCapOf(local || {});
    var localCapped = isFinite(capInfo.cap)
      ? Math.min(lScore, capInfo.cap)
      : lScore;

    // AI tak tersedia → heuristik saja. Mixed tetap maks sedang.
    if (!ai || typeof ai.score !== "number" || !isFinite(ai.score)) {
      var why = (aiErr && aiErr.reason) ? String(aiErr.reason) : "tidak tersedia";
      var soloConf = (isMixed && lConf === "tinggi") ? "sedang" : lConf;

      return {
        final: clampScore(localCapped),
        confidence: soloConf,
        method: "heuristik offline " + lScore + "/100 (AI " + why + ")"
      };
    }

    var aScore = clampScore(ai.score);
    var aConf = ai.confidence || "rendah";

    if (aConf !== "rendah" && aConf !== "sedang" && aConf !== "tinggi") {
      aConf = "rendah";
    }

    var coverage = (typeof ai.coverage === "number" && isFinite(ai.coverage))
      ? Math.max(0, Math.min(1, ai.coverage))
      : 1;

    // Model generik dominan EN → teks ID/mixed/unknown bobot ≤ 0.5.
    var langFactor = 1;

    if (textLang === "id" || textLang === "mixed" || textLang === "unknown") {
      var aiIdOk = ai.lang === "id" ||
        ai.modelLang === "id" ||
        ai.modelLang === "id-en" ||
        ai.modelLang === "multilingual";

      langFactor = aiIdOk ? 1 : 0.5;
    }

    var wAi = baseWeight(aConf) * coverage * langFactor;

    if (!(wAi >= 0 && wAi <= 1)) {
      wAi = 0.15;
    }

    var wLocal = 1 - wAi;
    var blended = localCapped * wLocal + aScore * wAi;

    // Cap supremacy akademik: formalitas tidak diangkat jauh.
    var ceiling = localCapped + MAX_LIFT;
    var finalRaw = Math.min(blended, ceiling);
    var final = clampScore(finalRaw);

    // Agreement gate: selisih besar → confidence maks sedang.
    var gap = Math.abs(lScore - aScore);
    var disagree = gap >= AGREE_GAP;
    var baseRank = Math.min(confRank(lConf), confRank(aConf));

    // Teks pendek / satu sinyal → bukti tipis → confidence rendah.
    if (capInfo.kind === "short") {
      baseRank = Math.min(baseRank, 1);
    }

    if (disagree) {
      baseRank = Math.min(baseRank, 2);
    }

    // Teks mixed → confidence maks sedang (detector-rules §6).
    var mixedNote = "";

    if (isMixed) {
      baseRank = Math.min(baseRank, 2);
      mixedNote = "; teks campuran → confidence maks sedang";
    }

    var confidence = rankConf(baseRank);

    // method = audit teknis untuk <details>; kategori di verdict.
    var method = "gabungan heuristik " + lScore + "/100 + AI " + aScore + "/100" +
      " (bobot AI " + wAi.toFixed(2) +
      ": conf " + aConf +
      " × cakupan " + coverage.toFixed(2) +
      " × bahasa " + langFactor.toFixed(1) +
      "; selisih " + Math.round(gap) +
      (disagree ? " → tidak sepakat, perlu ditinjau" : "") +
      (isMixed ? "; bahasa campuran (" + textLang + ")" : "") +
      (
        isFinite(capInfo.cap)
          ? "; cap lokal " + capInfo.cap +
            " (" + capInfo.kind + ") + angkat maks " + MAX_LIFT
          : ""
      ) +
      mixedNote + ")";

    return { final: final, confidence: confidence, method: method };
  }

  global.FarazCombine = {
    combine: combine,
    MAX_LIFT: MAX_LIFT,
    AGREE_GAP: AGREE_GAP
  };
})(
  typeof globalThis !== "undefined"
    ? globalThis
    : typeof window !== "undefined"
      ? window
      : this
);
