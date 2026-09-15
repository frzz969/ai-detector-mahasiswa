// ============================================================
// detector.js — Mesin nilai: olah teks + heuristik + model lokal
// File 2 dari 4. Butuh: core.js (duluan).
// Cek error: pustaka ikut dinilai / skor aneh / model gagal
// → buka file ini.
// ============================================================

// ---------- Olah teks ----------

// Cari heading "Daftar Pustaka" di ~80 baris akhir, pisahkan agar
// sitasi tidak ikut menaikkan skor AI.
function splitReferences(t) {
  const lines = t.split(/\n/);
  let idx = -1;
  const start = Math.max(0, lines.length - 80);

  for (let i = lines.length - 1; i >= start; i--) {
    const l = lines[i].trim().toLowerCase();
    if (!l) continue;
    const isHead = REF_HEADS.some(
      (h) => l === h || l.startsWith(h + " ") || l.startsWith(h + ":")
    );
    const isDaftar = l.includes("daftar pustaka") && l.length < 40;
    if (isHead || isDaftar) { idx = i; break; }
  }

  if (idx === -1) {
    let last = -1;
    lines.forEach((ln, i) => {
      if (REF_HEADS.includes(ln.trim().toLowerCase())) last = i;
    });
    idx = last;
  }

  if (idx === -1) return { main: t, refs: "", cut: 0 };

  const main = lines.slice(0, idx).join("\n");
  const refs = lines.slice(idx).join("\n");
  // Jangan potong kalau teks utama kependekan (mungkin bukan pustaka)
  if (countWords(main) < 50) return { main: t, refs: "", cut: 0 };
  return { main, refs, cut: countWords(refs) };
}

// Buang sitasi/URL/DOI agar tidak mengacaukan statistik kata.
function cleanAcademic(t) {
  return t
    .replace(/\[\d+(\s*[-–,]\s*\d+)*\]/g, " ")
    .replace(/\([A-Z][a-z]+(?: et al\.)?,?\s?\d{4}[a-z]?\)/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\bDOI:\S+/gi, " ");
}

// Pecah jadi kalimat (buang yang <=3 kata).
function splitSentences(t) {
  const norm = t.replace(/\s+/g, " ").trim();
  if (!norm) return [];
  return (norm.match(/[^.!?]+[.!?]+["”']?|\S.+$/g) || [norm])
    .map((s) => s.trim())
    .filter((s) => countWords(s) > 3);
}

// Token kata huruf-kecil (untuk TTR & statistik).
function words(t) {
  return t.toLowerCase().match(/[\p{L}\p{N}']+/gu) || [];
}

// ---------- Konteks akademik LOW/MEDIUM/HIGH (Fase 2) ----------
// detector-rules §4: sitasi/data/metodologi = academic convention, bukan
// bukti AI. Level dihitung dari densitas sitasi, istilah teknis/metode,
// angka+nama, section formal, dan frasa formal. Dipakai untuk dampening
// SELEKTIF (sinyal lemah ritme/konektor) — bukti struktural kuat
// (opener berulang/enumerasi/repetisi ide) tetap berpengaruh penuh.
function academicContext(o) {
  const techHits = o.acaMeth;
  const secHits = (o.low.match(/\b(pendahuluan|metode|metodologi|hasil|pembahasan|kesimpulan|abstrak|tujuan penelitian|populasi|sampel|responden|kuesioner|observasi|wawancara|uji |analisis data)\b/gi) || []).length;
  const formHits = (o.low.match(/\b(berdasarkan|tersebut|adapun|sebagaimana|terlampir|dengan hormat)\b/gi) || []).length;
  const citeD = o.acaCite, numD = o.numbers + o.properNouns;
  let level = "LOW";
  if ((o.acaMarkers >= 5 && numD >= 4) || (citeD >= 2 && techHits >= 2) || (secHits >= 3 && numD >= 4)) level = "HIGH";
  else if (o.acaMarkers >= 3 || secHits >= 2 || (citeD >= 1 && techHits >= 1)) level = "MEDIUM";
  return { level, citeD, techHits, secHits, formHits, numD };
}

// ---------- Heuristik skor AI (offline, tanpa model) ----------
// Pola "manfaat generik", penghubung, enumerasi, istilah metodologi,
// suara personal, frasa generik, ekspresi hidup, dan daftar level kalimat
// SEMUA berasal dari referensi.js (REF_CONNECTORS, REF_HEDGE_PATS,
// REF_ENUM_ID/EN, REF_ACADEMIC_METH, REF_PERSONAL_VOICE, REF_FLUFFY,
// REF_VOICE_LIVE, REF_SENT_PERSONAL/TEMPLATE/DATA) — lihat provenance
// per grup di referensi.js. Detector hanya menyusun regex dari data itu.
// Multi-signal: variasi ritme (kalimat + kata + paragraf), kekayaan kata,
// frasa generik, konektor, pola 12-28, suara personal, tanda hidup,
// data konkret, pembuka berulang, repetisi ide, template generik,
// ditambah sinyal pendukung: diversity n-gram, struktur paragraf,
// deteksi bahasa (ID/EN).
// Output 15–98 + skor per kalimat (highlight) + confidence
// (rendah/sedang/tinggi) + bahasa terdeteksi (id/en).
function heuristic(text) {
  const clean = cleanAcademic(text);

  // --- Struktur paragraf DIPERTAHANKAN sebelum di-flatten. Literatur:
  // teks satu paragraf sering salah terflag AI; paragraf yang jumlah dan
  // panjangnya bervariasi adalah ciri tulisan manusia.
  const paras = clean.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const paraCount = paras.length;
  const paraLens = paras.map((p) => countWords(p));
  const paraMean = paraLens.length ? paraLens.reduce((a, b) => a + b, 0) / paraLens.length : 0;
  const paraStd = paraLens.length > 1
    ? Math.sqrt(paraLens.reduce((a, b) => a + Math.pow(b - paraMean, 2), 0) / paraLens.length)
    : 0;
  const paraCV = paraMean ? paraStd / paraMean : 0;

  const sents = splitSentences(clean);
  const w = words(clean);

  const totalW = w.length;
  const ttr = totalW ? new Set(w).size / totalW : 0;

  const lens = sents.map((s) => countWords(s));
  const mean = lens.length ? lens.reduce((a, b) => a + b, 0) / lens.length : 0;
  const std = lens.length
    ? Math.sqrt(lens.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / lens.length)
    : 0;
  const burst = mean ? std / mean : 0;

  // --- Variasi panjang kata: kata dengan panjang seragam = mekanis ---
  const wlens = w.map((x) => x.length);
  const wlMean = wlens.length ? wlens.reduce((a, b) => a + b, 0) / wlens.length : 0;
  const wlStd = wlens.length
    ? Math.sqrt(wlens.reduce((a, b) => a + Math.pow(b - wlMean, 2), 0) / wlens.length)
    : 0;
  const wlCV = wlMean ? wlStd / wlMean : 0;

  // --- Diversity n-gram: pengulangan pola kata = repetisi mekanis ---
  const bigrams = [], trigrams = [];
  for (let i = 0; i + 1 < w.length; i++) bigrams.push(w[i] + " " + w[i + 1]);
  for (let i = 0; i + 2 < w.length; i++) trigrams.push(w[i] + " " + w[i + 1] + " " + w[i + 2]);
  const bigramDiversity = bigrams.length ? new Set(bigrams).size / bigrams.length : 1;
  const trigramDiversity = trigrams.length ? new Set(trigrams).size / trigrams.length : 1;

  // --- Deteksi bahasa (function word ratio) untuk konteks + bobot model ---
  let fwId = 0, fwEn = 0;
  w.forEach((t) => {
    if (ID_FW.has(t)) fwId++;
    if (EN_FW.has(t)) fwEn++;
  });
  const lang = fwEn > fwId && fwEn > 0 ? "en" : "id";
  const fwRate = totalW ? Math.max(fwId, fwEn) / totalW : 0;

  const low = clean.toLowerCase();
  // Frasa generik (AI) vs frasa akademik netral (bukan bukti AI — lihat
  // detector-rules §3: "penelitian ini bertujuan", "selain itu", dll.
  // adalah bahasa akademik normal, jangan dihukum).
  let hits = 0, neutralHits = 0;
  AI_PHRASES.forEach((p) => { if (low.includes(p)) hits++; });
  ACAD_NEUTRAL.forEach((p) => { if (low.includes(p)) neutralHits++; });

  const conn = (low.match(new RegExp("\\b(" + REF_CONNECTORS.join("|") + ")\\b", "g")) || []).length;
  const connRate = sents.length ? conn / sents.length : 0;

  // Frasa "manfaat generik" (template) + pola enumerasi kaku
  // ("Pertama... Kedua...") — dihitung per kalimat, bukan per kemunculan.
  const hedgeSents = sents.filter((s) => {
    const lw = s.toLowerCase();
    return REF_HEDGE_PATS.some((p) => lw.includes(p));
  }).length;
  // Enumerasi kaku ("Pertama... Kedua...", "First, ... Finally, ...") —
  // hanya kalimat yang DIAWALI penanda daftar, supaya "first day" atau
  // "finally make sense" dalam bahasa alami tidak ikut terhitung.
  const ENUM_START = new RegExp("^(" + REF_ENUM_ID.join("|") + ")[,\\s]|^(" + REF_ENUM_EN.join("|") + ")[,\\s]", "i");
  const enumSents = sents.filter((s) => ENUM_START.test(s.trimStart())).length;

  // Statistik akademik & konkret (dipakai beberapa sinyal + dampening)
  const acaCite = (text.match(/\[\d+(\s*[-–,]\s*\d+)*\]|\([^()]{0,50}?\b(19|20)\d{2}[a-z]?\)|et al\.|\bdoi\b|https?:\/\//gi) || []).length;
  const acaMeth = (low.match(new RegExp("\\b(" + REF_ACADEMIC_METH.join("|") + ")\\b", "gi")) || []).length;
  const numbers = (clean.match(/\b\d+([.,]\d+)?\b/g) || []).length;
  const properNouns = new Set((clean.match(/\s[A-ZÀ-Þ][a-zà-ÿ]+/g) || []).map((s) => s.trim().toLowerCase())).size;
  const acaMarkers = acaCite + Math.min(acaMeth, 4) + (numbers + properNouns >= 4 ? 2 : 0);
  const strongAcad = acaMarkers >= 5 && numbers + properNouns >= 4;

  const reasons = [];
  // --- Evidence groups (Fase 2, detector-rules §3-§4): tiap family
  // diakumulasi terpisah lalu di-CAP per grup — menghilangkan
  // double-counting (burst+ideal satu atap RHYTHM; hits+hedge+fluffy+
  // scaffolding satu atap TEMPLATE). Offset human-like di-cap
  // HUMAN_LIKE_MAX: mengimbangi skor, bukan proof-human. connPts dilacak
  // terpisah agar damp akademik selektif hanya menyentuh sinyal lemah.
  let gTemplate = 0, gRhythm = 0, gStructure = 0, gLexical = 0;
  let hLike = 0, rhythmPos = 0, connPts = 0;

  // 1) Variasi panjang kalimat: pola seragam sering ditemukan pada teks generatif.
  // Bobot moderat — keseragaman saja bukti lemah (ref-1: template/repetisi
  // lebih diagnostik daripada sekadar ritme; detector-rules §3).
  if (sents.length >= 5) {
    if (burst < 0.3) {
      gRhythm += 14; rhythmPos += 14;
      // Ritme kalimat seragam TAPI variasi kata/paragraf kaya → bukan
      // otomatis mekanis (menghindari FP pada tulisan ilmiah formal).
      if (wlCV >= 0.55 || (paraCount >= 2 && paraCV >= 0.4)) {
        hLike += 6;
        reasons.push(`Variasi kalimat seragam (${burst.toFixed(2)}) tetapi variasi kata/paragraf cukup (kata ${wlCV.toFixed(2)}, paragraf ${paraCV.toFixed(2)}) — tidak serta-merta mekanis.`);
      } else {
        reasons.push(`Variasi kalimat cukup seragam (${burst.toFixed(2)}) — pola yang sering ditemukan pada teks generatif.`);
      }
    }
    else if (burst < 0.45) { gRhythm += 7; rhythmPos += 7; reasons.push(`Variasi kalimat agak seragam (${burst.toFixed(2)}).`); }
    else                   { hLike += 8;  reasons.push(`Variasi kalimat cukup alami (${burst.toFixed(2)}) — pola yang umum pada tulisan manusia.`); }
  } else if (sents.length >= 3 && burst < 0.2) {
    gRhythm += 8; rhythmPos += 8;
    reasons.push(`Ritme kalimat sangat datar (${burst.toFixed(2)}).`);
  }

  // 2) Kekayaan kata + frasa generik + konektor formal
  // Satu kata/frasa bukan bukti — yang dinilai gabungan frekuensi + konteks.
  if (totalW > LEX_MIN_W) {
    if (ttr > 0.25 && ttr < 0.55 && hits > 0) reasons.push(`TTR ${ttr.toFixed(2)} disertai frasa generik — terdapat indikasi pola generatif.`), gLexical += 12;
    if (ttr >= 0.65) reasons.push(`TTR tinggi ${ttr.toFixed(2)} — kosakata bervariasi seperti tulisan manusia.`), hLike += 10;
    if (ttr < 0.2)   reasons.push(`Pengulangan kata cukup tinggi (${ttr.toFixed(2)}).`), gLexical += 8;
  }

  // Diversity n-gram: repetisi pola = mekanis (hanya teks cukup panjang;
  // pada teks pendek diversity natural tinggi sehingga tidak dihukum).
  if (totalW > MED_MIN_W) {
    if (bigramDiversity < 0.45 || trigramDiversity < 0.55) {
      gLexical += 8;
      reasons.push(`Pola kata berulang cukup tinggi (bigram ${bigramDiversity.toFixed(2)}, trigram ${trigramDiversity.toFixed(2)}) — frasa yang sama terpakai berulang.`);
    } else if (trigramDiversity > 0.75 && ttr >= 0.55) {
      hLike += 6;
      reasons.push(`Pola kata bervariasi (trigram ${trigramDiversity.toFixed(2)}) — pilihan kata tidak monoton.`);
    }
  }

  if (hits > 0) {
    // Frasa template eksplisit = evidence STRONG berpresisi tinggi
    // (train+val: teks manusia hits=0) — bobot per hit 12, ter-cap grup.
    gTemplate += Math.min(30, hits * 12);
    reasons.push(`${hits} frasa template/generik ditemukan — perlu ditinjau dalam konteks kalimatnya.`);
  }

  if (connRate > 0.4) {
    gLexical += 12; connPts += 12;
    reasons.push(`Kata penghubung formal cukup sering berulang (${connRate.toFixed(2)}/kalimat) — yang dinilai polanya, bukan pemakaiannya.`);
  }

  // 5) Pola rapi 12–28 kata yang terlalu dominan
  const ideal = lens.filter((l) => l >= 12 && l <= 28).length;
  if (lens.length >= 5 && ideal / lens.length > 0.8) {
    gRhythm += 8; rhythmPos += 8;
    reasons.push(`80%+ kalimat 12-28 kata — ritme terlalu rapi, perlu ditinjau.`);
  }

  // 6) Suara personal vs netral generik: opini/pengalaman = manusia.
  // hasTemplateEv memastikan ketiadaan "saya" pada teks akademik formal
  // (register skripsi/jurnal lazim impersonal) tidak dihitung sebagai
  // bukti AI — kecuali ada bukti template (detector-rules §4).
  const hasTemplateEv = hits > 0 || hedgeSents >= 2 || enumSents >= 2
    || (neutralHits >= 2 && acaMarkers < 3);
  const personalHits = (clean.match(new RegExp("\\b(" + REF_PERSONAL_VOICE.join("|") + ")\\b", "gi")) || []).length;
  const personalRate = sents.length ? personalHits / sents.length : 0;
  if (sents.length >= 3) {
    if (personalRate >= 0.2) { hLike += 12; reasons.push(`Ada suara personal/opini (${personalHits}x) — sudut pandang penulis terasa.`); }
    else if (personalRate === 0 && totalW >= IMPERS_MIN_W) {
      // Gerbang 50 (bukan 80): train+val menunjukkan formal manusia
      // 50-80 kata selalu bersuara personal ("kami") atau akademik
      // bermarker — absennya suara + bukti template = generik.
      if (acaMarkers >= 3 && !hasTemplateEv) {
        reasons.push(`Nada impersonal pada teks akademik (register formal) — bukan bukti AI.`);
      } else { gLexical += 8; reasons.push(`Belum ada sudut pandang personal — tulisan terdengar generik.`); }
    }
  }

  // 7) Tanda tulisan "hidup": tanya, seru, kutipan langsung
  const lively = (clean.match(/[?!…]|"[^"]+"|“[^”]+”/g) || []).length;
  if (lively >= 2) { hLike += 8; reasons.push(`${lively}x tanda tanya/seru/kutipan — tulisan terasa hidup.`); }

  // 8) Data konkret (angka/nama) menguatkan konteks spesifik
  if (numbers + properNouns >= 4) { hLike += 6; reasons.push(`Ada detail konkret (${numbers} angka, ${properNouns} nama) — konteksnya spesifik.`); }

  // 8b) Struktur paragraf: banyak + bervariasi = manusia; satu blok datar
  // panjang tanpa paragraf = struktur generatif (lihat riset 2025).
  if (sents.length >= 4) {
    if (paraCount >= 2 && paraCV >= 0.35) {
      hLike += 4;
      reasons.push(`Paragraf terstruktur dan bervariasi (${paraCount} paragraf) — seperti tulisan manusia.`);
    } else if (paraCount === 1 && totalW > 120) {
      gStructure += 5;
      reasons.push(`Seluruh teks satu paragraf panjang — strukturnya datar, perhatikan organisasi tulisan.`);
    }
  }

  // 9) Pembuka kalimat berulang = struktur monoton khas AI
  const openers = sents.map((s) => s.toLowerCase().split(/\s+/).slice(0, 3).join(" "));
  const openerSeen = {};
  openers.forEach((o) => { openerSeen[o] = (openerSeen[o] || 0) + 1; });
  if (sents.length >= 6) {
    const openRatio = new Set(openers).size / sents.length;
    if (openRatio < 0.6)       { gStructure += 10; reasons.push(`Pembuka kalimat banyak berulang — struktur terasa monoton.`); }
    else if (openRatio > 0.85) { hLike += 6;  reasons.push(`Pembuka kalimat bervariasi — struktur cukup alami.`); }
  }

  // 10) Repetisi gagasan (ide yang sama di kalimat berbeda) — sarankan gabung.
  if (sents.length >= 4 && sents.length <= 300) {
    const bags = sents.map((s) => new Set((s.toLowerCase().match(/[\p{L}]{4,}/gu) || [])));
    let pairs = 0;
    for (let i = 0; i < bags.length; i++) {
      for (let j = i + 1; j < bags.length && pairs < 2; j++) {
        const a = bags[i], b = bags[j];
        if (!a.size || !b.size) continue;
        let inter = 0;
        a.forEach((x) => { if (b.has(x)) inter++; });
        if (inter / (a.size + b.size - inter) > 0.55) { pairs++; break; }
      }
    }
    if (pairs >= 2) { gStructure += 8; reasons.push(`${pairs} pasang kalimat menyampaikan ide yang mirip — pertimbangkan digabung agar tidak repetitif.`); }
  }

  // 11) Bahasa template generik vs suara khas manusia
  const fluffy = (low.match(new RegExp("\\b(" + REF_FLUFFY.join("|") + ")\\b", "g")) || []).length;
  const fluffyRef = REF_FLUFF_EXTRA.filter((p) => low.includes(p)).length;
  const fluffyAll = fluffy + fluffyRef;
  const fluffyRate = sents.length ? fluffyAll / sents.length : 0;
  if (fluffyRate > 0.3 && totalW > MED_MIN_W) { gTemplate += 8; reasons.push(`Frasa generik cukup sering (${fluffyAll}x) — tulisan terdengar umum, perlu konteks spesifik.`); }
  const voiceHits = (clean.match(new RegExp("\\b(" + REF_VOICE_LIVE.join("|") + ")\\b", "gi")) || []).length;
  const voiceRef = REF_VOICE_EXTRA.filter((p) => low.includes(p)).length;
  const voiceAll = voiceHits + voiceRef;
  if (voiceAll >= 3) { hLike += 8; reasons.push(`Ada variasi ekspresi (${voiceAll}x: ajakan, manfaat, perumpamaan) — gaya cukup hidup.`); }

  // 12) Frasa manfaat generik (template AI). Ini bedanya dengan akademik
  // asli: objeknya kabur ("kualitas", "efektivitas", "dampak positif")
  // dan dipakai berpola — bukan pernyataan spesifik berbasis data.
  if (hedgeSents >= 1 && totalW >= HEDGE_MIN_W) {
    gTemplate += Math.min(18, hedgeSents * 6);
    reasons.push(`${hedgeSents} kalimat memakai frasa manfaat generik ("dapat meningkatkan", "memberikan manfaat", "berperan penting") — ciri bahasa template hasil model.`);
  }

  // 13) Enumerasi kaku ("Pertama... Kedua...") — struktur daftar template.
  if (enumSents >= 2) {
    gStructure += 10;
    reasons.push(`${enumSents} kalimat memakai pola enumerasi ("Pertama... Kedua...") — struktur daftar khas template.`);
  }

  // Academic context (Fase 2, detector-rules §4): level LOW/MEDIUM/HIGH
  // dari academicContext() → dampening SELEKTIF pada sinyal LEMAH
  // (uniformitas ritme, konektor formal) yang dijelaskan konvensi formal.
  // Bukti struktural kuat (template hits, enumerasi, repetisi) TIDAK
  // didiskon — formalitas menjelaskan keseragaman, bukan frasa template.
  const acad = academicContext({ low, acaCite, acaMeth, numbers, properNouns, acaMarkers });
  const acadCap = acad.level === "HIGH" ? ACAD_DAMP_HIGH : acad.level === "MEDIUM" ? ACAD_DAMP_MED : ACAD_DAMP_LOW;
  let acadDamp = 0;
  // Fase 3 cleanup (Gate 2 nit residu double-damp): diskon ritme 50% di
  // atas SUDAH final untuk porsi ritme — weakPool di bawah hanya menampung
  // sinyal lemah lain (konektor) bila ritme sudah didiskon, supaya porsi
  // yang sama tidak didiskon dua kali. RHYTHM_MAX tetap efektif via cap
  // rC di bawah (burst 14 + ideal 8 = 22 > 20 → cap mengikat).
  let rhythmDiscounted = false;
  if (totalW >= MIN_RELIABLE_W && acad.level !== "LOW") {
    reasons.push(`Konteks akademik ${acad.level} terdeteksi (sitasi/data/metodologi) — formalitas di sini kemungkinan academic convention; confidence disesuaikan.`);
    if (!hasTemplateEv && rhythmPos > 0) {
      const disc = Math.round(rhythmPos * 0.5);
      gRhythm -= disc;
      rhythmPos = 0;
      rhythmDiscounted = true;
      reasons.push(`Keseragaman ritme pada teks akademik tanpa bukti template — dijelaskan konvensi formal, bobot uniformitas dikurangi.`);
    }
    const weakPool = (rhythmDiscounted ? 0 : Math.max(0, gRhythm)) + Math.min(connPts, 12);
    acadDamp = Math.min(acadCap, weakPool);
    if (hits === 0 && connRate <= 0.4 && acad.level === "HIGH") {
      acadDamp = Math.min(acadCap, acadDamp + 4);
      reasons.push(`Pola yang ada hanya formalitas umum tulisan akademik — indikasi tetap rendah.`);
    }
  }
  // Bukti riset lengkap (metodologi + data + sitasi) = indikasi kuat tulisan
  // manusia formal; frasa akademik netral di sini ikut ditegaskan bukan AI.
  if (totalW >= MIN_RELIABLE_W && strongAcad) {
    hLike += 4;
    reasons.push(`Bukti riset lengkap (metodologi, data, sitasi) — gaya formal ini lazim pada tulisan akademik manusia.`);
  }
  if (neutralHits > 0 && acaMeth > 0) {
    reasons.push(`${neutralHits} frasa akademik standar (mis. "penelitian ini bertujuan", "selain itu") terdeteksi — bahasa akademik normal, tidak dihitung sebagai indikasi AI.`);
  }
  // Frasa akademik netral yang DIPAKAI BERULANG tanpa substansi riset
  // (metodologi/data/sitasi) = scaffolding generatif. Berulang di sini
  // beda dengan "sekali-sekali di tulisan akademik asli" — yang asli
  // disertai isi (data, metode, sitasi) sehingga lewat cabang netral.
  if (neutralHits >= 2 && acaMarkers < 3) {
    gTemplate += Math.min(18, (neutralHits - 1) * 9);
    reasons.push(`Frasa akademik dipakai berulang (${neutralHits}x) tanpa dukungan data/metodologi/sitasi — scaffolding khas teks generatif.`);
  }

  // Contextual signal count (detector-rules §3: satu sinyal bukan bukti).
  // Gerbang diselaraskan dengan gerbang scoring di atas (hedge >= 1,
  // TTR > LEX_MIN_W, n-gram/fluffy > MED_MIN_W) — inkonsistensi hedge>=2
  // vs >=1 pada versi lama diperbaiki: satu kalimat template tetap dihitung
  // sebagai satu sinyal.
  const posSig = (sents.length >= 5 && burst < 0.45 ? 1 : 0)
    + (totalW > LEX_MIN_W && ttr > 0.25 && ttr < 0.55 && hits > 0 ? 1 : 0)
    + (totalW > LEX_MIN_W && ttr < 0.2 ? 1 : 0)
    + (hits > 0 ? 1 : 0)
    + (connRate > 0.4 ? 1 : 0)
    + (lens.length >= 5 && ideal / lens.length > 0.8 ? 1 : 0)
    + (sents.length >= 3 && personalRate === 0 && totalW >= IMPERS_MIN_W ? 1 : 0)
    + (totalW > MED_MIN_W && (bigramDiversity < 0.45 || trigramDiversity < 0.55) ? 1 : 0)
    + (sents.length >= 6 && (new Set(openers).size / sents.length) < 0.6 ? 1 : 0)
    + (fluffyRate > 0.3 && totalW > MED_MIN_W ? 1 : 0)
    + (hedgeSents >= 1 && totalW >= HEDGE_MIN_W ? 1 : 0)
    + (enumSents >= 2 || (neutralHits >= 2 && acaMarkers < 3) ? 1 : 0);
  const singleSignal = totalW >= MIN_RELIABLE_W && posSig <= 1;
  if (singleSignal) {
    reasons.push(`Hanya satu pola terdeteksi — belum cukup untuk indikasi kuat (perlu multiple signals + konteks).`);
  }

  if (totalW < MIN_RELIABLE_W) {
    reasons.push(`Teks <${MIN_RELIABLE_W} kata — statistik gaya bahasa belum bermakna, tambah ke 200+ kata.`);
  }

  // Evidence-based adjustment (Fase 2): skor = anchor netral + evidence
  // berbobot per grup (ter-cap) − offset human-like (ter-cap) − damp
  // akademik selektif. Tanpa prior tetap: teks tanpa evidence jatuh dekat
  // floor; clamp anti-nol [SCORE_FLOOR, SCORE_CEIL] dipertahankan.
  const tC = Math.min(gTemplate, TEMPLATE_MAX);
  const rC = Math.max(0, Math.min(gRhythm, RHYTHM_MAX));
  const sC = Math.min(gStructure, STRUCTURE_MAX);
  const lC = Math.min(gLexical, LEXICAL_MAX);
  const hC = Math.min(hLike, HUMAN_LIKE_MAX);
  let pts = SCORE_ANCHOR + tC + rC + sC + lC - hC - Math.min(acadDamp, acadCap);
  pts = Math.max(SCORE_FLOOR, Math.min(SCORE_CEIL, pts));
  // Teks pendek tidak boleh ber-confidence tinggi — bukti frasa tetap
  // terbaca, tapi jangan memaksakan kesimpulan dari beberapa kalimat.
  // Ini proteksi ketidakpastian, bukan vonis manusia (detector-rules §4).
  if ((totalW < SHORT_W || sents.length < SHORT_SENTS) && totalW > 0) {
    pts = Math.min(pts, SHORT_TEXT_CAP);
    reasons.push(`Teks terlalu singkat untuk analisis pola yang meyakinkan.`);
  }
  // Single-signal hard-cap (detector-rules §3): satu-dua pola saja tidak
  // boleh menjadi vonis kuat — cap skor ekstrem + confidence rendah.
  if (singleSignal) {
    pts = Math.min(pts, SINGLE_SIGNAL_CAP);
  }

  // --- Skor tiap kalimat (INDEPENDEN dari skor dokumen): anchor netral 30.
  // Kalimat dengan frasa generik/pola rapi naik; kalimat personal/data
  // turun. Dipakai untuk highlight + deteksi teks campuran.
  const rawSentScores = sents.map((s) => {
    const lw = s.toLowerCase();
    let sc = 30;
    AI_PHRASES.forEach((p) => { if (lw.includes(p)) sc += 30; });
    const wl = countWords(s);
    if (wl >= 12 && wl <= 28) sc += 6;
    if (wl < 6 || wl > 42) sc -= 10;
    // Personal voice: opini/pengalaman penulis = tanda manusia. Kata
    // metodologi (observasi/wawancara/kkn) TIDAK dihukum di level kalimat
    // — itu justru bukti riset lapangan manusia, bukan gaya AI.
    if (new RegExp("(" + REF_SENT_PERSONAL.join("|") + "|\\?|!)", "i").test(s)) sc -= 28;
    if (new RegExp("(" + REF_SENT_TEMPLATE.join("|") + ")", "i").test(s)) sc += 14;
    if (REF_HEDGE_PATS.some((p) => lw.includes(p))) sc += 14;          // manfaat generik
    if (acaMarkers < 3 && ACAD_NEUTRAL.some((p) => lw.includes(p))) sc += 14; // konektor akademik tanpa substansi
    if (ENUM_START.test(s.trimStart())) sc += 10; // enumerasi kalimat
    if (/\b\d+([.,]\d+)?\b/.test(s) && (new RegExp("(19|20)\\d{2}|" + REF_SENT_DATA.join("|") + "|%|\\bsampel\\b", "i").test(s))) sc -= 8;
    const op = lw.split(/\s+/).slice(0, 3).join(" ");
    if (openerSeen[op] > 1) sc += 12;
    return Math.max(2, Math.min(98, sc));
  });
  // Konteks antar kalimat (context fusion): smoothing ringan supaya
  // kalimat netral di antara kalimat berisiko ikut sedikit terangkat dan
  // sebaliknya — pola penulis campuran (mixed) tidak terlewat.
  const sentScores = rawSentScores.map((sc, i) => {
    const p = i > 0 ? rawSentScores[i - 1] : sc;
    const n = i + 1 < rawSentScores.length ? rawSentScores[i + 1] : sc;
    return Math.max(2, Math.min(98, Math.round(sc * 0.88 + p * 0.06 + n * 0.06)));
  });

  // --- Distribusi skor kalimat → komponen kalimat (median + proporsi
  // kalimat AI-like). Dipakai untuk teks campuran: kalimat seragam → skor
  // sinyal dokumen dominan; kalimat sangat bervariasi → geser ke bukti
  // kalimat (median + proporsi) karena ini tanda campuran human+AI.
  const sorted = [...sentScores].sort((a, b) => a - b);
  const sentMedian = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 30;
  const sentMean = sentScores.length ? sentScores.reduce((a, b) => a + b, 0) / sentScores.length : 30;
  const sentSpread = sentScores.length > 1
    ? Math.sqrt(sentScores.reduce((a, b) => a + Math.pow(b - sentMean, 2), 0) / sentScores.length)
    : 0;
  // Kalimat dianggap "AI-like" bila >= 50 (anchor netral 30 → butuh
  // minimal satu-dua pola template). Median + proporsi AI-like dipakai
  // sebagai bukti kalimat bila kalimat-kalimat dokumen heterogen —
  // ciri teks campuran (hybrid human+AI).
  const aiLikeProp = sentScores.length ? sentScores.filter((s) => s >= 50).length / sentScores.length : 0;
  const sentComponent = sentScores.length ? sentMedian * 0.35 + aiLikeProp * 100 * 0.65 : 30;
  const blendW = sentScores.length ? Math.max(0, Math.min(BLEND_MAX_W, (sentSpread - BLEND_SPREAD_LO) / BLEND_SPREAD_RANGE)) : 0;

  const finalPts = Math.max(2, Math.min(98, Math.round(pts * (1 - blendW) + sentComponent * blendW)));

  // --- Confidence (jangan palsu): panjang teks, jumlah kalimat, sebaran
  // skor kalimat (sinyal berbeda-beda = ragu), zona abu-abu, cakupan model.
  // Konsistensi (sentSpread) adalah CONFIDENCE MODIFIER eksplisit, bukan
  // evidence: sebaran lebar antar kalimat menurunkan confidence tanpa
  // menambah/mengurangi poin (detector-rules §3: satu sinyal bukan bukti).
  // Agregasi blendW di atas hanya bobot fusi kalimat-dokumen, bukan vonis.
  // Satu-dua pola saja (detector-rules §4) atau tanpa bukti AI → confidence
  // rendah: skor tanpa evidence bukan vonis.
  let confidence = computeConfidence(totalW, sents.length, sentSpread, finalPts, null);
  if (sentSpread > 18 && sents.length > 1) {
    reasons.push(`Sebaran skor antar kalimat cukup lebar (±${sentSpread.toFixed(0)}) — konsistensi dipakai sebagai penyesuai confidence (bukan bukti), sehingga confidence diturunkan.`);
  }
  if (singleSignal) confidence = "rendah";
  if (totalW >= MIN_RELIABLE_W && posSig === 0) {
    reasons.push(`Tidak ditemukan pola AI yang jelas — skor hanya mencerminkan minimnya evidence, bukan bukti kepengarangan.`);
  }

  return {
    score: Math.round(finalPts),
    reasons, sentScores, sents,
    detail: {
      totalW, ttr, burst, hits, neutralHits,
      bigramDiversity, trigramDiversity, paraCount, paraCV, wlCV,
      lang, fwRate, sentSpread, sentMedian, aiLikeProp, acaMarkers,
      acadLevel: acad.level, posSig,
      // Calibration layer (Fase 3): raw = skor evidence dokumen
      // pasca-cap pra-fusi kalimat; calibrated = skor tampil (pasca-fusi).
      // Display memakai calibrated; raw hanya untuk audit perbandingan.
      rawScore: Math.round(pts), calibratedScore: Math.round(finalPts),
      groups: { template: tC, rhythm: rC, structure: sC, lexical: lC, humanLike: hC, acadDamp: Math.min(acadDamp, acadCap) },
      classification: finalPts >= THR_STRONG_DOC ? "terindikasi" : finalPts >= THR_MID_DOC ? "perlu ditinjau" : "cenderung natural",
    },
    confidence, lang,
  };
}

// Confidence rendah/sedang/tinggi berdasarkan bukti yang benar-benar ada.
// coverage = proporsi teks yang dibaca model lokal (null bila model mati).
function computeConfidence(totalW, sentsN, sentSpread, score, coverage) {
  let c = 1;
  if (totalW < 50) c *= 0.5; else if (totalW < 80) c *= 0.7;
  if (sentsN < 3) c *= 0.55; else if (sentsN < 5) c *= 0.8;
  if (sentSpread > 18) c *= 0.75;          // kalimat saling berbeda → ragu
  if (score >= 38 && score <= 62) c *= 0.7; // zona abu-abu
  if (typeof coverage === "number" && coverage < 1) c *= 0.85;
  // Batas: "tinggi" butuh skor tegas + teks >= 80 kata + >= 5 kalimat +
  // sebaran kalimat wajar + di luar zona abu-abu. Di bawah itu → sedang;
  // teks pendek/zona abu-abu → rendah.
  return c >= 0.75 ? "tinggi" : c >= 0.45 ? "sedang" : "rendah";
}

// ---------- Model lokal (dimuat malas via dynamic import) ----------
// Catatan: import malas agar tombol & upload tetap jalan walau
// CDN offline. Jangan ubah jadi static import.
async function loadPipeline() {
  if (pipeLoader) return pipeLoader;
  pipeLoader = (async () => {
    const mod = await import("https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2");
    try { mod.env.allowLocalModels = false; } catch (_) {}
    return mod.pipeline;
  })();
  try { return await pipeLoader; }
  catch (e) { pipeLoader = null; throw e; }
}

async function getLocalPipe() {
  if (localPipe) return localPipe;
  if (localLoading) {
    while (localLoading) await new Promise((r) => setTimeout(r, 300));
    return localPipe;
  }

  localLoading = true;
  statusEl.textContent = "Download model lokal sekali (±130MB, cache otomatis)...";
  try {
    const pipeline = await loadPipeline();
    localPipe = await pipeline("text-classification", "Xenova/roberta-base-openai-detector");
    statusEl.textContent = "Model lokal siap.";
  } catch (e) {
    console.warn(e);
    localPipe = null;
    statusEl.textContent = "Model lokal gagal (offline?) → heuristik saja. Upload & cek tetap jalan.";
  }
  localLoading = false;
  return localPipe;
}

// Nilai teks per potongan (max 6 chunk), kembalikan % AI atau null.
async function localScore(main) {
  const pipe = await getLocalPipe();
  if (!pipe) { localParts = null; return null; }

  const chunks = [];
  let cur = "";
  splitSentences(main).forEach((s) => {
    if ((cur + " " + s).length > 900) { if (cur) chunks.push(cur); cur = s; }
    else cur = (cur + " " + s).trim();
  });
  if (cur) chunks.push(cur);

  const use = chunks.slice(0, MAX_CHUNKS);
  let sum = 0, n = 0;

  for (const c of use) {
    try {
      const out = await pipe(c.slice(0, 512), { truncation: true });
      let ai = 0;
      out.forEach((o) => {
        const l = (o.label || "").toLowerCase();
        if (/fake|ai|generated|machine|artificial/.test(l)) ai = Math.max(ai, o.score * 100);
      });
      const hum = out.find((o) => /real|human/i.test(o.label || ""));
      if (hum && ai === 0) ai = (1 - hum.score) * 100;
      // Label tak dikenal (mis. LABEL_0/LABEL_1 — mapping tak terverifikasi,
      // config HF tak bisa diambil) → chunk dilewati, JANGAN ditebak (§12 brief).
      if (ai === 0 && !hum) continue;
      sum += ai; n++;
      statusEl.textContent = `Model lokal: ${n}/${use.length} potongan...`;
    } catch (e) { console.warn(e); }
  }
  localParts = { n, of: use.length }; // lapor jujur bila model parsial
  return n ? Math.round(sum / n) : null;
}
