// ============================================================
// FarazAIClient — klien /api/* untuk jalur hybrid (Vercel)
// Kontrak server (api/*.js): POST { v, hash, canonicalText } dengan
// hash = SHA-256 hex dari canonicalText. Hash FNV lama TIDAK dikirim
// (server menolaknya MALFORMED).
// Aturan: validation-rules §2 (no silent failure: tiap gagal ada
// reason jujur; dilarang fallback skor palsu), §5 (jujur soal privasi/
// jaringan; tanpa klaim absolut), detector-rules §6 (bahasa indikasi).
// Pola: coba API dulu (timeout 15 dtk via AbortController); gagal/
// offline/404/MALFORMED/unauthorized/rate-limited → pemanggil FALLBACK
// ke implementasi lokal + status jujur. Tanpa hardcode key — key hanya
// via opts bila disediakan (production: key di env server, bukan di sini).
// File vanilla JS global (tanpa import/export ES).
// ============================================================
(function (global) {
  "use strict";

  var ENDPOINTS = {
    analyze: "/api/analyze",
    summarize: "/api/summarize",
    explain: "/api/explain",
    humanize: "/api/humanize"
  };
  // Alias lawas (kompat): ENDPOINT = analyze.
  var ENDPOINT = ENDPOINTS.analyze;
  var TIMEOUT_MS = 15000;

  // Taksonomi error → reason kanonis untuk status jujur:
  // "timeout" | "offline" | "rate-limited" | "unauthorized" |
  // "malformed" | "http-<kode>" | "unavailable"
  function fail(reason, detail) {
    return { ai: null, reason: reason, detail: detail || "" };
  }

  function isPlainObject(x) {
    return !!x && typeof x === "object" && !Array.isArray(x);
  }

  // SHA-256 hex async via crypto.subtle. Tak tersedia (file:// non-secure
  // context, browser lama, WebView) → null: pemanggil WAJIB menganggap
  // API unavailable dan JANGAN mengirim hash palsu/FNV (server hanya
  // terima SHA-256 64-hex → MALFORMED/HASH_MISMATCH).
  async function sha256Hex(text) {
    try {
      var subtle = null;
      try {
        if (typeof crypto !== "undefined" && crypto && crypto.subtle) subtle = crypto.subtle;
        else if (typeof window !== "undefined" && window.crypto && window.crypto.subtle) subtle = window.crypto.subtle;
        else if (typeof globalThis !== "undefined" && globalThis.crypto && globalThis.crypto.subtle) subtle = globalThis.crypto.subtle;
      } catch (_) { subtle = null; }
      if (!subtle) return null;
      var data = null;
      try {
        if (typeof TextEncoder !== "undefined") data = new TextEncoder().encode(String(text));
        else if (typeof globalThis !== "undefined" && globalThis.TextEncoder) data = new globalThis.TextEncoder().encode(String(text));
        else return null;
      } catch (_) { return null; }
      var buf = await subtle.digest("SHA-256", data);
      var bytes = new Uint8Array(buf);
      var hex = "";
      for (var i = 0; i < bytes.length; i++) {
        var h = bytes[i].toString(16);
        hex += (h.length < 2 ? "0" : "") + h;
      }
      return (/^[a-f0-9]{64}$/.test(hex)) ? hex : null;
    } catch (_) { return null; }
  }

  // Susun body kontrak server { v, hash, canonicalText }.
  // Gagal (kosong / SHA-256 tak tersedia) → { ok:false, reason, detail },
  // pemanggil fallback lokal. v default 1 (cermin api/config SUPPORTED_V).
  async function buildContract(canonicalText, v) {
    var t = typeof canonicalText === "string" ? canonicalText : "";
    if (!t.trim()) return { ok: false, reason: "malformed", detail: "teks kosong, tidak dikirim." };
    var vv = (typeof v === "number" && isFinite(v) && v > 0) ? Math.round(v) : 1;
    var hash = null;
    try { hash = await sha256Hex(t); } catch (_) { hash = null; }
    if (!hash) {
      return { ok: false, reason: "unavailable", detail: "hash aman (SHA-256) tak tersedia di lingkungan ini — API dilewati." };
    }
    return { ok: true, body: { v: vv, hash: hash, canonicalText: t } };
  }

  // Petakan status HTTP + server code {error, code} ke reason kanonis.
  // Server codes: MALFORMED/HASH_MISMATCH/UNSUPPORTED_VERSION/
  // METHOD_NOT_ALLOWED/UNAUTHORIZED/RATE_LIMITED/TIMEOUT/
  // PROVIDER_ERROR/PROVIDER_MISCONFIGURED.
  function mapReason(status, serverCode) {
    if (serverCode === "RATE_LIMITED" || status === 429) return "rate-limited";
    if (serverCode === "UNAUTHORIZED" || status === 401 || status === 403) return "unauthorized";
    if (serverCode === "TIMEOUT" || status === 504) return "timeout";
    if (serverCode === "MALFORMED" || serverCode === "HASH_MISMATCH" || serverCode === "UNSUPPORTED_VERSION") return "malformed";
    if (serverCode === "METHOD_NOT_ALLOWED" || serverCode === "PROVIDER_MISCONFIGURED" || serverCode === "PROVIDER_ERROR") return "unavailable";
    if (typeof status === "number" && (status < 200 || status >= 300)) return "http-" + status;
    return "unavailable";
  }

  // POST JSON generik. Sukses 2xx + JSON → { ok:true, status, body }.
  // Gagal → { ok:false, reason, detail, status } (taksonomi di atas).
  // opts: { endpoint?, timeoutMs?, fetchImpl?, apiKey?, extraHeaders? }
  async function postJson(endpoint, body, opts) {
    var o = opts || {};
    var timeoutMs = (typeof o.timeoutMs === "number" && o.timeoutMs > 0) ? o.timeoutMs : TIMEOUT_MS;
    var fetchImpl = o.fetchImpl || (typeof fetch !== "undefined" ? fetch : null);
    if (!fetchImpl) {
      return { ok: false, reason: "unavailable", detail: "fetch tidak tersedia di lingkungan ini.", status: 0 };
    }

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
        body: JSON.stringify(body),
        signal: ctrl ? ctrl.signal : undefined
      });
    } catch (e) {
      if (timer) clearTimeout(timer);
      var msg = (e && (e.name + ": " + e.message)) || "fetch gagal";
      if (timedOut || (e && e.name === "AbortError")) {
        return { ok: false, reason: "timeout", detail: "melebihi " + timeoutMs + " ms.", status: 0 };
      }
      // TypeError saat fetch = jaringan mati / CORS / DNS / file:// (offline).
      if (e && (e.name === "TypeError" || /failed to fetch|network|offline/i.test(String(e.message)))) {
        return { ok: false, reason: "offline", detail: msg.slice(0, 200), status: 0 };
      }
      return { ok: false, reason: "unavailable", detail: msg.slice(0, 200), status: 0 };
    }
    if (timer) clearTimeout(timer);

    if (!res || typeof res.status !== "number") {
      return { ok: false, reason: "malformed", detail: "respons tanpa status HTTP.", status: 0 };
    }
    var status = res.status;
    if (status < 200 || status >= 300) {
      // Baca {error, code} server bila ada (GH Pages 404 = HTML → http-404).
      var serverCode = "";
      var serverError = "";
      try {
        var eb = await res.json();
        if (isPlainObject(eb)) {
          if (typeof eb.code === "string") serverCode = eb.code;
          if (typeof eb.error === "string") serverError = eb.error;
        }
      } catch (_) { /* bukan JSON (mis. halaman 404 statis) */ }
      var reason = mapReason(status, serverCode);
      var detail = (serverError || ("HTTP " + status + ".")).slice(0, 200);
      return { ok: false, reason: reason, detail: detail, status: status };
    }

    var okBody = null;
    try {
      okBody = await res.json();
    } catch (_) {
      return { ok: false, reason: "malformed", detail: "badan respons bukan JSON.", status: status };
    }
    return { ok: true, status: status, body: okBody };
  }

  // Validasi bentuk respons /api/analyze. Wajib ada score angka 0-100.
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

  // Validasi skema terstruktur /api/summarize|explain|humanize:
  // { result, sourceFacts[], contextualFacts[], inferences[],
  //   protectedElements[], warnings[], confidence }.
  // result kosong → null (RELEVANCE GATE server: bukan karangan) agar
  // pemanggil fallback lokal, bukan tampilkan teks kosong.
  function normalizeStructured(body) {
    if (!isPlainObject(body)) return null;
    if (typeof body.result !== "string" || !body.result.trim()) return null;
    var conf = body.confidence;
    if (conf !== "rendah" && conf !== "sedang" && conf !== "tinggi") conf = "rendah";
    var arr = function (x) {
      if (!Array.isArray(x)) return [];
      return x.filter(function (s) { return typeof s === "string"; }).slice(0, 50);
    };
    return {
      text: body.result,
      confidence: conf,
      sourceFacts: arr(body.sourceFacts),
      contextualFacts: arr(body.contextualFacts),
      inferences: arr(body.inferences),
      protectedElements: arr(body.protectedElements),
      warnings: arr(body.warnings),
      modelId: typeof body.modelId === "string" ? body.modelId.slice(0, 120) : "",
      coverage: (typeof body.coverage === "number" && isFinite(body.coverage))
        ? Math.max(0, Math.min(1, body.coverage)) : null
    };
  }

  function structuredFail(reason, detail) {
    return { text: null, confidence: "rendah", warnings: [], modelId: "", coverage: null, reason: reason, detail: detail || "" };
  }

  // Panggil satu endpoint terstruktur (summarize/explain/humanize).
  // Sukses → { text, confidence, ..., reason: null }.
  // Gagal → { text: null, reason, detail, ... } (pemanggil fallback lokal).
  async function callStructured(kind, canonicalText, opts) {
    var o = opts || {};
    var endpoint = (typeof o.endpoint === "string" && o.endpoint) ? o.endpoint : ENDPOINTS[kind];
    if (!endpoint) return structuredFail("unavailable", "endpoint tak dikenal: " + kind + ".");
    var contract = await buildContract(canonicalText, o.v);
    if (!contract.ok) return structuredFail(contract.reason, contract.detail);
    var sent = await postJson(endpoint, contract.body, o);
    if (!sent.ok) return structuredFail(sent.reason, sent.detail);
    var d = normalizeStructured(sent.body);
    if (!d) return structuredFail("malformed", "respons tanpa result teks.");
    d.reason = null;
    d.detail = "";
    return d;
  }

  // opts: { endpoint?, timeoutMs?, fetchImpl?, apiKey?, extraHeaders?, v? }
  // payload: { canonicalText } (+ { hash, v } bila sudah dihitung pemanggil;
  //   hash lama/FNV diabaikan → dihitung ulang SHA-256).
  // Sukses: { ai, reason: null, echo: { hash, v } }.
  // Gagal: { ai: null, reason, detail?, echo: { hash, v } }.
  async function analyze(payload, opts) {
    var o = opts || {};
    var p = payload || {};
    var endpoint = (typeof o.endpoint === "string" && o.endpoint) ? o.endpoint : ENDPOINT;
    var text = (typeof p.canonicalText === "string" && p.canonicalText) ? p.canonicalText
      : (typeof p.text === "string" ? p.text : "");
    var v = (typeof p.v === "number" && isFinite(p.v) && p.v > 0) ? Math.round(p.v)
      : (typeof o.v === "number" && isFinite(o.v) && o.v > 0 ? Math.round(o.v) : 1);
    var hash = (typeof p.hash === "string" && /^[a-f0-9]{64}$/i.test(p.hash)) ? p.hash : "";
    if (!text.trim()) {
      return { ai: null, reason: "malformed", detail: "teks kosong, tidak dikirim.", echo: { hash: hash, v: v } };
    }
    if (!hash) {
      // Kompat: pemanggil lama / hash FNV → hitung ulang SHA-256.
      // Gagal hitung → unavailable (jangan kirim hash palsu).
      try { hash = await sha256Hex(text); } catch (_) { hash = null; }
      if (!hash) {
        return { ai: null, reason: "unavailable", detail: "hash aman (SHA-256) tak tersedia — API dilewati, dipakai hasil lokal.", echo: { hash: "", v: v } };
      }
    }
    var echo = { hash: hash, v: v };
    var sent = await postJson(endpoint, { v: v, hash: hash, canonicalText: text }, o);
    if (!sent.ok) return { ai: null, reason: sent.reason, detail: sent.detail, echo: echo };
    var ai = normalizeAiPayload(sent.body);
    if (!ai) return { ai: null, reason: "malformed", detail: "respons tanpa skor numerik.", echo: echo };

    // Echo balik hash/v bila server menyertakan — bantu audit korelasi.
    // Tidak menggagalkan bila server tidak meng-echo (tetap pakai echo lokal).
    var serverEcho = (sent.body && isPlainObject(sent.body.echo)) ? sent.body.echo : null;
    void serverEcho;

    return { ai: ai, reason: null, echo: echo };
  }

  function summarize(canonicalText, opts) { return callStructured("summarize", canonicalText, opts); }
  function explain(canonicalText, opts) { return callStructured("explain", canonicalText, opts); }
  function humanize(canonicalText, opts) { return callStructured("humanize", canonicalText, opts); }

  global.FarazAIClient = {
    analyze: analyze,
    summarize: summarize,
    explain: explain,
    humanize: humanize,
    sha256Hex: sha256Hex,
    buildContract: buildContract,
    ENDPOINTS: ENDPOINTS,
    ENDPOINT: ENDPOINT,
    TIMEOUT_MS: TIMEOUT_MS
  };
})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this);
