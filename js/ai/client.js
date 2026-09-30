// ============================================================
// FarazAIClient — klien /api/analyze untuk jalur hybrid
// Aturan: validation-rules §2 (no silent failure: tiap gagal ada
// pesan jelas; dilarang fallback skor palsu), §5 (jujur soal privasi/
// jaringan). Timeout 15 dtk via AbortController, echo hash/v untuk
// korelasi. Tanpa hardcode key — key hanya via opts bila disediakan.
// File vanilla JS global (tanpa import/export ES).
// ============================================================
(function (global) {
  "use strict";

  var ENDPOINT = "/api/analyze";
  var TIMEOUT_MS = 15000;

  // Taksonomi error → { ai: null, reason }. reason jujur untuk status:
  // "timeout" | "offline" | "rate-limited" | "unauthorized" |
  // "malformed" | "http-<kode>" | "aborted" | "unavailable"
  function fail(reason, detail) {
    return { ai: null, reason: reason, detail: detail || "" };
  }

  function isPlainObject(x) {
    return !!x && typeof x === "object" && !Array.isArray(x);
  }

  // Validasi bentuk respons server. Wajib ada score angka 0-100.
  // confidence bila ada harus rendah|sedang|tinggi (else "rendah").
  function normalizeAiPayload(body) {
    if (!isPlainObject(body)) return null;
    var data = isPlainObject(body.data) ? body.data : body;
    var score = typeof data.score === "number" ? data.score : NaN;
    if (!isFinite(score)) return null;
    score = Math.max(0, Math.min(100, Math.round(score)));
    var conf = data.confidence;
    if (conf !== "rendah" && conf !== "sedang" && conf !== "tinggi") conf = "rendah";
    var out = { score: score, confidence: conf };
    if (typeof data.coverage === "number" && isFinite(data.coverage)) {
      out.coverage = Math.max(0, Math.min(1, data.coverage));
    }
    if (data.lang === "id" || data.lang === "en") out.lang = data.lang;
    if (typeof data.modelLang === "string") out.modelLang = data.modelLang;
    if (typeof data.method === "string") out.method = data.method.slice(0, 200);
    return out;
  }

  // opts: { endpoint, timeoutMs, fetchImpl, apiKey?, extraHeaders? }
  // payload: { text|canonicalText, hash, v, lang } — hash/v di-echo.
  // Sukses: { ai, reason: null, echo: { hash, v } }.
  // Gagal: { ai: null, reason, detail?, echo: { hash, v } }.
  async function analyze(payload, opts) {
    var o = opts || {};
    var p = payload || {};
    var endpoint = typeof o.endpoint === "string" && o.endpoint ? o.endpoint : ENDPOINT;
    var timeoutMs = typeof o.timeoutMs === "number" && o.timeoutMs > 0 ? o.timeoutMs : TIMEOUT_MS;
    var fetchImpl = o.fetchImpl || (typeof fetch !== "undefined" ? fetch : null);
    var hash = typeof p.hash === "string" ? p.hash : "";
    var v = typeof p.v === "number" ? p.v : 1;
    var echo = { hash: hash, v: v };
    var text = typeof p.canonicalText === "string" ? p.canonicalText
      : (typeof p.text === "string" ? p.text : "");

    if (!fetchImpl) return { ai: null, reason: "unavailable", detail: "fetch tidak tersedia di lingkungan ini.", echo: echo };
    if (!text) return { ai: null, reason: "malformed", detail: "teks kosong, tidak dikirim.", echo: echo };

    var AC = typeof AbortController !== "undefined" ? AbortController : null;
    var ctrl = AC ? new AC() : null;
    var timer = null;
    var timedOut = false;
    if (ctrl) {
      timer = setTimeout(function () {
        timedOut = true;
        try { ctrl.abort(); } catch (_) {}
      }, timeoutMs);
    }

    var headers = { "Content-Type": "application/json" };
    if (o.extraHeaders && typeof o.extraHeaders === "object") {
      for (var k in o.extraHeaders) {
        if (Object.prototype.hasOwnProperty.call(o.extraHeaders, k)) headers[k] = o.extraHeaders[k];
      }
    }
    // Key tidak di-hardcode: hanya dikirim bila pemanggil memberi opts.apiKey.
    if (typeof o.apiKey === "string" && o.apiKey) headers["Authorization"] = "Bearer " + o.apiKey;

    var res;
    try {
      res = await fetchImpl(endpoint, {
        method: "POST",
        headers: headers,
        body: JSON.stringify({ text: text, hash: hash, v: v, lang: p.lang || "" }),
        signal: ctrl ? ctrl.signal : undefined
      });
    } catch (e) {
      if (timer) clearTimeout(timer);
      var msg = (e && (e.name + ": " + e.message)) || "fetch gagal";
      if (timedOut || (e && e.name === "AbortError")) {
        return { ai: null, reason: "timeout", detail: "melebihi " + timeoutMs + " ms.", echo: echo };
      }
      // TypeError saat fetch = jaringan mati / CORS / DNS (offline).
      if (e && (e.name === "TypeError" || /failed to fetch|network|offline/i.test(String(e.message)))) {
        return { ai: null, reason: "offline", detail: msg.slice(0, 200), echo: echo };
      }
      return { ai: null, reason: "unavailable", detail: msg.slice(0, 200), echo: echo };
    }
    if (timer) clearTimeout(timer);

    if (!res || typeof res.status !== "number") {
      return { ai: null, reason: "malformed", detail: "respons tanpa status HTTP.", echo: echo };
    }
    if (res.status === 429) return { ai: null, reason: "rate-limited", detail: "HTTP 429.", echo: echo };
    if (res.status === 401 || res.status === 403) return { ai: null, reason: "unauthorized", detail: "HTTP " + res.status + ".", echo: echo };
    if (res.status < 200 || res.status >= 300) {
      return { ai: null, reason: "http-" + res.status, detail: "HTTP " + res.status + ".", echo: echo };
    }

    var body = null;
    try {
      body = await res.json();
    } catch (_) {
      return { ai: null, reason: "malformed", detail: "badan respons bukan JSON.", echo: echo };
    }
    var ai = normalizeAiPayload(body);
    if (!ai) return { ai: null, reason: "malformed", detail: "respons tanpa skor numerik.", echo: echo };

    // Echo balik hash/v bila server menyertakan — bantu audit korelasi.
    // Tidak menggagalkan bila server tidak meng-echo (tetap pakai echo lokal).
    var serverEcho = (body && isPlainObject(body.echo)) ? body.echo : null;
    void serverEcho;

    return { ai: ai, reason: null, echo: echo };
  }

  global.FarazAIClient = {
    analyze: analyze,
    ENDPOINT: ENDPOINT,
    TIMEOUT_MS: TIMEOUT_MS
  };
})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this);
