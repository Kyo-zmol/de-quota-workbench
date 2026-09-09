// ocr_prices.js v3 — 竖线检测定列 + TSV 行 + 小数点修复 + 税率校验
const path = require('path');
const fs = require('fs');
const NM = process.env.NM_DIR || 'C:\\Users\\Yzd18\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules';
const { createWorker } = require(path.join(NM, 'tesseract.js'));
const sharp = require(path.join(NM, 'sharp'));
const PP = 'F:\\我\\定额知识库工作台\\artifacts\\pp2';
const OUT = 'F:\\我\\定额知识库工作台\\data\\processed\\prices_wuhan_2026-08.json';
const W = 3000;
const norm = s => (s || '').normalize('NFKC').replace(/\s+/g, '').trim();

async function detectRules(buf) {
  const img = sharp(buf).raw();
  const { data, info } = await img.toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const y0 = Math.floor(height * 0.08), y1 = Math.floor(height * 0.95);
  const ch = info.channels || 1;
  const col = new Uint32Array(width);
  for (let y = y0; y < y1; y++) for (let x = 0; x < width; x++) if (data[y * width * ch + x * ch] < 128) col[x]++;
  const thr = (y1 - y0) * 0.35;
  const rules = [];
  for (let x = 0; x < width; x++) {
    if (col[x] > thr) { const last = rules[rules.length - 1]; if (last && x - last.end <= 3) last.end = x; else rules.push({ start: x, end: x }); }
  }
  return rules.map(r => (r.start + r.end) / 2);
}
function parseTsv(tsv) {
  const out = [];
  for (const ln of tsv.split('\n').slice(1)) {
    const p = ln.split('\t');
    if (p.length < 12 || +p[0] !== 5) continue;
    const text = (p[11] || '').trim();
    if (!text || text === '|') continue;
    out.push({ line: p[1] + '-' + p[2] + '-' + p[3] + '-' + p[4], conf: +p[6], x: +p[7], w: +p[9], y: +p[8], text });
  }
  return out;
}
function dotFix(s) {
  s = norm(s).replace(/[|，,]/g, '');
  if (/^-?\d+\.\d+$/.test(s)) return [parseFloat(s)];
  if (/^-?\d+$/.test(s)) { const c = []; for (let k = 1; k <= 3; k++) if (s.length > k) c.push(parseFloat(s.slice(0, -k) + '.' + s.slice(-k))); c.push(parseFloat(s)); return c; }
  return [null];
}
function pickPair(A, B) {
  let best = null;
  for (const x of A) for (const y of B) {
    if (x == null || y == null) continue;
    for (const k of [1.13, 1.09, 1.06, 1.03, 1.0]) {
      const d = Math.abs(x - y * k);
      if (d <= Math.max(0.02, y * 0.004) && (!best || d < best.d)) best = { tax: x, noTax: y, d };
    }
  }
  if (best) return best;
  const x = A[0], y = B[0];
  return (x != null && y != null) ? { tax: x, noTax: y, d: 999 } : null;
}
(async () => {
  const files = fs.readdirSync(PP).filter(f => /^p\d+\.png$/.test(f)).sort();
  const worker = await createWorker('chi_sim', 1, { logger: () => {}, langPath: 'F:/我/定额知识库工作台/artifacts/tessdata', gzip: false });
  const items = [], cats = [];
  let flagged = 0, skipped = 0;
  for (const f of files) {
    const page = parseInt(f.slice(1, 3));
    const buf = await sharp(path.join(PP, f)).grayscale().resize({ width: W, kernel: 'lanczos3' }).normalise().threshold(140).png().toBuffer();
    const rules = await detectRules(buf);
    if (rules.length < 8) { skipped++; console.log('page', page, 'rules', rules.length, 'SKIP'); continue; }
    const b = rules.slice(0, 8);
    const { data } = await worker.recognize(buf, {}, { tsv: true });
    const ws = parseTsv(data.tsv || '');
    const rowMap = new Map();
    for (const w of ws) { if (!rowMap.has(w.line)) rowMap.set(w.line, []); rowMap.get(w.line).push(w); }
    for (const [, rws] of [...rowMap.entries()].sort((a, b2) => Math.min(...a[1].map(x => x.y)) - Math.min(...b2[1].map(x => x.y)))) {
      const cells = [[], [], [], [], [], [], []];
      for (const w of rws) {
        const xc = w.x + w.w / 2;
        let ci = -1;
        for (let i = 0; i < 7; i++) if (xc > b[i] && xc < b[i + 1]) { ci = i; break; }
        if (ci >= 0) cells[ci].push(w);
      }
      const get = i => norm(cells[i].sort((x, y) => x.x - y.x).map(w => w.text).join(''));
      const no = get(0), name = get(1);
      if (!no && !name) continue;
      if (!/^\d{1,4}$/.test(no)) { if (name && /^[一二三四五六七八九十]+、/.test(name)) cats.push({ page, name }); continue; }
      const pr = pickPair(dotFix(get(4)), dotFix(get(5)));
      const ok = !!pr && pr.d < 1;
      if (!ok) flagged++;
      items.push({ page, no: +no, name, spec: get(2), unit: get(3), tax: pr ? pr.tax : null, noTax: pr ? pr.noTax : null, ok });
    }
    console.log('page', page, 'items', items.length);
  }
  await worker.terminate();
  fs.writeFileSync(OUT, JSON.stringify({ period: '2026-08', source: '武汉市建设工程综合价格信息（2026年8月）· OCR提取·税率比校验', cats, items }, null, 1));
  console.log('TOTAL', items.length, 'flagged', flagged, 'cats', cats.length, 'skippedPages', skipped);
})().catch(e => { console.error('ERR', e.message.slice(0, 300)); process.exit(1); });
