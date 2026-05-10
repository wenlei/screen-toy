// Behavior state machine for the desktop robot
(function () {
  var State = {
    IDLE: 'idle',
    WANDER: 'wander',
    SIT: 'sit',
    POKED: 'poked',
    DRAGGED: 'dragged',
    FALLING_ASLEEP: 'falling_asleep',
    SLEEPING: 'sleeping',
    WAKING_UP: 'waking_up',
  };

  function Behavior(robot) {
    this.robot = robot;
    this.state = State.IDLE;
    this.stateTimer = 0;
    this.idleDuration = rand(2.0, 4.0);
    this.wanderDuration = 0;
    this.wanderDir = 0;
    this.wanderSpeed = (window.__CONFIG && window.__CONFIG.walkSpeed) || 150;
    this.sitDuration = 0;
    this.pokeTimer = 0;
    this.pokeDuration = 0.4;
    this.blinkTimer = 0;
    this.blinkCooldown = rand(2.0, 5.0);
    this.blinkDuration = 0.12;
    this.flyTimer = 0;
    this.flyDir = 0;
    this.movementLocked = false;

    // Bubble
    var cfg2 = window.__CONFIG || {};
    this.bubbleTimer = rand(8000, 15000);
    this.bubbleQueue = [];

    var cfg = window.__CONFIG || {};
    this.settings = {
      walkSpeed: cfg.walkSpeed || 150,
      idleFrame: cfg.idleFrame || 180,
      walkFrame: cfg.walkFrame || 120,
      sitFrame: cfg.sitFrame || 400,
      pokeFrame: cfg.pokeFrame || 70,
      flyFrame: cfg.flyFrame || 80,
    };

    this.screenX = 0;
    this.screenY = 0;

    this.anim = {
      eyeDX: 0, eyeDY: 0,
      bodyBob: 0, legPhase: 0, armSwing: 0,
      squish: 0, blink: 0, sitting: false,
      flipX: false, wanderDir: 0,
      frameDuration: cfg.idleFrame || 180, walkSpeed: cfg.walkSpeed || 150,
    };

    // Velocity for wandering
    this.vx = 0;
    this.vy = 0;

    // Target eye direction (for smoothing)
    this.targetEyeDX = 0;
    this.targetEyeDY = 0;

    // Sleep/wake animation
    this.sleepAnimTimer = 0;
    this.sleepFrameIndex = 0;

    // Scheduled quotes
    this.scheduledCheckTimer = 0;
    this.lastFiredKey = '';
  }

  Behavior.prototype.initPosition = function (x, y) {
    this.screenX = x;
    this.screenY = y;
  };

  Behavior.prototype.setSettings = function (s) {
    if (s.walkSpeed !== undefined) {
      this.settings.walkSpeed = s.walkSpeed;
      this.wanderSpeed = s.walkSpeed;
      this.anim.walkSpeed = s.walkSpeed;
    }
    if (s.idleFrame !== undefined) this.settings.idleFrame = s.idleFrame;
    if (s.walkFrame !== undefined) this.settings.walkFrame = s.walkFrame;
    if (s.sitFrame !== undefined) this.settings.sitFrame = s.sitFrame;
    if (s.pokeFrame !== undefined) this.settings.pokeFrame = s.pokeFrame;
    if (s.flyFrame !== undefined) this.settings.flyFrame = s.flyFrame;
  };

  Behavior.prototype.update = function (dt, mouseScreen, screenBounds) {
    dt = Math.min(dt, 0.1); // cap to avoid large jumps

    this._updateEyeTarget(mouseScreen);
    this._smoothEyes();

    switch (this.state) {
      case State.IDLE:
        this._updateIdle(dt, mouseScreen, screenBounds);
        break;
      case State.WANDER:
        this._updateWander(dt, mouseScreen, screenBounds);
        break;
      case State.SIT:
        this._updateSit(dt);
        break;
      case State.POKED:
        this._updatePoke(dt);
        break;
      case State.DRAGGED:
        this._updateDragged(dt);
        break;
      case State.FALLING_ASLEEP:
        this._updateFallingAsleep(dt);
        break;
      case State.SLEEPING:
        this._updateSleeping(dt);
        break;
      case State.WAKING_UP:
        this._updateWakingUp(dt);
        break;
    }

    this._updateBlink(dt);
    this._updateBubble(dt);
    this._updateScheduled(dt);

    // Pass state info to sprite for frame selection
    this.anim.elapsed = this.robot.elapsed * 1000;
    this.anim._state = this.state;
  };

  Behavior.prototype._updateIdle = function (dt, mouseScreen, screenBounds) {
    this.stateTimer -= dt;
    this.vx = 0;
    this.vy = 0;

    // Idle body bob (sinusoidal)
    this.anim.bodyBob = Math.sin(this.robot.elapsed * 2.5) * 1.5;
    this.anim.legPhase = 0;
    this.anim.armSwing = 0;
    this.anim.sitting = false;
    this.anim.squish = 0;
    this.anim.frameDuration = this.settings.idleFrame;

    if (this.stateTimer <= 0) {
      if (this.movementLocked) {
        this.stateTimer = rand(2.0, 4.0); // stay idle
      } else if (Math.random() < 0.7) {
        this._startWander(screenBounds);
      } else {
        this._startSit();
      }
    }
  };

  Behavior.prototype._updateWander = function (dt, mouseScreen, screenBounds) {
    if (this.movementLocked) {
      this.vx = 0;
      this.vy = 0;
      this._startIdle();
      return;
    }
    this.stateTimer -= dt;

    // Move in wander direction
    var dx = Math.cos(this.wanderDir) * this.wanderSpeed * dt;
    var dy = Math.sin(this.wanderDir) * this.wanderSpeed * dt;

    var newX = this.screenX + dx;
    var newY = this.screenY + dy;
    var bounced = false;

    // Screen boundary check — use workArea origin (sb.x/y) if provided
    var margin = 40;
    var minX = (screenBounds.x || 0) + margin;
    var maxX = (screenBounds.x || 0) + screenBounds.width  - margin;
    var minY = (screenBounds.y || 0) + margin;
    var maxY = (screenBounds.y || 0) + screenBounds.height - margin;

    if (newX < minX) { newX = minX; bounced = true; }
    if (newX > maxX) { newX = maxX; bounced = true; }
    if (newY < minY) { newY = minY; bounced = true; }
    if (newY > maxY) { newY = maxY; bounced = true; }

    this.screenX = newX;
    this.screenY = newY;

    // Animation
    this.anim.bodyBob = Math.abs(Math.sin(this.robot.elapsed * 8)) * 2;
    this.anim.legPhase = this.robot.elapsed * 3.5;
    this.anim.armSwing = Math.sin(this.robot.elapsed * 7) * 0.35;
    this.anim.sitting = false;
    this.anim.squish = 0;
    this.anim.flipX = Math.cos(this.wanderDir) < 0;
    this.anim.wanderDir = this.wanderDir;
    this.anim.frameDuration = this.settings.walkFrame;
    this.anim.walkSpeed = this.settings.walkSpeed;

    // Bounce off edges
    if (bounced) {
      this._pickNewWanderDir();
      this.stateTimer = rand(0.8, 2.0);
    }

    if (this.stateTimer <= 0) {
      this._startIdle();
    }
  };

  Behavior.prototype._updateSit = function (dt) {
    if (!this._sitLocked) this.stateTimer -= dt;
    this.vx = 0;
    this.vy = 0;

    this.anim.bodyBob = -3;
    this.anim.legPhase = 0;
    this.anim.armSwing = 0.15;
    this.anim.sitting = true;
    this.anim.squish = 0;
    this.anim.frameDuration = this.settings.sitFrame;

    if (this.stateTimer <= 0 && !this._sitLocked) {
      this._startIdle();
    }
  };

  // Lock fox in sit (while menu is open)
  Behavior.prototype.lockSit = function () {
    this.state = State.SIT;
    this._sitLocked = true;
    this.vx = 0;
    this.vy = 0;
    // Stop any ongoing bubble while menu is open
    this.bubbleQueue = [];
    this.anim._bubbleText = null;
    this.anim._bubbleQueue = null;
    this.anim._bubbleMode = null;
  };

  Behavior.prototype.unlockSit = function () {
    this._sitLocked = false;
    // Reset bubble timer so it doesn't fire immediately after unlock
    this.bubbleTimer = rand(8000, 15000);
    this._startIdle();
  };

  Behavior.prototype._updatePoke = function (dt) {
    this.pokeTimer -= dt;
    this.vx = 0;
    this.vy = 0;

    var progress = 1 - Math.max(0, this.pokeTimer / this.pokeDuration);

    if (progress < 0.3) {
      // Squish down
      this.anim.squish = progress / 0.3;
      this.anim.bodyBob = 0;
      this.anim.blink = Math.min(1, progress / 0.15);
    } else if (progress < 0.6) {
      // Hold squished
      this.anim.squish = 1;
      this.anim.blink = 1;
      this.anim.bodyBob = -2;
    } else if (progress < 0.9) {
      // Pop up
      var popProgress = (progress - 0.6) / 0.3;
      this.anim.squish = 1 - popProgress;
      this.anim.bodyBob = -(1 - popProgress) * 6;
      this.anim.blink = Math.max(0, 1 - popProgress * 2);
      this.anim.eyeDX = 0;
      this.anim.eyeDY = -0.5;
    } else {
      // Settle
      this.anim.squish = 0;
      this.anim.bodyBob = Math.sin(progress * 20) * 2 * (1 - progress);
      this.anim.blink = 0;
    }

    this.anim.legPhase = 0;
    this.anim.armSwing = progress < 0.5 ? -0.4 : 0.4;
    this.anim.sitting = false;
    this.anim.frameDuration = this.settings.pokeFrame;

    if (this.pokeTimer <= 0) {
      this._startIdle();
    }
  };

  Behavior.prototype._updateDragged = function (dt) {
    this.anim.bodyBob = 0;
    this.anim.legPhase = 0;
    this.anim.armSwing = -0.4;
    this.anim.sitting = false;
    this.anim.squish = 0;
  };

  // ---- Bubble logic ----

  var SLEEP_FPS = 8;
  var SLEEP_TOTAL = 24;

  Behavior.prototype._updateFallingAsleep = function (dt) {
    this.sleepAnimTimer += dt;
    var frame = Math.floor(this.sleepAnimTimer * SLEEP_FPS);
    this.sleepFrameIndex = Math.min(SLEEP_TOTAL - 1, frame);
    this.anim.sleepFrame = this.sleepFrameIndex;
    this.anim.sleepProgress = this.sleepFrameIndex / (SLEEP_TOTAL - 1); // 0→1
    this.anim.bodyBob = 0; this.anim.squish = 0;
    if (frame >= SLEEP_TOTAL) {
      this.state = State.SLEEPING;
      this.sleepAnimTimer = 0;
    }
  };

  Behavior.prototype._updateSleeping = function (dt) {
    this.sleepAnimTimer += dt;
    this.sleepFrameIndex = Math.floor(this.sleepAnimTimer * SLEEP_FPS) % SLEEP_TOTAL;
    this.anim.sleepFrame = this.sleepFrameIndex;
    this.anim.sleepProgress = 1.0;
    this.anim.bodyBob = 0; this.anim.squish = 0;
  };

  Behavior.prototype._updateWakingUp = function (dt) {
    this.sleepAnimTimer += dt;
    var frame = Math.floor(this.sleepAnimTimer * SLEEP_FPS);
    this.sleepFrameIndex = Math.min(SLEEP_TOTAL - 1, frame);
    this.anim.sleepFrame = this.sleepFrameIndex;
    this.anim.sleepProgress = 1.0 - this.sleepFrameIndex / (SLEEP_TOTAL - 1); // 1→0
    this.anim.bodyBob = 0; this.anim.squish = 0;
    if (frame >= SLEEP_TOTAL) {
      this._startIdle();
    }
  };

  Behavior.prototype.isSleeping = function () {
    return this.state === State.SLEEPING || this.state === State.FALLING_ASLEEP;
  };

  Behavior.prototype.wakeUp = function () {
    if (this.state === State.SLEEPING || this.state === State.FALLING_ASLEEP) {
      this.state = State.WAKING_UP;
      this.sleepAnimTimer = 0;
      this.sleepFrameIndex = 0;
    }
  };

  Behavior.prototype._isInCorner = function () {
    // WIN_W=152 WIN_H=132, drag clamps to [76, screenW-76] x [66, screenH-66]
    // Corner = within 60px of minimum/maximum clamped position
    // Use availLeft/Top/Width/Height so Dock and menu bar are excluded correctly.
    var aL = typeof screen !== 'undefined' ? (screen.availLeft  || 0) : 0;
    var aT = typeof screen !== 'undefined' ? (screen.availTop   || 0) : 0;
    var aW = typeof screen !== 'undefined' ? (screen.availWidth  || 1440) : 1440;
    var aH = typeof screen !== 'undefined' ? (screen.availHeight || 900)  : 900;
    var nearH = this.screenX < aL + 76 + 60 || this.screenX > aL + aW - 76 - 60;
    var nearV = this.screenY < aT + 66 + 60 || this.screenY > aT + aH - 66 - 60;
    return nearH && nearV;
  };

  Behavior.prototype._updateBubble = function (dt) {
    if (this._sitLocked) return;
    if (this.state === State.SLEEPING || this.state === State.FALLING_ASLEEP || this.state === State.WAKING_UP) return;
    if (this.state !== State.IDLE && this.state !== State.SIT) return; // only idle/sit
    if (this.bubbleQueue.length > 0) return;
    this.bubbleTimer -= dt * 1000;
    if (this.bubbleTimer <= 0) {
      this._triggerRandomBubble();
      this.bubbleTimer = rand(10000, 20000);
    }
  };

  Behavior.prototype._updateScheduled = function (dt) {
    if (this._sitLocked) return;
    if (this.state === State.SLEEPING || this.state === State.FALLING_ASLEEP || this.state === State.WAKING_UP) return;
    if (this.state !== State.IDLE && this.state !== State.SIT) return; // only idle/sit
    if (this.bubbleQueue.length > 0) return;

    this.scheduledCheckTimer -= dt;
    if (this.scheduledCheckTimer > 0) return;
    this.scheduledCheckTimer = 30; // check every 30 seconds

    var schedules = (window.__CONFIG && window.__CONFIG.scheduledQuotes) || [];
    if (!schedules.length) return;

    var now = new Date();
    var key = now.getHours() + ':' + now.getMinutes();
    if (key === this.lastFiredKey) return;

    for (var i = 0; i < schedules.length; i++) {
      var s = schedules[i];
      if (s.hour === now.getHours() && s.minute === now.getMinutes()) {
        this.lastFiredKey = key;
        if (s.anim) {
          this.triggerAnim(s.anim);
        }
        if (s.text) {
          if (Array.isArray(s.text)) {
            this.bubbleQueue = s.text.slice();
            this.anim._bubbleQueue = this.bubbleQueue;
          } else {
            this.anim._bubbleText = s.text;
          }
        }
        break;
      }
    }
  };

  Behavior.prototype._triggerRandomBubble = function () {
    var seqs   = (window.__CONFIG && window.__CONFIG.sequences)    || [];
    var quotes = (window.__CONFIG && window.__CONFIG.randomQuotes) || ['你好~'];
    if (seqs.length > 0 && Math.random() < 0.5) {
      this._triggerSequence(Math.floor(Math.random() * seqs.length));
    } else {
      this.anim._bubbleText = quotes[Math.floor(Math.random() * quotes.length)];
      this.anim._bubbleMode = 'random';
    }
  };

  Behavior.prototype._triggerSequence = function (seqIndex) {
    var seqs = (window.__CONFIG && window.__CONFIG.sequences) || [];
    if (seqIndex >= 0 && seqIndex < seqs.length) {
      this.bubbleQueue = seqs[seqIndex].slice();
      this.anim._bubbleQueue = this.bubbleQueue;
      this.anim._bubbleMode = 'sequence';
    }
  };

  Behavior.prototype._triggerApiBubble = function (text) {
    var chunkSize = (window.__CONFIG && window.__CONFIG.bubbleChunkSize) || 15;
    var chunks = [];
    for (var i = 0; i < text.length; i += chunkSize) {
      chunks.push({ text: text.slice(i, i + chunkSize), wait: 1500 });
    }
    if (chunks.length > 0) chunks[chunks.length - 1].wait = 0;
    this.bubbleQueue = chunks;
    this.anim._bubbleQueue = chunks;
    this.anim._bubbleMode = 'api';
  };

  Behavior.prototype._onBubbleDone = function () {
    this.bubbleQueue = [];
  };

  Behavior.prototype._updateEyeTarget = function (mouseScreen) {
    if (!mouseScreen) return;
    var dx = mouseScreen.x - this.screenX;
    var dy = mouseScreen.y - this.screenY;
    var dist = Math.sqrt(dx * dx + dy * dy) || 1;
    var range = 80;
    this.targetEyeDX = clamp(dx / range, -1, 1);
    this.targetEyeDY = clamp(dy / range, -1, 1);
  };

  Behavior.prototype._smoothEyes = function () {
    this.anim.eyeDX += (this.targetEyeDX - this.anim.eyeDX) * 0.15;
    this.anim.eyeDY += (this.targetEyeDY - this.anim.eyeDY) * 0.15;
  };

  Behavior.prototype._updateBlink = function (dt) {
    if (this.state === State.POKED) return;
    if (this.state === State.SLEEPING || this.state === State.FALLING_ASLEEP) return;

    this.blinkCooldown -= dt;
    if (this.blinkCooldown <= 0 && this.blinkTimer <= 0) {
      this.blinkTimer = this.blinkDuration;
      this.blinkCooldown = rand(2.5, 6.0);
    }

    if (this.blinkTimer > 0) {
      this.blinkTimer -= dt;
      var half = this.blinkDuration / 2;
      if (this.blinkTimer > half) {
        this.anim.blink = 1 - (this.blinkTimer - half) / half;
      } else {
        this.anim.blink = this.blinkTimer / half;
      }
      this.anim.blink = clamp(this.anim.blink, 0, 1);
    } else {
      this.anim.blink = 0;
    }
  };

  // --- State transitions ---

  Behavior.prototype._startIdle = function () {
    this.state = State.IDLE;
    this.stateTimer = rand(2.0, 4.0);
    this.vx = 0;
    this.vy = 0;
  };

  Behavior.prototype._startWander = function (screenBounds) {
    this.state = State.WANDER;
    this.stateTimer = rand(2.0, 5.0);
    this._pickNewWanderDir();
  };

  Behavior.prototype._startSit = function () {
    this.state = State.SIT;
    this.stateTimer = rand(3.0, 8.0);
  };

  Behavior.prototype._startPoke = function () {
    this.state = State.POKED;
    this.pokeTimer = this.pokeDuration;
    this.anim.squish = 0;
    this.anim.blink = 0;
  };

  Behavior.prototype.startDrag = function (mouseScreen) {
    this.state = State.DRAGGED;
    this.dragOffsetX = mouseScreen.x - this.screenX;
    this.dragOffsetY = mouseScreen.y - this.screenY;
  };

  Behavior.prototype.stopDrag = function () {
    if (this.state === State.DRAGGED) {
      if (this._isInCorner()) {
        this.state = State.FALLING_ASLEEP;
        this.sleepAnimTimer = 0;
        this.sleepFrameIndex = 0;
      } else {
        this._startIdle();
      }
    }
  };

  Behavior.prototype._pickNewWanderDir = function () {
    // 4 cardinal directions only (matches 4-dir sprite sheet)
    var margin = 80;
    var dir;

    var aL = typeof screen !== 'undefined' ? (screen.availLeft  || 0) : 0;
    var aT = typeof screen !== 'undefined' ? (screen.availTop   || 0) : 0;
    var aW = typeof screen !== 'undefined' ? (screen.availWidth  || 1440) : 1440;
    var aH = typeof screen !== 'undefined' ? (screen.availHeight || 900)  : 900;

    var dL = this.screenX - aL;
    var dR = aL + aW - this.screenX;
    var dT = this.screenY - aT;
    var dB = aT + aH - this.screenY;

    // Bias away from nearest edge
    if (dL < margin) dir = 0;                // go right (E)
    else if (dR < margin) dir = Math.PI;      // go left (W)
    else if (dT < margin) dir = Math.PI / 2;  // go down (S)
    else if (dB < margin) dir = -Math.PI / 2; // go up (N)
    else {
      // Pick a random cardinal direction (0, π/2, π, -π/2)
      var choices = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
      dir = choices[Math.floor(Math.random() * 4)];
    }

    this.wanderDir = dir;
  };

  // --- Named animation triggers ---

  var ANIM_MAP = {
    'poke':   function (b) { b._startPoke(); },
    'sit':    function (b) { b._startSit(); },
    'idle':   function (b) { b._startIdle(); },
    'sleep':  function (b) {
      b.state = State.FALLING_ASLEEP;
      b.sleepAnimTimer = 0;
      b.sleepFrameIndex = 0;
    },
    'wakeup': function (b) { b.wakeUp(); },
    'wander': function (b) {
      var sb = {
        x:      typeof screen !== 'undefined' ? (screen.availLeft   || 0)    : 0,
        y:      typeof screen !== 'undefined' ? (screen.availTop    || 0)    : 0,
        width:  typeof screen !== 'undefined' ? (screen.availWidth  || 1440) : 1440,
        height: typeof screen !== 'undefined' ? (screen.availHeight || 900)  : 900,
      };
      b._startWander(sb);
    },
  };

  Behavior.prototype.triggerAnim = function (name) {
    var fn = ANIM_MAP[name];
    if (fn) fn(this);
  };

  // --- Click test ---

  Behavior.prototype.isClickOnRobot = function (mouseScreen, scale) {
    if (!mouseScreen) return false;
    var displayW = RobotSprite.WIDTH * scale;
    var displayH = RobotSprite.HEIGHT * scale;
    var halfW = displayW / 2;
    var halfH = displayH / 2;

    return (
      mouseScreen.x >= this.screenX - halfW &&
      mouseScreen.x <= this.screenX + halfW &&
      mouseScreen.y >= this.screenY - halfH - 5 &&
      mouseScreen.y <= this.screenY + halfH
    );
  };

  // --- Helpers ---

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  window.RobotBehavior = {
    State: State,
    Behavior: Behavior,
  };
})();
