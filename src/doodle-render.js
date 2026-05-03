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

  var sleepImg = new Image();
  var sleepLoaded = false;
  sleepImg.onload = function () { sleepLoaded = true; };
  sleepImg.src = basePath + 'sleep_sheet.png';

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
      var swSheet = (_st === 'waking_up') ? wakeImg : sleepImg;
      var swReady = (_st === 'waking_up') ? wakeLoaded : sleepLoaded;
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
})();
