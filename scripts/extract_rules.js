// extract_rules.js — 抽取各册"说明/计算规则/系数"文本库
const path = require('path');
const fs = require('fs');
const NM = process.env.NM_DIR || path.join(__dirname, '..', 'node_modules');
const RAW = 'F:\\我\\知识库\\01-Projects\\定额知识库工作台\\data\\raw';
const OUT = 'F:\\我\\知识库\\01-Projects\\定额知识库工作台\\data\\processed\\rules_all.json';
const BOOKS = fs.readdirSync(RAW).filter(f => f.endsWith('.pdf') && !f.includes('费用定额') && !f.includes('结构·屋面）'));
const norm = s => s.normalize('NFKC').replace(/\s+/g, ' ').trim();
(async () => {
  const pdfjs = await import('file:///' + path.join(NM, 'pdfjs-dist', 'legacy', 'build', 'pdf.mjs').replace(/\\/g, '/'));
  const all = [];
  for (const f of BOOKS) {
    const book = f.replace(/\.pdf$/, '').replace(/湖北省|消耗量定额及全费用基价表|（2024）/g, '').trim() || f;
    const doc = await pdfjs.getDocument({ url: path.join(RAW, f), isEvalSupported: false }).promise;
    let chapter = '', section = '';
    for (let pno = 1; pno <= doc.numPages; pno++) {
      const page = await doc.getPage(pno);
      const tc = await page.getTextContent();
      const joined = tc.items.map(i => i.str).join('');
      if (joined.includes('定额编号')) continue; // 表格页跳过
      const rows = {};
      for (const it of tc.items) { if (!it.str.trim()) continue; const y = Math.round(it.transform[5]); if (y < 40) continue; (rows[y] = rows[y] || []).push({ x: Math.round(it.transform[4]), s: it.str }); }
      const ys = Object.keys(rows).map(Number).sort((a, b) => b - a);
      let para = [];
      const push = () => { const text = norm(para.join('')); if (text.length > 15) all.push({ book, page: pno, chapter, section, text }); para = []; };
      for (const y of ys) {
        const txt = norm(rows[y].sort((a, b) => a.x - b.x).map(o => o.s).join(''));
        if (!txt || /^·?\d+·?$/.test(txt)) continue;
        if (/^第[一二三四五六七八九十百零\d]+章/.test(txt)) { push(); chapter = txt; section = ''; continue; }
        if (/^[一二三四五六七八九十]+、/.test(txt) && txt.length < 40) { push(); section = txt; continue; }
        if (/^[０-９0-9]+[\.、]/.test(txt) || /^（[０-９0-9一二三四]+）/.test(txt)) { push(); para.push(txt); continue; }
        para.push(txt);
      }
      push();
    }
    await doc.destroy();
    console.log(book, 'paras', all.filter(a => a.book === book).length);
  }
  fs.writeFileSync(OUT, JSON.stringify({ extractedAt: new Date().toISOString(), rules: all }, null, 1));
  console.log('TOTAL rules:', all.length);
})().catch(e => { console.error('ERR', e); process.exit(1); });
