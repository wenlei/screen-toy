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
  var ENTER_FRAME_MS  = cfg.enterFrameMs  || 80;  // ~12.5 fps, 24 frames ≈ 1.9 s

  // Quit animation state
  var quitFrameIdx   = -1;   // -1 = not active; 0..23 = playing; 24+ = finished
  var quitFrameTimer = 0;    // ms accumulator for frame advance
  var QUIT_FRAME_MS  = cfg.quitFrameMs  || 80;   // ~12.5 fps  (24 frames ≈ 1.9 s total)

  // Twist / Detwist animation state
  // twistPhase: 0 = idle, 1 = twisting, 2 = struggling, 3 = detwisting
  var twistPhase     = 0;
  var twistFrameIdx  = 0;
  var twistFrameTimer = 0;
  var TWIST_FRAME_MS  = cfg.twistFrameMs  || 80;   // ~12.5 fps (24 frames ≈ 1.9 s per phase)
  // Single cooldown timer for all random animations (ms)
  function resetRandomAnimCooldown() {
    return ((cfg.animCooldownMinSec || 25) + Math.random() * ((cfg.animCooldownMaxSec || 60) - (cfg.animCooldownMinSec || 25))) * 1000;
  }
  var randomAnimCooldown = resetRandomAnimCooldown();

  // Hula animation state
  // hulaPhase: 0 = idle, 1 = wearing, 2 = dancing, 3 = removing
  var hulaPhase      = 0;
  var hulaFrameIdx   = 0;
  var hulaFrameTimer = 0;
  var HULA_FRAME_MS  = cfg.hulaFrameMs   || 80;   // ~12.5 fps (24 frames ≈ 1.9 s per phase, ~5.7 s total)

  // Sneeze animation state
  var sneezeActive    = false;
  var sneezeFrameIdx  = 0;
  var sneezeFrameTimer = 0;
  var SNEEZE_FRAME_MS = cfg.sneezeFrameMs || 80;  // ~12.5 fps (24 frames ≈ 1.9 s)

  var okActive      = false;
  var okFrameIdx    = 0;
  var okFrameTimer  = 0;
  var OK_FRAME_MS   = cfg.okFrameMs    || 80;

  // Melt animation state
  var meltActive     = false;
  var meltFrameIdx   = 0;
  var meltFrameTimer = 0;
  var MELT_FRAME_MS  = cfg.meltFrameMs  || 120;  // slower: 24 frames ≈ 2.9 s

  var bigNoseActive    = false;
  var bigNoseFrameIdx  = 0;
  var bigNoseFrameTimer = 0;
  var BIGNOSE_FRAME_MS = 80;

  // freezePhase: 0=idle, 1=freezing, 2=thawing
  var freezePhase     = 0;
  var freezeFrameIdx  = 0;
  var freezeFrameTimer = 0;
  var FREEZE_FRAME_MS = 120;

  // Apple-hit + Hudun (recovery) animation — play in sequence
  // applePhase: 0=idle, 1=苹果 playing, 2=狐顿 playing
  var applePhase     = 0;
  var appleFrameIdx  = 0;
  var appleFrameTimer = 0;
  var APPLE_FRAME_MS = cfg.appleFrameMs || 80;

  // ── Sun-dodge mini-game ───────────────────────────────────────────────────
  var sunGameActive    = false;
  var sunSX = 0, sunSY = 0;       // sun position in SCREEN coords
  var sunVX = 0, sunVY = 0;
  var sunAngle         = 0;       // spinning ray angle (rad)
  var sunScore         = 0;       // rounds caught (difficulty scaling)
  var sunPoints        = 0;       // score this game; resets to 0 on each catch
  var sunCooldown      = 0;       // ms until sun respawns
  var sunGameTimer     = 0;       // seconds survived this round
  var sunResultTimer   = 0;       // ms remaining to show result text
  var sunResultText    = '';      // e.g. "存活 8.3 秒"
  var SUN_RADIUS       = 20;
  var SUN_CATCH_R      = 38;      // screen-px collision radius
  var SUN_BASE_SPEED   = 85;
  var SUN_SPEED_INC    = 20;
  var SUN_HOME_ACCEL   = 50;
  var SUN_COOLDOWN_MS  = 3200;
  var FOX_MAX_SPEED    = 340;     // px/s when sun is far
  var FOX_MIN_SPEED    = 55;      // px/s when sun is very close
  var FOX_SLOW_FAR     = 280;     // distance: full speed
  var FOX_SLOW_NEAR    = 50;      // distance: min speed

  function spawnSun() {
    var sw = typeof screen !== 'undefined' ? screen.width  : 1440;
    var sh = typeof screen !== 'undefined' ? screen.height : 900;
    var fx = behavior.screenX, fy = behavior.screenY;
    var ang = Math.random() * Math.PI * 2;
    var dist = 280 + Math.random() * 120;
    sunSX = Math.max(30, Math.min(sw - 30, fx + Math.cos(ang) * dist));
    sunSY = Math.max(30, Math.min(sh - 30, fy + Math.sin(ang) * dist));
    var dx = fx - sunSX, dy = fy - sunSY, len = Math.sqrt(dx*dx + dy*dy) || 1;
    var spd = SUN_BASE_SPEED + sunScore * SUN_SPEED_INC;
    sunVX = (dx / len) * spd;
    sunVY = (dy / len) * spd;
    sunGameTimer = 0;
  }

  // ─────────────────────────────────────────────────────────────────────────

  // Mouse state
  var mouseScreen = null;
  var isDragging = false;
  var dragOffsetX = 0;
  var dragOffsetY = 0;
  var mouseDownPos = null;
  var lastClickTime = 0;
  var DOUBLE_CLICK_MS = 400;

  // Mouse idle dance
  var mouseIdleTimer = 0;
  var MOUSE_IDLE_DANCE_S = 20;
  var lastMouseMovePos = null;

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
      // Suppress bubble during special animations
      if (twistPhase > 0 || hulaPhase > 0 || sneezeActive || meltActive || freezePhase > 0 || applePhase > 0 || sunGameActive) return;
      behavior._triggerApiBubble(text);
      if (!okActive && !sneezeActive && !meltActive && hulaPhase === 0 && twistPhase === 0) {
        okActive = true; okFrameIdx = 0; okFrameTimer = 0;
      }
    });

    // Trigger named animation immediately (e.g. from settings panel)
    window.screenToy.onTriggerAnimation(function (name) {
      // Suppress during active bubbles
      if (behavior.anim._bubbleText || (behavior.anim._bubbleQueue && behavior.anim._bubbleQueue.length > 0) || behavior.bubbleQueue.length > 0) return;

      if (name === 'twist' && twistPhase === 0 && hulaPhase === 0 && !sneezeActive) {
        twistPhase = 1;
        twistFrameIdx = 0;
        twistFrameTimer = 0;
      } else if (name === 'hula' && hulaPhase === 0 && twistPhase === 0 && !sneezeActive) {
        hulaPhase = 1;
        hulaFrameIdx = 0;
        hulaFrameTimer = 0;
      } else if (name === 'sneeze' && !sneezeActive && hulaPhase === 0 && twistPhase === 0 && !meltActive) {
        sneezeActive = true;
        sneezeFrameIdx = 0;
        sneezeFrameTimer = 0;
      } else if (name === 'melt' && !meltActive && hulaPhase === 0 && twistPhase === 0 && !sneezeActive) {
        meltActive = true;
        meltFrameIdx = 0;
        meltFrameTimer = 0;
      } else if (name === 'bignose' && !bigNoseActive && hulaPhase === 0 && twistPhase === 0 && !sneezeActive && !meltActive && freezePhase === 0) {
        bigNoseActive = true;
        bigNoseFrameIdx = 0;
        bigNoseFrameTimer = 0;
      } else if (name === 'freeze' && freezePhase === 0 && !meltActive && hulaPhase === 0 && twistPhase === 0 && !sneezeActive) {
        freezePhase = 1;
        freezeFrameIdx = 0;
        freezeFrameTimer = 0;
      } else if (name === 'apple' && applePhase === 0 && hulaPhase === 0 && twistPhase === 0 && !sneezeActive && !meltActive) {
        applePhase = 1;
        appleFrameIdx = 0;
        appleFrameTimer = 0;
      } else if (name === 'sun-toggle') {
        sunGameActive = !sunGameActive;
        if (sunGameActive) {
          sunScore = 0;
          sunPoints = 0;
          sunCooldown = 0;
          spawnSun();
        } else {
          if (window.screenToy) window.screenToy.hideSun();
        }
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
      // Suppress menu while sun game is active
      if (sunGameActive) {
        mouseDownPos = null;
        if (window.screenToy) window.screenToy.stopDrag();
        return;
      }
      var now = Date.now();
      if (behavior.isSleeping()) {
        // Double-click sleeping fox → wake up
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
    behavior.lockSit();
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
          var shrink = 0.8;
          var sw = Math.round(canvas.width * shrink);
          var sh = Math.round(canvas.height * shrink);
          var sx = Math.round((canvas.width - sw) / 2);
          var sy = Math.round((canvas.height - sh) / 2);
          window.EnterSprite.drawDirect(ctx, enterFrameIdx, sx, sy, sw, sh);
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

    // ── Sneeze animation ───────────────────────────────────────────────────
    if (sneezeActive) {
      sneezeFrameTimer += dt * 1000;
      var STOTAL = window.SneezeSprite ? window.SneezeSprite.FRAME_COUNT : 24;
      while (sneezeFrameTimer >= SNEEZE_FRAME_MS && sneezeFrameIdx < STOTAL) {
        sneezeFrameTimer -= SNEEZE_FRAME_MS;
        sneezeFrameIdx++;
      }
      if (sneezeFrameIdx >= STOTAL) {
        sneezeActive = false;
        sneezeFrameIdx = 0;
        sneezeFrameTimer = 0;
      }
    }
    if (okActive) {
      okFrameTimer += dt * 1000;
      var OKTOTAL = window.OkSprite ? window.OkSprite.FRAME_COUNT : 24;
      while (okFrameTimer >= OK_FRAME_MS && okFrameIdx < OKTOTAL) {
        okFrameTimer -= OK_FRAME_MS;
        okFrameIdx++;
      }
      if (okFrameIdx >= OKTOTAL) {
        okActive = false;
        okFrameIdx = 0;
        okFrameTimer = 0;
      }
    }
    // ───────────────────────────────────────────────────────────────────────

    // ── BigNose animation ──────────────────────────────────────────────────
    if (bigNoseActive) {
      bigNoseFrameTimer += dt * 1000;
      var BNTOTAL = window.BigNoseSprite ? window.BigNoseSprite.FRAME_COUNT : 24;
      while (bigNoseFrameTimer >= BIGNOSE_FRAME_MS && bigNoseFrameIdx < BNTOTAL) {
        bigNoseFrameTimer -= BIGNOSE_FRAME_MS;
        bigNoseFrameIdx++;
      }
      if (bigNoseFrameIdx >= BNTOTAL) {
        bigNoseActive = false;
        bigNoseFrameIdx = 0;
        bigNoseFrameTimer = 0;
      }
    }
    // ───────────────────────────────────────────────────────────────────────

    // ── Apple-hit → Hudun sequence ─────────────────────────────────────────
    if (applePhase > 0) {
      appleFrameTimer += dt * 1000;
      var ATOTAL = window.AppleSprite ? window.AppleSprite.FRAME_COUNT : 24;
      var HTOTAL2 = window.HudunSprite ? window.HudunSprite.FRAME_COUNT : 24;
      var curTotal = applePhase === 1 ? ATOTAL : HTOTAL2;
      while (appleFrameTimer >= APPLE_FRAME_MS && appleFrameIdx < curTotal) {
        appleFrameTimer -= APPLE_FRAME_MS;
        appleFrameIdx++;
      }
      if (appleFrameIdx >= curTotal) {
        if (applePhase === 1) {
          applePhase = 2; appleFrameIdx = 0; appleFrameTimer = 0;
        } else {
          applePhase = 0; appleFrameIdx = 0; appleFrameTimer = 0;
        }
      }
    }
    // ───────────────────────────────────────────────────────────────────────

    // ── Melt animation ─────────────────────────────────────────────────────
    if (meltActive) {
      meltFrameTimer += dt * 1000;
      var MTOTAL = window.MeltSprite ? window.MeltSprite.FRAME_COUNT : 24;
      while (meltFrameTimer >= MELT_FRAME_MS && meltFrameIdx < MTOTAL) {
        meltFrameTimer -= MELT_FRAME_MS;
        meltFrameIdx++;
      }
      if (meltFrameIdx >= MTOTAL) {
        meltActive = false;
        meltFrameIdx = 0;
        meltFrameTimer = 0;
      }
    }
    // ───────────────────────────────────────────────────────────────────────

    // ── Freeze → Thaw animation ────────────────────────────────────────────
    if (freezePhase > 0) {
      freezeFrameTimer += dt * 1000;
      var FZTOTAL = freezePhase === 1
        ? (window.FreezeSprite ? window.FreezeSprite.FRAME_COUNT : 24)
        : (window.ThawSprite   ? window.ThawSprite.FRAME_COUNT   : 24);
      while (freezeFrameTimer >= FREEZE_FRAME_MS && freezeFrameIdx < FZTOTAL) {
        freezeFrameTimer -= FREEZE_FRAME_MS;
        freezeFrameIdx++;
      }
      if (freezeFrameIdx >= FZTOTAL) {
        if (freezePhase === 1) {
          freezePhase = 2; freezeFrameIdx = 0; freezeFrameTimer = 0;
        } else {
          freezePhase = 0; freezeFrameIdx = 0; freezeFrameTimer = 0;
        }
      }
    }
    // ───────────────────────────────────────────────────────────────────────

    // ── Twist / Detwist animation ──────────────────────────────────────────
    if (twistPhase > 0) {
      twistFrameTimer += dt * 1000;
      var curTwistSprite = twistPhase === 1 ? window.TwistSprite
                         : twistPhase === 2 ? window.TwistStruggleSprite
                         : window.DetwistSprite;
      var TTOTAL = curTwistSprite ? curTwistSprite.FRAME_COUNT : 24;
      while (twistFrameTimer >= TWIST_FRAME_MS && twistFrameIdx < TTOTAL) {
        twistFrameTimer -= TWIST_FRAME_MS;
        twistFrameIdx++;
      }
      if (twistFrameIdx >= TTOTAL) {
        if (twistPhase === 1) {
          // Twist → Struggle
          twistPhase = 2;
          twistFrameIdx = 0;
          twistFrameTimer = 0;
        } else if (twistPhase === 2) {
          // Struggle → Detwist
          twistPhase = 3;
          twistFrameIdx = 0;
          twistFrameTimer = 0;
        } else {
          // Detwist complete — back to idle
          twistPhase = 0;
          twistFrameIdx = 0;
          twistFrameTimer = 0;
          randomAnimCooldown = (25 + Math.random() * 35) * 1000;
        }
      }
    } else {
      // Single cooldown → pick one random animation from pool
      var canAutoAnim = !isDragging && !behavior.isSleeping() && behavior.state !== 'waking_up' && !sunGameActive;
      if (canAutoAnim) {
        var noOtherAnim = hulaPhase === 0 && !sneezeActive && !meltActive && twistPhase === 0 && applePhase === 0;
        if (noOtherAnim) {
          randomAnimCooldown -= dt * 1000;
          if (randomAnimCooldown <= 0) {
            // Pool of available animations (name → [trigger fn, sprite check])
            var pool = [];
            if (window.TwistSprite && window.TwistSprite.loaded() && window.DetwistSprite && window.DetwistSprite.loaded())
              pool.push(function() { twistPhase = 1; twistFrameIdx = 0; twistFrameTimer = 0; });
            if (window.SneezeSprite && window.SneezeSprite.loaded())
              pool.push(function() { sneezeActive = true; sneezeFrameIdx = 0; sneezeFrameTimer = 0; });
            if (window.MeltSprite && window.MeltSprite.loaded())
              pool.push(function() { meltActive = true; meltFrameIdx = 0; meltFrameTimer = 0; });
            if (window.HulaWearSprite && window.HulaWearSprite.loaded())
              pool.push(function() { hulaPhase = 1; hulaFrameIdx = 0; hulaFrameTimer = 0; });
            if (window.AppleSprite && window.AppleSprite.loaded())
              pool.push(function() { applePhase = 1; appleFrameIdx = 0; appleFrameTimer = 0; });

            if (pool.length > 0) {
              pool[Math.floor(Math.random() * pool.length)]();
          randomAnimCooldown = resetRandomAnimCooldown();
            }
          }
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

    // Update behavior (state machine) — frozen during special animations or sun game
    if (hulaPhase === 0 && !sneezeActive && !meltActive && freezePhase === 0 && !sunGameActive && applePhase === 0 && twistPhase === 0) {
      behavior.update(dt, mouseScreen, sb);
    }

    // ── Mouse-idle dance trigger ──────────────────────────────────────────
    if (!sunGameActive && !isDragging && !behavior.isSleeping()) {
      var mouseMoved = mouseScreen && lastMouseMovePos &&
        (mouseScreen.x !== lastMouseMovePos.x || mouseScreen.y !== lastMouseMovePos.y);
      if (mouseMoved) {
        mouseIdleTimer = 0;
      } else {
        mouseIdleTimer += dt;
        if (mouseIdleTimer >= MOUSE_IDLE_DANCE_S &&
            hulaPhase === 0 && twistPhase === 0 && !sneezeActive && !meltActive && enterFrameIdx < 0) {
          hulaPhase = 1;
          hulaFrameIdx = 0;
          hulaFrameTimer = 0;
          mouseIdleTimer = 0;
        }
      }
      lastMouseMovePos = mouseScreen ? { x: mouseScreen.x, y: mouseScreen.y } : lastMouseMovePos;
    } else {
      mouseIdleTimer = 0;
    }
    // ─────────────────────────────────────────────────────────────────────

    // ── Sun-dodge game update ─────────────────────────────────────────────
    if (sunGameActive) {
      sunAngle += dt * 1.8; // spinning rays

      if (sunResultTimer > 0) sunResultTimer -= dt * 1000;

      if (sunCooldown > 0) {
        sunCooldown -= dt * 1000;
        if (sunCooldown <= 0) { sunCooldown = 0; spawnSun(); }
      } else if (!meltActive) {
        sunGameTimer += dt;

        // Fox smoothly follows mouse, speed limited by sun proximity
        var fx = behavior.screenX, fy = behavior.screenY;
        var sunDist = Math.sqrt((sunSX-fx)*(sunSX-fx) + (sunSY-fy)*(sunSY-fy));
        var sunCloseness = Math.max(0, Math.min(1, 1 - (sunDist - FOX_SLOW_NEAR) / (FOX_SLOW_FAR - FOX_SLOW_NEAR)));

        // Score: 1 pt/sec baseline, multiplier 0.2× (far) → 3.0× (close)
        var scoreMultiplier = 0.2 + sunCloseness * 2.8;
        sunPoints += dt * scoreMultiplier;

        if (mouseScreen) {
          var t = Math.max(0, Math.min(1, (sunDist - FOX_SLOW_NEAR) / (FOX_SLOW_FAR - FOX_SLOW_NEAR)));
          // Higher score → lower top speed (fox gets heavier; min 30% of max)
          var speedFactor = Math.max(0.3, 1 - sunPoints / 120);
          var foxSpd = (FOX_MIN_SPEED + (FOX_MAX_SPEED - FOX_MIN_SPEED) * t) * speedFactor;
          var tx = clamp(mouseScreen.x, canvas.width/2, sb.width  - canvas.width/2);
          var ty = clamp(mouseScreen.y, canvas.height/2, sb.height - canvas.height/2);
          var mdx = tx - fx, mdy = ty - fy;
          var mdist = Math.sqrt(mdx*mdx + mdy*mdy);
          if (mdist > 1) {
            var move = Math.min(mdist, foxSpd * dt);
            behavior.screenX = fx + (mdx/mdist) * move;
            behavior.screenY = fy + (mdy/mdist) * move;
          }
        }

        // Sun pursues fox
        var fxn = behavior.screenX, fyn = behavior.screenY;
        var hdx = fxn - sunSX, hdy = fyn - sunSY;
        var hdist = Math.sqrt(hdx*hdx + hdy*hdy) || 1;
        sunVX += (hdx/hdist) * SUN_HOME_ACCEL * dt;
        sunVY += (hdy/hdist) * SUN_HOME_ACCEL * dt;
        var sunSpd = Math.sqrt(sunVX*sunVX + sunVY*sunVY);
        var maxSpd = SUN_BASE_SPEED + sunScore * SUN_SPEED_INC;
        if (sunSpd > maxSpd) { sunVX = sunVX/sunSpd*maxSpd; sunVY = sunVY/sunSpd*maxSpd; }
        sunSX += sunVX * dt;
        sunSY += sunVY * dt;

        // Collision
        if (hdist < SUN_CATCH_R && hulaPhase === 0 && twistPhase === 0 && !sneezeActive) {
          meltActive = true; meltFrameIdx = 0; meltFrameTimer = 0;
          sunScore++;
          sunCooldown = SUN_COOLDOWN_MS;
          sunResultText = '本局 ' + Math.floor(sunPoints) + ' 分';
          sunResultTimer = SUN_COOLDOWN_MS - 200;
          sunPoints = 0; // reset — new game starts after cooldown
        }
      }
    }
    // ─────────────────────────────────────────────────────────────────────

    // Check for bubble triggers (suppress during special animations)
    var animRunning = twistPhase > 0 || hulaPhase > 0 || sneezeActive || meltActive || freezePhase > 0 || bigNoseActive || applePhase > 0 || sunGameActive;
    if (!animRunning) {
      if (behavior.anim._bubbleText && window.screenToy) {
        window.screenToy.showBubble({ text: behavior.anim._bubbleText, wait: 3000 });
        behavior.anim._bubbleText = null;
      }
      if (behavior.anim._bubbleQueue && behavior.anim._bubbleQueue.length > 0 && window.screenToy) {
        window.screenToy.showBubble({ queue: behavior.anim._bubbleQueue });
        behavior.anim._bubbleQueue = null;
      }
    } else {
      // Discard bubbles queued during animation
      behavior.anim._bubbleText = null;
      behavior.anim._bubbleQueue = null;
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

    // During sun game: fox faces toward the mouse
    if (sunGameActive && !meltActive && mouseScreen) {
      var toMouseAngle = Math.atan2(mouseScreen.y - behavior.screenY, mouseScreen.x - behavior.screenX);
      behavior.anim.wanderDir = toMouseAngle;
      behavior.anim._state = 'wander';
    }

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
    } else if (sneezeActive) {
      var sneezeFrameToShow = Math.min(sneezeFrameIdx, (window.SneezeSprite ? window.SneezeSprite.FRAME_COUNT : 24) - 1);
      if (window.SneezeSprite) {
        var sneezeDW = Math.round(dW * 1.2);
        var sneezeDH = Math.round(dH * 1.2);
        var sneezeOx = Math.round(canvas.width  / 2 - sneezeDW / 2);
        var sneezeOy = Math.round(canvas.height / 2 - sneezeDH / 2);
        window.SneezeSprite.drawDirect(ctx, sneezeFrameToShow, sneezeOx, sneezeOy, sneezeDW, sneezeDH);
      }
    } else if (meltActive) {
      var meltFrameToShow = Math.min(meltFrameIdx, (window.MeltSprite ? window.MeltSprite.FRAME_COUNT : 24) - 1);
      if (window.MeltSprite) {
        // Square frame (256×256 source): size = 1.44× the shorter display side, capped at canvas
        var meltSize = Math.min(
          Math.round(Math.min(dW, dH) * 1.44),
          canvas.width - 4,
          canvas.height - 4
        );
        var meltOx = Math.round(canvas.width  / 2 - meltSize / 2);
        // Bottom-align: feet at same ground level as normal sprite; clamp so sun isn't cut
        var meltOy = Math.max(0, Math.round(oy + dH - meltSize));
        window.MeltSprite.drawDirect(ctx, meltFrameToShow, meltOx, meltOy, meltSize, meltSize);
      }
    } else if (freezePhase > 0) {
      var freezeSprite = freezePhase === 1 ? window.FreezeSprite : window.ThawSprite;
      if (freezeSprite) {
        var freezeFrameToShow = Math.min(freezeFrameIdx, freezeSprite.FRAME_COUNT - 1);
        var freezeSize = Math.min(
          Math.round(Math.min(dW, dH) * 1.22),
          canvas.width - 4,
          canvas.height - 4
        );
        var freezeOx = Math.round(canvas.width  / 2 - freezeSize / 2);
        var freezeOy = Math.max(0, Math.round(oy + dH - freezeSize));
        freezeSprite.drawDirect(ctx, freezeFrameToShow, freezeOx, freezeOy, freezeSize, freezeSize);
      }
    } else if (applePhase > 0) {
      var appleFrameToShow = Math.min(appleFrameIdx, (applePhase === 1 ? window.AppleSprite : window.HudunSprite || window.AppleSprite).FRAME_COUNT - 1);
      var appleSprite = applePhase === 1 ? window.AppleSprite : window.HudunSprite;
      if (appleSprite) {
        var appleScale = applePhase === 2 ? 1.346 : 1.3;
        var appleDW = Math.round(dW * appleScale);
        var appleDH = Math.round(dH * appleScale);
        var appleOx = Math.round(canvas.width  / 2 - appleDW / 2);
        var appleOy = Math.round(canvas.height / 2 - appleDH / 2);
        appleSprite.drawDirect(ctx, appleFrameToShow, appleOx, appleOy, appleDW, appleDH);
      }
    } else if (okActive) {
      var okFrameToShow = Math.min(okFrameIdx, (window.OkSprite ? window.OkSprite.FRAME_COUNT : 24) - 1);
      if (window.OkSprite) {
        var okDW = Math.round(dW * 1.2);
        var okDH = Math.round(dH * 1.2);
        var okOx = Math.round(canvas.width  / 2 - okDW / 2);
        var okOy = Math.round(canvas.height / 2 - okDH / 2);
        window.OkSprite.drawDirect(ctx, okFrameToShow, okOx, okOy, okDW, okDH);
      }
    } else if (bigNoseActive) {
      var bigNoseFrameToShow = Math.min(bigNoseFrameIdx, (window.BigNoseSprite ? window.BigNoseSprite.FRAME_COUNT : 24) - 1);
      if (window.BigNoseSprite) {
        var bnDW = Math.round(dW * 1.2);
        var bnDH = Math.round(dH * 1.2);
        var bnOx = Math.round(canvas.width  / 2 - bnDW / 2);
        var bnOy = Math.round(canvas.height / 2 - bnDH / 2);
        window.BigNoseSprite.drawDirect(ctx, bigNoseFrameToShow, bnOx, bnOy, bnDW, bnDH);
      }
    } else if (twistPhase > 0) {
      var twistSpriteNow = twistPhase === 1 ? window.TwistSprite
                        : twistPhase === 2 ? window.TwistStruggleSprite
                        : window.DetwistSprite;
      if (twistSpriteNow) {
        var twistFrameToShow = Math.min(twistFrameIdx, twistSpriteNow.FRAME_COUNT - 1);
        // Struggle phase draws slightly larger (1.2×) to give room for shaking effects
        var twistDW = twistPhase === 2 ? Math.round(dW * 1.2) : dW;
        var twistDH = twistPhase === 2 ? Math.round(dH * 1.2) : dH;
        var twistOx = twistPhase === 2 ? Math.round(canvas.width  / 2 - twistDW / 2) : ox;
        var twistOy = twistPhase === 2 ? Math.round(canvas.height / 2 - twistDH / 2) : oy;
        twistSpriteNow.drawDirect(ctx, twistFrameToShow, twistOx, twistOy, twistDW, twistDH);
      }
    } else {
      ctx.drawImage(spriteCanvas, 0, 0, RobotSprite.WIDTH, RobotSprite.HEIGHT, ox, oy, dW, dH);
    }

    // Sun game: drive the separate sun window via IPC
    if (sunGameActive) {
      if (!meltActive && sunCooldown <= 0) {
        var sunScreenDist = Math.sqrt((sunSX-behavior.screenX)*(sunSX-behavior.screenX) +
                                      (sunSY-behavior.screenY)*(sunSY-behavior.screenY));
        var closeness = Math.max(0, Math.min(1, 1 - (sunScreenDist - FOX_SLOW_NEAR) / (FOX_SLOW_FAR - FOX_SLOW_NEAR)));
        if (window.screenToy) window.screenToy.updateSun({ x: sunSX, y: sunSY, closeness: closeness, angle: sunAngle });

        // Score + multiplier HUD drawn on fox canvas
        var mult = 0.2 + closeness * 2.8;
        ctx.save();
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(180,60,0,0.85)';
        ctx.fillText(Math.floor(sunPoints) + '分', 4, 12);
        ctx.font = '9px sans-serif';
        ctx.fillStyle = closeness > 0.6 ? 'rgba(220,40,0,0.9)' : 'rgba(140,80,0,0.7)';
        ctx.fillText('×' + mult.toFixed(1), 4, 23);
        ctx.restore();
      } else {
        if (window.screenToy) window.screenToy.hideSun();
      }

      // Caught result message (shows during cooldown after melt)
      if (sunResultTimer > 0 && sunResultText) {
        var alpha = Math.min(1, sunResultTimer / 600);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#cc4400';
        ctx.fillText(sunResultText, canvas.width / 2, canvas.height - 6);
        ctx.restore();
      }
    }

    requestAnimationFrame(loop);
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  requestAnimationFrame(loop);
})();
