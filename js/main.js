// ============================================================
// main.js — Tampil hasil + tombol + upload + init. File 4 dari 4.
// Butuh: core.js, detector.js, humanizer.js (duluan).
// Cek error: hasil/upload/tombol tidak jalan → buka file ini.
//
// ATURAN JUJUR (invariant): tidak ada skor/laporan yang tampil tanpa
// hitung ulang. render() satu-satunya penulis skor. Teks berubah
// sesudah hasil keluar → hasil DITANDAI BASI (markStale) dan export
// DIBLOKIR sampai cek ulang. Model baca parsial → dilapor di method.
// ============================================================

// Tandai hasil sebagai basi (untuk teks lama). Aman dipanggil kapan
// saja: diam bila belum ada hasil yang tampil.
// Ringkasan/penjelasan (aiToolsOut) mandiri dari hasil cek: dibiarkan
// tampil + diberi penanda basi (pola yang sama seperti humanizer),
// bukan dihapus/disembunyikan.
function markStale() {
  // Hybrid: pemeriksaan AI yang sedang berjalan ikut ditandai batal.
  aiPending = false;
  const ao = $("aiToolsOut");
  if (ao && ao.textContent.trim() && !ao.hidden && !ao.dataset.stale) {
    ao.dataset.stale = "1";
    ao.title = "Hasil untuk teks LAMA — tempel/upload baru lalu klik Summarize/Explain lagi untuk versi baru.";
    ao.textContent = "[Untuk teks lama] " + ao.textContent;
  }
  try { const b = document.getElementById("sentExplain"); if (b) b.textContent = ""; } catch (_) {}
  if (!lastResult || $("resultBox").hidden) return;
  resultStale = true;
  $("resultBox").classList.add("stale");
  statusEl.textContent = "Teks berubah — hasil di bawah untuk teks LAMA. Klik “Cek sekarang” lagi.";
  refreshRail();
}

// ---------- Penjelasan per kalimat (highlight explainable) ----------
// detector-rules §2-§3 + validation-rules §5: tiap mark di #highlight dapat
// diklik/difokus keyboard untuk menampilkan alasan kalimat itu (nomor +
// skor + pemicu utama + 1 saran formal singkat) di bawah highlight.
// Murni MEMBACA sinyal yang sama dengan skor kalimat di detector.js
// heuristic() (~lines 443-462: AI_PHRASES, pola 12-28, REF_SENT_PERSONAL /
// TEMPLATE / DATA, REF_HEDGE_PATS, ACAD_NEUTRAL, ENUM_START, opener
// berulang, data konkret) — TANPA mengubah logika/skor, tanpa popup,
// tanpa section/halaman/card baru, bahasa indikasi saja.
function sentTriggers(heu, i) {
  const s = (heu && heu.sents && heu.sents[i]) || "";
  const lw = s.toLowerCase();
  const ups = [], downs = [];
  let v = null;
  try { v = (typeof AI_PHRASES !== "undefined" ? AI_PHRASES : []).find((p) => lw.includes(String(p).toLowerCase())); } catch (_) { v = null; }
  if (v) ups.push(`frasa generik \u201C${v}\u201D`);
  try {
    const arr = (typeof REF_SENT_TEMPLATE !== "undefined" ? REF_SENT_TEMPLATE : []);
    const t = arr.find((p) => lw.includes(String(p).toLowerCase()));
    if (t && (!v || String(t).toLowerCase() !== String(v).toLowerCase())) ups.push(`pola template \u201C${t}\u201D`);
  } catch (_) {}
  try {
    const arr = (typeof REF_HEDGE_PATS !== "undefined" ? REF_HEDGE_PATS : []);
    const h = arr.find((p) => lw.includes(String(p).toLowerCase()));
    if (h) ups.push(`frasa manfaat generik \u201C${h}\u201D`);
  } catch (_) {}
  try {
    const acaM = heu && heu.detail && typeof heu.detail.acaMarkers === "number" ? heu.detail.acaMarkers : 3;
    const arr = (typeof ACAD_NEUTRAL !== "undefined" ? ACAD_NEUTRAL : []);
    const a = arr.find((p) => lw.includes(String(p).toLowerCase()));
    if (a && acaM < 3) ups.push(`frasa akademik \u201C${a}\u201D tanpa dukungan data/metodologi/sitasi di sekitarnya`);
  } catch (_) {}
  try {
    const idArr = (typeof REF_ENUM_ID !== "undefined" ? REF_ENUM_ID : ["pertama", "kedua", "ketiga"]);
    const enArr = (typeof REF_ENUM_EN !== "undefined" ? REF_ENUM_EN : ["first", "second"]);
    const re = new RegExp("^(" + idArr.join("|") + ")[,\\s]|^(" + enArr.join("|") + ")[,\\s]", "i");
    if (re.test(s.trimStart())) ups.push("pola enumerasi di awal kalimat");
  } catch (_) {}
  try {
    const ops = (heu.sents || []).map((x) => String(x || "").toLowerCase().split(/\s+/).slice(0, 3).join(" "));
    const op = lw.split(/\s+/).slice(0, 3).join(" ");
    if (op && ops.filter((o) => o === op).length > 1) ups.push("pembuka kalimat yang berulang dengan kalimat lain");
  } catch (_) {}
  const wl = (typeof countWords === "function" ? countWords(s) : s.split(/\s+/).filter(Boolean).length);
  if (wl >= 12 && wl <= 28) ups.push("panjang 12\u201328 kata yang polanya rapi");
  try {
    const arr = (typeof REF_SENT_PERSONAL !== "undefined" ? REF_SENT_PERSONAL : []);
    if (arr.length && new RegExp("(" + arr.join("|") + "|\\?|!)", "i").test(s)) downs.push("memuat sudut pandang/tanda penulis");
  } catch (_) {}
  try {
    const arr = (typeof REF_SENT_DATA !== "undefined" ? REF_SENT_DATA : []);
    if (/\b\d+([.,]\d+)?\b/.test(s) && new RegExp("(19|20)\\d{2}|" + arr.join("|") + "|%|\\bsampel\\b", "i").test(s)) downs.push("memuat detail konkret (angka/nama)");
  } catch (_) {}
  if (/[?!]|"[^"]+"|“[^”]+”/.test(s)) downs.push("memuat tanda tanya/seru/kutipan langsung");
  if (wl < 6 || wl > 42) downs.push("panjang di luar pola rapi");
  return { ups, downs };
}

// Susun teks alasan 1 kalimat: nomor + skor + pemicu utama + 1 saran
// formal singkat (humanizer-rules §2: formal, tanpa slang; fakta/angka/
// sitasi tidak diubah — saran hanya variasi/rincian bila tersedia).
function sentExplainText(heu, i) {
  const n = (heu && heu.sents ? heu.sents.length : 0);
  const sc = Math.round((heu && heu.sentScores && heu.sentScores[i]) || 0);
  const zona = sc >= 70 ? "terindikasi perlu ditulis ulang" : sc >= 45 ? "perlu ditinjau" : "cenderung natural";
  const t = sentTriggers(heu, i);
  const head = `Kalimat ${i + 1}/${n} — skor indikasi ${sc}/100 (${zona}; bukan probabilitas).`;
  if (sc >= 45) {
    const utama = t.ups.length ? t.ups.slice(0, 2).join("; ") : "pola panjang yang rapi di antara kalimat sekitarnya";
    let saran;
    if (/frasa generik|pola template|manfaat generik|frasa akademik/.test(utama)) saran = "Saran: ganti bagian generik dengan rincian spesifik (data, contoh, atau konteks) bila tersedia.";
    else if (/enumerasi|pembuka/.test(utama)) saran = "Saran: variasikan pembuka dan panjang kalimat di sekitarnya.";
    else saran = "Saran: variasikan panjang kalimat dan tambah konteks spesifik bila tersedia.";
    return `${head} Pemicu utama: ${utama}. ${saran}`;
  }
  const aman = t.downs.length ? t.downs.slice(0, 2).join("; ") : "tidak banyak pola generatif";
  return `${head} Kalimat ini aman karena ${aman} — pertahankan. Saran: pertahankan; tidak perlu diubah.`;
}

// Tampilkan alasan kalimat ke-<i> pada <p id="sentExplain"> tepat di bawah
// #highlight (di dalam <details> yang sama — bukan section/card baru),
// lalu dekatkan ke pandangan tanpa popup library.
function showSentExplain(heu, i) {
  const hl = $("highlight");
  if (!hl) return;
  let box = null;
  try { box = document.getElementById("sentExplain"); } catch (_) { box = null; }
  if (!box) {
    try {
      box = document.createElement("p");
      box.id = "sentExplain";
      box.className = "muted";
      box.setAttribute("aria-live", "polite");
      if (typeof hl.after === "function") hl.after(box);
      else if (hl.parentNode) hl.parentNode.appendChild(box);
      else return;
    } catch (_) { return; }
  }
  box.textContent = sentExplainText(heu, i);
  try { box.scrollIntoView({ behavior: "smooth", block: "nearest" }); } catch (_) {}
}

// ---------- Render hasil ----------
// Rumus akhir: ensemble 50/50 bila model ada.
function render(heu, localVal, refCut) {
  let final = heu.score;
  let method = "heuristik offline";
  if (typeof localVal === "number") {
    // Model lokal dilatih pada teks EN — untuk teks ID (heu.lang==="id")
    // bobot model dikurangi. Bobot bahasa existing dipertahankan
    // (EN 0.5, ID 0.25); Fase 3 menambah floor-0: cakupan rendah (<50%
    // potongan terbaca) atau tak diketahui → kontribusi model 0, hanya
    // heuristik yang dipakai, dilaporkan jujur di method.
    const base = heu.lang === "en" ? 0.5 : 0.25; // model dilatih EN → bobot ID konservatif (§10 brief)
    const covKnown = !!(localParts && localParts.of);
    const cov = covKnown ? localParts.n / localParts.of : 0;
    let modW = 0;
    if (covKnown && localParts.n > 0 && cov >= 0.5) {
      modW = base * (0.5 + 0.5 * cov);
    }
    if (modW > 0) {
      final = Math.round(heu.score * (1 - modW) + localVal * modW);
      method = `ensemble berbahasa-${heu.lang.toUpperCase()} (heuristik ${heu.score}% + model lokal ${localVal}%)`;
      if (localParts && localParts.n < localParts.of) method += ` • model hanya baca ${localParts.n}/${localParts.of} potongan → bobot dikurangi`;
    } else {
      method = `heuristik offline (model lokal cakupan ${covKnown ? localParts.n + "/" + localParts.of : "tak diketahui"} → kontribusi 0)`;
    }
  } else {
    localParts = null;
  }
  // Hybrid (validation-rules §1, detector-rules §3-§4): catatan gabungan
  // heuristik+AI dari doCheck (FarazCombine) dicantumkan jujur di method.
  if (heu.combineNote) method += ` • ${heu.combineNote}`;

  const ai = final, human = 100 - ai;
  $("aiPct").textContent = ai + "%";
  $("humanPct").textContent = human + "%";
  $("barFill").style.width = ai + "%";
  // Stat dasbor: turunan tampil saja dari data yang sama (bukan skor baru).
  // Perlu cek = skor kalimat >=45 (merah+kuning), Aman = sisanya (hijau).
  const rev = heu.sentScores.filter((s) => s >= 45).length;
  $("statSent").textContent = String(heu.sents.length);
  $("statReview").textContent = String(rev);
  $("statSafe").textContent = String(heu.sents.length - rev);

  // Ambang pakai CERMIN core.js (THR_*_DOC) — angka sama dengan sebelumnya
  // (75/50/30), tidak ada tuning ambang di sini; ubah ambang hanya di core.js.
  let lbl, ver;
  if (ai >= THR_STRONG_DOC)      { lbl = "Indikasi AI kuat";  ver = `<b>Skor indikasi ${ai}/100 — terdapat indikasi pola generatif.</b> Tinjau bagian merah: variasikan struktur + tambah data/opini.`; }
  else if (ai >= THR_MID_DOC) { lbl = "Campuran";          ver = `<b>Skor indikasi ${ai}/100 — campuran, perlu ditinjau.</b> Tulis ulang bagian merah/kuning dengan bahasamu.`; }
  else if (ai >= THR_HUMAN_DOC) { lbl = "Indikasi ringan";   ver = `<b>Skor indikasi ${ai}/100 — sedikit pola seragam.</b> Cenderung natural; cek bagian kuning bila perlu.`; }
  else               { lbl = "Cenderung natural"; ver = `<b>Skor indikasi ${ai}/100 — tidak banyak pola generatif.</b> Sudah baik, tidak semua perlu diubah.`; }

  $("mixLbl").textContent = lbl;
  $("verdict").innerHTML =
    `${ver}<br><small>${escapeHtml(method)}${refCut ? ` • ${refCut} kata pustaka dikecualikan` : ""} • confidence ${heu.confidence}${heu.lang === "en" ? " • bahasa terdeteksi EN" : ""} • skor indikasi /100, bukan probabilitas; skor Human (100 − skor AI) hanya komplemen tampilan</small>`;

  // Highlight per kalimat: merah >=70, kuning >=45, hijau sisanya.
  // Explainable: tiap mark dapat diklik + fokus keyboard (tabindex/role/
  // title) → alasan kalimat tampil di bawah highlight (showSentExplain).
  const hl = $("highlight");
  hl.innerHTML = "";
  heu.sents.forEach((s, i) => {
    const sc = heu.sentScores[i] || 0;
    const m = document.createElement("mark");
    m.className = sc >= 70 ? "ai" : sc >= 45 ? "mid" : "human";
    m.title = "Klik untuk lihat alasan";
    m.textContent = s + " ";
    m.setAttribute("tabindex", "0");
    m.setAttribute("role", "button");
    m.setAttribute("aria-label", `Kalimat ${i + 1}, skor indikasi ${Math.round(sc)} dari 100. Aktifkan untuk lihat alasan.`);
    m.addEventListener("click", () => showSentExplain(heu, i));
    m.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); showSentExplain(heu, i); }
    });
    hl.appendChild(m);
  });
  // Petunjuk + wadah alasan (paragraf di <details> yang sama, bukan
  // section/card baru). Direset tiap render agar tidak basi.
  try {
    let box = document.getElementById("sentExplain");
    if (!box) {
      box = document.createElement("p");
      box.id = "sentExplain";
      box.className = "muted";
      box.setAttribute("aria-live", "polite");
      if (typeof hl.after === "function") hl.after(box);
      else if (hl.parentNode) hl.parentNode.appendChild(box);
    }
    if (box) box.textContent = "Klik salah satu kalimat berwarna di atas untuk melihat alasan (nomor kalimat, skor, pemicu, dan saran).";
  } catch (_) {}

  const rs = $("reasons");
  rs.innerHTML = "";
  heu.reasons.forEach((r) => {
    const li = document.createElement("li");
    li.textContent = r;
    rs.appendChild(li);
  });
  if (refCut) {
    const li = document.createElement("li");
    li.textContent = `${refCut} kata daftar pustaka dikecualikan dari skor (mengurangi false-positive).`;
    rs.appendChild(li);
  }

  $("stats").textContent =
    `kata dinilai: ${heu.detail.totalW} | kalimat: ${heu.sents.length} | ` +
    `TTR: ${heu.detail.ttr.toFixed(3)} | burst: ${heu.detail.burst.toFixed(3)} | ` +
    `kalimat: median ${heu.detail.sentMedian}% • sebar ±${heu.detail.sentSpread.toFixed(0)} | ` +
    `skor indikasi: ${final}/100 (mentah ${heu.detail.rawScore !== undefined ? heu.detail.rawScore : heu.score}; bukan probabilitas) • confidence ${heu.confidence} (${method})`;

  $("resultEmpty").hidden = true;
  $("resultBox").hidden = false;
  // Hasil baru = segar: cabut tanda basi (kalau ada dari teks lama)
  resultStale = false;
  $("resultBox").classList.remove("stale");

  lastResult = {
    ai, human, lbl, method,
    raw: heu.detail.rawScore !== undefined ? heu.detail.rawScore : heu.score,
    date: new Date().toLocaleString("id-ID"),
    heu, localVal, refCut,
  };
  buildPrint();
  refreshRail();
}

// Susun area cetak PDF dari lastResult (di-escape semua).
function buildPrint() {
  if (!lastResult) return;
  const r = lastResult;
  $("printArea").innerHTML =
    `<h2>FarazCheck — Laporan Deteksi AI</h2>` +
    `<p>Tanggal: ${escapeHtml(r.date)} • Metode: ${escapeHtml(r.method)}</p>` +
    `<h3>Hasil: Skor indikasi AI ${r.ai}/100 / Human ${r.human}/100 (komplemen tampilan, bukan probabilitas) — ${escapeHtml(r.lbl)}</h3>` +
    `<p>Pustaka dikecualikan: ${r.refCut || 0} kata</p>` +
    `<h4>Alasan:</h4><ul>${r.heu.reasons.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>` +
    `<h4>Statistik:</h4><pre>kata: ${r.heu.detail.totalW}, kalimat: ${r.heu.sents.length}, ` +
    `TTR: ${r.heu.detail.ttr.toFixed(3)}, burst: ${r.heu.detail.burst.toFixed(3)}, ` +
    `skor mentah: ${r.raw !== undefined ? r.raw : r.ai}, confidence: ${r.heu.confidence}</pre>` +
    `<p><i>Catatan: skor indikasi, bukan probabilitas dan bukan vonis. Konfirmasi ke dosen.</i></p>` +
    `<p><small>Dasar: heuristik + referensi (2 artikel + ${escapeHtml(REF_PAPER)}). Detektor umum di bawah 80% akurat; teks formal/pendek rawan salah baca.</small></p>` +
    `<p><small>Sumber aturan: ${escapeHtml(REF_RULE_DOCS.join(" • "))}</small></p>`;
}

// ---------- Tombol "Cek sekarang" + word-count ----------
// Alur hybrid (validation-rules §1): VALIDATE → PREPROCESS (FarazPre) →
// heuristik lokal → model lokal (opsional) → AI /api/analyze (gagal →
// fallback lokal jujur) → COMBINE (FarazCombine) → gerbang regresi
// (FarazValidate) → render. render() satu-satunya penulis skor.
async function doCheck() {
  if (checking) return;
  const raw = inputText.value.trim();
  if (countWords(raw) < MIN_WORDS) {
    statusEl.textContent = `Minimal ${MIN_WORDS} kata — sekarang ${countWords(raw)} kata. Tempel lagi atau upload file.`;
    statusEl.scrollIntoView({ behavior: "smooth", block: "center" });
    inputText.focus();
    return;
  }

  checking = true;
  $("btnCheck").disabled = true;
  // Status jujur per tahap (FarazStatus); fallback bila modul belum muat.
  const setStage = (s) => {
    try {
      if (typeof FarazStatus !== "undefined" && FarazStatus && typeof FarazStatus.setText === "function") FarazStatus.setText(statusEl, s);
      else statusEl.textContent = s;
    } catch (_) { /* status gagal → lanjut analisis, jangan tebak */ }
  };
  try {
    // 0) Preprocess dulu: hash/v + canonicalText untuk korelasi AI.
    // Heuristik tetap menerima `main` bersitasi (detector-rules §4:
    // sitasi dibutuhkan academic-context; canonicalText yang sudah
    // dibersihkan akan menonaktifkan sinyal sitasi bila dipakai ke heuristic).
    setStage("preparing");
    await new Promise((r) => setTimeout(r, 60));
    let pre = null;
    try {
      if (typeof FarazPre !== "undefined" && FarazPre && typeof FarazPre.preprocess === "function") pre = FarazPre.preprocess(raw);
    } catch (e) { console.warn(e); pre = null; }

    const useRef = $("autoRef").checked;
    let main = raw, cut = 0;
    if (useRef) {
      const s = splitReferences(raw);
      main = s.main; cut = s.cut;
      refInfo.textContent = cut ? `${cut} kata daftar pustaka otomatis dikecualikan.` : "";
    } else {
      refInfo.textContent = "";
    }

    // 1) Jalur lokal: heuristik (10 sinyal) + model lokal opsional.
    setStage("local");
    await new Promise((r) => setTimeout(r, 60));
    const heu = heuristic(main);
    let lv = null;
    if ($("useLocal").checked) {
      try { lv = await localScore(main); } catch (e) { console.warn(e); lv = null; }
    }

    // 2) Jalur AI: kontrak api/analyze.js = POST { v, hash, canonicalText }
    // dengan hash = SHA-256 hex dari canonicalText. Hash FNV lama
    // (pre.hash, 8 char) TIDAK dikirim — server menolaknya MALFORMED.
    // SHA-256 tak tersedia (file:// non-secure context) → API dilewati
    // jujur (unavailable), jalur lokal di bawah tetap jalan penuh.
    setStage("ai");
    aiPending = true; aiResult = null; aiError = null;
    let aiRes = { ai: null, reason: "unavailable" };
    try {
      if (pre && typeof FarazAIClient !== "undefined" && FarazAIClient && typeof FarazAIClient.analyze === "function") {
        const aiText = (useRef ? pre.canonicalText : raw) || "";
        let aiHash = null;
        try {
          if (typeof FarazAIClient.sha256Hex === "function") aiHash = await FarazAIClient.sha256Hex(aiText);
        } catch (e) { console.warn(e); aiHash = null; }
        if (aiHash) {
          aiRes = await FarazAIClient.analyze({ v: pre.v, hash: aiHash, canonicalText: aiText });
        } else {
          aiRes = { ai: null, reason: "unavailable", detail: "hash aman tak tersedia — dipakai hasil lokal." };
        }
      }
    } catch (e) { console.warn(e); aiRes = { ai: null, reason: "unavailable" }; }
    aiPending = false;
    if (aiRes && aiRes.ai) aiResult = aiRes.ai;
    else aiError = { reason: (aiRes && aiRes.reason) || "unavailable" };

    // 3) Gabung evidence-based (bukan average buta).
    setStage("combining");
    await new Promise((r) => setTimeout(r, 60));
    let combined = null;
    try {
      if (typeof FarazCombine !== "undefined" && FarazCombine && typeof FarazCombine.combine === "function") {
        combined = FarazCombine.combine(heu, aiResult, aiError);
      }
    } catch (e) { console.warn(e); combined = null; }

    // 4) Gerbang regresi sebelum render: gabungan tidak boleh mengangkat
    // skor >+10 di atas bukti lokal (cap supremacy menahan +5; ini jaring
    // pengaman bila logika gabung berubah). Gagal → pakai lokal + catat.
    setStage("validating");
    await new Promise((r) => setTimeout(r, 60));
    let useCombined = !!(combined && typeof combined.final === "number");
    if (useCombined) {
      try {
        if (typeof FarazValidate !== "undefined" && FarazValidate && FarazValidate.checks && typeof FarazValidate.checks.regression === "function") {
          const gate = FarazValidate.checks.regression(main, main, { origScore: heu.score, revScore: combined.final });
          if (gate) {
            useCombined = false;
            aiError = { reason: "ditolak gerbang regresi" };
          }
        }
      } catch (e) { console.warn(e); }
    }
    if (useCombined) {
      heu.score = combined.final;
      heu.confidence = combined.confidence;
      heu.combineNote = combined.method;
    } else if (aiError) {
      heu.combineNote = `AI ${aiError.reason} — dipakai hasil lokal; skor indikasi, bukan vonis`;
    }

    render(heu, lv, cut);
    // Status akhir menyebut jalur yang benar-benar dipakai (tanpa klaim).
    const parts = ["heuristik"];
    if (lv !== null) parts.push("model lokal");
    if (aiResult) parts.push("AI");
    let done = `Hasil siap ditampilkan (${parts.join(" + ")}). Skor indikasi, bukan vonis.`;
    if (aiError) {
      try {
        if (typeof FarazStatus !== "undefined" && FarazStatus && typeof FarazStatus.aiFailMessage === "function") done += ` ${FarazStatus.aiFailMessage(aiError.reason)}`;
      } catch (_) { /* abaikan, pesan dasar sudah tampil */ }
    }
    statusEl.textContent = done;
    // Tiap klik Cek selalu antar ke verdict (tengah layar) agar bagian
    // hasil yang sesuai langsung terlihat tanpa scroll manual.
    $("verdict").scrollIntoView({ behavior: "smooth", block: "center" });
  } finally {
    checking = false;
    aiPending = false;
    $("btnCheck").disabled = false;
  }
}

function updateWC() {
  try {
    const t = (inputText && inputText.value || "").trim();
    let label = "0 kata";
    if (t) {
      let n = 0, s = 0;
      try { n = (typeof countWords === "function" ? countWords(t) : t.split(/\s+/).filter(Boolean).length); }
      catch (_) { n = t.split(/\s+/).filter(Boolean).length; }
      try { s = splitSentences(cleanAcademic(t)).length; }
      catch (_) { s = 0; } // detector belum muat / teks aneh → tetap tampil kata
      label = s ? `${n} kata • ${s} kalimat` : `${n} kata`;
    }
    if (wcEl) wcEl.textContent = label;
  } catch (_) { /* jangan biarkan label mematikan init */ }
  try { refreshRail(); } catch (_) {}
}

// Gating tombol ringan vs gating kualitas (validation-rules §2):
// tombol Summarize/Explain dibuka untuk teks bermakna (>=5 kata) agar
// user tidak mengira rusak; validasi kualitas 20 kata (MIN_WORDS) tetap
// di onclick handler dengan pesan jujur "tempel minimal 20 kata dulu".
const MIN_TOOLS_WORDS = 5;

// Tombol rel kanan aktif hanya saat relevan: export butuh hasil,
// terapkan/salin butuh keluaran humanizer. Dipanggil tiap ada
// perubahan (updateWC, render, clear, humanize).
function refreshRail() {
  try {
    const canExport = !!lastResult && !resultStale;
    if ($("btnPrint")) $("btnPrint").disabled = !canExport;
    if ($("btnDownload")) $("btnDownload").disabled = !canExport;
    let out = "";
    try { out = ($("humanizeOut") && $("humanizeOut").value) || ""; } catch (_) { out = ""; }
    let outW = 0;
    try { outW = (typeof countWords === "function" ? countWords(out) : 0); } catch (_) { outW = 0; }
    if ($("btnApplyHumanize")) $("btnApplyHumanize").disabled = outW < MIN_WORDS;
    if ($("btnCopyHumanize")) $("btnCopyHumanize").disabled = !String(out || "").trim();
    // Alat ringkas/jelaskan: gate ringan (teks bermakna), bukan MIN_WORDS.
    let w = 0;
    try {
      const v = (typeof inputText !== "undefined" && inputText && inputText.value) || "";
      w = (typeof countWords === "function" ? countWords(String(v).trim()) : String(v).trim().split(/\s+/).filter(Boolean).length);
    } catch (_) { w = 0; }
    const hasText = w >= MIN_TOOLS_WORDS;
    if ($("btnSummarize")) $("btnSummarize").disabled = !hasText;
    if ($("btnExplain")) $("btnExplain").disabled = !hasText;
  } catch (_) { /* refresh tidak boleh melempar — init harus tetap jalan */ }
}

// ---------- Upload txt/md/pdf/docx ----------
// Semua pesan salah tampil di #status agar user tahu penyebabnya.
function showFileChip(name, size, totalWords) {
  fileChip.hidden = false;
  fileName.textContent = name;
  fileMeta.textContent = `${formatBytes(size)} • ${totalWords} kata terbaca`;
}

function hideFileChip() {
  fileChip.hidden = true;
  fileName.textContent = "";
  fileMeta.textContent = "";
}

async function readPdfText(file) {
  if (!window.pdfjsLib) throw new Error("pdf.js belum termuat (cek internet) — coba .txt/.docx.");
  const buf = await file.arrayBuffer();
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  let full = "";
  for (let i = 1; i <= Math.min(pdf.numPages, MAX_PDF_PAGES); i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    full += content.items.map((x) => x.str).join(" ") + "\n";
  }
  return full;
}

async function readDocxText(file) {
  if (!window.mammoth) throw new Error("mammoth belum termuat (cek internet) — coba .txt/.pdf.");
  const buf = await file.arrayBuffer();
  const r = await mammoth.extractRawText({ arrayBuffer: buf });
  return r.value || "";
}

fileInput.addEventListener("change", async (e) => {
  const f = e.target.files[0];
  if (!f) return;

  try {
    if (f.size > MAX_FILE_MB * 1024 * 1024) {
      statusEl.textContent = `File >${MAX_FILE_MB}MB — kecilkan dulu.`;
      return;
    }
    if (/\.doc$/i.test(f.name) && !/\.docx$/i.test(f.name)) {
      statusEl.textContent = "Format .doc lama tidak didukung — save as .docx dulu.";
      return;
    }

    statusEl.textContent = "Baca " + f.name + "...";
    let text = "";

    if (/\.txt$|\.md$/i.test(f.name))      text = await f.text();
    else if (/\.pdf$/i.test(f.name))       text = await readPdfText(f);
    else if (/\.docx$/i.test(f.name))      text = await readDocxText(f);
    else {
      statusEl.textContent = "Format tidak didukung — pakai .txt/.md/.pdf/.docx.";
      return;
    }

    text = (text || "").trim().slice(0, MAX_CHARS);
    const n = countWords(text);

    if (!text || n < 5) {
      statusEl.textContent = "Teks tidak terbaca — PDF ini mungkin hasil scan (gambar). Coba export-as-text atau pakai .docx.";
      return;
    }

    inputText.value = text;
    resetHumanizer();
    updateWC();
    markStale();
    showFileChip(f.name, f.size, n);
    statusEl.textContent = `${f.name} dimuat (${n} kata). Bisa langsung Cek / Summarize / Explain.`;

    inputText.scrollIntoView({ behavior: "smooth", block: "center" });
    const btn = $("btnCheck");
    btn.classList.add("flash");
    setTimeout(() => btn.classList.remove("flash"), 1600);
  } catch (err) {
    console.warn(err);
    statusEl.textContent = "Gagal baca file: " + (err.message || err);
  } finally {
    e.target.value = ""; // biar file yang sama bisa di-upload ulang
  }
});

// ---------- Kabel semua tombol + init ----------
inputText.addEventListener("input", () => {
  updateWC(); hideFileChip(); markStale();
  // Parafrase lama jadi basi bila teks berubah — beri tahu, jangan hapus
  // (pola yang sama seperti markStale untuk hasil).
  if (!$("humanizeBox").hidden && $("humanizeOut").value.trim()) {
    $("humanizeStatus").textContent = "Teks input berubah — parafrase di bawah untuk teks LAMA. Klik “Buatkan versi natural” lagi untuk versi baru.";
  }
});

$("btnCheck").onclick = doCheck;

$("btnClear").onclick = () => {
  inputText.value = "";
  hideFileChip();
  updateWC();
  refInfo.textContent = "";
  aiResult = null; aiError = null; aiPending = false;
  if ($("aiToolsOut")) { $("aiToolsOut").hidden = true; $("aiToolsOut").textContent = ""; }
  lastResult = null; // hasil lama dibuang: tidak boleh di-export lagi
  resultStale = false;
  try { const b = document.getElementById("sentExplain"); if (b) b.textContent = ""; } catch (_) {}
  $("resultBox").classList.remove("stale");
  $("resultBox").hidden = true;
  $("resultEmpty").hidden = false;
  resetHumanizer("Siap."); // parafrase lama ikut dibuang (§61 RESET total)
  statusEl.textContent = "Siap.";
  refreshRail();
};

$("fileClear").onclick = () => {
  hideFileChip();
  try { refreshRail(); } catch (_) {}
  statusEl.textContent = "File dilepas — teks di textarea tetap ada, bisa langsung dicek.";
};

// ---------- Ringkas + Jelaskan struktur (lokal, tanpa AI key) ----------
// Ekstraktif/deskriptif saja: kalimat asli verbatim + statistik teramati.
// Tanpa karang fakta (humanizer-rules §4); gagal → pesan jujur di kotak.
function currentMainText() {
  const raw = inputText.value.trim();
  if ($("autoRef").checked) {
    try { return splitReferences(raw).main; } catch (e) { return raw; }
  }
  return raw;
}

function showAiTools(text) {
  const out = $("aiToolsOut");
  if (!out) return;
  out.hidden = false;
  try { delete out.dataset.stale; } catch (_) { try { out.removeAttribute("data-stale"); } catch (_) {} }
  out.title = "";
  out.textContent = text;
  refreshRail();
}

if ($("btnSummarize")) $("btnSummarize").onclick = async () => {
  const t = currentMainText();
  if (countWords(t) < MIN_WORDS) {
    showAiTools(`Teks terlalu pendek — tempel minimal ${MIN_WORDS} kata dulu.`);
    return;
  }
  // API dulu (/api/summarize, kontrak {v, hash SHA-256, canonicalText},
  // timeout ~15 dtk di FarazAIClient); gagal/offline/404/MALFORMED/
  // unauthorized/rate-limited → fallback lokal di bawah + status jujur.
  // Tanpa skor palsu, tanpa klaim absolut (validation-rules §2, §5).
  let apiFailed = false, apiReason = "";
  try {
    if (typeof FarazAIClient !== "undefined" && FarazAIClient && typeof FarazAIClient.summarize === "function") {
      showAiTools("Meminta ringkasan AI...");
      const ar = await FarazAIClient.summarize(t, { v: 1 });
      if (ar && ar.text && ar.text.trim()) {
        showAiTools(`Ringkasan (via AI, confidence ${ar.confidence || "rendah"} — indikasi, bukan vonis): ${ar.text.trim()}`);
        return;
      }
      apiFailed = true; apiReason = (ar && ar.reason) || "unavailable";
    }
  } catch (e) { console.warn(e); apiFailed = true; apiReason = "unavailable"; }
  if (typeof FarazSummarize === "undefined" || !FarazSummarize || typeof FarazSummarize.summarize !== "function") {
    showAiTools("Perangkum belum termuat — muat ulang halaman, lalu coba lagi.");
    return;
  }
  let r = null;
  try { r = FarazSummarize.summarize(t); } catch (e) { console.warn(e); }
  if (!r || !r.sentences || !r.sentences.length) {
    showAiTools("Ringkasan belum dapat dibuat dari teks ini.");
    return;
  }
  const suffix = apiFailed ? ` (mode lokal — API tidak tersedia: ${apiReason}).` : "";
  showAiTools(`Ringkasan ekstraktif (${r.sentences.length} kalimat asli, tanpa ubah fakta): ` +
    r.sentences.map((s, i) => `${i + 1}) ${s}`).join(" ") + suffix);
};

if ($("btnExplain")) $("btnExplain").onclick = async () => {
  const t = currentMainText();
  if (countWords(t) < MIN_WORDS) {
    showAiTools(`Teks terlalu pendek — tempel minimal ${MIN_WORDS} kata dulu.`);
    return;
  }
  // API dulu (/api/explain, pola sama dengan summarize di atas).
  let apiFailed = false, apiReason = "";
  try {
    if (typeof FarazAIClient !== "undefined" && FarazAIClient && typeof FarazAIClient.explain === "function") {
      showAiTools("Meminta penjelasan AI...");
      const ar = await FarazAIClient.explain(t, { v: 1 });
      if (ar && ar.text && ar.text.trim()) {
        showAiTools(`Penjabaran teks (via AI, confidence ${ar.confidence || "rendah"} — indikasi, bukan vonis): ${ar.text.trim()}`);
        return;
      }
      apiFailed = true; apiReason = (ar && ar.reason) || "unavailable";
    }
  } catch (e) { console.warn(e); apiFailed = true; apiReason = "unavailable"; }
  if (typeof FarazExplain === "undefined" || !FarazExplain || typeof FarazExplain.explain !== "function") {
    showAiTools("Penjelas struktur belum termuat — muat ulang halaman, lalu coba lagi.");
    return;
  }
  let r = null;
  try { r = FarazExplain.explain(t); } catch (e) { console.warn(e); }
  if (!r || !r.text) {
    showAiTools("Struktur belum dapat dijelaskan dari teks ini.");
    return;
  }
  const suffix = apiFailed ? ` (mode lokal — API tidak tersedia: ${apiReason}).` : "";
  showAiTools(`Penjabaran teks: Berikut penjabaran isi teksmu: ${r.text}` + suffix);
};

$("btnSampleID").onclick = () => {
  inputText.value =
    "Latar belakang penelitian ini membahas literasi digital mahasiswa. " +
    "Menurut pengalaman saya saat KKN, warga kesulitan bedakan hoaks. " +
    "Data dari 15 wawancara menunjukkan peningkatan 40 persen.\n\nDaftar Pustaka\n" +
    "Santoso, B. (2020). Literasi Digital. Jakarta: Penerbit.\n" +
    "Wijaya, A. (2021). Media Sosial. https://example.com";
  hideFileChip();
  resetHumanizer();
  updateWC();
  markStale();
};

$("btnSampleEN").onclick = () => {
  inputText.value =
    "In today's fast-paced digital era, it is important to note that AI plays a crucial role. " +
    "Furthermore, this article explores overall impact. " +
    "In conclusion, findings delve into implications.\n\nReferences\n" +
    "Smith, J. (2022). AI Society. https://example.com";
  hideFileChip();
  resetHumanizer();
  updateWC();
  markStale();
};

$("btnPrint").onclick = () => {
  if (!lastResult) {
    statusEl.textContent = "Belum ada hasil — klik “Cek sekarang” dulu, baru export.";
    statusEl.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  if (resultStale) {
    statusEl.textContent = "Hasil kedaluwarsa (teks sudah berubah) — klik “Cek sekarang” lagi sebelum export.";
    statusEl.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  window.print();
};

$("btnDownload").onclick = () => {
  if (!lastResult) {
    statusEl.textContent = "Belum ada hasil — klik “Cek sekarang” dulu, baru unduh.";
    statusEl.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  if (resultStale) {
    statusEl.textContent = "Hasil kedaluwarsa (teks sudah berubah) — klik “Cek sekarang” lagi sebelum unduh.";
    statusEl.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  const r = lastResult;
  const blob = new Blob(
    [`FARAZCHECK — LAPORAN DETEKSI AI\nTanggal: ${r.date}\nMetode: ${r.method}\n` +
     `Hasil: Skor indikasi AI ${r.ai}/100 / Human ${r.human}/100 (${r.lbl}) — bukan probabilitas\n` +
     `Skor mentah: ${r.raw !== undefined ? r.raw : r.ai} • confidence: ${r.heu.confidence}\n` +
     `Pustaka dikecualikan: ${r.refCut || 0} kata\n\nAlasan:\n- ${r.heu.reasons.join("\n- ")}\n\n` +
     `Sumber aturan: ${REF_RULE_DOCS.join(" • ")}\n` +
     `Catatan: bukan vonis final.`],
    { type: "text/plain" }
  );
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "farazcheck-laporan.txt";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};

// Init: tampilkan "0 kata" saat halaman dibuka.
// Dipanggil langsung (skrip defer = DOM sudah siap) + ulang saat
// DOMContentLoaded/load agar buka via file:// maupun server tetap jalan
// walau satu skrip/CDN lain gagal lebih dulu. Idempoten & anti-lempar.
function initRail() {
  try { updateWC(); } catch (_) { try { refreshRail(); } catch (_) {} }
}
try { initRail(); } catch (_) {}
try {
  if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
    document.addEventListener("DOMContentLoaded", initRail);
    window.addEventListener("load", initRail);
  }
} catch (_) {}

// ---------- Demo interaktif hero (contoh beneran, skor beneran) ----------
// Tab menjalankan heuristic() asli ke teks contoh; bukan angka tempelan.
const DEMO_AI = "Perkembangan teknologi informasi memiliki peran yang penting dalam meningkatkan efektivitas proses pembelajaran di perguruan tinggi. Pemanfaatan teknologi dapat memberikan berbagai kemudahan dalam memperoleh informasi dan mendukung kegiatan akademik mahasiswa. Selain itu, penggunaan teknologi informasi juga dapat meningkatkan kualitas proses pembelajaran. Oleh karena itu, perguruan tinggi perlu memanfaatkan teknologi informasi secara optimal untuk mendukung kegiatan akademik. Dengan demikian, penerapan teknologi informasi di lingkungan perguruan tinggi diharapkan dapat memberikan manfaat yang positif bagi mahasiswa dan institusi.";
const DEMO_HUMAN = "Berdasarkan hasil observasi awal di Program Studi Teknik Informatika Universitas X, sebagian mahasiswa masih mengalami kesulitan dalam mengakses materi perkuliahan di luar jam pembelajaran. Kondisi tersebut terlihat dari hasil kuesioner awal yang diberikan kepada 40 mahasiswa, di mana 27 mahasiswa menyatakan bahwa mereka membutuhkan media yang dapat digunakan untuk mengakses materi secara lebih fleksibel. Temuan ini menunjukkan bahwa ketersediaan media pembelajaran yang mudah diakses masih menjadi kebutuhan bagi mahasiswa. Oleh sebab itu, penelitian ini berfokus pada pengembangan media pembelajaran berbasis web yang dapat digunakan untuk mengakses materi dan latihan secara mandiri.";
let demoKind = "ai";

function runDemo(kind) {
  demoKind = kind;
  const heu = heuristic(kind === "ai" ? DEMO_AI : DEMO_HUMAN);
  $("demoPct").textContent = heu.score + "%";
  // Ambang cermin core.js (THR_*_DOC) — sama dengan render, tanpa tuning.
  const lbl = heu.score >= THR_STRONG_DOC ? "indikasi kuat" : heu.score >= THR_MID_DOC ? "campuran"
    : heu.score >= THR_HUMAN_DOC ? "indikasi ringan" : "cenderung natural";
  $("demoLbl").textContent = "indikasi AI · " + lbl;
  $("demoFill").style.width = heu.score + "%";
  const box = $("demoText");
  box.innerHTML = "";
  heu.sents.forEach((s, i) => {
    const sc = heu.sentScores[i] || 0;
    const m = document.createElement("mark");
    m.className = sc >= 70 ? "ai" : sc >= 45 ? "mid" : "human";
    m.textContent = s + " ";
    box.appendChild(m);
  });
  $("demoAi").classList.toggle("active", kind === "ai");
  $("demoHuman").classList.toggle("active", kind === "human");
}

$("demoAi").onclick = () => runDemo("ai");
$("demoHuman").onclick = () => runDemo("human");
$("demoOpen").onclick = () => {
  inputText.value = demoKind === "ai" ? DEMO_AI : DEMO_HUMAN;
  hideFileChip();
  resetHumanizer();
  updateWC();
  markStale();
  $("editor").scrollIntoView({ behavior: "smooth", block: "start" });
  statusEl.textContent = "Contoh dimuat — klik “Cek sekarang” untuk analisis penuh.";
};
runDemo("ai");

// ---------- Langkah hero bisa diklik (pintasan scroll) ----------
if (typeof document.querySelectorAll === "function") {
  document.querySelectorAll(".hero-cards .hc").forEach((el, i) => {
    const go = () => $(["editor", "editor", "hasil"][i] || "editor")
      .scrollIntoView({ behavior: "smooth", block: "start" });
    el.addEventListener("click", go);
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); }
    });
  });
}
