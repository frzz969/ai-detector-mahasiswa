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

// ---------- Heuristik skor AI (offline, tanpa model) ----------
// Frasa "manfaat generik" — bahasa template khas output model:
// "dapat meningkatkan", "memberikan manfaat", "berperan penting",
// "diharapkan dapat", dst. Beda dari akademik asli: objeknya kabur
// (kualitas/efektivitas/dampak) dan dipakai berpola; akademik manusia
// menyebut objek konkret + data/sitasi (lihat academic-context check).
const HEDGE_PATS = [
  "memiliki peran yang penting", "memiliki peran yang signifikan",
  "memainkan peran penting", "memainkan peran yang penting",
  "memegang peranan penting", "berperan penting", "berperan signifikan",
  "dapat meningkatkan", "membantu meningkatkan",
  "meningkatkan kualitas", "meningkatkan efektivitas", "meningkatkan efisiensi", "meningkatkan produktivitas",
  "dapat memberikan", "memberikan berbagai", "berbagai kemudahan", "berbagai manfaat", "berbagai fitur",
  "dampak yang positif", "manfaat yang positif",
  "diharapkan dapat", "diharapkan memberikan", "menawarkan berbagai",
  "dirancang untuk membantu", "dapat mendukung",
];
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

  const conn = (low.match(/\b(selain itu|dengan demikian|selanjutnya|furthermore|moreover|however|therefore)\b/g) || []).length;
  const connRate = sents.length ? conn / sents.length : 0;

  // Frasa "manfaat generik" (template) + pola enumerasi kaku
  // ("Pertama... Kedua...") — dihitung per kalimat, bukan per kemunculan.
  const hedgeSents = sents.filter((s) => {
    const lw = s.toLowerCase();
    return HEDGE_PATS.some((p) => lw.includes(p));
  }).length;
  // Enumerasi kaku ("Pertama... Kedua...", "First, ... Finally, ...") —
  // hanya kalimat yang DIAWALI penanda daftar, supaya "first day" atau
  // "finally make sense" dalam bahasa alami tidak ikut terhitung.
  const ENUM_START = /^(pertama|kedua|ketiga|keempat|selanjutnya|terakhir)[,\s]|^(first|second|third|fourth|finally|lastly)[,\s]/i;
  const enumSents = sents.filter((s) => ENUM_START.test(s.trimStart())).length;

  // Statistik akademik & konkret (dipakai beberapa sinyal + dampening)
  const acaCite = (text.match(/\[\d+(\s*[-–,]\s*\d+)*\]|\([^()]{0,50}?\b(19|20)\d{2}[a-z]?\)|et al\.|\bdoi\b|https?:\/\//gi) || []).length;
  const acaMeth = (low.match(/\b(metode|metodologi|variabel|responden|sampel|populasi|observasi|wawancara|kuesioner|hipotesis|instrumen|jurnal|penelitian|bab [1-5]|skripsi|tesis)\b/gi) || []).length;
  const numbers = (clean.match(/\b\d+([.,]\d+)?\b/g) || []).length;
  const properNouns = new Set((clean.match(/\s[A-ZÀ-Þ][a-zà-ÿ]+/g) || []).map((s) => s.trim().toLowerCase())).size;
  const acaMarkers = acaCite + Math.min(acaMeth, 4) + (numbers + properNouns >= 4 ? 2 : 0);
  const strongAcad = acaMarkers >= 5 && numbers + properNouns >= 4;

  const reasons = [];
  let pts = 0;

  // 1) Variasi panjang kalimat: pola seragam sering ditemukan pada teks generatif
  if (sents.length >= 5) {
    if (burst < 0.3) {
      pts += 28;
      // Ritme kalimat seragam TAPI variasi kata/paragraf kaya → bukan
      // otomatis mekanis (menghindari FP pada tulisan ilmiah formal).
      if (wlCV >= 0.55 || (paraCount >= 2 && paraCV >= 0.4)) {
        pts -= 6;
        reasons.push(`Variasi kalimat seragam (${burst.toFixed(2)}) tetapi variasi kata/paragraf cukup (kata ${wlCV.toFixed(2)}, paragraf ${paraCV.toFixed(2)}) — tidak serta-merta mekanis.`);
      } else {
        reasons.push(`Variasi kalimat cukup seragam (${burst.toFixed(2)}) — pola yang sering ditemukan pada teks generatif.`);
      }
    }
    else if (burst < 0.45) { pts += 14; reasons.push(`Variasi kalimat agak seragam (${burst.toFixed(2)}).`); }
    else                   { pts -= 8;  reasons.push(`Variasi kalimat cukup alami (${burst.toFixed(2)}) — pola yang umum pada tulisan manusia.`); }
  } else if (sents.length >= 3 && burst < 0.2) {
    pts += 8;
    reasons.push(`Ritme kalimat sangat datar (${burst.toFixed(2)}).`);
  }

  // 2) Kekayaan kata + frasa generik + konektor formal
  // Satu kata/frasa bukan bukti — yang dinilai gabungan frekuensi + konteks.
  if (totalW > 80) {
    if (ttr > 0.25 && ttr < 0.55 && hits > 0) reasons.push(`TTR ${ttr.toFixed(2)} disertai frasa generik — terdapat indikasi pola generatif.`), pts += 12;
    if (ttr >= 0.65) reasons.push(`TTR tinggi ${ttr.toFixed(2)} — kosakata bervariasi seperti tulisan manusia.`), pts -= 10;
    if (ttr < 0.2)   reasons.push(`Pengulangan kata cukup tinggi (${ttr.toFixed(2)}).`), pts += 8;
  }

  // Diversity n-gram: repetisi pola = mekanis (hanya teks cukup panjang;
  // pada teks pendek diversity natural tinggi sehingga tidak dihukum).
  if (totalW > 60) {
    if (bigramDiversity < 0.45 || trigramDiversity < 0.55) {
      pts += 8;
      reasons.push(`Pola kata berulang cukup tinggi (bigram ${bigramDiversity.toFixed(2)}, trigram ${trigramDiversity.toFixed(2)}) — frasa yang sama terpakai berulang.`);
    } else if (trigramDiversity > 0.75 && ttr >= 0.55) {
      pts -= 6;
      reasons.push(`Pola kata bervariasi (trigram ${trigramDiversity.toFixed(2)}) — pilihan kata tidak monoton.`);
    }
  }

  if (hits > 0) {
    pts += Math.min(30, hits * 10);
    reasons.push(`${hits} frasa template/generik ditemukan — perlu ditinjau dalam konteks kalimatnya.`);
  }

  if (connRate > 0.4) {
    pts += 12;
    reasons.push(`Kata penghubung formal cukup sering berulang (${connRate.toFixed(2)}/kalimat) — yang dinilai polanya, bukan pemakaiannya.`);
  }

  // 5) Pola rapi 12–28 kata yang terlalu dominan
  const ideal = lens.filter((l) => l >= 12 && l <= 28).length;
  if (lens.length >= 5 && ideal / lens.length > 0.8) {
    pts += 15;
    reasons.push(`80%+ kalimat 12-28 kata — ritme terlalu rapi, perlu ditinjau.`);
  }

  // 6) Suara personal vs netral generik: opini/pengalaman = manusia
  const personalHits = (clean.match(/\b(saya|aku|gue|kami|kita|menurutku|menurut saya|saya rasa|sejujurnya|terus terang|pengalaman|bagiku|don't|can't|won't|it's|that's|i think|in my opinion)\b/gi) || []).length;
  const personalRate = sents.length ? personalHits / sents.length : 0;
  if (sents.length >= 3) {
    if (personalRate >= 0.2) { pts -= 12; reasons.push(`Ada suara personal/opini (${personalHits}x) — sudut pandang penulis terasa.`); }
    else if (personalRate === 0 && totalW > 80) { pts += 8; reasons.push(`Belum ada sudut pandang personal — tulisan terdengar generik.`); }
  }

  // 7) Tanda tulisan "hidup": tanya, seru, kutipan langsung
  const lively = (clean.match(/[?!…]|"[^"]+"|“[^”]+”/g) || []).length;
  if (lively >= 2) { pts -= 8; reasons.push(`${lively}x tanda tanya/seru/kutipan — tulisan terasa hidup.`); }

  // 8) Data konkret (angka/nama) menguatkan konteks spesifik
  if (numbers + properNouns >= 4) { pts -= 6; reasons.push(`Ada detail konkret (${numbers} angka, ${properNouns} nama) — konteksnya spesifik.`); }

  // 8b) Struktur paragraf: banyak + bervariasi = manusia; satu blok datar
  // panjang tanpa paragraf = struktur generatif (lihat riset 2025).
  if (sents.length >= 4) {
    if (paraCount >= 2 && paraCV >= 0.35) {
      pts -= 4;
      reasons.push(`Paragraf terstruktur dan bervariasi (${paraCount} paragraf) — seperti tulisan manusia.`);
    } else if (paraCount === 1 && totalW > 120) {
      pts += 5;
      reasons.push(`Seluruh teks satu paragraf panjang — strukturnya datar, perhatikan organisasi tulisan.`);
    }
  }

  // 9) Pembuka kalimat berulang = struktur monoton khas AI
  const openers = sents.map((s) => s.toLowerCase().split(/\s+/).slice(0, 3).join(" "));
  const openerSeen = {};
  openers.forEach((o) => { openerSeen[o] = (openerSeen[o] || 0) + 1; });
  if (sents.length >= 6) {
    const openRatio = new Set(openers).size / sents.length;
    if (openRatio < 0.6)       { pts += 10; reasons.push(`Pembuka kalimat banyak berulang — struktur terasa monoton.`); }
    else if (openRatio > 0.85) { pts -= 6;  reasons.push(`Pembuka kalimat bervariasi — struktur cukup alami.`); }
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
    if (pairs >= 2) { pts += 8; reasons.push(`${pairs} pasang kalimat menyampaikan ide yang mirip — pertimbangkan digabung agar tidak repetitif.`); }
  }

  // 11) Bahasa template generik vs suara khas manusia
  const fluffy = (low.match(/\b(sangat penting|perlu diperhatikan|perlu diketahui|dapat meningkatkan|dapat membantu|membantu meningkatkan|berbagai macam|secara umum|pada umumnya|hal tersebut)\b/g) || []).length;
  const fluffyRef = REF_FLUFF_EXTRA.filter((p) => low.includes(p)).length;
  const fluffyAll = fluffy + fluffyRef;
  const fluffyRate = sents.length ? fluffyAll / sents.length : 0;
  if (fluffyRate > 0.3 && totalW > 60) { pts += 8; reasons.push(`Frasa generik cukup sering (${fluffyAll}x) — tulisan terdengar umum, perlu konteks spesifik.`); }
  const voiceHits = (clean.match(/\b(coba|rasakan|dapatkan|nikmati|bayangkan|jangan lewatkan|gratis|garansi|seperti|bagai|ibarat|laksana|umpama|kisah|ceritaku|jujur)\b/gi) || []).length;
  const voiceRef = REF_VOICE_EXTRA.filter((p) => low.includes(p)).length;
  const voiceAll = voiceHits + voiceRef;
  if (voiceAll >= 3) { pts -= 8; reasons.push(`Ada variasi ekspresi (${voiceAll}x: ajakan, manfaat, perumpamaan) — gaya cukup hidup.`); }

  // 12) Frasa manfaat generik (template AI). Ini bedanya dengan akademik
  // asli: objeknya kabur ("kualitas", "efektivitas", "dampak positif")
  // dan dipakai berpola — bukan pernyataan spesifik berbasis data.
  if (hedgeSents >= 1 && totalW >= 40) {
    pts += Math.min(18, hedgeSents * 6);
    reasons.push(`${hedgeSents} kalimat memakai frasa manfaat generik ("dapat meningkatkan", "memberikan manfaat", "berperan penting") — ciri bahasa template hasil model.`);
  }

  // 13) Enumerasi kaku ("Pertama... Kedua...") — struktur daftar template.
  if (enumSents >= 2) {
    pts += 10;
    reasons.push(`${enumSents} kalimat memakai pola enumerasi ("Pertama... Kedua...") — struktur daftar khas template.`);
  }

  // Academic context: sitasi/data/metodologi = academic convention, bukan
  // bukti AI. Confidence wajib diturunkan bila yang ada hanya formalitas.
  if (totalW >= 80 && acaMarkers >= 3) {
    pts -= 8;
    reasons.push(`Konteks akademik terdeteksi (sitasi/data/metodologi) — formalitas di sini kemungkinan academic convention; confidence disesuaikan.`);
    if (hits === 0 && connRate <= 0.4 && acaMarkers >= 5) {
      pts -= 8;
      reasons.push(`Pola yang ada hanya formalitas umum tulisan akademik — indikasi tetap rendah.`);
    }
  }
  // Bukti riset lengkap (metodologi + data + sitasi) = indikasi kuat tulisan
  // manusia formal; frasa akademik netral di sini ikut ditegaskan bukan AI.
  if (totalW >= 80 && strongAcad) {
    pts -= 6;
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
    pts += Math.min(18, (neutralHits - 1) * 9);
    reasons.push(`Frasa akademik dipakai berulang (${neutralHits}x) tanpa dukungan data/metodologi/sitasi — scaffolding khas teks generatif.`);
  }

  // Contextual confidence: satu-dua sinyal saja tidak cukup untuk indikasi kuat
  const posSig = (sents.length >= 5 && burst < 0.45 ? 1 : 0)
    + (totalW > 80 && ttr > 0.25 && ttr < 0.55 && hits > 0 ? 1 : 0)
    + (totalW > 80 && ttr < 0.2 ? 1 : 0)
    + (hits > 0 ? 1 : 0)
    + (connRate > 0.4 ? 1 : 0)
    + (lens.length >= 5 && ideal / lens.length > 0.8 ? 1 : 0)
    + (sents.length >= 3 && personalRate === 0 && totalW > 80 ? 1 : 0)
    + (totalW > 60 && (bigramDiversity < 0.45 || trigramDiversity < 0.55) ? 1 : 0)
    + (sents.length >= 6 && (new Set(openers).size / sents.length) < 0.6 ? 1 : 0)
    + (fluffyRate > 0.3 && totalW > 60 ? 1 : 0);
  if (totalW >= 80 && posSig <= 1) {
    pts -= 10;
    reasons.push(`Hanya satu pola terdeteksi — belum cukup untuk indikasi kuat (perlu multiple signals + konteks).`);
  }

  if (totalW < 80) {
    reasons.push(`Teks <80 kata — statistik gaya bahasa belum bermakna, tambah ke 200+ kata.`);
    pts -= 6;
  }

  pts = Math.max(15, Math.min(98, pts + 22));
  // Teks pendek tidak boleh ber-confidence tinggi — bukti frasa tetap
  // terbaca, tapi jangan memaksakan kesimpulan dari beberapa kalimat.
  if ((totalW < 50 || sents.length < 3) && totalW > 0) {
    pts = Math.min(pts, 45);
    reasons.push(`Teks terlalu singkat untuk analisis pola yang meyakinkan.`);
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
    if (/(saya|gue|aku|dosen saya|pengalaman|menurutku|menurut saya|sejujurnya|terus terang|bayangkan|jujur|kisah|don't|can't|won't|i think|in my opinion|\?|!)/i.test(s)) sc -= 28;
    if (/(sangat penting|dapat meningkatkan|membantu meningkatkan|secara umum|pada umumnya|memainkan peran penting|tidak dapat dipungkiri)/i.test(s)) sc += 14;
    if (HEDGE_PATS.some((p) => lw.includes(p))) sc += 14;          // manfaat generik
    if (acaMarkers < 3 && ACAD_NEUTRAL.some((p) => lw.includes(p))) sc += 14; // konektor akademik tanpa substansi
    if (ENUM_START.test(s.trimStart())) sc += 10; // enumerasi kalimat
    if (/\b\d+([.,]\d+)?\b/.test(s) && (/(19|20)\d{2}|responden|kasus|mahasiswa|persen|%|\bsampel\b/i.test(s))) sc -= 8;
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
  const blendW = sentScores.length ? Math.max(0, Math.min(0.6, (sentSpread - 8) / 24)) : 0;

  const finalPts = Math.max(2, Math.min(98, Math.round(pts * (1 - blendW) + sentComponent * blendW)));

  // --- Confidence (jangan palsu): panjang teks, jumlah kalimat, sebaran
  // skor kalimat (sinyal berbeda-beda = ragu), zona abu-abu, cakupan model.
  const confidence = computeConfidence(totalW, sents.length, sentSpread, finalPts, null);

  return {
    score: Math.round(finalPts),
    reasons, sentScores, sents,
    detail: {
      totalW, ttr, burst, hits, neutralHits,
      bigramDiversity, trigramDiversity, paraCount, paraCV, wlCV,
      lang, fwRate, sentSpread, sentMedian, aiLikeProp, acaMarkers,
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
      if (ai === 0) {
        const top = [...out].sort((a, b) => b.score - a.score)[0];
        ai = /human|real/i.test(top.label) ? (1 - top.score) * 100 : top.score * 100;
      }
      sum += ai; n++;
      statusEl.textContent = `Model lokal: ${n}/${use.length} potongan...`;
    } catch (e) { console.warn(e); }
  }
  localParts = { n, of: use.length }; // lapor jujur bila model parsial
  return n ? Math.round(sum / n) : null;
}
