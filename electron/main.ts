import { app, BrowserWindow, screen, ipcMain, Tray, Menu, nativeImage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { Agent, getDefaultSystemPrompt, fetchZhihuHotList, getErrorMessage } from './agent';
import { exec, execSync } from 'child_process';
import * as knowledge from './knowledge';

let win: BrowserWindow | null = null;
let quitPending = false; // true once quit animation has been triggered
let sunWin: BrowserWindow | null = null;
let settingsWin: BrowserWindow | null = null;
let menuWin: BrowserWindow | null = null;
let menuPreviewMode = false;
let dialogWin: BrowserWindow | null = null;
let bubbleWin: BrowserWindow | null = null;
let mouseInterval: NodeJS.Timeout | null = null;
let tray: Tray | null = null;
let agent: Agent | null = null;
let currentConversationId: string = '';

const WIN_W = 152;
const WIN_H = 132;

type MenuApp = { id: string; name: string; icon: string; cmd: string; appPath: string };

const DEFAULT_MENU_APPS: MenuApp[] = [
  { id: 'sublime', name: 'Sublime Text', icon: '💎', cmd: 'open -a "Sublime Text"', appPath: '/Applications/Sublime Text.app' },
  { id: 'calc',    name: '计算器',       icon: '🔢', cmd: 'open -a Calculator',      appPath: '/System/Applications/Calculator.app' },
  { id: 'mail',    name: '邮件',         icon: '📧', cmd: 'open -a Mail',            appPath: '/System/Applications/Mail.app' },
  { id: 'notion',  name: 'Notion',       icon: '📋', cmd: 'open -a Notion',          appPath: '/Applications/Notion.app' },
];

// Icon cache: appId → data URL
const iconCache: { [key: string]: string } = {};

function getAppIconDataURL(appId: string, appPath: string): string {
  if (iconCache[appId]) return iconCache[appId];

  try {
    var img = nativeImage.createFromPath(appPath);
    if (img && !img.isEmpty()) {
      var resized = img.resize({ width: 20, height: 20, quality: 'best' });
      var dataUrl = resized.toDataURL();
      iconCache[appId] = dataUrl;
      return dataUrl;
    }
  } catch (e) {
    // Fall back to emoji icon
  }
  return '';
}

// Current settings (shared state)
const currentSettings = {
  idleFrame: 180,
  walkFrame: 120,
  walkSpeed: 150,
  sitFrame: 400,
  pokeFrame: 70,
  flyFrame: 80,
  displayScale: 0.7,
  selectedApps: [] as string[],
  customApps: [] as { id: string; name: string }[],
  menuApps: [] as { id: string; name: string; icon: string; cmd: string; appPath: string }[],
  agentApiKey: '',
  agentEndpoint: 'https://developer.zhihu.com/v1/chat/completions',
  agentModel: 'zhida-fast-1p5',
  agentProvider: 'zhihu' as string,
  enableDirectAnswer: true,
  searchType: 'zhihu' as string,
  mbtiEI: 'E' as string,
  mbtiSN: 'N' as string,
  mbtiTF: 'F' as string,
  mbtiJP: 'J' as string,
  // Bubble layout
  bubbleScale:       0.85 as number,
  bubbleCanvasTopPad: 55 as number,
  bubbleCanvasBotPad: 30 as number,
  bubbleCloudOffset:  0 as number,
  bubbleDrawOffsetX:  0 as number,
  bubbleMenuLeft:     100 as number,
  bubbleMenuTop:      90 as number,
  showBubbleDebug:    false,
  bubbleClipX:        0 as number,
  bubbleClipYTop:     0 as number,
  bubbleOffsetY:      0 as number,
  bubbleExpand:       0 as number,
};

function loadSettings() {
  try {
    const file = path.join(app.getPath('userData'), 'screen-toy-settings.json');
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
      Object.assign(currentSettings, data);
    }
  } catch (e) { /* use defaults */ }
}

function saveSettings() {
  try {
    const file = path.join(app.getPath('userData'), 'screen-toy-settings.json');
    fs.writeFileSync(file, JSON.stringify(currentSettings, null, 2), 'utf-8');
  } catch (e) { /* ignore */ }
}

function createWindow() {
  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize;
  var animInterval: NodeJS.Timeout | null = null;

  win = new BrowserWindow({
    width: WIN_W,
    height: WIN_H,
    x: Math.round(screenW / 2 - WIN_W / 2),
    y: Math.round(screenH / 2 - WIN_H / 2),
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setAlwaysOnTop(true, 'screen-saver');

  win.loadFile(path.join(__dirname, '..', '..', 'src', 'index.html'));
  win.show();
  win.setIgnoreMouseEvents(true, { forward: true });

  // 注入事件动画配置（入场 + 退场）
  if (win) {
    // 提取为独立函数，支持跨天定时刷新
    function checkEventAnimations() {
      try {
        var configPath = path.join(__dirname, '..', '..', 'src', 'assets', 'doodles', 'arctic_fox', 'event_animations.json');
        if (!fs.existsSync(configPath)) return;
        var fullConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        var today = new Date();
        var mmdd = String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');

        // 日期匹配：支持单日 date 和范围 date_start/date_end
        function mmddToNum(s: string): number {
          var parts = s.split('-');
          return parseInt(parts[0], 10) * 100 + parseInt(parts[1], 10);
        }
        var todayNum = mmddToNum(mmdd);
        var event = (fullConfig.events || []).find(function (e: any) {
          if (e.date) return e.date === mmdd;
          if (e.date_start && e.date_end) {
            var startNum = mmddToNum(e.date_start);
            var endNum = mmddToNum(e.date_end);
            if (startNum <= endNum) {
              return todayNum >= startNum && todayNum <= endNum;
            } else {
              // 跨年范围，如 12-25 ~ 01-03
              return todayNum >= startNum || todayNum <= endNum;
            }
          }
          return false;
        });
        if (!event) {
          // 无匹配事件 → 通知 renderer 恢复默认动画
          win!.webContents.send('event-animations-config', {});
          win!.webContents.send('quit-animations-config', {});
          return;
        }

        // 如果事件引用了 group，从 resource_groups 中解析出 animations
        if (event.group && !event.animations && fullConfig.resource_groups) {
          event.animations = fullConfig.resource_groups[event.group];
        }
        if (!event.animations) return;
        event.config = fullConfig;

        // 根据 animations 中是否存在对应键来分别下发
        if (event.animations.enter) {
          win!.webContents.send('event-animations-config', event);
        }
        if (event.animations.quit) {
          win!.webContents.send('quit-animations-config', event);
        }
      } catch (e) {}
    }

    win.webContents.on('did-finish-load', checkEventAnimations);

    // 每 60 分钟检查一次，防止跨天后动画未更新
    animInterval = setInterval(checkEventAnimations, 60 * 60 * 1000);
  }

  win.on('closed', () => {
    if (animInterval) clearInterval(animInterval);
    win = null;
  });
}

function startMousePolling() {
  if (mouseInterval) return;
  mouseInterval = setInterval(() => {
    if (!win || win.isDestroyed()) return;
    const pos = screen.getCursorScreenPoint();
    win.webContents.send('mouse-pos', { x: pos.x, y: pos.y });
  }, 16);
}

function stopMousePolling() {
  if (mouseInterval) {
    clearInterval(mouseInterval);
    mouseInterval = null;
  }
}

// IPC: renderer tells us the robot's window-relative bounding box
let isDragging = false;

ipcMain.on('robot-bounds', (_event, bounds: { x: number; y: number; w: number; h: number }) => {
  if (!win || win.isDestroyed()) return;
  if (isDragging) return; // during drag, capture all mouse events

  const mousePos = screen.getCursorScreenPoint();
  const winBounds = win.getBounds();

  const robotLeft = winBounds.x + bounds.x;
  const robotTop = winBounds.y + bounds.y;
  const robotRight = robotLeft + bounds.w;
  const robotBottom = robotTop + bounds.h;

  const overRobot =
    mousePos.x >= robotLeft &&
    mousePos.x <= robotRight &&
    mousePos.y >= robotTop &&
    mousePos.y <= robotBottom;

  win.setIgnoreMouseEvents(!overRobot, { forward: true });
});

ipcMain.on('start-drag', () => {
  if (!win || win.isDestroyed()) return;
  isDragging = true;
  win.setIgnoreMouseEvents(false);
});

ipcMain.on('stop-drag', () => {
  if (!win || win.isDestroyed()) return;
  isDragging = false;
  win.setIgnoreMouseEvents(true, { forward: true });
});

// ---- Settings IPC ----

ipcMain.on('apply-settings', (_event, settings: typeof currentSettings) => {
  console.log('[Settings]', JSON.stringify(settings));
  Object.assign(currentSettings, settings);

  // Reset agent when API config changes
  if (agent &&
      (settings.agentApiKey !== undefined ||
       settings.agentEndpoint !== undefined ||
       settings.agentModel !== undefined ||
       settings.searchType !== undefined ||
       settings.enableDirectAnswer !== undefined ||
       settings.mbtiEI !== undefined ||
       settings.mbtiSN !== undefined ||
       settings.mbtiTF !== undefined ||
       settings.mbtiJP !== undefined)) {
    agent = null; // will be recreated on next dialog-send
  }

  // 风格/模型变更：记录到当前 session（仅在有活跃会话时）
  var mbtiChanged = (settings.mbtiEI !== undefined || settings.mbtiSN !== undefined ||
       settings.mbtiTF !== undefined || settings.mbtiJP !== undefined);
  var modelChanged = settings.agentModel !== undefined;
  if (currentConversationId && (mbtiChanged || modelChanged)) {
    knowledge.recordStyleChange(currentConversationId, {
      mbtiEI: (currentSettings as any).mbtiEI,
      mbtiSN: (currentSettings as any).mbtiSN,
      mbtiTF: (currentSettings as any).mbtiTF,
      mbtiJP: (currentSettings as any).mbtiJP,
      agentModel: currentSettings.agentModel,
    });
  }
  // 通知 dialog 风格/模型变更（无论是否有活跃会话）
  if (mbtiChanged || modelChanged) {
    if (dialogWin && !dialogWin.isDestroyed()) {
      dialogWin.webContents.send('style-changed', {
        mbtiEI: (currentSettings as any).mbtiEI,
        mbtiSN: (currentSettings as any).mbtiSN,
        mbtiTF: (currentSettings as any).mbtiTF,
        mbtiJP: (currentSettings as any).mbtiJP,
        agentModel: currentSettings.agentModel,
      });
    }
  }

  saveSettings();
  if (win && !win.isDestroyed()) {
    win.webContents.send('settings-changed', currentSettings);
  }
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.webContents.send('settings-current', currentSettings);
  }
});

ipcMain.on('request-settings', () => {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.webContents.send('settings-current', currentSettings);
  }
});

// ---- Menu IPC ----

ipcMain.on('show-menu', (_event, pos: { x: number; y: number }) => {
  createMenuWindow(pos.x, pos.y);
});

ipcMain.on('preview-bubble', () => {
  menuPreviewMode = false;
  const { width: w, height: h } = screen.getPrimaryDisplay().workAreaSize;
  createMenuWindow(Math.round(w * 0.5), Math.round(h * 0.75));
});

ipcMain.on('live-preview-start', () => {
  menuPreviewMode = true;
  const { width: w, height: h } = screen.getPrimaryDisplay().workAreaSize;
  if (!menuWin || menuWin.isDestroyed()) {
    createMenuWindow(Math.round(w * 0.5), Math.round(h * 0.75));
  }
});

ipcMain.on('live-preview-update', (_event, params: any) => {
  Object.assign(currentSettings, params);
  if (menuWin && !menuWin.isDestroyed()) {
    menuWin.webContents.send('live-params', {
      cloudScale:   currentSettings.bubbleScale        ?? 0.85,
      canvasTopPad: currentSettings.bubbleCanvasTopPad ?? 55,
      canvasBotPad: currentSettings.bubbleCanvasBotPad ?? 30,
      cloudOffset:  currentSettings.bubbleCloudOffset  ?? 0,
      drawOffsetX:  currentSettings.bubbleDrawOffsetX  ?? 0,
      menuLeft:     currentSettings.bubbleMenuLeft     ?? 100,
      menuTop:      currentSettings.bubbleMenuTop      ?? 90,
      showDebug:    !!currentSettings.showBubbleDebug,
      clipX:        currentSettings.bubbleClipX        ?? 0,
      clipYTop:     currentSettings.bubbleClipYTop     ?? 0,
    });
  }
});

ipcMain.on('live-preview-stop', () => {
  menuPreviewMode = false;
  closeMenuWindow();
});

ipcMain.on('menu-action', (_event, action: string) => {
  closeMenuWindow();

  // Always notify renderer so fox can unlock sit and resume normal behavior
  if (win && !win.isDestroyed()) {
    win.webContents.send('menu-action-done', action);
  }

  if (action === 'dismiss') return;

  if (action === 'open-settings') {
    createSettingsWindow();
    return;
  }

  if (action === 'zhihu') {
    exec('open "https://www.zhihu.com"');
    return;
  }

  if (action === 'dialog') {
    createDialogWindow();
    return;
  }

  const menuApp = (currentSettings.menuApps || []).find((a: MenuApp) => a.id === action);
  if (menuApp) {
    exec(menuApp.cmd);
    return;
  }
});

// ---- Dialog window ----

function createDialogWindow() {
  if (dialogWin && !dialogWin.isDestroyed()) {
    dialogWin.focus();
    return;
  }

  dialogWin = new BrowserWindow({
    width: 380,
    height: 500,
    resizable: true,
    title: 'Ask Zhihu',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  dialogWin.loadFile(path.join(__dirname, '..', '..', 'src', 'panels', 'dialog.html'));
  dialogWin.webContents.on('did-finish-load', () => {
    if (dialogWin && !dialogWin.isDestroyed()) {
      dialogWin.webContents.send('dialog-current-style', {
        mbtiEI: (currentSettings as any).mbtiEI,
        mbtiSN: (currentSettings as any).mbtiSN,
        mbtiTF: (currentSettings as any).mbtiTF,
        mbtiJP: (currentSettings as any).mbtiJP,
        agentModel: currentSettings.agentModel,
      });
    }
  });
  dialogWin.on('closed', () => {
    dialogWin = null;
  });
}

ipcMain.on('open-dialog', () => {
  createDialogWindow();
});

ipcMain.on('dialog-send', (_event, msg: string) => {
  // Pick the right API key based on provider
  var provider = (currentSettings.agentProvider as any) || 'zhihu';
  var apiKey = currentSettings.agentApiKey || '';

  if (!apiKey) {
    if (dialogWin && !dialogWin.isDestroyed()) {
      dialogWin.webContents.send('dialog-message', '请先在 Settings 中设置数据平台密钥（从 developer.zhihu.com/profile 获取）');
    }
    return;
  }

  if (!agent) {
    console.log('[Agent] Creating with searchType:', currentSettings.searchType, 'enableDirectAnswer:', currentSettings.enableDirectAnswer);
    agent = new Agent({
      apiKey: apiKey,
      endpoint: currentSettings.agentEndpoint || 'https://developer.zhihu.com/v1/chat/completions',
      model: currentSettings.agentModel || 'zhida-fast-1p5',
      systemPrompt: getDefaultSystemPrompt(),
      provider: provider,
      zhihuAccessSecret: apiKey,
      enableDirectAnswer: currentSettings.enableDirectAnswer !== false,
      searchType: currentSettings.searchType || 'zhihu',
      mbtiEI: (currentSettings as any).mbtiEI || 'E',
      mbtiSN: (currentSettings as any).mbtiSN || 'N',
      mbtiTF: (currentSettings as any).mbtiTF || 'F',
      mbtiJP: (currentSettings as any).mbtiJP || 'J',
    });
    // 从 knowledge.json 加载当前会话的历史
    if (currentConversationId) {
      var record = knowledge.getConversationById(currentConversationId);
      if (record && record.messages) {
        var msgs: import('./agent').ChatMessage[] = [];
        for (var i = 0; i < record.messages.length; i++) {
          var m = record.messages[i];
          if (m.role === 'user' || m.role === 'assistant') {
            msgs.push({ role: m.role as 'user' | 'assistant', content: m.content });
          }
        }
        agent.setHistory(msgs);
      }
    }
  }

  if (dialogWin && !dialogWin.isDestroyed()) {
    dialogWin.webContents.send('dialog-message', '...');
  }

  // 会话创建（新会话时立刻发送 ID + 初始风格，让 dialog 先显示风格信息）
  var cid = currentConversationId;
  if (!cid) {
    cid = Date.now().toString(36);
    currentConversationId = cid;
    if (dialogWin && !dialogWin.isDestroyed()) {
      dialogWin.webContents.send('dialog-conversation-id', {
        id: cid,
        mbtiEI: (currentSettings as any).mbtiEI,
        mbtiSN: (currentSettings as any).mbtiSN,
        mbtiTF: (currentSettings as any).mbtiTF,
        mbtiJP: (currentSettings as any).mbtiJP,
      });
    }
  }

  var useStream = (currentSettings.agentProvider as any) === 'zhihu';
  var sendFn = useStream
    ? agent.sendMessageStream.bind(agent)
    : agent.sendMessage.bind(agent);

  sendFn(
    msg,
    useStream ? (chunk) => {
      // 流式：实时发送片段到 dialog 窗口
      if (dialogWin && !dialogWin.isDestroyed()) {
        dialogWin.webContents.send('dialog-chunk', chunk);
      }
    } : undefined,
    (reply) => {
      // 先发回复，再发搜索上下文（显示在回复下方）
      if (dialogWin && !dialogWin.isDestroyed()) {
        dialogWin.webContents.send('dialog-message', reply);
      }
      if (agent && agent.searchResults && agent.searchResults.length > 0) {
        if (dialogWin && !dialogWin.isDestroyed()) {
          dialogWin.webContents.send('dialog-search-results', agent.searchResults);
        }
        agent.searchResults = [];
      }

  // Auto-save conversation to knowledge base
    try {
      var prov = (currentSettings.agentProvider as any) || 'zhihu';
      // 查找已有记录来合并消息
      var existing = knowledge.getConversationById(cid);
      var allMessages = existing ? existing.messages.slice() : [];
      allMessages.push({ role: 'user', content: msg });
      allMessages.push({ role: 'assistant', content: reply });
      knowledge.saveOrUpdateConversation({
        id: cid,
        date: new Date().toISOString(),
        provider: prov,
        messages: allMessages,
        mbtiEI: (currentSettings as any).mbtiEI,
        mbtiSN: (currentSettings as any).mbtiSN,
        mbtiTF: (currentSettings as any).mbtiTF,
        mbtiJP: (currentSettings as any).mbtiJP,
        agentModel: currentSettings.agentModel,
        searchType: currentSettings.searchType,
        enableDirectAnswer: currentSettings.enableDirectAnswer,
      });
      // 通知 dialog 刷新会话列表
      if (dialogWin && !dialogWin.isDestroyed()) {
        dialogWin.webContents.send('refresh-conversation-list');
      }
    } catch (e) {}
    },
    (err) => {
      if (dialogWin && !dialogWin.isDestroyed()) {
        dialogWin.webContents.send('dialog-message', '出错了: ' + err);
      }
    }
  ).catch((e: any) => {
    console.error('[Dialog] sendFn unhandled error:', e);
    if (dialogWin && !dialogWin.isDestroyed()) {
      dialogWin.webContents.send('dialog-message', '出错了: ' + (e.message || e));
    }
  });
});

ipcMain.on('dialog-clear', () => {
  currentConversationId = '';
  if (agent) {
    agent.clearHistory();
    if (dialogWin && !dialogWin.isDestroyed()) {
      dialogWin.webContents.send('dialog-message', '(新会话)');
      dialogWin.webContents.send('refresh-conversation-list');
    }
  }
});

ipcMain.on('dialog-bubble', (_event, text: string) => {
  if (win && !win.isDestroyed()) {
    win.webContents.send('api-bubble', text);
  }
});

// ---- Conversation history IPC ----
ipcMain.handle('conversation-list', async () => {
  return knowledge.getConversationList();
});

ipcMain.handle('conversation-load', async (_event, id: string) => {
  const record = knowledge.getConversationById(id);
  if (!record) return null;
  // 更新当前 session ID，确保后续消息关联到正确的会话
  currentConversationId = id;
  // 恢复元信息到 currentSettings
  if (record.mbtiEI) (currentSettings as any).mbtiEI = record.mbtiEI;
  if (record.mbtiSN) (currentSettings as any).mbtiSN = record.mbtiSN;
  if (record.mbtiTF) (currentSettings as any).mbtiTF = record.mbtiTF;
  if (record.mbtiJP) (currentSettings as any).mbtiJP = record.mbtiJP;
  if (record.agentModel) currentSettings.agentModel = record.agentModel;
  if (record.searchType) currentSettings.searchType = record.searchType;
  if (record.enableDirectAnswer !== undefined) currentSettings.enableDirectAnswer = record.enableDirectAnswer;
  // 重置 Agent，确保下次 dialog-send 用加载的 MBTI 重新创建
  agent = null;
  return {
    messages: record.messages,
    initialStyle: record.initialStyle,
    styleChanges: record.styleChanges,
    mbtiEI: record.mbtiEI, mbtiSN: record.mbtiSN, mbtiTF: record.mbtiTF, mbtiJP: record.mbtiJP,
    enableDirectAnswer: record.enableDirectAnswer,
  };
});

ipcMain.handle('conversation-delete', async (_event, id: string) => {
  knowledge.deleteConversation(id);
  return true;
});

// ---- Hot list IPC ----
ipcMain.handle('zhihu-hot-list', async () => {
  var provider = (currentSettings.agentProvider as any) || 'zhihu';
  var apiKey = currentSettings.agentApiKey;
  if (provider !== 'zhihu' || !apiKey) {
    return { data: [], error: '未配置知乎 API Key' };
  }
  try {
    var result = await fetchZhihuHotList(apiKey, (currentSettings as any).hotListLimit || 10);
    return { data: result, error: null };
  } catch (e: any) {
    return { data: [], error: e.message || '获取热榜失败' };
  }
});

// ---- Save hot list to conversation history ----
ipcMain.on('save-hotlist-to-history', (_event, text: string) => {
  if (!currentConversationId) {
    currentConversationId = Date.now().toString(36);
    if (dialogWin && !dialogWin.isDestroyed()) {
      dialogWin.webContents.send('dialog-conversation-id', {
        id: currentConversationId,
        mbtiEI: (currentSettings as any).mbtiEI,
        mbtiSN: (currentSettings as any).mbtiSN,
        mbtiTF: (currentSettings as any).mbtiTF,
        mbtiJP: (currentSettings as any).mbtiJP,
      });
    }
  }
  var existing = knowledge.getConversationById(currentConversationId);
  var allMessages = existing ? existing.messages.slice() : [];
  allMessages.push({ role: 'user', content: '查看热榜' });
  allMessages.push({ role: 'assistant', content: text });
  knowledge.saveOrUpdateConversation({
    id: currentConversationId,
    date: new Date().toISOString(),
    provider: (currentSettings.agentProvider as any) || 'zhihu',
    messages: allMessages,
    mbtiEI: (currentSettings as any).mbtiEI,
    mbtiSN: (currentSettings as any).mbtiSN,
    mbtiTF: (currentSettings as any).mbtiTF,
    mbtiJP: (currentSettings as any).mbtiJP,
    agentModel: currentSettings.agentModel,
    searchType: currentSettings.searchType,
    enableDirectAnswer: currentSettings.enableDirectAnswer,
  });
  // 通知 dialog 刷新会话列表
  if (dialogWin && !dialogWin.isDestroyed()) {
    dialogWin.webContents.send('refresh-conversation-list');
  }
  // 如果有活跃的 agent，同步更新其内部历史
  if (agent) {
    agent.pushMessage({ role: 'user', content: '查看热榜' });
    agent.pushMessage({ role: 'assistant', content: text });
  }
});

// ---- Knowledge base IPC ----

ipcMain.on('kb-save-conversation', (_event, record: any) => {
  knowledge.addConversation({
    id: record.id || Date.now().toString(36),
    date: new Date().toISOString(),
    topic: record.topic || '',
    provider: record.provider || 'zhihu',
    messages: record.messages || [],
    summary: record.summary || '',
  });

  if (record.topics && Array.isArray(record.topics)) {
    record.topics.forEach(function (t: any) {
      knowledge.addOrUpdateTopic(t.name || t, t.tags || []);
    });
  }
});

ipcMain.handle('kb-get-conversations', () => {
  return knowledge.getConversations();
});

// ---- Open API page ----
ipcMain.on('open-api-page', () => {
  const { shell } = require('electron');
  shell.openExternal('https://www.zhihu.com/ring/moltbook');
});

// ---- Bubble window ----

function createBubbleWindow() {
  if (bubbleWin && !bubbleWin.isDestroyed()) return;

  bubbleWin = new BrowserWindow({
    width: 500,
    height: 220,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  bubbleWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  bubbleWin.setAlwaysOnTop(true, 'screen-saver');
  bubbleWin.setIgnoreMouseEvents(true, { forward: true });
  bubbleWin.loadFile(path.join(__dirname, '..', '..', 'src', 'panels', 'bubble.html'));

  bubbleWin.on('closed', () => {
    bubbleWin = null;
  });
}

var _bubbleW = 180;
var _bubbleH = 80;

function positionBubbleWindow(bw?: number, bh?: number) {
  if (!bubbleWin || bubbleWin.isDestroyed() || !win || win.isDestroyed()) return;
  var w = bw || _bubbleW;
  var h = bh || _bubbleH;
  var dogBounds = win.getBounds();
  // Tail tip at TAIL_RX(63%) × w, at bottom of bubble.
  // Position so tail tip is near fox head (dogBounds.y + 38).
  var tailX = Math.round(w * 0.63);
  var x = Math.round(dogBounds.x + WIN_W / 2 - tailX);
  var y = Math.round(dogBounds.y + 38 - h);
  bubbleWin.setBounds({ x: x, y: y, width: w, height: h });
}

ipcMain.on('show-bubble', (_event, content: any) => {
  createBubbleWindow();
  positionBubbleWindow();
  if (bubbleWin && !bubbleWin.isDestroyed()) {
    bubbleWin.showInactive();
    bubbleWin.webContents.send('bubble-show', content);
  }
});

ipcMain.on('bubble-resize', (_event, size: { w: number; h: number }) => {
  if (!bubbleWin || bubbleWin.isDestroyed()) return;
  _bubbleW = size.w;
  _bubbleH = size.h;
  positionBubbleWindow(size.w, size.h);
});

ipcMain.on('bubble-next', () => {
  if (bubbleWin && !bubbleWin.isDestroyed()) {
    bubbleWin.webContents.send('bubble-next');
  }
});

ipcMain.on('bubble-done', () => {
  if (bubbleWin && !bubbleWin.isDestroyed()) {
    bubbleWin.hide();
  }
  if (win && !win.isDestroyed()) {
    win.webContents.send('bubble-done');
  }
});

// Keep bubble position synced when dog moves
ipcMain.on('window-move', (_event, pos: { x: number; y: number }) => {
  if (!win || win.isDestroyed()) return;
  var { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize;
  var x = Math.max(0, Math.min(pos.x, screenW - WIN_W));
  var y = Math.max(0, Math.min(pos.y, screenH - WIN_H));
  win.setPosition(Math.round(x), Math.round(y));
  positionBubbleWindow();
});

// Open menu from settings/dialog
ipcMain.on('open-app-menu', () => {
  if (win && !win.isDestroyed()) {
    win.webContents.send('trigger-menu');
  }
});

ipcMain.on('menu-resize', (_event, size: { w: number; h: number }) => {
  if (menuWin && !menuWin.isDestroyed()) {
    var bounds = menuWin.getBounds();
    var cx = bounds.x + bounds.width / 2;
    var newX = cx - size.w / 2;
    var newY = bounds.y + bounds.height - size.h;
    menuWin.setBounds({ x: Math.round(newX), y: Math.round(newY), width: size.w, height: size.h });
  }
});

ipcMain.on('get-installed-apps', (_event) => {
  try {
    var out = execSync('ls /Applications ~/Applications /System/Applications 2>/dev/null | grep "\\.app$" | sed "s/\\.app$//" | sort -fu', { encoding: 'utf-8', timeout: 3000 });
    var apps = out.trim().split('\n').filter(function (n: string) { return n.length > 0 && n.length < 60; });
    if (settingsWin && !settingsWin.isDestroyed()) {
      settingsWin.webContents.send('installed-apps', apps);
    }
  } catch (e) {
    // Fallback: send empty list
    if (settingsWin && !settingsWin.isDestroyed()) {
      settingsWin.webContents.send('installed-apps', []);
    }
  }
});

// ── Quit with animation ───────────────────────────────────────────────────
function triggerQuit() {
  if (quitPending) return;
  quitPending = true;
  closeMenuWindow();

  if (win && !win.isDestroyed()) {
    // Expand window to give the smoke-cloud animation more room
    const QUIT_W = 105, QUIT_H = 105;
    const [wx, wy] = win.getPosition();
    const [ww, wh] = win.getSize();
    const newX = Math.max(0, Math.round(wx + ww / 2 - QUIT_W / 2));
    const newY = Math.max(0, Math.round(wy + wh / 2 - QUIT_H / 2));
    win.setBounds({ x: newX, y: newY, width: QUIT_W, height: QUIT_H });
    win.webContents.send('quit-anim', { w: QUIT_W, h: QUIT_H });
    // Safety fallback: force-quit after 5 s if renderer never replies
    setTimeout(() => app.quit(), 5000);
  } else {
    app.quit();
  }
}

ipcMain.on('quit-anim-done', () => {
  app.quit();
});

ipcMain.on('trigger-animation', (_event, name: string) => {
  if (win && !win.isDestroyed()) {
    win.webContents.send('trigger-animation', name);
  }
});

function createSunWindow() {
  sunWin = new BrowserWindow({
    width: 160,
    height: 160,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    focusable: false,
    hasShadow: false,
    skipTaskbar: true,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  sunWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  sunWin.setAlwaysOnTop(true, 'screen-saver');
  sunWin.setIgnoreMouseEvents(true);
  sunWin.loadFile(path.join(__dirname, '..', '..', 'src', 'sun-window.html'));
  sunWin.hide();
  sunWin.on('closed', () => { sunWin = null; });
}

ipcMain.on('update-sun', (_event, data: { x: number; y: number; closeness: number; angle: number }) => {
  if (!sunWin || sunWin.isDestroyed()) createSunWindow();
  if (!sunWin || sunWin.isDestroyed()) return;
  const px = Math.round(data.x - 80);
  const py = Math.round(data.y - 80);
  if (!Number.isFinite(px) || !Number.isFinite(py)) return;
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  sunWin.setPosition(
    Math.max(0, Math.min(sw - 160, px)),
    Math.max(0, Math.min(sh - 160, py))
  );
  if (!sunWin.isVisible()) sunWin.show();
  sunWin.webContents.send('sun-data', { closeness: data.closeness, angle: data.angle });
});

ipcMain.on('hide-sun', () => {
  if (sunWin && !sunWin.isDestroyed()) sunWin.hide();
});


function createSettingsWindow() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.reload();
    settingsWin.focus();
    return;
  }

  settingsWin = new BrowserWindow({
    width: 360,
    height: 520,
    resizable: false,
    transparent: false,
    frame: true,
    titleBarStyle: 'hidden',
    hasShadow: true,
    title: '直答风格',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  settingsWin.loadFile(path.join(__dirname, '..', '..', 'src', 'panels', 'settings.html'));
  settingsWin.on('closed', () => {
    settingsWin = null;
  });

  // Send current settings when the window finishes loading
  settingsWin.webContents.on('did-finish-load', () => {
    console.log('[SettingsWin] Sending settings, menuApps:', currentSettings.menuApps.length);
    settingsWin?.webContents.send('settings-current', currentSettings);
  });
}

// ---- Menu popup window ----

function createMenuWindow(screenX: number, screenY: number) {
  if (menuWin && !menuWin.isDestroyed()) {
    menuWin.close();
  }

  // ── Adaptive height calculation ──────────────────────────────────────────
  // Cloud source: 400×368 (scaled from new image), 3-slice at y=184
  const EXPAND           = currentSettings.bubbleExpand       ?? 0;
  const CLOUD_OFFSET     = currentSettings.bubbleCloudOffset  ?? 0;  // new image has built-in transparent padding
  const DW               = 400;
  const CLOUD_SCALE      = currentSettings.bubbleScale        ?? 0.85;
  const CANVAS_W         = DW + 2 * CLOUD_OFFSET;
  const BASE_H           = 368;
  const ITEM_H           = 28;
  const MENU_PAD         = 8;
  const SEP_H            = 7;
  const NATURAL_INTERIOR = 160;
  const TOP_PAD          = 28 + EXPAND;
  const LEFT_PAD         = 20 + EXPAND;
  const RIGHT_PAD        = 20 + EXPAND;
  const TAIL_EXTRA       = 24 + EXPAND;
  const CANVAS_EXTRA_TOP = 10;  // minimal space above canvas
  const CANVAS_TOP_PAD_VAL = currentSettings.bubbleCanvasTopPad ?? 55;

  const menuApps: MenuApp[] = currentSettings.menuApps || [];
  const numApps = menuApps.length;
  const contentH = (numApps + 3) * ITEM_H + SEP_H + MENU_PAD * 2;
  const stretch  = Math.max(0, contentH - NATURAL_INTERIOR);
  const MENU_H   = BASE_H + stretch;

  // ── Position ─────────────────────────────────────────────────────────────
  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize;
  const MENU_BAR_H     = 25;
  const CANVAS_BOT_PAD = currentSettings.bubbleCanvasBotPad ?? 30;
  const FOX_HEAD_OFFSET = 20;  // fox head ≈ screenY − 20
  const FOX_FEET_OFFSET = 20;  // fox feet ≈ screenY + 20
  const FINE_TUNE = currentSettings.bubbleOffsetY ?? 0;

  // First compute the ideal Y for normal mode (cloud above fox).
  // Flip mode is used when the ideal position would be clamped by the menu bar.
  const tailWindowY_normal = (TOP_PAD + CANVAS_EXTRA_TOP) + CANVAS_TOP_PAD_VAL + Math.round(MENU_H * CLOUD_SCALE);
  const idealMenuY = Math.round(screenY - FOX_HEAD_OFFSET) - 20 - tailWindowY_normal - FINE_TUNE;
  const useFlip = idealMenuY < MENU_BAR_H;  // cloud would hit the menu bar → flip below fox

  let menuY: number;
  let topPadAdjusted: number;
  let foxFeetY: number | undefined;
  let foxHeadY_ipc: number | undefined;
  let menuH_send: number;
  let doFlip: boolean;

  if (useFlip) {
    // ── Flip mode: cloud below fox, tail circles at window top ────────────────
    // Ensure the cloud is tall enough for all menu items.
    // Usable area (stretch + top-slice) = (MENU_H − SLICE_BOT_H) × CS
    // We need that ≥ contentH + 20 px buffer.
    const SLICE_BOT_H_val = 184;
    const MENU_H_flip = Math.max(
      MENU_H,
      Math.ceil((contentH + 20) / CLOUD_SCALE) + SLICE_BOT_H_val,
    );
    topPadAdjusted = TOP_PAD + CANVAS_EXTRA_TOP;
    const SLICE_TOP_H_val = 184;
    const dTop_flip = Math.round(SLICE_TOP_H_val * CLOUD_SCALE);
    const dStr_flip = Math.round((MENU_H_flip - BASE_H) * CLOUD_SCALE);
    // tailWindowY_flip = distance from window top to the small tail circle (source y=357).
    // In the flipped canvas the circle ends up at topPad + (canvas.height − normalSmallCY).
    // canvas.height = MENU_H_flip + CANVAS_TOP_PAD + CANVAS_BOT_PAD, but CANVAS_TOP_PAD
    // cancels with normalSmallCY's leading CANVAS_TOP_PAD, leaving:
    //   topPad + MENU_H_flip + CANVAS_BOT_PAD − dTop − dStr − round((357−184)·CS)
    const tailWindowY_flip = topPadAdjusted + MENU_H_flip + CANVAS_BOT_PAD
                             - dTop_flip - dStr_flip
                             - Math.round((357 - SLICE_TOP_H_val) * CLOUD_SCALE);
    menuY      = Math.round(screenY + FOX_FEET_OFFSET) + 10 - tailWindowY_flip - FINE_TUNE;
    // foxFeetY is computed after menuYClamped (below) so the clamped position is used.
    menuH_send = MENU_H_flip;
    doFlip     = true;
  } else {
    // ── Normal mode: cloud above fox ─────────────────────────────────────────
    menuY        = Math.max(MENU_BAR_H, idealMenuY);
    const clampOffset  = menuY - idealMenuY;
    topPadAdjusted     = Math.max(0, TOP_PAD + CANVAS_EXTRA_TOP - clampOffset);
    foxHeadY_ipc = Math.round(screenY - 20) - menuY;
    menuH_send   = MENU_H;
    doFlip       = false;
  }

  // Align tail X to fox center.
  // Small tail circle center ≈ source x=81. At CS=0.85, rendered x = cloudOffset + 81*CS
  const tailXInWindow = LEFT_PAD + CLOUD_OFFSET + Math.round(81 * CLOUD_SCALE);
  const menuX = Math.max(0, Math.min(Math.round(screenX - tailXInWindow), screenW - CANVAS_W - LEFT_PAD - RIGHT_PAD));

  // ── Window height = above-canvas + canvas-height + below-canvas ──────────
  const WIN_H_raw = topPadAdjusted + menuH_send + CANVAS_TOP_PAD_VAL + CANVAS_BOT_PAD + TAIL_EXTRA;
  // Clamp so window doesn't run off the screen edges
  const menuYClamped = Math.max(MENU_BAR_H, menuY);
  const WIN_H = Math.min(WIN_H_raw, screenH - menuYClamped);
  // foxFeetY must be relative to the *clamped* window position.
  if (doFlip) foxFeetY = Math.round(screenY + FOX_FEET_OFFSET) - menuYClamped;

  menuWin = new BrowserWindow({
    width:  CANVAS_W + LEFT_PAD + RIGHT_PAD,
    height: WIN_H,
    x: menuX,
    y: menuYClamped,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    useContentSize: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  menuWin.loadFile(path.join(__dirname, '..', '..', 'src', 'panels', 'menu.html'));

  menuWin.webContents.on('did-finish-load', () => {
    // Small delay so menu.js has time to register the onApps callback via contextBridge
    setTimeout(() => {
      const appsToSend = menuApps.map(a => ({
        id: a.id, name: a.name, icon: a.icon,
        iconUrl: getAppIconDataURL(a.id, a.appPath || ''),
      }));
      menuWin?.webContents.send('menu-apps', {
        apps: appsToSend, windowH: menuH_send, topPad: topPadAdjusted, leftPad: LEFT_PAD,
        cloudOffset: CLOUD_OFFSET, tailExtra: TAIL_EXTRA, cloudScale: CLOUD_SCALE,
        canvasTopPad: CANVAS_TOP_PAD_VAL,
        canvasBotPad: CANVAS_BOT_PAD,
        drawOffsetX:  currentSettings.bubbleDrawOffsetX ?? 0,
        menuLeft:     currentSettings.bubbleMenuLeft    ?? 100,
        menuTop:      doFlip ? -54 : (currentSettings.bubbleMenuTop ?? 90),
        showDebug:    !!currentSettings.showBubbleDebug,
        clipX:        currentSettings.bubbleClipX        ?? 0,
        clipYTop:     currentSettings.bubbleClipYTop     ?? 0,
        flip:         doFlip,
        foxFeetY:     foxFeetY,        // flip mode: fox feet y relative to menu window top
        foxHeadY:     foxHeadY_ipc,    // normal mode: fox head y relative to menu window top
      });
    }, 150);
  });

  menuWin.on('blur', () => {
    if (!menuPreviewMode) closeMenuWindow();
  });

  menuWin.on('closed', () => {
    menuWin = null;
  });
}

function closeMenuWindow() {
  if (menuWin && !menuWin.isDestroyed()) {
    menuWin.close();
    menuWin = null;
  }
}

function buildTrayMenu() {
  const visible = win && !win.isDestroyed() && win.isVisible();
  return Menu.buildFromTemplate([
    {
      label: visible ? 'Hide' : 'Show',
      click: () => {
        if (win && !win.isDestroyed()) {
          if (win.isVisible()) win.hide();
          else win.show();
        } else {
          createWindow();
          startMousePolling();
        }
        tray?.setContextMenu(buildTrayMenu());
      },
    },
    {
      label: 'Settings',
      click: () => createSettingsWindow(),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => triggerQuit(),
    },
  ]);
}

function createTray() {
  const iconPath = path.join(__dirname, '..', '..', 'src', 'assets', 'tray-icon.png');
  const icon2xPath = path.join(__dirname, '..', '..', 'src', 'assets', 'tray-icon@2x.png');
  let icon: Electron.NativeImage;
  if (fs.existsSync(icon2xPath)) {
    icon = nativeImage.createFromPath(icon2xPath);
    icon = icon.resize({ width: 16, height: 16 });
  } else {
    icon = nativeImage.createFromPath(iconPath);
  }
  icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip('Screen Toy');
  tray.setContextMenu(buildTrayMenu());
}

app.whenReady().then(() => {
  loadSettings();
  createWindow();
  createTray();
  startMousePolling();
});

app.on('window-all-closed', () => {
  // Don't quit — tray keeps running
});

app.on('before-quit', () => {
  stopMousePolling();
});

app.on('activate', () => {
  if (win === null) {
    createWindow();
    startMousePolling();
  }
});
