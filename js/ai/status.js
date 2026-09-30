// ============================================================
// FarazStatus — string status jujur untuk alur hybrid
// Aturan: validation-rules §2 (status sesuai proses sebenarnya,
// bukan animasi; tanpa klaim selesai bila kondisi tak terpenuhi),
// detector-rules §6 + validation-rules §5 (bahasa indikasi saja;
// tanpa klaim absolut/persen-voniskepastian/jaminan/lolos-bersih).
// File vanilla JS global (tanpa import/export ES).
// ============================================================
(function (global) {
  "use strict";

  // Tahapan kanonis alur hybrid. ID stabil untuk kabel UI.
  var STEPS = ["preparing", "local", "ai", "combining", "validating", "done"];

  var LABELS = {
    preparing: "Menyiapkan teks...",
    local: "Menjalankan pemeriksaan lokal...",
    ai: "Menjalankan pemeriksaan AI...",
    combining: "Menggabungkan hasil...",
    validating: "Memvalidasi hasil...",
    done: "Selesai — skor indikasi, bukan vonis.",
    idle: "Siap."
  };

  // Pesan kegagalan AI yang jujur per reason (lihat FarazAIClient).
  var AI_FAIL = {
    timeout: "Pemeriksaan AI melebihi batas waktu — dipakai hasil lokal.",
    offline: "Pemeriksaan AI tidak terjangkau (offline?) — dipakai hasil lokal.",
    "rate-limited": "Pemeriksaan AI dibatasi server — dipakai hasil lokal.",
    unauthorized: "Pemeriksaan AI tidak diizinkan — dipakai hasil lokal.",
    malformed: "Respons AI tidak lengkap — dipakai hasil lokal.",
    unavailable: "Pemeriksaan AI tidak tersedia — dipakai hasil lokal."
  };

  function label(step) {
    return LABELS[step] || LABELS.idle;
  }

  function aiFailMessage(reason) {
    if (AI_FAIL[reason]) return AI_FAIL[reason];
    if (typeof reason === "string" && reason.indexOf("http-") === 0) {
      return "Pemeriksaan AI gagal (" + reason + ") — dipakai hasil lokal.";
    }
    return LABELS.unavailable || AI_FAIL.unavailable;
  }

  // Tracker kecil: create(onChange) → { set(step), get(), label() }.
  function create(onChange) {
    var current = "idle";
    function set(step) {
      if (STEPS.indexOf(step) === -1 && step !== "idle") return current;
      current = step;
      if (typeof onChange === "function") {
        try { onChange(current, label(current)); } catch (_) {}
      }
      return current;
    }
    return {
      set: set,
      get: function () { return current; },
      label: function () { return label(current); }
    };
  }

  // Helper DOM opsional: tulis status ke elemen bila ada.
  function setText(el, step) {
    var msg = label(step);
    if (el && typeof el === "object" && ("textContent" in el)) {
      try { el.textContent = msg; } catch (_) {}
    }
    return msg;
  }

  global.FarazStatus = {
    STEPS: STEPS,
    label: label,
    create: create,
    setText: setText,
    aiFailMessage: aiFailMessage
  };
})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this);
