#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
import_csv.py —— 把 txt / csv 项目表转成 App 内置的 JS 常量文件。

用法（一行）：
    python3 tools/import_csv.py && bash build.sh

默认读取 src/assets/items.csv（没有就用 src/assets/items.txt），
生成 src/common/items.generated.js —— App 里 `import BUNDLE from '../../common/items.generated.js'`，
编译期就把数据内联进包里，运行时不需要读文件系统（最稳的一条路）。

CSV 格式（推荐，支持多张转盘）：
    # 列表名,项目          <- # 开头的行是注释，整行忽略
    今天吃啥,火锅
    今天吃啥,烧烤
    周末去哪,爬山
  · 第一列 = 列表名，第二列 = 项目
  · 支持 BOM / 空行 / 行尾空白 / CRLF / 引号包裹（"a,b"）
  · 只有一列（整份文件都没有逗号）→ 视为单列表，列表名用「默认」
  · 单张列表超过 MAX(12) 项 → 截断到 12，并在列表里记 trunc 数量（App 编辑页会提示）

TXT 格式：一行一项，# 注释，空行忽略 → 单列表「默认」。

选项：
    --src PATH    指定输入文件（不给就自动找 items.csv / items.txt）
    --out PATH    指定输出（默认 src/common/items.generated.js）
    --max N       每张列表上限，默认 12
    --name NAME   txt 模式下的列表名（默认「默认」）
"""
import argparse
import csv
import io
import json
import os
import sys
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_OUT = os.path.join(ROOT, 'src', 'common', 'items.generated.js')
ASSETS = os.path.join(ROOT, 'src', 'assets')
MAX_ITEMS = 12
SINGLE_NAME = '默认'          # 「默认」
BUILTIN = ['火锅', '烧烤', '面条', '饺子', '米饭', '沙拉', '汉堡', '随便']


def read_text(path):
    raw = open(path, 'rb').read()
    for enc in ('utf-8-sig', 'utf-8', 'gb18030'):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode('utf-8', 'replace')


def clean_lines(text):
    """去 BOM（read_text 已处理）、统一换行、去掉注释与空行"""
    out = []
    for line in text.replace('\r\n', '\n').replace('\r', '\n').split('\n'):
        s = line.strip().lstrip('\ufeff').strip()
        if not s or s.startswith('#'):
            continue
        out.append(s)
    return out


def parse_txt(text, single_name):
    """一行一项 -> [(单列表名, 项目), ...]"""
    return [(single_name, s) for s in clean_lines(text)]


def parse_csv(text):
    """返回 [(列表名, 项目), ...]；整份文件没有逗号 → 单列表"""
    lines = clean_lines(text)
    if not lines:
        return []
    has_comma = any(',' in ln for ln in lines)
    rows = []
    if not has_comma:
        for ln in lines:
            rows.append((SINGLE_NAME, ln))
        return rows

    buf = '\n'.join(lines)
    for rec in csv.reader(io.StringIO(buf)):
        if not rec:
            continue
        cells = [c.strip().lstrip('\ufeff').strip() for c in rec]
        cells = [c for c in cells]
        if len(cells) >= 2:
            name, item = cells[0], cells[1]
        else:
            name, item = SINGLE_NAME, cells[0]
        if not item:
            continue
        if not name:
            name = SINGLE_NAME
        rows.append((name, item))
    return rows


def group(rows, max_items):
    """按列表名首次出现顺序分组 + 截断"""
    order, bucket = [], {}
    for name, item in rows:
        if name not in bucket:
            bucket[name] = []
            order.append(name)
        bucket[name].append(item)
    lists = []
    for name in order:
        items = bucket[name]
        trunc = 0
        if len(items) > max_items:
            trunc = len(items) - max_items
            items = items[:max_items]
        lists.append({'name': name, 'items': items, 'trunc': trunc})
    return lists


def js_str(v):
    return json.dumps(v, ensure_ascii=False)


def render(lists, source, max_items):
    now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    total = sum(len(l['items']) for l in lists)
    out = []
    out.append('/* 由 tools/import_csv.py 自动生成，请勿手改。')
    out.append(' * 数据来源: %s' % source)
    out.append(' * 生成时间: %s' % now)
    out.append(' * 列表 %d 张 / 项目 %d 项（单张上限 %d，超出已截断）' % (len(lists), total, max_items))
    out.append(' */')
    out.append('export default {')
    out.append('  source: %s,' % js_str(source))
    out.append('  generated: %s,' % js_str(now))
    out.append('  max: %d,' % max_items)
    out.append('  lists: [')
    for l in lists:
        items = ', '.join(js_str(i) for i in l['items'])
        out.append('    { name: %s, trunc: %d, items: [%s] },' % (js_str(l['name']), l['trunc'], items))
    out.append('  ]')
    out.append('}')
    return '\n'.join(out) + '\n'


def pick_src(arg):
    if arg:
        return os.path.abspath(arg)
    for fn in ('items.csv', 'items.txt'):
        p = os.path.join(ASSETS, fn)
        if os.path.isfile(p):
            return p
    return None


def main():
    ap = argparse.ArgumentParser(description='txt/csv -> src/common/items.generated.js')
    ap.add_argument('--src')
    ap.add_argument('--out', default=DEFAULT_OUT)
    ap.add_argument('--max', type=int, default=MAX_ITEMS)
    ap.add_argument('--name', default=SINGLE_NAME)
    a = ap.parse_args()

    src = pick_src(a.src)
    if not src:
        lists = [{'name': SINGLE_NAME, 'items': BUILTIN[:a.max], 'trunc': 0}]
        source = '内置默认'
        print('[import_csv] 没找到 src/assets/items.csv 或 items.txt，退回内置 %d 项' % len(BUILTIN))
    else:
        text = read_text(src)
        ext = os.path.splitext(src)[1].lower()
        rows = parse_csv(text) if ext == '.csv' else parse_txt(text, a.name)
        lists = group(rows, a.max)
        source = os.path.basename(src)
        if not lists:
            print('[import_csv] !! %s 里没有任何项目，退回内置默认' % source, file=sys.stderr)
            lists = [{'name': SINGLE_NAME, 'items': BUILTIN[:a.max], 'trunc': 0}]
            source = '内置默认'

    js = render(lists, source, a.max)
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    with open(a.out, 'w', encoding='utf-8') as f:
        f.write(js)

    total = sum(len(l['items']) for l in lists)
    print('[import_csv] %s -> %s' % (source, os.path.relpath(a.out, ROOT)))
    for l in lists:
        note = ('  截断 %d 项' % l['trunc']) if l['trunc'] else ''
        print('   · %-12s %2d 项  %s%s' % (l['name'], len(l['items']), ' / '.join(l['items'][:6]), note))
    print('[import_csv] 合计 %d 张列表 / %d 项' % (len(lists), total))


if __name__ == '__main__':
    main()
