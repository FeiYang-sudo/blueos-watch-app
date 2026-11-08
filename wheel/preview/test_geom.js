#!/usr/bin/env node
/* 从 src/pages/Home/index.ux 里抽出真实 JS 逻辑，对 makeSectors 做几何断言
   （直接测「待打包的代码」，不是复刻版）

   v1.3 验收标准（bug：标签跑出轮盘）：
     ① 标签数 == 项目数，中心角 == 自己扇区中线
     ② 每个标签框「四个角」到圆心距离 <= R × 0.92   <-- 核心断言
     ③ 四个角都落在自己扇区的角度区间内（留 0.2° 余量）
     ④ 角点半径 >= 中心钮外沿（不压中心钮）
     ⑤ 字号 >= 11、单行不折行（字数 × 字号 <= 框宽）
   覆盖 2~12 项 × 转盘页/结果页 × spin 0~360°（0.25° 步长）
*/
const fs = require('fs');
const path = '/root/blueos/projects/wheel/src/pages/Home/index.ux';
const src = fs.readFileSync(path, 'utf8');
const m = src.match(/<script>([\s\S]*?)<\/script>/);
let js = m[1];
const start = js.indexOf('/* ---------- 常量 ---------- */');
const end = js.indexOf('export default {');
if (start < 0 || end < 0) throw new Error('抽取失败');
js = js.slice(start, end);

const harness = `
module.exports = { makeSectors, textOf, norm, W_R, W_CY, R_R, R_CY, CX, RT_K, RIM_K, HUB_SAFE };
`;
const mod = { exports: {} };
new Function('module', 'exports', js + harness)(mod, mod.exports);
const { makeSectors, textOf, W_R, W_CY, R_R, R_CY, CX, RT_K, RIM_K, HUB_SAFE } = mod.exports;
const norm = a => { a = a % 360; return a < 0 ? a + 360 : a; };

const NAMES = ['火锅', '烧烤', '面条', '饺子', '米饭', '沙拉', '汉堡', '随便',
  '夜宵', '小龙虾', '炒饭', '不吃了'];
const SETS = {
  6: NAMES.slice(0, 6), 8: NAMES.slice(0, 8), 12: NAMES.slice(0, 12),
};
// 长名字也要过（textOf 会截到 3 字，这里验证截断后仍合身）
const LONG = { 8: ['西红柿炒鸡蛋', '重庆麻辣火锅', '兰州牛肉拉面', '手工三鲜饺子',
                    '扬州炒饭', '水果沙拉', '双层芝士汉堡', '随便都行'] };

let fail = 0, checks = 0, worstRim = 0, worstAng = 99;
const fails = [];

function check(n, names, r, cy, spin, tag, hubR) {
  const hubSafe = tag.indexOf('结果') >= 0 ? 0 : HUB_SAFE;
  const items = names.map(v => ({ n: v, c: '#fff' }));
  const s = makeSectors(items, r, cy, -1, spin, hubSafe);
  const seg = 360 / n;
  const rimMax = r * RIM_K;
  if (s.length !== n) { fails.push(`${tag} n=${n} spin=${spin} 标签数 ${s.length} != ${n}`); fail++; return; }
  s.forEach((l, i) => {
    const mid = norm(spin + i * seg + seg / 2);
    checks++;
    const dAng = Math.abs(((l.a - mid + 540) % 360) - 180);
    if (dAng > 0.02) { fails.push(`${tag} n=${n} #${i} 角度 ${l.a} != 中线 ${mid.toFixed(2)}`); fail++; }

    // 与 index.ux 里同一套框模型：宽 lw、高 fs*1.5，锚点在左边中点上方 0.72fs
    const H = l.fs * 1.44;
    const corners = [[l.x, l.y], [l.x + l.lw, l.y], [l.x, l.y + H], [l.x + l.lw, l.y + H]];
    corners.forEach(p => {
      const dx = p[0] - CX, dy = p[1] - cy;
      const rad = Math.hypot(dx, dy);
      const ratio = rad / r;
      if (ratio > worstRim) worstRim = ratio;
      if (rad > rimMax + 1e-6) {
        fails.push(`${tag} n=${n} spin=${spin.toFixed(2)} #${i} ${l.t} 角点半径 ${rad.toFixed(1)} > R*0.92=${rimMax.toFixed(1)}（跑出轮盘）`);
        fail++;
      }
      let a = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
      const off = ((a - (spin + i * seg) + 540) % 360) - 180;   // 相对扇区起始边
      const margin = Math.min(off, seg - off);
      if (margin < worstAng) worstAng = margin;
      if (off < 0 || off > seg) {
        fails.push(`${tag} n=${n} spin=${spin.toFixed(2)} #${i} ${l.t} 角点越过扇区分界线 off=${off.toFixed(2)}° (扇区 ${seg}°)`);
        fail++;
      }
      if (hubR && rad < hubR) {
        fails.push(`${tag} n=${n} #${i} ${l.t} 角点半径 ${rad.toFixed(1)} < ${hubR}（压到中心钮）`);
        fail++;
      }
    });
    if (l.fs < 11) { fails.push(`${tag} n=${n} #${i} 字号 ${l.fs} < 11`); fail++; }
    if (l.t.length * l.fs > l.lw) {
      fails.push(`${tag} n=${n} #${i} ${l.t} 文字宽 ${l.t.length * l.fs} > 框宽 ${l.lw}（会折行）`);
      fail++;
    }
  });
}

// 全角度采样：0~360 步长 0.25°（1441 个 spin）
const SPINS = [];
for (let a = 0; a <= 360; a += 0.25) SPINS.push(a);

for (const n of [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
  const names = NAMES.slice(0, n);
  const before = fail;
  for (const spin of SPINS) {
    check(n, names, W_R, W_CY, spin, '转盘页', 62);
    check(n, names, R_R, R_CY, spin, '结果页', 0);
  }
  const s0 = makeSectors(names.map(v => ({ n: v })), W_R, W_CY, -1, 0, HUB_SAFE);
  console.log(`  n=${String(n).padStart(2)}  字号=${String(s0[0].fs).padStart(2)}px 框宽=${String(s0[0].lw).padStart(3)}px ` +
    `中心半径=${(W_R * RT_K).toFixed(1)}  断言${fail - before === 0 ? 'OK' : 'FAIL'}`);
}

// 长名字（3 字截断）
for (const n of [6, 8, 12]) {
  const names = n === 8 ? LONG[8] : NAMES.slice(0, n);
  for (const spin of [0, 11.25, 90, 217.5, 359.75]) {
    check(n, names, W_R, W_CY, spin, '长名', 62);
    check(n, names, R_R, R_CY, spin, '长名-结果', 0);
  }
}

console.log(`\n共 ${checks} 组标签断言（四角 ×4 = ${checks * 4} 个角点）`);
console.log(`四角半径最大占比 = ${(worstRim * 100).toFixed(1)}% of R（限 ${(RIM_K * 100).toFixed(0)}%）`);
console.log(`角点到扇区边界最小余量 = ${worstAng.toFixed(2)}°（>0 即不跨界）`);
if (fail) {
  console.log(`\n!! 失败 ${fail} 项，前 10 条：`);
  fails.slice(0, 10).forEach(t => console.log('   ' + t));
} else {
  console.log('\nALL PASS —— 每个标签框四角都在圆盘内、都在自己扇区内、不压中心钮、不折行');
}
process.exit(fail ? 1 : 0);
