#!/usr/bin/env python3
"""Fase 2 — Akuisisi human-ID dari OpenAlex (abstrak open-access, pre-2022).

API resmi gratis tanpa key: https://api.openalex.org/works
Filter: from_publication_date:2000-01-01, to_publication_date:2021-12-31,
language:id, has_abstract:true, is_oa:true; per-page 200; cursor paging;
mailto sopan (wajib diisi); jeda antar-request.

Cara jalan:
  py eval/build_openalex.py --mailto "nama <email>" [--keep 100]

Keluaran: eval/raw_openalex.jsonl + eval/raw_openalex_stats.json
Satu baris = {doi, openalex_id, title, abstract, url, license, pub_date,
source:"openalex", genre:"abstract", lang:"id"}.
Abstrak direkonstruksi dari abstract_inverted_index. Lisensi dicatat apa
adanya dari best_oa_location/open_access/primary_location; gate lisensi
ketat ada di build_dataset.py (unknown/all-rights -> tolak).
Oversampling: ambil kandidat ~2.5x karena banyak abstrak <50 kata gugur
di gate panjang (50-3000 kata).

Aturan: validation-rules §2 (HTTP/gagal -> exit non-nol + pesan, tanpa
fallback); dataset-eval.md (manusia terbit <2022-01-01, lisensi tercatat,
ragu -> buang di build_dataset).
"""

import argparse
import json
import sys
import time
import urllib.parse
import urllib.request

API = "https://api.openalex.org/works"
FILTER = ("from_publication_date:2000-01-01,to_publication_date:2021-12-31,"
          "language:id,has_abstract:true,is_oa:true")
SELECT = ("id,doi,title,abstract_inverted_index,publication_date,language,"
          "open_access,best_oa_location,primary_location")


def reconstruct(inv):
    if not inv:
        return ""
    try:
        mx = max(p for lst in inv.values() for p in lst)
    except ValueError:
        return ""
    words = [""] * (mx + 1)
    for w, poss in inv.items():
        for p in poss:
            if 0 <= p <= mx and not words[p]:
                words[p] = w
    return " ".join(w for w in words if w)


def pick_license(w):
    boa = w.get("best_oa_location") or {}
    oa = w.get("open_access") or {}
    prim = w.get("primary_location") or {}
    for cand in (boa.get("license"), oa.get("license"), prim.get("license")):
        if cand:
            return str(cand).strip()
    return ""


def main():
    ap = argparse.ArgumentParser(description="Akuisisi abstrak ID-OA pre-2022.")
    ap.add_argument("--mailto", required=True,
                    help="Email sopan untuk OpenAlex polite pool (wajib).")
    ap.add_argument("--keep", type=int, default=100)
    ap.add_argument("--oversample", type=float, default=2.5)
    ap.add_argument("--per-page", type=int, default=200)
    ap.add_argument("--delay", type=float, default=0.6)
    ap.add_argument("--max-pages", type=int, default=12)
    ap.add_argument("--out", default="eval/raw_openalex.jsonl")
    ap.add_argument("--stats", default="eval/raw_openalex_stats.json")
    a = ap.parse_args()

    ua = "FarazEval/1.0 (mailto:%s) Fase2-acquisition" % a.mailto
    target_candidates = int(a.keep * a.oversample)
    rows, seen_doi = [], set()
    dropped = {"no_abstract": 0, "bad_license_empty": 0, "bad_date": 0,
               "dup_doi": 0}
    fetched = 0
    cursor = "*"
    pages = 0

    try:
        while len(rows) < target_candidates and pages < a.max_pages:
            params = urllib.parse.urlencode({
                "filter": FILTER, "per-page": a.per_page, "cursor": cursor,
                "mailto": a.mailto,
                "select": SELECT,
            })
            req = urllib.request.Request(API + "?" + params,
                                         headers={"User-Agent": ua})
            with urllib.request.urlopen(req, timeout=60) as h:
                data = json.load(h)
            results = data.get("results", [])
            if not results:
                break
            fetched += len(results)
            for w in results:
                ab = reconstruct(w.get("abstract_inverted_index"))
                if not ab.strip():
                    dropped["no_abstract"] += 1
                    continue
                doi = (w.get("doi") or "").strip()
                if doi and doi in seen_doi:
                    dropped["dup_doi"] += 1
                    continue
                lic = pick_license(w)
                if not lic:
                    dropped["bad_license_empty"] += 1
                    continue
                pub = (w.get("publication_date") or "").strip()
                if not pub or pub >= "2022-01-01":
                    dropped["bad_date"] += 1
                    continue
                if doi:
                    seen_doi.add(doi)
                oid = (w.get("id") or "").split("/")[-1]
                rows.append({
                    "doi": doi or None,
                    "openalex_id": oid or None,
                    "title": w.get("title"),
                    "abstract": ab,
                    "url": doi or ("https://openalex.org/" + oid if oid else None),
                    "license": lic,
                    "pub_date": pub,
                    "source": "openalex",
                    "genre": "abstract",
                    "lang": "id",
                })
                if len(rows) >= target_candidates:
                    break
            cursor = (data.get("meta") or {}).get("next_cursor")
            pages += 1
            print("  page %d: fetched=%d kept=%d" % (pages, fetched, len(rows)),
                  flush=True)
            if not cursor:
                break
            time.sleep(a.delay)
    except Exception as e:
        print("GAGAL akuisisi OpenAlex: %r (tanpa fallback diam-diam)" % e,
              file=sys.stderr)
        return 2

    print("kandidat=%d (target ~%d), gugur=%s" % (len(rows), target_candidates, dropped),
          flush=True)
    if len(rows) < a.keep:
        print("GAGAL: kandidat %d < %d diminta" % (len(rows), a.keep),
              file=sys.stderr)
        return 3
    with open(a.out, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    stats = {"filter": FILTER, "fetched": fetched, "candidates": len(rows),
             "dropped": dropped, "mailto": a.mailto}
    with open(a.stats, "w", encoding="utf-8") as f:
        json.dump(stats, f, ensure_ascii=False, indent=2)
    print("tulis %s (%d baris) + %s" % (a.out, len(rows), a.stats), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
