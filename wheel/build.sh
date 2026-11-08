#!/usr/bin/env bash
# 在 Linux 上用官方私有工具链出「蓝河手表包」
set -e
JAX="${JAX:-/root/blueos/bin/jax}"
PROJ="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJ"

echo "== 同步项目表（assets/items.csv|txt -> src/common/items.generated.js） =="
python3 tools/import_csv.py

echo "== 语法预检（<script> 段） =="
python3 - <<'PY'
import re, subprocess, sys, glob
ok = True
for f in glob.glob("src/**/*.ux", recursive=True):
    src = open(f, encoding="utf-8").read()
    m = re.search(r"<script>(.*)</script>", src, re.S)
    if not m:
        continue
    js = re.sub(r"^\s*import .*$", "", m.group(1), flags=re.M)
    tmp = "/tmp/_chk_" + f.replace("/", "_") + ".js"
    open(tmp, "w", encoding="utf-8").write(js)
    r = subprocess.run(["node", "--check", tmp], capture_output=True, text=True)
    if r.returncode != 0:
        ok = False
        print("!! %s\n%s" % (f, r.stderr))
sys.exit(0 if ok else 1)
PY

echo "== 打包 =="
rm -rf dist
LOG=$(mktemp)
set +e
"$JAX" build 2>&1 | tee "$LOG"
set -e
if grep -qE "\[ERROR\]|Error:" "$LOG"; then
  echo "!! 编译有 ERROR，产物不可信"
  exit 1
fi
find dist -name "*.rpk" -exec ls -la {} \;
