# 开发过程中的实测记录（按版本）

> 每个版本的界面/结论都来自真机安装验证（iQOO WATCH GT / WA2456C / BlueOS 3.0）。

## v1.x —— 蓝牙信息探测

| 版本 | 做法 | 观察到什么 |
|---|---|---|
| v1.0 | 三页：本机（deviceInfo）/ 扫描（startDevicesDiscovery）/ 探针（逐接口实测）| 模块「已加载」、`startDevicesDiscovery` 存在且可调用；**`onDeviceFound` 不存在**；`getInfo()` 空调用返回 `undefined` |
| v1.1 | 四种枚举法（`Object.keys` / `getOwnPropertyNames` / 原型链 / `for...in`）+ 候选接口逐个实测 | 三个模块**枚举结果全为空**、无原型、无 `constructor` → 模块是**原生绑定对象**，只能按名字探 |
| v1.2 | 18 个候选接口名逐个真调用 + `$app_require$` 加载老模块 `system.bluetooth` | `getInfoSync()` 返回真实设备信息（`WA2456C` / BlueOS 3.0）；`getInfo({success})` 回调**永不返回** |
| v1.3 | 照抄社区成品应用（bluex）已验证的蓝牙写法：`start({interval:0,success,fail})` + 四种大小写回调属性赋值 + 12 秒自动停 | 启动/停止均 OK，**12 秒零回调** → 系统不回传扫描结果 |

## v2.x —— 转为「手表信息」

| 版本 | 做法 | 结果 |
|---|---|---|
| v2.0 | 改全动态 `$app_require$('@app-module/' + name)` 取模块 | ❌ 全部「模块加载失败」：**编译器只认字面量**，动态拼接的模块名不会被打进包 |
| v2.1 | 改回静态 import + 诊断页 | 3 / 9 恢复 |
| v2.2 | 9 个模块全部静态 import | ✅ **9 / 9 加载成功**；拿到电量 `{level:0.55,charging:false}`、亮度 `12`、6 个可订阅传感器 |
| v2.3 | 计步大数字 + 6 种订阅姿势 | 订阅回调零数据 |
| v2.4 | 计步 **7 种姿势**（success / callback / onChange / 位置参数 / onStepChange / health ×2）| **0 次数据** → 传感器数据流在本机型关闭 |

## v3.x —— 联网对照实验

| 版本 | 测试项 | 结果 |
|---|---|---|
| v3.0 | 三种 fetch 调用姿势（回调 / Promise / 传字符串）打本站 API | 全部无返回 |
| v3.1 | 增加手机链路查询（`blueos.bluexlink.connectionManager`）| 模块加载，但无可查询方法 |
| v3.2 | 4 个地址（百度 https/http、GitHub API、本站）| **只有 GitHub API 通** |
| v3.3 | 自建受控测试文件（15B/36B/100KB + 带 `%5B` 参数）| 本站仍全不通 |
| v3.4 | 9 项：加 `http` 明文、直连公网 IP | **只有 GitHub 两项通**；本站 https / http / 直连 IP 全部失败 → 结论：本机网络通路只对部分地址开放 |

## v4.x —— 完整版

| 版本 | 内容 |
|---|---|
| v4.0 | 四页完整版（信息 / 工具 / 能力 / 网络）+ 新应用图标（黑底金表盘）|
| v4.1 | 修 UI：电量卡从固定顶部改为列表首项，随列表滚动，不再遮挡下方信息 |

## 沉淀下来的经验（给别人省时间）

1. `jax build` **编译报错也照样出包** → 必须 grep `[ERROR]` + 预检 `<script>` 段。
2. 模块**必须静态 import**；动态拼接名字取不到。
3. 原生模块**不可枚举**（`Object.keys` 永远空）→ 只能 `k in obj` / `typeof obj[k]` 按名字探。
4. **回调式 API 在本机型全不回**；能用 Sync / 直接返回式就用。
5. 手表的网络是受限的：先用 `https://api.github.com/zen` 做基准，再测目标地址。
