// detector.js — mesin nilai: olah teks, heuristik, model lokal.
// Butuh core.js lebih dulu.

function splitReferences(t) {
  const lines = t.split(/\n/);
  let idx = -1;
  const start = Math.max(0, lines.length - 80);

  for (let i = lines.length - 1; i >= start; i--) {
    const l = lines[i].trim().toLowerCase();
    if (!l) {
      continue;
    }

    const isHead = REF_HEADS.some(
      (h) => l === h || l.startsWith(h + " ") || l.startsWith(h + ":")
    );
    const isDaftar = l.includes("daftar pustaka") && l.length < 40;

    if (isHead || isDaftar) {
      idx = i;
      break;
    }
  }

  if (idx === -1) {
    let last = -1;
    lines.forEach((ln, i) => {
      if (REF_HEADS.includes(ln.trim().toLowerCase())) {
        last = i;
      }
    });
    idx = last;
  }

  if (idx === -1) {
    return { main: t, refs: "", cut: 0 };
  }

  const main = lines.slice(0, idx).join("\n");
  const refs = lines.slice(idx).join("\n");

  // Jangan potong kalau teks utama kependekan.
  if (countWords(main) < 50) {
    return { main: t, refs: "", cut: 0 };
  }

  return { main, refs, cut: countWords(refs) };
}

// Buang penanda format markdown tempelan AI.
// Hanya penanda format yang dibuang, angka dan sitasi dipertahankan.
function stripMarkdown(t) {
  let s = String(t == null ? "" : t);
  if (!s) {
    return s;
  }

  s = s.replace(/```(\w*\n)?([\s\S]*?)```/g, "$2");
  s = s.replace(/`([^`\n]*)`/g, "$1");
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  s = s.replace(/^#{1,6}\s+/gm, "");
  s = s.replace(/^(?:\s*>)+\s?/gm, "");
  s = s.replace(/^\s*[-*+]\s+(?=\S)/gm, "");
  s = s.replace(/^\s*\d+[.)]\s+(?=\S)/gm, "");
  s = s.replace(/^\s*(?:---|\*\*\*|___)\s*$/gm, " ");
  s = s.replace(/\*\*([^*]+)\*\*/g, "$1");
  s = s.replace(/__([^_]+)__/g, "$1");
  s = s.replace(/~~([^~]+)~~/g, "$1");
  s = s.replace(/(^|\W)\*([^*\n]+?)\*(?=\W|$)/g, "$1$2");
  s = s.replace(/(^|\W)_([^_\n]+)_(\W|$)/g, "$1$2$3");
  s = s.replace(/\s*\|\s*/g, " ");
  s = s.replace(/[ \t]{2,}/g, " ");
  s = s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");

  return s;
}

// Buang sitasi, URL, dan DOI agar tidak mengacaukan statistik kata.
// Sitasi dan istilah teknis bukan bukti AI. Mask code dulu,
// lalu stripMarkdown, lalu buang pola sitasi.
function cleanAcademic(t) {
  let s = String(t);
  s = s
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`\n]*`/g, " ")
    .replace(/^[ \t]{4,}\S.*$/gm, " ");

  try {
    if (typeof stripMarkdown === "function") {
      s = stripMarkdown(s);
    }
  } catch (_) {}

  return s
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`\n]*`/g, " ")
    .replace(/^[ \t]{4,}\S.*$/gm, " ")
    .replace(/\[\d+(\s*[-–,]\s*\d+)*\]/g, " ")
    .replace(/\([A-Z][a-z]+(?: et al\.)?,?\s?\d{4}[a-z]?\)/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\bDOI:\S+/gi, " ")
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, " ")
    .replace(/\b[A-Za-z_][\w-]*(?:\.[\w-]+)+/g, " ")
    .replace(/\b[\w.-]+\(\)/g, " ");
}

// Pecah jadi kalimat, buang yang pendek.
function splitSentences(t) {
  const norm = t.replace(/\s+/g, " ").trim();
  if (!norm) {
    return [];
  }

  return (norm.match(/[^.!?]+[.!?]+["”']?|\S.+$/g) || [norm])
    .map((s) => s.trim())
    .filter((s) => countWords(s) > 3);
}

// Token kata huruf kecil untuk TTR dan statistik.
function words(t) {
  return t.toLowerCase().match(/[\p{L}\p{N}']+/gu) || [];
}

// Deteksi bahasa id, en, mixed, atau unknown.
// Nama produk atau organisasi dan akronim dikecualikan.
function collectLangExclusions(cleaned) {
  const excl = new Set();
  const multi = cleaned.match(
    /\b[A-ZÀ-Þ][a-zà-ÿ]+(?:\s+[A-ZÀ-Þ][a-zà-ÿ]+)+/g
  ) || [];

  multi.forEach((m) => {
    m.toLowerCase()
      .split(/[^a-zà-ÿ]+/)
      .forEach((x) => {
        if (x) {
          excl.add(x);
        }
      });
  });

  const acr = cleaned.match(/\b[A-ZÀ-Þ]{2,}\b/g) || [];
  acr.forEach((a) => excl.add(a.toLowerCase()));

  return excl;
}

function detectLanguageInfo(cleaned, w) {
  const totalW = w.length;
  const excl = collectLangExclusions(cleaned);
  let fwId = 0;
  let fwEn = 0;

  w.forEach((t) => {
    if (excl.has(t)) {
      return;
    }
    if (ID_FW.has(t)) {
      fwId++;
    }
    if (EN_FW.has(t)) {
      fwEn++;
    }
  });

  const fwTotal = fwId + fwEn;
  const fwRate = totalW ? Math.max(fwId, fwEn) / totalW : 0;
  const idProp = fwTotal ? fwId / fwTotal : 0;
  const enProp = fwTotal ? fwEn / fwTotal : 0;
  const majority = fwEn > fwId ? "en" : "id";

  let language = majority;
  let mixed = false;
  if (fwTotal < 4 || fwRate < 0.02) {
    language = "unknown";
  } else if (Math.min(idProp, enProp) >= 0.30) {
    language = "mixed";
    mixed = true;
  }

  let languageConfidence = Math.round(Math.min(1, fwRate / 0.2) * 100) / 100;
  if (language === "unknown") {
    languageConfidence = Math.min(languageConfidence, 0.3);
  }
  if (mixed) {
    languageConfidence = Math.min(languageConfidence, 0.6);
  }

  return {
    language,
    majority,
    mixed,
    fwId,
    fwEn,
    fwTotal,
    fwRate,
    idProp,
    enProp,
    languageConfidence,
  };
}

// Konteks akademik LOW, MEDIUM, atau HIGH.
// Sitasi, data, dan metodologi adalah academic convention.
// Dipakai untuk dampening selektif sinyal lemah. Bukti
// struktural kuat tetap berpengaruh penuh.
function academicContext(o) {
  const techHits = o.acaMeth;
  const secHits = (
    o.low.match(
      /\b(pendahuluan|metode|metodologi|hasil|pembahasan|kesimpulan|abstrak|tujuan penelitian|populasi|sampel|responden|kuesioner|observasi|wawancara|uji |analisis data)\b/gi
    ) || []
  ).length;
  const formHits = (
    o.low.match(
      /\b(berdasarkan|tersebut|adapun|sebagaimana|terlampir|dengan hormat)\b/gi
    ) || []
  ).length;
  const citeD = o.acaCite;
  const numD = o.numbers + o.properNouns;

  let level = "LOW";
  if (
    (o.acaMarkers >= 5 && numD >= 4) ||
    (citeD >= 2 && techHits >= 2) ||
    (secHits >= 3 && numD >= 4)
  ) {
    level = "HIGH";
  } else if (
    o.acaMarkers >= 3 ||
    secHits >= 2 ||
    (citeD >= 1 && techHits >= 1)
  ) {
    level = "MEDIUM";
  }

  return { level, citeD, techHits, secHits, formHits, numD };
}

// S1 ID-Scaffold Dispersion: scaffolding ID yang tersebar
// lintas kalimat atau paragraf. Leksikon union memakai
// AI_ID, ACAD_NEUTRAL, dan REF_ID_SCAFFOLD.
function idScaffoldSignal(
  cleaned,
  low,
  sents,
  paras,
  totalW,
  strongAcad,
  acaMarkers
) {
  const none = {
    fire: false,
    hits: 0,
    distinct: 0,
    dispersion: 0,
    density: 0,
    sentHit: new Set(),
  };
  if (totalW < S1_MIN_W) {
    return none;
  }

  const union = [...new Set([...AI_ID, ...ACAD_NEUTRAL, ...REF_ID_SCAFFOLD])]
    .sort((a, b) => b.length - a.length);
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pat = "\\b(" + union.map(esc).join("|") + ")\\b";
  const ORD_START = /^(pertama|kedua|ketiga)\b/i;

  let hits = 0;
  const distinct = new Set();
  const sentHit = new Set();

  sents.forEach((s, i) => {
    let f = false;
    const re = new RegExp(pat, "gi");
    let m;
    while ((m = re.exec(s)) !== null) {
      hits++;
      distinct.add(m[1].toLowerCase());
      f = true;
    }

    const om = s.trimStart().match(ORD_START);
    if (om) {
      hits++;
      distinct.add(om[1].toLowerCase());
      f = true;
    }
    if (f) {
      sentHit.add(i);
    }
  });

  const paraHit = new Set();
  paras.forEach((p, i) => {
    if (new RegExp(pat, "i").test(p)) {
      paraHit.add(i);
    } else if (splitSentences(p).some((s) => ORD_START.test(s.trimStart()))) {
      paraHit.add(i);
    }
  });

  const dispersion = Math.max(sentHit.size, paraHit.size);
  const density = totalW ? (hits * 100) / totalW : 0;
  const gated =
    density >= S1_MIN_DENSITY &&
    dispersion >= S1_MIN_DISPERSION &&
    distinct.size >= S1_MIN_DISTINCT;

  const done = (fire) => ({
    fire,
    hits,
    distinct: distinct.size,
    dispersion,
    density,
    sentHit,
  });

  if (!gated) {
    return done(false);
  }
  if (strongAcad) {
    return done(false);
  }

  // Lewati bila kalimat hit berangka, bersitasi, atau bermetode
  // konkret dalam jarak satu kalimat.
  const methRe = new RegExp(
    "\\b(" + REF_ACADEMIC_METH.join("|") + ")\\b",
    "i"
  );
  const citeRe =
    /\[\d+(\s*[-–,]\s*\d+)*\]|\([^()]{0,50}?\b(19|20)\d{2}[a-z]?\)|et al\.|\bdoi\b|https?:\/\//i;
  const numRe = /\b\d+([.,]\d+)?\b/;

  for (const i of sentHit) {
    for (
      let k = Math.max(0, i - 1);
      k <= Math.min(sents.length - 1, i + 1);
      k++
    ) {
      if (
        numRe.test(sents[k]) ||
        citeRe.test(sents[k]) ||
        methRe.test(sents[k])
      ) {
        return done(false);
      }
    }
  }

  return done(true);
}

// Heuristik skor AI. Semua pola berasal dari referensi.js.
// Output 15–98 plus skor per kalimat, confidence, dan bahasa.
function heuristic(text) {
  const clean = cleanAcademic(text);

  // Struktur paragraf dipertahankan sebelum flatten.
  // Teks satu paragraf sering salah terflag. Paragraf
  // bervariasi adalah ciri tulisan manusia.
  const paras = clean
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const paraCount = paras.length;
  const paraLens = paras.map((p) => countWords(p));
  const paraMean = paraLens.length
    ? paraLens.reduce((a, b) => a + b, 0) / paraLens.length
    : 0;
  const paraStd = paraLens.length > 1
    ? Math.sqrt(
        paraLens.reduce((a, b) => a + Math.pow(b - paraMean, 2), 0) /
          paraLens.length
      )
    : 0;
  const paraCV = paraMean ? paraStd / paraMean : 0;

  const sents = splitSentences(clean);
  const w = words(clean);

  const totalW = w.length;
  const ttr = totalW ? new Set(w).size / totalW : 0;

  const lens = sents.map((s) => countWords(s));
  const mean = lens.length
    ? lens.reduce((a, b) => a + b, 0) / lens.length
    : 0;
  const std = lens.length
    ? Math.sqrt(
        lens.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / lens.length
      )
    : 0;
  const burst = mean ? std / mean : 0;

  // Variasi panjang kata: seragam berarti mekanis.
  const wlens = w.map((x) => x.length);
  const wlMean = wlens.length
    ? wlens.reduce((a, b) => a + b, 0) / wlens.length
    : 0;
  const wlStd = wlens.length
    ? Math.sqrt(
        wlens.reduce((a, b) => a + Math.pow(b - wlMean, 2), 0) / wlens.length
      )
    : 0;
  const wlCV = wlMean ? wlStd / wlMean : 0;

  // Diversity n-gram: pengulangan pola berarti repetisi mekanis.
  const bigrams = [];
  const trigrams = [];
  for (let i = 0; i + 1 < w.length; i++) {
    bigrams.push(w[i] + " " + w[i + 1]);
  }
  for (let i = 0; i + 2 < w.length; i++) {
    trigrams.push(w[i] + " " + w[i + 1] + " " + w[i + 2]);
  }
  const bigramDiversity = bigrams.length
    ? new Set(bigrams).size / bigrams.length
    : 1;
  const trigramDiversity = trigrams.length
    ? new Set(trigrams).size / trigrams.length
    : 1;

  // Deteksi bahasa untuk konteks dan bobot model.
  const langInfo = detectLanguageInfo(clean, w);
  const lang = langInfo.majority;
  const fwId = langInfo.fwId;
  const fwEn = langInfo.fwEn;
  const fwRate = langInfo.fwRate;

  const low = clean.toLowerCase();

  // Frasa generik versus akademik netral.
  // Frasa akademik netral bukan bukti AI.
  let hits = 0;
  let neutralHits = 0;
  AI_PHRASES.forEach((p) => {
    if (low.includes(p)) {
      hits++;
    }
  });
  ACAD_NEUTRAL.forEach((p) => {
    if (low.includes(p)) {
      neutralHits++;
    }
  });

  const conn = (
    low.match(new RegExp("\\b(" + REF_CONNECTORS.join("|") + ")\\b", "g")) ||
      []
  ).length;
  const connRate = sents.length ? conn / sents.length : 0;

  // Frasa manfaat generik dan enumerasi kaku.
  // Dihitung per kalimat, bukan per kemunculan.
  const hedgeSents = sents.filter((s) => {
    const lw = s.toLowerCase();
    return REF_HEDGE_PATS.some((p) => lw.includes(p));
  }).length;

  // Enumerasi kaku: hanya kalimat yang diawali penanda daftar.
  const ENUM_START = new RegExp(
    "^(" + REF_ENUM_ID.join("|") + ")[,\\s]|^(" + REF_ENUM_EN.join("|") + ")[,\\s]",
    "i"
  );
  const enumSents = sents.filter((s) => ENUM_START.test(s.trimStart())).length;

  // Statistik akademik dan konkret untuk sinyal dan dampening.
  const acaCite = (
    text.match(
      /\[\d+(\s*[-–,]\s*\d+)*\]|\([^()]{0,50}?\b(19|20)\d{2}[a-z]?\)|et al\.|\bdoi\b|https?:\/\//gi
    ) || []
  ).length;
  const acaMeth = (
    low.match(new RegExp("\\b(" + REF_ACADEMIC_METH.join("|") + ")\\b", "gi")) ||
      []
  ).length;
  const numbers = (clean.match(/\b\d+([.,]\d+)?\b/g) || []).length;
  const properNouns = new Set(
    (clean.match(/\s[A-ZÀ-Þ][a-zà-ÿ]+/g) || []).map((s) => s.trim().toLowerCase())
  ).size;
  const acaMarkers =
    acaCite + Math.min(acaMeth, 4) + (numbers + properNouns >= 4 ? 2 : 0);
  const strongAcad = acaMarkers >= 5 && numbers + properNouns >= 4;

  const reasons = [];

  // Evidence groups: tiap family diakumulasi terpisah lalu
  // di-cap per grup agar tidak double-counting.
  let gTemplate = 0;
  let gRhythm = 0;
  let gStructure = 0;
  let gLexical = 0;
  let hLike = 0;
  let rhythmPos = 0;
  let connPts = 0;

  // Variasi panjang kalimat: keseragaman saja bukti lemah.
  if (sents.length >= 5) {
    if (burst < 0.3) {
      gRhythm += 14;
      rhythmPos += 14;
      // Ritme seragam tapi variasi kata atau paragraf kaya
      // berarti belum tentu mekanis.
      if (wlCV >= 0.55 || (paraCount >= 2 && paraCV >= 0.4)) {
        hLike += 6;
        reasons.push(
          `Variasi kalimat seragam (${burst.toFixed(2)}) tetapi variasi kata/paragraf cukup ` +
            `(kata ${wlCV.toFixed(2)}, paragraf ${paraCV.toFixed(2)}) — tidak serta-merta mekanis.`
        );
      } else {
        reasons.push(
          `Variasi kalimat cukup seragam (${burst.toFixed(2)}) — pola yang sering ditemukan pada teks generatif.`
        );
      }
    } else if (burst < 0.45) {
      gRhythm += 7;
      rhythmPos += 7;
      reasons.push(`Variasi kalimat agak seragam (${burst.toFixed(2)}).`);
    } else {
      hLike += 8;
      reasons.push(
        `Variasi kalimat cukup alami (${burst.toFixed(2)}) — pola yang umum pada tulisan manusia.`
      );
    }
  } else if (sents.length >= 3 && burst < 0.2) {
    gRhythm += 8;
    rhythmPos += 8;
    reasons.push(`Ritme kalimat sangat datar (${burst.toFixed(2)}).`);
  }

  // Kekayaan kata, frasa generik, dan konektor.
  if (totalW > LEX_MIN_W) {
    if (ttr > 0.25 && ttr < 0.55 && hits > 0) {
      reasons.push(
        `TTR ${ttr.toFixed(2)} disertai frasa generik — terdapat indikasi pola generatif.`
      );
      gLexical += 12;
    }
    if (ttr >= 0.65) {
      reasons.push(
        `TTR tinggi ${ttr.toFixed(2)} — kosakata bervariasi seperti tulisan manusia.`
      );
      hLike += 10;
    }
    if (ttr < 0.2) {
      reasons.push(`Pengulangan kata cukup tinggi (${ttr.toFixed(2)}).`);
      gLexical += 8;
    }
  }

  // Diversity n-gram untuk teks cukup panjang saja.
  if (totalW > MED_MIN_W) {
    if (bigramDiversity < 0.45 || trigramDiversity < 0.55) {
      gLexical += 8;
      reasons.push(
        `Pola kata berulang cukup tinggi (bigram ${bigramDiversity.toFixed(2)}, ` +
          `trigram ${trigramDiversity.toFixed(2)}) — frasa yang sama terpakai berulang.`
      );
    } else if (trigramDiversity > 0.75 && ttr >= 0.55) {
      hLike += 6;
      reasons.push(
        `Pola kata bervariasi (trigram ${trigramDiversity.toFixed(2)}) — pilihan kata tidak monoton.`
      );
    }
  }

  if (hits > 0) {
    // Frasa template eksplisit adalah evidence kuat.
    gTemplate += Math.min(30, hits * 12);
    reasons.push(
      `${hits} frasa template/generik ditemukan — perlu ditinjau dalam konteks kalimatnya.`
    );
  }

  if (connRate > 0.4) {
    gLexical += 12;
    connPts += 12;
    reasons.push(
      `Kata penghubung formal cukup sering berulang (${connRate.toFixed(2)}/kalimat) ` +
        `— yang dinilai polanya, bukan pemakaiannya.`
    );
  }

  // Pola rapi 12–28 kata yang terlalu dominan.
  const ideal = lens.filter((l) => l >= 12 && l <= 28).length;
  if (lens.length >= 5 && ideal / lens.length > 0.8) {
    gRhythm += 8;
    rhythmPos += 8;
    reasons.push("80%+ kalimat 12-28 kata — ritme terlalu rapi, perlu ditinjau.");
  }

  // Suara personal berarti manusia. Absennya kata saya pada
  // teks akademik formal bukan bukti AI kecuali ada bukti template.
  const hasTemplateEv =
    hits > 0 ||
    hedgeSents >= 2 ||
    enumSents >= 2 ||
    (neutralHits >= 2 && acaMarkers < 3);
  const personalHits = (
    clean.match(new RegExp("\\b(" + REF_PERSONAL_VOICE.join("|") + ")\\b", "gi")) ||
      []
  ).length;
  const personalRate = sents.length ? personalHits / sents.length : 0;

  if (sents.length >= 3) {
    if (personalRate >= 0.2) {
      hLike += 12;
      reasons.push(
        `Ada suara personal/opini (${personalHits}x) — sudut pandang penulis terasa.`
      );
    } else if (personalRate === 0 && totalW >= IMPERS_MIN_W) {
      if (acaMarkers >= 3 && !hasTemplateEv) {
        reasons.push(
          "Nada impersonal pada teks akademik (register formal) — bukan bukti AI."
        );
      } else {
        gLexical += 8;
        reasons.push("Belum ada sudut pandang personal — tulisan terdengar generik.");
      }
    }
  }

  // Tanda tulisan hidup: tanya, seru, kutipan langsung.
  const lively = (clean.match(/[?!…]|"[^"]+"|“[^”]+”/g) || []).length;
  if (lively >= 2) {
    hLike += 8;
    reasons.push(`${lively}x tanda tanya/seru/kutipan — tulisan terasa hidup.`);
  }

  // Data konkret menguatkan konteks spesifik.
  if (numbers + properNouns >= 4) {
    hLike += 6;
    reasons.push(
      `Ada detail konkret (${numbers} angka, ${properNouns} nama) — konteksnya spesifik.`
    );
  }

  // Struktur paragraf: bervariasi berarti manusia.
  if (sents.length >= 4) {
    if (paraCount >= 2 && paraCV >= 0.35) {
      hLike += 4;
      reasons.push(
        `Paragraf terstruktur dan bervariasi (${paraCount} paragraf) — seperti tulisan manusia.`
      );
    } else if (paraCount === 1 && totalW > 120) {
      gStructure += 5;
      reasons.push(
        "Seluruh teks satu paragraf panjang — strukturnya datar, perhatikan organisasi tulisan."
      );
    }
  }

  // Pembuka kalimat berulang berarti struktur monoton.
  const openers = sents.map((s) =>
    s.toLowerCase().split(/\s+/).slice(0, 3).join(" ")
  );
  const openerSeen = {};
  openers.forEach((o) => {
    openerSeen[o] = (openerSeen[o] || 0) + 1;
  });

  if (sents.length >= 6) {
    const openRatio = new Set(openers).size / sents.length;
    if (openRatio < 0.6) {
      gStructure += 10;
      reasons.push("Pembuka kalimat banyak berulang — struktur terasa monoton.");
    } else if (openRatio > 0.85) {
      hLike += 6;
      reasons.push("Pembuka kalimat bervariasi — struktur cukup alami.");
    }
  }

  // Repetisi gagasan: ide yang sama di kalimat berbeda.
  if (sents.length >= 4 && sents.length <= 300) {
    const bags = sents.map(
      (s) => new Set(s.toLowerCase().match(/[\p{L}]{4,}/gu) || [])
    );
    let pairs = 0;

    for (let i = 0; i < bags.length; i++) {
      for (let j = i + 1; j < bags.length && pairs < 2; j++) {
        const a = bags[i];
        const b = bags[j];
        if (!a.size || !b.size) {
          continue;
        }

        let inter = 0;
        a.forEach((x) => {
          if (b.has(x)) {
            inter++;
          }
        });

        if (inter / (a.size + b.size - inter) > 0.55) {
          pairs++;
          break;
        }
      }
    }

    if (pairs >= 2) {
      gStructure += 8;
      reasons.push(
        `${pairs} pasang kalimat menyampaikan ide yang mirip ` +
          `— pertimbangkan digabung agar tidak repetitif.`
      );
    }
  }

  // Bahasa template generik versus suara khas manusia.
  const fluffy = (
    low.match(new RegExp("\\b(" + REF_FLUFFY.join("|") + ")\\b", "g")) || []
  ).length;
  const fluffyRef = REF_FLUFF_EXTRA.filter((p) => low.includes(p)).length;
  const fluffyAll = fluffy + fluffyRef;
  const fluffyRate = sents.length ? fluffyAll / sents.length : 0;

  if (fluffyRate > 0.3 && totalW > MED_MIN_W) {
    gTemplate += 8;
    reasons.push(
      `Frasa generik cukup sering (${fluffyAll}x) ` +
        `— tulisan terdengar umum, perlu konteks spesifik.`
    );
  }

  const voiceHits = (
    clean.match(new RegExp("\\b(" + REF_VOICE_LIVE.join("|") + ")\\b", "gi")) ||
      []
  ).length;
  const voiceRef = REF_VOICE_EXTRA.filter((p) => low.includes(p)).length;
  const voiceAll = voiceHits + voiceRef;

  if (voiceAll >= 3) {
    hLike += 8;
    reasons.push(
      `Ada variasi ekspresi (${voiceAll}x: ajakan, manfaat, perumpamaan) — gaya cukup hidup.`
    );
  }

  // Frasa manfaat generik: objek kabur yang dipakai berpola.
  if (hedgeSents >= 1 && totalW >= HEDGE_MIN_W) {
    gTemplate += Math.min(18, hedgeSents * 6);
    reasons.push(
      `${hedgeSents} kalimat memakai frasa manfaat generik ` +
        `("dapat meningkatkan", "memberikan manfaat", "berperan penting") ` +
        `— ciri bahasa template hasil model.`
    );
  }

  // Enumerasi kaku khas struktur daftar template.
  if (enumSents >= 2) {
    gStructure += 10;
    reasons.push(
      `${enumSents} kalimat memakai pola enumerasi ("Pertama... Kedua...") ` +
        `— struktur daftar khas template.`
    );
  }

  // Academic context: dampening selektif sinyal lemah.
  // Bukti struktural kuat tidak didiskon.
  const acad = academicContext({
    low,
    acaCite,
    acaMeth,
    numbers,
    properNouns,
    acaMarkers,
  });
  const acadCap =
    acad.level === "HIGH"
      ? ACAD_DAMP_HIGH
      : acad.level === "MEDIUM"
        ? ACAD_DAMP_MED
        : ACAD_DAMP_LOW;

  let acadDamp = 0;
  let rhythmDiscounted = false;

  if (totalW >= MIN_RELIABLE_W && acad.level !== "LOW") {
    reasons.push(
      `Konteks akademik ${acad.level} terdeteksi (sitasi/data/metodologi) ` +
        `— formalitas di sini kemungkinan academic convention; confidence disesuaikan.`
    );

    if (!hasTemplateEv && rhythmPos > 0) {
      const disc = Math.round(rhythmPos * 0.5);
      gRhythm -= disc;
      rhythmPos = 0;
      rhythmDiscounted = true;
      reasons.push(
        "Keseragaman ritme pada teks akademik tanpa bukti template " +
          "— dijelaskan konvensi formal, bobot uniformitas dikurangi."
      );
    }

    const weakPool =
      (rhythmDiscounted ? 0 : Math.max(0, gRhythm)) + Math.min(connPts, 12);
    acadDamp = Math.min(acadCap, weakPool);

    if (hits === 0 && connRate <= 0.4 && acad.level === "HIGH") {
      acadDamp = Math.min(acadCap, acadDamp + 4);
      reasons.push(
        "Pola yang ada hanya formalitas umum tulisan akademik — indikasi tetap rendah."
      );
    }
  }

  // Bukti riset lengkap berarti tulisan manusia formal.
  if (totalW >= MIN_RELIABLE_W && strongAcad) {
    hLike += 4;
    reasons.push(
      "Bukti riset lengkap (metodologi, data, sitasi) " +
        "— gaya formal ini lazim pada tulisan akademik manusia."
    );
  }

  if (neutralHits > 0 && acaMeth > 0) {
    reasons.push(
      `${neutralHits} frasa akademik standar (mis. "penelitian ini bertujuan", "selain itu") ` +
        `terdeteksi — bahasa akademik normal, tidak dihitung sebagai indikasi AI.`
    );
  }

  // Frasa akademik netral yang dipakai berulang tanpa
  // substansi riset adalah scaffolding generatif.
  if (neutralHits >= 2 && acaMarkers < 3) {
    gTemplate += Math.min(18, (neutralHits - 1) * 9);
    reasons.push(
      `Frasa akademik dipakai berulang (${neutralHits}x) ` +
        `tanpa dukungan data/metodologi/sitasi — scaffolding khas teks generatif.`
    );
  }

  // S1 ID-Scaffold Dispersion: scaffolding tersebar adalah
  // kombinasi frekuensi, konteks, dan kombinasi pola.
  const s1 = idScaffoldSignal(
    clean,
    low,
    sents,
    paras,
    totalW,
    strongAcad,
    acaMarkers
  );
  if (s1.fire) {
    gTemplate += S1_TEMPLATE_PTS;
    reasons.push(
      `Pola scaffolding ID tersebar (${s1.hits} kemunculan, ` +
        `${s1.distinct} frasa berbeda di ${s1.dispersion} kalimat/paragraf, ` +
        `densitas ${s1.density.toFixed(1)}%) — kombinasi yang perlu ditinjau dalam konteksnya.`
    );
  }

  // Contextual signal count: satu sinyal bukan bukti.
  const posSig =
    (sents.length >= 5 && burst < 0.45 ? 1 : 0) +
    (totalW > LEX_MIN_W && ttr > 0.25 && ttr < 0.55 && hits > 0 ? 1 : 0) +
    (totalW > LEX_MIN_W && ttr < 0.2 ? 1 : 0) +
    (hits > 0 ? 1 : 0) +
    (connRate > 0.4 ? 1 : 0) +
    (lens.length >= 5 && ideal / lens.length > 0.8 ? 1 : 0) +
    (sents.length >= 3 && personalRate === 0 && totalW >= IMPERS_MIN_W
      ? 1
      : 0) +
    (totalW > MED_MIN_W &&
    (bigramDiversity < 0.45 || trigramDiversity < 0.55)
      ? 1
      : 0) +
    (sents.length >= 6 && new Set(openers).size / sents.length < 0.6 ? 1 : 0) +
    (fluffyRate > 0.3 && totalW > MED_MIN_W ? 1 : 0) +
    (hedgeSents >= 1 && totalW >= HEDGE_MIN_W ? 1 : 0) +
    (enumSents >= 2 || (neutralHits >= 2 && acaMarkers < 3) ? 1 : 0) +
    (s1.fire ? 1 : 0);

  const singleSignal = totalW >= MIN_RELIABLE_W && posSig <= 1;
  if (singleSignal) {
    reasons.push(
      "Hanya satu pola terdeteksi " +
        "— belum cukup untuk indikasi kuat (perlu multiple signals + konteks)."
    );
  }

  if (totalW < MIN_RELIABLE_W) {
    reasons.push(
      `Teks <${MIN_RELIABLE_W} kata ` +
        `— statistik gaya bahasa belum bermakna, tambah ke 200+ kata.`
    );
  }

  // Skor akhir: anchor netral ditambah evidence per grup
  // dikurangi penyeimbang human-like dan damp akademik.
  const tC = Math.min(gTemplate, TEMPLATE_MAX);
  const rC = Math.max(0, Math.min(gRhythm, RHYTHM_MAX));
  const sC = Math.min(gStructure, STRUCTURE_MAX);
  const lC = Math.min(gLexical, LEXICAL_MAX);
  const hC = Math.min(hLike, HUMAN_LIKE_MAX);

  let pts = SCORE_ANCHOR + tC + rC + sC + lC - hC - Math.min(acadDamp, acadCap);
  pts = Math.max(SCORE_FLOOR, Math.min(SCORE_CEIL, pts));

  // Teks pendek tidak boleh ber-confidence tinggi.
  if ((totalW < SHORT_W || sents.length < SHORT_SENTS) && totalW > 0) {
    pts = Math.min(pts, SHORT_TEXT_CAP);
    reasons.push("Teks terlalu singkat untuk analisis pola yang meyakinkan.");
  }

  // Single-signal cap: satu pola bukan vonis kuat.
  if (singleSignal) {
    pts = Math.min(pts, SINGLE_SIGNAL_CAP);
  }

  // Skor tiap kalimat independen dari skor dokumen.
  const rawSentScores = sents.map((s, i) => {
    const lw = s.toLowerCase();
    let sc = 30;

    AI_PHRASES.forEach((p) => {
      if (lw.includes(p)) {
        sc += 30;
      }
    });

    const wl = countWords(s);
    if (wl >= 12 && wl <= 28) {
      sc += 6;
    }
    if (wl < 6 || wl > 42) {
      sc -= 10;
    }

    // Personal voice berarti manusia. Kata metodologi
    // tidak dihukum karena bukti riset lapangan.
    if (
      new RegExp("(" + REF_SENT_PERSONAL.join("|") + "|\\?|!)", "i").test(s)
    ) {
      sc -= 28;
    }
    if (new RegExp("(" + REF_SENT_TEMPLATE.join("|") + ")", "i").test(s)) {
      sc += 14;
    }
    if (REF_HEDGE_PATS.some((p) => lw.includes(p))) {
      sc += 14;
    }
    if (acaMarkers < 3 && s1.sentHit.has(i)) {
      sc += S1_SENT_PTS;
    }
    if (ENUM_START.test(s.trimStart())) {
      sc += 10;
    }
    if (
      /\b\d+([.,]\d+)?\b/.test(s) &&
      new RegExp(
        "(19|20)\\d{2}|" + REF_SENT_DATA.join("|") + "|%|\\bsampel\\b",
        "i"
      ).test(s)
    ) {
      sc -= 8;
    }

    const op = lw.split(/\s+/).slice(0, 3).join(" ");
    if (openerSeen[op] > 1) {
      sc += 12;
    }

    return Math.max(2, Math.min(98, sc));
  });

  // Context fusion: smoothing ringan antarkalimat.
  const sentScores = rawSentScores.map((sc, i) => {
    const p = i > 0 ? rawSentScores[i - 1] : sc;
    const n = i + 1 < rawSentScores.length ? rawSentScores[i + 1] : sc;
    return Math.max(
      2,
      Math.min(98, Math.round(sc * 0.88 + p * 0.06 + n * 0.06))
    );
  });

  // Distribusi skor kalimat untuk teks campuran.
  const sorted = [...sentScores].sort((a, b) => a - b);
  const sentMedian = sorted.length
    ? sorted[Math.floor(sorted.length / 2)]
    : 30;
  const sentMean = sentScores.length
    ? sentScores.reduce((a, b) => a + b, 0) / sentScores.length
    : 30;
  const sentSpread = sentScores.length > 1
    ? Math.sqrt(
        sentScores.reduce((a, b) => a + Math.pow(b - sentMean, 2), 0) /
          sentScores.length
      )
    : 0;

  // AI-like bila skor kalimat di atas 50.
  const aiLikeProp = sentScores.length
    ? sentScores.filter((s) => s >= 50).length / sentScores.length
    : 0;
  const sentComponent = sentScores.length
    ? sentMedian * 0.35 + aiLikeProp * 100 * 0.65
    : 30;
  const blendW = sentScores.length
    ? Math.max(
        0,
        Math.min(BLEND_MAX_W, (sentSpread - BLEND_SPREAD_LO) / BLEND_SPREAD_RANGE)
      )
    : 0;

  const finalPts = Math.max(
    2,
    Math.min(98, Math.round(pts * (1 - blendW) + sentComponent * blendW))
  );

  // Confidence dari panjang, jumlah kalimat, sebaran, dan zona skor.
  let confidence = computeConfidence(
    totalW,
    sents.length,
    sentSpread,
    finalPts,
    null
  );

  if (sentSpread > 18 && sents.length > 1) {
    reasons.push(
      `Sebaran skor antar kalimat cukup lebar (±${sentSpread.toFixed(0)}) ` +
        `— konsistensi dipakai sebagai penyesuai confidence (bukan bukti), ` +
        `sehingga confidence diturunkan.`
    );
  }
  if (singleSignal) {
    confidence = "rendah";
  }

  // Teks campuran: confidence turun satu tingkat.
  if (langInfo.mixed) {
    if (confidence === "tinggi") {
      confidence = "sedang";
    } else if (confidence === "sedang") {
      confidence = "rendah";
    }
    reasons.push(
      `Teks campuran dua bahasa terdeteksi ` +
        `(ID ${(langInfo.idProp * 100).toFixed(0)}% / ` +
        `EN ${(langInfo.enProp * 100).toFixed(0)}% function-word) ` +
        `— atribusi bahasa tidak pasti sehingga confidence diturunkan satu tingkat.`
    );
  }

  if (totalW >= MIN_RELIABLE_W && posSig === 0) {
    reasons.push(
      "Tidak ditemukan pola AI yang jelas " +
        "— skor hanya mencerminkan minimnya evidence, bukan bukti kepengarangan."
    );
  }

  return {
    score: Math.round(finalPts),
    reasons,
    sentScores,
    sents,
    detail: {
      totalW,
      ttr,
      burst,
      hits,
      neutralHits,
      bigramDiversity,
      trigramDiversity,
      paraCount,
      paraCV,
      wlCV,
      lang,
      fwRate,
      sentSpread,
      sentMedian,
      aiLikeProp,
      acaMarkers,
      acadLevel: acad.level,
      posSig,
      language: langInfo.language,
      languageConfidence: langInfo.languageConfidence,
      mixed: langInfo.mixed,
      fwId,
      fwEn,
      fwTotal: langInfo.fwTotal,
      idProp: langInfo.idProp,
      enProp: langInfo.enProp,
      rawScore: Math.round(pts),
      calibratedScore: Math.round(finalPts),
      groups: {
        template: tC,
        rhythm: rC,
        structure: sC,
        lexical: lC,
        humanLike: hC,
        acadDamp: Math.min(acadDamp, acadCap),
      },
      classification:
        finalPts >= THR_STRONG_DOC
          ? "terindikasi"
          : finalPts >= THR_MID_DOC
            ? "perlu ditinjau"
            : "cenderung natural",
    },
    confidence,
    lang,
    language: langInfo.language,
    languageConfidence: langInfo.languageConfidence,
    mixed: langInfo.mixed,
  };
}

// Confidence rendah, sedang, atau tinggi dari bukti yang ada.
function computeConfidence(totalW, sentsN, sentSpread, score, coverage) {
  let c = 1;
  if (totalW < 50) {
    c *= 0.5;
  } else if (totalW < 80) {
    c *= 0.7;
  }
  if (sentsN < 3) {
    c *= 0.55;
  } else if (sentsN < 5) {
    c *= 0.8;
  }
  if (sentSpread > 18) {
    c *= 0.75;
  }
  if (score >= 38 && score <= 62) {
    c *= 0.7;
  }
  if (typeof coverage === "number" && coverage < 1) {
    c *= 0.85;
  }

  return c >= 0.75 ? "tinggi" : c >= 0.45 ? "sedang" : "rendah";
}

// Model lokal dimuat malas agar tombol dan upload
// tetap jalan walau CDN offline.
async function loadPipeline() {
  if (pipeLoader) {
    return pipeLoader;
  }

  pipeLoader = (async () => {
    const mod = await import(
      "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2"
    );
    try {
      mod.env.allowLocalModels = false;
    } catch (_) {}
    return mod.pipeline;
  })();

  try {
    return await pipeLoader;
  } catch (e) {
    pipeLoader = null;
    throw e;
  }
}

async function getLocalPipe() {
  if (localPipe) {
    return localPipe;
  }

  if (localLoading) {
    while (localLoading) {
      await new Promise((r) => setTimeout(r, 300));
    }
    return localPipe;
  }

  localLoading = true;
  statusEl.textContent = "Download model lokal sekali (±130MB, cache otomatis)...";

  try {
    const pipeline = await loadPipeline();
    localPipe = await pipeline(
      "text-classification",
      "Xenova/roberta-base-openai-detector"
    );
    statusEl.textContent = "Model lokal siap.";
  } catch (e) {
    console.warn(e);
    localPipe = null;
    statusEl.textContent =
      "Model lokal gagal (offline?) → heuristik saja. Upload & cek tetap jalan.";
  }

  localLoading = false;
  return localPipe;
}

// Nilai teks per potongan, kembalikan persen AI atau null.
async function localScore(main) {
  const pipe = await getLocalPipe();
  if (!pipe) {
    localParts = null;
    return null;
  }

  const chunks = [];
  let cur = "";
  splitSentences(main).forEach((s) => {
    if ((cur + " " + s).length > 900) {
      if (cur) {
        chunks.push(cur);
      }
      cur = s;
    } else {
      cur = (cur + " " + s).trim();
    }
  });
  if (cur) {
    chunks.push(cur);
  }

  const use = chunks.slice(0, MAX_CHUNKS);
  let sum = 0;
  let n = 0;

  for (const c of use) {
    try {
      const out = await pipe(c.slice(0, 512), { truncation: true });
      let ai = 0;

      out.forEach((o) => {
        const l = (o.label || "").toLowerCase();
        if (/fake|ai|generated|machine|artificial/.test(l)) {
          ai = Math.max(ai, o.score * 100);
        }
      });

      const hum = out.find((o) => /real|human/i.test(o.label || ""));
      if (hum && ai === 0) {
        ai = (1 - hum.score) * 100;
      }

      // Label tak dikenal dilewati, jangan ditebak.
      if (ai === 0 && !hum) {
        continue;
      }

      sum += ai;
      n++;
      statusEl.textContent = `Model lokal: ${n}/${use.length} potongan...`;
    } catch (e) {
      console.warn(e);
    }
  }

  // Lapor jujur bila model hanya baca sebagian.
  localParts = { n, of: use.length };
  return n ? Math.round(sum / n) : null;
}
