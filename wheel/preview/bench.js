#!/usr/bin/env node
/* 性能自检：makeSectors 在缓存命中时的单次耗时（要求 < 2ms）
   直接从 src/pages/Home/index.ux 取真实实现，不是复刻 */
const fs = require('fs');
const src = fs.readFileSync('/root/blueos/projects/wheel/src/pages/Home/index.ux', 'utf8');
let js = src.match(/<script>([\s\S]*?)<\/script>/)[1];
js = js.slice(js.indexOf('/* ---------- 常量 ---------- */'), js.indexOf('export default {'));

// 模块桩（storage/prompt/vibrator 在常量段之后可能被引用，给个空壳）
const mod = { exports: {} };
new Function('module', 'exports', 'storage', 'prompt', 'vibrator', 'BUNDLE',
  js + '\nmodule.exports={makeSectors,pickSizes,SIZE_CACHE,LAYOUT_CACHE,W_R,W_CY,R_R,R_CY,RT_K,RIM_K,HUB_SAFE};'
)(mod, mod.exports, {}, { showToast() {} }, {}, { lists: [] });
const S = mod.exports;

const SETS = {
  4: ['1楼', '2楼', '3楼', '老餐厅'],
  6: ['火锅', '烧烤', '面条', '饺子', '米饭', '沙拉'],
  8: ['火锅', '烧烤', '面条', '饺子', '米饭', '沙拉', '汉堡', '随便'],
  12: ['火锅', '烧烤', '面条', '饺子', '米饭', '沙拉', '汉堡', '随便', '夜宵', '小龙虾', '炒饭', '不吃了'],
};

function bench(label, fn, iters) {
  for (let i = 0; i < 200; i++) fn(i);          // 预热（首帧含搜索）
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < iters; i++) fn(i);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const per = ms / iters;
  console.log(`  ${label.padEnd(34)} ${per.toFixed(4)} ms/次   (${iters} 次共 ${ms.toFixed(1)} ms)`);
  return per;
}

let worst = 0;
console.log('== 首次调用（缓存未命中，含尺寸搜索）==');
for (const n of Object.keys(SETS)) {
  const items = SETS[n].map(v => ({ n: v, c: '#fff' }));
  S.SIZE_CACHE = {}; S.LAYOUT_CACHE = {};   // 清空，模拟冷启动
  const t0 = process.hrtime.bigint();
  S.makeSectors(items, S.W_R, S.W_CY, -1, 0, S.HUB_SAFE);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  console.log(`  n=${n}  冷启动一次 ${ms.toFixed(3)} ms`);
}

console.log('\n== 缓存命中（= 动画每帧的真实开销）==');
for (const n of Object.keys(SETS)) {
  const items = SETS[n].map(v => ({ n: v, c: '#fff' }));
  S.makeSectors(items, S.W_R, S.W_CY, -1, 0, S.HUB_SAFE);   // 填缓存
  const per = bench(`n=${n} 转盘 makeSectors`, i => S.makeSectors(items, S.W_R, S.W_CY, -1, i * 0.7, S.HUB_SAFE), 20000);
  if (per > worst) worst = per;
}
for (const n of Object.keys(SETS)) {
  const items = SETS[n].map(v => ({ n: v, c: '#fff' }));
  S.makeSectors(items, S.R_R, S.R_CY, 0, 0, 0);
  const per = bench(`n=${n} 结果页 makeSectors`, i => S.makeSectors(items, S.R_R, S.R_CY, 0, i * 0.7, 0), 20000);
  if (per > worst) worst = per;
}

console.log(`\n最慢一档（缓存命中）= ${worst.toFixed(4)} ms`);
console.log('判定:', worst < 2 ? 'PASS (< 2ms，手表上有余量)' : 'FAIL (>= 2ms)');
process.exit(worst < 2 ? 0 : 1);
