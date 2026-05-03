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

  // Mouse state
  var mouseScreen = null;
  var isDragging = false;
  var dragOffsetX = 0;
  var dragOffsetY = 0;
  var mouseDownPos = null;

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
  }

  // --- Canvas mouse events ---
  canvas.addEventListener('mousedown', function (e) {
    if (!mouseScreen || isDragging) return;

    var onRobot = behavior.isClickOnRobot(mouseScreen, SCALE);
    if (onRobot) {
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
      // Click → show menu + lock fox in sit (no wandering or talking while menu is open)
      behavior.lockSit();
      if (window.bubbleAPI) window.bubbleAPI.done(); // hide any visible bubble immediately
      if (window.screenToy) {
        window.screenToy.showMenu({
          x: behavior.screenX,
          y: behavior.screenY,
        });
        window.screenToy.stopDrag();
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

    // Screen bounds
    var sb = {
      width: typeof screen !== 'undefined' ? screen.width : 1440,
      height: typeof screen !== 'undefined' ? screen.height : 900,
    };

    // During drag, update position from mouseScreen
    if (isDragging && mouseScreen) {
      behavior.screenX = mouseScreen.x - dragOffsetX;
      behavior.screenY = mouseScreen.y - dragOffsetY;
      // Clamp to screen
      var margin = 20;
      behavior.screenX = clamp(behavior.screenX, margin, sb.width - margin);
      behavior.screenY = clamp(behavior.screenY, margin, sb.height - margin);
    }

    // Update behavior (state machine)
    behavior.update(dt, mouseScreen, sb);

    // Check for bubble triggers
    if (behavior.anim._bubbleText && window.screenToy) {
      window.screenToy.showBubble({ text: behavior.anim._bubbleText, wait: 3000 });
      behavior.anim._bubbleText = null;
    }
    if (behavior.anim._bubbleQueue && behavior.anim._bubbleQueue.length > 0 && window.screenToy) {
      window.screenToy.showBubble({ queue: behavior.anim._bubbleQueue });
      behavior.anim._bubbleQueue = null;
      behavior.bubbleQueue = [];
    }

    // Sync window position to robot position
    moveWindow(behavior.screenX, behavior.screenY);

    // Send robot bounds to main process for click-through management
    boundsSendTimer += dt;
    if (boundsSendTimer > 0.05) {
      boundsSendTimer = 0;
      var displayW = RobotSprite.WIDTH * SCALE;
      var displayH = RobotSprite.HEIGHT * SCALE;
      var wx = canvas.width / 2 - displayW / 2;
      var wy = canvas.height / 2 - displayH / 2;
      if (window.screenToy && !isDragging) {
        window.screenToy.sendBounds({ x: wx, y: wy, w: displayW, h: displayH });
      }
    }

    // --- Render ---
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw robot to offscreen canvas
    RobotSprite.draw(spriteCtx, behavior.anim);

    // Draw subtle glow for visibility against any background
    var dW = RobotSprite.WIDTH * SCALE;
    var dH = RobotSprite.HEIGHT * SCALE;
    var ox = Math.round(canvas.width / 2 - dW / 2);
    var oy = Math.round(canvas.height / 2 - dH / 2);

    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.ellipse(canvas.width / 2, canvas.height / 2 + dH * 0.35, dW * 0.4, dH * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Draw to main canvas (scaled, centered)
    ctx.drawImage(spriteCanvas, 0, 0, RobotSprite.WIDTH, RobotSprite.HEIGHT, ox, oy, dW, dH);

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
