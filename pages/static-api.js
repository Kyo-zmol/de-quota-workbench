/* static-api.js — GitHub Pages 静态模式 shim：与 app/server.js 同口径的客户端实现
   数据源：data-demo/（随仓演示样本）+ localStorage（访问者自己的价本/习惯/工作单/笔记）
   访问者可用「导入」上传自己解析的全量 JSON（BYO-data），全程不离开浏览器 */
(function () {
  const LS = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch { return d; } };
  const SSG = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const state = { BOOKS: [], RULES: [], FEES: null, PRESETS: [], PRICES: LS('wb_prices', null), HABITS: LS('wb_habits', null), PROJECTS: LS('wb_projects', {}), NOTES: LS('wb_notes', {}) };
  const norm = s => (s || '').normalize('NFKC').replace(/\s+/g, '').trim();
  const idx = s => (s || '').toLowerCase();
  const UM = { '千块': 1000, '千片': 1000, '千根': 1000, '千套': 1000, '百块': 100 };
  function ubn(u) { const s = String(u || '').trim(); const m = /^(\d+(\.\d+)?)\s*(.*)$/.exec(s); if (m) return { mult: parseFloat(m[1]) * (UM[m[3]] != null ? UM[m[3]] : 1), base: m[3] || s }; const pre = Object.keys(UM).sort((x, y) => y.length - x.length).find(k => s.startsWith(k)); if (pre) return { mult: UM[pre], base: pre }; return { mult: 1, base: s }; }
  const unitBase = u => ubn(u).mult;
  function search(q, book, limit) {
    limit = limit || 80; q = (q || '').trim();
    const toks = q.split(/\s+/).filter(Boolean).map(idx);
    const out = [];
    for (const it of state.BOOKS) {
      if (book && it.book !== book) continue;
      let score = 0;
      const code = idx(it.code), name = idx(it.name), spec = idx(it.spec), sec = idx(it.section || ''), ch = idx(it.chapter || ''), consN = idx((it.cons || []).map(c => c.name).join(' ')), work = idx(it.work);
      for (const t of toks) { let s = 0; if (code === t) s += 200; else if (code.startsWith(t)) s += 120; else if (code.includes(t)) s += 80; const bk = it.book || ''; const rank = /结构·屋面/.test(bk) ? 0 : /装饰·措施/.test(bk) ? 1 : /公共专业/.test(bk) ? 2 : /园林/.test(bk) ? 3 : /海绵/.test(bk) ? 4 : /装配式建筑/.test(bk) ? 5 : /装配式内装修/.test(bk) ? 6 : /市政/.test(bk) ? 7 : 8; if (name.includes(t)) s += 60; if (spec.includes(t)) s += 25; if (sec.includes(t)) s += 15; if (ch.includes(t)) s += 8; if (consN.includes(t)) s += 12; if (work.includes(t)) s += 6; s -= rank * 4; if (s === 0) s = -1; score += s; }
      if (!toks.length) score = 1;
      if (score > 0) out.push({ it, score });
    }
    out.sort((a, b) => b.score - a.score || a.it.code.localeCompare(b.it.code));
    return out.slice(0, limit).map(o => ({ code: o.it.code, name: o.it.name, spec: o.it.spec, unit: o.it.unit, total: o.it.fees ? o.it.fees.total : null, noTax: o.it.fees ? +((o.it.fees.total || 0) - (o.it.fees.vat || 0)).toFixed(2) : null, chapter: o.it.chapter, section: o.it.section, book: o.it.book, score: o.score }));
  }
  function convert(item, adj) {
    const f = item.fees || {};
    if ((+f.labor || 0) + (+f.material || 0) + (+f.machine || 0) === 0 && (+f.total || 0) > 0) { const t = +f.total; return { orig: { labor: 0, material: 0, machine: 0, fee: 0, vat: 0, total: t, noTax: t }, adj: { labor: 0, material: 0, machine: 0, fee: 0, vat: 0, total: t, noTax: t }, delta: 0, feeRate: 0, implicitFeeRate: 0, officialRate: null, vatRate: 0, subDiffs: [], matDiff: 0, unitBase: unitBase(item.unit), incomplete: true }; }
    const labor = +f.labor || 0, material = +f.material || 0, machine = +f.machine || 0, fee = +f.fee || 0, vat = +f.vat || 0;
    const implicit = (labor + machine) > 0 ? fee / (labor + machine) : 0;
    const vatRate = (labor + material + machine + fee) > 0 ? vat / (labor + material + machine + fee) : 0;
    let off = null;
    if (state.FEES && adj.spec != null && state.FEES.specialties[adj.spec]) { const g = state.FEES[adj.tax === 'simple' ? 'simple' : 'general'] || state.FEES.general; off = ((g.mgmt[adj.spec] || 0) + (g.profit[adj.spec] || 0) + (g.safeCivil.total[adj.spec] || 0) + (g.otherMeasures.total[adj.spec] || 0)) / 100; }
    const use = off != null ? off : implicit;
    const lK = + (adj.laborK != null ? adj.laborK : 1), mK = + (adj.matK != null ? adj.matK : 1), cK = + (adj.macK != null ? adj.macK : 1);
    const subDiffs = []; let matDiff = 0;
    for (const s of (adj.subs || [])) { const c = (item.cons || []).find(x => x.name === s.name); if (!c || c.price == null || s.newPrice == null) continue; const d = (+s.newPrice - c.price) * (c.qty || 0); matDiff += d; subDiffs.push({ name: s.name, oldPrice: c.price, newPrice: +s.newPrice, qty: c.qty, diff: +d.toFixed(2) }); }
    const nL = +(labor * lK).toFixed(2), nM = +(material * mK).toFixed(2), nC = +(machine * cK).toFixed(2);
    const nF = +(use * (nL + nC)).toFixed(2), nV = +(vatRate * (nL + nM + nC + nF)).toFixed(2), nT = +(nL + nM + nC + nF + nV).toFixed(2);
    return { orig: { labor, material, machine, fee, vat, total: +(f.total != null ? f.total : labor + material + machine + fee + vat).toFixed(2), noTax: +(labor + material + machine + fee).toFixed(2) }, adj: { labor: nL, material: nM, machine: nC, fee: nF, vat: nV, total: nT, noTax: +(nL + nM + nC + nF).toFixed(2) }, delta: +(nT - (f.total != null ? f.total : labor + material + machine + fee + vat)).toFixed(2), feeRate: +use.toFixed(4), implicitFeeRate: +implicit.toFixed(4), officialRate: off, vatRate: +vatRate.toFixed(4), subDiffs, matDiff: +matDiff.toFixed(2), unitBase: unitBase(item.unit) };
  }
  function matchPrices(item, period) {
    const pool = period ? (state.PRICES.items || []).filter(x => (x.period || '2026-08') === period) : (state.PRICES ? state.PRICES.items || [] : []);
    const out = [];
    for (const c of (item.cons || [])) {
      if (c.cat !== '材料' || c.price == null || !c.name) continue;
      const mn = norm(c.name); if (mn.length < 2) continue;
      let best = null;
      for (const p of pool) { const pn = norm(p.name); if (pn.length < 2) continue; let s = 0; if (pn === mn) s = 100; else if (pn.includes(mn)) s = 60 + mn.length; else if (mn.includes(pn)) s = 50 + pn.length; if (!s) continue; if (p.unit === c.unit) s += 20; if (p.ok) s += 5; if (!best || s > best.s) best = { s, p }; }
      if (best && best.s >= 70) out.push({ mat: c.name, matPrice: c.price, qty: c.qty, unit: c.unit, score: best.s, price: { name: best.p.name, spec: best.p.spec, unit: best.p.unit, tax: best.p.tax, noTax: best.p.noTax, page: best.p.page, ok: best.p.ok } });
    }
    return out;
  }
  function matchHabits(item) {
    const out = [];
    for (const r of (state.HABITS ? state.HABITS.rules || [] : [])) {
      if (!r.enabled) continue;
      const sc = r.scope || {}; let ok = true;
      if (sc.codePrefix && !String(item.code || '').toUpperCase().startsWith(String(sc.codePrefix).toUpperCase())) ok = false;
      if (ok && sc.chapter && !String(item.chapter || '').includes(sc.chapter)) ok = false;
      if (ok && sc.section && !String(item.section || '').includes(sc.section)) ok = false;
      if (ok && sc.nameHas && !String(item.name || '').includes(sc.nameHas)) ok = false;
      if (ok && sc.matHas && !(item.cons || []).some(c => String(c.name || '').includes(sc.matHas))) ok = false;
      if (ok && !Object.keys(sc).length) ok = false;
      if (ok) out.push(r);
    }
    return out;
  }
  function snippet(text, toks, span) { span = span || 46; const t = String(text || ''); let pos = -1; for (const k of toks) { const i = idx(t).indexOf(k); if (i >= 0) { pos = i; break; } } if (pos < 0) return t.slice(0, span * 2); const a = Math.max(0, pos - span); return (a > 0 ? '…' : '') + t.slice(a, pos + span) + (pos + span < t.length ? '…' : ''); }
  const ready = (async () => {
    const man = await (await fetch('data-demo/manifest.json')).json();
    for (const f of man.books) { const j = await (await fetch('data-demo/' + f)).json(); for (const it of j.items) state.BOOKS.push(Object.assign({}, it, { book: String(j.book || '').replace(/\.pdf$/, '') })); }
    const ru = await (await fetch('data-demo/rules_all.json')).json(); state.RULES = ru.rules || [];
    state.FEES = await (await fetch('data-demo/fees_hubei2024.json')).json();
    state.PRESETS = await (await fetch('data-demo/convert_presets.json')).json();
    if (!state.PRICES) state.PRICES = await (await fetch('data-demo/prices_manual.json')).json();
    if (!state.HABITS) state.HABITS = await (await fetch('data-demo/rules_habits.json')).json();
  })();
  window.__STATIC_READY = ready;
  function api(p, params) {
    params = params || {};
    const q = params.q || '';
    if (p === '/api/stats') return Promise.resolve({ items: state.BOOKS.length, rules: state.RULES.length, books: [...new Set(state.BOOKS.map(b => b.book))] });
    if (p === '/api/books') return Promise.resolve([...new Set(state.BOOKS.map(b => b.book))]);
    if (p === '/api/chapters') { const map = new Map(); for (const it of state.BOOKS) { if (params.book && it.book !== params.book) continue; const ch = it.chapter || '(未分章)'; if (!map.has(ch)) map.set(ch, { name: ch, sections: new Set(), count: 0, book: it.book }); const e = map.get(ch); e.count++; if (it.section) e.sections.add(it.section); } return Promise.resolve([...map.values()].map(e => ({ name: e.name, book: e.book, count: e.count, sections: [...e.sections] }))); }
    if (p === '/api/search') return Promise.resolve(search(q, params.book, +(params.limit || 80)));
    if (p === '/api/item') return Promise.resolve(state.BOOKS.find(b => b.code.toLowerCase() === String(params.code || '').toLowerCase()) || null);
    if (p === '/api/fees') return Promise.resolve(state.FEES);
    if (p === '/api/presets') return Promise.resolve(state.PRESETS);
    if (p === '/api/rules') { const toks = q.split(/\s+/).filter(Boolean).map(idx); if (!toks.length) return Promise.resolve(state.RULES.slice(0, +(params.limit || 60))); const out = []; for (const r of state.RULES) { const hay = idx(r.text + ' ' + (r.chapter || '') + ' ' + (r.section || '') + ' ' + r.book); let s = 0; for (const t of toks) { if (hay.includes(t)) s += t.length; else { s = -1; break; } } if (s > 0) out.push({ r, s }); } out.sort((a, b) => b.s - a.s); return Promise.resolve(out.slice(0, +(params.limit || 60)).map(o => o.r)); }
    if (p === '/api/rules/related') return Promise.resolve(state.RULES.filter(r => (!params.book || r.book === params.book) && ((params.chapter && r.chapter === params.chapter) || (params.section && r.section === params.section))).slice(0, 40));
    if (p === '/api/ask') { const toks = q.split(/\s+/).filter(Boolean).map(idx); const quotas = search(q, '', 6).map(r => { const it = state.BOOKS.find(b => b.code === r.code && b.book === r.book); return Object.assign({}, r, { snippet: snippet((it.name || '') + ' ' + (it.spec || '') + '。' + (it.work || ''), toks) }); }); const rules = state.RULES.filter(r => { const hay = idx(r.text); return toks.every(t => hay.includes(t)); }).slice(0, 6).map(r => ({ book: r.book, chapter: r.chapter, section: r.section, page: r.page, snippet: snippet(r.text, toks, 60) })); const notes = Object.entries(state.NOTES).filter(([c, t]) => toks.some(t2 => idx(t).includes(t2))).slice(0, 4).map(([c, t]) => ({ code: c, snippet: snippet(t, toks, 60) })); const ans = []; if (quotas[0]) ans.push('推荐子目：' + quotas[0].code + ' ' + quotas[0].name + '，单位 ' + (quotas[0].unit || '—') + '，综合单价(不含税) ' + (quotas[0].noTax != null ? quotas[0].noTax : '—') + ' 元。'); if (rules[0]) ans.push('计价依据：' + rules[0].snippet + '（' + rules[0].book + ' P' + rules[0].page + '）。'); if (!ans.length) ans.push('未找到直接证据。'); return Promise.resolve({ q, quotas, rules, notes, answer: ans.join(' ') }); }
    if (p === '/api/qa') { const rep = { books: {}, total: 0, failSum: 0, failVat: 0 }; for (const it of state.BOOKS) { const f = it.fees || {}; const b = rep.books[it.book] || (rep.books[it.book] = { n: 0, failSum: 0, failVat: 0, emptyName: 0, emptyUnit: 0 }); b.n++; rep.total++; const sum = (+f.labor || 0) + (+f.material || 0) + (+f.machine || 0) + (+f.fee || 0) + (+f.vat || 0); if (Math.abs(sum - (+f.total || 0)) > 0.06) { b.failSum++; rep.failSum++; } const pre = sum - (+f.vat || 0); const rr = pre > 0 ? (+f.vat || 0) / pre : 0; if (pre > 0 && ![0.09, 0.03, 0.06, 0.13, 0].some(x => Math.abs(rr - x) < 0.004)) { b.failVat++; rep.failVat++; } if (!it.name) b.emptyName++; if (!it.unit) b.emptyUnit++; } return Promise.resolve(rep); }
    if (p === '/api/prices') return Promise.resolve(state.PRICES || { items: [] });
    if (p === '/api/prices/match') { const it = state.BOOKS.find(b => b.code.toLowerCase() === String(params.code || '').toLowerCase()); return Promise.resolve(it ? matchPrices(it, params.period || '') : []); }
    if (p === '/api/habits') return Promise.resolve(state.HABITS || { rules: [] });
    if (p === '/api/habits/match') { const it = state.BOOKS.find(b => b.code.toLowerCase() === String(params.code || '').toLowerCase()); return Promise.resolve(it ? matchHabits(it) : []); }
    if (p === '/api/projects') return Promise.resolve(Object.values(state.PROJECTS).map(j => ({ id: j.id, name: j.name, rows: (j.rows || []).length, savedAt: j.savedAt })));
    if (p === '/api/project') return Promise.resolve(state.PROJECTS[params.id] || null);
    if (p === '/api/notes') return Promise.resolve({ code: params.code, text: (state.NOTES[params.code] || '') });
    if (p === '/api/notes/list') return Promise.resolve(Object.entries(state.NOTES).map(([code, text]) => ({ code, preview: text.split('\n').slice(0, 3).join(' ').slice(0, 80) })));
    if (p === '/api/notes/candidates') { const t = state.NOTES[params.code] || ''; const cands = []; for (const ln of t.split(/\r?\n/)) { const s = ln.replace(/^[-*#\s]+/, '').trim(); if (!s || s.length > 80) continue; const coef = s.match(/(人工|材料|机械)\s*[×x*]\s*(\d+(?:\.\d+)?)/g); if (coef) { const p2 = { laborK: 1, matK: 1, macK: 1 }; for (const m of coef) { const mm = m.match(/(人工|材料|机械)\s*[×x*]\s*(\d+(?:\.\d+)?)/); p2[{ '人工': 'laborK', '材料': 'matK', '机械': 'macK' }[mm[1]]] = parseFloat(mm[2]); } cands.push({ type: 'coef', text: s, params: p2 }); continue; } const sub = s.match(/(.{2,20}?)\s*(?:→|换成|换为|按)\s*(\d+(?:\.\d+)?)\s*元/); if (sub) { cands.push({ type: 'sub', text: s, params: { matName: sub[1].trim(), newPrice: parseFloat(sub[2]) } }); continue; } if (/习惯|默认|一律|总是|记得|注意|易错/.test(s)) cands.push({ type: 'hint', text: s, params: { hint: s } }); } return Promise.resolve(cands.slice(0, 20)); }
    if (p === '/api/reload') return Promise.resolve({ ok: true, items: state.BOOKS.length });
    return Promise.resolve(null);
  }
  async function post(p, body) {
    if (p === '/api/convert') { const it = state.BOOKS.find(b => b.code.toLowerCase() === String(body.code || '').toLowerCase()); if (!it) return { error: 'nf' }; return convert(it, body); }
    if (p === '/api/prices') { state.PRICES = state.PRICES || { items: [] }; if (body.del) state.PRICES.items = state.PRICES.items.filter(x => x.name !== body.del); else { const period = body.period || '2026-08'; const div = body.taxIncluded ? (body.divisor || 1.13) : 1; const noTax = body.noTax != null ? +body.noTax : (body.anyPrice != null && !body.taxIncluded ? +body.anyPrice : (body.tax != null ? +(body.tax / div).toFixed(2) : (body.anyPrice != null ? +(body.anyPrice / div).toFixed(2) : null))); if (noTax != null && !isNaN(noTax)) { state.PRICES.items = state.PRICES.items.filter(x => !(x.name === body.name && (x.spec || '') === (body.spec || '') && (x.period || period) === period)); state.PRICES.items.push({ name: body.name, spec: body.spec || '', unit: body.unit || '', noTax, tax: body.tax != null ? +body.tax : null, period, ok: true, manual: true }); } } SSG('wb_prices', state.PRICES); return { ok: true, total: state.PRICES.items.length }; }
    if (p === '/api/prices/bulk') { let n = 0; for (const it of (body.items || [])) { const r = await post('/api/prices', Object.assign({}, it, { period: body.period, taxIncluded: body.taxIncluded })); if (r.ok) n++; } return { ok: true, added: n, total: state.PRICES.items.length }; }
    if (p === '/api/habits') { state.HABITS = state.HABITS || { rules: [] }; if (body.del) state.HABITS.rules = state.HABITS.rules.filter(x => x.id !== body.del); else { const r = body.rule || body; r.id = r.id || 'H' + Date.now(); if (r.enabled == null) r.enabled = true; const i = state.HABITS.rules.findIndex(x => x.id === r.id); if (i >= 0) state.HABITS.rules[i] = r; else state.HABITS.rules.push(r); } SSG('wb_habits', state.HABITS); return { ok: true, count: state.HABITS.rules.length }; }
    if (p === '/api/project') { body.id = body.id || 'P' + Date.now(); body.savedAt = new Date().toISOString(); state.PROJECTS[body.id] = body; SSG('wb_projects', state.PROJECTS); return { ok: true, id: body.id }; }
    if (p === '/api/notes') { state.NOTES[body.code] = body.text || ''; SSG('wb_notes', state.NOTES); return { ok: true }; }
    if (p === '/api/export/xlsx') { return exportXlsxClient(body); }
    if (p === '/api/import/parse') { return importParseClient(body); }
    return { ok: false };
  }
  async function exportXlsxClient(b) {
    const x = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const cell = (ref, val, formula) => formula ? '<c r="' + ref + '"><f>' + x(formula) + '</f></c>' : (typeof val === 'number' ? '<c r="' + ref + '"><v>' + val + '</v></c>' : '<c r="' + ref + '" t="inlineStr"><is><t>' + x(val) + '</t></is></c>');
    const L = i => String.fromCharCode(65 + i);
    const rowsXml = ['<row r="1">' + ['序号', '清单编码', '项目名称', '项目特征', '单位', '数量', '定额编号', '综合单价(不含税)', '合价(不含税)'].map((h, i) => cell(L(i) + '1', h)).join('') + '</row>'];
    (b.rows || []).forEach((r, i) => { const n = i + 2; rowsXml.push('<row r="' + n + '">' + cell('A' + n, i + 1) + cell('B' + n, r.boq || '') + cell('C' + n, r.name || '') + cell('D' + n, r.feature || '') + cell('E' + n, r.unit || '') + cell('F' + n, +r.qty || 0) + cell('G' + n, r.code || '') + cell('H' + n, +r.priceNoTax || 0) + cell('I' + n, null, 'H' + n + '*F' + n) + '</row>'); });
    const last = (b.rows || []).length + 1;
    rowsXml.push('<row r="' + (last + 1) + '">' + cell('C' + (last + 1), '合计(不含税)') + cell('I' + (last + 1), null, 'SUM(I2:I' + last + ')') + '</row>');
    const s1 = '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' + rowsXml.join('') + '</sheetData></worksheet>';
    const s2 = '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1">' + cell('A1', '费用汇总表') + cell('B1', '金额(元)') + '</row>' + (b.summary || []).map((sr, i) => '<row r="' + (i + 2) + '">' + cell('A' + (i + 2), sr[0]) + cell('B' + (i + 2), +sr[1] || 0) + '</row>').join('') + '</sheetData></worksheet>';
    const zip = new JSZip();
    zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>');
    zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
    zip.file('xl/workbook.xml', '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="清单计价" sheetId="1" r:id="rId1"/><sheet name="费用汇总" sheetId="2" r:id="rId2"/></sheets></workbook>');
    zip.file('xl/_rels/workbook.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>');
    zip.file('xl/worksheets/sheet1.xml', s1); zip.file('xl/worksheets/sheet2.xml', s2);
    const buf = await zip.generateAsync({ type: 'base64', compression: 'DEFLATE' });
    return { base64: buf };
  }
  async function importParseClient(b) {
    const zip = await JSZip.loadAsync(Uint8Array.from(atob(b.dataBase64), c => c.charCodeAt(0)));
    let shared = [];
    const ss = zip.file('xl/sharedStrings.xml');
    if (ss) { const x = await ss.async('string'); shared = [...x.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => m[1].replace(/<[^>]+>/g, '')); }
    const sf = zip.file('xl/worksheets/sheet1.xml') || Object.values(zip.files).find(f => /xl\/worksheets\/sheet\d+\.xml/.test(f.name));
    if (!sf) { const text = new TextDecoder('utf-8').decode(await (zip.file(Object.keys(zip.files)[0]) || sf || { async: async () => '' }).async('uint8array')); return { rows: [], prices: [] }; }
    const sx = await sf.async('string');
    const grid = [];
    for (const rm of sx.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) for (const cm of rm[1].matchAll(/<c\s+r="([A-Z]+\d+)"([^>]*)>([\s\S]*?)<\/c>/g)) {
      const ref = cm[1], attrs = cm[2] || '', inner = cm[3] || '';
      let val = '';
      if (/t="s"/.test(attrs)) { const v = inner.match(/<v>(\d+)<\/v>/); val = v ? (shared[+v[1]] || '') : ''; } else if (/t="inlineStr"/.test(attrs)) { const t = inner.match(/<t[^>]*>([\s\S]*?)<\/t>/); val = t ? t[1] : ''; } else { const v = inner.match(/<v>([\s\S]*?)<\/v>/); val = v ? v[1] : ''; }
      const ri = +ref.replace(/[A-Z]+/, '') - 1; let ci = 0; for (const ch of ref.replace(/\d+/g, '')) ci = ci * 26 + (ch.charCodeAt(0) - 64); ci -= 1;
      grid[ri] = grid[ri] || []; grid[ri][ci] = String(val).trim();
    }
    const g = grid.filter(r => r && r.some(c => c));
    let hi = g.findIndex(r => r.some(c => /名称/.test(c || '')) && r.some(c => /数量|工程量/.test(c || '')));
    if (hi < 0) hi = 0;
    const head = g[hi] || [];
    const find = re => head.findIndex(c => re.test(c || ''));
    const cCode = find(/编码|代号/), cName = find(/名称/), cFeat = find(/特征|描述/), cUnit = find(/单位/), cQty = find(/数量|工程量/);
    const rows = [];
    for (let i = hi + 1; i < g.length; i++) { const r = g[i] || []; const name = cName >= 0 ? r[cName] : r[1]; if (!name || /合计|总计|小计/.test(name)) continue; rows.push({ boq: cCode >= 0 ? r[cCode] || '' : r[0] || '', name: String(name).trim(), feature: cFeat >= 0 ? r[cFeat] || '' : '', unit: cUnit >= 0 ? r[cUnit] || '' : '', qty: parseFloat((cQty >= 0 ? r[cQty] : r[5]) || '') || 1 }); }
    let pi = g.findIndex(r => r.some(c => /名称|材料/.test(c || '')) && r.some(c => /价/.test(c || '')));
    const prices = [];
    if (pi >= 0) { const ph = g[pi] || []; const pf = re => ph.findIndex(c => re.test(c || '')); const pN = pf(/名称|材料/), pS = pf(/规格|型号/), pU = pf(/单位/), pT = pf(/含税/), pNo = pf(/除税|不含税/), pA = pf(/单价|信息价|价格|元/); for (let i = pi + 1; i < g.length; i++) { const r = g[i] || []; const name = pN >= 0 ? r[pN] : r[0]; if (!name || /合计|总计|小计|备注/.test(name)) continue; const tax = pT >= 0 ? parseFloat(r[pT]) : NaN; const no = pNo >= 0 ? parseFloat(r[pNo]) : NaN; const any = pA >= 0 ? parseFloat(r[pA]) : NaN; prices.push({ name: String(name).trim(), spec: pS >= 0 ? (r[pS] || '').trim() : '', unit: pU >= 0 ? (r[pU] || '').trim() : '', tax: isNaN(tax) ? null : tax, noTax: isNaN(no) ? null : no, anyPrice: isNaN(any) ? null : any, period: '' }); } }
    return { rows, prices, pricesTaxOnly: pi >= 0 && (g[pi] || []).some(c => /含税/.test(c || '')) && !(g[pi] || []).some(c => /除税|不含税/.test(c || '')) };
  }
  ready.then(() => { const tb = document.getElementById('topbar'); if (tb) tb.insertAdjacentHTML('afterbegin', '<span class="pill acc" style="margin-right:10px">静态演示模式 · 数据不离开浏览器</span>'); const fr = document.getElementById('pvFrame'); if (fr) { const par = fr.parentElement; fr.remove(); const note = document.createElement('div'); note.className = 'card'; note.style.cssText = 'padding:14px 16px;color:var(--sub);font-size:12.5px'; note.textContent = '静态模式不含官方 PDF 原文阅读器（体积考虑）。查定额/组价/换算/价本/问答/习惯卡全功能可用；全量数据请用本地版或自行解析后导入。'; par.appendChild(note); } });
  window.__STATIC_API = { api, post };
})();
