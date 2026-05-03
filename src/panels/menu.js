(function () {
  var canvas  = document.getElementById('deco');
  var ctx     = canvas.getContext('2d');
  var menuEl  = document.getElementById('menu');

  // ── Source image constants ────────────────────────────────────────────────
  var DW          = 400;
  var SLICE_TOP_H = 184;
  var SLICE_BOT_H = 184;
  var BASE_WIN_H  = 368;

  // ── Config (overridden by IPC) ────────────────────────────────────────────
  var DRAW_OFFSET_X  = 0;
  var CLIP_X         = 0;
  var CLIP_Y_TOP     = 0;
  var CANVAS_TOP_PAD = 55;
  var CANVAS_BOT_PAD = 30;
  var CLOUD_SCALE    = 0.85;
  var showDebug      = false;
  var MENU_TOP       = 90;
  var MENU_LEFT      = 45;

  // ── State ─────────────────────────────────────────────────────────────────
  var apps        = [];
  var windowH     = BASE_WIN_H;
  var topPad      = 28;
  var leftPad     = 20;
  var cloudOffset = 28;
  var baseLoaded  = false;

  // ── Image ─────────────────────────────────────────────────────────────────
  var baseImg = new Image();
  baseImg.onload = function () { baseLoaded = true; };
  baseImg.src = '../assets/doodles/thinking_bubble/adaptive_base.png';

  // ── Receive config from main ──────────────────────────────────────────────
  if (window.screenToyMenu) {
    window.screenToyMenu.onApps(function (data) {
      if (Array.isArray(data)) {
        apps = data;
        windowH = calcWindowH(apps.length);
      } else {
        apps    = data.apps    || [];
        windowH = data.windowH || calcWindowH(apps.length);
        if (data.topPad       !== undefined) topPad         = data.topPad;
        if (data.leftPad      !== undefined) leftPad        = data.leftPad;
        if (data.cloudOffset  !== undefined) cloudOffset    = data.cloudOffset;
        if (data.canvasTopPad !== undefined) CANVAS_TOP_PAD = data.canvasTopPad;
        if (data.canvasBotPad !== undefined) CANVAS_BOT_PAD = data.canvasBotPad;
        if (data.drawOffsetX  !== undefined) DRAW_OFFSET_X  = data.drawOffsetX;
        if (data.menuLeft     !== undefined) MENU_LEFT      = data.menuLeft;
        if (data.menuTop      !== undefined) MENU_TOP       = data.menuTop;
        if (data.cloudScale   !== undefined) CLOUD_SCALE    = data.cloudScale;
        if (data.showDebug    !== undefined) showDebug      = data.showDebug;
        if (data.clipX        !== undefined) CLIP_X         = data.clipX;
        if (data.clipYTop     !== undefined) CLIP_Y_TOP     = data.clipYTop;
      }
      maybeShow();
    });
  }

  // ── Adaptive height ───────────────────────────────────────────────────────
  function calcWindowH(numApps) {
    var contentH = (numApps + 1) * 28 + 8 * 2;
    var stretch  = Math.max(0, contentH - 160);
    return BASE_WIN_H + stretch;
  }

  // ── Draw helpers ──────────────────────────────────────────────────────────

  function getLayout() {
    var CS      = CLOUD_SCALE;
    var stretch = windowH - BASE_WIN_H;
    var ox      = Math.round(cloudOffset + DRAW_OFFSET_X);
    var dTop    = Math.round(SLICE_TOP_H * CS);
    var dStr    = Math.round(stretch * CS);
    var botY    = CANVAS_TOP_PAD + dTop + dStr;  // canvas Y where bottom section begins
    var srcW    = DW - 2 * CLIP_X;
    var dW      = Math.round(srcW * CS);
    return { CS: CS, ox: ox, dTop: dTop, dStr: dStr, botY: botY, srcW: srcW, dW: dW };
  }

  // Full 3-slice draw
  function drawAdaptive() {
    var L       = getLayout();
    var srcTopH = SLICE_TOP_H - CLIP_Y_TOP;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(baseImg, CLIP_X, CLIP_Y_TOP, L.srcW, srcTopH,
                           L.ox,   CANVAS_TOP_PAD,                 L.dW, L.dTop);
    if (L.dStr > 0) {
      ctx.drawImage(baseImg, CLIP_X, SLICE_TOP_H, L.srcW, 1,
                             L.ox,   CANVAS_TOP_PAD + L.dTop,       L.dW, L.dStr);
    }
    ctx.drawImage(baseImg, CLIP_X, SLICE_TOP_H,                  L.srcW, SLICE_BOT_H,
                           L.ox,   CANVAS_TOP_PAD + L.dTop + L.dStr, L.dW, Math.round(SLICE_BOT_H * L.CS));
  }

  // ── Bubble-rising animation ───────────────────────────────────────────────
  // Small circle (source center: x=81, y=357) appears first, then large circle
  // (source center: x=80, y=316), then the full cloud body.

  function startAnimation() {
    var L  = getLayout();
    var CS = L.CS;

    // Canvas-space coordinates of the two tail circles
    var smallCX = L.ox + Math.round(81 * CS);
    var smallCY = L.botY + Math.round((357 - SLICE_TOP_H) * CS);
    var largeCX = L.ox + Math.round(80 * CS);
    var largeCY = L.botY + Math.round((316 - SLICE_TOP_H) * CS);
    var rSmall  = Math.max(5, Math.round(11 * CS));
    var rLarge  = Math.max(8, Math.round(17 * CS));

    function dot(cx, cy, r) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#222222';
      ctx.lineWidth = Math.max(1.5, Math.round(3 * CS));
      ctx.stroke();
    }

    // Step 0 (immediate): small circle only
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    dot(smallCX, smallCY, rSmall);

    setTimeout(function () {
      // Step 1 (+220 ms): large circle appears above small
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      dot(smallCX, smallCY, rSmall);
      dot(largeCX, largeCY, rLarge);

      setTimeout(function () {
        // Step 2 (+440 ms): full cloud + menu
        drawAdaptive();
        buildMenu();
        menuEl.classList.add('visible');
        if (showDebug) renderDebugBoxes();
      }, 220);
    }, 220);
  }

  // ── Show once image and data are ready ───────────────────────────────────
  function maybeShow() {
    if (!baseLoaded) {
      var poll = setInterval(function () {
        if (baseLoaded) { clearInterval(poll); doShow(); }
      }, 20);
    } else {
      doShow();
    }
  }

  function doShow() {
    canvas.width  = DW + 2 * cloudOffset;
    canvas.height = windowH + CANVAS_TOP_PAD + CANVAS_BOT_PAD;
    canvas.style.top  = topPad  + 'px';
    canvas.style.left = leftPad + 'px';
    menuEl.style.top  = Math.round(MENU_TOP  * CLOUD_SCALE + topPad  + CANVAS_TOP_PAD) + 'px';
    menuEl.style.left = Math.round(MENU_LEFT * CLOUD_SCALE + leftPad + cloudOffset)     + 'px';
    startAnimation();
  }

  // ── Live param update (instant redraw, no animation) ─────────────────────
  function applyParams(p) {
    if (p.drawOffsetX  !== undefined) DRAW_OFFSET_X  = p.drawOffsetX;
    if (p.menuLeft     !== undefined) MENU_LEFT      = p.menuLeft;
    if (p.menuTop      !== undefined) MENU_TOP       = p.menuTop;
    if (p.cloudScale   !== undefined) CLOUD_SCALE    = p.cloudScale;
    if (p.cloudOffset  !== undefined) cloudOffset    = p.cloudOffset;
    if (p.canvasTopPad !== undefined) CANVAS_TOP_PAD = p.canvasTopPad;
    if (p.canvasBotPad !== undefined) CANVAS_BOT_PAD = p.canvasBotPad;
    if (p.showDebug    !== undefined) showDebug      = p.showDebug;
    if (p.clipX        !== undefined) CLIP_X         = p.clipX;
    if (p.clipYTop     !== undefined) CLIP_Y_TOP     = p.clipYTop;
  }

  function liveRedraw() {
    canvas.width  = DW + 2 * cloudOffset;
    canvas.height = windowH + CANVAS_TOP_PAD + CANVAS_BOT_PAD;
    canvas.style.top  = topPad  + 'px';
    canvas.style.left = leftPad + 'px';
    menuEl.style.top  = Math.round(MENU_TOP  * CLOUD_SCALE + topPad  + CANVAS_TOP_PAD) + 'px';
    menuEl.style.left = Math.round(MENU_LEFT * CLOUD_SCALE + leftPad + cloudOffset)     + 'px';
    drawAdaptive();
    buildMenu();
    menuEl.classList.add('visible');
    if (showDebug) renderDebugBoxes();
  }

  if (window.screenToyMenu) {
    window.screenToyMenu.onLiveParams(function (p) {
      applyParams(p);
      liveRedraw();
    });
  }

  // ── Zhihu icon ────────────────────────────────────────────────────────────
  function zhihuIcon() {
    var c = document.createElement('canvas');
    c.width = c.height = 16;
    var x = c.getContext('2d');
    x.beginPath();
    x.arc(8, 8, 7.5, 0, Math.PI * 2);
    x.fillStyle = '#0084FF';
    x.fill();
    x.font = 'bold 9px -apple-system, sans-serif';
    x.fillStyle = '#fff';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText('知', 8, 8.5);
    return c.toDataURL();
  }

  // ── Build menu items ──────────────────────────────────────────────────────
  function buildMenu() {
    menuEl.innerHTML = '';
    if (!apps || apps.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'item';
      empty.style.cssText = 'color:#bbb;cursor:default;';
      empty.innerHTML = '<span class="icon">📭</span><span class="label">去设置添加应用</span>';
      menuEl.appendChild(empty);
    } else {
      apps.forEach(function (app) { addItem(app); });
    }
    menuEl.appendChild(makeSep());
    addItem({ id: 'zhihu',   iconUrl: zhihuIcon(), name: '去知乎看看', cls: 'item-link' });
    addItem({ id: 'dialog',  icon: '💬',            name: '知乎对话',   cls: 'item-link' });
    addItem({ id: 'dismiss', icon: '✕',            name: '就这样吧...', cls: 'item-dismiss' });
  }

  function makeSep() {
    var d = document.createElement('div');
    d.className = 'sep';
    return d;
  }

  function addItem(app) {
    var el = document.createElement('div');
    el.className = 'item' + (app.cls ? ' ' + app.cls : '');
    var iconHtml = app.iconUrl
      ? '<span class="icon"><img src="' + app.iconUrl + '" alt=""></span>'
      : '<span class="icon">' + (app.icon || '📱') + '</span>';
    el.innerHTML = iconHtml + '<span class="label">' + (app.name || '') + '</span>';
    el.addEventListener('click', function () {
      if (window.screenToyMenu) window.screenToyMenu.select(app.id);
    });
    menuEl.appendChild(el);
  }

  // ── Debug overlay ─────────────────────────────────────────────────────────
  function renderDebugBoxes() {
    var old = document.getElementById('dbg');
    if (old) old.remove();
    var root = document.createElement('div');
    root.id = 'dbg';
    root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999;font:bold 10px monospace;';

    function box(el, color, fill, label) {
      var r = el.getBoundingClientRect();
      var d = document.createElement('div');
      d.style.cssText = 'position:fixed;box-sizing:border-box;border:2px solid ' + color + ';' +
        'background:' + fill + ';left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;height:' + r.height + 'px;';
      var s = document.createElement('span');
      s.style.cssText = 'position:absolute;top:2px;left:3px;background:rgba(255,255,255,.85);color:' + color + ';padding:1px 4px;border-radius:2px;white-space:nowrap;';
      s.textContent = label;
      d.appendChild(s);
      root.appendChild(d);
    }

    var L = getLayout();
    box(canvas, '#e74c3c', 'rgba(231,76,60,0.08)', '① canvas  ' + canvas.width + '×' + canvas.height);

    var drawH = L.dTop + L.dStr + Math.round(SLICE_BOT_H * L.CS);
    var cr = canvas.getBoundingClientRect();
    var d2 = document.createElement('div');
    d2.style.cssText = 'position:fixed;box-sizing:border-box;border:2px solid #2980b9;background:rgba(41,128,185,0.12);' +
      'left:' + (cr.left + cloudOffset) + 'px;top:' + (cr.top + CANVAS_TOP_PAD) + 'px;width:' + L.dW + 'px;height:' + drawH + 'px;';
    var s2 = document.createElement('span');
    s2.style.cssText = 'position:absolute;top:2px;left:3px;background:rgba(255,255,255,.85);color:#2980b9;padding:1px 4px;border-radius:2px;white-space:nowrap;';
    s2.textContent = '② 绘制区  ' + L.dW + '×' + drawH + '  ×' + CLOUD_SCALE;
    d2.appendChild(s2);
    root.appendChild(d2);

    box(menuEl, '#27ae60', 'rgba(39,174,96,0.10)', '③ 菜单层  ' + Math.round(menuEl.getBoundingClientRect().width) + '×' + Math.round(menuEl.getBoundingClientRect().height));
    document.body.appendChild(root);
  }
})();
