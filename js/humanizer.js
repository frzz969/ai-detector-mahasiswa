// ============================================================
// humanizer.js — Parafrase offline + terapkan & cek ulang
// File 3 dari 4. Butuh: core.js, detector.js (duluan).
// Cek error: buka file ini kalau tombol "Buatkan versi natural"
// tidak keluar hasil. JUJUR: skor baru selalu diukur ulang via
// doCheck(), tidak pernah ditempel angka 90%.
// ============================================================
// Humanisasi AKADEMIK: formal → formal. Tanpa slang ("buat", "banget",
// "pengin", "bisa") agar cocok untuk skripsi/makalah/paper.
// Aturan bertanda "freq" hanya diterapkan bila frasanya muncul >1x
// di naskah (dihitung di humanizeText): penghubung tunggal yang
// dibutuhkan tidak dipaksa hilang. "dapat", "merupakan", "terdapat",
// "dengan demikian" tidak diubah otomatis bila hanya muncul sekali.
const HUMANIZE_ID = [
  [/sebagai model bahasa[,.]?/gi, ""],
  [/penting untuk dicatat bahwa/gi, "perlu dicatat bahwa"],
  [/penting untuk dicatat/gi, "perlu dicatat"],
  [/secara keseluruhan[,.]?/gi, "", "freq"],
  [/dengan demikian[,.]?/gi, "", "freq"],
  [/selain itu[,.]?/gi, "", "freq"],
  [/pada dasarnya[,.]?/gi, "", "freq"],
  [/perlu diingat bahwa/gi, "perlu diperhatikan bahwa"],
  [/dalam konteks ini[,.]?/gi, "", "freq"],
  [/dalam era digital ini/gi, "saat ini"],
  [/memainkan peran penting/gi, "berperan penting"],
  [/tidak dapat dipungkiri( bahwa)?/gi, "sudah jelas"],
  [/penelitian ini bertujuan(?: untuk)?/gi, "penelitian ini berupaya untuk"],
  [/artikel ini membahas/gi, "artikel ini mengkaji"],
  [/kesimpulannya,/gi, "sebagai simpulan,"],
  [/\bselanjutnya,/gi, "kemudian,", "freq"],
  [/sangat penting/gi, "penting", "freq"],
  [/membantu meningkatkan/gi, "mendukung"],
  [/secara umum[,.]?/gi, "umumnya,", "freq"],
  [/pada umumnya[,.]?/gi, "umumnya,", "freq"],
];

const HUMANIZE_EN = [
  [/as an ai language model[,.]?/gi, ""],
  [/it is important to note that/gi, "it should be noted that"],
  [/it is worth noting that/gi, "notably,"],
  [/in today's fast-paced/gi, "in the current"],
  [/plays a crucial role/gi, "plays an important role"],
  [/furthermore,/gi, "", "freq"],
  [/moreover,/gi, "", "freq"],
  [/in conclusion,/gi, "in summary,"],
  [/\boverall,/gi, "", "freq"],
  [/\bhowever,/gi, "nevertheless,"],
  [/delve into/g, "examine"],
  [/this article explores/g, "this article examines"],
];

// Tulis ulang 1 kalimat: ganti frasa kaku + pecah kalimat >26 kata.
// skip = Set regex aturan penghapus yang DILEWATI (frasa tsb cuma
// muncul 1x di naskah dan kemungkinan memang dibutuhkan).
function humanizeSentence(s, skip) {
  let out = " " + s + " ";
  [...HUMANIZE_ID, ...HUMANIZE_EN, ...REF_HUMANIZE_EXTRA].forEach(([re, rep]) => {
    if (skip && skip.has(re)) return;
    out = out.replace(re, rep);
  });
  out = out.replace(/\s{2,}/g, " ").replace(/\s+([,.!?;:])/g, "$1").trim();
  out = out.charAt(0).toUpperCase() + out.slice(1);
  if (countWords(out) > 26) {
    const parts = out.split(/\s+(dan|karena|sehingga|tapi|namun|and|because|which|who)\s+/i);
    if (parts.length >= 3) {
      // parts = [teks, konjungsi, teks, ...] (genap = teks, ganjil =
      // konjungsi). Belah TEPAT sesudah konjungsi (indeks ganjil j),
      // konjungsi batas dibuang: a berakhir teks + ".", b berawalan
      // teks — tidak ada "dan." menggantung / berawalan "Dan".
      let j = Math.ceil((parts.length - 1) / 2);
      if (j % 2 === 0) j -= 1;
      const a = parts.slice(0, j).join(" ").trim().replace(/[,.]?$/, ".");
      const b = parts.slice(j + 1).join(" ").trim();
      const bCap = b.charAt(0).toUpperCase() + b.slice(1);
      if (countWords(a) > 5 && countWords(bCap) > 5) return a + " " + bCap;
    }
  }
  return out;
}

function humanizeText(text, scores) {
  // 0) Lindungi kemunculan tunggal: aturan penghapus ("") dan aturan
  // bertanda "freq" dilewati bila frasanya cuma muncul <=1x di naskah
  // — jangan paksa hilangkan penghubung yang memang dibutuhkan, dan
  // jangan ubah kata akademik ("dapat", "merupakan") yang muncul wajar.
  const skip = new Set();
  [...HUMANIZE_ID, ...HUMANIZE_EN, ...REF_HUMANIZE_EXTRA].forEach(([re, rep, flag]) => {
    if (rep !== "" && flag !== "freq") return;
    let n = 0;
    try { const m = text.match(re); n = m ? m.length : 0; } catch (e) { n = 2; }
    if (n <= 1) skip.add(re);
  });
  // 1) Tulis ulang tiap kalimat — LEWATI kalimat yang sudah baik
  // (skor AI <45: jelas, akademik, tidak repetitif). Alur: indikasi →
  // review → keputusan, bukan indikasi → wajib rewrite.
  const rawSents = splitSentences(text);
  const aligned = Array.isArray(scores) && scores.length === rawSents.length;
  let skipped = 0, changed = 0, splits = 0;
  let sents = rawSents.map((s, i) => {
    if (aligned && (scores[i] || 0) < 45) { skipped++; return s; }
    const out = humanizeSentence(s, skip);
    if (out !== s) {
      changed++;
      const before = (s.match(/[.!?]+["”']?\s+[A-Z“"']/g) || []).length;
      const after = (out.match(/[.!?]+["”']?\s+[A-Z“"']/g) || []).length;
      if (after > before) splits++;
    }
    return out;
  }).filter(Boolean);
  // 1b) Regression per kalimat: nilai ulang tiap kalimat yang diubah
  // dengan detector yang sama; bila versi baru lebih terindikasi AI
  // (>+10), kembalikan ke kalimat asli. Perubahan minimum — teks yang
  // sudah stabil tetap stabil (tidak diobok-obok tiap iterasi).
  let reverted = 0;
  if (sents.length === rawSents.length) {
    sents = sents.map((s, i) => {
      const o = rawSents[i];
      if (!o || s === o) return s;
      let a = 0, b = 0;
      try { a = heuristic(o).score; b = heuristic(s).score; } catch (e) { return s; }
      if (b > a + 10) { reverted++; return o; }
      return s;
    });
  }
  // 2) Gabung kalimat pendek (<10 kata) ke tetangganya: ritme jadi
  // tidak seragam + mengurangi pola "80% kalimat 12-28 kata" yang terlalu rapi
  const preMerge = sents.slice(); // baseline regresi langkah 2-3 (lihat 3b)
  const n1 = sents.length;
  const merged = [];
  for (let i = 0; i < sents.length; i++) {
    const s = sents[i];
    if (countWords(s) < 10 && i + 1 < sents.length && sents.length > 3) {
      const next = sents[i + 1];
      const joined = (s.replace(/[.!?]+$/, "") + " " + next.charAt(0).toLowerCase() + next.slice(1)).trim();
      merged.push(joined.charAt(0).toUpperCase() + joined.slice(1));
      i++;
    } else {
      merged.push(s);
    }
  }
  sents = merged;

  // 3) Kalau pola masih terlalu rapi (>75% kalimat 12-28 kata),
  // gabungkan pasangan terpendek sampai polanya pecah (max 8x)
  let guard = 0;
  const idealRate = () => {
    const ls = sents.map(countWords);
    return ls.length ? ls.filter((l) => l >= 12 && l <= 28).length / ls.length : 0;
  };
  while (sents.length > 3 && idealRate() > 0.75 && guard < 8) {
    guard++;
    let bi = 0, bv = Infinity;
    for (let i = 0; i < sents.length - 1; i++) {
      const v = countWords(sents[i]) + countWords(sents[i + 1]);
      if (v < bv) { bv = v; bi = i; }
    }
    const a = sents[bi].replace(/[.!?]+$/, "");
    const b = sents[bi + 1];
    const joined = (a + " " + b.charAt(0).toLowerCase() + b.slice(1)).trim();
    sents.splice(bi, 2, joined.charAt(0).toUpperCase() + joined.slice(1));
  }

  // 3b) Regression doc-level untuk gabungan (root-cause Fase 3: va-ai-generic
  // Δ+12 padahal changed=0). Langkah 2-3 mengubah JUMLAH kalimat tanpa lewat
  // cek 1b, sehingga laju konektor per kalimat + median kalimat dapat naik
  // dan skor dokumen ikut naik. Bila teks gabungan lebih terindikasi
  // (>+10, ambang sama dengan 1b), batalkan gabungan — pertahankan kalimat
  // pra-gabung (perubahan minimum; detector+preprocessing SAMA persis).
  let mergeReverted = 0;
  if (sents.length !== preMerge.length) {
    try {
      const a = heuristic(preMerge.join(" ")).score;
      const b = heuristic(sents.join(" ")).score;
      if (b > a + 10) { mergeReverted = Math.max(0, n1 - sents.length); sents = preMerge; }
    } catch (e) { /* detector gagal → pertahankan gabungan, jangan tebak */ }
  }

  return { text: sents.join(" "), changed: changed - reverted, skipped, splits, reverted, merges: Math.max(0, n1 - sents.length), mergeReverted };
}

// Kembalikan state humanizer ke awal (dipakai Reset/contoh/upload agar
// parafrase basi dari teks lama tidak bisa diterapkan ke teks baru).
function resetHumanizer(msg) {
  $("humanizeOut").value = "";
  $("humanizeBox").hidden = true;
  if (msg) $("humanizeStatus").textContent = msg;
  refreshRail();
}

$("btnHumanize").onclick = async () => {
  const raw = inputText.value.trim();
  if (countWords(raw) < MIN_WORDS) {
    $("humanizeStatus").textContent = `Teks terlalu pendek (${countWords(raw)} kata) — tempel minimal ${MIN_WORDS} kata dulu.`;
    $("humanizeBox").hidden = false;
    return;
  }
  let main = raw, refs = "";
  if ($("autoRef").checked) {
    const s = splitReferences(raw);
    main = s.main; refs = s.refs;
  }
  $("humanizeStatus").textContent = "Menyusun perbaikan...";
  await new Promise((r) => setTimeout(r, 60));
  // Skor awal + skor per kalimat (untuk melewati kalimat yang sudah baik)
  const pre = heuristic(main);
  const rawCount = splitSentences(main).length;
  const scores = pre.sents.length === rawCount ? pre.sentScores : null;
  const r = humanizeText(main, scores);
  // Estimasi internal dengan detector yang sama (final tetap via cek ulang)
  const post = heuristic(r.text);
  // Verdict versi: BETTER → pakai baru; WORSE/EQUIVALENT → tolak dan
  // kembalikan teks asli (kualitas > skor; jangan kejar detector).
  // Estimasi memakai detector + preprocessing yang sama persis.
  const verdict = post.score <= pre.score - 3 ? "better"
    : post.score >= pre.score + 3 ? "worse" : "same";
  const useText = verdict === "better" ? r.text : main;
  const out = refs ? useText + "\n\n" + refs : useText;
  $("humanizeOut").value = out;
  $("humanizeBox").hidden = false;
  refreshRail();
  const alreadyGood = lastResult && lastResult.human >= 80;
  let msg = alreadyGood
    ? `Tulisan sudah cukup baik (tidak semua bagian yang terindikasi perlu diubah). `
    : ``;
  if (r.changed === 0 && verdict !== "worse") {
    msg += `Tidak ada kalimat yang diubah — semuanya sudah jelas dan akademik.`;
    if (r.mergeReverted > 0) msg += ` Penggabungan kalimat yang justru menaikkan indikasi juga dibatalkan agar struktur asli yang stabil dipertahankan.`;
  } else if (verdict === "better") {
    const bits = [];
    if (r.changed) bits.push(`${r.changed} kalimat disusun ulang`);
    if (r.splits) bits.push(`${r.splits} dipecah`);
    if (r.merges) bits.push(`${r.merges} digabung`);
    if (r.skipped) bits.push(`${r.skipped} dibiarkan karena sudah baik`);
    msg += `Versi tulisan telah diperbaiki dan dipindai ulang (estimasi ${pre.score}% → ${post.score}% indikasi AI): ${bits.join(", ")}. `;
    if (r.reverted > 0) msg += `Beberapa bagian diperbaiki (${r.reverted} kalimat dikembalikan karena versi awal lebih sesuai), sementara bagian lain dipertahankan. `;
    if (r.mergeReverted > 0) msg += `Penggabungan kalimat yang menaikkan indikasi dibatalkan (${r.mergeReverted}x). `;
    msg += `Fakta/angka/istilah dipertahankan, tanpa data baru.`;
  } else if (verdict === "worse") {
    msg += `Versi perbaikan belum memberikan peningkatan yang cukup (estimasi ${pre.score}% → ${post.score}%), sehingga teks asli dipertahankan. Tambah data/contoh konkret milikmu, lalu coba lagi.`;
  } else {
    msg += `Perubahan tidak memberikan peningkatan yang berarti (estimasi ${pre.score}% → ${post.score}%). Versi asli tetap digunakan.`;
  }
  msg += ` “Terapkan & cek ulang” untuk pemindaian final yang diukur beneran, bukan ditempel.`;
  $("humanizeStatus").textContent = msg;
  $("humanizeBox").scrollIntoView({ behavior: "smooth", block: "center" });
};

$("btnApplyHumanize").onclick = async () => {
  const v = $("humanizeOut").value.trim();
  if (countWords(v) < MIN_WORDS) {
    $("humanizeStatus").textContent = "Hasil parafrase kosong/pendek — klik “Buatkan versi natural” dulu.";
    return;
  }
  const beforeAI = lastResult ? lastResult.ai : null;
  inputText.value = v;
  hideFileChip();
  updateWC();
  $("editor").scrollIntoView({ behavior: "smooth", block: "start" });
  $("humanizeStatus").textContent = "Memindai ulang hasil...";
  await doCheck();
  const after = lastResult ? `${lastResult.ai}% AI / ${lastResult.human}% manusia` : "-";
  // Gunakan versi terbaik: bila skor tidak membaik, beri peringatan
  // eksplisit — versi sebelumnya masih ada di kotak humanizer.
  const regressed = beforeAI !== null && lastResult && lastResult.ai > beforeAI;
  if (regressed) {
    $("humanizeStatus").textContent =
      `Sudah diterapkan & diukur ulang: ${after} — tidak membaik dibanding sebelumnya (${beforeAI}% AI). Jangan pakai hasil ini mentah-mentah: bandingkan dengan versi di kotak humanizer, pilih yang terbaik, tambah data/contoh konkret, lalu cek lagi.`;
  } else {
    $("humanizeStatus").textContent = lastResult && lastResult.human >= 80
      ? `Target tercapai: ${after}. Tetap baca ulang sekali lagi sebelum dikumpulkan.`
      : `Sudah diterapkan & diukur ulang: ${after} (belum 80%+). Edit manual bagian merah + tambah pengalaman/datamu, lalu cek lagi.`;
  }
};

$("btnCopyHumanize").onclick = async () => {
  const v = $("humanizeOut").value;
  if (!v.trim()) { $("humanizeStatus").textContent = "Belum ada parafrase untuk disalin."; return; }
  try {
    await navigator.clipboard.writeText(v);
    $("humanizeStatus").textContent = "Disalin ✓ — tempel ke tugasmu, baca ulang sebelum dikumpul.";
  } catch (e) {
    $("humanizeOut").select();
    document.execCommand("copy");
    $("humanizeStatus").textContent = "Disalin ✓ (fallback).";
  }
};

// Hasil edit manual di kotak humanizer ikut mengaktifkan rel kanan
$("humanizeOut").addEventListener("input", () => refreshRail());
