#!/usr/bin/env python3
"""STEP 2 — Akuisisi cell ACADEMIC (human + machine) dari M4 PeerRead.

Tujuan: menutup gap terbesar di eval/dataset.jsonl, yaitu
`machine x genre=abstract/encyclopedia = 0`. Saat ini 100 machine semuanya
genre `news` + generator `gpt-3.5-turbo`, sehingga metrik apa pun yang
dihitung adalah metrik genre, bukan metrik author.

Sumber: repo GitHub mbzuai-nlp/M4 (Wang et al. 2023), berkas
`data/peerread_<model>.jsonl` — peer review makalah akademik (human, dari
PeerRead/ACL) + pasangan hasil generasi LLM atas dokumen yang sama.
Format peer review: `{prompt, human_text, machine_text, model, source,
source_ID}`. Akses publik, gratis, tanpa key, tanpa form.

STEP 3 (generator diversity) ikut terpenuhi: M4 menyediakan 7 generator
(chatgpt, llama, davinci, cohere, dolly, bloomz, flan-t5). Default di sini
2 generator agar "AI" tidak disamakan dengan satu model saja.

BEDA PENTING vs id-newspaper: pada PeerRead, `human_text` dan `machine_text`
berupa LIST (bukan string). build_m4.py lama memakai `.strip()` langsung dan
AKAN crash di berkas ini. Fungsi `first_text()` di bawah menangani keduanya
dan memilih satu elemen secara deterministik supaya tiap pasangan tetap satu
dokumen dengan satu review (bukan mencampur review berbeda).

CATATAN LISENSI (jujur, untuk audit): lisensi dasar tetapargumen yang sama
dengan sel M4-ID — CC-BY-NC-SA via paper + syarat M4GT-Bench/SemEval-2024
Task 8; file LICENSE tidak ada di repo M4 (verifikasi 2026-10-05). Riset
non-komersial + sitasi wajib. Bila reviewer menolak dasar ini -> sel dibuang.

CATATAN METODOLOGI (WAJIB dibaca sebelum memakai metrik dari sel ini):
Review PeerRead manusia punya format sangat khas — bullet "- Strengths:",
"- Weaknesses:", "Minor points:", penomoran. Review machine lebih mengalir
(Title:/Summary:/Overall Comments:). Jadi sel ini mengukur perbedaan
FORMAT + authorship sekaligus, bukan authorship saja. FPR/TPR dari sel ini
TIDAK boleh dibaca sebagai "detektor academic" tanpa catatan ini.

Cara jalan:
  py eval/build_m4_peerread.py [--n-pairs 100] [--models chatgpt,llama]

Keluaran:
  eval/raw_m4_peerread.jsonl  (2 baris per pasangan, berbagi pair_id)
  eval/raw_m4_peerread_stats.json

Aturan: validation-rules §2 (gagal unduh/format tak dikenal -> exit non-nol,
tanpa karang data).
"""

import argparse
import hashlib
import json
import sys
import urllib.request

REPO = "https://raw.githubusercontent.com/mbzuai-nlp/M4/main/data/"
LICENSE_NOTE = ("CC-BY-NC-SA (via paper M4 Wang et al. 2023 arXiv:2305.14908 "
                "+ syarat M4GT-Bench/SemEval-2024 Task 8 arXiv:2404.14183; "
                "riset non-komersial + sitasi wajib; file LICENSE tidak ada di "
                "repo M4 - dasar lisensi via paper, bukan klaim repo)")
CITATION = ("Wang et al. 2023, M4: Multi-generator, Multi-domain, and "
            "Multi-lingual Black-Box Machine-Generated Text Detection "
            "(arXiv:2305.14908); M4GT-Bench / SemEval-2024 Task 8 "
            "(arXiv:2404.14183). PeerRead peer review dari ACL anthology.")


def first_text(v):
    """Ambil satu teks dari str atau list. Deterministik, tanpa acak."""
    if isinstance(v, str):
        return v.strip()
    if isinstance(v, list):
        for item in v:                      # ambil elemen pertama yang tidak kosong
            if isinstance(item, str) and item.strip():
                return item.strip()
    return ""


# ---- Gate identik dengan build_dataset.py ---------------------------------
MIN_WORDS, MAX_WORDS = 50, 3000          # length-gate
DEDUPE_JACCARD = 0.8                     # shingle-5, sama dgn build_dataset.py


def words_of(t):
    return len((t or "").split())


def sha_text(t):
    return hashlib.sha256((t or "").strip().encode("utf-8")).hexdigest()


def shingles(t, k=5):
    w = (t or "").split()
    return {tuple(w[i:i + k]) for i in range(max(0, len(w) - k + 1))}


def jaccard(a, b):
    return len(a & b) / max(1, len(a | b))


def fetch(url, contact, timeout=180):
    ua = "FarazEval/1.0 (%s) Fase3-academic-acquisition" % contact
    req = urllib.request.Request(url, headers={"User-Agent": ua})
    with urllib.request.urlopen(req, timeout=timeout) as h:
        return h.read().decode("utf-8")


def parse_pairs(raw):
    pairs, bad, cut = [], 0, {"length": 0}
    for line in raw.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            o = json.loads(line)
        except ValueError:
            bad += 1
            continue
        htxt = first_text(o.get("human_text"))
        mtxt = first_text(o.get("machine_text"))
        if not htxt or not mtxt:
            bad += 1
            continue
        # length-gate: kedua sisi harus di rentang yang sama supaya panjang
        # teks tidak jadi penanda label (human median 228 vs machine 300 kata).
        if not (MIN_WORDS <= words_of(htxt) <= MAX_WORDS):
            cut["length"] += 1
            continue
        if not (MIN_WORDS <= words_of(mtxt) <= MAX_WORDS):
            cut["length"] += 1
            continue
        pairs.append({
            "human_text": htxt,
            "machine_text": mtxt,
            "model": o.get("model") or "chatgpt",
            "source": o.get("source") or "PeerRead",
            "source_id": o.get("source_ID"),
        })
    return pairs, bad, cut


def dedupe_pairs(pairs, want, seen_sha, seen_sets):
    """Buang pasangan yang duplikat (sha256 atau Jaccard-5-shingle >= 0.8).

    WAJIB: dataset yang sudah ada 0 duplikat; sel baru yang berduplikat akan
    membuat metrics artifact (teks yang sama dihitung dua kali). Pasangan
    human+machine di-drop BERSAMAAN agar keseimbangan cell terjaga.

    `seen_sha`/`seen_sets` DIBAWA dari pemanggil (tidak di-reset per model):
    dokumen peer review yang sama muncul di peerread_chatgpt DAN peerread_llama
    dengan machine_text berbeda. Kalau human_text-nya dihitung dua kali, kelas
    human jadi dobel sementara machine tetap — metrics jadi artefak.
    """
    dropped = {"sha": 0, "jaccard": 0}
    kept = []
    for p in pairs:
        sh_h, sh_m = shingles(p["human_text"]), shingles(p["machine_text"])
        if (sha_text(p["human_text"]) in seen_sha
                or sha_text(p["machine_text"]) in seen_sha):
            dropped["sha"] += 1
            continue
        if any(jaccard(sh_h, s) >= DEDUPE_JACCARD or jaccard(sh_m, s) >= DEDUPE_JACCARD
               for s in seen_sets):
            dropped["jaccard"] += 1
            continue
        seen_sha.add(sha_text(p["human_text"]))
        seen_sha.add(sha_text(p["machine_text"]))
        seen_sets.extend([sh_h, sh_m])
        kept.append(p)
        if len(kept) >= want:
            break
    return kept, dropped


def even_stride(seq, need):
    if len(seq) < need:
        return None
    idxs = sorted({round(i * (len(seq) - 1) / max(need - 1, 1))
                   for i in range(need)})
    return idxs[:need]


def main():
    ap = argparse.ArgumentParser(description="Akuisisi cell academic M4 PeerRead.")
    ap.add_argument("--models", default="chatgpt,llama",
                    help="daftar generator M4 (pisahkan koma)")
    ap.add_argument("--n-pairs", type=int, default=100,
                    help="pasangan PER generator")
    ap.add_argument("--contact", default="faraz-eval-local")
    ap.add_argument("--out", default="eval/raw_m4_peerread.jsonl")
    ap.add_argument("--stats", default="eval/raw_m4_peerread_stats.json")
    a = ap.parse_args()

    models = [m.strip() for m in a.models.split(",") if m.strip()]
    if not models:
        print("GAGAL: --models kosong.", file=sys.stderr)
        return 2

    rows, stats_models = [], {}
    # Dibagi per model supaya machine side tetap punya 2 generator (chatgpt +
    # llama) sementara human side tetap unik.
    seen_sha, seen_sets = set(), []
    for mi, model in enumerate(models):
        fname = "peerread_%s.jsonl" % model
        url = REPO + fname
        print("unduh %s ..." % fname, flush=True)
        try:
            raw = fetch(url, a.contact)
        except Exception as e:
            print("GAGAL unduh %s: %r (tanpa bypass, tanpa fallback)" % (fname, e),
                  file=sys.stderr)
            return 2
        pairs, bad, cut = parse_pairs(raw)
        print("  pasangan valid=%d (baris rusak/gugur=%d, length-gate=%d)"
              % (len(pairs), bad, cut["length"]), flush=True)
        # Dedupe dulu, baru stride — stride pada data berduplikat mengambil
        # sampel yang tidak mewakili corpus.
        pairs, dropped = dedupe_pairs(pairs, a.n_pairs * 4, seen_sha, seen_sets)
        print("  setelah dedupe=%d (sha=%d, jaccard=%d)"
              % (len(pairs), dropped["sha"], dropped["jaccard"]), flush=True)
        idxs = even_stride(pairs, a.n_pairs)
        if idxs is None:
            print("GAGAL: %s pasangan %d < %d diminta" % (fname, len(pairs), a.n_pairs),
                  file=sys.stderr)
            return 3

        for k, i in enumerate(idxs):
            p = pairs[i]
            pid = "m4pr-%s-%04d" % (model, k)
            base = {
                "pair_id": pid,
                "license": LICENSE_NOTE,
                "license_verified": False,
                "pub_date": None,
                "date_verified": False,
                "date_note": ("PeerRead peer review (ACL/NeurIPS); M4 tidak "
                              "mencatat tanggal per review"),
                "source": "m4-peerread-%s" % model,
                "genre": "academic",
                "lang": "en",
                "citation": CITATION,
                "repo_url": "https://github.com/mbzuai-nlp/M4",
                "data_url": url,
                "m4_source_id": p["source_id"],
                "format_confound": True,
                "format_note": ("review human PeerRead berformat bullet "
                                "(- Strengths:/Minor points:) sementara "
                                "machine mengalir; sel ini mengukur format "
                                "+ authorship, bukan authorship saja"),
            }
            rows.append(dict(base, text=p["human_text"], label="human",
                             ai_kind=None, generator=None, prompt_id=None))
            rows.append(dict(base, text=p["machine_text"], label="machine",
                             ai_kind="prompted-generation", generator=model,
                             prompt_id=p["source_id"]))
        stats_models[model] = {"file": fname, "pairs_total": len(pairs),
                               "pairs_bad": bad, "pairs_kept": len(idxs),
                               "length_gate_cut": cut["length"],
                               "dedupe_dropped": dropped}

    with open(a.out, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    stats = {"models": stats_models, "rows": len(rows),
             "genre": "academic", "lang": "en",
             "n_pairs_per_model": a.n_pairs,
             "format_confound": True,
             "license": LICENSE_NOTE, "citation": CITATION}
    with open(a.stats, "w", encoding="utf-8") as f:
        json.dump(stats, f, ensure_ascii=False, indent=2)
    print("tulis %s (%d baris = %d human + %d machine, %d generator)"
          % (a.out, len(rows), len(rows) // 2, len(rows) // 2, len(models)),
          flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())