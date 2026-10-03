// ============================================================
// FarazExplain — penjelasan STRUKTUR lokal (tanpa AI key)
// Aturan: detector-rules §2 (tiap klaim berbasis bukti terhitung dari
// teks) + §6 (bahasa indikasi, tanpa vonis); humanizer-rules §4 (tanpa
// karang fakta) → hanya statistik teramati: paragraf, kalimat, bagian
// formal, enumerasi, penghubung, data, suara penulis.
// File vanilla JS global (tanpa import/export ES).
// ============================================================
(function (global) {
  "use strict";

  var SECTION_NAMES = [
    "abstrak", "pendahuluan", "latar belakang", "tujuan penelitian",
    "metode", "metodologi", "hasil", "pembahasan", "kesimpulan", "saran"
  ];
  var CONN_LIST = [
    "selain itu", "dengan demikian", "oleh karena itu", "berdasarkan",
    "namun", "tetapi", "sehingga", "kemudian", "pertama", "kedua",
    "however", "moreover", "furthermore", "therefore", "in addition"
  ];
  var VOICE_LIST = ["saya", "kami", "kita", "penulis", "menurut saya", "pengalaman"];

  function getSents(text) {
    if (typeof splitSentences === "function") {
      try {
        var s = splitSentences(text);
        if (s && s.length) return s;
      } catch (_) { /* jatuh ke pemecah lokal */ }
    }
    var norm = String(text).replace(/\s+/g, " ").trim();
    if (!norm) return [];
    return (norm.match(/[^.!?]+[.!?]+["”']?|\S.+$/g) || [norm])
      .map(function (x) { return x.trim(); })
      .filter(function (x) { return x.split(/\s+/).length > 3; });
  }

  function countHits(low, list) {
    var n = 0;
    list.forEach(function (p) {
      var i = -1, from = 0;
      while ((i = low.indexOf(p, from)) !== -1) { n++; from = i + p.length; }
    });
    return n;
  }

  // explain(text) → { bullets[], text, method }. Deskriptif, bukan vonis.
  function explain(text) {
    var t = String(text == null ? "" : text);
    // Penanda markdown tempelan dibuang (helper detector.js) — statistik
    // teramati dihitung dari isi polos; fakta/angka/sitasi dipertahankan.
    try { if (typeof stripMarkdown === "function") t = stripMarkdown(t); } catch (_) {}
    var paras = t.split(/\n\s*\n/).map(function (p) { return p.trim(); }).filter(Boolean);
    var sents = getSents(t);
    var words = (t.trim().match(/[\p{L}\p{N}']+/gu) || []).length;
    var low = t.toLowerCase();

    var bullets = [];
    if (!sents.length) {
      return {
        bullets: ["Teks kosong — belum ada struktur yang dapat dijelaskan."],
        text: "Teks kosong — belum ada struktur yang dapat dijelaskan.",
        method: "penjelasan struktur lokal: tidak ada masukan."
      };
    }
    var avg = (words / sents.length).toFixed(1);
    bullets.push("Teks terdiri dari " + paras.length + " paragraf dan " + sents.length +
      " kalimat (" + words + " kata, rata-rata " + avg + " kata/kalimat).");

    var found = SECTION_NAMES.filter(function (n) {
      return new RegExp("\\b" + n.replace(/ /g, "\\s+") + "\\b", "i").test(t);
    });
    bullets.push(found.length
      ? "Terdeteksi penanda bagian: " + found.join(", ") + " — alur tulisan mengikuti konvensi akademik."
      : "Tidak terdeteksi penanda bagian formal (mis. pendahuluan/metode/hasil) — alur kemungkinan naratif umum.");

    var enumN = sents.filter(function (s) {
      return /^(pertama|kedua|ketiga|keempat|first|second|third|finally)\b[,\s]/i.test(s.trimStart()) ||
        /^\d+[.)]\s+\S/.test(s.trimStart());
    }).length;
    if (enumN >= 2) bullets.push(enumN + " kalimat memakai pola enumerasi — struktur daftar, perlu ditinjau variasinya.");

    var conn = countHits(low, CONN_LIST);
    bullets.push(conn
      ? conn + " kata penghubung formal terhitung — yang dinilai polanya, bukan pemakaiannya."
      : "Belum terhitung kata penghubung formal yang menonjol.");

    var nums = (t.match(/\b\d+([.,]\d+)?\b/g) || []).length;
    var cites = (t.match(/\[\d+(\s*[-–,]\s*\d+)*\]|et al\.|https?:\/\//gi) || []).length;
    bullets.push((nums + cites) > 0
      ? "Konteks konkret teramati: " + nums + " angka dan " + cites + " penanda sitasi/tautan."
      : "Belum teramati angka/sitasi konkret — tulisan masih umum, dapat diperkuat data bila tersedia.");

    var voice = countHits(low, VOICE_LIST);
    bullets.push(voice > 0
      ? "Terdengar " + voice + " penanda suara penulis — sudut pandang penulis hadir."
      : "Belum terdengar suara personal penulis — tulisan bernada impersonal.");

    return {
      bullets: bullets,
      text: bullets.join(" "),
      method: "penjelasan struktur lokal: statistik teramati dari teks (paragraf, kalimat, bagian, penanda) — deskriptif, bukan vonis."
    };
  }

  global.FarazExplain = {
    explain: explain
  };
})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this);
