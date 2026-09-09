// make_pages.js — 组装 GitHub Pages 静态站（pages/）：static.html 为入口 + 演示样本数据
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const PUB = path.join(ROOT, 'app', 'public');
const OUT = path.join(ROOT, 'pages');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'tools'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'data-demo'), { recursive: true });
for (const f of ['static.html', 'app.js', 'style.css', 'static-api.js']) fs.copyFileSync(path.join(PUB, f), path.join(OUT, f));
fs.renameSync(path.join(OUT, 'static.html'), path.join(OUT, 'index.html'));
for (const f of fs.readdirSync(path.join(PUB, 'tools'))) fs.copyFileSync(path.join(PUB, 'tools', f), path.join(OUT, 'tools', f));
const DP = path.join(ROOT, 'demo', 'processed');
const books = fs.readdirSync(DP).filter(f => f.startsWith('hb2024_'));
for (const f of books) fs.copyFileSync(path.join(DP, f), path.join(OUT, 'data-demo', f));
for (const f of ['rules_all.json', 'fees_hubei2024.json', 'convert_presets.json', 'prices_manual.json', 'rules_habits.json']) if (fs.existsSync(path.join(DP, f))) fs.copyFileSync(path.join(DP, f), path.join(OUT, 'data-demo', f));
fs.writeFileSync(path.join(OUT, 'data-demo', 'manifest.json'), JSON.stringify({ books }, null, 1));
console.log('pages built:', books.length, 'books');
