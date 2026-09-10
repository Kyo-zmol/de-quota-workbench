// heal_qa.js — 恒等失败子目：可解者自动愈合，余者进人工核录清单
const fs = require('fs');
const path = require('path');
const P = 'F:/我/定额知识库工作台/data/processed/';
const KEYS = ['labor', 'material', 'machine', 'fee', 'vat'];
const fixes = {}, review = [];
for (const f of fs.readdirSync(P).filter(f => f.startsWith('hb2024_'))) {
  const j = JSON.parse(fs.readFileSync(P + f, 'utf8'));
  const book = String(j.book || f).replace(/\.pdf$/, '');
  for (const it of j.items) {
    const fe = it.fees || {};
    const total = +fe.total || 0;
    if (!total) continue;
    const present = KEYS.filter(k => fe[k] != null && +fe[k] > 0);
    const absent = KEYS.filter(k => fe[k] == null || +fe[k] === 0);
    const sum = KEYS.reduce((a, k) => a + (+fe[k] || 0), 0);
    if (Math.abs(sum - total) > 0.06) {
      if (absent.length === 1) {
        const k = absent[0];
        const miss = +(total - sum).toFixed(2);
        if (miss > 0) {
          fixes[it.code] = { book, page: it.page, kind: 'autoHeal', note: '恒等式强制愈合：' + k + ' 缺失，补 ' + miss, fees: Object.assign({}, fe, { [k]: miss }) };
          continue;
        }
      }
      review.push({ code: it.code, book, page: it.page, reason: 'sum!=total 且缺失分量!=' + JSON.stringify(absent), fees: fe, total });
    } else {
      const pre = sum - (+fe.vat || 0);
      const r = pre > 0 ? (+fe.vat || 0) / pre : 0;
      if (pre > 0 && ![0.09, 0.03, 0.06, 0.13, 0].some(x => Math.abs(r - x) < 0.004)) review.push({ code: it.code, book, page: it.page, reason: '税率异常 ' + (r * 100).toFixed(2) + '%', fees: fe, total });
    }
  }
}
fs.writeFileSync(P + 'manual_fixes.json', JSON.stringify({ generatedAt: new Date().toISOString(), fixes, review }, null, 1));
console.log('autoHealed:', Object.keys(fixes).length, 'review:', review.length);
const byBook = {};
review.forEach(r => byBook[r.book] = (byBook[r.book] || 0) + 1);
console.log(JSON.stringify(byBook, null, 1));
console.log(review.slice(0, 12).map(r => r.code + ' p' + r.page + ' ' + r.reason).join('\n'));
