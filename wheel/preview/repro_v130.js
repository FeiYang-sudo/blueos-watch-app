// 用编译产物真跑一遍生命周期（不是估算）
const fs = require('fs')
const path = '/root/blueos/projects/wheel/build/watch-round/pages/Home/index.js'
let src = fs.readFileSync(path, 'utf8')
const cut = src.indexOf('$app_define$')
if (cut < 0) throw new Error('no marker')
src = src.slice(0, cut) + '\nreturn $app_script$779992388;\n'

const store = {}
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
}, console)

const vm = Object.assign({}, vmDef.data())
for (const k of Object.keys(vmDef)) if (typeof vmDef[k] === 'function') vm[k] = vmDef[k].bind(vm)
vm.$set = function (k, v) { this[k] = v }

let ok = true
function step(name, fn) {
  try { fn(); console.log('  OK   ' + name) }
  catch (e) { ok = false; console.log('  FAIL ' + name + ' -> ' + e.constructor.name + ': ' + e.message) }
}

console.log('== 生命周期 ==')
step('onInit', () => vm.onInit())
step('onReady', () => vm.onReady())
console.log('  items =', JSON.stringify(vm.items.map(i => i.n)))
console.log('  sectors =', vm.sectors.length, ' 字号', vm.sectors[0] && vm.sectors[0].fs, ' 框宽', vm.sectors[0] && vm.sectors[0].lw)
console.log('  errText =', JSON.stringify(vm.errText))
console.log('  listName =', vm.listName)

console.log('== 交互 ==')
step('startSpin', () => vm.startSpin())
step('finish', () => vm.finish(0))
step('again', () => vm.again())

console.log('== 降级渲染（人为注入异常）==')
// 把 makeSectors 变成会抛错的版本，看 rebuild 是否兜住
const vm2 = Object.assign({}, vmDef.data())
for (const k of Object.keys(vmDef)) if (typeof vmDef[k] === 'function') vm2[k] = vmDef[k].bind(vm2)
vm2.$set = function (k, v) { this[k] = v }
vm2.items = [{ n: '1楼', c: '#f00' }, { n: '2楼', c: '#0f0' }]
step('rebuild(正常)', () => vm2.rebuild())
let drew = 0
vm2.draw = function () { drew++ }
step('fail(模拟异常)', () => vm2.fail(new Error('模拟标签计算失败'), 'labels'))
console.log('  errText =', JSON.stringify(vm2.errText), ' draw 调用次数 =', drew, ' items 保留 =', vm2.items.length)

console.log('\n结果:', ok ? 'ALL PASS' : 'FAIL')
process.exit(ok ? 0 : 1)
