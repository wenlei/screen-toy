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

    // Independent airplane
    this.airplane = {
      active: false,
      x: 0, y: 0,
      startX: 0, startY: 0,
      endX: 0, endY: 0,
      arcHeight: 200,
      timer: 0,
      duration: 2.5,
      direction: 'E',
    };

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
    this._updateAirplane(dt);

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
      // Transition: randomly wander or sit
      if (Math.random() < 0.7) {
        this._startWander(screenBounds);
      } else {
        this._startSit();
      }
    }
  };

  Behavior.prototype._updateWander = function (dt, mouseScreen, screenBounds) {
    this.stateTimer -= dt;

    // Move in wander direction
    var dx = Math.cos(this.wanderDir) * this.wanderSpeed * dt;
    var dy = Math.sin(this.wanderDir) * this.wanderSpeed * dt;

    var newX = this.screenX + dx;
    var newY = this.screenY + dy;
    var bounced = false;

    // Screen boundary check
    var margin = 40;
    var minX = margin;
    var maxX = screenBounds.width - margin;
    var minY = margin;
    var maxY = screenBounds.height - margin;

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
      this._trySpawnAirplane();
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

  // ---- Airplane (independent object) ----

  Behavior.prototype._trySpawnAirplane = function () {
    if (this.airplane.active) return;
    if (Math.random() > 0.2) return; // 20% chance

    var screenW = typeof screen !== 'undefined' ? screen.width : 1440;
    var screenH = typeof screen !== 'undefined' ? screen.height : 900;

    // Spawn from dog's current position
    this.airplane.startX = this.screenX;
    this.airplane.startY = this.screenY;

    // Fly to a random edge
    var edge = Math.floor(Math.random() * 4);
    switch (edge) {
      case 0: this.airplane.endX = screenW + 100; this.airplane.endY = rand(100, screenH - 100); break;
      case 1: this.airplane.endX = -100; this.airplane.endY = rand(100, screenH - 100); break;
      case 2: this.airplane.endX = rand(100, screenW - 100); this.airplane.endY = -100; break;
      case 3: this.airplane.endX = rand(100, screenW - 100); this.airplane.endY = screenH + 100; break;
    }

    // Direction based on horizontal movement
    this.airplane.direction = (this.airplane.endX > this.airplane.startX) ? 'E' : 'W';

    this.airplane.arcHeight = rand(150, 300);
    this.airplane.duration = rand(2.0, 3.5);
    this.airplane.timer = 0;
    this.airplane.active = true;
  };

  Behavior.prototype._updateAirplane = function (dt) {
    var ap = this.airplane;
    if (!ap.active) return;

    ap.timer += dt;
    var t = Math.min(ap.timer / ap.duration, 1);

    // Parabolic arc: x linear, y with sine arc
    ap.x = ap.startX + (ap.endX - ap.startX) * t;
    ap.y = ap.startY + (ap.endY - ap.startY) * t - ap.arcHeight * Math.sin(Math.PI * t);

    if (t >= 1) {
      ap.active = false;
    }
  };

  // ---- Bubble logic ----

  Behavior.prototype._updateFallingAsleep = function (dt) {
    var FPS = 8, TOTAL = 24;
    this.sleepAnimTimer += dt;
    this.sleepFrameIndex = Math.min(TOTAL - 1, Math.floor(this.sleepAnimTimer * FPS));
    this.anim.sleepFrame = this.sleepFrameIndex;
    this.anim.bodyBob = 0; this.anim.squish = 0;
    if (this.sleepFrameIndex >= TOTAL - 1) {
      this.state = State.SLEEPING;
    }
  };

  Behavior.prototype._updateSleeping = function () {
    this.anim.sleepFrame = 23;
    this.anim.bodyBob = 0; this.anim.squish = 0;
  };

  Behavior.prototype._updateWakingUp = function (dt) {
    var FPS = 8, TOTAL = 24;
    this.sleepAnimTimer += dt;
    this.sleepFrameIndex = Math.min(TOTAL - 1, Math.floor(this.sleepAnimTimer * FPS));
    this.anim.sleepFrame = this.sleepFrameIndex;
    this.anim.bodyBob = 0; this.anim.squish = 0;
    if (this.sleepFrameIndex >= TOTAL - 1) {
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
    var screenW = typeof screen !== 'undefined' ? screen.width : 1440;
    var screenH = typeof screen !== 'undefined' ? screen.height : 900;
    var nearH = this.screenX < 76 + 60 || this.screenX > screenW - 76 - 60;
    var nearV = this.screenY < 66 + 60 || this.screenY > screenH - 66 - 60;
    return nearH && nearV;
  };

  Behavior.prototype._updateBubble = function (dt) {
    if (this._sitLocked) return;
    if (this.state === State.SLEEPING || this.state === State.FALLING_ASLEEP || this.state === State.WAKING_UP) return;
    if (this.bubbleQueue.length > 0) return;
    this.bubbleTimer -= dt * 1000;
    if (this.bubbleTimer <= 0) {
      this._triggerRandomBubble();
      this.bubbleTimer = rand(10000, 20000);
    }
  };

  Behavior.prototype._triggerRandomBubble = function () {
    var quotes = (window.__CONFIG && window.__CONFIG.randomQuotes) || ['你好~'];
    var q = quotes[Math.floor(Math.random() * quotes.length)];
    this.anim._bubbleText = q;
    this.anim._bubbleMode = 'random';
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

    var screenW = typeof window !== 'undefined' ? screen.width : 1440;
    var screenH = typeof window !== 'undefined' ? screen.height : 900;

    var dL = this.screenX;
    var dR = screenW - this.screenX;
    var dT = this.screenY;
    var dB = screenH - this.screenY;

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
