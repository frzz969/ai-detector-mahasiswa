#!/usr/bin/env python3
"""Fase 2 — Akuisisi human-ID dari Wikipedia Indonesia via Action API resmi.

Metode (100% gratis, tanpa key, hemat kuota — sesuai alokasi Fase 2):
  1. ``list=random`` (rnnamespace=0) untuk judul acak artikel.
  2. ``prop=revisions`` per judul dengan ``rvstart=2021-12-31T23:59:59Z``
     + ``rvdir=older`` sehingga teks + rev_date yang diambil adalah revisi
     yang berlaku pada akhir 2021 (setara snapshot idwiki 20211201).
     Judul yang baru dibuat setelah 2021 (tanpa revisi pra-2022) dibuang.

Cara jalan:
  py eval/build_wiki.py --contact "nama <email>" [--keep 200]

Keluaran: eval/raw_wiki.jsonl + eval/raw_wiki_stats.json
Satu baris = {title, text, url, rev_date, license, license_url, source,
method, api_asof}.
Filter: judul non-list ("Daftar ..."); markup wiki dibuang; teks bersih
min 800 karakter; shuffle deterministik (seed tetap) lalu ambil N.

Hanya memakai Action API resmi id.wikipedia.org dengan User-Agent sopan +
retry/backoff; bukan scrape liar (tanpa bypass, tanpa key).

Aturan: validation-rules §2 (gagal unduh/parse -> exit non-nol + pesan jelas,
tanpa fallback diam-diam); dataset-eval.md (ragu -> buang; provenance penuh).
"""

import argparse
import concurrent.futures
import json
import random
import re
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

API = "https://id.wikipedia.org/w/api.php"
ASOF = "2021-12-31T23:59:59Z"
SOURCE = "idwiki-20211201"
LICENSE = "CC BY-SA 3.0"
LICENSE_URL = "http://creativecommons.org/licenses/by-sa/3.0/"
METHOD = "mediawiki-api-revision-asof-2021-12-31"

RE_COMMENT = re.compile(r"<!--.*?-->", re.S)
RE_REF = re.compile(r"<ref[^>/]*>.*?</ref>|<ref[^>]*/>", re.S | re.I)
RE_TPL = re.compile(r"\{\{[^{}]*\}\}")
RE_TABLE = re.compile(r"\{\|.*?\|\}", re.S)
RE_MEDIA = re.compile(
    r"\[\[(?:File|Image|Berkas|Gambar|Kategori|Category|Media|Istimewa|Special):[^\]]*\]\]",
    re.I,
)
RE_LINK_LBL = re.compile(r"\[\[([^|\]]+)\|([^\]]+)\]\]")
RE_LINK = re.compile(r"\[\[([^\]]+)\]\]")
RE_EXTLBL = re.compile(r"\[https?://[^\s\]]+\s+([^\]]+)\]")
RE_URL = re.compile(r"https?://\S+")
RE_HEAD = re.compile(r"^=+\s*(.*?)\s*=+\s*$")
RE_BOLD = re.compile(r"'''?")
SKIP_TITLE_PREFIX = ("Daftar ", "Lampiran ", "Daftar")


def clean_wikitext(wt):
    """Buang markup wiki; kembalikan teks polos. List/table/disisihkan."""
    s = RE_COMMENT.sub("", wt)
    s = RE_REF.sub("", s)
    for _ in range(6):
        new = RE_TPL.sub("", s)
        if new == s:
            break
        s = new
    for _ in range(3):
        new = RE_TABLE.sub("", s)
        if new == s:
            break
        s = new
    s = RE_MEDIA.sub("", s)
    out_lines = []
    for line in s.splitlines():
        t = line.strip()
        if not t:
            continue
        if t[0] in "*#;:":
            continue  # baris list/indentasi -> buang
        if t[0] in "|!}":
            continue  # sisa baris tabel -> buang
        m = RE_HEAD.match(t)
        if m:
            t = m.group(1)
        t = RE_LINK_LBL.sub(r"\2", t)
        t = RE_LINK.sub(r"\1", t)
        t = RE_EXTLBL.sub(r"\1", t)
        t = RE_URL.sub("", t)
        t = RE_BOLD.sub("", t)
        t = re.sub(r"\s+", " ", t).strip()
        if t:
            out_lines.append(t)
    return "\n".join(out_lines).strip()


def api_get(params, ua, tries=8):
    """GET ke Action API dengan retry/backoff; gagal total -> raise.

    Menuruti etiket Wikimedia: parameter maxlag + menghormati header
    Retry-After saat 429/503 (bukan bypass, melainkan menunggu).
    """
    params = dict(params)
    params.setdefault("maxlag", "5")
    last = None
    for att in range(1, tries + 1):
        try:
            q = urllib.parse.urlencode(params)
            req = urllib.request.Request(API + "?" + q,
                                         headers={"User-Agent": ua})
            with urllib.request.urlopen(req, timeout=60) as h:
                data = json.load(h)
            err = data.get("error")
            if err:
                code = err.get("code", "")
                info = err.get("info", "")
                if code == "maxlag":
                    wait = min(10 * att, 120)
                    print("  api maxlag percobaan %d/%d: tunggu %ds"
                          % (att, tries, wait), flush=True)
                    time.sleep(wait)
                    last = RuntimeError("maxlag: %s" % info)
                    continue
                raise RuntimeError("API error %s: %s" % (code, info))
            return data
        except RuntimeError:
            raise  # error API permanen (mis. parameter) -> gagal cepat
        except urllib.error.HTTPError as e:
            last = e
            if e.code in (429, 503):
                ra = e.headers.get("Retry-After")
                try:
                    wait = int(str(ra))
                except (TypeError, ValueError):
                    wait = min(30 * att, 180)
                print("  api 429/503 percobaan %d/%d: tunggu %ds"
                      % (att, tries, wait), flush=True)
                time.sleep(wait)
                continue
            wait = 2 * att
            print("  api HTTP %s retry %d/%d: tunggu %ds"
                  % (e.code, att, tries, wait), flush=True)
            time.sleep(wait)
        except Exception as e:  # noqa: BLE001 — dicatat lalu retry
            last = e
            wait = 2 * att
            print("  api retry %d/%d: %r (tunggu %ds)"
                  % (att, tries, e, wait), flush=True)
            time.sleep(wait)
    raise RuntimeError("API gagal %d percobaan: %r" % (tries, last))


def main():
    ap = argparse.ArgumentParser(
        description="Akuisisi artikel idwiki revisi-2021 via API.")
    ap.add_argument("--contact", default="faraz-eval-local",
                    help="Kontak sopan untuk User-Agent (mis. 'nama <email>').")
    ap.add_argument("--keep", type=int, default=200)
    ap.add_argument("--seed", type=int, default=20211201)
    ap.add_argument("--min-chars", type=int, default=800)
    ap.add_argument("--batch", type=int, default=60,
                    help="Judul acak per ronde list=random.")
    ap.add_argument("--max-rounds", type=int, default=10)
    ap.add_argument("--delay", type=float, default=2.5,
                    help="Jeda detik antar-request (sopan, anti-429).")
    ap.add_argument("--workers", type=int, default=4,
                    help="Request revisi paralel (kecil & sopan, disarankan 2-4).")
    ap.add_argument("--out", default="eval/raw_wiki.jsonl")
    ap.add_argument("--stats", default="eval/raw_wiki_stats.json")
    a = ap.parse_args()

    ua = ("FarazEval/1.0 (%s) Fase2-acquisition; idwiki-api rev-asof-2021"
          % a.contact)
    rng = random.Random(a.seed)
    seen_titles = set()
    qualifying = []
    dropped = {"list_title": 0, "no_oldrev": 0, "short": 0,
               "missing": 0, "dup_title": 0, "empty_rev_response": 0}
    rounds = 0
    rev_requests = 0

    lock = threading.Lock()

    def fetch_one(title):
        """Ambil revisi per-akhir-2021 satu judul. Kembalikan
        (status, record). status: ok|list(short dsb. sudah dihitung pemanggil).
        Selalu jeda sopan seusai request."""
        try:
            rdata = api_get({
                "action": "query", "format": "json",
                "formatversion": "2", "prop": "revisions",
                "titles": title,
                "rvstart": ASOF, "rvdir": "older", "rvlimit": "1",
                "rvprop": "timestamp|content", "rvslots": "main",
            }, ua)
        finally:
            time.sleep(a.delay)
        pages = rdata.get("query", {}).get("pages", [])
        if not pages:
            print("  PERINGATAN: respons revisi kosong untuk judul: "
                  "%s" % title[:60], flush=True)
            return ("empty_rev_response", None)
        for pg in pages:
            if pg.get("missing"):
                return ("missing", None)
            t = pg.get("title", "")
            revs = pg.get("revisions") or []
            if not revs:
                return ("no_oldrev", None)
            rev = revs[0]
            try:
                content = rev["slots"]["main"]["content"]
            except KeyError:
                return ("no_oldrev", None)
            clean = clean_wikitext(content)
            if len(clean) < a.min_chars:
                return ("short", None)
            return ("ok", {
                "title": t,
                "text": clean,
                "url": ("https://id.wikipedia.org/wiki/"
                        + urllib.parse.quote(t.replace(" ", "_"))),
                "rev_date": (rev.get("timestamp") or "")[:10],
                "license": LICENSE,
                "license_url": LICENSE_URL,
                "source": SOURCE,
                "method": METHOD,
                "api_asof": ASOF,
            })
        return ("empty_rev_response", None)

    try:
        while len(qualifying) < a.keep and rounds < a.max_rounds:
            rounds += 1
            data = api_get({
                "action": "query", "format": "json",
                "list": "random", "rnnamespace": "0",
                "rnlimit": str(a.batch), "rnfilterredir": "nonredirects",
            }, ua)
            batch = [x.get("title", "") for x in
                     data.get("query", {}).get("random", [])]
            fresh = []
            for t in batch:
                if not t or t in seen_titles:
                    if t:
                        dropped["dup_title"] += 1
                    continue
                seen_titles.add(t)
                if t.startswith(SKIP_TITLE_PREFIX):
                    dropped["list_title"] += 1
                    continue
                fresh.append(t)
            # ambil revisi per-akhir-2021: SATU judul per request, karena
            # rvstart/rvdir hanya sah untuk satu halaman (invalidparammix
            # bila multi-judul). Paralel kecil (workers) agar cepat namun
            # tetap sopan: tiap request tetap jeda + maxlag/Retry-After.
            rev_requests += len(fresh)
            with concurrent.futures.ThreadPoolExecutor(
                    max_workers=max(1, a.workers)) as ex:
                for status, rec in ex.map(fetch_one, fresh):
                    with lock:
                        if status == "ok":
                            qualifying.append(rec)
                        else:
                            dropped[status] += 1
                    if len(qualifying) >= a.keep:
                        break
            print("  ronde %d: judul-dilihat=%d layak=%d gugur=%s"
                  % (rounds, len(seen_titles), len(qualifying), dropped),
                  flush=True)
            time.sleep(a.delay)
    except Exception as e:
        print("GAGAL akuisisi wiki: %r (tanpa fallback diam-diam)" % e,
              file=sys.stderr)
        return 2

    print("judul=%d ronde=%d req-revisi=%d layak=%d gugur=%s"
          % (len(seen_titles), rounds, rev_requests,
             len(qualifying), dropped), flush=True)
    if len(qualifying) < a.keep:
        print("GAGAL: hanya %d artikel layak (< %d diminta)"
              % (len(qualifying), a.keep), file=sys.stderr)
        return 3
    rng.shuffle(qualifying)
    kept = qualifying[:a.keep]
    with open(a.out, "w", encoding="utf-8") as f:
        for it in kept:
            f.write(json.dumps(it, ensure_ascii=False) + "\n")
    stats = {"api": API, "asof": ASOF, "method": METHOD,
             "titles_seen": len(seen_titles), "rounds": rounds,
             "rev_requests": rev_requests, "qualifying": len(qualifying),
             "kept": len(kept), "dropped": dropped, "seed": a.seed,
             "min_chars": a.min_chars, "workers": a.workers,
             "delay": a.delay}
    with open(a.stats, "w", encoding="utf-8") as f:
        json.dump(stats, f, ensure_ascii=False, indent=2)
    print("tulis %s (%d baris) + %s" % (a.out, len(kept), a.stats),
          flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
