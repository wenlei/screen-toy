(function () {
  var wrapper = document.getElementById('wrapper');
  var canvas  = document.getElementById('bc');
  var ctx     = canvas.getContext('2d');
  var textEl  = document.getElementById('textEl');

  var TAIL_H   = 18;
  var TAIL_RX  = 0.63; // tail tip x as fraction of bubble width
  var MIN_W    = 110;
  var MAX_INNER_W = 210;
  var FONT     = '13px -apple-system, BlinkMacSystemFont, sans-serif';

  var queue        = [];
  var currentIndex = 0;
  var hideTimer    = null;

  // ── Measure & wrap text ──────────────────────────────────────────────────
  function wrapText(text, maxW) {
    var mc = document.createElement('canvas').getContext('2d');
    mc.font = FONT;
    var lines = [], line = '';
    for (var i = 0; i < text.length; i++) {
      var t = line + text[i];
      if (mc.measureText(t).width > maxW && line.length > 0) {
        lines.push(line);
        line = text[i];
      } else {
        line = t;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  function calcSize(text) {
    var mc = document.createElement('canvas').getContext('2d');
    mc.font = FONT;
    var rawW   = mc.measureText(text).width;
    var innerW = Math.min(rawW + 4, MAX_INNER_W);
    var lines  = wrapText(text, innerW);
    var w = Math.max(MIN_W, Math.round(innerW + 44));
    var h = Math.round(lines.length * 19 + 28 + TAIL_H);
    return { w: w, h: h };
  }

  // ── Draw the speech bubble ───────────────────────────────────────────────
  function drawBubble(w, h) {
    canvas.width  = w;
    canvas.height = h;
    wrapper.style.width  = w + 'px';
    wrapper.style.height = h + 'px';
    textEl.style.height  = (h - TAIL_H) + 'px';

    var ovalH = h - TAIL_H;
    var rx = w / 2 - 2, ry = ovalH / 2 - 2;
    var cx = w / 2, cy = ovalH / 2;
    var tx = Math.round(w * TAIL_RX);
    var tw = 18;
    var tipX = tx + tw * 0.5;
    var tipY = h - 2;

    // Parametric angles where tail meets ellipse bottom arc
    var cos1 = Math.max(-1, Math.min(1, (tx - cx) / rx));
    var cos2 = Math.max(-1, Math.min(1, (tx + tw - cx) / rx));
    var a1 = Math.atan2(Math.sqrt(1 - cos1 * cos1), cos1);   // left connection
    var a2 = Math.atan2(Math.sqrt(1 - cos2 * cos2), cos2);   // right connection

    ctx.clearRect(0, 0, w, h);

    // Single unified path: big arc (skipping tail base) + tail sides
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, a2, a1, true); // counterclockwise, skips tail opening
    ctx.lineTo(tipX, tipY);                         // left edge → tip
    ctx.closePath();                                 // tip → right edge (back to a2)

    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = '#1e1e1e';
    ctx.lineWidth   = 1.5;
    ctx.stroke();
  }

  // ── Show / hide ──────────────────────────────────────────────────────────
  function show(text, wait) {
    clearTimeout(hideTimer);
    var size = calcSize(text);
    drawBubble(size.w, size.h);
    textEl.textContent = text;
    if (window.bubbleAPI && window.bubbleAPI.resize) {
      window.bubbleAPI.resize(size.w, size.h);
    }
    wrapper.classList.add('visible');
    hideTimer = setTimeout(function () {
      wrapper.classList.remove('visible');
      setTimeout(function () {
        if (window.bubbleAPI) window.bubbleAPI.next();
      }, 300);
    }, wait || 3000);
  }

  function hide() {
    clearTimeout(hideTimer);
    wrapper.classList.remove('visible');
    queue = []; currentIndex = 0;
  }

  function showNext() {
    if (currentIndex >= queue.length) {
      queue = []; currentIndex = 0;
      if (window.bubbleAPI) window.bubbleAPI.done();
      return;
    }
    var item = queue[currentIndex++];
    show(item.text, item.wait || 3000);
  }

  function showQueue(items) {
    queue = items.slice();
    currentIndex = 0;
    showNext();
  }

  if (window.bubbleAPI) {
    window.bubbleAPI.onShow(function (data) {
      if (data.queue && data.queue.length > 0) showQueue(data.queue);
      else if (data.text) show(data.text, data.wait || 3000);
    });
    window.bubbleAPI.onHide(hide);
    window.bubbleAPI.onNext(showNext);
  }

  window.bubbleShow      = show;
  window.bubbleShowQueue = showQueue;
  window.bubbleHide      = hide;

  if (window.bubbleAPI) {
    window.bubbleAPI.onBorder(function (s) {
      document.getElementById('winBorder').style.display = s ? 'block' : 'none';
    });
  }
})();
