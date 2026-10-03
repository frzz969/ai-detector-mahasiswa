'use strict';
// ============================================================
// api/contact.js — Redirect Saran/Lapor ke WhatsApp (Vercel Function)
// Nomor WA TIDAK disimpan di repo — hanya dari env server WA_NUMBER.
// GET /api/contact?text=... -> 302 ke https://wa.me/<WA_NUMBER>?text=...
// WA_NUMBER belum diisi -> 503 + pesan jelas (bukan redirect ngawur).
// ============================================================

module.exports = function contact(req, res) {
  const num = String(process.env.WA_NUMBER || '').replace(/\D/g, '');
  if (!/^628\d{7,13}$/.test(num)) {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Kontak belum tersedia. Coba lagi nanti.');
    return;
  }
  const raw = req && req.query && req.query.text != null
    ? String(req.query.text)
    : 'Halo Admin Faraz Detector AI! Saya menemukan kendala saat: [tulis fiturnya]. Detailnya: ';
  const url = 'https://wa.me/' + num + '?text=' + encodeURIComponent(raw).slice(0, 500);
  res.statusCode = 302;
  res.setHeader('Location', url);
  res.setHeader('Cache-Control', 'no-store');
  res.end();
};
