# 在 Linux 上构建蓝河手表应用（工具链获取）

BlueOS Studio 官方只有 **macOS / Windows** 版，但它内部是 **纯 Node 工具链**，
并且 `blueos-pack` 里自带 **Linux x86-64 原生二进制**（vivo 自己的 CI 也是 Linux）。
把 macOS 版 dmg 掏出来，就能在 Linux 上完整出包。以下是实测可用的方法。

## 1. 下载安装包

Windows 版（`.zip`/自解压壳）**掏不出内层**，用 macOS 版 dmg：

```bash
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36"
curl -L -A "$UA" -e "https://studio.blueos.com.cn/install" \
  -o blueos-m1.dmg \
  "https://ide-extensionstatic.vivo.com.cn/ide-extension/blue-os-studio-m1-2.2.1.dmg"
# 直链有防盗链，必须带 Referer + UA；约 876MB
```

## 2. 用 7z 精准抽取（dmg 对 7z 可直接读）

```bash
# ① 通用快应用工具链（build / release / resign，v1.9.14）
7z x blueos-m1.dmg "*/app/extensions/node_modules/*" -otk

# ② 蓝河专用打包器（v1.0.12-beta.13，与官方成品包内版本号一致）
7z x blueos-m1.dmg "*/extensions/blueos-debugger/node_modules/blueos-pack/*" -obp

# ③ 语言服务里的 API 清单（写代码时查"能调什么"最权威）
7z x blueos-m1.dmg "*/extensions/blueos-language-features/*" -olf
```

关键路径：

| 工具 | 路径 |
|---|---|
| 通用工具链 | `tk/.../extensions/node_modules/hap-toolkit`（`node bin/index.js`）|
| 蓝河打包器 | `bp/.../node_modules/blueos-pack`（CLI 名 `jax`）|
| Linux 原生二进制 | `blueos-pack/dist/linux/`：`RpkUnion`（union 打包）、`vugfactor`、`aapt`、`jerry`、`quickjs-snapshot` 等 |
| API 清单 | `.../blue-os-language/dist/api/featureApi.js`（全部模块与方法）|

## 3. 补齐缺的开发期依赖（CLI 只 import 了没打包进去的两个）

```bash
cd .../blueos-pack
# bin/index.js 里 import 'trace-unhandled/register.js' 和 commander/chalk
mkdir -p node_modules/trace-unhandled && echo '{"name":"trace-unhandled","version":"2.0.0","main":"register.js"}' > node_modules/trace-unhandled/package.json
echo 'module.exports={}' > node_modules/trace-unhandled/register.js
npm i --no-audit --no-fund --registry=https://registry.npmmirror.com commander chalk
node bin/index.js --help      # 出现 init / build / release / watch / preview 即成功
```

## 4. 封装成两个命令

```bash
cat > /root/blueos/bin/jax <<'EOF'
#!/usr/bin/env bash
exec node "/root/blueos/bp/BlueOS Studio Installer/BlueOS Studio.app/Contents/Resources/app/extensions/blueos-debugger/node_modules/blueos-pack/bin/index.js" "$@"
EOF
cat > /root/blueos/bin/hap <<'EOF'
#!/usr/bin/env bash
exec node "/root/blueos/tk/BlueOS Studio Installer/BlueOS Studio.app/Contents/Resources/app/extensions/node_modules/hap-toolkit/bin/index.js" "$@"
EOF
chmod +x /root/blueos/bin/*
```

## 5. 出包

```bash
cd app
jax build      # debug 包（用内置签名，无需证书）→ dist/watch-round/debug/*.rpk
jax release    # release 包（需 sign/release/private.pem + certificate.pem，可 openssl 自签）
jax watch      # 监听变更
```

`jax build` 输出的目录结构（`dist/watch-round/debug/`）与官方 IDE 完全一致。

## 6. 工程最小结构

```
manifest.json      package / name / icon / versionCode / deviceTypeList / config.designWidth /
                   features（用接口必须先声明）/ permissions / router
src/pages/Home/index.ux   模板 <template> + 样式 <style> + 脚本 <script>
```
