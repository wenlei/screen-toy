// Doodle renderer — loads sprite sheets and renders frame animations
// Supports dog (4-direction walk) + paper airplane (2-direction fly)

(function () {
  var cfg = window.__CONFIG || {};
  var spriteFolder = cfg.spriteFolder || 'dog';
  var basePath = 'assets/doodles/' + spriteFolder + '/';

  // ---- Dog config ----
  var DOG = {
    frameWidth: 720,
    frameHeight: 600,
    columns: 24,
    directions: [
      { name: 'E', row: 0 },
      { name: 'S', row: 1 },
      { name: 'N', row: 2 },
      { name: 'W', row: 3 },
    ],
    frames: {
      idle:  allFrames(24),
      walk:  allFrames(24),
      sit:   [0, 1, 0, 2, 0, 1, 0, 3],
      poke:  [0, 1, 2, 3, 2, 1],
      drag:  [0],
    },
    fallbackDuration: {
      idle: 200, walk: 60, sit: 400, poke: 70, drag: 200,
    },
  };

  // ---- Airplane config (individual images) ----
  var apFolder = cfg.airplaneFolder || 'paper_plane';
  var apPath = 'assets/doodles/' + apFolder + '/';

  var AIRPLANE = {
    images: {},
    loaded: false,
  };

  var apLoadCount = 0;
  var apFiles = [
    { name: 'E', file: 'right.png' },
    { name: 'W', file: 'left.png' },
  ];
  apFiles.forEach(function (d) {
    var img = new Image();
    img.onload = function () {
      AIRPLANE.images[d.name] = this;
      apLoadCount++;
      if (apLoadCount === apFiles.length) AIRPLANE.loaded = true;
    };
    img.src = apPath + d.file;
  });

  var DISPLAY_W = 120;
  var DISPLAY_H = 100;

  // ---- Helper ----
  function allFrames(n) {
    var arr = [];
    for (var i = 0; i < n; i++) arr.push(i);
    return arr;
  }

  // ---- Sleep / wakeup sheets ----
  var SLEEP_COLS = 6, SLEEP_FRAME_W = 255, SLEEP_FRAME_H = 256;

  // Three separate sheets: intro (play once), loop (repeat), outro (play once)
  var sleepImg = new Image();
  var sleepLoaded = false;
  sleepImg.onload = function () { sleepLoaded = true; };
  sleepImg.src = basePath + 'sleep_sheet.png';

  var sleepLoopImg = new Image();
  var sleepLoopLoaded = false;
  sleepLoopImg.onload = function () { sleepLoopLoaded = true; };
  sleepLoopImg.src = basePath + 'sleep_loop_sheet.png';

  var wakeImg = new Image();
  var wakeLoaded = false;
  wakeImg.onload = function () { wakeLoaded = true; };
  wakeImg.src = basePath + 'wakeup_sheet.png';

  function getSleepWakeRect(frameIndex) {
    var col = frameIndex % SLEEP_COLS;
    var row = Math.floor(frameIndex / SLEEP_COLS);
    return { x: col * 256, y: row * SLEEP_FRAME_H, w: SLEEP_FRAME_W, h: SLEEP_FRAME_H };
  }

  // ---- State mapping (dog only) ----
  var STATE_MAP = {
    idle: 'idle', wander: 'walk', sit: 'sit', poked: 'poke', dragged: 'drag',
  };

  // ---- Dog image loading ----
  var dogSheet = null, dogLoaded = false;
  var dogImg = new Image();
  dogImg.onload = function () { dogSheet = this; dogLoaded = true; };
  dogImg.src = basePath + 'sheet.png';

  // ---- Frame position (dog) ----
  function getFrameRect(index, row, fw, fh, cols) {
    var col = index % cols;
    return { x: col * fw, y: row * fh, w: fw, h: fh };
  }

  // ---- Direction lookup ----
  var expectedAngles = { E: 0, S: Math.PI / 2, W: Math.PI, N: -Math.PI / 2 };

  function getDirectionRow(angle, directions) {
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    var best = directions[0], bestDiff = Infinity;
    for (var i = 0; i < directions.length; i++) {
      var d = directions[i];
      var exp = expectedAngles[d.name];
      if (exp === undefined) continue;
      var diff = Math.abs(angle - exp);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      if (diff < bestDiff) { bestDiff = diff; best = d; }
    }
    return best.row;
  }

  // ---- Frame cycling (dog) ----
  var stateElapsed = {};
  var lastFrameTime = performance.now();
  var lastDogRow = 0;

  function getCurrentFrame(state, elapsedMs, durationOverride) {
    var indices = DOG.frames[state];
    if (!indices || indices.length === 0) indices = DOG.frames.idle || [0];
    if (indices.length === 1) return getFrameRect(indices[0], lastDogRow, DOG.frameWidth, DOG.frameHeight, DOG.columns);
    if (stateElapsed[state] === undefined) stateElapsed[state] = 0;
    var duration = durationOverride || DOG.fallbackDuration[state] || 200;
    var cycleMs = duration * indices.length;
    stateElapsed[state] += elapsedMs;
    var t = stateElapsed[state] % cycleMs;
    var frameIdx = indices[Math.floor(t / duration) % indices.length];
    return getFrameRect(frameIdx, lastDogRow, DOG.frameWidth, DOG.frameHeight, DOG.columns);
  }

  var prevState = 'idle';
  function getFrame(state, elapsedMs, durationOverride) {
    if (state !== prevState) { stateElapsed[state] = 0; prevState = state; }
    return getCurrentFrame(state, elapsedMs, durationOverride);
  }

  // ---- Draw dog ----
  function drawDog(ctx, params) {
    var p = params || {};
    var bodyBob = p.bodyBob || 0;
    var legPhase = p.legPhase || 0;
    var squish = p.squish || 0;
    var wanderDir = p.wanderDir;

    var now = performance.now();
    var deltaMs = now - lastFrameTime;
    lastFrameTime = now;
    if (deltaMs > 200) deltaMs = 200;

    ctx.clearRect(0, 0, DISPLAY_W, DISPLAY_H);

    // Sleep / wakeup: draw from dedicated sheet, skip normal dog draw
    var _st = p._state;
    if (_st === 'falling_asleep' || _st === 'sleeping' || _st === 'waking_up') {
      var swSheet = _st === 'waking_up' ? wakeImg : (_st === 'sleeping' ? sleepLoopImg : sleepImg);
      var swReady = _st === 'waking_up' ? wakeLoaded : (_st === 'sleeping' ? sleepLoopLoaded : sleepLoaded);
      if (swReady && p.sleepFrame !== undefined) {
        var swRect = getSleepWakeRect(p.sleepFrame);
        var swAspect = swRect.w / swRect.h;
        var swDW, swDH;
        if (swAspect > DISPLAY_W / DISPLAY_H) { swDW = DISPLAY_W; swDH = DISPLAY_W / swAspect; }
        else { swDH = DISPLAY_H; swDW = DISPLAY_H * swAspect; }
        ctx.drawImage(swSheet, swRect.x, swRect.y, swRect.w, swRect.h,
          (DISPLAY_W - swDW) / 2, (DISPLAY_H - swDH) / 2, swDW, swDH);
      }
      return;
    }

    var animState = STATE_MAP[p._state] || 'idle';
    if (wanderDir !== undefined && animState === 'walk') {
      lastDogRow = getDirectionRow(wanderDir, DOG.directions);
    }

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.beginPath();
    var sr = DISPLAY_W * 0.22 / (1 + Math.abs(legPhase - 0.5) * 0.3);
    ctx.ellipse(DISPLAY_W / 2, DISPLAY_H - 6, sr, sr * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();

    if (dogLoaded && dogSheet) {
      var frame = getFrame(animState, deltaMs, p.frameDuration);
      ctx.save();
      var cx = DISPLAY_W / 2, cy = DISPLAY_H / 2;
      var frameAspect = frame.w / frame.h;
      var displayAspect = DISPLAY_W / DISPLAY_H;
      var dw, dh;
      if (frameAspect > displayAspect) { dw = DISPLAY_W; dh = DISPLAY_W / frameAspect; }
      else { dh = DISPLAY_H; dw = DISPLAY_H * frameAspect; }
      var dx = (DISPLAY_W - dw) / 2;
      var dy = (DISPLAY_H - dh) / 2 + Math.round(bodyBob * 2);
      if (squish > 0.01) {
        ctx.translate(cx, cy + Math.round(bodyBob * 2));
        ctx.scale(1 + squish * 0.2, 1 - squish * 0.3);
        ctx.translate(-cx, -(cy + Math.round(bodyBob * 2)));
      }
      ctx.drawImage(dogSheet, frame.x, frame.y, frame.w, frame.h, dx, dy, dw, dh);
      ctx.restore();
    }
  }

  // ---- Draw airplane (on a separate canvas, at absolute position) ----
  function drawAirplane(ctx, direction, w, h) {
    if (!AIRPLANE.loaded) return;
    var img = AIRPLANE.images[direction] || AIRPLANE.images['E'];
    if (!img) return;
    ctx.clearRect(0, 0, w, h);
    // Scale image to fit
    var aspect = img.width / img.height;
    var dw, dh;
    if (aspect > w / h) { dw = w; dh = w / aspect; }
    else { dh = h; dw = h * aspect; }
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  }

  // ---- Quit animation sheet (6 cols × 4 rows = 24 frames, 256×256 each) ----
  var QUIT_COLS = 6, QUIT_ROWS = 4;
  var QUIT_FRAME_W = 256, QUIT_FRAME_H = 256;
  var QUIT_FRAME_COUNT = QUIT_COLS * QUIT_ROWS; // 24

  var quitSheet = new Image();
  var quitLoaded = false;
  quitSheet.onload = function () { quitLoaded = true; };
  quitSheet.src = basePath + 'quit_sheet.png';

  // Draw one quit-animation frame into ctx (DISPLAY_W × DISPLAY_H canvas).
  // Desaturation is applied via ctx.filter so sparkle colours are stripped.
  function drawQuit(ctx, frameIdx) {
    var fi = Math.max(0, Math.min(frameIdx, QUIT_FRAME_COUNT - 1));
    var col = fi % QUIT_COLS;
    var row = Math.floor(fi / QUIT_COLS);
    var sx  = col * QUIT_FRAME_W;
    var sy  = row * QUIT_FRAME_H;

    ctx.clearRect(0, 0, DISPLAY_W, DISPLAY_H);

    if (!quitLoaded) return;

    // Scale to fill canvas while keeping aspect ratio (square frame → DISPLAY_W × DISPLAY_H)
    var scale = Math.min(DISPLAY_W / QUIT_FRAME_W, DISPLAY_H / QUIT_FRAME_H);
    var dw = Math.round(QUIT_FRAME_W * scale);
    var dh = Math.round(QUIT_FRAME_H * scale);
    var dx = Math.round((DISPLAY_W - dw) / 2);
    var dy = Math.round((DISPLAY_H - dh) / 2);

    ctx.save();
    ctx.filter = 'saturate(0)';   // 去色: strip sparkle colours → pure greyscale
    ctx.drawImage(quitSheet, sx, sy, QUIT_FRAME_W, QUIT_FRAME_H, dx, dy, dw, dh);
    ctx.restore();
  }

  // ---- Export ----
  window.RobotSprite = {
    WIDTH: DISPLAY_W,
    HEIGHT: DISPLAY_H,
    draw: drawDog,
  };

  window.AirplaneSprite = {
    draw: drawAirplane,
    loaded: function () { return AIRPLANE.loaded; },
  };

  // Draw a quit frame directly into any ctx at a specified destination rect.
  // Single-pass scaling (no intermediate spriteCanvas) keeps quality high.
  function drawQuitDirect(ctx, frameIdx, dx, dy, dw, dh) {
    if (!quitLoaded) return;
    var fi  = Math.max(0, Math.min(frameIdx, QUIT_FRAME_COUNT - 1));
    var col = fi % QUIT_COLS;
    var row = Math.floor(fi / QUIT_COLS);
    var sx  = col * QUIT_FRAME_W;
    var sy  = row * QUIT_FRAME_H;
    // Maintain aspect ratio (frames are square) centred in the destination rect
    var scale = Math.min(dw / QUIT_FRAME_W, dh / QUIT_FRAME_H);
    var rdw = Math.round(QUIT_FRAME_W * scale);
    var rdh = Math.round(QUIT_FRAME_H * scale);
    var rdx = dx + Math.round((dw - rdw) / 2);
    var rdy = dy + Math.round((dh - rdh) / 2);
    ctx.save();
    ctx.filter = 'saturate(0)';
    ctx.drawImage(quitSheet, sx, sy, QUIT_FRAME_W, QUIT_FRAME_H, rdx, rdy, rdw, rdh);
    ctx.restore();
  }

  // ---- Entrance animation sheet (6 cols × 4 rows = 24 frames, 256×256 each) ----
  var ENTER_COLS = 6, ENTER_FRAME_W = 256, ENTER_FRAME_H = 256;
  var ENTER_FRAME_COUNT = 24;

  var enterSheet = new Image();
  var enterLoaded = false;
  enterSheet.onload = function () { enterLoaded = true; };
  enterSheet.src = basePath + 'enter_sheet.png';

  function drawEnterDirect(ctx, frameIdx, dx, dy, dw, dh) {
    if (!enterLoaded) return;
    var fi  = Math.max(0, Math.min(frameIdx, ENTER_FRAME_COUNT - 1));
    var col = fi % ENTER_COLS;
    var row = Math.floor(fi / ENTER_COLS);
    var sx  = col * ENTER_FRAME_W;
    var sy  = row * ENTER_FRAME_H;
    var scale = Math.min(dw / ENTER_FRAME_W, dh / ENTER_FRAME_H);
    var rdw = Math.round(ENTER_FRAME_W * scale);
    var rdh = Math.round(ENTER_FRAME_H * scale);
    var rdx = dx + Math.round((dw - rdw) / 2);
    var rdy = dy + Math.round((dh - rdh) / 2);
    // No saturate filter — keep the door's purple colour
    ctx.drawImage(enterSheet, sx, sy, ENTER_FRAME_W, ENTER_FRAME_H, rdx, rdy, rdw, rdh);
  }

  window.EnterSprite = {
    drawDirect:  drawEnterDirect,
    loaded:      function () { return enterLoaded; },
    FRAME_COUNT: ENTER_FRAME_COUNT,
  };

  window.QuitSprite = {
    draw:        drawQuit,
    drawDirect:  drawQuitDirect,
    loaded:      function () { return quitLoaded; },
    FRAME_COUNT: QUIT_FRAME_COUNT,
  };

  // ---- Twist / Detwist animation sheets (6 cols × 4 rows = 24 frames, 256×256 each) ----
  var TWIST_COLS = 6, TWIST_FRAME_W = 256, TWIST_FRAME_H = 256;
  var TWIST_FRAME_COUNT = 24;

  var twistSheet = new Image();
  var twistLoaded = false;
  twistSheet.onload = function () { twistLoaded = true; };
  twistSheet.src = basePath + 'twist_sheet.png';

  var detwistSheet = new Image();
  var detwistLoaded = false;
  detwistSheet.onload = function () { detwistLoaded = true; };
  detwistSheet.src = basePath + 'detwist_sheet.png';

  function drawTwistDirect(ctx, frameIdx, dx, dy, dw, dh) {
    if (!twistLoaded) return;
    var fi  = Math.max(0, Math.min(frameIdx, TWIST_FRAME_COUNT - 1));
    var col = fi % TWIST_COLS;
    var row = Math.floor(fi / TWIST_COLS);
    var sx  = col * TWIST_FRAME_W;
    var sy  = row * TWIST_FRAME_H;
    var scale = Math.min(dw / TWIST_FRAME_W, dh / TWIST_FRAME_H);
    var rdw = Math.round(TWIST_FRAME_W * scale);
    var rdh = Math.round(TWIST_FRAME_H * scale);
    var rdx = dx + Math.round((dw - rdw) / 2);
    var rdy = dy + Math.round((dh - rdh) / 2);
    ctx.drawImage(twistSheet, sx, sy, TWIST_FRAME_W, TWIST_FRAME_H, rdx, rdy, rdw, rdh);
  }

  function drawDetwistDirect(ctx, frameIdx, dx, dy, dw, dh) {
    if (!detwistLoaded) return;
    var fi  = Math.max(0, Math.min(frameIdx, TWIST_FRAME_COUNT - 1));
    var col = fi % TWIST_COLS;
    var row = Math.floor(fi / TWIST_COLS);
    var sx  = col * TWIST_FRAME_W;
    var sy  = row * TWIST_FRAME_H;
    var scale = Math.min(dw / TWIST_FRAME_W, dh / TWIST_FRAME_H);
    var rdw = Math.round(TWIST_FRAME_W * scale);
    var rdh = Math.round(TWIST_FRAME_H * scale);
    var rdx = dx + Math.round((dw - rdw) / 2);
    var rdy = dy + Math.round((dh - rdh) / 2);
    ctx.drawImage(detwistSheet, sx, sy, TWIST_FRAME_W, TWIST_FRAME_H, rdx, rdy, rdw, rdh);
  }

  window.TwistSprite = {
    drawDirect:  drawTwistDirect,
    loaded:      function () { return twistLoaded; },
    FRAME_COUNT: TWIST_FRAME_COUNT,
  };

  window.DetwistSprite = {
    drawDirect:  drawDetwistDirect,
    loaded:      function () { return detwistLoaded; },
    FRAME_COUNT: TWIST_FRAME_COUNT,
  };

  // ---- Generic sprite-sheet factory ----------------------------------------
  // cols: columns in the sheet; fw/fh: frame pixel size; fc: total frame count
  function makeSprite(filename, cols, fw, fh, fc) {
    var sheet = new Image();
    var loaded = false;
    sheet.onload = function () { loaded = true; };
    sheet.src = basePath + filename;

    function drawDirect(ctx, frameIdx, dx, dy, dw, dh) {
      if (!loaded) return;
      var fi  = Math.max(0, Math.min(frameIdx, fc - 1));
      var col = fi % cols;
      var row = Math.floor(fi / cols);
      var sx  = col * fw;
      var sy  = row * fh;
      var scale = Math.min(dw / fw, dh / fh);
      var rdw = Math.round(fw * scale);
      var rdh = Math.round(fh * scale);
      var rdx = dx + Math.round((dw - rdw) / 2);
      var rdy = dy + Math.round((dh - rdh) / 2);
      ctx.drawImage(sheet, sx, sy, fw, fh, rdx, rdy, rdw, rdh);
    }

    return { drawDirect: drawDirect, loaded: function () { return loaded; }, FRAME_COUNT: fc };
  }

  // Hula sheets: 6 cols × 4 rows, 256×256, 24 frames each
  function makeHulaSprite(filename) { return makeSprite(filename, 6, 256, 256, 24); }

  window.HulaWearSprite   = makeHulaSprite('hula_wear_sheet.png');
  window.HulaDanceSprite  = makeHulaSprite('hula_dance_sheet.png');
  window.HulaRemoveSprite = makeHulaSprite('hula_remove_sheet.png');
  window.SneezeSprite     = makeHulaSprite('sneeze_sheet.png');
  window.MeltSprite       = makeSprite('melt_sheet.png',  6, 256, 256, 24);
  window.AppleSprite      = makeSprite('apple_sheet.png', 6, 256, 256, 24);
  window.HudunSprite      = makeSprite('hudun_sheet.png', 6, 256, 256, 24);
})();
