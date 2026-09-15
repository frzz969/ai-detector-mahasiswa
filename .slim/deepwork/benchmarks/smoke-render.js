// smoke-render.js — one-off: load core→referensi→detector→humanizer→main
// with DOM stubs and call render() + runDemo() to catch Phase-3 wiring
// errors (heu.lang / heu.confidence / detail.sentMedian / sentSpread).
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../../..");
function makeEl() {
  return {
    value: "", textContent: "", innerHTML: "", hidden: false, disabled: false,
    files: [], onclick: null, title: "", className: "", style: {},
    classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
    addEventListener() {}, removeEventListener() {},
    scrollIntoView() {}, focus() {}, setAttribute() {}, getAttribute: () => null,
    appendChild() {}, querySelectorAll: () => [],
  };
}
const documentStub = {
  getElementById: () => makeEl(),
  querySelectorAll: () => [],
  createElement: () => makeEl(),
};
const windowStub = {};
const navigatorStub = {};

const files = ["js/core.js", "js/referensi.js", "js/detector.js", "js/humanizer.js", "js/main.js"];
const code = files
  .map((f) => fs.readFileSync(path.join(ROOT, f), "utf8"))
  .join("\n;\n");
const factory = new Function(
  "document", "window", "navigator", "console",
  code + "\n;return {heuristic, render, runDemo, humanizeText, countWords, localParts};"
);
const api = factory(documentStub, windowStub, navigatorStub, console);

const DEMO_AI = "Perkembangan teknologi informasi memiliki peran yang penting dalam meningkatkan efektivitas proses pembelajaran di perguruan tinggi. Pemanfaatan teknologi dapat memberikan berbagai kemudahan dalam memperoleh informasi dan mendukung kegiatan akademik mahasiswa. Selain itu, penggunaan teknologi informasi juga dapat meningkatkan kualitas proses pembelajaran. Oleh karena itu, perguruan tinggi perlu memanfaatkan teknologi informasi secara optimal untuk mendukung kegiatan akademik. Dengan demikian, penerapan teknologi informasi di lingkungan perguruan tinggi diharapkan dapat memberikan manfaat yang positif bagi mahasiswa dan institusi.";

// 1) render() with heuristic-only path (localVal null)
const heu = api.heuristic(DEMO_AI);
api.render(heu, null, 0);
console.log("render(heuristik): OK → score", heu.score, "| confidence", heu.confidence, "| lang", heu.lang, "| median", heu.detail.sentMedian, "| spread", heu.detail.sentSpread.toFixed(1));

// 2) render() with local model path (simulated) + partial coverage
api.localParts = { n: 2, of: 6 };
api.render(heu, 70, 12);
console.log("render(ensemble parsial): OK → no crash; localParts n/of", api.localParts.n + "/" + api.localParts.of);

// 3) runDemo paths
api.runDemo("ai");
api.runDemo("human");
console.log("runDemo(ai/human): OK");
console.log("SMOKE-RENDER PASS");