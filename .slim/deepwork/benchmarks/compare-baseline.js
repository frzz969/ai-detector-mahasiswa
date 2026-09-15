// compare-baseline.js — diff bench JSON after-vs-baseline (deepwork, git-ignored)
// Usage: node .slim/deepwork/compare-baseline.js bench-detect-all.json bench-detect-baseline.json [--strict]
// Exit 0 = identical on score/sentScores/cls/words/sentCount/reasons/detail; 1 = mismatch.
"use strict";
const fs = require("fs");
const path = require("path");

const DIR = __dirname;
const aPath = path.join(DIR, process.argv[2]);
const bPath = path.join(DIR, process.argv[3]);
const strict = process.argv.includes("--strict");

const a = JSON.parse(fs.readFileSync(aPath, "utf8"));
const b = JSON.parse(fs.readFileSync(bPath, "utf8"));

if (a.length !== b.length) { console.log(`LEN MISMATCH ${a.length} vs ${b.length}`); process.exit(1); }

const KEYS = ["score", "sentScores", "cls", "words", "sentCount", "reasons", "detail"];
let bad = 0;
a.forEach((ra, i) => {
  const rb = b[i];
  for (const k of KEYS) {
    const va = JSON.stringify(ra[k]);
    const vb = JSON.stringify(rb[k]);
    if (va !== vb) {
      bad++;
      console.log(`DIFF row#${i} ${ra.id} field=${k}\n  after:   ${va.slice(0, 400)}\n  baseline: ${vb.slice(0, 400)}`);
    }
  }
});
if (bad === 0) {
  console.log(`OK: ${a.length} rows identical on ${KEYS.join(",")}${strict ? " (strict)" : ""}`);
  process.exit(0);
} else {
  console.log(`FAIL: ${bad} field diffs`);
  process.exit(1);
}