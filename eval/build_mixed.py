#!/usr/bin/env python3
"""STEP 4 — Cell MIXED: teks sebagian manusia, sebagian machine.

Kasus nyata yang paling sering occur: pengguna TIDAK memakai AI mentah. Mereka
menyalin sebagianAI lalu menulis/menyesuaikan sisanya. Sel binary
(human/machine) tidak mengukur ini sama sekali — makanya sel ini terpisah.

KONSTRUKSI (harus dibaca sebelum memakai angka dari sel ini):
  Konten human dan machine diambil dari PASANGAN M4 PeerRead yang sama
  (dokumen peer review yang sama), lalu kalimatnya diselang-seling. Ground
  truth `ai_fraction` = porsi kalimat machine, jadi labelnya BUKAN hasil
  tebakan — itu komposisi yang benar-benar ada di teks.

  KONFOUND WAJIB (sama seperti format_confound di PeerRead):
  sentence-level interleaving menghasilkan batas kalimat yang artificial.
  Teks asli tidak punya "gaya campuran" seperti itu. Jadi sel ini mengukur
  "apakah skor detector merespons porsi AI" — BUKAN "apakah detector
  mengenali tulisan campuran seperti manusia CAMPUR". Angka dari sel ini
  tidak boleh dipakai sebagai klaim akurasi deteksi teks campuran.

  Yang absen dan tidak dikonstruksi di sini (sengaja, butuh editor manusia
  sungguhan): `human_edited_ai` dan `ai_edited_human` — revisi bebas atas
  teks utuh. Tidak ada sumber berlisensi untuk itu, dan mengedit sendiri
  akan membuat label berasal dari satu tangan yang sama dengan sistem yang
  sedang diuji.

Cara jalan:
  py eval/build_mixed.py [--n 120] [--fractions 0.3,0.5,0.7]
"""

import argparse
import json
import os
import re
import sys

SENT_SPLIT = re.compile(r"(?<=[.!?])\s+")
MIN_WORDS, MAX_WORDS = 50, 3000


def sentences(text):
    parts = [p.strip() for p in SENT_SPLIT.split((text or "").strip()) if p.strip()]
    return parts


def plan_counts(n_h_avail, n_m_avail, frac):
    """Pilih (n_h, n_m) sehingga rasio machine mendekati `frac` SECARA NYATA.

    Bug lama: interleave memakai SEMUA kalimat dari kedua sisi, sehingga
    ai_fraction yang diminta diabaikan dan rasio sebenarnya ditentukan jumlah
    kalimat yang tersedia (ai_fraction=0.3 bisa berakhir jadi 0.6). Label
    ground truth jadi bohong. Di sini rasio benar-benar dihitung dan
    diverifikasi sebelum teks ditulis.

    Strategi: T dari total-available turun, n_m = round(frac*T),
    n_h = T - n_m; terima T pertama yang muat di kedua sisi (n_m<=avail_m,
    n_h<=avail_h). Minimal 2 kalimat per sisi supaya ada dua gaya.
    """
    total = n_h_avail + n_m_avail
    for T in range(total, 3, -1):
        n_m = int(round(frac * T))
        n_h = T - n_m
        if n_m <= n_m_avail and n_h <= n_h_avail and n_m >= 2 and n_h >= 2:
            return n_h, n_m
    return None


def interleave(hs, ms, frac):
    """Selang-seling kalimat dengan porsi machine SEBENARNYA ~ frac.

    Deterministik (tanpa RNG): untuk tiap posisi, ambil machine bila porsi
    kumulatif machine belum tercapai. Panjang kedua sisi sudah dipatok oleh
    plan_counts() supaya rasio tidak melenceng.
    """
    planned = plan_counts(len(hs), len(ms), frac)
    if planned is None:
        return None
    n_h, n_m = planned
    h_sub, m_sub = hs[:n_h], ms[:n_m]
    total = n_h + n_m
    out, hi, mi, acc = [], 0, 0, 0.0
    for _ in range(total):
        take_m = mi < n_m and (acc + 0.5 / total <= n_m / total or hi >= n_h)
        if take_m:
            out.append(m_sub[mi]); mi += 1; acc += 1.0 / total
        elif hi < n_h:
            out.append(h_sub[hi]); hi += 1
        else:
            out.append(m_sub[mi]); mi += 1
    if hi != n_h or mi != n_m:
        return None
    return " ".join(out), n_m / float(total)


def main():
    ap = argparse.ArgumentParser(description="Konstruksi cell mixed dari pasangan M4.")
    ap.add_argument("--pairs", default="eval/raw_m4_peerread.jsonl",
                    help="pasangan human+machine dari M4 (hasil build_m4_peerread.py)")
    ap.add_argument("--n", type=int, default=120, help="jumlah teks per pecahan")
    ap.add_argument("--fractions", default="0.3,0.5,0.7")
    ap.add_argument("--out", default="eval/raw_mixed.jsonl")
    a = ap.parse_args()

    if not os.path.isfile(a.pairs):
        print("GAGAL: masukan hilang: %s" % a.pairs, file=sys.stderr)
        return 2
    fracs = [float(x) for x in a.fractions.split(",") if x.strip()]
    if not fracs:
        print("GAGAL: --fractions kosong.", file=sys.stderr)
        return 2

    groups = {}
    with open(a.pairs, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            r = json.loads(line)
            pid = r.get("pair_id")
            if not pid:
                continue
            groups.setdefault(pid, {})[r["label"]] = r

    complete = [(pid, g) for pid, g in sorted(groups.items())
                if set(g) == {"human", "machine"}]
    if not complete:
        print("GAGAL: tidak ada pasangan human+machine lengkap di %s" % a.pairs,
              file=sys.stderr)
        return 3

    rows, stats, rejected = [], {}, 0
    for frac in fracs:
        tag = ("ai%02d" % round(frac * 100))
        made = 0
        drift = []
        for pid, g in complete:
            if made >= a.n:
                break
            hs, ms = sentences(g["human"]["text"]), sentences(g["machine"]["text"])
            if len(hs) < 4 or len(ms) < 4:
                rejected += 1
                continue
            built = interleave(hs, ms, frac)
            if not built:
                rejected += 1
                continue
            txt, real_frac = built
            nw = len(txt.split())
            if not (MIN_WORDS <= nw <= MAX_WORDS):
                rejected += 1
                continue
            base = dict(g["human"])
            rows.append({
                "id": None, "text": txt, "label": "mixed",
                "ai_fraction": frac, "ai_fraction_actual": round(real_frac, 3), "source": "m4-peerread-mixed-" + tag,
                "url": g["human"].get("data_url"),
                "license": g["human"].get("license"),
                "license_verified": False,
                "pub_date": None, "date_verified": False,
                "genre": "academic", "lang": "en",
                "ai_kind": "sentence-interleave",
                "generator": None,
                "prompt_id": g["human"].get("m4_source_id"),
                "pair_id": "mixed-" + pid,
                "words": nw,
                "construction": "sentence-interleave",
                "confound": ("batas kalimat artificial; sel ini mengukur "
                             "respons skor terhadap porsi AI, BUKAN akurasi "
                             "deteksi tulisan campuran manusia"),
            })
            made += 1
            drift.append(abs(real_frac - frac))
        stats[tag] = {"ai_fraction": frac, "rows": made,
                      "actual_min": round(min([r["ai_fraction_actual"] for r in rows
                                               if r["ai_fraction"] == frac]), 3) if made else None,
                      "actual_max": round(max([r["ai_fraction_actual"] for r in rows
                                               if r["ai_fraction"] == frac]), 3) if made else None,
                      "max_abs_drift": round(max(drift), 3) if drift else None}
        print("pecahan %s: rows=%d  rasio nyata %.2f-%.2f (diminta %.2f)"
              % (tag, made,
                 stats[tag]["actual_min"] if made else 0,
                 stats[tag]["actual_max"] if made else 0, frac), flush=True)

    for i, r in enumerate(sorted(rows, key=lambda x: (x["ai_fraction"], x["pair_id"]))):
        r["id"] = "mix-%03d" % i
    with open(a.out, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    with open(a.out.replace(".jsonl", "_stats.json"), "w", encoding="utf-8") as f:
        json.dump({"rows": len(rows), "pairs_available": len(complete),
                   "rejected": rejected, "per_bucket": stats,
                   "construction": "sentence-interleave",
                   "confound": "artificial sentence boundaries; not a claim of "
                               "detector accuracy on human-AI mixed prose",
                   "absent": ["human_edited_ai", "ai_edited_human"]},
                  f, ensure_ascii=False, indent=2)
    print("tulis %s (%d baris, %d pasangan tersedia, %d gugur)"
          % (a.out, len(rows), len(complete), rejected), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())