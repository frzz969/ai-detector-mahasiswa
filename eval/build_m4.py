#!/usr/bin/env python3
"""Fase 2 — Akuisisi pasangan human/machine Indonesia dari dataset M4 resmi.

Sumber resmi: repo GitHub mbzuai-nlp/M4 (Wang et al. 2023), berkas
``data/id-newspaper_chatGPT.jsonl`` — artikel berita Indonesia (human) +
pasangan hasil generasi ChatGPT dari prompt berbasis artikel tsb (machine).
Format per baris (lihat data/README.md): {prompt, human_text, machine_text,
model, source, source_ID}. Akses publik, gratis, tanpa key, tanpa form.

CATATAN LISENSI (jujur, untuk audit — koreksi Fase 3, Gate 2 ora-2):
korpus human = artikel koran Indonesia koleksi 2018 (id_newspapers_2018,
per Tabel 1 Wang et al. 2023); lisensi CC-BY-NC-SA via paper + syarat
M4GT-Bench/SemEval-2024 Task 8. File LICENSE tidak ada di repo M4
(verifikasi 2026-10-05), sehingga dasar lisensi adalah paper, bukan klaim
repo. Penggunaan: riset non-komersial + sitasi (lihat eval/README.md).
Bila reviewer menolak dasar ini -> sel M4 wajib dibuang/diganti.

Tanggal: koleksi human 2018 (pre-2022, pre-LLM — memenuhi semangat date-gate
manusia); pub_date per artikel dicatat null + date_verified:false karena
rilis M4 tak mencantumkan tanggal per artikel (pengecualian terdokumentasi
untuk sumber AI berlabel; date-gate <2022 tetap berlaku untuk sel
wiki/openalex di build_dataset.py).

Cara jalan:
  py eval/build_m4.py [--n-human 100 --n-machine 100]

Keluaran: eval/raw_m4.jsonl (2 baris per pasangan: human + machine,
berbagi pair_id) + eval/raw_m4_stats.json.
Cuplik: stride merata di seluruh berkas (deterministik), bukan 100 pertama.

Aturan: validation-rules §2 (gagal unduh/format tak dikenal -> exit non-nol,
tanpa karang data); dataset-eval.md (AI hanya dari dataset publik berlabel;
pasangan se-split di build_dataset).
"""

import argparse
import json
import sys
import urllib.request

DATA_URL = ("https://raw.githubusercontent.com/mbzuai-nlp/M4/main/"
            "data/id-newspaper_chatGPT.jsonl")
REPO_URL = "https://github.com/mbzuai-nlp/M4"
CITATION = ("Wang et al. 2023, M4: Multi-generator, Multi-domain, and "
            "Multi-lingual Black-Box Machine-Generated Text Detection "
            "(arXiv:2305.14908); data id-newspaper + M4GT-Bench (SemEval-2024 "
            "Task 8, arXiv:2404.14183).")
LICENSE_NOTE = ("CC-BY-NC-SA (korpus human id_newspapers_2018 per Tabel 1 "
                "Wang et al. 2023; syarat M4GT-Bench/SemEval-2024 Task 8; "
                "riset non-komersial + sitasi wajib; file LICENSE tidak ada "
                "di repo M4 — dasar lisensi via paper, bukan klaim repo)")


def main():
    ap = argparse.ArgumentParser(description="Akuisisi pasangan M4-ID resmi.")
    ap.add_argument("--data-url", default=DATA_URL)
    ap.add_argument("--n-human", type=int, default=100)
    ap.add_argument("--n-machine", type=int, default=100)
    ap.add_argument("--contact", default="faraz-eval-local")
    ap.add_argument("--out", default="eval/raw_m4.jsonl")
    ap.add_argument("--stats", default="eval/raw_m4_stats.json")
    a = ap.parse_args()

    if a.n_human != a.n_machine:
        print("GAGAL: sel M4 harus seimbang human=machine", file=sys.stderr)
        return 2

    ua = "FarazEval/1.0 (%s) Fase2-acquisition" % a.contact
    try:
        req = urllib.request.Request(a.data_url, headers={"User-Agent": ua})
        with urllib.request.urlopen(req, timeout=120) as h:
            raw = h.read().decode("utf-8")
    except Exception as e:
        print("GAGAL unduh data M4: %r (tanpa bypass, tanpa fallback)" % e,
              file=sys.stderr)
        return 2

    pairs = []
    bad = 0
    for ln, line in enumerate(raw.splitlines(), 1):
        line = line.strip()
        if not line:
            continue
        try:
            o = json.loads(line)
        except ValueError:
            bad += 1
            continue
        htxt = (o.get("human_text") or "").strip()
        mtxt = (o.get("machine_text") or "").strip()
        if not htxt or not mtxt:
            bad += 1
            continue
        pairs.append({
            "prompt": o.get("prompt") or "",
            "human_text": htxt,
            "machine_text": mtxt,
            "model": o.get("model") or "chatGPT",
            "source": o.get("source") or "id-newspaper",
            "source_id": o.get("source_ID"),
        })
    print("pasangan valid=%d (baris rusak/gugur=%d)" % (len(pairs), bad), flush=True)

    need = a.n_human
    if len(pairs) < need:
        print("GAGAL: pasangan %d < %d diminta" % (len(pairs), need),
              file=sys.stderr)
        return 3
    # stride merata deterministik
    idxs = sorted({round(i * (len(pairs) - 1) / max(need - 1, 1))
                   for i in range(need)})[:need]
    assert len(idxs) == need, "stride gagal menghasilkan %d indeks" % need

    rows = []
    for k, i in enumerate(idxs):
        p = pairs[i]
        pid = "m4pair-%04d" % k
        base = {"pair_id": pid, "license": LICENSE_NOTE,
                "license_verified": False, "pub_date": None,
                "date_verified": False,                 "date_note": "korpus human id_newspapers_2018 (koleksi 2018, pre-2022/pre-LLM, Tabel 1 Wang et al. 2023); tanggal per artikel tak tercatat di rilis M4",
                "source": "m4-id-newspaper", "genre": "news", "lang": "id",
                "citation": CITATION, "repo_url": REPO_URL,
                "data_url": a.data_url, "m4_source_id": p["source_id"]}
        rows.append(dict(base, text=p["human_text"], label="human",
                         ai_kind=None, generator=None, prompt_id=None,
                         prompt=p["prompt"]))
        rows.append(dict(base, text=p["machine_text"], label="machine",
                         ai_kind="prompted-generation", generator=p["model"],
                         prompt_id=p["source_id"], prompt=p["prompt"]))
    with open(a.out, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    stats = {"data_url": a.data_url, "pairs_total": len(pairs),
             "pairs_bad": bad, "pairs_kept": need,
             "rows": len(rows), "stride": "even",
             "license": LICENSE_NOTE, "citation": CITATION}
    with open(a.stats, "w", encoding="utf-8") as f:
        json.dump(stats, f, ensure_ascii=False, indent=2)
    print("tulis %s (%d baris = %d human + %d machine) + %s"
          % (a.out, len(rows), need, need, a.stats), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
