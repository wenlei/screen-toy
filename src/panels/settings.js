(function () {
  var cfg = window.__CONFIG || {};
  var defaults = {
    idleFrame:          cfg.idleFrame          || 180,
    walkFrame:          cfg.walkFrame          || 120,
    walkSpeed:          cfg.walkSpeed          || 150,
    sitFrame:           cfg.sitFrame           || 400,
    pokeFrame:          cfg.pokeFrame          || 70,
    displayScale:       cfg.displayScale       || 0.7,
    bubbleOffsetY:      cfg.bubbleOffsetY      != null ? cfg.bubbleOffsetY : 0,
    bubbleCloudOffset:  cfg.bubbleCloudOffset  != null ? cfg.bubbleCloudOffset : 0,
    bubbleCanvasTopPad: cfg.bubbleCanvasTopPad || 55,
    bubbleCanvasBotPad: cfg.bubbleCanvasBotPad || 30,
    bubbleExpand:       cfg.bubbleExpand        != null ? cfg.bubbleExpand : 0,
    bubbleScale:        cfg.bubbleScale        || 0.85,
    bubbleClipX:        cfg.bubbleClipX        != null ? cfg.bubbleClipX        : 0,
    bubbleClipYTop:     cfg.bubbleClipYTop     != null ? cfg.bubbleClipYTop     : 0,
    bubbleDrawOffsetX:  cfg.bubbleDrawOffsetX  || 0,
    bubbleMenuLeft:     cfg.bubbleMenuLeft      != null ? cfg.bubbleMenuLeft : 100,
    bubbleMenuTop:      cfg.bubbleMenuTop      || 90,
    showBubbleDebug:    false,
  };

  var menuApps = []; // flat array of {id, name, icon, cmd, appPath}

  var els = {
    idleFrame:              document.getElementById('idleFrame'),
    walkFrame:              document.getElementById('walkFrame'),
    walkSpeed:              document.getElementById('walkSpeed'),
    sitFrame:               document.getElementById('sitFrame'),
    pokeFrame:              document.getElementById('pokeFrame'),
    displayScale:           document.getElementById('displayScale'),
    idleFrameVal:           document.getElementById('idleFrameVal'),
    walkFrameVal:           document.getElementById('walkFrameVal'),
    walkSpeedVal:           document.getElementById('walkSpeedVal'),
    sitFrameVal:            document.getElementById('sitFrameVal'),
    pokeFrameVal:           document.getElementById('pokeFrameVal'),
    displayScaleVal:        document.getElementById('displayScaleVal'),
    bubbleScale:            document.getElementById('bubbleScale'),
    bubbleScaleVal:         document.getElementById('bubbleScaleVal'),
    bubbleOffsetY:          document.getElementById('bubbleOffsetY'),
    bubbleCloudOffset:      document.getElementById('bubbleCloudOffset'),
    bubbleCanvasTopPad:     document.getElementById('bubbleCanvasTopPad'),
    bubbleCanvasBotPad:     document.getElementById('bubbleCanvasBotPad'),
    bubbleExpand:           document.getElementById('bubbleExpand'),
    bubbleClipX:            document.getElementById('bubbleClipX'),
    bubbleClipYTop:         document.getElementById('bubbleClipYTop'),
    bubbleDrawOffsetX:      document.getElementById('bubbleDrawOffsetX'),
    bubbleMenuLeft:         document.getElementById('bubbleMenuLeft'),
    bubbleMenuTop:          document.getElementById('bubbleMenuTop'),
    bubbleOffsetYVal:       document.getElementById('bubbleOffsetYVal'),
    bubbleCloudOffsetVal:   document.getElementById('bubbleCloudOffsetVal'),
    bubbleCanvasTopPadVal:  document.getElementById('bubbleCanvasTopPadVal'),
    bubbleCanvasBotPadVal:  document.getElementById('bubbleCanvasBotPadVal'),
    bubbleExpandVal:        document.getElementById('bubbleExpandVal'),
    bubbleClipXVal:         document.getElementById('bubbleClipXVal'),
    bubbleClipYTopVal:      document.getElementById('bubbleClipYTopVal'),
    bubbleDrawOffsetXVal:   document.getElementById('bubbleDrawOffsetXVal'),
    bubbleMenuLeftVal:      document.getElementById('bubbleMenuLeftVal'),
    bubbleMenuTopVal:       document.getElementById('bubbleMenuTopVal'),
    appList:                document.getElementById('appList'),
    customAppSelect:        document.getElementById('customAppSelect'),
    addAppBtn:              document.getElementById('addAppBtn'),
    applyBtn:               document.getElementById('applyBtn'),
    resetBtn:               document.getElementById('resetBtn'),
    menuBtn:                document.getElementById('menuBtn'),
    dialogBtn:              document.getElementById('dialogBtn'),
    previewBubbleBtn:       document.getElementById('previewBubbleBtn'),
    showBubbleDebug:        document.getElementById('showBubbleDebug'),
    showWindowBorder:       document.getElementById('showWindowBorder'),
    livePreview:            document.getElementById('livePreview'),
    statusText:             document.getElementById('statusText'),
  };

  // ---- Live label update ----
  function updateLabels() {
    els.idleFrameVal.textContent          = els.idleFrame.value;
    els.walkFrameVal.textContent          = els.walkFrame.value;
    els.walkSpeedVal.textContent          = els.walkSpeed.value;
    els.sitFrameVal.textContent           = els.sitFrame.value;
    els.pokeFrameVal.textContent          = els.pokeFrame.value;
    els.displayScaleVal.textContent       = els.displayScale.value;
    els.bubbleScaleVal.textContent        = els.bubbleScale.value;
    els.bubbleOffsetYVal.textContent      = els.bubbleOffsetY.value;
    els.bubbleCloudOffsetVal.textContent  = els.bubbleCloudOffset.value;
    els.bubbleCanvasTopPadVal.textContent = els.bubbleCanvasTopPad.value;
    els.bubbleCanvasBotPadVal.textContent = els.bubbleCanvasBotPad.value;
    els.bubbleExpandVal.textContent       = els.bubbleExpand.value;
    els.bubbleClipXVal.textContent        = els.bubbleClipX.value;
    els.bubbleClipYTopVal.textContent     = els.bubbleClipYTop.value;
    els.bubbleDrawOffsetXVal.textContent  = els.bubbleDrawOffsetX.value;
    els.bubbleMenuLeftVal.textContent     = els.bubbleMenuLeft.value;
    els.bubbleMenuTopVal.textContent      = els.bubbleMenuTop.value;
  }

  Object.keys(els).forEach(function (key) {
    var el = els[key];
    if (el && el.type === 'range') el.addEventListener('input', function () {
      updateLabels();
      if (els.livePreview && els.livePreview.checked && window.screenToySettings) {
        window.screenToySettings.livePreviewUpdate(getValues());
      }
    });
  });

  // ---- App list rendering ----
  function renderMenuApps() {
    els.appList.innerHTML = '';
    menuApps.forEach(function (app, i) {
      addAppItem(app, i);
    });
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
      idleFrame:          parseInt(els.idleFrame.value),
      walkFrame:          parseInt(els.walkFrame.value),
      walkSpeed:          parseInt(els.walkSpeed.value),
      sitFrame:           parseInt(els.sitFrame.value),
      pokeFrame:          parseInt(els.pokeFrame.value),
      displayScale:       parseFloat(els.displayScale.value),
      bubbleOffsetY:      parseInt(els.bubbleOffsetY.value),
      bubbleCloudOffset:  parseInt(els.bubbleCloudOffset.value),
      bubbleCanvasTopPad: parseInt(els.bubbleCanvasTopPad.value),
      bubbleCanvasBotPad: parseInt(els.bubbleCanvasBotPad.value),
      bubbleExpand:       parseInt(els.bubbleExpand.value),
      bubbleScale:        parseFloat(els.bubbleScale.value),
      bubbleClipX:        parseInt(els.bubbleClipX.value),
      bubbleClipYTop:     parseInt(els.bubbleClipYTop.value),
      bubbleDrawOffsetX:  parseInt(els.bubbleDrawOffsetX.value),
      bubbleMenuLeft:     parseInt(els.bubbleMenuLeft.value),
      bubbleMenuTop:      parseInt(els.bubbleMenuTop.value),
      showBubbleDebug:    els.showBubbleDebug.checked,
      showWindowBorder:   els.showWindowBorder.checked,
      menuApps: menuApps.map(function (a) {
        return { id: a.id, name: a.name, icon: a.icon || '', cmd: a.cmd || '', appPath: a.appPath || '' };
      }),
    };
  }

  function setValues(v) {
    els.idleFrame.value          = v.idleFrame          != null ? v.idleFrame          : defaults.idleFrame;
    els.walkFrame.value          = v.walkFrame          != null ? v.walkFrame          : defaults.walkFrame;
    els.walkSpeed.value          = v.walkSpeed          != null ? v.walkSpeed          : defaults.walkSpeed;
    els.sitFrame.value           = v.sitFrame           != null ? v.sitFrame           : defaults.sitFrame;
    els.pokeFrame.value          = v.pokeFrame          != null ? v.pokeFrame          : defaults.pokeFrame;
    els.displayScale.value       = v.displayScale       != null ? v.displayScale       : defaults.displayScale;
    els.bubbleOffsetY.value      = v.bubbleOffsetY      != null ? v.bubbleOffsetY      : defaults.bubbleOffsetY;
    els.bubbleCloudOffset.value  = v.bubbleCloudOffset  != null ? v.bubbleCloudOffset  : defaults.bubbleCloudOffset;
    els.bubbleCanvasTopPad.value = v.bubbleCanvasTopPad != null ? v.bubbleCanvasTopPad : defaults.bubbleCanvasTopPad;
    els.bubbleCanvasBotPad.value = v.bubbleCanvasBotPad != null ? v.bubbleCanvasBotPad : defaults.bubbleCanvasBotPad;
    els.bubbleExpand.value       = v.bubbleExpand       != null ? v.bubbleExpand       : defaults.bubbleExpand;
    els.bubbleScale.value        = v.bubbleScale        != null ? v.bubbleScale        : defaults.bubbleScale;
    els.bubbleClipX.value        = v.bubbleClipX        != null ? v.bubbleClipX        : defaults.bubbleClipX;
    els.bubbleClipYTop.value     = v.bubbleClipYTop     != null ? v.bubbleClipYTop     : defaults.bubbleClipYTop;
    els.bubbleDrawOffsetX.value  = v.bubbleDrawOffsetX  != null ? v.bubbleDrawOffsetX  : defaults.bubbleDrawOffsetX;
    els.bubbleMenuLeft.value     = v.bubbleMenuLeft     != null ? v.bubbleMenuLeft     : defaults.bubbleMenuLeft;
    els.bubbleMenuTop.value      = v.bubbleMenuTop      != null ? v.bubbleMenuTop      : defaults.bubbleMenuTop;
    els.showBubbleDebug.checked  = !!v.showBubbleDebug;
    els.showWindowBorder.checked = !!v.showWindowBorder;
    if (v.menuApps) menuApps = v.menuApps.slice();
    renderMenuApps();
    updateLabels();
  }

  // ---- Emoji fallback for unknown apps ----
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

  // ---- Add app from installed apps dropdown ----
  els.addAppBtn.addEventListener('click', function () {
    var name = els.customAppSelect.value;
    if (!name) return;
    var id = 'custom-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if (menuApps.some(function (a) { return a.id === id; })) {
      els.statusText.textContent = '已存在';
      setTimeout(function () { els.statusText.textContent = ''; }, 1500);
      return;
    }
    menuApps.push({
      id: id,
      name: name,
      icon: pickEmoji(name),
      cmd: 'open -a "' + name + '"',
      appPath: '/Applications/' + name + '.app',
    });
    els.customAppSelect.value = '';
    renderMenuApps();
    els.statusText.textContent = '已添加 ' + name;
    setTimeout(function () { els.statusText.textContent = ''; }, 2000);
  });

  // ---- Installed apps dropdown ----
  if (window.screenToySettings) {
    window.screenToySettings.onInstalledApps(function (apps) {
      var sel = els.customAppSelect;
      sel.innerHTML = '<option value="">— 选择应用 —</option>';
      apps.forEach(function (name) {
        var opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        sel.appendChild(opt);
      });
    });
    window.screenToySettings.getInstalledApps();
  }

  // ---- IPC: receive current settings ----
  if (window.screenToySettings) {
    window.screenToySettings.onLoad(function (v) {
      setValues(v);
    });
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

  els.previewBubbleBtn.addEventListener('click', function () {
    if (window.screenToySettings) {
      window.screenToySettings.apply(getValues());
      window.screenToySettings.previewBubble();
    }
  });

  // ---- Live preview toggle ----
  els.livePreview.addEventListener('change', function () {
    if (!window.screenToySettings) return;
    if (this.checked) {
      window.screenToySettings.apply(getValues());
      window.screenToySettings.livePreviewStart();
    } else {
      window.screenToySettings.livePreviewStop();
    }
  });

})();
