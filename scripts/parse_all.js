// parse_all.js — 并发解析全部定额册
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const NODE = process.execPath;
const ROOT = path.resolve(__dirname, '..');
const RAW = path.join(ROOT, 'data', 'raw');
const PROC = path.join(ROOT, 'data', 'processed');
const PARSER = path.join(ROOT, 'scripts', 'parse_hubei_pdf.js');
const BOOKS = [
  ['湖北省房屋建筑与装饰工程消耗量定额及全费用基价表（结构·屋面）（2024）.pdf', '房建装饰_结构屋面'],
  ['02市政第二册.pdf', '市政第二册'], ['03市政第三册.pdf', '市政第三册'], ['04市政第四册.pdf', '市政第四册'],
  ['05市政第五册.pdf', '市政第五册'], ['06市政第六册.pdf', '市政第六册'], ['07市政第七册.pdf', '市政第七册'],
  ['08市政第八册.pdf', '市政第八册'], ['09市政第九册.pdf', '市政第九册'], ['10市政第十册.pdf', '市政第十册'],
  ['11市政第十一册.pdf', '市政第十一册'],
  ['安装第一册.pdf', '安装第一册'], ['安装第二册.pdf', '安装第二册'], ['安装第三册.pdf', '安装第三册'],
  ['安装第四册.pdf', '安装第四册'], ['安装第五册.pdf', '安装第五册'], ['安装第六册.pdf', '安装第六册'],
  ['安装第七册.pdf', '安装第七册'], ['安装第八册.pdf', '安装第八册'], ['安装第九册.pdf', '安装第九册'],
  ['安装第十册.pdf', '安装第十册'], ['安装第十一册.pdf', '安装第十一册'], ['安装第十二册.pdf', '安装第十二册'],
  ['湖北省园林绿化工程消耗量定额及全费用基价表（2024）.pdf', '园林绿化'],
  ['湖北省建设工程公共专业消耗量定额及全费用基价表（2024）.pdf', '公共专业'],
  ['湖北省房屋建筑与装饰工程消耗量定额及全费用基价表（装饰·措施）（2024）.pdf', '房建装饰_装饰措施'],
  ['湖北省海绵城市工程消耗量定额及全费用基价表（2024）.pdf', '海绵城市'],
  ['湖北省装配式内装修工程消耗量定额及全费用基价表（2024）.pdf', '装配式内装修'],
  ['湖北省装配式建筑工程消耗量定额及全费用基价表（2024）.pdf', '装配式建筑'],
];
const queue = BOOKS.filter(([f, s]) => !fs.existsSync(path.join(PROC, 'hb2024_' + s + '.json')));
let running = 0, done = 0;
const t0 = Date.now();
function next() {
  while (running < 6 && queue.length) {
    const [f, s] = queue.shift();
    running++;
    const out = path.join(PROC, 'hb2024_' + s + '.json');
    const p = spawn(NODE, [PARSER, path.join(RAW, f), out], { stdio: ['ignore', 'pipe', 'pipe'] });
    let tail = '';
    p.stdout.on('data', d => { tail = d.toString(); });
    p.on('close', code => {
      running--; done++;
      console.log(`[${done}/${BOOKS.length}] ${s} exit=${code} ${tail.trim().split('\n').pop()}`);
      next();
    });
  }
  if (!running && !queue.length) console.log('ALL DONE in', ((Date.now() - t0) / 1000).toFixed(0), 's');
}
next();
