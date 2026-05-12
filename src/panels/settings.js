(function () {
  console.log('[Settings] Script starting...');
  var cfg = window.__CONFIG || {};
  var defaults = {
    agentApiKey:   'glywLStqwOGbkLNpO1f3ODZ0EACBTH3X',
    agentEndpoint: 'https://developer.zhihu.com/v1/chat/completions',
    agentModel:    'zhida-fast-1p5',
    agentProvider: 'zhihu',
    hotListLimit: 10,
    mbtiEI: 'E',
    mbtiSN: 'N',
    mbtiTF: 'T',
    mbtiJP: 'P',
  };

  var menuApps = [];

  var ZHIHU_MODELS = ['zhida-fast-1p5', 'zhida-thinking-1p5', 'zhida-agent'];

  var els = {
    appList:          document.getElementById('appList'),
    customAppSelect:  document.getElementById('customAppSelect'),
    addAppBtn:        document.getElementById('addAppBtn'),
    menuBtn:          document.getElementById('menuBtn'),
    dialogBtn:        document.getElementById('dialogBtn'),
    animGrid:         document.getElementById('animGrid'),
    sunToggleBtn:     document.getElementById('sunToggleBtn'),
    agentApiKey:      document.getElementById('agentApiKey'),
    agentProvider:    document.getElementById('agentProvider'),
    zhihuModel:       document.getElementById('zhihuModel'),
    toggleApiKey:    document.getElementById('toggleApiKey'),
    openApiPage:      document.getElementById('openApiPage'),
    hotListLimit:     document.getElementById('hotListLimit'),
    hotListLimitVal:  document.getElementById('hotListLimitVal'),
  };

  // ---- Animation buttons ----
  var ANIMS = [
    { id: 'twist',      label: '别拧巴了',          icon: '🌀', durationMs: 4000 },
    { id: 'hula',       label: '草裙舞',              icon: '🌺', durationMs: 6000 },
    { id: 'sneeze',     label: '打喷嚏',            icon: '🤧', durationMs: 2000 },
    { id: 'melt',       label: '热化了',            icon: '☀️', durationMs: 3000 },
    { id: 'apple',      label: '狐顿',                icon: '🍎', durationMs: 4000 },
    { id: 'freeze',     label: '冻成冰棍',            icon: '🧊', durationMs: 6000 },
    { id: 'bignose',    label: '大鼻子',              icon: '👃', durationMs: 2000 },
    { id: 'flower',     label: '人生亦如是',           icon: '🌸', durationMs: 5000 },
  ];

  var animTimers = {};

  ANIMS.forEach(function (anim) {
    var btn = document.createElement('button');
    btn.className = 'anim-btn';
    btn.dataset.id = anim.id;
    btn.innerHTML = '<span class="anim-icon">' + anim.icon + '</span><span>' + anim.label + '</span>';
    btn.addEventListener('click', function () {
      if (window.screenToySettings) {
        window.screenToySettings.triggerAnimation(anim.id);
      }
      btn.classList.add('playing');
      clearTimeout(animTimers[anim.id]);
      animTimers[anim.id] = setTimeout(function () {
        btn.classList.remove('playing');
      }, anim.durationMs || 4000);
    });
    els.animGrid.appendChild(btn);
  });

  // ---- 躲太阳 toggle ----
  var sunGameOn = false;
  els.sunToggleBtn.addEventListener('click', function () {
    if (window.screenToySettings) window.screenToySettings.triggerAnimation('sun-toggle');
    sunGameOn = !sunGameOn;
    els.sunToggleBtn.classList.toggle('playing', sunGameOn);
  });

  // ---- App list ----
  function renderMenuApps() {
    els.appList.innerHTML = '';
    if (!menuApps || menuApps.length === 0) {
      var empty = document.createElement('div');
      empty.style.cssText = 'font-size:12px;color:#bbb;padding:4px 0;';
      empty.textContent = '暂无应用，从下方下拉框选择添加';
      els.appList.appendChild(empty);
      return;
    }
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
      if (window.screenToySettings) window.screenToySettings.apply(getValues());
    });
    row.appendChild(del);

    els.appList.appendChild(row);
  }

  // ---- Values ----
  // ---- MBTI 人格风格 toggle ----
  var mbtiValues = { EI: 'E', SN: 'N', TF: 'T', JP: 'P' };
  var MBTI_TYPES = {
    'INTJ': '建筑师', 'INTP': '逻辑学家', 'ENTJ': '指挥官', 'ENTP': '辩论家',
    'INFJ': '提倡者', 'INFP': '调停者', 'ENFJ': '主人公', 'ENFP': '竞选者',
    'ISTJ': '物流师', 'ISFJ': '守卫者', 'ESTJ': '总经理', 'ESFJ': '执政官',
    'ISTP': '鉴赏家', 'ISFP': '探险家', 'ESTP': '企业家', 'ESFP': '表演者',
  };
  var mbtiExplain = {
    EI: { E: '热情外放，语调活泼，喜欢用感叹号', I: '内敛沉稳，语调平和，回复有深度' },
    SN: { S: '务实具体，给出实际建议，用数据说话', N: '天马行空，善于联想和抽象思考' },
    TF: { T: '逻辑清晰，分析客观，推理严谨', F: '温暖共情，注重感受，有人情味' },
    JP: { J: '有条理有计划，结构清晰', P: '灵活随性，自然不做作，像即兴聊天' },
  };
  var mbtiRows = [
    { id: 'mbtiEI', key: 'EI', hintId: 'mbtiEI-hint' },
    { id: 'mbtiSN', key: 'SN', hintId: 'mbtiSN-hint' },
    { id: 'mbtiTF', key: 'TF', hintId: 'mbtiTF-hint' },
    { id: 'mbtiJP', key: 'JP', hintId: 'mbtiJP-hint' },
  ];

  function getValues() {
    return {
      menuApps: menuApps.map(function (a) {
        return { id: a.id, name: a.name, icon: a.icon || '', cmd: a.cmd || '', appPath: a.appPath || '' };
      }),
      agentApiKey:     els.agentApiKey.value.trim(),
      agentEndpoint:   'https://developer.zhihu.com/v1/chat/completions',
      agentModel:      els.zhihuModel.value,
      agentProvider:   els.agentProvider.value,
      hotListLimit:    parseInt(els.hotListLimit.value) || 10,
      mbtiEI:          mbtiValues.EI,
      mbtiSN:          mbtiValues.SN,
      mbtiTF:          mbtiValues.TF,
      mbtiJP:          mbtiValues.JP,
    };
  }

  function setValues(v) {
    console.log('[Settings] setValues called, v.menuApps:', v.menuApps ? v.menuApps.length : 0);
    try {
      els.agentApiKey.value   = v.agentApiKey   || '';
      console.log('[Settings] agentApiKey set');
    } catch(e) { console.log('[Settings] agentApiKey error:', e.message); }
    try {
      els.agentProvider.value = v.agentProvider || 'zhihu';
      console.log('[Settings] agentProvider set');
    } catch(e) { console.log('[Settings] agentProvider error:', e.message); }
    try {
      if (ZHIHU_MODELS.indexOf(v.agentModel) !== -1) {
        els.zhihuModel.value = v.agentModel;
      }
      console.log('[Settings] zhihuModel set');
    } catch(e) { console.log('[Settings] zhihuModel error:', e.message); }
    // hotListLimit
    if (v.hotListLimit !== undefined) {
      els.hotListLimit.value = v.hotListLimit;
      els.hotListLimitVal.textContent = v.hotListLimit;
    }
    // 先处理 menuApps，确保即使 MBTI 代码出错也能加载应用
    try {
      if (v.menuApps) menuApps = v.menuApps.slice();
      renderMenuApps();
      console.log('[Settings] menuApps set:', menuApps.length);
    } catch(e) { console.log('[Settings] menuApps error:', e.message); }
    // MBTI values
    if (v.mbtiEI) mbtiValues.EI = v.mbtiEI;
    if (v.mbtiSN) mbtiValues.SN = v.mbtiSN;
    if (v.mbtiTF) mbtiValues.TF = v.mbtiTF;
    if (v.mbtiJP) mbtiValues.JP = v.mbtiJP;
    // Update toggle UI
    mbtiRows.forEach(function (row) {
      var el = document.getElementById(row.id);
      if (!el) return;
      var btns = el.querySelectorAll('.mbti-btn');
      btns.forEach(function (btn) {
        btn.classList.toggle('active', btn.dataset.val === mbtiValues[row.key]);
      });
      updateMbtiHint(row);
    });
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
    if (menuApps.some(function (a) { return a.id === id; })) return;
    menuApps.push({ id: id, name: name, icon: pickEmoji(name),
      cmd: 'open -a "' + name + '"', appPath: '/Applications/' + name + '.app' });
    els.customAppSelect.value = '';
    renderMenuApps();
    if (window.screenToySettings) window.screenToySettings.apply(getValues());
  });

  // ---- MBTI toggle 事件绑定 ----
  function updateMbtiHint(row) {
    var hintEl = document.getElementById(row.hintId);
    if (hintEl) {
      hintEl.textContent = mbtiExplain[row.key][mbtiValues[row.key]];
    }
    // 更新类型名显示
    var typeDisplay = document.getElementById('mbtiTypeDisplay');
    if (typeDisplay) {
      var mbtiType = mbtiValues.EI + mbtiValues.SN + mbtiValues.TF + mbtiValues.JP;
      var typeName = MBTI_TYPES[mbtiType] || '';
      typeDisplay.textContent = typeName ? mbtiType + ' ' + typeName : '';
    }
  }

  mbtiRows.forEach(function (row) {
    var el = document.getElementById(row.id);
    if (!el) return;
    var btns = el.querySelectorAll('.mbti-btn');
    btns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (mbtiValues[row.key] === btn.dataset.val) return;
        btns.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        mbtiValues[row.key] = btn.dataset.val;
        updateMbtiHint(row);
        if (window.screenToySettings) {
          window.screenToySettings.apply({
            mbtiEI: mbtiValues.EI,
            mbtiSN: mbtiValues.SN,
            mbtiTF: mbtiValues.TF,
            mbtiJP: mbtiValues.JP,
          });
        }
      });
    });
    // 初始化解释文字
    updateMbtiHint(row);
  });

  // ---- API 申请按钮 ----
  if (els.openApiPage) {
    els.openApiPage.addEventListener('click', function () {
      if (window.screenToySettings && window.screenToySettings.openApiPage) {
        window.screenToySettings.openApiPage();
      }
    });
  }

  // ---- 热榜条目数滑块 ----
  if (els.hotListLimit) {
    els.hotListLimit.addEventListener('input', function () {
      els.hotListLimitVal.textContent = els.hotListLimit.value;
      if (window.screenToySettings) {
        window.screenToySettings.apply({ hotListLimit: parseInt(els.hotListLimit.value) || 10 });
      }
    });
  }

  function setupApiKeyToggle(btnId, inpId) {
    var btn = document.getElementById(btnId);
    var inp = document.getElementById(inpId);
    if (!btn || !inp) return;
    btn.addEventListener('click', function () {
      if (inp.type === 'password') {
        inp.type = 'text';
        btn.textContent = 'visibility';
      } else {
        inp.type = 'password';
        btn.textContent = 'visibility_off';
      }
    });
  }
  setupApiKeyToggle('toggleApiKey', 'agentApiKey');

  // ---- Lock/Unlock API keys ----
  var aiLocked = true;
  var lockBtn = document.getElementById('toggleLock');

  function applyAiLock() {
    var keyInputs = [els.agentApiKey];
    keyInputs.forEach(function (inp) {
      if (!inp) return;
      inp.readOnly = aiLocked;
      inp.style.opacity = aiLocked ? '0.6' : '1';
      inp.style.cursor = aiLocked ? 'default' : 'text';
    });
    if (lockBtn) {
      lockBtn.textContent = aiLocked ? 'lock' : 'lock_open';
      lockBtn.title = aiLocked ? '解锁编辑 API Key' : '锁定 API Key';
      lockBtn.style.color = aiLocked ? '#aaa' : '#007AFF';
    }
  }

  if (lockBtn) {
    lockBtn.addEventListener('click', function () {
      aiLocked = !aiLocked;
      applyAiLock();
    });
  }

  applyAiLock(); // 初始解锁
  els.agentProvider.addEventListener('change', function () {
    if (window.screenToySettings) {
      window.screenToySettings.apply({ agentProvider: els.agentProvider.value });
    }
  });

  els.zhihuModel.addEventListener('change', function () {
    if (window.screenToySettings) {
      window.screenToySettings.apply({ agentModel: els.zhihuModel.value });
    }
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

    window.screenToySettings.onLoad(function (v) { 
      console.log('[Settings] onLoad called, menuApps:', v.menuApps ? v.menuApps.length : 0);
      setValues(v); 
    });
    // 确保设置被发送（处理 did-finish-load 先于脚本执行的情况）
    window.screenToySettings.requestCurrent();
  }

  // 初始渲染应用列表（显示空状态提示）
  renderMenuApps();
  console.log('[Settings] Initial renderMenuApps called, menuApps:', menuApps.length);

  // ---- Quick actions ----
  els.menuBtn.addEventListener('click', function () {
    if (window.screenToySettings) window.screenToySettings.openAppMenu();
  });
  els.dialogBtn.addEventListener('click', function () {
    if (window.screenToySettings) window.screenToySettings.openDialog();
  });

})();
