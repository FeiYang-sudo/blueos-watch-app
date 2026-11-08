#!/usr/bin/env node
/* 从 index.ux 跑出真实标签坐标，写成 JSON 供 HTML 预览使用
   （保证截图 = 待打包代码的计算结果，而不是另一份复刻实现） */
const fs = require('fs');
const src = fs.readFileSync('/root/blueos/projects/wheel/src/pages/Home/index.ux', 'utf8');
let js = src.match(/<script>([\s\S]*?)<\/script>/)[1];
js = js.slice(js.indexOf('/* ---------- 常量 ---------- */'), js.indexOf('export default {'));
const mod = { exports: {} };
new Function('module', 'exports', js + 'module.exports={makeSectors,W_R,W_CY,R_R,R_CY,RT_K,RIM_K,HUB_SAFE};')(mod, mod.exports);
const S = mod.exports;

const SETS = {
  4: ['1楼', '2楼', '3楼', '老餐厅'],
  6: ['火锅', '烧烤', '面条', '饺子', '米饭', '沙拉'],
  8: ['火锅', '烧烤', '面条', '饺子', '米饭', '沙拉', '汉堡', '随便'],
  9: ['火锅', '烧烤', '面条', '饺子', '随便', '爬山', '看电影', '逛街', '睡觉'],
  12: ['火锅', '烧烤', '面条', '饺子', '米饭', '沙拉', '汉堡', '随便', '夜宵', '小龙虾', '炒饭', '不吃了'],
};
const out = {};
for (const n of Object.keys(SETS)) {
  const items = SETS[n].map(v => ({ n: v, c: '#fff' }));
  out[n] = {
    wheel: S.makeSectors(items, S.W_R, S.W_CY, -1, 0, S.HUB_SAFE),
    result: S.makeSectors(items, S.R_R, S.R_CY, 3, 0, 0),
    cy: S.W_CY, rcy: S.R_CY, r: S.W_R, rr: S.R_R,
    rt: +(S.W_R * S.RT_K).toFixed(2), rim: +(S.W_R * S.RIM_K).toFixed(2), hub: S.HUB_SAFE,
  };
}
fs.mkdirSync('/tmp/wheel_prev', { recursive: true });
fs.writeFileSync('/tmp/wheel_prev/geom.json', JSON.stringify(out, null, 1));
console.log('geom.json 写好：', Object.keys(out).map(k => `n=${k} 标签${out[k].wheel.length} 字号${out[k].wheel[0].fs}`).join(', '));
