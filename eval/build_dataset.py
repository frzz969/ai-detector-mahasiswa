#!/usr/bin/env python3
"""Fase 2 — Gabung raw -> eval/dataset.jsonl (skema final + gate + split).

Masukan (HANYA dari eval/; direktori dataset/ lama DITOLAK anti-bocor):
  eval/raw_wiki.jsonl, eval/raw_openalex.jsonl, eval/raw_m4.jsonl,
  eval/raw_m4_peerread.jsonl (opsional --peerread)

STEP 2 (2026-10-05) — sel ACADEMIC ditambahkan:
  eval/raw_m4_peerread.jsonl: M4 PeerRead (peer review makalah, human +
  pasangan machine) per generator. menutup gap `machine x genre academic = 0`
  yang bikin metrik lama hanya mengukur genre, bukan author.
  PENTING: sel ini `lang=en`, sedangkan sel lama `lang=id`. Metrik TIDAK boleh
  dicampur tanpa pisah per bahasa (lihat run.js).

Skema JSONL per baris:
  {id,text,label,source,url,license,pub_date,genre,lang,ai_kind,generator,
   prompt_id,pair_id,words,sha256,split}
  (pair_id: penghubung pasangan M4, null di luar M4.)

Gate berurutan (counts dicatat per alasan gugur):
  1. license-gate: tolak license kosong/unknown/all-rights.
  2. date-gate: sel wiki/openalex (human) wajib pub_date < 2022-01-01;
     sel M4 human diterima dgn date_verified:false (pengecualian
     terdokumentasi: tanggal tak tercatat di rilis M4).
  3. length-gate: 50-3000 kata.
  4. kuota sel: wiki 200 human/encyclopedia; openalex 100 human/abstract;
     m4 100 human + 100 machine/news (gagal kuota -> exit non-nol).
  5. dedupe sha256 (teks ternormalisasi) + Jaccard>=0.8 (shingle 5 kata),
     pasangan se-pair_id dikecualikan dari near-dedupe (paralel disengaja).
  6. split 60/20/20 per (source, genre, label) dgn pasangan M4 se-split
     (group shuffle per pair_id, seed tetap).
Keluaran: eval/dataset.jsonl + eval/dataset_stats.json +
eval/test_hashes.txt (hash TEST dibekukan) + eval/audit_sample.jsonl (50+50).

Aturan: validation-rules §2/§4 (tanpa silent failure; quality gate eksplisit);
dataset-eval.md (split per topik/dokumen, dedupe, 50-3000 kata, audit 50+50,
TEST beku + hash, tune hanya DEV).
"""

import argparse
import hashlib
import json
import os
import random
import re
import sys

WS = re.compile(r"\s+")
BAD_LICENSE = ("", "unknown", "none", "all-rights", "all rights reserved",
               "copyright", "copyrighted", "proprietary", "unlicensed")


def norm_text(t):
    return WS.sub(" ", (t or "").lower()).strip()


def sha_text(t):
    return hashlib.sha256(norm_text(t).encode("utf-8")).hexdigest()


def words_of(t):
    return len((t or "").split())


def shingles(t, k=5):
    w = (t or "").split()
    if len(w) < k:
        return set()
    return {" ".join(w[i:i + k]) for i in range(len(w) - k + 1)}


def jaccard(a, b):
    if not a or not b:
        return 0.0
    inter = len(a & b)
    if not inter:
        return 0.0
    return inter / len(a | b)


def license_ok(lic):
    low = (lic or "").strip().lower()
    if not low or low in BAD_LICENSE:
        return False
    return True


def guard_no_legacy_dataset(*paths):
    for p in paths:
        ap = os.path.abspath(p)
        parts = ap.lower().split(os.sep)
        if "dataset" in parts and os.path.abspath("eval") not in ap:
            pass
        # tolak bila path menunjuk ke dalam direktori dataset/ lama repo
        legacy = os.path.abspath("dataset")
        if ap == legacy or ap.startswith(legacy + os.sep):
            print("DITOLAK anti-bocor: %s menunjuk dataset/ lama" % p,
                  file=sys.stderr)
            sys.exit(2)


def load_jsonl(path):
    rows = []
    with open(path, encoding="utf-8") as f:
        for ln, line in enumerate(f, 1):
            line = line.strip()
            if line:
                try:
                    rows.append(json.loads(line))
                except ValueError as e:
                    print("baris rusak %s:%d: %s" % (path, ln, e),
                          file=sys.stderr)
                    sys.exit(2)
    return rows


def main():
    ap = argparse.ArgumentParser(description="Gabung raw -> dataset.jsonl.")
    ap.add_argument("--wiki", default="eval/raw_wiki.jsonl")
    ap.add_argument("--openalex", default="eval/raw_openalex.jsonl")
    ap.add_argument("--m4", default="eval/raw_m4.jsonl")
    ap.add_argument("--peerread", default="eval/raw_m4_peerread.jsonl",
                    help="opsional: kosongkan ('') untuk rebuild dataset lama")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--q-wiki", type=int, default=200)
    ap.add_argument("--q-oa", type=int, default=100)
    ap.add_argument("--q-m4", type=int, default=100)
    ap.add_argument("--q-peerread", type=int, default=100)
    ap.add_argument("--out", default="eval/dataset.jsonl")
    ap.add_argument("--stats", default="eval/dataset_stats.json")
    ap.add_argument("--audit", default="eval/audit_sample.jsonl")
    ap.add_argument("--hashes", default="eval/test_hashes.txt")
    a = ap.parse_args()

    inputs = [a.wiki, a.openalex, a.m4]
    if a.peerread:
        inputs.append(a.peerread)
    for p in inputs:
        if not os.path.isfile(p):
            if p == a.peerread:
                print("CATATAN: %s tidak ada -> sel academic dilewati "
                      "(--peerread '' untuk tegas dilewati)" % p, flush=True)
                a.peerread = ""
                continue
            print("GAGAL: masukan hilang: %s" % p, file=sys.stderr)
            return 2
    guard_no_legacy_dataset(*inputs)

    rng = random.Random(a.seed)
    drop = {}
    def cut(reason):
        drop[reason] = drop.get(reason, 0) + 1

    cand = []  # (cell, final_row_dict)
    # --- wiki ---
    for r in load_jsonl(a.wiki):
        text = r.get("text") or ""
        if not license_ok(r.get("license")):
            cut("wiki:license"); continue
        rd = (r.get("rev_date") or "")[:10]
        if not rd or rd >= "2022-01-01":
            cut("wiki:date"); continue
        nw = words_of(text)
        if not (50 <= nw <= 3000):
            cut("wiki:length"); continue
        cand.append(("wiki", {"id": None, "text": text, "label": "human",
                              "source": "idwiki-20211201", "url": r.get("url"),
                              "license": r["license"], "pub_date": rd,
                              "genre": "encyclopedia", "lang": "id",
                              "ai_kind": None, "generator": None,
                              "prompt_id": None, "pair_id": None,
                              "words": nw, "sha256": sha_text(text),
                              "split": None,
                              "_title": r.get("title")}))
    # --- openalex ---
    for r in load_jsonl(a.openalex):
        text = r.get("abstract") or ""
        if not license_ok(r.get("license")):
            cut("oa:license"); continue
        pd = (r.get("pub_date") or "")[:10]
        if not pd or pd >= "2022-01-01":
            cut("oa:date"); continue
        nw = words_of(text)
        if not (50 <= nw <= 3000):
            cut("oa:length"); continue
        cand.append(("oa", {"id": None, "text": text, "label": "human",
                            "source": "openalex", "url": r.get("url"),
                            "license": r["license"], "pub_date": pd,
                            "genre": "abstract", "lang": "id",
                            "ai_kind": None, "generator": None,
                            "prompt_id": None, "pair_id": None,
                            "words": nw, "sha256": sha_text(text),
                            "split": None,
                            "_doi": r.get("doi"),
                            "_oaid": r.get("openalex_id")}))
    # --- m4 ---
    for r in load_jsonl(a.m4):
        text = r.get("text") or ""
        if not license_ok(r.get("license")):
            cut("m4:license"); continue
        nw = words_of(text)
        if not (50 <= nw <= 3000):
            cut("m4:length"); continue
        lab = r.get("label")
        if lab not in ("human", "machine"):
            cut("m4:label"); continue
        cand.append(("m4-" + lab, {"id": None, "text": text, "label": lab,
                                   "source": "m4-id-newspaper",
                                   "url": r.get("data_url"),
                                   "license": r["license"], "pub_date": None,
                                   "genre": "news", "lang": "id",
                                   "ai_kind": r.get("ai_kind"),
                                   "generator": r.get("generator"),
                                   "prompt_id": r.get("m4_source_id"),
                                   "pair_id": r.get("pair_id"),
                                   "words": nw, "sha256": sha_text(text),
                                   "split": None,
                                   "_date_verified": False}))

    # --- m4 peerread (academic, en) — opsional ---
    if a.peerread:
        for r in load_jsonl(a.peerread):
            text = r.get("text") or ""
            if not license_ok(r.get("license")):
                cut("pr:license"); continue
            nw = words_of(text)
            if not (50 <= nw <= 3000):
                cut("pr:length"); continue
            lab = r.get("label")
            if lab not in ("human", "machine"):
                cut("pr:label"); continue
            src = r.get("source")
            if not src or not src.startswith("m4-peerread-"):
                cut("pr:source"); continue
            cand.append(("pr-" + lab, {
                "id": None, "text": text, "label": lab, "source": src,
                "url": r.get("data_url"), "license": r["license"],
                "pub_date": None, "genre": "academic", "lang": "en",
                "ai_kind": r.get("ai_kind"), "generator": r.get("generator"),
                "prompt_id": r.get("m4_source_id"),
                "pair_id": r.get("pair_id"), "words": nw,
                "sha256": sha_text(text), "split": None,
                "_date_verified": False}))

    quotas = {"wiki": a.q_wiki, "oa": a.q_oa,
              "m4-human": a.q_m4, "m4-machine": a.q_m4}
    if a.peerread:
        quotas["pr-human"] = a.q_peerread
        quotas["pr-machine"] = a.q_peerread
    by_cell = {}
    for cell, row in cand:
        by_cell.setdefault(cell, []).append(row)
    for cell, q in quotas.items():
        have = len(by_cell.get(cell, []))
        print("sel %-10s kandidat=%d kuota=%d" % (cell, have, q), flush=True)
        if have < q:
            print("GAGAL kuota sel %s: %d < %d" % (cell, have, q),
                  file=sys.stderr)
            return 3

    # Sumber berpasangan (unit split = pasangan utuh, bukan baris):
    #   m4-id-newspaper   -> human+machine satu pair_id (sudah ada)
    #   m4-peerread-*     -> human+machine satu pair_id (STEP 2)
    PAIR_CELLS = ("m4-human", "m4-machine", "pr-human", "pr-machine")
    PAIR_QUOTA = {"m4-id-newspaper": a.q_m4}
    PAIR_SOURCES = ["m4-id-newspaper"]

    # kuota: shuffle deterministik per sel lalu ambil N.
    # Sel berpasangan diambil per pasangan utuh (human+machine satu pair_id)
    # supaya pasangan selalu se-split; pasangan tak lengkap (satu sisi gugur
    # di gate) tidak dipakai. (Aturan: dataset-eval.md pasangan M4 se-split.)
    kept = []
    for cell, q in quotas.items():
        if cell in PAIR_CELLS:
            continue
        rows = by_cell[cell][:]
        rng.shuffle(rows)
        kept.extend(rows[:q])

    if a.peerread:
        # Kuota per sumber peerread (chatgpt + llama dipisah supaya generator
        # diversity benar-benar tercatat, bukan tercampur jadi satu sel).
        pr_src = {}
        for cell in ("pr-human", "pr-machine"):
            for r in by_cell.get(cell, []):
                pr_src.setdefault(r["source"], []).append(r)
        for src in sorted(pr_src):
            PAIR_QUOTA[src] = a.q_peerread
            PAIR_SOURCES.append(src)

    for src in PAIR_SOURCES:
        rows = [r for r in kept if r["source"] == src]
        rows += [r for cell in PAIR_CELLS for r in by_cell.get(cell, [])
                 if r["source"] == src]
        pair_groups = {}
        for r in rows:
            if r.get("pair_id"):
                pair_groups.setdefault(r["pair_id"], []).append(r)
        complete = [g for g in pair_groups.values()
                    if {x["label"] for x in g} == {"human", "machine"}]
        rng.shuffle(complete)
        q = PAIR_QUOTA[src]
        print("sel %-20s pasangan-utuh=%d kuota=%d"
              % (src, len(complete), q), flush=True)
        if len(complete) < q:
            print("GAGAL kuota sel %s: %d < %d" % (src, len(complete), q),
                  file=sys.stderr)
            return 3
        for g in complete[:q]:
            kept.extend(g)
    # Buang sisa non-pasangan dari sel berpasangan (sudah diambil di atas).
    kept = [r for r in kept
            if not (r["source"] in PAIR_SOURCES and not r.get("pair_id"))]

    # dedupe exact sha256 (global)
    seen_sha, uniq = {}, []
    for r in kept:
        if r["sha256"] in seen_sha:
            cut("dedupe:sha256"); continue
        seen_sha[r["sha256"]] = True
        uniq.append(r)
    # near-dedupe Jaccard>=0.8, kecuali pasangan se-pair_id
    sh = [shingles(r["text"]) for r in uniq]
    gone = set()
    for i in range(len(uniq)):
        if i in gone:
            continue
        for j in range(i + 1, len(uniq)):
            if j in gone:
                continue
            pi, pj = uniq[i].get("pair_id"), uniq[j].get("pair_id")
            if pi and pi == pj:
                continue
            if jaccard(sh[i], sh[j]) >= 0.8:
                gone.add(j)
                cut("dedupe:jaccard>=0.8")
    final = [r for i, r in enumerate(uniq) if i not in gone]

    # pasca-dedupe: buang sisi M4 yang menjadi yatim (pasangannya gugur
    # dedupe) agar pasangan tetap utuh se-split.
    pair_count = {}
    for r in final:
        if r["source"] in PAIR_SOURCES:
            pair_count[(r["source"], r["pair_id"])] = pair_count.get(
                (r["source"], r["pair_id"]), 0) + 1
    if pair_count:
        kept_final = []
        for r in final:
            if (r["source"] in PAIR_SOURCES
                    and pair_count.get((r["source"], r["pair_id"]), 0) != 2):
                cut("dedupe:orphan-mate")
                continue
            kept_final.append(r)
        final = kept_final

    # cek kuota pasca-dedupe
    from collections import Counter
    cnt = Counter((r["source"], r["label"]) for r in final)
    need = {("idwiki-20211201", "human"): a.q_wiki,
            ("openalex", "human"): a.q_oa}
    for src, q in PAIR_QUOTA.items():
        need[(src, "human")] = q
        need[(src, "machine")] = q
    ok = True
    for k, q in need.items():
        if cnt.get(k, 0) < q:
            print("GAGAL pasca-dedupe %s: %d < %d" % (k, cnt.get(k, 0), q),
                  file=sys.stderr)
            ok = False
    if not ok:
        return 3

    # split 60/20/20 per stratum (source, genre, label); sel M4 dijadikan
    # satu stratum (m4-id-newspaper, news) dengan unit split = pasangan
    # utuh (pair_id) sehingga human+machine satu pasangan selalu se-split.
    groups = {}
    for r in final:
        if r["source"] in PAIR_SOURCES:
            skey = (r["source"], r["genre"])
            ukey = "pair:" + str(r["pair_id"])
        else:
            skey = (r["source"], r["label"])
            ukey = "row:" + r["sha256"]
        groups.setdefault((skey, ukey), []).append(r)
    strata = {}
    for (skey, _ukey), g in groups.items():
        strata.setdefault(skey, []).append(g)
    for skey, glist in strata.items():
        rng.shuffle(glist)
        n = len(glist)
        n_test = max(1, round(n * 0.2))
        n_dev = max(1, round(n * 0.2))
        if n_test + n_dev >= n:
            n_test, n_dev = n * 20 // 100, n * 20 // 100
        for g in glist[:n_test]:
            for r in g:
                r["split"] = "test"
        for g in glist[n_test:n_test + n_dev]:
            for r in g:
                r["split"] = "dev"
        for g in glist[n_test + n_dev:]:
            for r in g:
                r["split"] = "train"

    # id final + tulis
    prefix = {"idwiki-20211201": "wiki", "openalex": "oa",
              "m4-id-newspaper": "m4"}
    for i, src in enumerate(PAIR_SOURCES):
        prefix.setdefault(src, "m4pr%d" % i)
    seq = {}
    for r in sorted(final, key=lambda x: (x["source"], x["label"],
                                          x.get("pair_id") or x["sha256"])):
        p = prefix[r["source"]] + ("h" if r["label"] == "human" else
                                    "m" if r["source"].startswith("m4") else "")
        seq[p] = seq.get(p, 0) + 1
        r["id"] = "%s-%04d" % (p, seq[p])
        r.pop("_title", None); r.pop("_doi", None); r.pop("_oaid", None)
        r.pop("_date_verified", None)
    with open(a.out, "w", encoding="utf-8") as f:
        for r in final:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    # hash TEST dibekukan
    test_ids = sorted(r["id"] for r in final if r["split"] == "test")
    test_hash = hashlib.sha256("\n".join(test_ids).encode()).hexdigest()
    with open(a.hashes, "w", encoding="utf-8") as f:
        f.write("# sha256 dari daftar id split=test (diurut), satu per baris\n")
        for i in test_ids:
            f.write(i + "\n")
        f.write("# TEST-HASH: %s\n" % test_hash)

    # audit 50+50
    humans = [r for r in final if r["label"] == "human"]
    machines = [r for r in final if r["label"] == "machine"]
    rng.shuffle(humans); rng.shuffle(machines)
    audit = []
    for r in humans[:50] + machines[:50]:
        audit.append({
            "id": r["id"], "label": r["label"], "source": r["source"],
            "split": r["split"], "url": r["url"], "license": r["license"],
            "pub_date": r["pub_date"], "words": r["words"],
            "auto_checks": {
                "license_ok": license_ok(r["license"]),
                "date_ok": (r["pub_date"] or "") < "2022-01-01"
                           if r["pub_date"] else "unverified-m4",
                "len_ok": 50 <= r["words"] <= 3000,
            },
            "reviewer_verdict": "", "reviewer_note": ""})
    with open(a.audit, "w", encoding="utf-8") as f:
        for x in audit:
            f.write(json.dumps(x, ensure_ascii=False) + "\n")

    per_split = Counter((r["source"], r["label"], r["split"]) for r in final)
    stats = {"seed": a.seed, "quotas": quotas, "dropped": drop,
             "total": len(final),
             "per_cell_split": {"|".join(k): v for k, v in
                                sorted(per_split.items())},
"test_n": len(test_ids), "test_hash": test_hash,
              "audit_n": len(audit), "inputs": inputs,
              "paired_sources": PAIR_SOURCES,
              "langs": dict(Counter(r["lang"] for r in final)),
              "legacy_dataset_used": False}
    with open(a.stats, "w", encoding="utf-8") as f:
        json.dump(stats, f, ensure_ascii=False, indent=2)

    print("---- RINGKASAN SEL ----", flush=True)
    for k in sorted(need):
        for sp in ("train", "dev", "test"):
            print("  %-22s %-8s split=%-5s n=%d"
                  % (k[0], k[1], sp, per_split.get((k[0], k[1], sp), 0)),
                  flush=True)
    print("total=%d gugur=%s test_hash=%s" % (len(final), drop, test_hash),
          flush=True)
    print("tulis %s + %s + %s + %s" % (a.out, a.stats, a.audit, a.hashes),
          flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
