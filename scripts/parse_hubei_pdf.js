// parse_hubei_pdf.js v4
const path = require('path');
const fs = require('fs');
const NM = process.env.NM_DIR || 'C:\\Users\\Yzd18\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules';
const norm = s => s.normalize('NFKC').replace(/[\u2043\u2010\u2011\u2012\u2013\u2014\u2212]/g, '-').replace(/\s+/g, ' ').trim();
const isNum = s => /^-?\d+(\.\d+)?$/.test(s);
const toNum = s => { const v = parseFloat(s); return isNaN(v) ? null : v; };
const UNIT_RE = /^\d+(\.\d+)?(m|m2|m3|kg|t|km|ha|d|个|套|块|樘|扇)$/i;

(async () => {
  const [pdfPath, outPath, pFrom, pTo] = process.argv.slice(2);
  const pdfjs = await import('file:///' + path.join(NM, 'pdfjs-dist', 'legacy', 'build', 'pdf.mjs').replace(/\\/g, '/'));
  const doc = await pdfjs.getDocument({ url: pdfPath, isEvalSupported: false }).promise;
  const from = pFrom ? +pFrom : 1, to = pTo ? +pTo : doc.numPages;
  const items = [], chapters = [];
  let curChapter = '', curSection = '', curGroup = '';

  for (let pno = from; pno <= to; pno++) {
    const page = await doc.getPage(pno);
    const tc = await page.getTextContent();
    const rows = {};
    for (const it of tc.items) { if (!it.str.trim()) continue; const y = Math.round(it.transform[5]); (rows[y] = rows[y] || []).push({ x: Math.round(it.transform[4]), w: Math.round(it.width || it.str.length * 10), s: it.str }); }
    const ys = Object.keys(rows).map(Number).sort((a, b) => b - a);
    const lineAt = y => rows[y].sort((a, b) => a.x - b.x);
    const cells = line => { const out = []; for (const o of line) { const last = out[out.length - 1]; if (last && o.x - (last.x + last.w) < 12) { last.items.push(o); last.w = o.x + o.w - last.x; } else out.push({ x: o.x, w: o.w, items: [o] }); } return out.map(c => ({ x: c.x, cx: c.x + c.w / 2, txt: norm(c.items.map(i => i.s).join('')) })); };
    let block = null, zone = '', curCat = '', pendingSup = '', preWork = '', preUnit = '';
    let unitX = null, priceX = null, pendingSupCol = {};

    const flush = () => {
      if (!block) return;
      const mk = block.marks; const spanOf = ch1 => { const a = mk.filter(m => m.ch === ch1[0]).map(m => m.y), b = mk.filter(m => m.ch === ch1[1]).map(m => m.y); if (!a.length && !b.length) return null; const ys = [...a, ...b]; return { cat: ch1 === '人工' ? '人工' : ch1 === '材料' ? '材料' : '机械', min: Math.min(...ys), max: Math.max(...ys) }; }; const spans = ['人工', '材料', '机械'].map(spanOf).filter(Boolean).sort((x, y2) => y2.max - x.max); const marks = spans; const bounds = marks.slice(0, -1).map((m, i) => (m.y + marks[i + 1].y) / 2); const fillNear = arr => { for (let i = 0; i < arr.length; i++) if (!arr[i]) { let l = i - 1, r = i + 1; while (l >= 0 && !arr[l]) l--; while (r < arr.length && !arr[r]) r++; const dl = l >= 0 ? i - l : 99, dr = r < arr.length ? r - i : 99; arr[i] = dl <= dr ? (l >= 0 ? arr[l] : arr[r]) : (r < arr.length ? arr[r] : arr[l]); } return arr; }; fillNear(block.names); fillNear(block.units);
      const cleanG = t => String(t || '').split('。')[0].replace(/^（?[０-９0-9一二三四五六七八九十]+[）\)\.、]/, '').trim();
      const fb = cleanG(block.group) || cleanG(block.section) || cleanG(block.chapter);
      block.names = block.names.map(n => n || fb);
      for (let i = 0; i < block.codes.length; i++) {
        const cons = (block.cons[i] || []).filter(c => c.name).map(c => {
          let cat = c.cat;
          if (cat === '其他' && spans.length) { let best = null, bd = 1e9; for (const sp of spans) { const d = c.y > sp.max ? c.y - sp.max : (c.y < sp.min ? sp.min - c.y : 0); if (d < bd + 0.001 && d <= (best ? bd : 1e9)) { if (d < bd) { bd = d; best = sp; } } } cat = best ? best.cat : spans[0].cat; }
          return { cat, name: c.name, unit: c.unit, price: c.price, qty: c.qty };
        });
        items.push({ code: block.codes[i], name: block.names[i] || block.names.find(n => n) || '', spec: block.specs[i] || '',
          unit: block.units[i] || (block.unit === '见表' ? '' : block.unit) || '', work: block.work, chapter: block.chapter, section: block.section, group: block.group,
          fees: block.fees[i] || {}, cons, page: block.page });
      }
      block = null; zone = '';
    };

    for (const y of ys) {
      const line = lineAt(y);
      const txt = norm(line.map(o => o.s).join(''));
      if (!txt) continue;
      if (y < 30 && /^·?\s*\d+\s*·?$/.test(txt)) continue;
      if (/^第[一二三四五六七八九十百零\d]+章/.test(txt)) { curChapter = txt; if (!chapters.find(c => c.name === txt)) chapters.push({ name: txt, sections: [] }); curSection = ''; curGroup = ''; continue; }
      if (/^[一二三四五六七八九十]+、/.test(txt) && txt.length < 40) { curSection = txt; const ch = chapters.find(c => c.name === curChapter); if (ch && !ch.sections.includes(txt)) ch.sections.push(txt); curGroup = ''; continue; }
      if (/^\d+[\.、]/.test(txt) && txt.length < 40 && !block) { curGroup = txt; continue; }
      if (line.length === 1 && line[0].x <= 40 && txt.length === 1) { if (block && '人工材料机械'.includes(txt)) block.marks.push({ y, ch: txt }); continue; }
      if (txt.startsWith('工作内容')) {
        const w = norm(txt.replace(/^工作内容[:：]?/, '').split('计量单位')[0]);
        const uM = txt.match(/计量单位[:：]?(.+)$/);
        if (block) { block.work = w; if (uM) block.unit = norm(uM[1]); } else { preWork = w; if (uM) preUnit = norm(uM[1]); }
        continue;
      }
      if (!block && txt.startsWith('计量单位')) { preUnit = norm(txt.replace(/^计量单位[:：]?/, '')); continue; }
      if (txt.replace(/\s/g, '').includes('定额编号')) {
        flush();
        const labelX = Math.max(...line.filter(o => /定|编|号/.test(o.s)).map(o => o.x));
        const cs = line.filter(o => o.x > labelX + 40 && /[A-Za-z0-9]/.test(norm(o.s))).map(o => ({ x: o.x, cx: o.x, txt: norm(o.s) }));
        if (cs.length) {
          block = { page: pno, cols: cs.map(c => c.x), codes: cs.map(c => c.txt.replace(/\s/g, '')), names: Array(cs.length).fill(''), specs: Array(cs.length).fill(''), units: Array(cs.length).fill(''), unit: preUnit, work: preWork, fees: cs.map(() => ({})), cons: cs.map(() => []), marks: [], chapter: curChapter, section: curSection, group: curGroup };
          zone = 'names'; pendingSup = ''; pendingSupCol = {}; preWork = ''; preUnit = ''; unitX = null; priceX = null;
        }
        continue;
      }
      if (!block) continue;
      const colIdx = x => { let bi = -1, bd = 46; block.cols.forEach((cx, i) => { const d = Math.abs(x - cx); if (d < bd) { bd = d; bi = i; } }); return bi; };
      const t2 = txt.replace(/\s/g, '');
      if (t2 === '项目' || (t2.startsWith('项目') && line[0].x < 200)) {
        if (zone === 'names' && !block.names.some(n => n)) { const cs2 = cells(line).filter(c => c.x > 200); for (const c of cs2) { const ci = colIdx(c.cx) >= 0 ? colIdx(c.cx) : colIdx(c.x); if (ci >= 0 && !block.names[ci]) block.names[ci] = c.txt; } }
        zone = 'specs'; continue;
      }
      const feeKey = (() => { if (t2.startsWith('全费用(元)')) return 'total'; if (t2.startsWith('人工费(元)')) return 'labor'; if (t2.startsWith('材料费(元)')) return 'material'; if (t2.startsWith('机械费(元)')) return 'machine'; if (t2.startsWith('费用(元)')) return 'fee'; if (t2.startsWith('增值税(元)')) return 'vat'; return null; })();
      if (feeKey) { zone = 'fees'; for (const o of line) { const ns = norm(o.s); const ci = colIdx(o.x); if (ci < 0) continue; if (isNum(ns)) block.fees[ci][feeKey] = toNum(ns); else if (ns === '-') block.fees[ci][feeKey] = null; } continue; }
      if (t2.includes('消耗量') && t2.includes('名称')) { zone = 'cons'; const uc = cells(line).find(c => c.txt.startsWith('单') && c.txt.includes('位')); if (uc) unitX = uc.x; continue; }
      if (t2 === '单价' || t2 === '单价(元)') { priceX = line[0].x; continue; }
      if (t2 === '(元)' && zone === 'cons' && priceX == null) { priceX = line[0].x; continue; }

      if (zone === 'names' || zone === 'specs') {
        const cs = cells(line).filter(c => c.x > 60);
        const per = cs.filter(c => colIdx(c.cx) >= 0 || colIdx(c.x) >= 0);
        if (!per.length) { if (zone === 'names' && cs.length) { const sh = cs.map(c => c.txt).join(' '); block.names = block.names.map(n => n || sh); } continue; }
        const allUnitish = per.every(c => UNIT_RE.test(c.txt.replace(/\s/g, '')));
        if (allUnitish) { for (const c of per) { const ci = colIdx(c.cx) >= 0 ? colIdx(c.cx) : colIdx(c.x); block.units[ci] = (block.units[ci] || '') + c.txt + (pendingSupCol[ci] || ''); } pendingSupCol = {}; continue; }
        if (per.every(c => /^\d$/.test(c.txt))) { for (const c of per) { const ci = colIdx(c.cx) >= 0 ? colIdx(c.cx) : colIdx(c.x); if (block.units[ci]) block.units[ci] += c.txt; else pendingSupCol[ci] = c.txt; } continue; }
        for (const c of per) {
          const ci = colIdx(c.cx) >= 0 ? colIdx(c.cx) : colIdx(c.x);
          if (zone === 'names') block.names[ci] = block.names[ci] ? norm(block.names[ci] + c.txt) : c.txt;
          else block.specs[ci] = (block.specs[ci] + ' ' + c.txt).trim();
        }
        continue;
      }
      if (zone === 'cons') {
        const uEnd = unitX != null ? unitX - 8 : 190;
        const pEnd = priceX != null ? priceX - 8 : (block.cols[0] - 15);
        const qStart = block.cols[0] - 15;
        const nameParts = line.filter(o => o.x < uEnd);
        const unitParts = line.filter(o => o.x >= uEnd && o.x < pEnd);
        const priceParts = line.filter(o => o.x >= pEnd && o.x < qStart);
        const qtyParts = line.filter(o => o.x >= qStart);
        const nameTxt = norm(nameParts.map(o => o.s).join(''));
        if (!nameParts.length && !qtyParts.length && unitParts.length) { const u = norm(unitParts.map(o => o.s).join('')); if (/^\d$/.test(u)) pendingSup = u; else if (block.cons[0].length) { block.cons.forEach(arr => { if (arr.length) arr[arr.length - 1].unit = norm((arr[arr.length - 1].unit || '') + u + pendingSup); }); pendingSup = ''; } continue; }
        if (!nameParts.length && qtyParts.length) { for (const o of qtyParts) { const ci = colIdx(o.x); if (ci >= 0 && block.cons[ci].length) block.cons[ci][block.cons[ci].length - 1].qty = norm(o.s) === '-' ? null : toNum(norm(o.s)); } continue; }
        const priceO = priceParts.find(o => isNum(norm(o.s)));
        const hasQty = qtyParts.some(o => isNum(norm(o.s)) || norm(o.s) === '-');
        if (!hasQty && !priceO && nameTxt && block.cons[0].length) { block.cons.forEach(arr => { if (arr.length) arr[arr.length - 1].name = norm(arr[arr.length - 1].name + ' ' + nameTxt); }); continue; }
        if (!nameTxt && !hasQty && !priceO) continue;
        const unitO = unitParts.find(o => !/^\d$/.test(norm(o.s)));
        const entry = { y, cat: '其他', name: nameTxt, unit: unitO ? norm(unitO.s) + pendingSup : '', price: priceO ? toNum(norm(priceO.s)) : null, qty: Array(block.cols.length).fill(null) };
        if (unitO) pendingSup = '';
        for (const o of qtyParts) { const ci = colIdx(o.x); if (ci >= 0) entry.qty[ci] = norm(o.s) === '-' ? null : toNum(norm(o.s)); }
        block.cons.forEach((arr, i) => arr.push({ ...entry, qty: entry.qty[i] }));
        continue;
      }
    }
    flush();
    if (pno % 100 === 0) console.log('page', pno, 'items', items.length);
  }
  fs.writeFileSync(outPath, JSON.stringify({ book: path.basename(pdfPath), parsedAt: new Date().toISOString(), chapters, items }, null, 1));
  console.log('TOTAL items:', items.length);
})().catch(e => { console.error('ERR', e); process.exit(1); });
