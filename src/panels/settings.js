(function () {
  var cfg = window.__CONFIG || {};
  var defaults = {
    idleFrame:    cfg.idleFrame    || 180,
    walkFrame:    cfg.walkFrame    || 120,
    walkSpeed:    cfg.walkSpeed    || 150,
    sitFrame:     cfg.sitFrame     || 400,
    pokeFrame:    cfg.pokeFrame    || 70,
    displayScale: cfg.displayScale || 0.7,
    showWindowBorder: false,
  };

  var menuApps = [];

  var els = {
    idleFrame:        document.getElementById('idleFrame'),
    walkFrame:        document.getElementById('walkFrame'),
    walkSpeed:        document.getElementById('walkSpeed'),
    sitFrame:         document.getElementById('sitFrame'),
    pokeFrame:        document.getElementById('pokeFrame'),
    displayScale:     document.getElementById('displayScale'),
    idleFrameVal:     document.getElementById('idleFrameVal'),
    walkFrameVal:     document.getElementById('walkFrameVal'),
    walkSpeedVal:     document.getElementById('walkSpeedVal'),
    sitFrameVal:      document.getElementById('sitFrameVal'),
    pokeFrameVal:     document.getElementById('pokeFrameVal'),
    displayScaleVal:  document.getElementById('displayScaleVal'),
    appList:          document.getElementById('appList'),
    customAppSelect:  document.getElementById('customAppSelect'),
    addAppBtn:        document.getElementById('addAppBtn'),
    applyBtn:         document.getElementById('applyBtn'),
    resetBtn:         document.getElementById('resetBtn'),
    menuBtn:          document.getElementById('menuBtn'),
    dialogBtn:        document.getElementById('dialogBtn'),
    showWindowBorder: document.getElementById('showWindowBorder'),
    animGrid:         document.getElementById('animGrid'),
    statusText:       document.getElementById('statusText'),
  };

  // ---- Label update ----
  function updateLabels() {
    els.idleFrameVal.textContent   = els.idleFrame.value;
    els.walkFrameVal.textContent   = els.walkFrame.value;
    els.walkSpeedVal.textContent   = els.walkSpeed.value;
    els.sitFrameVal.textContent    = els.sitFrame.value;
    els.pokeFrameVal.textContent   = els.pokeFrame.value;
    els.displayScaleVal.textContent = els.displayScale.value;
  }

  Object.keys(els).forEach(function (key) {
    var el = els[key];
    if (el && el.type === 'range') el.addEventListener('input', updateLabels);
  });

  // ---- Animation buttons ----
  var ANIMS = [
    { id: 'twist',      label: '拧巴 → 不拧巴',    icon: '🌀', durationMs: 4000 },
    { id: 'hula',       label: '穿裙 → 跳舞 → 脱裙', icon: '🌺', durationMs: 6000 },
    { id: 'sneeze',     label: '打喷嚏',            icon: '🤧', durationMs: 2000 },
    { id: 'melt',       label: '热化了',            icon: '☀️', durationMs: 3000 },
    { id: 'sun-toggle', label: '躲太阳',            icon: '🎮', isToggle: true },
    { id: 'apple',      label: '苹果 → 狐顿',        icon: '🍎', durationMs: 4000 },
  ];

  var animTimers = {};
  var sunGameOn = false;

  ANIMS.forEach(function (anim) {
    var btn = document.createElement('button');
    btn.className = 'anim-btn';
    btn.dataset.id = anim.id;
    btn.innerHTML = '<span class="anim-icon">' + anim.icon + '</span><span>' + anim.label + '</span>';
    btn.addEventListener('click', function () {
      if (window.screenToySettings) {
        window.screenToySettings.triggerAnimation(anim.id);
      }
      if (anim.isToggle) {
        sunGameOn = !sunGameOn;
        btn.classList.toggle('playing', sunGameOn);
      } else {
        btn.classList.add('playing');
        clearTimeout(animTimers[anim.id]);
        animTimers[anim.id] = setTimeout(function () {
          btn.classList.remove('playing');
        }, anim.durationMs || 4000);
      }
    });
    els.animGrid.appendChild(btn);
  });

  // ---- App list ----
  function renderMenuApps() {
    els.appList.innerHTML = '';
    menuApps.forEach(function (app, i) { addAppItem(app, i); });
  }

  function addAppItem(app, index) {
    var row = document.createElement('div');
    row.className = 'app-item';

    var iconEl = document.createElement('span');
    iconEl.className = 'app-icon';
    if (app.iconUrl) {
      var img = document.createElement('img');
      img.src = app.iconUrl;
      img.alt = '';
      iconEl.appendChild(img);
    } else {
      iconEl.textContent = app.icon || '📱';
    }
    row.appendChild(iconEl);

    var nameEl = document.createElement('span');
    nameEl.className = 'app-name';
    nameEl.textContent = app.name || '';
    row.appendChild(nameEl);

    var del = document.createElement('span');
    del.className = 'del';
    del.textContent = '✕';
    del.addEventListener('click', function () {
      menuApps.splice(index, 1);
      renderMenuApps();
    });
    row.appendChild(del);

    els.appList.appendChild(row);
  }

  // ---- Values ----
  function getValues() {
    return {
      idleFrame:        parseInt(els.idleFrame.value),
      walkFrame:        parseInt(els.walkFrame.value),
      walkSpeed:        parseInt(els.walkSpeed.value),
      sitFrame:         parseInt(els.sitFrame.value),
      pokeFrame:        parseInt(els.pokeFrame.value),
      displayScale:     parseFloat(els.displayScale.value),
      showWindowBorder: els.showWindowBorder.checked,
      menuApps: menuApps.map(function (a) {
        return { id: a.id, name: a.name, icon: a.icon || '', cmd: a.cmd || '', appPath: a.appPath || '' };
      }),
    };
  }

  function setValues(v) {
    els.idleFrame.value        = v.idleFrame    != null ? v.idleFrame    : defaults.idleFrame;
    els.walkFrame.value        = v.walkFrame    != null ? v.walkFrame    : defaults.walkFrame;
    els.walkSpeed.value        = v.walkSpeed    != null ? v.walkSpeed    : defaults.walkSpeed;
    els.sitFrame.value         = v.sitFrame     != null ? v.sitFrame     : defaults.sitFrame;
    els.pokeFrame.value        = v.pokeFrame    != null ? v.pokeFrame    : defaults.pokeFrame;
    els.displayScale.value     = v.displayScale != null ? v.displayScale : defaults.displayScale;
    els.showWindowBorder.checked = !!v.showWindowBorder;
    if (v.menuApps) menuApps = v.menuApps.slice();
    renderMenuApps();
    updateLabels();
  }

  // ---- Emoji fallback ----
  function pickEmoji(name) {
    var n = name.toLowerCase();
    var map = [
      ['chrome','🌐'],['firefox','🦊'],['safari','🧭'],['mail','📧'],['music','🎵'],
      ['photos','📸'],['finder','📁'],['terminal','⬛'],['code','💻'],['slack','💬'],
      ['discord','🎮'],['spotify','🎵'],['netflix','🎬'],['steam','🎮'],['word','📘'],
      ['excel','📗'],['powerpoint','📙'],['notion','📋'],['figma','🎨'],['xcode','🔨'],
      ['sublime','💎'],['vscode','💙'],['calc','🔢'],['calculator','🔢'],['notes','📝'],
      ['reminders','✅'],['calendar','📅'],['messages','💬'],['maps','🗺️'],
      ['weather','🌤️'],['clock','⏰'],['settings','⚙️'],['preview','🖼️'],
      ['keynote','📊'],['pages','📄'],['numbers','📊'],['wechat','💬'],['github','🐙'],
    ];
    for (var i = 0; i < map.length; i++) {
      if (n.includes(map[i][0])) return map[i][1];
    }
    return '📱';
  }

  els.addAppBtn.addEventListener('click', function () {
    var name = els.customAppSelect.value;
    if (!name) return;
    var id = 'custom-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if (menuApps.some(function (a) { return a.id === id; })) {
      els.statusText.textContent = '已存在';
      setTimeout(function () { els.statusText.textContent = ''; }, 1500);
      return;
    }
    menuApps.push({ id: id, name: name, icon: pickEmoji(name),
      cmd: 'open -a "' + name + '"', appPath: '/Applications/' + name + '.app' });
    els.customAppSelect.value = '';
    renderMenuApps();
    els.statusText.textContent = '已添加 ' + name;
    setTimeout(function () { els.statusText.textContent = ''; }, 2000);
  });

  if (window.screenToySettings) {
    window.screenToySettings.onInstalledApps(function (apps) {
      var sel = els.customAppSelect;
      sel.innerHTML = '<option value="">— 选择应用 —</option>';
      apps.forEach(function (name) {
        var opt = document.createElement('option');
        opt.value = name; opt.textContent = name;
        sel.appendChild(opt);
      });
    });
    window.screenToySettings.getInstalledApps();

    window.screenToySettings.onLoad(function (v) { setValues(v); });
  }

  // ---- Apply / Reset ----
  els.applyBtn.addEventListener('click', function () {
    if (window.screenToySettings) {
      window.screenToySettings.apply(getValues());
      els.statusText.textContent = '已应用';
      setTimeout(function () { els.statusText.textContent = ''; }, 1500);
    }
  });

  els.resetBtn.addEventListener('click', function () {
    setValues(defaults);
    if (window.screenToySettings) {
      window.screenToySettings.apply(getValues());
      els.statusText.textContent = '已重置';
      setTimeout(function () { els.statusText.textContent = ''; }, 1500);
    }
  });

  // ---- Quick actions ----
  els.menuBtn.addEventListener('click', function () {
    if (window.screenToySettings) window.screenToySettings.openAppMenu();
  });
  els.dialogBtn.addEventListener('click', function () {
    if (window.screenToySettings) window.screenToySettings.openDialog();
  });

  function applyBorder(show) {
    document.getElementById('winBorder').style.display = show ? 'block' : 'none';
  }
  els.showWindowBorder.addEventListener('change', function () {
    applyBorder(this.checked);
    if (window.screenToySettings) window.screenToySettings.apply(getValues());
  });
  if (window.screenToySettings) {
    window.screenToySettings.onBorder(function (show) { applyBorder(show); });
  }

})();
