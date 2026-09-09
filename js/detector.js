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
// Rumus: monoton kalimat + TTR + frasa khas AI + konektor + pola
// panjang kalimat. Output 2–98 + skor per kalimat buat highlight.
function heuristic(text) {
  const clean = cleanAcademic(text);
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

  const low = clean.toLowerCase();
  let hits = 0;
  AI_PHRASES.forEach((p) => { if (low.includes(p)) hits++; });

  const conn = (low.match(/\b(selain itu|dengan demikian|selanjutnya|furthermore|moreover|however|therefore)\b/g) || []).length;
  const connRate = sents.length ? conn / sents.length : 0;

  const reasons = [];
  let pts = 0;

  // 1) Variasi panjang kalimat: pola seragam sering ditemukan pada teks generatif
  if (sents.length >= 5) {
    if (burst < 0.3)       { pts += 28; reasons.push(`Variasi kalimat cukup seragam (${burst.toFixed(2)}) — pola yang sering ditemukan pada teks generatif.`); }
    else if (burst < 0.45) { pts += 14; reasons.push(`Variasi kalimat agak seragam (${burst.toFixed(2)}).`); }
    else                   { pts -= 8;  reasons.push(`Variasi kalimat cukup alami (${burst.toFixed(2)}) — pola yang umum pada tulisan manusia.`); }
  }

  // 2) Kekayaan kata + 3) frasa generik + 4) konektor formal
  // Satu kata/frasa bukan bukti — yang dinilai gabungan frekuensi + konteks.
  if (totalW > 80) {
    if (ttr > 0.25 && ttr < 0.55 && hits > 0) reasons.push(`TTR ${ttr.toFixed(2)} disertai frasa generik — terdapat indikasi pola generatif.`), pts += 12;
    if (ttr >= 0.65) reasons.push(`TTR tinggi ${ttr.toFixed(2)} — kosakata bervariasi seperti tulisan manusia.`), pts -= 10;
    if (ttr < 0.2)   reasons.push(`Pengulangan kata cukup tinggi (${ttr.toFixed(2)}).`), pts += 8;
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
    if (personalRate >= 0.25) { pts -= 12; reasons.push(`Ada suara personal/opini (${personalHits}x) — sudut pandang penulis terasa.`); }
    else if (personalRate === 0 && totalW > 80) { pts += 8; reasons.push(`Belum ada sudut pandang personal — tulisan terdengar generik.`); }
  }

  // 7) Tanda tulisan "hidup": tanya, seru, kutipan langsung
  const lively = (clean.match(/[?!…]|"[^"]+"|“[^”]+”/g) || []).length;
  if (lively >= 2) { pts -= 8; reasons.push(`${lively}x tanda tanya/seru/kutipan — tulisan terasa hidup.`); }

  // 8) Data konkret (angka/nama) menguatkan konteks spesifik
  const numbers = (clean.match(/\b\d+([.,]\d+)?\b/g) || []).length;
  const properNouns = new Set((clean.match(/\s[A-ZÀ-Þ][a-zà-ÿ]+/g) || []).map((s) => s.trim().toLowerCase())).size;
  if (numbers + properNouns >= 4) { pts -= 6; reasons.push(`Ada detail konkret (${numbers} angka, ${properNouns} nama) — konteksnya spesifik.`); }

  // 9) Pembuka kalimat berulang = struktur monoton khas AI
  const openers = sents.map((s) => s.toLowerCase().split(/\s+/).slice(0, 3).join(" "));
  const openerSeen = {};
  openers.forEach((o) => { openerSeen[o] = (openerSeen[o] || 0) + 1; });
  if (sents.length >= 6) {
    const openRatio = new Set(openers).size / sents.length;
    if (openRatio < 0.6)       { pts += 10; reasons.push(`Pembuka kalimat banyak berulang — struktur terasa monoton.`); }
    else if (openRatio > 0.85) { pts -= 6;  reasons.push(`Pembuka kalimat bervariasi — struktur cukup alami.`); }
  }

  // 10b) Ide berulang dengan kalimat berbeda (repetisi gagasan,
  // bukan sekadar kata) — bila terjadi, sarankan gabung/susun ulang.
  if (sents.length >= 4 && sents.length <= 300) {
    const bags = sents.map((s) => new Set((s.toLowerCase().match(/[\p{L}]{4,}/gu) || [])));
    let pairs = 0;
    for (let i = 0; i < bags.length && pairs < 4; i++) {
      for (let j = i + 1; j < bags.length; j++) {
        const a = bags[i], b = bags[j];
        if (!a.size || !b.size) continue;
        let inter = 0;
        a.forEach((w) => { if (b.has(w)) inter++; });
        if (inter / (a.size + b.size - inter) > 0.55) { pairs++; break; }
      }
    }
    if (pairs >= 2) { pts += 8; reasons.push(`${pairs} pasang kalimat menyampaikan ide yang mirip — pertimbangkan digabung agar tidak repetitif.`); }
  }

  // 10) Bahasa template generik (AI faktual-umum) vs suara khas
  // manusia (manfaat konkret, ajakan, kiasan) — dari contoh referensi.
  // Daftar inti di sini + tambahan dari referensi/*.md (referensi.js),
  // yang dibaca mesin sebelum menilai.
  const fluffy = (low.match(/\b(sangat penting|perlu diperhatikan|perlu diketahui|dapat meningkatkan|dapat membantu|membantu meningkatkan|berbagai macam|secara umum|pada umumnya|hal tersebut)\b/g) || []).length;
  const fluffyRef = REF_FLUFF_EXTRA.filter((p) => low.includes(p)).length;
  const fluffyAll = fluffy + fluffyRef;
  const fluffyRate = sents.length ? fluffyAll / sents.length : 0;
  if (fluffyRate > 0.3 && totalW > 60) { pts += 8; reasons.push(`Frasa generik cukup sering (${fluffyAll}x) — tulisan terdengar umum, perlu konteks spesifik.`); }
  const voiceHits = (clean.match(/\b(coba|rasakan|dapatkan|nikmati|bayangkan|jangan lewatkan|gratis|garansi|seperti|bagai|ibarat|laksana|umpama|kisah|ceritaku|jujur)\b/gi) || []).length;
  const voiceRef = REF_VOICE_EXTRA.filter((p) => low.includes(p)).length;
  const voiceAll = voiceHits + voiceRef;
  if (voiceAll >= 3) { pts -= 8; reasons.push(`Ada variasi ekspresi (${voiceAll}x: ajakan, manfaat, perumpamaan) — gaya cukup hidup.`); }

  // Academic context check: sitasi, data, metodologi, istilah teknis
  // adalah academic convention. Gaya formal saja bukan bukti AI —
  // confidence wajib diturunkan bila yang ada hanya formalitas umum.
  const acaCite = (text.match(/\[\d+(\s*[-–,]\s*\d+)*\]|\([^()]{0,50}?\b(19|20)\d{2}[a-z]?\)|et al\.|\bdoi\b|https?:\/\//gi) || []).length;
  const acaMeth = (low.match(/\b(metode|metodologi|variabel|responden|sampel|populasi|observasi|wawancara|kuesioner|hipotesis|instrumen|jurnal|penelitian|bab [1-5]|skripsi|tesis)\b/gi) || []).length;
  const acaMarkers = acaCite + Math.min(acaMeth, 4) + (numbers + properNouns >= 4 ? 2 : 0);
  if (totalW >= 80 && acaMarkers >= 3) {
    pts -= 8;
    reasons.push(`Konteks akademik terdeteksi (sitasi/data/metodologi) — formalitas di sini kemungkinan academic convention; confidence disesuaikan.`);
    if (hits === 0 && connRate <= 0.4 && acaMarkers >= 5) {
      pts -= 8;
      reasons.push(`Pola yang ada hanya formalitas umum tulisan akademik — indikasi tetap rendah.`);
    }
  }

  // Contextual confidence: satu-dua sinyal saja tidak cukup untuk
  // indikasi kuat (Signal → Evidence → Context → Confidence).
  const posSig = (sents.length >= 5 && burst < 0.45 ? 1 : 0)
    + (totalW > 80 && ttr > 0.25 && ttr < 0.55 && hits > 0 ? 1 : 0)
    + (totalW > 80 && ttr < 0.2 ? 1 : 0)
    + (hits > 0 ? 1 : 0)
    + (connRate > 0.4 ? 1 : 0)
    + (lens.length >= 5 && ideal / lens.length > 0.8 ? 1 : 0)
    + (sents.length >= 3 && personalRate === 0 && totalW > 80 ? 1 : 0)
    + (sents.length >= 6 && (new Set(openers).size / sents.length) < 0.6 ? 1 : 0)
    + (fluffyRate > 0.3 && totalW > 60 ? 1 : 0);
  if (totalW >= 80 && posSig <= 1) {
    pts -= 10;
    reasons.push(`Hanya satu pola terdeteksi — belum cukup untuk indikasi kuat (perlu multiple signals + konteks).`);
  }

  if (totalW < 80) {
    reasons.push(`Teks <80 kata — statistik gaya bahasa belum bermakna, tambah ke 200+ kata.`);
    pts -= 10;
  }

  pts = Math.max(2, Math.min(98, pts + 22));
  // Teks terlalu pendek tidak boleh ber-confidence tinggi — jangan
  // memaksakan kesimpulan dari beberapa kalimat saja.
  if ((totalW < 50 || sents.length < 3) && totalW > 0) {
    pts = Math.min(pts, 40);
    reasons.push(`Teks terlalu singkat untuk analisis pola yang meyakinkan.`);
  }

  // Skor tiap kalimat untuk highlight merah/kuning/hijau
  const sentScores = sents.map((s) => {
    const lw = s.toLowerCase();
    let sc = pts * 0.5;
    AI_PHRASES.forEach((p) => { if (lw.includes(p)) sc += 35; });
    const wl = countWords(s);
    if (wl >= 12 && wl <= 28) sc += 10;
    if (wl < 6 || wl > 40) sc -= 15;
    if (/(saya|gue|aku|pengalaman|waktu itu|dosen saya|lapangan|kkn|wawancara|observasi|menurutku|sejujurnya|terus terang|bayangkan|jujur|kisah|don't|can't|won't|i think|in my opinion|\?|!)/i.test(s)) sc -= 25;
    if (/(sangat penting|dapat meningkatkan|membantu meningkatkan|secara umum|pada umumnya)/i.test(s)) sc += 10; // kalimat template generik
    const op = s.toLowerCase().split(/\s+/).slice(0, 3).join(" ");
    if (openerSeen[op] > 1) sc += 8; // kembaran struktur = curiga AI
    return Math.max(2, Math.min(98, sc));
  });

  return { score: Math.round(pts), reasons, sentScores, sents, detail: { totalW, ttr, burst, hits } };
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
