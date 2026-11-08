#!/usr/bin/env node
/* preview/test_edit.js —— v1.4.0 表上编辑全流程断言
 *
 * 用**编译产物**（build/watch-round/pages/Home/index.js）真跑，不是复刻逻辑。
 * 流程：添加 3 项 → 已存在置灰 → 删除 1 项 → 上移 1 项（含首项循环）→ 切列表
 *       → 恢复导入数据 → 上限/下限 → 存储优先 / 旧数据迁移
 * 每一步都断言：items 数组内容、本地存储写入、项目数 2 ≤ n ≤ 12、
 *              以及预设页芯片四角都在圆屏内（R=233，表是圆的）。
 */
const fs = require('fs')

const PAGE = '/root/blueos/projects/wheel/build/watch-round/pages/Home/index.js'
let src = fs.readFileSync(PAGE, 'utf8')
const cut = src.indexOf('$app_define$')
if (cut < 0) throw new Error('编译产物里找不到 $app_define$')
const idm = src.slice(0, cut).match(/\$app_script\$(\d+)/)
if (!idm) throw new Error('编译产物里找不到 $app_script$ 入口')
src = src.slice(0, cut) + '\nreturn $app_script$' + idm[1] + ';\n'

/* ---------- 断言器 ---------- */
let pass = 0
const fails = []
function ok(name, cond, extra) {
  if (cond) { pass++; return true }
  fails.push(name + (extra === undefined ? '' : '  << ' + extra))
  return false
}
function eqArr(name, actual, expect) {
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expect)
  return ok(name, a === b, '实际 ' + a + ' 期望 ' + b)
}
function range(name, vm) {
  const n = (vm.items || []).length
  return ok(name + ' · 项目数 ' + n + ' ∈[2,12]', n >= 2 && n <= 12)
}
function names(vm) { return (vm.items || []).map(it => it.n) }
const R_SCREEN = 233        // 圆屏半径（466/2）
const CXX = 233, CYY = 233

/* ---------- 用编译产物造一个 vm（每个 vm 一个独立 store） ---------- */
function boot(store) {
  const storage = {
    getSync: (k) => (k in store ? store[k] : null),
    setSync: (k, v) => { store[k] = v },
    get: ({ key }) => ({ data: store[key] === undefined ? null : store[key] }),
    set: ({ key, value }) => { store[key] = value }
  }
  const prompt = { showToast() {} }
  const vibrator = { vibrate() {} }
  const fn = new Function('$app_require$', 'console', src)
  const vmDef = fn(function (name) {
    if (name === '@app-module/system.storage') return storage
    if (name === '@app-module/system.prompt') return prompt
    if (name === '@app-module/system.vibrator') return vibrator
    throw new Error('UNKNOWN MODULE: ' + name)
  }, { log() {}, warn() {}, error() {}, info() {} })

  const vm = Object.assign({}, vmDef.data())
  for (const k of Object.keys(vmDef)) if (typeof vmDef[k] === 'function') vm[k] = vmDef[k].bind(vm)
  vm.$set = function (k, v) { this[k] = v }
  vm.onInit()
  return vm
}
function storedList(store, i) {
  const raw = store['wheel_lists']
  if (!raw) return null
  const lists = JSON.parse(raw)
  return lists[i] || null
}
function chipIndex(vm, word) {
  const chips = vm.presetChips || []
  for (let i = 0; i < chips.length; i++) if (chips[i].n === word) return i
  return -1
}

/* ================= 1. 首次启动：csv 生成物铺进存储 ================= */
console.log('== 1. 首次启动（存储空 -> 用 csv 生成物） ==')
const store = {}
const vm = boot(store)
eqArr('items 来自 items.csv', names(vm), ['1楼', '2楼', '3楼', '老餐厅'])
ok('listName = 去哪吃', vm.listName === '去哪吃', vm.listName)
ok('view = wheel', vm.view === 'wheel', vm.view)
ok('errText 为空', vm.errText === '', vm.errText)
eqArr('存储 wheel_lists 已写入', JSON.parse(store['wheel_lists'])[0].items, ['1楼', '2楼', '3楼', '老餐厅'])
ok('存储 wheel_items 已写入', JSON.parse(store['wheel_items']).length === 4, store['wheel_items'])
ok('存储 wheel_current_list = 0', store['wheel_current_list'] === 0 || store['wheel_current_list'] === '0')
ok('存储 wheel_src_sig 已写入', typeof store['wheel_src_sig'] === 'string' && store['wheel_src_sig'].length > 0)
range('启动后', vm)

/* ================= 2. 从预设词库添加 3 项 ================= */
console.log('== 2. 从预设词库添加：火锅 / 烧烤 / 面条 ==')
vm.toEdit()
ok('进编辑页', vm.view === 'edit', vm.view)
vm.toAdd()
ok('进词库页', vm.view === 'add', vm.view)
eqArr('3 个分组', (vm.presetTabs || []).map(t => t.n), ['吃啥', '去哪', '干啥'])
ok('吃啥组 10 个词', vm.presetChips.length === 10, vm.presetChips.length)
ok('词都在 2–3 字', vm.presetChips.every(c => c.n.length >= 1 && c.n.length <= 3))
ok('当前组高亮在「吃啥」', vm.presetTabs[0].bg === '#FFD93D' && vm.presetTabs[1].bg !== '#FFD93D')

// 芯片四角必须在圆屏内（表是圆的，越界就被表框切掉）
let outside = []
for (const c of vm.presetChips) {
  for (const [x, y] of [[c.x, c.y], [c.x + c.w, c.y], [c.x, c.y + c.h], [c.x + c.w, c.y + c.h]]) {
    const r = Math.hypot(x - CXX, y - CYY)
    if (r > R_SCREEN) outside.push(c.n + '@' + Math.round(r))
  }
}
ok('预设芯片四角都在圆屏内（R=233）', outside.length === 0, outside.join(','))

const added = []
for (const w of ['火锅', '烧烤', '面条']) {
  const idx = chipIndex(vm, w)
  ok('词库里找到 ' + w, idx >= 0)
  vm.addPreset(idx)
  added.push(w)
  ok('加入后回编辑页', vm.view === 'edit', vm.view)
}
eqArr('添加 3 项后 items', names(vm), ['1楼', '2楼', '3楼', '老餐厅'].concat(added))
eqArr('添加 3 项后存储', storedList(store, 0).items, names(vm))
ok('添加后条数 7', vm.items.length === 7, vm.items.length)
range('添加后', vm)

/* ================= 3. 已存在的词置灰、不可重复添加 ================= */
console.log('== 3. 已存在的词置灰（不可重复添加） ==')
vm.toAdd()
const cHot = vm.presetChips[chipIndex(vm, '火锅')]
ok('火锅已置灰 on=0', cHot.on === 0, JSON.stringify(cHot))
ok('未添加的饺子仍可点 on=1', vm.presetChips[chipIndex(vm, '饺子')].on === 1)
ok('吃啥组里 3 个已置灰', vm.presetChips.filter(c => c.on === 0).length === 3,
  vm.presetChips.filter(c => c.on === 0).map(c => c.n).join(','))
vm.addPreset(chipIndex(vm, '火锅'))
ok('重复添加被拒（仍 7 项）', vm.items.length === 7, vm.items.length)
ok('重复添加被拒后仍在词库页', vm.view === 'add', vm.view)

/* 分组切换 */
vm.setGroup(1)
ok('切到「去哪」组', vm.addGroup === 1)
ok('去哪组 8 个词', vm.presetChips.length === 8, vm.presetChips.length)
ok('去哪组标签高亮', vm.presetTabs[1].bg === '#FFD93D' && vm.presetTabs[0].bg !== '#FFD93D')
vm.setGroup(2)
ok('干啥组 8 个词', vm.presetChips.length === 8, vm.presetChips.length)
vm.setGroup(0)
ok('切回吃啥组仍 10 个词', vm.presetChips.length === 10)
vm.backFromAdd()
ok('返回编辑页', vm.view === 'edit', vm.view)
eqArr('切组不改 items', names(vm), ['1楼', '2楼', '3楼', '老餐厅', '火锅', '烧烤', '面条'])

/* ================= 4. 删除 1 项 ================= */
console.log('== 4. 删除第 1 项（1楼） ==')
vm.delItem(0)
eqArr('删除后 items', names(vm), ['2楼', '3楼', '老餐厅', '火锅', '烧烤', '面条'])
eqArr('删除后存储', storedList(store, 0).items, names(vm))
ok('删除后条数 6', vm.items.length === 6)
range('删除后', vm)

/* ================= 5. 上移 1 项（含首项循环） ================= */
console.log('== 5. 上移：moveUp(2) 与首位循环 moveUp(0) ==')
vm.moveUp(2)                       // 老餐厅 -> 第 2 位
eqArr('上移 1 位后 items', names(vm), ['2楼', '老餐厅', '3楼', '火锅', '烧烤', '面条'])
eqArr('上移后存储', storedList(store, 0).items, names(vm))
vm.moveUp(0)                       // 首项循环到最后
eqArr('首位上移 -> 循环到末尾', names(vm), ['老餐厅', '3楼', '火锅', '烧烤', '面条', '2楼'])
eqArr('循环后存储', storedList(store, 0).items, names(vm))
ok('上移不改变条数', vm.items.length === 6)
range('上移后', vm)

/* ================= 6. 多列表切换（只影响当前列表） ================= */
console.log('== 6. 切列表（第二张表注入后切换） ==')
vm.lists.push({ name: '周末', items: ['爬山', '看电影', '睡觉'], trunc: 0 })
vm.persist()
const before0 = storedList(store, 0).items.slice()
vm.nextList()
ok('切到第 2 张列表', vm.listIdx === 1, vm.listIdx)
ok('listName = 周末', vm.listName === '周末', vm.listName)
eqArr('第 2 张表 items', names(vm), ['爬山', '看电影', '睡觉'])
ok('存储当前下标 = 1', String(store['wheel_current_list']) === '1', store['wheel_current_list'])

vm.toAdd()
vm.setGroup(1)                     // 去哪
vm.addPreset(chipIndex(vm, '食堂'))
eqArr('第 2 张表加了食堂', names(vm), ['爬山', '看电影', '睡觉', '食堂'])
eqArr('第 2 张表存储', storedList(store, 1).items, ['爬山', '看电影', '睡觉', '食堂'])
eqArr('第 1 张表未被牵连', storedList(store, 0).items, before0)
range('第 2 张表', vm)

vm.prevList()
ok('切回第 1 张列表', vm.listIdx === 0, vm.listIdx)
eqArr('第 1 张表 items 原样', names(vm), before0)
ok('存储当前下标回 0', String(store['wheel_current_list']) === '0', store['wheel_current_list'])

/* ================= 7. 恢复导入数据（当前列表 -> csv 原始内容） ================= */
console.log('== 7. 恢复导入数据（两次确认） ==')
const beforeRst = storedList(store, 0).items.slice()
vm.resetItems()                        // 第一次只提示，不动数据
eqArr('第一次点恢复不改数据', names(vm), beforeRst)
eqArr('第一次点恢复不改存储', storedList(store, 0).items, beforeRst)
ok('第一次点恢复给出确认提示', /再点一次/.test(vm.phoneMsg), vm.phoneMsg)
vm.resetItems()                        // 第二次真恢复
eqArr('恢复后 items = csv 原内容', names(vm), ['1楼', '2楼', '3楼', '老餐厅'])
eqArr('恢复后存储', storedList(store, 0).items, ['1楼', '2楼', '3楼', '老餐厅'])
ok('恢复后 listName 不变', vm.listName === '去哪吃', vm.listName)
eqArr('第 2 张表没被恢复动作影响', storedList(store, 1).items, ['爬山', '看电影', '睡觉', '食堂'])
range('恢复后', vm)

/* ================= 8. 下限 2 / 上限 12 ================= */
console.log('== 8. 边界：最少 2 项 / 最多 12 项 ==')
vm.delItem(0); vm.delItem(0)
eqArr('删到 2 项', names(vm), ['3楼', '老餐厅'])
vm.delItem(0)
ok('已 2 项时删除被拒', vm.items.length === 2, vm.items.length)
ok('拒绝时给出提示', /至少保留 2 个/.test(vm.phoneMsg), vm.phoneMsg)
eqArr('存储仍是 2 项', storedList(store, 0).items, ['3楼', '老餐厅'])

// 从 2 项加满到 12
vm.resetItems(); vm.resetItems()        // 恢复需两次确认
for (const w of ['火锅', '烧烤', '面条', '饺子', '米饭', '麻辣烫', '汉堡', '沙拉']) {
  vm.toAdd()
  vm.setGroup(0)                     // 上一节切到过「去哪」，这里回到「吃啥」
  const i = chipIndex(vm, w)
  ok('加满过程中找到 ' + w, i >= 0)
  vm.addPreset(i)
}
ok('加满 12 项', vm.items.length === 12, vm.items.length)
eqArr('12 项存储', storedList(store, 0).items, names(vm))
vm.toEdit()
vm.toAdd()
ok('满 12 项进不了词库页', vm.view === 'edit', vm.view)
ok('满 12 项有提示', /已有 12 项/.test(vm.phoneMsg), vm.phoneMsg)
ok('满 12 项时 items 未变', vm.items.length === 12)
range('满额', vm)

/* ================= 9. 本地存储优先（v1.4.0 关键改动） ================= */
console.log('== 9. 存储优先：csv 指纹变了也不覆盖表上修改 ==')
const store9 = {}
JSON.parse('[]')
store9['wheel_lists'] = JSON.stringify([{ name: '去哪吃', items: ['表上改的A', '表上改的B'], trunc: 0 }])
store9['wheel_items'] = JSON.stringify(['表上改的A', '表上改的B'])
store9['wheel_current_list'] = 0
store9['wheel_src_sig'] = 'OLD_SIG_FROM_1_3_1'      // 故意和当前 csv 指纹不一致
const vm9 = boot(store9)
eqArr('指纹过期但沿用存储', names(vm9), ['表上改的A', '表上改的B'])
ok('数据源更新只做提示', /数据源已更新/.test(vm9.srcLabel), vm9.srcLabel)
ok('未被 csv 覆盖', names(vm9).indexOf('1楼') < 0)

/* ================= 10. v1.2 旧键迁移 ================= */
console.log('== 10. 只有 wheel_items 的老数据 -> 迁移成单列表 ==')
const store10 = { 'wheel_items': JSON.stringify(['老1', '老2', '老3']) }
const vm10 = boot(store10)
eqArr('迁移出 3 项', names(vm10), ['老1', '老2', '老3'])
ok('迁移后写了 wheel_lists', !!store10['wheel_lists'], store10['wheel_lists'])
eqArr('迁移后存储一致', JSON.parse(store10['wheel_lists'])[0].items, ['老1', '老2', '老3'])

/* ================= 11. 重读数据源 ================= */
console.log('== 11. 重读数据源（csv 覆盖表上修改） ==')
vm.syncPhone()
eqArr('重读后回到 csv 内容', names(vm), ['1楼', '2楼', '3楼', '老餐厅'])
ok('重读后清掉「数据源已更新」标记', !/数据源已更新/.test(vm.srcLabel), vm.srcLabel)
eqArr('重读后存储', storedList(store, 0).items, ['1楼', '2楼', '3楼', '老餐厅'])
ok('重读后只有 1 张表（csv 只有 1 张）', vm.lists.length === 1, vm.lists.length)

/* ---------- 结果 ---------- */
console.log('\n断言通过 ' + pass + ' 条，失败 ' + fails.length + ' 条')
if (fails.length) {
  console.log('!! 失败项：')
  fails.forEach(f => console.log('   - ' + f))
  console.log('\n结果: FAIL')
  process.exit(1)
}
console.log('结果: ALL PASS —— 添加/置灰/删除/上移/切列表/恢复/上下限/存储优先/迁移 全流程正确')
process.exit(0)
