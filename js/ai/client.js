// FarazAIClient — klien /api/* untuk jalur hybrid (Vercel).
// Kontrak: POST { v, hash, canonicalText }, hash = SHA-256 hex (FNV TIDAK dikirim).
// Aturan: validation-rules §2 (no silent failure; tanpa skor palsu), §5 (tanpa klaim
// absolut); detector-rules §6 (bahasa indikasi). Gagal → fallback lokal + status jujur.
// Tanpa hardcode key. File vanilla JS global (tanpa import/export ES).
(function (global) {
  "use strict";

  var ENDPOINTS = {
    analyze: "/api/analyze",
    summarize: "/api/summarize",
    explain: "/api/explain",
    humanize: "/api/humanize",
    material: "/api/material"
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

  // SHA-256 hex via crypto.subtle. Tak tersedia → null: pemanggil anggap API unavailable,
  // JANGAN kirim hash palsu/FNV (server hanya terima SHA-256 64-hex).
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

  // Susun body { v, hash, canonicalText }. Gagal → { ok:false, reason, detail }. v default 1.
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

  // Petakan status HTTP + server code (MALFORMED/HASH_MISMATCH/...) ke reason kanonis.
  function mapReason(status, serverCode) {
    if (serverCode === "RATE_LIMITED" || status === 429) return "rate-limited";
    if (serverCode === "UNAUTHORIZED" || status === 401 || status === 403) return "unauthorized";
    if (serverCode === "TIMEOUT" || status === 504) return "timeout";
    if (serverCode === "MALFORMED" || serverCode === "HASH_MISMATCH" || serverCode === "UNSUPPORTED_VERSION") return "malformed";
    if (serverCode === "METHOD_NOT_ALLOWED" || serverCode === "PROVIDER_MISCONFIGURED" || serverCode === "PROVIDER_ERROR") return "unavailable";
    if (typeof status === "number" && (status < 200 || status >= 300)) return "http-" + status;
    return "unavailable";
  }

  // POST JSON generik (opts: endpoint/timeoutMs/fetchImpl/apiKey/extraHeaders).
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

  // Validasi /api/analyze: wajib skor 0-100; confidence harus rendah|sedang|tinggi.
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

  // Validasi /api/summarize|explain|humanize. result kosong → null (RELEVANCE GATE:
  // bukan karangan) agar pemanggil fallback lokal.
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
      // sentences[] = kandidat ekstraktif verbatim (humanizer-rules P4). Client
      // WAJIB memverifikasi tiap kalimat substring dari teks sebelum dipakai.
      sentences: arr(body.sentences),
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

  // Satu endpoint terstruktur. Sukses → { text, ... }; gagal → fallback lokal pemanggil.
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

  // Sukses: { ai, reason: null, echo }. Gagal: { ai: null, reason, detail?, echo }.
  // Hash lama/FNV diabaikan → dihitung ulang SHA-256.
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
      // Kompat: hash lama/FNV → hitung ulang SHA-256; gagal → unavailable.
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

    // Echo hash/v server bila ada (bantu audit; absennya tidak menggagalkan).
    var serverEcho = (sent.body && isPlainObject(sent.body.echo)) ? sent.body.echo : null;
    void serverEcho;

    return { ai: ai, reason: null, echo: echo };
  }

  function summarize(canonicalText, opts) { return callStructured("summarize", canonicalText, opts); }
  function explain(canonicalText, opts) { return callStructured("explain", canonicalText, opts); }
  function humanize(canonicalText, opts) { return callStructured("humanize", canonicalText, opts); }

  // Validasi /api/material: { materials[], query, warnings } (tanpa result teks).
  // materials kosong → tetap sukses jujur (bukan karangan); gagal → reason jujur.
  function normalizeMaterials(body) {
    if (!isPlainObject(body) || !Array.isArray(body.materials)) return null;
    var arr = function (x) {
      if (!Array.isArray(x)) return [];
      return x.filter(function (s) { return typeof s === "string"; }).slice(0, 50);
    };
    var items = body.materials.slice(0, 10).map(function (m) {
      if (!isPlainObject(m)) return null;
      if (typeof m.title !== "string" || !m.title.trim()) return null;
      return {
        title: String(m.title).slice(0, 300),
        authors: Array.isArray(m.authors)
          ? m.authors.filter(function (a) { return typeof a === "string"; }).slice(0, 5) : [],
        year: (typeof m.year === "number" && isFinite(m.year)) ? Math.round(m.year) : null,
        venue: typeof m.venue === "string" ? m.venue.slice(0, 200) : "",
        doi: typeof m.doi === "string" ? m.doi.slice(0, 200) : "",
        url: typeof m.url === "string" ? m.url.slice(0, 300) : "",
        citations: (typeof m.citations === "number" && isFinite(m.citations)) ? Math.round(m.citations) : null,
        tier: typeof m.tier === "string" ? m.tier.slice(0, 40) : "Umum",
        source: typeof m.source === "string" ? m.source.slice(0, 40) : "Umum",
        // Relevance gate: server sudah menyaring. Field ini hanya audit/UI —
        // client TIDAK memfilter ulang (server yang pegang ambang).
        relevance: (typeof m.relevance === "number" && isFinite(m.relevance))
          ? Math.max(0, Math.min(1, m.relevance)) : null,
        relevanceReason: typeof m.relevanceReason === "string" ? m.relevanceReason.slice(0, 240) : ""
      };
    }).filter(Boolean);
    return {
      materials: items,
      query: typeof body.query === "string" ? body.query.slice(0, 200) : "",
      warnings: arr(body.warnings),
      method: typeof body.method === "string" ? body.method.slice(0, 300) : "",
      threshold: (typeof body.threshold === "number" && isFinite(body.threshold))
        ? body.threshold : null,
      topics: Array.isArray(body.topics)
        ? body.topics.filter(function (t) { return typeof t === "string"; }).slice(0, 12) : [],
      modelId: typeof body.modelId === "string" ? body.modelId.slice(0, 120) : "",
      coverage: (typeof body.coverage === "number" && isFinite(body.coverage))
        ? Math.max(0, Math.min(1, body.coverage)) : null
    };
  }

  // Satu endpoint materi. Sukses → { materials, ... }; gagal → { materials: [], reason }.
  async function material(canonicalText, opts) {
    var o = opts || {};
    var endpoint = (typeof o.endpoint === "string" && o.endpoint) ? o.endpoint : ENDPOINTS.material;
    if (!endpoint) return { materials: [], query: "", warnings: [], reason: "unavailable", detail: "endpoint materi tak dikenal." };
    var contract = await buildContract(canonicalText, o.v);
    if (!contract.ok) return { materials: [], query: "", warnings: [], reason: contract.reason, detail: contract.detail };
    var sent = await postJson(endpoint, contract.body, o);
    if (!sent.ok) return { materials: [], query: "", warnings: [], reason: sent.reason, detail: sent.detail };
    var d = normalizeMaterials(sent.body);
    if (!d) return { materials: [], query: "", warnings: [], reason: "malformed", detail: "respons tanpa daftar materials." };
    d.reason = null;
    d.detail = "";
    return d;
  }

  global.FarazAIClient = {
    analyze: analyze,
    summarize: summarize,
    explain: explain,
    humanize: humanize,
    material: material,
    sha256Hex: sha256Hex,
    buildContract: buildContract,
    ENDPOINTS: ENDPOINTS,
    ENDPOINT: ENDPOINT,
    TIMEOUT_MS: TIMEOUT_MS
  };
})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this);
