// event-anim.js — 事件动画注册模块
// 日期驱动的事件动画加载和运行时覆盖 Entersprite / QuitSprite

(function () {
  var folder = (window.__CONFIG && window.__CONFIG.spriteFolder) || 'arctic_fox';
  var basePath = 'assets/doodles/' + folder + '/';

  // 保存默认绘制方法引用，用于日期过后恢复
  var _origEnterDrawDirect = null;
  var _origQuitDraw = null;
  var _origQuitDrawDirect = null;
  var _enterImg = null;
  var _quitImg = null;

  function loadImage(filename) {
    var img = new Image();
    img.src = basePath + filename;
    return img;
  }

  // 覆盖 EnterSprite.drawDirect
  function applyEnter(filename) {
    if (!window.EnterSprite) return;
    if (!_origEnterDrawDirect) _origEnterDrawDirect = window.EnterSprite.drawDirect;
    _enterImg = loadImage(filename);
    window.EnterSprite.drawDirect = function (ctx, frameIdx, dx, dy, dw, dh) {
      if (_enterImg && _enterImg.complete && _enterImg.naturalWidth > 0) {
        var fw = 256, fh = 256, cols = 6;
        var fi = Math.max(0, Math.min(frameIdx, 23));
        var col = fi % cols;
        var row = Math.floor(fi / cols);
        var scale = Math.min(dw / fw, dh / fh);
        var rdw = Math.round(fw * scale);
        var rdh = Math.round(fh * scale);
        var rdx = dx + Math.round((dw - rdw) / 2);
        var rdy = dy + Math.round((dh - rdh) / 2);
        ctx.drawImage(_enterImg, col * fw, row * fh, fw, fh, rdx, rdy, rdw, rdh);
      } else {
        _origEnterDrawDirect(ctx, frameIdx, dx, dy, dw, dh);
      }
    };
  }

  // 恢复 EnterSprite 默认动画
  function resetEnter() {
    var EnterSprite = window.EnterSprite;
    if (_origEnterDrawDirect && EnterSprite) {
      EnterSprite.drawDirect = _origEnterDrawDirect;
    }
    _enterImg = null;
  }

  // 覆盖 QuitSprite.draw / drawDirect
  function applyQuit(filename) {
    var QuitSprite = window.QuitSprite;
    if (!QuitSprite) return;
    if (!_origQuitDraw) _origQuitDraw = QuitSprite.draw;
    if (!_origQuitDrawDirect) _origQuitDrawDirect = QuitSprite.drawDirect;
    _quitImg = loadImage(filename);

    QuitSprite.draw = function (ctx, frameIdx) {
      var fi = Math.max(0, Math.min(frameIdx, 23));
      var col = fi % 6;
      var row = Math.floor(fi / 6);
      var sx = col * 256;
      var sy = row * 256;
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      if (!_quitImg || !_quitImg.complete || _quitImg.naturalWidth === 0) {
        _origQuitDraw(ctx, frameIdx);
        return;
      }
      var scale = Math.min(ctx.canvas.width / 256, ctx.canvas.height / 256);
      var dw = Math.round(256 * scale);
      var dh = Math.round(256 * scale);
      var dx = Math.round((ctx.canvas.width - dw) / 2);
      var dy = Math.round((ctx.canvas.height - dh) / 2);
      ctx.save();
      ctx.filter = 'saturate(0)';
      ctx.drawImage(_quitImg, sx, sy, 256, 256, dx, dy, dw, dh);
      ctx.restore();
    };

    QuitSprite.drawDirect = function (ctx, frameIdx, dx, dy, dw, dh) {
      var fi = Math.max(0, Math.min(frameIdx, 23));
      var col = fi % 6;
      var row = Math.floor(fi / 6);
      var sx = col * 256;
      var sy = row * 256;
      if (!_quitImg || !_quitImg.complete || _quitImg.naturalWidth === 0) {
        _origQuitDrawDirect(ctx, frameIdx, dx, dy, dw, dh);
        return;
      }
      var scale = Math.min(dw / 256, dh / 256);
      var rdw = Math.round(256 * scale);
      var rdh = Math.round(256 * scale);
      var rdx = dx + Math.round((dw - rdw) / 2);
      var rdy = dy + Math.round((dh - rdh) / 2);
      ctx.save();
      ctx.filter = 'saturate(0)';
      ctx.drawImage(_quitImg, sx, sy, 256, 256, rdx, rdy, rdw, rdh);
      ctx.restore();
    };
  }

  // 恢复 QuitSprite 默认动画
  function resetQuit() {
    var QuitSprite = window.QuitSprite;
    if (!QuitSprite) return;
    if (_origQuitDraw) QuitSprite.draw = _origQuitDraw;
    if (_origQuitDrawDirect) QuitSprite.drawDirect = _origQuitDrawDirect;
    _quitImg = null;
  }

  // IPC 入口：接收配置并应用
  window.EventAnim = {
    apply: function (config) {
      if (!config || !config.animations) {
        resetEnter();
        resetQuit();
        return;
      }
      if (config.animations.enter) applyEnter(config.animations.enter);
      else resetEnter();
      if (config.animations.quit) applyQuit(config.animations.quit);
      else resetQuit();
    }
  };
})();
