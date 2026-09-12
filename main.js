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
function markStale() {
  if (!lastResult || $("resultBox").hidden) return;
  resultStale = true;
  $("resultBox").classList.add("stale");
  statusEl.textContent = "Teks berubah — hasil di bawah untuk teks LAMA. Klik “Cek sekarang” lagi.";
  refreshRail();
}

// ---------- Render hasil ----------
// Rumus akhir: ensemble 50/50 bila model ada.
function render(heu, localVal, refCut) {
  let final = heu.score;
  let method = "heuristik offline";
  if (typeof localVal === "number") {
    // Model lokal dilatih pada teks EN — untuk teks ID (heu.lang==="id")
    // bobot model dikurangi. Model yang baca parsial juga diturunkan
    // bobotnya sebanding cakupan, dan dilaporkan jujur di method.
    const base = heu.lang === "en" ? 0.5 : 0.25; // model dilatih EN → bobot ID konservatif (§10 brief)
    const cov = localParts && localParts.of ? localParts.n / localParts.of : 1;
    const modW = base * (0.5 + 0.5 * cov);
    final = Math.round(heu.score * (1 - modW) + localVal * modW);
    method = `ensemble berbahasa-${heu.lang.toUpperCase()} (heuristik ${heu.score}% + model lokal ${localVal}%)`;
    if (localParts && localParts.n < localParts.of) method += ` • model hanya baca ${localParts.n}/${localParts.of} potongan → bobot dikurangi`;
  } else {
    localParts = null;
  }

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

  let lbl, ver;
  if (ai >= 75)      { lbl = "Indikasi AI kuat";  ver = `<b>${ai}% — terdapat indikasi pola generatif.</b> Tinjau bagian merah: variasikan struktur + tambah data/opini.`; }
  else if (ai >= 50) { lbl = "Campuran";          ver = `<b>${ai}% — campuran, perlu ditinjau.</b> Tulis ulang bagian merah/kuning dengan bahasamu.`; }
  else if (ai >= 30) { lbl = "Indikasi ringan";   ver = `<b>${ai}% — sedikit pola seragam.</b> Cenderung natural; cek bagian kuning bila perlu.`; }
  else               { lbl = "Cenderung natural"; ver = `<b>${ai}% — tidak banyak pola generatif.</b> Sudah baik, tidak semua perlu diubah.`; }

  $("mixLbl").textContent = lbl;
  $("verdict").innerHTML =
    `${ver}<br><small>${escapeHtml(method)}${refCut ? ` • ${refCut} kata pustaka dikecualikan` : ""} • confidence ${heu.confidence}${heu.lang === "en" ? " • bahasa terdeteksi EN" : ""} • skor indikator, bukan vonis</small>`;

  // Highlight per kalimat: merah >=70, kuning >=45, hijau sisanya
  const hl = $("highlight");
  hl.innerHTML = "";
  heu.sents.forEach((s, i) => {
    const sc = heu.sentScores[i] || 0;
    const m = document.createElement("mark");
    m.className = sc >= 70 ? "ai" : sc >= 45 ? "mid" : "human";
    m.title = `AI ${Math.round(sc)}%`;
    m.textContent = s + " ";
    hl.appendChild(m);
  });

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
    `final: ${final}% (${method})`;

  $("resultEmpty").hidden = true;
  $("resultBox").hidden = false;
  // Hasil baru = segar: cabut tanda basi (kalau ada dari teks lama)
  resultStale = false;
  $("resultBox").classList.remove("stale");

  lastResult = {
    ai, human, lbl, method,
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
    `<h3>Hasil: ${r.ai}% AI / ${r.human}% Manusia — ${escapeHtml(r.lbl)}</h3>` +
    `<p>Pustaka dikecualikan: ${r.refCut || 0} kata</p>` +
    `<h4>Alasan:</h4><ul>${r.heu.reasons.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>` +
    `<h4>Statistik:</h4><pre>kata: ${r.heu.detail.totalW}, kalimat: ${r.heu.sents.length}, ` +
    `TTR: ${r.heu.detail.ttr.toFixed(3)}, burst: ${r.heu.detail.burst.toFixed(3)}, ` +
    `confidence: ${r.heu.confidence}</pre>` +
    `<p><i>Catatan: bukan vonis 100%. Konfirmasi ke dosen.</i></p>` +
    `<p><small>Dasar: heuristik + referensi (2 artikel + ${escapeHtml(REF_PAPER)}). Detektor umum di bawah 80% akurat; teks formal/pendek rawan salah baca.</small></p>` +
    `<p><small>Sumber aturan: ${escapeHtml(REF_RULE_DOCS.join(" • "))}</small></p>`;
}

// ---------- Tombol "Cek sekarang" + word-count ----------
// Alur: validasi → potong pustaka → heuristik → model → render.
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
  try {
    let main = raw, cut = 0;
    if ($("autoRef").checked) {
      const s = splitReferences(raw);
      main = s.main; cut = s.cut;
      refInfo.textContent = cut ? `${cut} kata daftar pustaka otomatis dikecualikan.` : "";
    } else {
      refInfo.textContent = "";
    }

    statusEl.textContent = "Memindai teks...";
    await new Promise((r) => setTimeout(r, 60));

    const heu = heuristic(main);
    statusEl.textContent = "Menganalisis 10 pola tulisan...";
    await new Promise((r) => setTimeout(r, 60));
    let lv = null;
    if ($("useLocal").checked) {
      try { lv = await localScore(main); } catch (e) { console.warn(e); lv = null; }
    }

    statusEl.textContent = "Meninjau konteks tulisan...";
    await new Promise((r) => setTimeout(r, 60));
    render(heu, lv, cut);
    statusEl.textContent = "Hasil siap ditampilkan " + (lv !== null ? "(model lokal + heuristik)" : "(heuristik saja)") + ". Skor indikator, bukan vonis.";
    // Tiap klik Cek selalu antar ke verdict (tengah layar) agar bagian
    // hasil yang sesuai langsung terlihat tanpa scroll manual.
    $("verdict").scrollIntoView({ behavior: "smooth", block: "center" });
  } finally {
    checking = false;
    $("btnCheck").disabled = false;
  }
}

function updateWC() {
  const t = inputText.value.trim();
  wcEl.textContent = t
    ? `${countWords(t)} kata • ${splitSentences(cleanAcademic(t)).length} kalimat`
    : "0 kata";
  refreshRail();
}

// Tombol rel kanan aktif hanya saat relevan: export butuh hasil,
// terapkan/salin butuh keluaran humanizer. Dipanggil tiap ada
// perubahan (updateWC, render, clear, humanize).
function refreshRail() {
  const canExport = !!lastResult && !resultStale;
  $("btnPrint").disabled = !canExport;
  $("btnDownload").disabled = !canExport;
  const out = ($("humanizeOut") && $("humanizeOut").value) || "";
  $("btnApplyHumanize").disabled = countWords(out) < MIN_WORDS;
  $("btnCopyHumanize").disabled = !out.trim();
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
    statusEl.textContent = `${f.name} dimuat (${n} kata). Klik "Cek sekarang".`;

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
  lastResult = null; // hasil lama dibuang: tidak boleh di-export lagi
  resultStale = false;
  $("resultBox").classList.remove("stale");
  $("resultBox").hidden = true;
  $("resultEmpty").hidden = false;
  resetHumanizer("Siap."); // parafrase lama ikut dibuang (§61 RESET total)
  statusEl.textContent = "Siap.";
  refreshRail();
};

$("fileClear").onclick = () => {
  hideFileChip();
  statusEl.textContent = "File dilepas — teks di textarea tetap ada, bisa langsung dicek.";
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
     `Hasil: ${r.ai}% AI / ${r.human}% Manusia (${r.lbl})\n` +
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

// Init: tampilkan "0 kata" saat halaman dibuka
updateWC();

// ---------- Demo interaktif hero (contoh beneran, skor beneran) ----------
// Tab menjalankan heuristic() asli ke teks contoh; bukan angka tempelan.
const DEMO_AI = "Perkembangan teknologi informasi memiliki peran yang penting dalam meningkatkan efektivitas proses pembelajaran di perguruan tinggi. Pemanfaatan teknologi dapat memberikan berbagai kemudahan dalam memperoleh informasi dan mendukung kegiatan akademik mahasiswa. Selain itu, penggunaan teknologi informasi juga dapat meningkatkan kualitas proses pembelajaran. Oleh karena itu, perguruan tinggi perlu memanfaatkan teknologi informasi secara optimal untuk mendukung kegiatan akademik. Dengan demikian, penerapan teknologi informasi di lingkungan perguruan tinggi diharapkan dapat memberikan manfaat yang positif bagi mahasiswa dan institusi.";
const DEMO_HUMAN = "Berdasarkan hasil observasi awal di Program Studi Teknik Informatika Universitas X, sebagian mahasiswa masih mengalami kesulitan dalam mengakses materi perkuliahan di luar jam pembelajaran. Kondisi tersebut terlihat dari hasil kuesioner awal yang diberikan kepada 40 mahasiswa, di mana 27 mahasiswa menyatakan bahwa mereka membutuhkan media yang dapat digunakan untuk mengakses materi secara lebih fleksibel. Temuan ini menunjukkan bahwa ketersediaan media pembelajaran yang mudah diakses masih menjadi kebutuhan bagi mahasiswa. Oleh sebab itu, penelitian ini berfokus pada pengembangan media pembelajaran berbasis web yang dapat digunakan untuk mengakses materi dan latihan secara mandiri.";
let demoKind = "ai";

function runDemo(kind) {
  demoKind = kind;
  const heu = heuristic(kind === "ai" ? DEMO_AI : DEMO_HUMAN);
  $("demoPct").textContent = heu.score + "%";
  const lbl = heu.score >= 75 ? "indikasi kuat" : heu.score >= 50 ? "campuran"
    : heu.score >= 30 ? "indikasi ringan" : "cenderung natural";
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
