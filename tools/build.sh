#!/usr/bin/env bash
# 在 Linux 上用官方私有工具链出「蓝河手表包」
# 前置：按 tools/TOOLCHAIN.md 从 BlueOS Studio (macOS dmg) 掏出工具链
set -e
JAX="${JAX:-/root/blueos/bin/jax}"      # 指向掏出的 blueos-pack CLI
PROJ="${1:-$(cd "$(dirname "$0")/.." && pwd)/app}"
cd "$PROJ"
rm -rf dist

echo "== 语法预检（<script> 段） =="
python3 - <<'PY'
import re, subprocess, sys
src = open("src/pages/Home/index.ux", encoding="utf-8").read()
js = re.search(r"<script>(.*)</script>", src, re.S).group(1)
js = re.sub(r"^\s*import .*$", "", js, flags=re.M)
open("/tmp/_chk.js","w",encoding="utf-8").write(js)
sys.exit(subprocess.run(["node","--check","/tmp/_chk.js"]).returncode)
PY

echo "== 打包 =="
LOG=$(mktemp)
"$JAX" build 2>&1 | tee "$LOG"
# 关键：jax 编译报错也会出包，必须显式检查
if grep -qE "\[ERROR\]" "$LOG"; then echo "!! 编译有 ERROR，产物不可信"; exit 1; fi
find dist -name "*.rpk"
