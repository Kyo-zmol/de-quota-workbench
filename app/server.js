// server.js v2 — 定额知识库工作台（查定额/组价/换算/规则/笔记）
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const PROC = process.env.WB_PROC || path.join(ROOT, 'data', 'processed');
const PROJ = process.env.WB_PROJ || path.join(ROOT, 'data', 'projects');
const NOTES = 'F:\\我\\定额知识库工作台\\notes';
const PUB = path.join(__dirname, 'public');
const PORT = process.env.PORT || 8730;

let BOOKS = [], RULES = [], FEES = null, PRICES = null, HABITS = null, PRESETS = null, FIXES = {};
function loadBooks() {
  BOOKS = [];
  for (const f of fs.readdirSync(PROC).filter(f => f.startsWith('hb2024_') && f.endsWith('.json'))) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(PROC, f), 'utf8'));
      const bookName = (j.book || f).replace(/\.pdf$/i, '').replace(/hb2024_/, '');
      for (const it of j.items) { const fx = FIXES[it.code]; if (fx && fx.fees) { it.fees = Object.assign({}, it.fees, fx.fees); it.fixed = fx.kind; it.fixNote = fx.note; } const fe = it.fees || {}; const parts = [+fe.labor || 0, +fe.material || 0, +fe.machine || 0, +fe.fee || 0, +fe.vat || 0]; const hasParts = parts.some(v => v > 0); if (fe.total == null && hasParts) fe.total = +parts.reduce((a2, b2) => a2 + b2, 0).toFixed(2); if (!hasParts && fe.total != null) it.incomplete = true; const sum = parts.reduce((a2, b2) => a2 + b2, 0); const pre = sum - (+fe.vat || 0); const rr = pre > 0 ? (+fe.vat || 0) / pre : 0; it.qaFail = (Math.abs(sum - (+fe.total || 0)) > 0.06) || (pre > 0 && ![0.09, 0.03, 0.06, 0.13, 0].some(x => Math.abs(rr - x) < 0.004)); BOOKS.push({ ...it, book: bookName, file: f }); }
    } catch (e) { console.error('load fail', f, e.message); }
  }
  try { RULES = JSON.parse(fs.readFileSync(path.join(PROC, 'rules_all.json'), 'utf8')).rules || []; } catch { RULES = []; }
  try { FEES = JSON.parse(fs.readFileSync(path.join(PROC, 'fees_hubei2024.json'), 'utf8')); } catch { FEES = null; }
  try { PRICES = JSON.parse(fs.readFileSync(path.join(PROC, 'prices_manual.json'), 'utf8')); } catch { PRICES = { period: '2026-08', items: [] }; }
  try { HABITS = JSON.parse(fs.readFileSync(path.join(PROC, 'rules_habits.json'), 'utf8')); } catch { HABITS = { rules: [] }; }
  try { FIXES = (JSON.parse(fs.readFileSync(path.join(PROC, 'manual_fixes.json'), 'utf8')).fixes) || {}; } catch { FIXES = {}; }
  try { PRESETS = JSON.parse(fs.readFileSync(path.join(PROC, 'convert_presets.json'), 'utf8')); } catch { PRESETS = []; }
  console.log('loaded items:', BOOKS.length, 'rules:', RULES.length, 'prices:', PRICES ? PRICES.items.length : 0, 'habits:', HABITS ? HABITS.rules.length : 0);
}
loadBooks();
fs.mkdirSync(PROJ, { recursive: true });

const idx = s => (s || '').toLowerCase();
const norm = s => (s || '').normalize('NFKC').replace(/\s+/g, '').trim();
const UNIT_MULT = { '千块': 1000, '千片': 1000, '千根': 1000, '千套': 1000, '千克': 1, 'kg': 1, 't': 1, '吨': 1, 'm': 1, '米': 1, 'm2': 1, 'm3': 1, '平方米': 1, '立方米': 1, '㎡': 1, 'm³': 1, '块': 1, '片': 1, '个': 1, '套': 1, '株': 1, '台': 1, '组': 1, '根': 1, '樘': 1, '扇': 1, 'km': 1, '千米': 1, '百块': 100 };
const UNIT_BASEN = u => { const s = String(u || '').trim(); const m = /^(\d+(\.\d+)?)\s*(.*)$/.exec(s); if (m) return { mult: parseFloat(m[1]) * (UNIT_MULT[m[3]] != null ? UNIT_MULT[m[3]] : 1), base: m[3] || s }; const pre = Object.keys(UNIT_MULT).sort((x, y) => y.length - x.length).find(k => s.startsWith(k) && isNaN(+s[0])); if (pre) return { mult: UNIT_MULT[pre], base: pre }; return { mult: 1, base: s }; };
const unitBase = u => UNIT_BASEN(u).mult;
const boqFactor = (unitQ, unitB, qty) => { const a = UNIT_BASEN(unitQ), b = UNIT_BASEN(unitB); if (a.base && b.base && a.base !== b.base && UNIT_MULT[a.base] == null && UNIT_MULT[b.base] == null && a.base !== b.base) return { factor: (qty * b.mult) / a.mult, warn: a.base + '≠' + b.base }; return { factor: (qty * b.mult) / a.mult, warn: null }; };
function search(q, book, limit = 80) {
  q = (q || '').trim();
  const toks = q.split(/\s+/).filter(Boolean).map(idx);
  const out = [];
  for (const it of BOOKS) {
    if (book && it.book !== book) continue;
    let score = 0;
    const code = idx(it.code), name = idx(it.name), spec = idx(it.spec), sec = idx(it.section || ''), ch = idx(it.chapter || ''), grp = idx(it.group || '');
    const consNames = idx((it.cons || []).map(c => c.name).join(' '));
    const work = idx(it.work);
    for (const t of toks) {
      let s = 0;
      const bk = it.book || '';
      const rank = /结构·屋面/.test(bk) ? 0 : /装饰·措施/.test(bk) ? 1 : /公共专业/.test(bk) ? 2 : /园林/.test(bk) ? 3 : /海绵/.test(bk) ? 4 : /装配式建筑/.test(bk) ? 5 : /装配式内装修/.test(bk) ? 6 : /市政/.test(bk) ? 7 : 8;
      if (code === t) s += 200; else if (code.startsWith(t)) s += 120; else if (code.includes(t)) s += 80;
      s -= rank * 4;
      if (name.includes(t)) s += 60;
      if (spec.includes(t)) s += 25;
      if (sec.includes(t) || grp.includes(t)) s += 15;
      if (ch.includes(t)) s += 8;
      if (consNames.includes(t)) s += 12;
      if (work.includes(t)) s += 6;
      if (s === 0) s = -1;
      score += s;
    }
    if (toks.length === 0) score = 1;
    if (score > 0) out.push({ it, score });
  }
  out.sort((a, b) => b.score - a.score || a.it.code.localeCompare(b.it.code));
  return out.slice(0, limit).map(o => ({ code: o.it.code, name: o.it.name, spec: o.it.spec, unit: o.it.unit, total: o.it.fees ? o.it.fees.total : null, noTax: o.it.fees ? +((o.it.fees.total || 0) - (o.it.fees.vat || 0)).toFixed(2) : null, chapter: o.it.chapter, section: o.it.section, book: o.it.book, score: o.score, qaFail: !!o.it.qaFail, fixed: o.it.fixed || null }));
}
function searchRules(q, limit = 60) {
  q = (q || '').trim();
  if (!q) return RULES.slice(0, limit);
  const toks = q.split(/\s+/).filter(Boolean).map(idx);
  const out = [];
  for (const r of RULES) {
    const hay = idx(r.text + ' ' + (r.chapter || '') + ' ' + (r.section || '') + ' ' + r.book);
    let s = 0;
    for (const t of toks) { if (hay.includes(t)) s += t.length; else { s = -1; break; } }
    if (/系数|换算|乘以|调整/.test(q) && /系数|换算|乘以|调整/.test(r.text)) s += 5;
    if (s > 0) out.push({ r, s });
  }
  out.sort((a, b) => b.s - a.s);
  return out.slice(0, limit).map(o => o.r);
}
function convert(item, adj) {
  const f = item.fees || {};
  if ((+f.labor || 0) + (+f.material || 0) + (+f.machine || 0) === 0 && (+f.total || 0) > 0) {
    const t = +f.total;
    return { orig: { labor: 0, material: 0, machine: 0, fee: 0, vat: 0, total: t, noTax: t }, adj: { labor: 0, material: 0, machine: 0, fee: 0, vat: 0, total: t, noTax: t }, delta: 0, feeRate: 0, implicitFeeRate: 0, officialRate: null, vatRate: 0, subDiffs: [], matDiff: 0, unitBase: unitBase(item.unit), unitInfo: UNIT_BASEN(item.unit), incomplete: true };
  }
  const labor = +f.labor || 0, material = +f.material || 0, machine = +f.machine || 0, fee = +f.fee || 0, vat = +f.vat || 0;
  const implicitFeeRate = (labor + machine) > 0 ? fee / (labor + machine) : 0;
  const vatRate = (labor + material + machine + fee) > 0 ? vat / (labor + material + machine + fee) : 0;
  let offRate = null;
  if (FEES && adj.spec != null && FEES.specialties[adj.spec]) {
    const g = FEES[adj.tax === 'simple' ? 'simple' : 'general'] || FEES.general;
    offRate = ((g.mgmt[adj.spec] || 0) + (g.profit[adj.spec] || 0) + (g.safeCivil.total[adj.spec] || 0) + (g.otherMeasures.total[adj.spec] || 0)) / 100;
  }
  const useRate = offRate != null ? offRate : implicitFeeRate;
  const lK = adj.laborK != null ? +adj.laborK : 1, mK = adj.matK != null ? +adj.matK : 1, cK = adj.macK != null ? +adj.macK : 1;
  const subDiffs = [];
  let matDiff = 0;
  for (const s of (adj.subs || [])) {
    const c = (item.cons || []).find(x => x.name === s.name);
    if (!c || c.price == null || s.newPrice == null) continue;
    const d = (+s.newPrice - c.price) * (c.qty || 0);
    matDiff += d;
    subDiffs.push({ name: s.name, oldPrice: c.price, newPrice: +s.newPrice, qty: c.qty, diff: +d.toFixed(2) });
  }
  const nL = +(labor * lK).toFixed(2), nM0 = +(material * mK).toFixed(2), nC = +(machine * cK).toFixed(2);
  const nF = +(useRate * (nL + nC)).toFixed(2);
  const nV = +(vatRate * (nL + nM0 + nC + nF)).toFixed(2);
  const nT = +(nL + nM0 + nC + nF + nV).toFixed(2);
  return {
    orig: { labor, material, machine, fee, vat, total: +((f.total != null ? f.total : labor + material + machine + fee + vat)).toFixed(2), noTax: +(labor + material + machine + fee).toFixed(2) },
    adj: { labor: nL, material: nM0, machine: nC, fee: nF, vat: nV, total: nT, noTax: +(nL + nM0 + nC + nF).toFixed(2) },
    delta: +(nT - (f.total != null ? f.total : labor + material + machine + fee + vat)).toFixed(2),
    feeRate: +useRate.toFixed(4), implicitFeeRate: +implicitFeeRate.toFixed(4), officialRate: offRate, vatRate: +vatRate.toFixed(4),
    subDiffs, matDiff: +matDiff.toFixed(2), unitBase: unitBase(item.unit), unitInfo: UNIT_BASEN(item.unit)
  };
}
const UNITS = { m2: ['平方米', 'm2', '㎡'], m3: ['立方米', 'm3', 'm³'], t: ['吨', 't'], kg: ['千克', 'kg', '公斤'], m: ['米', 'm'], km: ['千米', 'km'], 块: ['块'], 张: ['张'], 套: ['套'], 株: ['株'], 千块: ['千块'], 根: ['根'], 个: ['个'] };
const unitKey = u => { for (const k in UNITS) if (UNITS[k].includes(String(u || '').trim())) return k; return String(u || '').trim(); };
function matchPrices(item, period) {
  if (!PRICES) return [];
  const pool = period ? PRICES.items.filter(x => (x.period || '2026-08') === period) : PRICES.items;
  const out = [];
  for (const c of (item.cons || [])) {
    if (c.cat !== '材料' || c.price == null || !c.name) continue;
    const mn = norm(c.name); if (mn.length < 2) continue;
    let best = null;
    for (const p of pool) {
      const pn = norm(p.name); if (pn.length < 2) continue;
      let s = 0;
      if (pn === mn) s = 100; else if (pn.includes(mn)) s = 60 + mn.length; else if (mn.includes(pn)) s = 50 + pn.length;
      if (!s) continue;
      if (unitKey(p.unit) === unitKey(c.unit)) s += 20;
      if (p.ok) s += 5;
      if (!best || s > best.s) best = { s, p };
    }
    if (best && best.s >= 70) out.push({ mat: c.name, matPrice: c.price, qty: c.qty, unit: c.unit, score: best.s, price: { name: best.p.name, spec: best.p.spec, unit: best.p.unit, tax: best.p.tax, noTax: best.p.noTax, page: best.p.page, ok: best.p.ok } });
  }
  return out;
}
function snippet(text, toks, span = 46) {
  const t = String(text || '');
  let pos = -1;
  for (const k of toks) { const i = idx(t).indexOf(k); if (i >= 0) { pos = i; break; } }
  if (pos < 0) return t.slice(0, span * 2);
  const a = Math.max(0, pos - span);
  return (a > 0 ? '…' : '') + t.slice(a, pos + span) + (pos + span < t.length ? '…' : '');
}
function ask(q) {
  const toks = String(q || '').split(/\s+/).filter(Boolean).map(idx);
  if (!toks.length) return { q, quotas: [], rules: [], notes: [] };
  const quotas = search(q, '', 6).map(r => {
    const it = BOOKS.find(b => b.code === r.code && b.book === r.book);
    return { ...r, snippet: snippet((it.name || '') + ' ' + (it.spec || '') + '。' + (it.work || ''), toks) };
  });
  const rules = searchRules(q, 6).map(r => ({ book: r.book, chapter: r.chapter, section: r.section, page: r.page, snippet: snippet(r.text, toks, 60) }));
  const notes = [];
  if (fs.existsSync(NOTES)) for (const f of fs.readdirSync(NOTES).filter(x => x.endsWith('.md'))) {
    const body = fs.readFileSync(path.join(NOTES, f), 'utf8');
    const hay = idx(body);
    let s = 0; for (const t of toks) if (hay.includes(t)) s += t.length;
    if (s > 0) notes.push({ code: f.replace(/\.md$/, ''), snippet: snippet(body.replace(/^#[^\n]*\n/, ''), toks, 60) });
  }
  notes.sort((a, b) => b.snippet.length - a.snippet.length);
  const ans = [];
  if (quotas[0]) ans.push('推荐子目：' + quotas[0].code + ' ' + quotas[0].name + (quotas[0].spec ? '（' + quotas[0].spec + '）' : '') + '，单位 ' + (quotas[0].unit || '—') + '，综合单价(不含税) ' + (quotas[0].noTax != null ? quotas[0].noTax : '—') + ' 元；工作内容：' + quotas[0].snippet + '。');
  if (rules[0]) ans.push('计价依据：' + rules[0].snippet + '（' + rules[0].book + ' P' + rules[0].page + '）。');
  if (notes[0]) ans.push('你的笔记提醒：' + notes[0].snippet + '。');
  if (!ans.length) ans.push('未找到直接证据，建议更换关键词或浏览「规则」模块。');
  return { q, quotas, rules, notes: notes.slice(0, 4), answer: ans.join(' ') };
}
function saveHabits() { fs.writeFileSync(path.join(PROC, 'rules_habits.json'), JSON.stringify(HABITS, null, 1)); }
function matchHabits(item) {
  const out = [];
  for (const r of (HABITS ? HABITS.rules : [])) {
    if (!r.enabled) continue;
    const sc = r.scope || {};
    let ok = true;
    if (sc.codePrefix && !String(item.code || '').toUpperCase().startsWith(String(sc.codePrefix).toUpperCase())) ok = false;
    if (ok && sc.chapter && !String(item.chapter || '').includes(sc.chapter)) ok = false;
    if (ok && sc.section && !String(item.section || '').includes(sc.section)) ok = false;
    if (ok && sc.nameHas && !String(item.name || '').includes(sc.nameHas)) ok = false;
    if (ok && sc.book && !String(item.book || '').includes(sc.book)) ok = false;
    if (ok && sc.matHas && !(item.cons || []).some(c => String(c.name || '').includes(sc.matHas))) ok = false;
    if (ok && Object.keys(sc).length === 0) ok = false;
    if (ok) out.push(r);
  }
  return out;
}
function noteCandidates(text) {
  const cands = [];
  for (const ln of String(text || '').split(/\r?\n/)) {
    const t = ln.replace(/^[-*#\s]+/, '').trim();
    if (!t || t.length > 80) continue;
    const coef = t.match(/(人工|材料|机械)\s*[×x*]\s*(\d+(?:\.\d+)?)/g);
    if (coef) { const p = { laborK: 1, matK: 1, macK: 1 }; for (const m of coef) { const mm = m.match(/(人工|材料|机械)\s*[×x*]\s*(\d+(?:\.\d+)?)/); const k = { '人工': 'laborK', '材料': 'matK', '机械': 'macK' }[mm[1]]; p[k] = parseFloat(mm[2]); } cands.push({ type: 'coef', text: t, params: p }); continue; }
    const sub = t.match(/(.{2,20}?)\s*(?:→|换成|换为|按)\s*(\d+(?:\.\d+)?)\s*元/);
    if (sub) { cands.push({ type: 'sub', text: t, params: { matName: sub[1].trim(), newPrice: parseFloat(sub[2]) } }); continue; }
    if (/习惯|默认|一律|总是|记得|注意|易错/.test(t)) cands.push({ type: 'hint', text: t, params: { hint: t } });
  }
  return cands.slice(0, 20);
}
let JSZip; try { JSZip = require('jszip'); } catch { JSZip = require(path.join(process.env.NM_DIR || path.join(__dirname, 'node_modules'), 'jszip')); }
const colIdxOf = ref => { let n = 0; for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
const xesc = s => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d)).replace(/&amp;/g, '&');
async function parseXlsx(buf) {
  const zip = await JSZip.loadAsync(buf);
  let shared = [];
  const ss = zip.file('xl/sharedStrings.xml');
  if (ss) { const x = await ss.async('string'); shared = [...x.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => xesc(m[1].replace(/<[^>]+>/g, ''))); }
  const sheetFile = zip.file('xl/worksheets/sheet1.xml') || Object.values(zip.files).find(f => /xl\/worksheets\/sheet\d+\.xml/.test(f.name));
  const sx = await sheetFile.async('string');
  const grid = [];
  for (const rm of sx.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    for (const cm of rm[1].matchAll(/<c\s+r="([A-Z]+\d+)"([^>]*)>([\s\S]*?)<\/c>|<c\s+r="([A-Z]+\d+)"([^>]*)\/>/g)) {
      const ref = cm[1] || cm[4]; if (!ref) continue;
      const attrs = cm[2] || cm[5] || ''; const inner = cm[3] || '';
      let val = '';
      if (/t="s"/.test(attrs)) { const v = inner.match(/<v>(\d+)<\/v>/); val = v ? (shared[+v[1]] || '') : ''; }
      else if (/t="inlineStr"/.test(attrs)) { const t = inner.match(/<t[^>]*>([\s\S]*?)<\/t>/); val = t ? xesc(t[1]) : ''; }
      else { const v = inner.match(/<v>([\s\S]*?)<\/v>/); val = v ? xesc(v[1]) : ''; }
      const ri = +ref.replace(/[A-Z]+/, '') - 1; const ci = colIdxOf(ref);
      grid[ri] = grid[ri] || []; grid[ri][ci] = val.trim();
    }
  }
  return grid.filter(r => r && r.some(c => c));
}
function parseCsv(buf) {
  let text = buf.toString('utf8');
  if (text.includes('\ufffd')) text = new TextDecoder('gbk').decode(buf);
  text = text.replace(/^\ufeff/, '');
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const delim = (lines[0].match(/\t/) ? '\t' : ',');
  return lines.map(l => l.split(delim).map(c => c.replace(/^"|"$/g, '').trim()));
}
function gridToPrices(grid) {
  let hi = grid.findIndex(r => r.some(c => /名称|材料/.test(c || '')) && r.some(c => /价/.test(c || '')));
  if (hi < 0) return [];
  const head = grid[hi] || [];
  const find = re => head.findIndex(c => re.test(c || ''));
  const cName = find(/名称|材料/), cSpec = find(/规格|型号/), cUnit = find(/单位/), cTax = find(/含税/), cNo = find(/除税|不含税/), cAny = find(/单价|信息价|价格|元/), cPer = find(/期|月份|年月/);
  const out = [];
  for (let i = hi + 1; i < grid.length; i++) {
    const r = grid[i] || [];
    const name = cName >= 0 ? r[cName] : r[0];
    if (!name || /合计|总计|小计|备注/.test(name)) continue;
    const tax = cTax >= 0 ? parseFloat(r[cTax]) : NaN;
    const no = cNo >= 0 ? parseFloat(r[cNo]) : NaN;
    const any = cAny >= 0 ? parseFloat(r[cAny]) : NaN;
    out.push({ name: String(name).trim(), spec: cSpec >= 0 ? (r[cSpec] || '').trim() : '', unit: cUnit >= 0 ? (r[cUnit] || '').trim() : '', tax: isNaN(tax) ? null : tax, noTax: isNaN(no) ? null : no, anyPrice: isNaN(any) ? null : any, period: cPer >= 0 ? (r[cPer] || '').trim() : '' });
  }
  return { items: out, taxColumnOnly: cTax >= 0 && cNo < 0 };
}
function gridToBoq(grid) {
  let hi = grid.findIndex(r => r.some(c => /名称/.test(c || '')) && r.some(c => /数量|工程量/.test(c || '')));
  if (hi < 0) hi = 0;
  const head = grid[hi] || [];
  const find = re => head.findIndex(c => re.test(c || ''));
  const cCode = find(/编码|代号/), cName = find(/名称/), cFeat = find(/特征|描述/), cUnit = find(/单位/), cQty = find(/数量|工程量/);
  const rows = [];
  for (let i = hi + 1; i < grid.length; i++) {
    const r = grid[i] || [];
    const name = cName >= 0 ? r[cName] : r[1];
    if (!name || /合计|总计|小计/.test(name)) continue;
    rows.push({ boq: cCode >= 0 ? r[cCode] || '' : r[0] || '', name: String(name).trim(), feature: cFeat >= 0 ? r[cFeat] || '' : '', unit: cUnit >= 0 ? r[cUnit] || '' : '', qty: parseFloat((cQty >= 0 ? r[cQty] : r[5]) || '') || 1 });
  }
  return rows;
}
function send(res, code, obj, type = 'application/json; charset=utf-8') {
  const body = type.includes('json') ? JSON.stringify(obj) : obj;
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}
function readBody(req, cb) { let raw = ''; req.on('data', d => { raw += d; if (raw.length > 5e6) req.destroy(); }); req.on('end', () => cb(raw)); }
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = u.pathname;
  try {
    if (p === '/') return send(res, 200, fs.readFileSync(path.join(PUB, 'index.html')), 'text/html; charset=utf-8');
    if (p.startsWith('/data/')) { const f = path.join(ROOT, 'data', p.replace('/data/', '')); if (f.startsWith(path.join(ROOT, 'data')) && fs.existsSync(f)) return send(res, 200, fs.readFileSync(f), 'application/pdf'); }
    if (p.startsWith('/tools/')) { const f = path.join(PUB, 'tools', p.replace('/tools/', '')); if (f.startsWith(path.join(PUB, 'tools')) && fs.existsSync(f)) return send(res, 200, fs.readFileSync(f), MIME[path.extname(f)] || 'application/octet-stream'); }
    if (p.startsWith('/static/')) {
      const f = path.join(PUB, p.replace('/static/', ''));
      if (!f.startsWith(PUB) || !fs.existsSync(f)) return send(res, 404, 'nf', 'text/plain');
      return send(res, 200, fs.readFileSync(f), MIME[path.extname(f)] || 'application/octet-stream');
    }
    if (p === '/api/books') return send(res, 200, [...new Set(BOOKS.map(b => b.book))]);
    if (p === '/api/chapters') {
      const book = u.searchParams.get('book') || '';
      const map = new Map();
      for (const it of BOOKS) {
        if (book && it.book !== book) continue;
        const ch = it.chapter || '(未分章)';
        if (!map.has(ch)) map.set(ch, { name: ch, sections: new Set(), count: 0, book: it.book });
        const e = map.get(ch); e.count++; if (it.section) e.sections.add(it.section);
      }
      return send(res, 200, [...map.values()].map(e => ({ name: e.name, book: e.book, count: e.count, sections: [...e.sections] })));
    }
    if (p === '/api/search') return send(res, 200, search(u.searchParams.get('q') || '', u.searchParams.get('book') || '', +(u.searchParams.get('limit') || 80)));
    if (p === '/api/item') {
      const code = (u.searchParams.get('code') || '').trim();
      return send(res, 200, BOOKS.filter(b => b.code.toLowerCase() === code.toLowerCase())[0] || null);
    }
    if (p === '/api/fees') return send(res, 200, FEES);
    if (p === '/api/prices' && req.method === 'GET') return send(res, 200, PRICES || { period: '2026-08', items: [] });
    if (p === '/api/prices' && req.method === 'POST') return readBody(req, raw => {
      try {
        const b = JSON.parse(raw);
        PRICES = PRICES || { period: '2026-08', items: [] };
        if (b.del) PRICES.items = PRICES.items.filter(x => x.name !== b.del);
        else { PRICES.items = PRICES.items.filter(x => !(x.name === b.name && x.spec === b.spec)); PRICES.items.push({ name: String(b.name || '').trim(), spec: String(b.spec || '').trim(), unit: String(b.unit || '').trim(), noTax: b.noTax != null ? +b.noTax : null, tax: b.tax != null ? +b.tax : null, period: b.period || '2026-08', ok: true, manual: true }); }
        fs.writeFileSync(path.join(PROC, 'prices_manual.json'), JSON.stringify(PRICES, null, 1));
        send(res, 200, { ok: true, count: PRICES.items.length });
      } catch (e) { send(res, 400, { error: e.message }); }
    });
    if (p === '/api/prices/match') { const code = (u.searchParams.get('code') || '').trim(); const item = BOOKS.find(b => b.code.toLowerCase() === code.toLowerCase()); if (!item) return send(res, 404, { error: 'nf' }); return send(res, 200, matchPrices(item, u.searchParams.get('period') || '')); }
    if (p === '/api/rules') return send(res, 200, searchRules(u.searchParams.get('q') || '', +(u.searchParams.get('limit') || 60)));
    if (p === '/api/ask') return send(res, 200, ask(u.searchParams.get('q') || ''));
    if (p === '/api/import/parse' && req.method === 'POST') return readBody(req, raw => {
      (async () => {
        try {
          const b = JSON.parse(raw);
          const buf = Buffer.from(b.dataBase64, 'base64');
          const grid = /\.xls[xm]?$/i.test(b.name || '.xlsx') ? await parseXlsx(buf) : parseCsv(buf);
          const rows = gridToBoq(grid);
          const pr = gridToPrices(grid);
          send(res, 200, { rows, prices: pr.items, pricesTaxOnly: pr.taxColumnOnly, gridRows: grid.length });
        } catch (e) { send(res, 400, { error: e.message }); }
      })();
    });
    if (p === '/api/qa') {
      const rep = { books: {}, total: 0, failSum: 0, failVat: 0 };
      for (const it of BOOKS) {
        const f = it.fees || {}; const b = rep.books[it.book] || (rep.books[it.book] = { n: 0, failSum: 0, failVat: 0, emptyName: 0, emptyUnit: 0 });
        b.n++; rep.total++;
        const sum = (+f.labor || 0) + (+f.material || 0) + (+f.machine || 0) + (+f.fee || 0) + (+f.vat || 0);
        if (Math.abs(sum - (+f.total || 0)) > 0.06) { b.failSum++; rep.failSum++; }
        const pre = (+f.labor || 0) + (+f.material || 0) + (+f.machine || 0) + (+f.fee || 0);
        const r = pre > 0 ? (+f.vat || 0) / pre : 0;
        if (pre > 0 && ![0.09, 0.03, 0.06, 0.13, 0].some(x2 => Math.abs(r - x2) < 0.004)) { b.failVat++; rep.failVat++; }
        if (!it.name) b.emptyName++;
        if (!it.unit) b.emptyUnit++;
      }
      return send(res, 200, rep);
    }
    if (p === '/api/prices/bulk' && req.method === 'POST') return readBody(req, raw => {
      try {
        const b = JSON.parse(raw);
        PRICES = PRICES || { period: '2026-08', items: [] };
        const period = b.period || '2026-08';
        const div = b.taxIncluded ? (b.divisor || 1.13) : 1;
        let n = 0;
        for (const it of (b.items || [])) {
          if (!it.name) continue;
          let noTax = it.noTax != null ? +it.noTax : (it.anyPrice != null && !b.taxIncluded ? +it.anyPrice : (it.tax != null ? +(it.tax / div).toFixed(2) : (it.anyPrice != null ? +(it.anyPrice / div).toFixed(2) : null)));
          if (noTax == null || isNaN(noTax)) continue;
          PRICES.items = PRICES.items.filter(x => !(x.name === it.name && (x.spec || '') === (it.spec || '') && (x.period || period) === period));
          PRICES.items.push({ name: String(it.name).trim(), spec: String(it.spec || '').trim(), unit: String(it.unit || '').trim(), noTax, tax: it.tax != null ? +it.tax : null, period, ok: true, manual: true, bulk: true });
          n++;
        }
        saveHabits(); fs.writeFileSync(path.join(PROC, 'prices_manual.json'), JSON.stringify(PRICES, null, 1));
        send(res, 200, { ok: true, added: n, total: PRICES.items.length });
      } catch (e) { send(res, 400, { error: e.message }); }
    });
    if (p === '/api/presets') return send(res, 200, PRESETS || []);
    if (p === '/api/export/xlsx' && req.method === 'POST') return readBody(req, raw => {
      (async () => {
        try {
          const b = JSON.parse(raw);
          const x = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          const cell = (ref, val, formula) => formula ? '<c r="' + ref + '"><f>' + x(formula) + '</f></c>' : (typeof val === 'number' ? '<c r="' + ref + '"><v>' + val + '</v></c>' : '<c r="' + ref + '" t="inlineStr"><is><t>' + x(val) + '</t></is></c>');
          const L = i => String.fromCharCode(65 + i);
          const rowsXml = [];
          const head = ['序号', '清单编码', '项目名称', '项目特征', '单位', '数量', '定额编号', '综合单价(不含税)', '合价(不含税)'];
          rowsXml.push('<row r="1">' + head.map((h, i) => cell(L(i) + '1', h)).join('') + '</row>');
          (b.rows || []).forEach((r, i) => { const n = i + 2; rowsXml.push('<row r="' + n + '">' + cell('A' + n, i + 1) + cell('B' + n, r.boq || '') + cell('C' + n, r.name || '') + cell('D' + n, r.feature || '') + cell('E' + n, r.unit || '') + cell('F' + n, +r.qty || 0) + cell('G' + n, r.code || '') + cell('H' + n, +r.priceNoTax || 0) + cell('I' + n, null, 'H' + n + '*F' + n) + '</row>'); });
          const last = (b.rows || []).length + 1;
          rowsXml.push('<row r="' + (last + 1) + '">' + cell('C' + (last + 1), '合计(不含税)') + cell('I' + (last + 1), null, 'SUM(I2:I' + last + ')') + '</row>');
          const s1 = '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' + rowsXml.join('') + '</sheetData></worksheet>';
          const s2 = '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' + ['<row r="1">' + cell('A1', '费用汇总表') + cell('B1', '金额(元)') + '</row>'].concat((b.summary || []).map((sr, i) => '<row r="' + (i + 2) + '">' + cell('A' + (i + 2), sr[0]) + cell('B' + (i + 2), +sr[1] || 0) + '</row>')).join('') + '</sheetData></worksheet>';
          const zip = new JSZip();
          zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>');
          zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
          zip.file('xl/workbook.xml', '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="清单计价" sheetId="1" r:id="rId1"/><sheet name="费用汇总" sheetId="2" r:id="rId2"/></sheets></workbook>');
          zip.file('xl/_rels/workbook.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>');
          zip.file('xl/worksheets/sheet1.xml', s1);
          zip.file('xl/worksheets/sheet2.xml', s2);
          const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
          send(res, 200, { base64: buf.toString('base64') });
        } catch (e) { send(res, 400, { error: e.message }); }
      })();
    });
    if (p === '/api/habits' && req.method === 'GET') return send(res, 200, HABITS || { rules: [] });
    if (p === '/api/habits' && req.method === 'POST') return readBody(req, raw => {
      try {
        const b = JSON.parse(raw);
        HABITS = HABITS || { rules: [] };
        if (b.del) HABITS.rules = HABITS.rules.filter(x => x.id !== b.del);
        else {
          const r = b.rule || b;
          r.id = r.id || 'H' + Date.now();
          if (r.enabled == null) r.enabled = true;
          const i = HABITS.rules.findIndex(x => x.id === r.id);
          if (i >= 0) HABITS.rules[i] = r; else HABITS.rules.push(r);
        }
        saveHabits();
        send(res, 200, { ok: true, count: HABITS.rules.length });
      } catch (e) { send(res, 400, { error: e.message }); }
    });
    if (p === '/api/habits/match') { const code = (u.searchParams.get('code') || '').trim(); const item = BOOKS.find(b => b.code.toLowerCase() === code.toLowerCase()); if (!item) return send(res, 404, { error: 'nf' }); return send(res, 200, matchHabits(item)); }
    if (p === '/api/notes/candidates') { const code = (u.searchParams.get('code') || '').trim().replace(/[\\/:*?"<>|]/g, '_'); const f = path.join(NOTES, code + '.md'); if (!fs.existsSync(f)) return send(res, 404, { error: 'nf' }); return send(res, 200, noteCandidates(fs.readFileSync(f, 'utf8'))); }
    if (p === '/api/rules/related') {
      const ch = u.searchParams.get('chapter') || '', sec = u.searchParams.get('section') || '', bk = u.searchParams.get('book') || '';
      return send(res, 200, RULES.filter(r => (!bk || r.book === bk) && ((ch && r.chapter === ch) || (sec && r.section === sec))).slice(0, 40));
    }
    if (p === '/api/convert' && req.method === 'POST') return readBody(req, raw => {
      try { const { code, ...adj } = JSON.parse(raw); const item = BOOKS.find(b => b.code.toLowerCase() === String(code).toLowerCase()); if (!item) return send(res, 404, { error: 'not found' }); send(res, 200, convert(item, adj)); } catch (e) { send(res, 400, { error: e.message }); }
    });
    if (p === '/api/projects') return send(res, 200, fs.readdirSync(PROJ).filter(f => f.endsWith('.json')).map(f => { try { const j = JSON.parse(fs.readFileSync(path.join(PROJ, f), 'utf8')); return { id: j.id, name: j.name, rows: (j.rows || []).length, savedAt: j.savedAt }; } catch { return null; } }).filter(Boolean));
    if (p === '/api/project' && req.method === 'GET') {
      const id = (u.searchParams.get('id') || '').replace(/[\\/:*?"<>|]/g, '_');
      const f = path.join(PROJ, id + '.json');
      return send(res, 200, fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);
    }
    if (p === '/api/project' && req.method === 'POST') return readBody(req, raw => {
      try {
        const j = JSON.parse(raw);
        j.id = String(j.id || 'P' + Date.now()).replace(/[\\/:*?"<>|]/g, '_');
        j.savedAt = new Date().toISOString();
        fs.writeFileSync(path.join(PROJ, j.id + '.json'), JSON.stringify(j, null, 1));
        send(res, 200, { ok: true, id: j.id });
      } catch (e) { send(res, 400, { error: e.message }); }
    });
    if (p === '/api/project' && req.method === 'DELETE') {
      const id = (u.searchParams.get('id') || '').replace(/[\\/:*?"<>|]/g, '_');
      const f = path.join(PROJ, id + '.json');
      if (fs.existsSync(f)) fs.unlinkSync(f);
      return send(res, 200, { ok: true });
    }
    if (p === '/api/notes' && req.method === 'GET') {
      const code = (u.searchParams.get('code') || '').trim().replace(/[\\/:*?"<>|]/g, '_');
      const f = path.join(NOTES, code + '.md');
      return send(res, 200, { code, text: fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '' });
    }
    if (p === '/api/notes' && req.method === 'POST') return readBody(req, raw => {
      try {
        const { code, text } = JSON.parse(raw);
        const safe = String(code).trim().replace(/[\\/:*?"<>|]/g, '_');
        if (!safe) return send(res, 400, { error: 'bad code' });
        fs.mkdirSync(NOTES, { recursive: true });
        fs.writeFileSync(path.join(NOTES, safe + '.md'), String(text || ''), 'utf8');
        send(res, 200, { ok: true });
      } catch (e) { send(res, 400, { error: e.message }); }
    });
    if (p === '/api/notes/list') {
      if (!fs.existsSync(NOTES)) return send(res, 200, []);
      return send(res, 200, fs.readdirSync(NOTES).filter(f => f.endsWith('.md')).map(f => ({ code: f.replace(/\.md$/, ''), preview: (fs.readFileSync(path.join(NOTES, f), 'utf8').split('\n').slice(0, 3).join(' ')).slice(0, 80) })));
    }
    if (p === '/api/reload') { loadBooks(); return send(res, 200, { ok: true, items: BOOKS.length, rules: RULES.length }); }
    if (p === '/api/stats') return send(res, 200, { items: BOOKS.length, rules: RULES.length, books: [...new Set(BOOKS.map(b => b.book))] });
    return send(res, 404, { error: 'not found' });
  } catch (e) { return send(res, 500, { error: e.message }); }
});
server.listen(PORT, '127.0.0.1', () => console.log('workbench v2 on http://127.0.0.1:' + PORT));
