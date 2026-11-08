#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成 466 圆屏 HTML 复刻预览。
坐标直接来自 dump.js（= index.ux 里真实跑的 makeSectors），
CSS 与 .ux 的 .labels / .lbl 一一对应（绝对 left/top，不做 transform）。

用法:
  node dump.js && python3 gen.py 6 8 12
  DEBUG_RING=1 python3 gen.py 8      # 额外画出 R*0.92 安全圈（调试用）
"""
import json, os, sys

PALETTE = ['#FF6B6B', '#FF9F45', '#FFD93D', '#A8E05F',
           '#4ADE80', '#2DD4BF', '#38BDF8', '#818CF8',
           '#C4B5FD', '#F472B6', '#FB7185', '#A0AEC0']
INK = '#141414'
CANVAS, CX = 466, 233
OUT = '/tmp/wheel_prev'

CSS_BASE = """
  html,body{margin:0;padding:0;background:#000;}
  .page{position:relative;width:466px;height:466px;background:#0a0a0e;overflow:hidden;
        border-radius:233px;}  /* 圆屏：四角物理裁掉 */
  canvas{position:absolute;left:0;top:0;width:466px;height:466px;}
  div{display:flex;flex-direction:column;box-sizing:border-box;}
  .labels{position:absolute;left:0px;top:0px;width:466px;height:466px;}
  .lbl{position:absolute;text-align:center;font-weight:bold;
       font-family:"Noto Sans CJK SC","Noto Sans SC",sans-serif;white-space:nowrap;}
"""

HUB_CSS = """
  .hub{position:absolute;left:179px;top:%dpx;width:108px;height:108px;border-radius:54px;
       border:2px solid #FFD93D;background:#FFD93D;align-items:center;justify-content:center;}
  .hubtxt{font-size:30px;font-weight:bold;color:#14141a;font-family:"Noto Sans CJK SC",sans-serif;}
  .hint{position:absolute;left:0;top:412px;width:466px;text-align:center;font-size:15px;color:#5a5a6b;}
"""


def draw_js(n, cy, r, ring):
    cols = [PALETTE[i % 12] for i in range(n)]
    ring_js = ''
    if ring:
        ring_js = """
  x.beginPath(); x.arc(CX,CY,%f,0,PI2,false); x.lineWidth=1.5;
  x.strokeStyle='rgba(255,60,60,0.85)'; x.setLineDash([6,6]); x.stroke(); x.setLineDash([]);
  x.beginPath(); x.arc(CX,CY,%f,0,PI2,false); x.lineWidth=1.5;
  x.strokeStyle='rgba(80,200,255,0.85)'; x.setLineDash([3,5]); x.stroke(); x.setLineDash([]);
""" % (r * 0.92, r * 0.62)
    return """
  var N=%d, CY=%d, R=%d;
  var COLS=%s;
  var c=document.getElementById('cv'), x=c.getContext('2d');
  var CX=233, PI2=Math.PI*2, k=Math.PI/180;
  x.clearRect(0,0,466,466);
  x.beginPath(); x.arc(CX,CY,R+9,0,PI2,false); x.fillStyle='#14141a'; x.fill();
  x.lineWidth=3; x.strokeStyle='#33333f'; x.stroke();
  var seg=360/N;
  for(var i=0;i<N;i++){
    var a0=(-90+i*seg)*k, a1=a0+seg*k;
    x.beginPath(); x.moveTo(CX,CY); x.arc(CX,CY,R,a0,a1,false); x.closePath();
    x.fillStyle=COLS[i]; x.fill();
    x.lineWidth=2; x.strokeStyle='#0a0a0e'; x.stroke();
  }
  x.beginPath(); x.arc(CX,CY,60,0,PI2,false); x.fillStyle='#0a0a0e'; x.fill();
  var py=CY-R;
  x.beginPath(); x.moveTo(CX-13,py-19); x.lineTo(CX+13,py-19); x.lineTo(CX,py+10);
  x.closePath(); x.fillStyle='#FFD93D'; x.fill();
  x.beginPath(); x.arc(CX,CY,R+9,0,PI2,false); x.lineWidth=2;
  x.strokeStyle='#4a4a5c'; x.stroke();
  %s
""" % (n, cy, r, json.dumps(cols), ring_js)


def page_wheel(geom, n, ring=False):
    g = geom[str(n)]
    secs = g['wheel']
    cy, r = g['cy'], g['r']
    boxes = '\n'.join(
        '    <div class="lbl" style="left:%.1fpx;top:%.1fpx;width:%dpx;font-size:%dpx;color:%s;">%s</div>'
        % (s['x'], s['y'], s['lw'], s['fs'], s['tc'], s['t']) for s in secs)
    css = CSS_BASE + (HUB_CSS % (cy - 54))
    return """<!doctype html><html><head><meta charset="utf-8"><style>%s</style></head><body>
<div class="page">
  <canvas id="cv" width="466" height="466"></canvas>
  <div class="labels">
%s
  </div>
  <div class="hub"><div class="hubtxt">开始</div></div>
  <div class="hint">长按屏幕 · 编辑</div>
</div>
<script>%s</script></body></html>""" % (css, boxes, draw_js(n, cy, r, ring))




RESULT_EXTRA = """
  .ring{position:absolute;left:102px;top:15px;width:262px;height:262px;border-radius:131px;
        border:2px solid #FFD93D;}
  .rtip{position:absolute;left:0;top:282px;width:466px;text-align:center;font-size:19px;color:#8a8a9c;}
  .rname{position:absolute;left:0;top:306px;width:466px;text-align:center;color:#fff;font-weight:bold;font-size:44px;}
  .rrow{position:absolute;left:0;top:372px;width:466px;flex-direction:row;justify-content:center;align-items:center;}
  .rbtn{width:150px;height:52px;border-radius:26px;margin-right:6px;font-size:22px;background:#ffd93d;color:#14141a;
        align-items:center;justify-content:center;}
  .rbtn2{width:96px;height:52px;border-radius:26px;margin-left:6px;font-size:22px;background:#24242e;color:#c8c8d4;
        align-items:center;justify-content:center;}
"""


def page_result(geom, n, ring=False):
    g = geom[str(n)]
    secs = g['result']
    cy, r = g['rcy'], g['rr']
    boxes = '\n'.join(
        '    <div class="lbl" style="left:%.1fpx;top:%.1fpx;width:%dpx;font-size:%dpx;color:%s;">%s</div>'
        % (s['x'], s['y'], s['lw'], s['fs'], s['tc'], s['t']) for s in secs)
    css = CSS_BASE + RESULT_EXTRA + """
  .hl{position:absolute;left:%.1fpx;top:%.1fpx;width:%dpx;height:%dpx;border-radius:%dpx;
      border:3px solid #FFF3B0;}
""" % (0, 0, 0, 0, 0)
    return """<!doctype html><html><head><meta charset="utf-8"><style>%s</style></head><body>
<div class="page">
  <canvas id="cv" width="466" height="466"></canvas>
  <div class="labels">
%s
  </div>
  <div class="ring"></div>
  <div class="rtip">本次结果</div>
  <div class="rname">火锅</div>
  <div class="rrow"><div class="rbtn">再转一次</div><div class="rbtn2">返回</div></div>
</div>
<script>%s</script></body></html>""" % (css, boxes, draw_js(n, cy, r, ring))


if __name__ == '__main__':
    ns = [int(v) for v in sys.argv[1:]] or [6, 8, 12]
    ring = os.environ.get('DEBUG_RING') == '1'
    os.makedirs(OUT, exist_ok=True)
    geom = json.load(open(os.path.join(OUT, 'geom.json'), encoding='utf-8'))
    is_result = os.environ.get('RESULT') == '1'
    for n in ns:
        html = page_result(geom, n, ring) if is_result else page_wheel(geom, n, ring)
        p = os.path.join(OUT, '%s_%d.html' % ('result' if is_result else ('ring' if ring else 'wheel'), n))
        open(p, 'w', encoding='utf-8').write(html)
        print('wrote', p)
