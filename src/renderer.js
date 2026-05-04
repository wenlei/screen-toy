// Main renderer - game loop and orchestration
(function () {
  var canvas = document.getElementById('canvas');
  var ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  var cfg = window.__CONFIG;
  canvas.width = cfg.winWidth;
  canvas.height = cfg.winHeight;

  // Sprite offscreen canvas (sized to sprite's native resolution)
  var spriteCanvas = document.createElement('canvas');
  spriteCanvas.width = RobotSprite.WIDTH;
  spriteCanvas.height = RobotSprite.HEIGHT;
  var spriteCtx = spriteCanvas.getContext('2d');

  // Airplane offscreen canvas
  var apCanvas = document.createElement('canvas');
  apCanvas.width = 200;
  apCanvas.height = 200;
  var apCtx = apCanvas.getContext('2d');

  // Auto-scale to fit window with padding
  var BASE_SCALE = Math.max(1, Math.min(
    Math.floor((canvas.width - 32) / RobotSprite.WIDTH),
    Math.floor((canvas.height - 32) / RobotSprite.HEIGHT)
  ));
  var displayScale = cfg.displayScale;
  var SCALE = BASE_SCALE * displayScale;

  // Robot object (passed to behavior)
  var robot = { elapsed: 0 };
  var behavior = new RobotBehavior.Behavior(robot);

  // Entrance animation state — starts at 0 so it plays immediately on launch
  var enterFrameIdx   = 0;
  var enterFrameTimer = 0;
  var ENTER_FRAME_MS  = 80;  // ~12.5 fps, 24 frames ≈ 1.9 s

  // Quit animation state
  var quitFrameIdx   = -1;   // -1 = not active; 0..23 = playing; 24+ = finished
  var quitFrameTimer = 0;    // ms accumulator for frame advance
  var QUIT_FRAME_MS  = 80;   // ~12.5 fps  (24 frames ≈ 1.9 s total)

  // Twist / Detwist animation state
  // twistPhase: 0 = idle, 1 = twisting (frames 0-23), 2 = detwisting (frames 0-23)
  var twistPhase     = 0;
  var twistFrameIdx  = 0;
  var twistFrameTimer = 0;
  var TWIST_FRAME_MS = 80;   // ~12.5 fps (24 frames ≈ 1.9 s per phase)
  // Random cooldown before next twist trigger (ms); reset after each twist completes
  var twistCooldown  = (30 + Math.random() * 30) * 1000;

  // Hula animation state
  // hulaPhase: 0 = idle, 1 = wearing, 2 = dancing, 3 = removing
  var hulaPhase      = 0;
  var hulaFrameIdx   = 0;
  var hulaFrameTimer = 0;
  var HULA_FRAME_MS  = 80;   // ~12.5 fps (24 frames ≈ 1.9 s per phase, ~5.7 s total)

  // Mouse state
  var mouseScreen = null;
  var isDragging = false;
  var dragOffsetX = 0;
  var dragOffsetY = 0;
  var mouseDownPos = null;
  var lastClickTime = 0;
  var DOUBLE_CLICK_MS = 400;

  // Frame timing
  var lastTime = performance.now();
  var boundsSendTimer = 0;

  // --- IPC: receive mouse position ---
  if (window.screenToy) {
    window.screenToy.onMousePos(function (pos) {
      mouseScreen = { x: pos.x, y: pos.y };
    });

    // Listen for settings changes from control panel
    window.screenToy.onSettingsChanged(function (settings) {
      behavior.setSettings(settings);
      if (settings.displayScale !== undefined) {
        displayScale = settings.displayScale;
        SCALE = BASE_SCALE * displayScale;
      }
    });

    // Listen for menu actions — unlock sit when menu closes
    window.screenToy.onMenuAction(function (action) {
      behavior.unlockSit();
      handleMenuAction(action);
    });

    // Listen for trigger-menu (from settings)
    window.screenToy.onTriggerMenu(function () {
      triggerMenu();
    });

    // Listen for API bubble (from dialog)
    window.screenToy.onApiBubble(function (text) {
      behavior._triggerApiBubble(text);
    });

    // Trigger named animation immediately (e.g. from settings panel)
    window.screenToy.onTriggerAnimation(function (name) {
      if (name === 'twist' && twistPhase === 0 && hulaPhase === 0) {
        twistPhase = 1;
        twistFrameIdx = 0;
        twistFrameTimer = 0;
      } else if (name === 'hula' && hulaPhase === 0 && twistPhase === 0) {
        hulaPhase = 1;
        hulaFrameIdx = 0;
        hulaFrameTimer = 0;
      }
    });

    // Quit animation: freeze everything, play 24-frame smoke-bomb sequence
    window.screenToy.onQuitAnim(function (size) {
      if (quitFrameIdx >= 0) return; // already playing
      isDragging = false;
      // Resize canvas to match the expanded window sent from main process
      if (size && size.w && size.h) {
        canvas.width  = size.w;
        canvas.height = size.h;
      }
      quitFrameIdx   = 0;
      quitFrameTimer = 0;
    });

    // Bubble sequence finished — clear guard so next bubble can fire
    window.screenToy.onBubbleDone(function () {
      behavior._onBubbleDone();
    });
  }

  // --- Canvas mouse events ---
  canvas.addEventListener('mousedown', function (e) {
    if (!mouseScreen || isDragging) return;

    if (behavior.isSleeping()) {
      // Sleeping: only track clicks, never start drag
      var halfW = canvas.width / 2;
      var halfH = canvas.height / 2;
      if (Math.abs(mouseScreen.x - behavior.screenX) <= halfW &&
          Math.abs(mouseScreen.y - behavior.screenY) <= halfH) {
        isDragging = true;
        mouseDownPos = { x: mouseScreen.x, y: mouseScreen.y };
      }
    } else if (behavior.isClickOnRobot(mouseScreen, SCALE)) {
      isDragging = true;
      mouseDownPos = { x: mouseScreen.x, y: mouseScreen.y };
      dragOffsetX = mouseScreen.x - behavior.screenX;
      dragOffsetY = mouseScreen.y - behavior.screenY;
      behavior.startDrag(mouseScreen);
      if (window.screenToy) window.screenToy.startDrag();
    }
  });

  // Track mouseup on the whole document (during drag, window captures all events)
  document.addEventListener('mouseup', function (e) {
    if (!isDragging) return;
    isDragging = false;

    var dist = 0;
    if (mouseScreen && mouseDownPos) {
      var dx = mouseScreen.x - mouseDownPos.x;
      var dy = mouseScreen.y - mouseDownPos.y;
      dist = Math.sqrt(dx * dx + dy * dy);
    }

    if (dist < 5) {
      if (behavior.isSleeping()) {
        // Double-click sleeping fox → wake up
        var now = Date.now();
        if (now - lastClickTime < DOUBLE_CLICK_MS) {
          behavior.wakeUp();
          lastClickTime = 0;
        } else {
          lastClickTime = now;
        }
        if (window.screenToy) window.screenToy.stopDrag();
      } else {
        // Click awake fox → show menu
        lastClickTime = 0;
        behavior.lockSit();
        if (window.bubbleAPI) window.bubbleAPI.done();
        if (window.screenToy) {
          window.screenToy.showMenu({ x: behavior.screenX, y: behavior.screenY });
          window.screenToy.stopDrag();
        }
      }
    } else {
      behavior.stopDrag();
    }

    mouseDownPos = null;
    if (window.screenToy) window.screenToy.stopDrag();
  });

  // Also handle mouseleave during drag as a safety measure
  document.addEventListener('mouseleave', function (e) {
    if (!isDragging) return;
    // Don't stop drag immediately - user might come back
  });

  // --- Move window helper ---
  function moveWindow(centerX, centerY) {
    if (window.screenToy) {
      window.screenToy.sendWindowMove({
        x: centerX - canvas.width / 2,
        y: centerY - canvas.height / 2,
      });
    }
  }

  // --- Handle menu actions ---
  // --- Handle menu actions (apps are launched by main process) ---
  function handleMenuAction(action) {
    // Reserved for future renderer-side actions
  }

  function triggerMenu() {
    behavior._startSit();
    if (window.screenToy) {
      window.screenToy.showMenu({
        x: behavior.screenX,
        y: behavior.screenY + 25,
      });
    }
  }
  var screenW = typeof screen !== 'undefined' ? screen.width : 1440;
  var screenH = typeof screen !== 'undefined' ? screen.height : 900;
  behavior.initPosition(screenW * 0.75, screenH * 0.65);
  moveWindow(behavior.screenX, behavior.screenY);

  // --- Game loop ---
  function loop(timestamp) {
    var dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;
    robot.elapsed += dt;

    // ── Quit animation: takes over the entire render loop ──────────────────
    if (quitFrameIdx >= 0) {
      var TOTAL = window.QuitSprite ? window.QuitSprite.FRAME_COUNT : 24;

      // Advance frame
      quitFrameTimer += dt * 1000;
      while (quitFrameTimer >= QUIT_FRAME_MS && quitFrameIdx < TOTAL) {
        quitFrameTimer -= QUIT_FRAME_MS;
        quitFrameIdx++;
      }

      // Signal done exactly once when the last frame finishes
      if (quitFrameIdx >= TOTAL && quitFrameIdx < TOTAL + 1) {
        quitFrameIdx = TOTAL + 1; // sentinel to prevent re-firing
        if (window.screenToy) {
          setTimeout(function () { window.screenToy.quitAnimDone(); }, 200);
        }
      }

      // Draw the current (clamped) quit frame
      var frameToShow = Math.min(quitFrameIdx, TOTAL - 1);
      if (window.QuitSprite) {
        window.QuitSprite.draw(spriteCtx, frameToShow);
      }

      // Render quit frame directly into the full main canvas (single-pass scaling,
      // no spriteCanvas detour — keeps the animation crisp at the larger size).
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (window.QuitSprite) {
        window.QuitSprite.drawDirect(ctx, frameToShow, 0, 0, canvas.width, canvas.height);
      }

      requestAnimationFrame(loop);
      return; // skip normal behavior + render
    }
    // ── Entrance animation: plays once on launch, then hands off to normal loop ─
    if (enterFrameIdx >= 0) {
      var ETOTAL = window.EnterSprite ? window.EnterSprite.FRAME_COUNT : 24;

      enterFrameTimer += dt * 1000;
      while (enterFrameTimer >= ENTER_FRAME_MS && enterFrameIdx < ETOTAL) {
        enterFrameTimer -= ENTER_FRAME_MS;
        enterFrameIdx++;
      }

      if (enterFrameIdx >= ETOTAL) {
        enterFrameIdx = -1;   // done — fall through to normal rendering next tick
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (window.EnterSprite) {
          window.EnterSprite.drawDirect(ctx, enterFrameIdx, 0, 0, canvas.width, canvas.height);
        }
        requestAnimationFrame(loop);
        return;
      }
    }
    // ───────────────────────────────────────────────────────────────────────

    // ── Hula animation (wear → dance → remove) ────────────────────────────
    if (hulaPhase > 0) {
      hulaFrameTimer += dt * 1000;
      var HTOTAL = window.HulaWearSprite ? window.HulaWearSprite.FRAME_COUNT : 24;
      while (hulaFrameTimer >= HULA_FRAME_MS && hulaFrameIdx < HTOTAL) {
        hulaFrameTimer -= HULA_FRAME_MS;
        hulaFrameIdx++;
      }
      if (hulaFrameIdx >= HTOTAL) {
        hulaFrameIdx = 0;
        hulaFrameTimer = 0;
        if (hulaPhase < 3) {
          hulaPhase++;   // advance: 1→2→3
        } else {
          hulaPhase = 0; // sequence complete, back to normal
        }
      }
    }
    // ───────────────────────────────────────────────────────────────────────

    // ── Twist / Detwist animation ──────────────────────────────────────────
    if (twistPhase > 0) {
      twistFrameTimer += dt * 1000;
      var TTOTAL = window.TwistSprite ? window.TwistSprite.FRAME_COUNT : 24;
      while (twistFrameTimer >= TWIST_FRAME_MS && twistFrameIdx < TTOTAL) {
        twistFrameTimer -= TWIST_FRAME_MS;
        twistFrameIdx++;
      }
      if (twistFrameIdx >= TTOTAL) {
        if (twistPhase === 1) {
          // Switch to detwist immediately
          twistPhase = 2;
          twistFrameIdx = 0;
          twistFrameTimer = 0;
        } else {
          // Detwist complete — back to idle, reset cooldown
          twistPhase = 0;
          twistFrameIdx = 0;
          twistFrameTimer = 0;
          twistCooldown = (30 + Math.random() * 30) * 1000;
        }
      }
    } else {
      // Count down to next twist (only when awake, not dragging, not sleeping)
      if (!isDragging && !behavior.isSleeping() && behavior.state !== 'waking_up') {
        twistCooldown -= dt * 1000;
        if (twistCooldown <= 0 && window.TwistSprite && window.TwistSprite.loaded() &&
            window.DetwistSprite && window.DetwistSprite.loaded()) {
          twistPhase = 1;
          twistFrameIdx = 0;
          twistFrameTimer = 0;
        }
      }
    }
    // ───────────────────────────────────────────────────────────────────────

    // Screen bounds
    var sb = {
      width: typeof screen !== 'undefined' ? screen.width : 1440,
      height: typeof screen !== 'undefined' ? screen.height : 900,
    };

    // During drag, update position from mouseScreen
    if (isDragging && mouseScreen) {
      behavior.screenX = mouseScreen.x - dragOffsetX;
      behavior.screenY = mouseScreen.y - dragOffsetY;
      // Clamp so the window stays fully on-screen (window is canvas.width × canvas.height)
      behavior.screenX = clamp(behavior.screenX, canvas.width / 2, sb.width - canvas.width / 2);
      behavior.screenY = clamp(behavior.screenY, canvas.height / 2, sb.height - canvas.height / 2);
    }

    // Update behavior (state machine) — frozen during hula so the fox stays put
    if (hulaPhase === 0) {
      behavior.update(dt, mouseScreen, sb);
    }

    // Check for bubble triggers
    if (behavior.anim._bubbleText && window.screenToy) {
      window.screenToy.showBubble({ text: behavior.anim._bubbleText, wait: 3000 });
      behavior.anim._bubbleText = null;
    }
    if (behavior.anim._bubbleQueue && behavior.anim._bubbleQueue.length > 0 && window.screenToy) {
      window.screenToy.showBubble({ queue: behavior.anim._bubbleQueue });
      behavior.anim._bubbleQueue = null;
      // bubbleQueue stays non-empty until onBubbleDone fires, blocking new bubbles
    }

    // Sync window position to robot position
    moveWindow(behavior.screenX, behavior.screenY);

    // Send robot bounds to main process for click-through management
    boundsSendTimer += dt;
    if (boundsSendTimer > 0.05) {
      boundsSendTimer = 0;
      if (window.screenToy && !isDragging) {
        if (behavior.isSleeping() || behavior.state === 'waking_up') {
          // Sleeping: make full window clickable
          window.screenToy.sendBounds({ x: 0, y: 0, w: canvas.width, h: canvas.height });
        } else {
          var displayW = RobotSprite.WIDTH * SCALE;
          var displayH = RobotSprite.HEIGHT * SCALE;
          var wx = canvas.width / 2 - displayW / 2;
          var wy = canvas.height / 2 - displayH / 2;
          window.screenToy.sendBounds({ x: wx, y: wy, w: displayW, h: displayH });
        }
      }
    }

    // --- Render ---
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw robot to offscreen canvas
    RobotSprite.draw(spriteCtx, behavior.anim);

    var sleeping = behavior.isSleeping() || behavior.state === 'waking_up';
    var normalW = RobotSprite.WIDTH  * SCALE;
    var normalH = RobotSprite.HEIGHT * SCALE;
    var sleepW  = Math.round(canvas.width  * 0.8);
    var sleepH  = Math.round(canvas.height * 0.8);
    var sp = sleeping ? (behavior.anim.sleepProgress || 0) : 0;
    var dW = Math.round(normalW + (sleepW - normalW) * sp);
    var dH = Math.round(normalH + (sleepH - normalH) * sp);
    var ox = Math.round(canvas.width  / 2 - dW / 2);
    var oy = Math.round(canvas.height / 2 - dH / 2);

    // Shadow only when awake
    if (!sleeping) {
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.ellipse(canvas.width / 2, canvas.height / 2 + dH * 0.35, dW * 0.4, dH * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Draw to main canvas (scaled, centered)
    // During special animations, replace the normal sprite
    if (hulaPhase > 0) {
      var hulaFrameToShow = Math.min(hulaFrameIdx, (window.HulaWearSprite ? window.HulaWearSprite.FRAME_COUNT : 24) - 1);
      var hulaSprite = [null, window.HulaWearSprite, window.HulaDanceSprite, window.HulaRemoveSprite][hulaPhase];
      // Hula draws 38% larger than the normal sprite (1.2 × 1.15), centred on same point
      var hulaDW = Math.round(dW * 1.38);
      var hulaDH = Math.round(dH * 1.38);
      var hulaOx = Math.round(canvas.width  / 2 - hulaDW / 2);
      var hulaOy = Math.round(canvas.height / 2 - hulaDH / 2);
      if (hulaSprite) hulaSprite.drawDirect(ctx, hulaFrameToShow, hulaOx, hulaOy, hulaDW, hulaDH);
    } else if (twistPhase > 0) {
      var twistFrameToShow = Math.min(twistFrameIdx, (window.TwistSprite ? window.TwistSprite.FRAME_COUNT : 24) - 1);
      if (twistPhase === 1 && window.TwistSprite) {
        window.TwistSprite.drawDirect(ctx, twistFrameToShow, ox, oy, dW, dH);
      } else if (twistPhase === 2 && window.DetwistSprite) {
        window.DetwistSprite.drawDirect(ctx, twistFrameToShow, ox, oy, dW, dH);
      }
    } else {
      ctx.drawImage(spriteCanvas, 0, 0, RobotSprite.WIDTH, RobotSprite.HEIGHT, ox, oy, dW, dH);
    }

    // Draw airplane if active
    var ap = behavior.airplane;
    if (ap.active && window.AirplaneSprite && window.AirplaneSprite.loaded()) {
      var apSize = 200;
      AirplaneSprite.draw(apCtx, ap.direction, apSize, apSize);
      // Convert airplane screen position to window-relative
      var apWinX = ap.x - behavior.screenX + canvas.width / 2 - apSize / 2;
      var apWinY = ap.y - behavior.screenY + canvas.height / 2 - apSize / 2;
      ctx.drawImage(apCanvas, 0, 0, apSize, apSize, apWinX, apWinY, apSize, apSize);
    }

    requestAnimationFrame(loop);
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  requestAnimationFrame(loop);
})();
