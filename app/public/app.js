/* 定额知识库工作台 v2 — app.js */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = v => v == null || isNaN(v) ? '—' : Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hl = (s, q) => { const t = esc(s); const ks = (q || '').split(/\s+/).filter(Boolean).map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')); return ks.length ? t.replace(new RegExp('(' + ks.join('|') + ')', 'gi'), '<mark>$1</mark>') : t; };
const unitBase = u => { const m = /^(\d+(\.\d+)?)/.exec(String(u || '').trim()); return m ? parseFloat(m[1]) : 1; };
const SHORT = b => String(b || '').replace(/湖北省/, '').replace(/消耗量定额及全费用基价表/, '').replace(/（2024）/g, '').replace(/\.pdf$/, '').replace(/房屋建筑与装饰工程/, '房建装饰').replace(/建设工程/, '').replace(/^\d+/, '').trim() || b;
async function api(p, params, opts) { const u = new URL(p, location.origin); if (params) for (const k in params) if (params[k] != null) u.searchParams.set(k, params[k]); const r = await fetch(u, opts); return r.json(); }
const post = (p, body) => api(p, null, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 2200); }

const S = { mod: 'lookup', q: '', book: '', code: null, results: [], tab: 'cons', fees: null, est: null, estDirty: false, cv: { code: null, laborK: 1, matK: 1, macK: 1, subs: [] }, cvRes: null };

/* ── 路由 ── */
const MODS = { lookup: '查定额', ask: '智能问答', estimate: '组价工作单', convert: '换算计算器', prices: '武汉信息价', rules: '规则与说明', notes: '我的笔记', settings: '设置' };
function go(mod) {
  S.mod = mod;
  $$('#rail button.nav').forEach(b => { const on = b.dataset.mod === mod; b.classList.toggle('on', on); if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  $$('.page').forEach(p => p.classList.toggle('on', p.id === 'pg-' + mod));
  $('#crumb').textContent = MODS[mod];
  if (mod === 'lookup' && !S.results.length) runSearch();
  if (mod === 'rules') runRules();
  if (mod === 'prices') runPrices();
  if (mod === 'ask') $('#askQ').focus();
  if (mod === 'notes') runNotes();
  if (mod === 'settings') runSettings();
  if (mod === 'estimate' && !S.est) newEstimate();
}
/* ── 查定额 ── */
let searchT;
function runSearch() { clearTimeout(searchT); searchT = setTimeout(async () => { S.results = await api('/api/search', { q: S.q, book: S.book, limit: 120 }); renderList(); }, 160); }
function renderList() {
  const el = $('#listPane');
  if (!S.results.length) { el.innerHTML = `<div class="hint">没有匹配结果<br><span class="chip" data-q="砖基础">砖基础</span><span class="chip" data-q="混凝土板">混凝土板</span><span class="chip" data-q="电缆">电缆</span><span class="chip" data-q="路灯">路灯</span></div>`; return; }
  el.innerHTML = S.results.map(r => `<div class="row${r.code === S.code ? ' on' : ''}" data-code="${esc(r.code)}"><div class="l1"><span class="code">${esc(r.code)}</span><span class="bk">${esc(SHORT(r.book))}</span></div><div class="nm">${hl(r.name, S.q)}${r.spec ? ' <span style="color:var(--sub)">' + hl(r.spec, S.q) + '</span>' : ''}</div><div class="l2"><span>${esc(r.unit || '')}</span><span class="pr">¥${fmt(r.total)}</span><span>${esc(r.section || '')}</span></div></div>`).join('');
  el.querySelectorAll('.row').forEach(x => x.onclick = () => openItem(x.dataset.code));
  el.querySelectorAll('.chip').forEach(x => x.onclick = () => { $('#q').value = x.dataset.q; S.q = x.dataset.q; runSearch(); });
}
async function loadTree() {
  const chs = await api('/api/chapters', { book: S.book });
  $('#treePane').innerHTML = chs.map(c => `<div class="ch"><button><span>${esc(c.name)}</span><span class="n">${c.count}</span></button><div class="secs">${c.sections.map(s => `<button data-sec="${esc(s)}">${esc(s)}</button>`).join('')}</div></div>`).join('');
  $('#treePane').querySelectorAll('.ch>button').forEach(b => b.onclick = () => b.parentElement.classList.toggle('open'));
  $('#treePane').querySelectorAll('.secs button').forEach(b => b.onclick = () => { $$('#treePane .secs button.on').forEach(x => x.classList.remove('on')); b.classList.add('on'); S.q = b.dataset.sec.replace(/^[一二三四五六七八九十]+、/, ''); $('#q').value = S.q; runSearch(); });
}
async function openItem(code, tab) {
  S.code = code; S.tab = tab || S.tab || 'cons';
  $$('#listPane .row').forEach(el => el.classList.toggle('on', el.dataset.code === code));
  const it = await api('/api/item', { code }); if (!it) return;
  S.cur = it;
  renderDetail(it);
}
function renderDetail(it) {
  const cats = ['人工', '材料', '机械', '其他'];
  const consHtml = cats.map(cat => {
    const rows = (it.cons || []).filter(c => (c.cat || '其他') === cat); if (!rows.length) return '';
    return `<h3 class="sec"><span><i class="catdot cat-${cat}"></i>${cat}</span>（${rows.length}）</h3><div class="card"><table><tr><th style="width:34%">名称</th><th>规格/型号</th><th style="width:70px">单位</th><th class="num" style="width:100px">单价(元)</th><th class="num" style="width:100px">消耗量</th></tr>${rows.map(r => `<tr><td>${esc(r.name)}</td><td style="color:var(--sub)">${esc(r.spec || '')}</td><td>${esc(r.unit || '')}</td><td class="num">${fmt(r.price)}</td><td class="num">${r.qty == null ? '—' : r.qty}</td></tr>`).join('')}</table></div>`;
  }).join('');
  $('#detailPane').innerHTML = `<div class="dhead"><span class="code">${esc(it.code)}</span><h2>${esc(it.name)}</h2>${it.spec ? `<span class="spec">${esc(it.spec)}</span>` : ''}</div>
  <div class="meta"><span class="pill acc">${esc(it.unit || '—')}</span><span class="pill">${esc(SHORT(it.book))}</span><span class="pill">${esc(it.chapter || '')}</span><span class="pill">${esc(it.section || '')}</span><span class="pill">${esc(it.group || '')}</span><span class="pill">P.${it.page}</span></div>
  <div class="fees"><div class="fee main"><div class="k">全费用(元)</div><div class="v">${fmt(it.fees.total)}</div></div><div class="fee"><div class="k">人工费</div><div class="v">${fmt(it.fees.labor)}</div></div><div class="fee"><div class="k">材料费</div><div class="v">${fmt(it.fees.material)}</div></div><div class="fee"><div class="k">机械费</div><div class="v">${fmt(it.fees.machine)}</div></div><div class="fee"><div class="k">费用</div><div class="v">${fmt(it.fees.fee)}</div></div><div class="fee"><div class="k">增值税</div><div class="v">${fmt(it.fees.vat)}</div></div></div>
  <div class="tabs"><button data-t="cons" class="${S.tab === 'cons' ? 'on' : ''}">组成与工作内容</button><button data-t="rules" class="${S.tab === 'rules' ? 'on' : ''}">相关规则</button><button data-t="note" class="${S.tab === 'note' ? 'on' : ''}">我的笔记</button><div style="flex:1"></div><button class="btn sm ghost" id="toCv">换算计算</button> <button class="btn sm" id="toEst">加入组价单</button></div>
  <div id="tabBody"></div>`;
  $('#detailPane .tabs').querySelectorAll('button[data-t]').forEach(b => b.onclick = () => { S.tab = b.dataset.t; renderDetail(it); });
  $('#toCv').onclick = () => { S.cv = { code: it.code, laborK: 1, matK: 1, macK: 1, subs: [] }; go('convert'); fillConvert(); };
  $('#toEst').onclick = () => { addEstRow(it); go('estimate'); };
  const body = $('#tabBody');
  const oldB = document.getElementById('habBanner'); if (oldB) oldB.remove();
  habitsFor(it.code).then(hs => { if (hs.length) { const d = document.createElement('div'); d.id = 'habBanner'; d.className = 'card'; d.style.cssText = 'padding:10px 14px;margin-bottom:14px;background:var(--amber-soft);border-color:#EFD9B4'; d.innerHTML = hs.map(h => '<div style="font-size:12.5px;color:var(--amber);line-height:1.8"><b>习惯卡</b> ' + esc(h.name) + '（' + esc(scopeText(h)) + '）→ ' + esc(actText(h)) + '</div>').join(''); body.before(d); } });
  if (S.tab === 'cons') body.innerHTML = `<h3 class="sec">工作内容</h3><div class="card work">${esc(it.work || '—')}</div>${consHtml}`;
  if (S.tab === 'rules') { body.innerHTML = '<div class="card"><div class="empty">加载中…</div></div>'; api('/api/rules/related', { chapter: it.chapter, section: it.section, book: it.book }).then(rs => { body.innerHTML = rs.length ? `<div class="card">${rs.map(r => `<div class="ruleItem"><div class="t">${esc(r.text)}</div><div class="m"><span class="pill">${esc(r.book)}</span><span class="pill">${esc(r.chapter || '')}</span><span class="pill">${esc(r.section || '')}</span><span class="pill">P.${r.page}</span></div></div>`).join('')}</div>` : '<div class="card"><div class="empty">本章节暂无说明文本</div></div>'; }); }
  if (S.tab === 'note') { api('/api/notes', { code: it.code }).then(n => { body.innerHTML = `<textarea class="note" id="noteTa" placeholder="适用条件、易错点、换算习惯……（保存到：notes/${esc(it.code)}.md）">${esc(n.text || '')}</textarea><div style="margin-top:10px;display:flex;gap:10px;align-items:center"><button class="btn" id="saveNote">保存笔记</button><span style="color:var(--sub);font-size:12px">Ctrl+Enter 亦可保存</span></div>`;
    const save = async () => { await post('/api/notes', { code: it.code, text: $('#noteTa').value }); toast('笔记已保存到 Obsidian 库'); };
    $('#saveNote').onclick = save; $('#noteTa').onkeydown = e => { if (e.ctrlKey && e.key === 'Enter') save(); }; }); }
}
/* ── 组价 ── */
function newEstimate() { S.est = { id: 'P' + Date.now(), name: '新建工作单 ' + new Date().toLocaleDateString('zh-CN'), tax: 'general', spec: 0, rows: [] }; renderEstimate(); }
function addEstRow(it) {
  if (!S.est) newEstimate();
  S.est.rows.push({ boq: '', name: it ? it.name : '', feature: '', unit: it ? it.unit : '', qty: 1, code: it ? it.code : '', adj: { laborK: 1, matK: 1, macK: 1, subs: [] } });
  renderEstimate(); toast(it ? `已加入：${it.code}` : '已添加空行');
}
const matchCache = {};
const habitCache = {};
async function habitsFor(code) { if (!habitCache[code]) habitCache[code] = await api('/api/habits/match', { code }); return habitCache[code]; }
const norm2 = s => (s || '').normalize('NFKC').replace(/\s+/g, '').trim().toLowerCase();
async function priceSubs(code) { const key = code + '|' + ((S.est && S.est.period) || ''); if (!matchCache[key]) matchCache[key] = await api('/api/prices/match', { code, period: (S.est && S.est.period) || '' }); return matchCache[key].filter(m => m.price.noTax != null).map(m => ({ name: m.mat, newPrice: m.price.noTax })); }
const UM = { '千块': 1000, '千片': 1000, '千根': 1000, '千套': 1000, '百块': 100 };
function ubn(u) { const s = String(u || '').trim(); const m = /^(\d+(\.\d+)?)\s*(.*)$/.exec(s); if (m) return { mult: parseFloat(m[1]) * (UM[m[3]] != null ? UM[m[3]] : 1), base: m[3] || s }; const pre = Object.keys(UM).sort((x, y) => y.length - x.length).find(k => s.startsWith(k)); if (pre) return { mult: UM[pre], base: pre }; return { mult: 1, base: s }; }
function boqFactorLocal(uq, ub, qty) { const a = ubn(uq), b = ubn(ub); const warn = (a.base && b.base && a.base !== b.base && UM[a.base] == null && UM[b.base] == null) ? a.base + '≠' + b.base : null; return { factor: (qty * b.mult) / a.mult, warn }; }
async function calcRow(r) {
  if ((r.type || 'fbf') === 'other') return { other: true, amtNoTax: +r.amountOther || 0, amtVat: 0, parts: { labor: 0, material: 0, machine: 0, fee: 0 } };
  if (!r.code) return null;
  const it = await api('/api/item', { code: r.code }); if (!it) return null;
  const mode = (S.est && S.est.diffMode) || 'diff-tax';
  const adj = { laborK: r.adj.laborK || 1, matK: r.adj.matK || 1, macK: r.adj.macK || 1, subs: [...(r.adj.subs || [])], spec: S.est ? +S.est.spec : 0, tax: S.est ? S.est.tax : 'general' };
  if (S.est && S.est.linkPrices) { const auto = await priceSubs(r.code); const manual = new Set(adj.subs.map(s => s.name)); adj.subs.push(...auto.filter(s => !manual.has(s.name))); }
  for (const h of await habitsFor(r.code)) {
    const act = h.action || {};
    if (act.type === 'coef' || act.type === 'mix') { adj.laborK = +((adj.laborK || 1) * (act.laborK || 1)).toFixed(4); adj.matK = +((adj.matK || 1) * (act.matK || 1)).toFixed(4); adj.macK = +((adj.macK || 1) * (act.macK || 1)).toFixed(4); }
    if ((act.type === 'sub' || act.type === 'mix')) { for (const sp of (act.subs || [])) if (sp.name && sp.newPrice != null && !adj.subs.some(s => s.name === sp.name)) adj.subs.push({ name: sp.name, newPrice: sp.newPrice }); if (act.type === 'sub' && act.matName && !adj.subs.some(s => s.name === act.matName)) adj.subs.push({ name: act.matName, newPrice: act.newPrice }); }
  }
  const baseAdj = { ...adj, subs: [] };
  const cv = await post('/api/convert', { code: r.code, ...baseAdj });
  let matDiff = 0;
  if (adj.subs.length) { const ws = await post('/api/convert', { code: r.code, ...adj }); if (mode === 'full') { cv.adj = ws.adj; cv.subDiffs = ws.subDiffs; } matDiff = ws.matDiff || 0; }
  const fb = boqFactorLocal(it.unit, r.unit, parseFloat(r.qty) || 0);
  const factor = fb.factor;
  const parts = { labor: +(cv.adj.labor * factor).toFixed(2), material: +(cv.adj.material * factor).toFixed(2), machine: +(cv.adj.machine * factor).toFixed(2), fee: +(cv.adj.fee * factor).toFixed(2) };
  let amtNoTax = +(cv.adj.noTax * factor).toFixed(2);
  let amtVat = +(cv.adj.vat * factor).toFixed(2);
  if (mode === 'diff-tax' && matDiff) { const d = +(matDiff * factor).toFixed(2); amtNoTax = +(amtNoTax + d).toFixed(2); amtVat = +(amtVat + d * cv.vatRate).toFixed(2); }
  return { it, cv, factor, warn: fb.warn, parts, amtNoTax, amtVat, priceNoTax: cv.adj.noTax, priceTax: cv.adj.total, cons: it.cons, subDiffs: cv.subDiffs || [] };
}
async function renderEstimate() {
  const e = S.est; if (!e) return;
  $('#estName').value = e.name;
  $('#taxSel').value = e.tax; $('#specSel').value = e.spec;
  if ($('#diffMode')) $('#diffMode').value = e.diffMode || 'diff-tax';
  if ($('#surchSel')) $('#surchSel').value = String(e.surchRate != null ? e.surchRate : 0.12);
  const calcs = [];
  for (const r of e.rows) { const cc = await calcRow(r); if (cc) cc.hab = r.code ? (await habitsFor(r.code)).length : 0; calcs.push(cc); }
  const tot = { labor: 0, material: 0, machine: 0, fee: 0, amt: 0, vat: 0 };
  let measQty = 0, otherAmt = 0, measBase = 0;
  calcs.forEach((c, i) => {
    const r = e.rows[i]; const ty = r.type || 'fbf';
    if (c.other) { otherAmt += c.amtNoTax; return; }
    if (!c) return;
    tot.labor += c.parts.labor; tot.material += c.parts.material; tot.machine += c.parts.machine; tot.fee += c.parts.fee;
    tot.amt += c.amtNoTax; tot.vat += c.amtVat;
    if (ty === 'measure') measQty += c.amtNoTax;
    measBase += c.parts.labor + c.parts.machine;
  });
  const meas = measQty;
  const F = S.fees;
  const preTax = tot.amt + meas + otherAmt;
  const vatRate = F ? (F[e.tax] || F.general).vat / 100 : 0.09;
  const vatProj = +(preTax * vatRate).toFixed(2);
  const surchRate = S.est.surchRate != null ? +S.est.surchRate : 0.12;
  const surch = +(vatProj * surchRate).toFixed(2);
  const grand = +(preTax + vatProj + surch).toFixed(2);
  S.lastSum = { tot, measQty, meas, otherAmt, preTax, vatProj, surch, surchRate, grand, vatRate, calcs };
  $('#estBody').innerHTML = e.rows.map((r, i) => { const c = calcs[i]; return `<tr data-i="${i}">
    <td style="width:30px" class="num">${i + 1}</td>
    <td style="width:70px"><select data-f="type" style="height:26px;border:1px solid var(--line);border-radius:4px;font-size:11.5px"><option value="fbf" ${(r.type || 'fbf') === 'fbf' ? 'selected' : ''}>分部分项</option><option value="measure" ${r.type === 'measure' ? 'selected' : ''}>单价措施</option><option value="other" ${r.type === 'other' ? 'selected' : ''}>其他项目</option></select></td>
    <td style="width:105px"><input data-f="boq" value="${esc(r.boq)}" placeholder="清单编码"></td>
    <td><input data-f="name" value="${esc(r.name)}" placeholder="项目名称"></td>
    <td style="width:140px"><input data-f="feature" value="${esc(r.feature)}" placeholder="特征"></td>
    <td style="width:56px"><input data-f="unit" value="${esc(r.unit)}"></td>
    <td style="width:74px"><input class="num" data-f="qty" value="${esc(r.qty)}"></td>
    <td style="width:118px">${(r.type || 'fbf') === 'other' ? '<input class="num" data-f="amountOther" value="' + esc(r.amountOther || '') + '" placeholder="金额(不含税)">' : (r.code ? `<span class="qbtn" data-act="cv">${esc(r.code)}</span>${c && c.hab ? ' <span class="pill acc" title="习惯卡命中">习</span>' : ''}${c && c.warn ? ' <span class="pill" style="background:var(--amber-soft);color:var(--amber)" title="单位口径:' + esc(c.warn) + '">!</span>' : ''}${c && c.cv && c.cv.incomplete ? ' <span class="pill" style="background:#FBE9E7;color:var(--danger)" title="该子目费用组成解析缺失，按全费用整体计">缺</span>' : ''}` : `<span class="qbtn" data-act="pick" style="color:var(--sub)">选定额…</span>`)}</td>
    <td class="num" style="width:96px">${c && !c.other ? fmt(c.priceNoTax) : '—'}</td>
    <td class="num" style="width:104px;color:var(--amber);font-weight:600">${c ? fmt(c.amtNoTax) : '—'}</td>
    <td style="width:40px"><button class="btn sm plain" data-act="del">×</button></td></tr>`; }).join('');
  $('#sumBody').innerHTML = `
   <div class="sumCard"><h4>分部分项工程费（不含税）</h4>
     <div class="sumRow"><span>人工费</span><span class="v">${fmt(tot.labor)}</span></div>
     <div class="sumRow"><span>材料费</span><span class="v">${fmt(tot.material)}</span></div>
     <div class="sumRow"><span>机械费</span><span class="v">${fmt(tot.machine)}</span></div>
     <div class="sumRow"><span>企业管理费+利润</span><span class="v">${fmt(tot.fee)}</span></div>
     <div class="sumRow total"><span>小计</span><span class="v">${fmt(tot.amt)}</span></div></div>
   <div class="sumCard"><h4>措施项目费（不含税 · ${esc(S.fees ? S.fees.specialties[e.spec] : '')}）</h4>
     <div class="sumRow"><span>单价措施（行）</span><span class="v">${fmt(measQty)}</span></div>
     <div class="sumRow" style="color:var(--sub);font-size:11.5px;height:22px"><span>总价措施已含于定额全费用（湖北2024口径）</span><span></span></div>
     <div class="sumRow total"><span>小计</span><span class="v">${fmt(meas)}</span></div></div>
   <div class="sumCard"><h4>其他项目费（不含税）</h4><div class="sumRow total" style="border:0;margin:0;padding:0"><span>小计</span><span class="v">${fmt(otherAmt)}</span></div></div>
   <div class="sumCard"><h4>汇总（${esc(S.fees ? (F[e.tax] || F.general).label : '')} · 材差口径:${e.diffMode === 'full' ? '全额进' : '只计差·差只计税'}）</h4>
     <div class="sumRow"><span>税前工程造价</span><span class="v">${fmt(preTax)}</span></div>
     <div class="sumRow"><span>增值税 ${(vatRate * 100).toFixed(0)}%（仅计一次）</span><span class="v">${fmt(vatProj)}</span></div>
     <div class="sumRow"><span>附加税 ${(surchRate * 100).toFixed(0)}%（城建+教育+地方教育）</span><span class="v">${fmt(surch)}</span></div>
     <div class="sumRow total"><span>单位工程造价</span><span class="v">${fmt(grand)}</span></div></div>`;
  bindEst();
}function bindEst() {
  $('#estBody').querySelectorAll('input,select').forEach(inp => inp.onchange = async () => { const tr = inp.closest('tr'); const i = +tr.dataset.i; S.est.rows[i][inp.dataset.f] = inp.value; if (inp.dataset.f === 'code' || inp.dataset.f === 'type') { Object.keys(matchCache).length && null; } renderEstimate(); });
  $('#estBody').querySelectorAll('[data-act]').forEach(b => b.onclick = async () => {
    const i = +b.closest('tr').dataset.i; const act = b.dataset.act;
    if (act === 'del') { S.est.rows.splice(i, 1); renderEstimate(); }
    if (act === 'pick') openPicker(async code => { S.est.rows[i].code = code; const it = await api('/api/item', { code }); if (it && !S.est.rows[i].name) S.est.rows[i].name = it.name; if (it) { S.est.rows[i].unit = it.unit; } renderEstimate(); });
    if (act === 'cv') { S.cv = { code: S.est.rows[i].code, ...S.est.rows[i].adj, _row: i }; go('convert'); fillConvert(); }
  });
}
async function saveEstimate() { if (!S.est) return; S.est.name = $('#estName').value || S.est.name; const r = await post('/api/project', S.est); S.est.id = r.id; toast('工作单已保存'); loadProjects(); }
async function loadProjects() { const ps = await api('/api/projects'); $('#projSel').innerHTML = '<option value="">— 选择已存工作单 —</option>' + ps.map(p => `<option value="${esc(p.id)}">${esc(p.name)}（${p.rows}行）</option>`).join(''); if ($('#cmpSel')) $('#cmpSel').innerHTML = '<option value="">对比单…</option>' + ps.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join(''); }
function exportEstimate() {
  const e = S.est; if (!e) return;
  const lines = ['# ' + e.name, '', '| 序号 | 清单编码 | 项目名称 | 特征 | 单位 | 数量 | 定额 | 综合单价 | 合价 |', '|---|---|---|---|---|---|---|---|---|'];
  $$('#estBody tr').forEach((tr, i) => { const c = tr.children; lines.push(`| ${i + 1} | ${c[1].firstChild.value} | ${c[2].firstChild.value} | ${c[3].firstChild.value} | ${c[4].firstChild.value} | ${c[5].firstChild.value} | ${c[6].innerText} | ${c[7].innerText} | ${c[8].innerText} |`); });
  lines.push('', '> 汇总见工作台右侧；导出时间 ' + new Date().toLocaleString('zh-CN'));
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (e.name || '工作单') + '.md'; a.click();
}
/* ── 定额选择器弹层 ── */
function openPicker(cb) {
  $('#pickMask').classList.add('on'); $('#pickQ').value = ''; $('#pickList').innerHTML = '<div class="empty">输入名称/编号搜索</div>';
  $('#pickQ').focus();
  $('#pickQ').oninput = async () => { const rs = await api('/api/search', { q: $('#pickQ').value, limit: 40 }); $('#pickList').innerHTML = rs.map(r => `<div class="pickRow" data-code="${esc(r.code)}"><span class="code">${esc(r.code)}</span><span class="nm">${esc(r.name)} ${esc(r.spec || '')}</span><span class="u">${esc(r.unit || '')}</span><span class="p">¥${fmt(r.total)}</span></div>`).join('') || '<div class="empty">无结果</div>';
    $('#pickList').querySelectorAll('.pickRow').forEach(x => x.onclick = () => { $('#pickMask').classList.remove('on'); cb(x.dataset.code); }); };
}
/* ── 换算 ── */
function fillConvert() {
  const c = S.cv;
  $('#cvCode').value = c.code || '';
  $('#cvL').value = c.laborK; $('#cvM').value = c.matK; $('#cvC').value = c.macK;
  runConvert();
}
async function runConvert() {
  const c = S.cv;
  if (!c.code) { $('#cvOut').innerHTML = '<div class="empty">先选择一条定额</div>'; return; }
  const it = await api('/api/item', { code: c.code }); if (!it) return;
  const res = await post('/api/convert', { code: c.code, laborK: c.laborK, matK: c.matK, macK: c.macK, subs: c.subs });
  S.cvRes = res;
  const subRows = (it.cons || []).filter(x => x.cat === '材料' && x.price != null).map(x => { const s = c.subs.find(s => s.name === x.name); return `<tr><td>${esc(x.name)}</td><td class="num">${fmt(x.price)}</td><td style="width:110px"><input class="num" data-sub="${esc(x.name)}" value="${s ? s.newPrice : ''}" placeholder="新单价"></td><td class="num">${s ? fmt(s.diff) : ''}</td></tr>`; }).join('');
  const hbs = await habitsFor(c.code);
  $('#cvOut').innerHTML = `<div style="margin-bottom:12px"><span class="pill acc">${esc(it.code)}</span> <b style="font-size:14px">${esc(it.name)}</b> <span class="pill">${esc(it.unit || '')}</span>${hbs.length ? ' <span class="pill" style="background:var(--amber-soft);color:var(--amber)">习惯卡命中 ' + hbs.length + '：' + hbs.map(h => esc(h.name)).join('、') + '</span>' : ''}</div>
  <div class="cmpWrap"><div class="cmp"><h4>原基价（每${esc(it.unit || '单位')}）</h4><div class="big">¥${fmt(res.orig.total)}</div>
    <div class="sumRow"><span>人工</span><span class="v">${fmt(res.orig.labor)}</span></div><div class="sumRow"><span>材料</span><span class="v">${fmt(res.orig.material)}</span></div><div class="sumRow"><span>机械</span><span class="v">${fmt(res.orig.machine)}</span></div><div class="sumRow"><span>费用</span><span class="v">${fmt(res.orig.fee)}</span></div><div class="sumRow"><span>增值税</span><span class="v">${fmt(res.orig.vat)}</span></div></div>
  <div class="cmp adj"><h4>换算后 <span class="delta ${res.delta === 0 ? 'zero' : ''}" style="margin-left:8px">${res.delta >= 0 ? '+' : ''}${fmt(res.delta)}</span></h4><div class="big">¥${fmt(res.adj.total)}</div>
    <div class="sumRow"><span>人工 ×${c.laborK}</span><span class="v">${fmt(res.adj.labor)}</span></div><div class="sumRow"><span>材料 ×${c.matK}${c.subs.length ? ' +换价' : ''}</span><span class="v">${fmt(res.adj.material)}</span></div><div class="sumRow"><span>机械 ×${c.macK}</span><span class="v">${fmt(res.adj.machine)}</span></div><div class="sumRow"><span>费用(费率${(res.feeRate * 100).toFixed(2)}%)</span><span class="v">${fmt(res.adj.fee)}</span></div><div class="sumRow"><span>增值税(${(res.vatRate * 100).toFixed(0)}%)</span><span class="v">${fmt(res.adj.vat)}</span></div></div></div>
  <h3 class="sec">材料换价（留空＝不换）</h3><div class="card"><table><tr><th>材料名称</th><th class="num" style="width:100px">原单价</th><th style="width:110px">新单价</th><th class="num" style="width:110px">差额</th></tr>${subRows}</table></div>
  <div style="margin-top:14px;display:flex;gap:10px"><button class="btn ghost" id="cvRefPrice">参考信息价(2026-08)</button><button class="btn ghost" id="cvSaveHabit">存为习惯卡</button><button class="btn" id="cvApply">应用到组价单行</button><button class="btn ghost" id="cvNote">存为笔记</button></div>`;
  $('#cvOut').querySelectorAll('input[data-sub]').forEach(inp => inp.onchange = () => { const name = inp.dataset.sub; const v = parseFloat(inp.value); c.subs = c.subs.filter(s => s.name !== name); if (!isNaN(v)) c.subs.push({ name, newPrice: v }); runConvert(); });
  api('/api/presets').then(ps2 => { const sel = $('#cvPreset'); if (sel) sel.innerHTML = '<option value="">换算预设…</option>' + (ps2 || []).map((p2, i) => '<option value="' + i + '">' + esc(p2.name) + '</option>').join(''); });
  $('#cvPreset').onchange = async e => { const ps2 = await api('/api/presets'); const p2 = ps2[+e.target.value]; if (!p2) return; S.cv.subs = (p2.subs || []).map(s2 => ({ ...s2 })); if (p2.laborK) S.cv.laborK = p2.laborK; if (p2.matK) S.cv.matK = p2.matK; if (p2.macK) S.cv.macK = p2.macK; runConvert(); toast('已应用预设：' + p2.name); };
  $('#cvRefPrice').onclick = async () => {
    const ms = await api('/api/prices/match', { code: c.code, period: (S.est && S.est.period) || '' });
    const good = ms.filter(m => m.price.noTax != null && m.score >= 70);
    if (!good.length) return toast('该子目材料未匹配到信息价');
    c.subs = good.map(m => ({ name: m.mat, newPrice: m.price.noTax }));
    runConvert(); toast('已填入 ' + good.length + ' 条信息价换价（除税价），请核对');
  };
  $('#cvSaveHabit').onclick = async () => {
    const mode = prompt('习惯卡作用范围：输入 1=仅本定额(' + c.code + ')，2=本章节(' + (it.chapter || '') + ')', '1');
    if (!mode) return;
    const scope = mode.trim() === '2' ? { chapter: it.chapter } : { codePrefix: c.code };
    const name = prompt('习惯卡名称', (it.name || c.code) + ' 的换算习惯');
    if (!name) return;
    await post('/api/habits', { rule: { name, scope, action: { type: 'mix', laborK: c.laborK, matK: c.matK, macK: c.macK, subs: c.subs }, enabled: true } });
    delete habitCache[c.code];
    toast('习惯卡已保存，组价/换算自动命中');
    runConvert();
  };
  $('#cvApply').onclick = () => {
    if (c._row != null && S.est) { S.est.rows[c._row].adj = { laborK: c.laborK, matK: c.matK, macK: c.macK, subs: c.subs }; go('estimate'); toast('已应用到工作单行'); }
    else { if (!S.est) newEstimate(); const r = S.est.rows.push({ boq: '', name: it.name, feature: '换算:' + JSON.stringify(c.subs.length ? c.subs.map(s => s.name + '@' + s.newPrice) : []) + ` 人×${c.laborK} 材×${c.matK} 机×${c.macK}`, unit: it.unit, qty: 1, code: it.code, adj: { laborK: c.laborK, matK: c.matK, macK: c.macK, subs: c.subs } }); go('estimate'); toast('已作为新行加入组价单'); }
  };
  $('#cvNote').onclick = async () => { const txt = `# ${it.code} 换算记录\n\n- 系数：人工×${c.laborK} 材料×${c.matK} 机械×${c.macK}\n- 换价：${c.subs.map(s => s.name + ' → ' + s.newPrice).join('；') || '无'}\n- 原基价 ${res.orig.total} → 换算后 ${res.adj.total}（差 ${res.delta}）\n- 依据费率：费用${(res.feeRate * 100).toFixed(2)}% 增值税${(res.vatRate * 100).toFixed(0)}%\n`; const n = await api('/api/notes', { code: it.code }); await post('/api/notes', { code: it.code, text: (n.text ? n.text + '\n\n' : '') + txt }); toast('换算记录已并入笔记'); };
}
/* ── 智能问答（证据式 RAG：定额/规则/笔记） ── */
let askT;
function runAsk() { clearTimeout(askT); askT = setTimeout(async () => {
  const q = $('#askQ').value.trim();
  if (!q) { $('#askOut').innerHTML = '<div class="empty">问点什么吧<br>证据来自：27,334 条定额 · 17,577 条说明规则 · 我的笔记</div>'; return; }
  const r = await api('/api/ask', { q });
  const grp = (title, items, render) => items && items.length ? '<h3 class="sec"><span>' + title + '</span>（' + items.length + '）</h3><div class="card">' + items.map(render).join('') + '</div>' : '';
  $('#askOut').innerHTML =
    grp('定额子目', r.quotas, (x, i) => '<div class="ruleItem" data-code="' + esc(x.code) + '" style="cursor:pointer"><div class="t"><b class="qbtn">' + esc(x.code) + '</b>　' + hl(x.name, q) + (x.spec ? ' <span style="color:var(--sub)">' + hl(x.spec, q) + '</span>' : '') + '　<span class="pill acc">' + fmt(x.total) + ' 元/' + esc(x.unit || '—') + '</span></div><div style="color:var(--sub);font-size:12.5px;margin-top:4px">' + hl(x.snippet, q) + '</div><div class="m"><span class="pill">' + esc(SHORT(x.book)) + '</span><span class="pill">' + esc(x.section || '') + '</span></div></div>') +
    grp('说明/规则依据', r.rules, x => '<div class="ruleItem"><div class="t">' + hl(x.snippet, q) + '</div><div class="m"><span class="pill">' + esc(x.book) + '</span><span class="pill">' + esc(x.chapter || '') + '</span><span class="pill">' + esc(x.section || '') + '</span><span class="pill">P.' + x.page + '</span></div></div>') +
    grp('我的笔记', r.notes, x => '<div class="ruleItem" data-note="' + esc(x.code) + '" style="cursor:pointer"><div class="t"><b class="qbtn">' + esc(x.code) + '</b>　' + hl(x.snippet, q) + '</div></div>') +
    (!r.quotas.length && !r.rules.length && !r.notes.length ? '<div class="empty">没有找到直接证据<br>换个说法，或去「规则」模块浏览</div>' : '');
  const aa = $('#askAns'); if (r.answer) { aa.style.display = ''; aa.innerHTML = '<b>答：</b>' + hl(r.answer, q); } else aa.style.display = 'none';
  if (llmCfg()) {
    const gen = document.createElement('div'); gen.className = 'card'; gen.style.cssText = 'padding:14px 18px;font-size:13.5px;line-height:1.9;background:var(--panel)';
    gen.innerHTML = '<b>生成式答案（' + esc(llmCfg().model || 'LLM') + ' · 证据增强）</b><div style="color:var(--sub)">生成中…</div>';
    aa.after(gen);
    llmAnswer(q, r).then(t => { gen.innerHTML = '<b>生成式答案（' + esc(llmCfg().model || 'LLM') + ' · 证据增强）</b><div style="white-space:pre-wrap;margin-top:6px">' + esc(t || '（无返回）') + '</div>'; }).catch(e => { gen.innerHTML = '<b>生成式答案</b><div style="color:var(--danger)">调用失败：' + esc(e.message) + '（已回退模板答案）</div>'; });
  }
  $('#askOut').querySelectorAll('[data-code]').forEach(el => el.onclick = () => { go('lookup'); openItem(el.dataset.code); });
  $('#askOut').querySelectorAll('[data-note]').forEach(el => el.onclick = () => { go('lookup'); openItem(el.dataset.note, 'note'); });
}, 220); }
/* ── 习惯卡 ── */
function actText(h) { const a = h.action || {}; if (a.type === 'coef' || a.type === 'mix') { const p = []; if (a.laborK && a.laborK !== 1) p.push('人工×' + a.laborK); if (a.matK && a.matK !== 1) p.push('材料×' + a.matK); if (a.macK && a.macK !== 1) p.push('机械×' + a.macK); if ((a.subs || []).length) p.push('换价' + a.subs.length + '项'); return p.join(' ') || '无系数'; } if (a.type === 'sub') return a.matName + ' → ' + a.newPrice + '元'; if (a.type === 'hint') return '提示：' + (a.hint || ''); return '-'; }
function scopeText(h) { const m = { codePrefix: '编号', chapter: '章', section: '节', nameHas: '名含', book: '册', matHas: '材含' }; return Object.entries(h.scope || {}).map(([k, v]) => m[k] + '=' + v).join(' '); }
let HABCACHE = null;
async function runHabits() {
  const h = await api('/api/habits'); HABCACHE = h.rules;
  $('#habitList').innerHTML = h.rules.length ? h.rules.map(r => '<tr><td><input type="checkbox" data-en="' + esc(r.id) + '" ' + (r.enabled ? 'checked' : '') + '></td><td>' + esc(r.name) + '</td><td style="color:var(--sub)">' + esc(scopeText(r)) + '</td><td>' + esc(actText(r)) + '</td><td><button class="btn sm plain" data-hdel="' + esc(r.id) + '">×</button></td></tr>').join('') : '<tr><td colspan="5"><div class="empty">还没有习惯卡<br>换算页「存为习惯卡」，或下方从笔记提炼</div></td></tr>';
  $('#habitList').querySelectorAll('[data-en]').forEach(cb => cb.onchange = async () => { const r = HABCACHE.find(x => x.id === cb.dataset.en); r.enabled = cb.checked; await post('/api/habits', { rule: r }); Object.keys(habitCache).forEach(k => delete habitCache[k]); toast(cb.checked ? '已启用' : '已停用'); });
  $('#habitList').querySelectorAll('[data-hdel]').forEach(b => b.onclick = async () => { await post('/api/habits', { del: b.dataset.hdel }); Object.keys(habitCache).forEach(k => delete habitCache[k]); runHabits(); toast('已删除'); });
  const ns = await api('/api/notes/list');
  $('#hbNoteSel').innerHTML = '<option value="">选择笔记…</option>' + ns.map(n => '<option value="' + esc(n.code) + '">' + esc(n.code) + '</option>').join('');
}
async function hbExtract() {
  const code = $('#hbNoteSel').value; if (!code) return toast('先选一条笔记');
  const cands = await api('/api/notes/candidates', { code });
  if (!cands.length) { $('#hbCands').innerHTML = '<div class="empty">这条笔记没有可识别的规则句式<br>试试写：人工×1.3 / 砂浆→280元 / 默认用干混砂浆</div>'; $('#hbSave').style.display = 'none'; return; }
  $('#hbCands').innerHTML = cands.map((c, i) => '<label style="display:flex;gap:8px;align-items:flex-start;font-size:12.5px;padding:5px 0"><input type="checkbox" data-ci="' + i + '" checked><span><span class="pill acc">' + c.type + '</span> ' + esc(c.text) + '</span></label>').join('');
  $('#hbCands')._cands = cands; $('#hbSave').style.display = '';
}
async function hbSave() {
  const cands = $('#hbCands')._cands || [];
  const scope = {};
  if ($('#hbScopeCode').value.trim()) scope.codePrefix = $('#hbScopeCode').value.trim();
  if ($('#hbScopeChapter').value.trim()) scope.chapter = $('#hbScopeChapter').value.trim();
  if ($('#hbScopeName').value.trim()) scope.nameHas = $('#hbScopeName').value.trim();
  if (!Object.keys(scope).length) return toast('请填至少一个作用范围');
  let n = 0;
  for (const cb of $('#hbCands').querySelectorAll('input:checked')) {
    const c = cands[+cb.dataset.ci];
    const action = c.type === 'coef' ? { type: 'coef', ...c.params } : c.type === 'sub' ? { type: 'sub', ...c.params } : { type: 'hint', ...c.params };
    await post('/api/habits', { rule: { name: c.text.slice(0, 24), scope, action, enabled: true } });
    n++;
  }
  Object.keys(habitCache).forEach(k => delete habitCache[k]);
  toast('已保存 ' + n + ' 张习惯卡'); runHabits();
}
/* ── 清单导入 + 自动匹配定额 ── */
async function importBoq(file) {
  const buf = await file.arrayBuffer();
  let bin = ''; const u8 = new Uint8Array(buf);
  for (let i = 0; i < u8.length; i += 8192) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 8192));
  const r = await post('/api/import/parse', { name: file.name, dataBase64: btoa(bin) });
  if (!r.rows || !r.rows.length) return toast('没有识别到清单行，请检查表头（需含 名称 + 数量/工程量 列）');
  if (!S.est) newEstimate();
  S.est.rows = [];
  let matched = 0;
  for (const row of r.rows.slice(0, 200)) {
    const cands = await api('/api/search', { q: row.name + (row.feature ? ' ' + row.feature : ''), limit: 3 });
    const top = cands[0];
    if (top && top.name) matched++;
    S.est.rows.push({ boq: row.boq, name: row.name, feature: row.feature, unit: row.unit || (top && top.unit) || '', qty: row.qty, code: top ? top.code : '', adj: { laborK: 1, matK: 1, macK: 1, subs: [] } });
  }
  renderEstimate();
  toast('导入 ' + S.est.rows.length + ' 行清单，自动匹配定额 ' + matched + ' 行（点编号可改）');
}
/* ── 正式报表导出 / 工料机分析 / 对审 ── */
async function exportXlsx() {
  const e = S.est; if (!e || !S.lastSum) return;
  const s = S.lastSum;
  const rows = e.rows.map((r, i) => ({ boq: r.boq, name: r.name, feature: r.feature, unit: r.unit, qty: r.qty, code: r.code, priceNoTax: s.calcs[i] && !s.calcs[i].other ? s.calcs[i].priceNoTax : (r.amountOther || 0) }));
  const summary = [['分部分项工程费(不含税)', s.tot.amt], ['措施项目费(不含税)', s.meas], ['其他项目费(不含税)', s.otherAmt], ['税前工程造价', s.preTax], ['增值税', s.vatProj], ['附加税', s.surch || 0], ['单位工程造价', s.grand]];
  const r = await post('/api/export/xlsx', { rows, summary });
  const bin = atob(r.base64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([u8], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })); a.download = (e.name || '计价表') + '.xlsx'; a.click();
  toast('已导出 Excel（含公式与费用汇总 sheet）');
}
function showAnalysis() {
  const s = S.lastSum; if (!s) return;
  const lab = {}, mat = {}, mac = {};
  s.calcs.forEach((c, i) => { if (!c || c.other || !c.cons) return; const f = c.factor; for (const k of c.cons) { const amt = (k.price || 0) * (k.qty || 0) * f; const q = (k.qty || 0) * f; const cat = k.cat || '其他'; const tgt = cat === '人工' ? lab : cat === '机械' ? mac : mat; const key = k.name + '|' + (k.unit || ''); tgt[key] = tgt[key] || { name: k.name, unit: k.unit, qty: 0, amt: 0 }; tgt[key].qty += q; tgt[key].amt += amt; } });
  const tbl = (o, unitNote) => Object.values(o).sort((a, b) => b.amt - a.amt).slice(0, 40).map(x => '<tr><td>' + esc(x.name) + '</td><td>' + esc(x.unit || '') + '</td><td class="num">' + (+x.qty.toFixed(3)) + '</td><td class="num">' + fmt(x.amt) + '</td></tr>').join('');
  openModal('工料机分析（本工作单汇总）', '<div class="tabs"><button class="on" data-at="lab">人工</button><button data-at="mat">材料(按金额)</button><button data-at="mac">机械</button></div><div id="anaBody" class="card" style="max-height:52vh;overflow:auto"><table><tr><th>名称</th><th>单位</th><th class="num">汇总量</th><th class="num">金额(元)</th></tr>' + tbl(lab) + '</table></div>', () => {
    $$('#modalGen .tabs button').forEach(b => b.onclick = () => { $$('#modalGen .tabs button').forEach(x => x.classList.toggle('on', x === b)); const o = b.dataset.at === 'lab' ? lab : b.dataset.at === 'mac' ? mac : mat; $('#anaBody').innerHTML = '<table><tr><th>名称</th><th>单位</th><th class="num">汇总量</th><th class="num">金额(元)</th></tr>' + tbl(o) + '</table>'; });
  });
}
function showCompare() {
  const idB = $('#cmpSel').value; if (!idB) return toast('先选择对比工作单');
  api('/api/project', { id: idB }).then(async pb => {
    const a = S.est; const mapB = new Map((pb.rows || []).map(r => [ (r.boq || r.name), r ]));
    const rowsHtml = (a.rows || []).map(r => { const b = mapB.get(r.boq || r.name); const da = b ? ((parseFloat(r.qty) || 0) - (parseFloat(b.qty) || 0)) : null; return '<tr><td>' + esc(r.name) + '</td><td class="num">' + esc(r.qty) + '</td><td class="num">' + (b ? esc(b.qty) : '—') + '</td><td class="num">' + (da != null ? (da ? '<span style="color:var(--amber)">' + da + '</span>' : '0') : '<span class="pill">仅A</span>') + '</td><td>' + esc(r.code || '') + '</td><td>' + (b ? esc(b.code || '') : '') + '</td></tr>'; }).join('');
    openModal('对审差异：' + esc(a.name) + ' vs ' + esc(pb.name || idB), '<div class="card" style="max-height:56vh;overflow:auto"><table><tr><th>名称</th><th class="num">A 数量</th><th class="num">B 数量</th><th class="num">Δ</th><th>A 定额</th><th>B 定额</th></tr>' + rowsHtml + '</table></div>');
  });
}
function openModal(title, bodyHtml, after) {
  let m = $('#modalGen');
  if (!m) { m = document.createElement('div'); m.id = 'modalGen'; m.className = 'mask'; m.innerHTML = '<div class="modal wide"><header><h3 id="mgTitle"></h3><button class="btn sm plain" id="mgClose">关闭</button></header><div class="body" id="mgBody"></div></div>'; document.body.appendChild(m); $('#mgClose').onclick = () => m.classList.remove('on'); }
  $('#mgTitle').textContent = title; $('#mgBody').innerHTML = bodyHtml; m.classList.add('on');
  if (after) after();
}
/* ── LLM 生成层（BYO-Key，证据增强） ── */
function llmCfg() { try { return JSON.parse(localStorage.getItem('wb_llm') || 'null'); } catch { return null; } }
async function llmAnswer(q, ev) {
  const c = llmCfg(); if (!c || !c.key || !c.base) return null;
  const sys = '你是一名资深造价工程师（湖北2024定额口径）。仅依据所给证据回答；引用定额编号与规则页码；证据不足时明确说明并给出核查路径（册/章/页）。回答简洁、结构化，不编造数字。';
  const ctx = '【证据·定额子目】\n' + ev.quotas.map(x => x.code + ' ' + x.name + (x.spec ? '(' + x.spec + ')' : '') + ' 单位' + (x.unit || '-') + ' 综合单价(不含税)' + (x.noTax != null ? x.noTax : '-') + ' 工作:' + x.snippet).join('\n') +
    '\n【证据·说明规则】\n' + ev.rules.map(x => x.snippet + '（' + x.book + ' P' + x.page + '）').join('\n') +
    '\n【证据·用户笔记】\n' + ev.notes.map(x => x.code + ': ' + x.snippet).join('\n');
  const r = await fetch(c.base.replace(/\/+$/, '') + '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + c.key }, body: JSON.stringify({ model: c.model || 'gpt-4o-mini', temperature: 0.2, messages: [{ role: 'system', content: sys }, { role: 'user', content: '问题：' + q + '\n' + ctx }] }) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const j = await r.json();
  return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || null;
}
/* ── 信息价模块 ── */
function pvGo(n) { n = Math.max(1, Math.min(62, n | 0)); $('#pvPage').value = n; $('#pvFrame').src = '/tools/render.html?file=/data/raw/wuhan_price_2026-08.ok.pdf&page=' + n + '&scale=2'; }
async function runPrices() {
  const r = await api('/api/prices');
  const q = norm2($('#priceQ').value);
  const items = (r.items || []).filter(x => !q || norm2(x.name + x.spec).includes(q));
  $('#priceMeta').textContent = '我的价本 ' + (r.items || []).length + ' 条 · 自动参与换算/组价材差联动 · 官方原文见左侧阅读器';
  $('#priceBody').innerHTML = items.map(p => '<tr><td>' + hl(p.name, $('#priceQ').value) + '</td><td style="color:var(--sub)">' + esc(p.spec || '') + '</td><td>' + esc(p.unit || '') + '</td><td class="num">' + fmt(p.noTax) + '</td><td>' + esc(p.period || '2026-08') + '</td><td><button class="btn sm plain" data-del="' + esc(p.name) + '">×</button></td></tr>').join('') || '<tr><td colspan="5"><div class="empty">价本为空<br>对照左侧原文录入常用材料</div></td></tr>';
  $('#priceBody').querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { await post('/api/prices', { del: b.dataset.del }); runPrices(); toast('已删除'); });
}
/* ── 材料价批量导入 ── */
const UNITWORDS = ['平方米', '立方米', '米', '吨', '千克', '公斤', '块', '片', '个', '套', '株', '台', '组', '根', '樘', '扇', 'm3', 'm2', 'kg', 't', 'm'];
function parsePastePrices(text) {
  const out = [];
  for (const ln of String(text || '').split(/\r?\n/)) {
    const t = ln.trim(); if (!t || t.startsWith('#')) continue;
    const toks = t.split(/[\t,;，；\s]+/).filter(Boolean);
    if (toks.length < 2) continue;
    let price = null, ti = -1;
    for (let i = toks.length - 1; i >= 0; i--) { const v = parseFloat(toks[i].replace(/元$/, '')); if (!isNaN(v) && /^\d+(\.\d+)?元?$/.test(toks[i])) { price = v; ti = i; break; } }
    if (price == null) continue;
    let unit = ''; let ui = -1;
    for (let i = ti - 1; i >= 0; i--) { const u = UNITWORDS.find(u2 => toks[i] === u2); if (u) { unit = u; ui = i; break; } }
    const periodM = t.match(/(20\d{2}[-年]\d{1,2})/);
    const rest = toks.slice(0, ui >= 0 ? ui : ti);
    if (!rest.length) continue;
    const name = rest[0];
    const spec = rest.slice(1).join(' ');
    out.push({ name, spec, unit, anyPrice: price, period: periodM ? periodM[1].replace('年', '-') : '' });
  }
  return out;
}
function showBulkImport() {
  openModal('批量导入材料价（Excel/CSV 或 粘贴文本）', `
    <div class="tabs"><button class="on" data-bt="file">文件</button><button data-bt="paste">粘贴文本</button></div>
    <div id="bkFile"><div style="display:flex;gap:10px;align-items:center;margin:10px 0"><button class="btn sm ghost" id="bkPick">选择 Excel/CSV…</button><span style="color:var(--sub);font-size:12px">表头需含 名称 + 价（含税/除税/单价自动识别）</span></div></div>
    <div id="bkPaste" style="display:none"><textarea id="bkText" class="note" style="min-height:120px" placeholder="每行一条，例：&#10;预拌混凝土 C20 m3 402.52&#10;干混砌筑砂浆 DM M10 t 280 元&#10;天然砂 中粗 立方米 155.29"></textarea><button class="btn sm ghost" id="bkParse" style="margin-top:8px">解析预览</button></div>
    <div style="display:flex;gap:12px;align-items:center;margin:12px 0"><label style="font-size:12.5px;display:flex;gap:6px;align-items:center"><input type="checkbox" id="bkTax"> 价格为含税（按 ÷1.13 折除税）</label><input id="bkPeriod" value="2026-08" style="height:30px;width:100px;border:1px solid var(--line);border-radius:6px;padding:0 8px;font-size:12.5px"><span style="color:var(--sub);font-size:12px">期号</span></div>
    <div id="bkPrev" class="card" style="max-height:40vh;overflow:auto"></div>
    <div style="margin-top:10px"><button class="btn" id="bkSave" style="display:none">勾选的入库</button></div>`, () => {
    $$('#modalGen .tabs button').forEach(b => b.onclick = () => { $$('#modalGen .tabs button').forEach(x2 => x2.classList.toggle('on', x2 === b)); $('#bkFile').style.display = b.dataset.bt === 'file' ? '' : 'none'; $('#bkPaste').style.display = b.dataset.bt === 'paste' ? '' : 'none'; });
    $('#bkPick').onclick = () => $('#pmBulkFile').click();
    $('#pmBulkFile').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; const buf = await f.arrayBuffer(); let bin = ''; const u8 = new Uint8Array(buf); for (let i = 0; i < u8.length; i += 8192) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); const r = await post('/api/import/parse', { name: f.name, dataBase64: btoa(bin) }); bkRender(r.prices || [], r.pricesTaxOnly); };
    $('#bkParse').onclick = () => bkRender(parsePastePrices($('#bkText').value));
    $('#bkSave').onclick = async () => {
      const items = ($('#bkPrev')._items || []).filter((it, i) => $('#bkPrev').querySelectorAll('input[type=checkbox]')[i].checked);
      const r = await post('/api/prices/bulk', { items, period: $('#bkPeriod').value.trim() || '2026-08', taxIncluded: $('#bkTax').checked });
      toast('已入库 ' + r.added + ' 条材料价'); $('#modalGen').classList.remove('on'); runPrices();
    };
  });
}
function bkRender(items) {
  const box = $('#bkPrev'); box._items = items;
  box.innerHTML = items.length ? '<table><tr><th style="width:36px">入</th><th>名称</th><th>规格</th><th>单位</th><th class="num">识别价</th><th>期</th></tr>' + items.map((it, i) => '<tr><td><input type="checkbox" checked></td><td>' + esc(it.name) + '</td><td style="color:var(--sub)">' + esc(it.spec || '') + '</td><td>' + esc(it.unit || '') + '</td><td class="num">' + (it.noTax != null ? it.noTax : it.anyPrice) + '</td><td>' + esc(it.period || '') + '</td></tr>').join('') + '</table>' : '<div class="empty">没解析到材料行</div>';
  $('#bkSave').style.display = items.length ? '' : 'none';
}
/* ── 规则 / 笔记 / 设置 ── */
let ruleT;
function runRules() { clearTimeout(ruleT); ruleT = setTimeout(async () => { const rs = await api('/api/rules', { q: $('#ruleQ').value, limit: 60 }); $('#ruleList').innerHTML = rs.length ? rs.map(r => `<div class="ruleItem"><div class="t">${hl(r.text, $('#ruleQ').value)}</div><div class="m"><span class="pill">${esc(r.book)}</span><span class="pill">${esc(r.chapter || '')}</span><span class="pill">${esc(r.section || '')}</span><span class="pill">P.${r.page}</span></div></div>`).join('') : '<div class="empty">无匹配说明</div>'; }, 200); }
async function runNotes() { const ns = await api('/api/notes/list'); $('#noteList').innerHTML = ns.length ? ns.map(n => `<div class="ruleItem" style="cursor:pointer" data-code="${esc(n.code)}"><div class="t"><b class="qbtn">${esc(n.code)}</b>　${esc(n.preview)}</div></div>`).join('') : '<div class="empty">还没有笔记<br>在「查定额」详情里写第一条</div>';
  $('#noteList').querySelectorAll('[data-code]').forEach(x => x.onclick = () => { go('lookup'); openItem(x.dataset.code, 'note'); }); }
async function runSettings() { const st = await api('/api/stats'); $('#setBody').innerHTML = `<div class="card" style="padding:16px"><div class="sumRow"><span>定额子目</span><span class="v">${st.items.toLocaleString()}</span></div><div class="sumRow"><span>说明/规则条</span><span class="v">${st.rules.toLocaleString()}</span></div><div class="sumRow"><span>册数</span><span class="v">${st.books.length}</span></div><div style="margin-top:12px;display:flex;gap:10px"><button class="btn" id="reloadBtn">热加载数据</button><button class="btn plain" id="guideBtn">重看新手引导</button></div><div style="margin-top:14px;color:var(--sub);font-size:12px;line-height:1.9">${st.books.map(b => '<span class="pill" style="margin:2px">' + esc(b) + '</span>').join('')}</div></div>`;
  $('#reloadBtn').onclick = async () => { const r = await api('/api/reload'); toast('已加载 ' + r.items + ' 条'); runSettings(); };
  const lc = llmCfg() || {};
  $('#llmBase').value = lc.base || ''; $('#llmModel').value = lc.model || ''; $('#llmKey').value = lc.key || '';
  $('#llmSave').onclick = () => { localStorage.setItem('wb_llm', JSON.stringify({ base: $('#llmBase').value.trim(), model: $('#llmModel').value.trim(), key: $('#llmKey').value.trim() })); $('#llmStat').textContent = '已保存（仅本浏览器）'; toast('LLM 配置已保存'); };
  $('#llmClear').onclick = () => { localStorage.removeItem('wb_llm'); $('#llmBase').value = $('#llmModel').value = $('#llmKey').value = ''; $('#llmStat').textContent = '已清除'; };
  $('#llmTest').onclick = async () => { const c = { base: $('#llmBase').value.trim(), model: $('#llmModel').value.trim(), key: $('#llmKey').value.trim() }; if (!c.base || !c.key) return $('#llmStat').textContent = '请先填 Base 与 Key'; $('#llmStat').textContent = '测试中…'; try { const r = await fetch(c.base.replace(/\/+$/, '') + '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + c.key }, body: JSON.stringify({ model: c.model || 'gpt-4o-mini', messages: [{ role: 'user', content: 'ping' }], max_tokens: 5 }) }); $('#llmStat').textContent = r.ok ? '连通 ✓ HTTP ' + r.status : '失败 HTTP ' + r.status; } catch (e) { $('#llmStat').textContent = '失败：' + e.message; } };
  api('/api/qa').then(qa => { $('#qaBody').innerHTML = '<table><tr><th>册</th><th class="num">子目</th><th class="num">恒等失败</th><th class="num">税率异常</th><th class="num">空名称</th><th class="num">空单位</th></tr>' + Object.entries(qa.books).map(ent => '<tr><td>' + esc(ent[0]) + '</td><td class="num">' + ent[1].n + '</td><td class="num" style="color:' + (ent[1].failSum ? 'var(--danger)' : 'var(--ok)') + '">' + ent[1].failSum + '</td><td class="num" style="color:' + (ent[1].failVat ? 'var(--amber)' : 'var(--ok)') + '">' + ent[1].failVat + '</td><td class="num">' + ent[1].emptyName + '</td><td class="num">' + ent[1].emptyUnit + '</td></tr>').join('') + '<tr><td><b>合计</b></td><td class="num"><b>' + qa.total + '</b></td><td class="num"><b>' + qa.failSum + '</b></td><td class="num"><b>' + qa.failVat + '</b></td><td colspan="2"></td></tr></table>'; });
  $('#guideBtn').onclick = () => $('#guideMask').classList.add('on'); }
/* ── 启动 ── */
(async () => {
  S.fees = await api('/api/fees');
  if (S.fees) $('#specSel').innerHTML = S.fees.specialties.map((s, i) => `<option value="${i}">${esc(s)}</option>`).join('');
  const st = await api('/api/stats');
  $('#statTxt').textContent = `${st.items.toLocaleString()} 子目 · ${st.rules.toLocaleString()} 说明 · 湖北2024`;
  const books = await api('/api/books');
  $('#bookSel').innerHTML = '<option value="">全部册</option>' + books.map(b => `<option value="${esc(b)}">${esc(b)}</option>`).join('');
  loadTree(); runSearch(); loadProjects();
  $('#q').oninput = e => { S.q = e.target.value; runSearch(); };
  $('#bookSel').onchange = e => { S.book = e.target.value; loadTree(); runSearch(); };
  $$('#rail button.nav').forEach(b => b.onclick = () => go(b.dataset.mod));
  $('#addRow').onclick = () => addEstRow(null);
  $('#impBoq').onclick = () => $('#impFile').click();
  $('#impFile').onchange = e => { const f = e.target.files[0]; if (f) importBoq(f); e.target.value = ''; };
  $('#saveEst').onclick = saveEstimate;
  $('#newEst').onclick = () => { newEstimate(); toast('已新建工作单'); };
  $('#expEst').onclick = exportEstimate;
  $('#expXlsx').onclick = exportXlsx;
  $('#anaBtn').onclick = showAnalysis;
  $('#cmpBtn').onclick = showCompare;
  $('#diffMode').onchange = e => { S.est.diffMode = e.target.value; renderEstimate(); };
  $('#surchSel').onchange = e => { S.est.surchRate = +e.target.value; renderEstimate(); };
  $('#projSel').onchange = async e => { if (!e.target.value) return; S.est = await api('/api/project', { id: e.target.value }); renderEstimate(); toast('已载入 ' + S.est.name); };
  $('#estName').onchange = e => { S.est.name = e.target.value; };
  $('#taxSel').onchange = e => { S.est.tax = e.target.value; renderEstimate(); };
  $('#specSel').onchange = e => { S.est.spec = +e.target.value; renderEstimate(); };
  $('#ruleQ').oninput = () => runRules();
  $$('#ruleTabs button').forEach(b => b.onclick = () => { $$('#ruleTabs button').forEach(x => x.classList.toggle('on', x === b)); const habits = b.dataset.rt === 'habits'; $('#ruleDescPane').style.display = habits ? 'none' : 'flex'; $('#habitPane').style.display = habits ? 'flex' : 'none'; if (habits) runHabits(); });
  $('#hbExtract').onclick = hbExtract;
  $('#pmBulk').onclick = showBulkImport;
  $('#hbSave').onclick = hbSave;
  $('#askQ').oninput = () => runAsk();
  $('#priceQ').oninput = () => runPrices();
  $('#pvPrev').onclick = () => pvGo(+($('#pvPage').value || 5) - 1);
  $('#pvNext').onclick = () => pvGo(+($('#pvPage').value || 5) + 1);
  $('#pvPage').onchange = e => pvGo(+e.target.value);
  $('#pmAdd').onclick = async () => {
    const name = $('#pmName').value.trim(); const noTax = parseFloat($('#pmNoTax').value);
    if (!name || isNaN(noTax)) return toast('请填写名称与除税价');
    await post('/api/prices', { name, spec: $('#pmSpec').value.trim(), unit: $('#pmUnit').value.trim(), noTax, period: ($('#pmPeriod') && $('#pmPeriod').value.trim()) || '2026-08' });
    $('#pmName').value = ''; $('#pmSpec').value = ''; $('#pmNoTax').value = '';
    runPrices(); toast('已加入价本，换算/组价即刻生效');
  };
  $('#linkPrices').onchange = e => { S.est.linkPrices = e.target.checked; renderEstimate(); };
  $('#diffMode').onchange = e => { S.est.diffMode = e.target.value; renderEstimate(); };
  $('#surchSel').onchange = e => { S.est.surchRate = +e.target.value; renderEstimate(); };
  $('#periodSel').onchange = e => { S.est.period = e.target.value; Object.keys(matchCache).forEach(k => { if (k.includes('|')) delete matchCache[k]; }); renderEstimate(); };
  api('/api/prices').then(pr => { const ps = [...new Set((pr.items || []).map(x => x.period || '2026-08'))]; $('#periodSel').innerHTML = ps.map(p2 => '<option value="' + esc(p2) + '">' + esc(p2) + ' 期</option>').join(''); });
  $('#cvPick').onclick = () => openPicker(code => { S.cv = { ...S.cv, code, subs: [] }; fillConvert(); });
  const kSync = (numId, rngId, key) => { const n = $(numId), r = $(rngId); n.onchange = () => { S.cv[key] = parseFloat(n.value) || 1; r.value = S.cv[key]; runConvert(); }; r.oninput = () => { S.cv[key] = parseFloat(r.value); n.value = r.value; runConvert(); }; };
  kSync('#cvL', '#cvLr', 'laborK'); kSync('#cvM', '#cvMr', 'matK'); kSync('#cvC', '#cvCr', 'macK');
  $('#pickClose').onclick = () => $('#pickMask').classList.remove('on');
  $('#guideClose').onclick = () => { $('#guideMask').classList.remove('on'); localStorage.setItem('wb_guide', '1'); };
  $('#guideGo1').onclick = () => { $('#guideMask').classList.remove('on'); go('lookup'); $('#q').value = '砖基础'; S.q = '砖基础'; runSearch(); };
  $('#guideGo2').onclick = () => { $('#guideMask').classList.remove('on'); go('estimate'); if (!S.est.rows.length) { addEstRow(null); } };
  addEventListener('keydown', e => {
    if (e.key === '/' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); $('#q').focus(); go('lookup'); }
    if (e.key === 'Escape') { $('#pickMask').classList.remove('on'); $('#guideMask').classList.remove('on'); const mg = $('#modalGen'); if (mg) mg.classList.remove('on'); }
    if (e.ctrlKey && e.key === 's' && S.mod === 'estimate') { e.preventDefault(); saveEstimate(); }
  });
  if (!localStorage.getItem('wb_guide')) $('#guideMask').classList.add('on');
  go('estimate');
})();
