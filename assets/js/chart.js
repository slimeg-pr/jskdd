/* Monéta — canvas charting.
   A live area/candle renderer with crosshair, gradient fill, glow line
   and a breathing dot on the leading edge. No libraries. */

(function (global) {
  'use strict';
  var M = global.Moneta = global.Moneta || {};

  function css(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function Chart(canvas, opts) {
    opts = opts || {};
    var ctx = canvas.getContext('2d');
    var data = [];
    var candleData = null;
    var mode = opts.mode || 'area';
    var color = opts.color || css('--neon', '#b14dff');
    var axes = opts.axes !== false;
    var pad = opts.pad || { t: 18, r: 58, b: 24, l: 10 };
    var hover = null;
    var raf = null;
    var w = 0, h = 0, dpr = 1;
    var animFrom = null, animT = 1;
    var fmt = opts.fmt || M.fmt.price;

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      var r = canvas.getBoundingClientRect();
      w = Math.max(1, r.width);
      h = Math.max(1, r.height);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function bounds(arr) {
      var lo = Infinity, hi = -Infinity;
      for (var i = 0; i < arr.length; i++) {
        if (arr[i] < lo) lo = arr[i];
        if (arr[i] > hi) hi = arr[i];
      }
      if (mode === 'candle' && candleData) {
        candleData.forEach(function (c) {
          if (c.l < lo) lo = c.l;
          if (c.h > hi) hi = c.h;
        });
      }
      if (!isFinite(lo)) { lo = 0; hi = 1; }
      if (hi === lo) { hi = lo * 1.001 + 1e-9; lo = lo * 0.999 - 1e-9; }
      var padY = (hi - lo) * 0.14;
      return { lo: lo - padY, hi: hi + padY };
    }

    function niceTicks(lo, hi, n) {
      var span = hi - lo;
      var raw = span / n;
      var mag = Math.pow(10, Math.floor(Math.log10(raw)));
      var norm = raw / mag;
      var step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
      var out = [];
      for (var v = Math.ceil(lo / step) * step; v <= hi; v += step) out.push(v);
      return out;
    }

    function draw() {
      raf = null;
      if (!w || !h) resize();
      ctx.clearRect(0, 0, w, h);
      if (!data.length) return;

      var series = data;
      if (animFrom && animT < 1) {
        series = data.map(function (v, i) {
          var a = animFrom[Math.min(i, animFrom.length - 1)];
          return a + (v - a) * animT;
        });
      }

      var b = bounds(series);
      var x0 = pad.l, x1 = w - pad.r, y0 = pad.t, y1 = h - pad.b;
      var iw = Math.max(1, x1 - x0), ih = Math.max(1, y1 - y0);
      var X = function (i) { return x0 + (i / Math.max(1, series.length - 1)) * iw; };
      var Y = function (v) { return y1 - ((v - b.lo) / (b.hi - b.lo)) * ih; };

      // ── grid + right-hand price scale
      var lastY = Y(series[series.length - 1]);
      if (axes) {
        var ticks = niceTicks(b.lo, b.hi, iw < 420 ? 3 : 5);
        ctx.font = '10px "JetBrains Mono", ui-monospace, monospace';
        ctx.textBaseline = 'middle';
        ticks.forEach(function (t) {
          var y = Y(t);
          if (y < y0 - 2 || y > y1 + 2) return;
          ctx.strokeStyle = 'rgba(177,77,255,.075)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x0, Math.round(y) + .5);
          ctx.lineTo(x1, Math.round(y) + .5);
          ctx.stroke();
          // don't collide with the live last-price tag
          if (Math.abs(y - lastY) > 13) {
            ctx.fillStyle = 'rgba(179,169,204,.62)';
            ctx.textAlign = 'left';
            ctx.fillText(fmt(t), x1 + 8, y);
          }
        });
      }

      var rising = series[series.length - 1] >= series[0];
      var line = opts.autoColor === false ? color : (rising ? css('--up', '#00e39b') : css('--down', '#ff3d68'));

      if (mode === 'candle' && candleData && candleData.length) {
        var cw = iw / candleData.length;
        var body = Math.max(1.5, Math.min(11, cw * 0.62));
        candleData.forEach(function (c, i) {
          var cx = x0 + cw * (i + 0.5);
          var up = c.c >= c.o;
          var col = up ? css('--up', '#00e39b') : css('--down', '#ff3d68');
          ctx.strokeStyle = col;
          ctx.fillStyle = col;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(Math.round(cx) + .5, Y(c.h));
          ctx.lineTo(Math.round(cx) + .5, Y(c.l));
          ctx.stroke();
          var top = Y(Math.max(c.o, c.c));
          var bot = Y(Math.min(c.o, c.c));
          ctx.globalAlpha = up ? .95 : .9;
          ctx.fillRect(cx - body / 2, top, body, Math.max(1.2, bot - top));
          ctx.globalAlpha = 1;
        });
      } else {
        // ── area fill
        var grad = ctx.createLinearGradient(0, y0, 0, y1);
        grad.addColorStop(0, hexA(line, .34));
        grad.addColorStop(.55, hexA(line, .10));
        grad.addColorStop(1, hexA(line, 0));
        ctx.beginPath();
        ctx.moveTo(X(0), Y(series[0]));
        for (var i = 1; i < series.length; i++) ctx.lineTo(X(i), Y(series[i]));
        ctx.lineTo(X(series.length - 1), y1);
        ctx.lineTo(X(0), y1);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();

        // ── glow line
        ctx.beginPath();
        ctx.moveTo(X(0), Y(series[0]));
        for (i = 1; i < series.length; i++) ctx.lineTo(X(i), Y(series[i]));
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.strokeStyle = line;
        ctx.lineWidth = opts.lineWidth || 2;
        ctx.shadowColor = hexA(line, .75);
        ctx.shadowBlur = 12;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // ── leading edge marker
        var lx = X(series.length - 1), ly = Y(series[series.length - 1]);
        if (opts.marker !== false) {
          var t = (Date.now() % 1600) / 1600;
          ctx.beginPath();
          ctx.arc(lx, ly, 3 + t * 9, 0, Math.PI * 2);
          ctx.fillStyle = hexA(line, .22 * (1 - t));
          ctx.fill();
          ctx.beginPath();
          ctx.arc(lx, ly, 3.2, 0, Math.PI * 2);
          ctx.fillStyle = line;
          ctx.shadowColor = line;
          ctx.shadowBlur = 10;
          ctx.fill();
          ctx.shadowBlur = 0;

          // dashed last-price rail
          if (axes) {
            ctx.save();
            ctx.setLineDash([3, 4]);
            ctx.strokeStyle = hexA(line, .38);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x0, Math.round(ly) + .5);
            ctx.lineTo(x1, Math.round(ly) + .5);
            ctx.stroke();
            ctx.restore();
            var lbl = fmt(series[series.length - 1]);
            ctx.font = '600 10px "JetBrains Mono", ui-monospace, monospace';
            var tw = ctx.measureText(lbl).width;
            ctx.fillStyle = line;
            roundRect(ctx, x1 + 5, ly - 9, tw + 10, 18, 4);
            ctx.fill();
            ctx.fillStyle = '#05040a';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(lbl, x1 + 10, ly);
          }
        }
      }

      // ── crosshair
      if (hover != null && series.length) {
        var idx = M.clamp(Math.round((hover.x - x0) / iw * (series.length - 1)), 0, series.length - 1);
        var hx = X(idx), hy = Y(series[idx]);
        ctx.save();
        ctx.setLineDash([2, 4]);
        ctx.strokeStyle = 'rgba(242,238,251,.28)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(hx, y0); ctx.lineTo(hx, y1); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x0, hy); ctx.lineTo(x1, hy); ctx.stroke();
        ctx.restore();
        ctx.beginPath();
        ctx.arc(hx, hy, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = line;
        ctx.lineWidth = 2;
        ctx.fill(); ctx.stroke();
        if (opts.onHover) opts.onHover(series[idx], idx, series.length, hx, hy);
      } else if (opts.onHover) {
        opts.onHover(null);
      }
    }

    function roundRect(c, x, y, wd, ht, r) {
      c.beginPath();
      c.moveTo(x + r, y);
      c.arcTo(x + wd, y, x + wd, y + ht, r);
      c.arcTo(x + wd, y + ht, x, y + ht, r);
      c.arcTo(x, y + ht, x, y, r);
      c.arcTo(x, y, x + wd, y, r);
      c.closePath();
    }

    function hexA(hex, a) {
      hex = (hex || '#b14dff').trim();
      if (hex[0] !== '#') return hex;
      if (hex.length === 4) hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
      var n = parseInt(hex.slice(1), 16);
      return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
    }

    function schedule() { if (!raf) raf = requestAnimationFrame(draw); }

    function setData(arr, candlesArr) {
      if (data.length === arr.length && data.length) {
        animFrom = data.slice();
        animT = 0;
        var t0 = performance.now();
        var step = function () {
          animT = Math.min(1, (performance.now() - t0) / 260);
          draw();
          if (animT < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      } else {
        animFrom = null; animT = 1;
      }
      data = arr;
      candleData = candlesArr || null;
      schedule();
    }

    function setMode(m) { mode = m; schedule(); }
    function setColor(c) { color = c; schedule(); }

    function onMove(e) {
      var r = canvas.getBoundingClientRect();
      var pt = e.touches ? e.touches[0] : e;
      hover = { x: pt.clientX - r.left, y: pt.clientY - r.top };
      schedule();
    }
    function onLeave() { hover = null; schedule(); }

    if (opts.interactive !== false) {
      canvas.addEventListener('mousemove', onMove);
      canvas.addEventListener('mouseleave', onLeave);
      canvas.addEventListener('touchmove', onMove, { passive: true });
      canvas.addEventListener('touchend', onLeave);
    }
    var ro = new ResizeObserver(function () { resize(); draw(); });
    ro.observe(canvas);
    resize();

    return {
      setData: setData,
      setMode: setMode,
      setColor: setColor,
      redraw: schedule,
      destroy: function () {
        ro.disconnect();
        canvas.removeEventListener('mousemove', onMove);
        canvas.removeEventListener('mouseleave', onLeave);
      }
    };
  }

  /** Static sparkline path for inline SVG use — cheap enough to run per row. */
  function sparkPath(values, w, h) {
    if (!values || values.length < 2) return '';
    var lo = Math.min.apply(null, values), hi = Math.max.apply(null, values);
    if (hi === lo) { hi = lo + 1e-9; }
    var d = '';
    for (var i = 0; i < values.length; i++) {
      var x = (i / (values.length - 1)) * w;
      var y = h - ((values[i] - lo) / (hi - lo)) * (h - 4) - 2;
      d += (i ? 'L' : 'M') + x.toFixed(2) + ' ' + y.toFixed(2);
    }
    return d;
  }

  M.Chart = Chart;
  M.sparkPath = sparkPath;
})(window);
