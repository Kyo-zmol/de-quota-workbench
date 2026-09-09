// make_demo_data.js — 作品集演示样本集（全部为通用示例内容，不含任何个人真实数据）
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'data', 'processed');
const OUT = path.join(ROOT, 'demo', 'processed');
fs.mkdirSync(OUT, { recursive: true });
let totalItems = 0;
for (const f of fs.readdirSync(SRC).filter(f => f.startsWith('hb2024_'))) {
  const j = JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8'));
  const full = /结构·屋面/.test(j.book || f);
  const items = full ? j.items : j.items.slice(0, 120);
  totalItems += items.length;
  fs.writeFileSync(path.join(OUT, f), JSON.stringify({ ...j, items, demo: true, demoNote: '演示样本：' + (full ? '全册' : '前120条') + '。来源：湖北省住建厅官方公开发布件（2024），仅作品辑演示与个人学习。' }, null, 1));
}
const rules = JSON.parse(fs.readFileSync(path.join(SRC, 'rules_all.json'), 'utf8'));
fs.writeFileSync(path.join(OUT, 'rules_all.json'), JSON.stringify({ ...rules, rules: rules.rules.slice(0, 1500), demo: true }, null, 1));
fs.copyFileSync(path.join(SRC, 'fees_hubei2024.json'), path.join(OUT, 'fees_hubei2024.json'));
fs.writeFileSync(path.join(OUT, 'convert_presets.json'), JSON.stringify([
  { name: '示例：砌筑砂浆按 300 元/t 调差', subs: [{ name: '干混砌筑砂浆DM M10', newPrice: 300 }] },
  { name: '示例：零星工程人工×1.1', laborK: 1.1 }
], null, 1));
fs.writeFileSync(path.join(OUT, 'prices_manual.json'), JSON.stringify({ period: '2026-08', items: [
  { name: '普通硅酸盐水泥', spec: '散装 42.5', unit: '吨', noTax: 277.39, period: '2026-08', ok: true, sample: true },
  { name: '天然砂', spec: '中、粗', unit: '立方米', noTax: 155.29, period: '2026-08', ok: true, sample: true },
  { name: '机制砂', spec: '综合', unit: '立方米', noTax: 91.73, period: '2026-08', ok: true, sample: true },
  { name: '预拌混凝土', spec: 'C20', unit: 'm3', noTax: 402.52, period: '2026-08', ok: true, sample: true }
] }, null, 1));
fs.writeFileSync(path.join(OUT, 'rules_habits.json'), JSON.stringify({ rules: [
  { id: 'Hsample1', name: '示例：砌筑人工×1.1（零星工程）', scope: { chapter: '第一章砌筑工程' }, action: { type: 'coef', laborK: 1.1 }, enabled: true },
  { id: 'Hsample2', name: '示例：砖基础砂浆核对干混 DM M10', scope: { codePrefix: 'A1' }, action: { type: 'hint', hint: '砌筑砂浆默认按干混砂浆 DM M10 核对' }, enabled: true }
] }, null, 1));
fs.mkdirSync(path.join(ROOT, 'demo', 'projects'), { recursive: true });
fs.mkdirSync(path.join(ROOT, 'demo', 'notes'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'demo', 'projects', 'DEMO.json'), JSON.stringify({ id: 'DEMO', name: '示例工作单：某门卫室', tax: 'general', spec: 0, rows: [
  { boq: '010302001001', name: '砖基础', feature: '实心砖 直形 干混砂浆DM M10', unit: 'm3', qty: 12.5, code: 'A1-1', adj: { laborK: 1, matK: 1, macK: 1, subs: [] } },
  { boq: '010402001001', name: '矩形柱', feature: 'C20 预拌混凝土 柱高3.6m内', unit: 'm3', qty: 3.2, code: 'A2-11', adj: { laborK: 1, matK: 1, macK: 1, subs: [] } }
], savedAt: new Date().toISOString() }, null, 1));
fs.writeFileSync(path.join(ROOT, 'demo', 'notes', 'A1-1.md'), '# A1-1 砖基础（示例笔记）\n\n- 适用：实心砖 直形基础\n- 示例习惯：砂浆按干混 DM M10 核对\n- 示例易错：基础与墙身划分以室内地坪为界\n');
console.log('demo rebuilt (generic samples): items', totalItems);
