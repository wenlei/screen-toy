(function () {
  var wrapper = document.getElementById('wrapper');
  var textEl  = document.getElementById('textEl');

  // Speech bubble image native dimensions: 272×177
  // Usable content area fractions (excludes border + tail at bottom):
  var PAD_X_FRAC   = 0.12;  // each side horizontal
  var PAD_TOP_FRAC = 0.12;
  var PAD_BOT_FRAC = 0.30;  // tail (≈18%) + margin
  var IMG_RATIO    = 177 / 272; // H/W of source image
  var MIN_W        = 180;
  var MAX_W        = 340;
  var LINE_H       = 21;
  var FONT         = '13px/1.5 -apple-system, BlinkMacSystemFont, sans-serif';

  var queue        = [];
  var currentIndex = 0;
  var hideTimer    = null;

  // ---- Markdown → HTML (lightweight) ----
  function md2html(text) {
    var html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    html = html.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    html = html.replace(/\*(.+?)\*/g, '<i>$1</i>');
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/\n\n/g, '<br><br>');
    return html;
  }

  function stripMd(text) {
    return text.replace(/\*\*/g, '').replace(/\*/g, '').replace(/`/g, '').replace(/\n\n/g, '\n');
  }

  function measureTextWidth(text) {
    var mc = document.createElement('canvas').getContext('2d');
    mc.font = FONT;
    return mc.measureText(text).width;
  }

  function wrapText(text, maxW) {
    var mc = document.createElement('canvas').getContext('2d');
    mc.font = FONT;
    var lines = [], line = '';
    var words = text.split('');
    for (var i = 0; i < words.length; i++) {
      var t = line + words[i];
      if (mc.measureText(t).width > maxW && line.length > 0) {
        lines.push(line);
        line = words[i];
      } else {
        line = t;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  function calcSize(text) {
    var plain   = stripMd(text);
    var rawW    = measureTextWidth(plain);
    // Bubble width: wide enough for text, clamped
    var W = Math.max(MIN_W, Math.min(MAX_W, rawW / (1 - PAD_X_FRAC * 2) + 4));
    var innerW  = W * (1 - PAD_X_FRAC * 2);
    var lines   = wrapText(plain, innerW);
    var textH   = lines.length * LINE_H + 8;
    // Bubble height: at least aspect-ratio height, grows to fit text
    var H_ratio = W * IMG_RATIO;
    var H_text  = textH / (1 - PAD_TOP_FRAC - PAD_BOT_FRAC);
    var H = Math.max(H_ratio, H_text);
    return { w: Math.round(W), h: Math.round(H) };
  }

  function show(text, wait) {
    clearTimeout(hideTimer);
    var size = calcSize(text);
    var W = size.w, H = size.h;

    wrapper.style.width  = W + 'px';
    wrapper.style.height = H + 'px';

    // Position text area inside bubble (avoid tail at bottom)
    var padL = Math.round(W * PAD_X_FRAC);
    var padR = Math.round(W * PAD_X_FRAC);
    var padT = Math.round(H * PAD_TOP_FRAC);
    var padB = Math.round(H * PAD_BOT_FRAC);

    textEl.style.position = 'absolute';
    textEl.style.left     = padL + 'px';
    textEl.style.right    = padR + 'px';
    textEl.style.top      = padT + 'px';
    textEl.style.bottom   = padB + 'px';

    textEl.innerHTML = md2html(text);

    if (window.bubbleAPI && window.bubbleAPI.resize) {
      window.bubbleAPI.resize(W, H);
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
})();
