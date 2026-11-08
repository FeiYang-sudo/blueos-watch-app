#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""截图 + 从浏览器实测每个标签的真实渲染位置 + 几何断言（v1.3）

  node dump.js && python3 gen.py 6 8 12 && python3 shot.py 6 8 12

断言（真实 DOM 盒子，不是估算）：
  ① 标签数 == N
  ② 每个标签中心角度 = 自己扇区中线（< 0.5°）
  ③ 每个标签「四角」到圆心距离 <= R × 0.92    <- 不出轮盘
  ④ 四角都在自己扇区的角度区间内
  ⑤ 四角半径 >= 60（不压中心钮）
  ⑥ 单行（高度 < 1.6 × 字号）
"""
import json, os, sys
from playwright.sync_api import sync_playwright

OUT = '/tmp/wheel_prev'
MEASURE = """
(function(){
  var pr=document.querySelector('.page').getBoundingClientRect();
  var cx=466/2, cy=%d, R=%d, seg=360/%d;
  var out=[];
  document.querySelectorAll('.lbl').forEach(function(el,i){
    var b=el.getBoundingClientRect();
    var L=b.left-pr.left, T=b.top-pr.top, W=b.width, H=b.height;
    var dev=0, rmax=0, rmin=1e9;
    [[L,T],[L+W,T],[L,T+H],[L+W,T+H]].forEach(function(p){
      var dx=p[0]-cx, dy=p[1]-cy;
      var r=Math.sqrt(dx*dx+dy*dy); if(r>rmax) rmax=r; if(r<rmin) rmin=r;
      var a=(Math.atan2(dx,-dy)*180/Math.PI+360)%%360;
      var off=((a-(i*seg)+540)%%360)-180;
      if(off<0||off>seg) dev=99;
    });
    var mx=L+W/2, my=T+H/2, dx=mx-cx, dy=my-cy;
    var ang=(Math.atan2(dx,-dy)*180/Math.PI+360)%%360;
    out.push({t:el.textContent, w:+W.toFixed(1), h:+H.toFixed(1),
              fs:parseFloat(getComputedStyle(el).fontSize),
              r:+Math.sqrt(dx*dx+dy*dy).toFixed(1), ang:+ang.toFixed(1),
              want:+((i*seg+seg/2)%%360).toFixed(1),
              angErr:+Math.abs(((ang-((i*seg+seg/2)%%360)+540)%%360)-180).toFixed(2),
              dev:dev, rmax:+rmax.toFixed(1), rmin:+rmin.toFixed(1)});
  });
  return out;
})()
"""

ns = [int(v) for v in sys.argv[1:]] or [6, 8, 12]
geom = json.load(open(os.path.join(OUT, 'geom.json'), encoding='utf-8'))
allok = True

with sync_playwright() as pw:
    b = pw.chromium.launch()
    pg = b.new_page(viewport={'width': 466, 'height': 466}, device_scale_factor=2)
    for n in ns:
        g = geom[str(n)]
        cy, r = g['cy'], g['r']
        rim = r * 0.92
        p = os.path.join(OUT, 'wheel_%d.html' % n)
        pg.goto('file://' + p)
        pg.wait_for_timeout(350)
        data = pg.evaluate(MEASURE % (cy, r, n))
        png = os.path.join(OUT, 'v13_wheel_%d.png' % n)
        pg.screenshot(path=png)
        seg = 360.0 / n
        print('=== n=%d -> %s' % (n, png))
        bad = 0
        for d in data:
            ok = (d['angErr'] <= 0.5 and d['dev'] < 1 and d['rmax'] <= rim
                  and d['rmin'] >= 60 and d['h'] < 1.6 * d['fs'])
            bad += 0 if ok else 1
            print('   %-5s 字号%4.1f 框%5.1fx%4.1f 半径%5.1f 角度%6.1f(应%6.1f) '
                  '角偏%4.2f° 四角半径[%.1f, %.1f] 限%.1f %s'
                  % (d['t'], d['fs'], d['w'], d['h'], d['r'], d['ang'], d['want'],
                     d['angErr'], d['rmin'], d['rmax'], rim, 'OK' if ok else '!!FAIL'))
        print('   标签数=%d（应=%d）不合格=%d  四角半径最大 %.1f / R=%d (%.1f%%)'
              % (len(data), n, bad, max(d['rmax'] for d in data), r,
                 100 * max(d['rmax'] for d in data) / r))
        if len(data) != n or bad:
            allok = False
    b.close()
print('\n结果:', 'ALL PASS' if allok else 'FAIL')
sys.exit(0 if allok else 1)
