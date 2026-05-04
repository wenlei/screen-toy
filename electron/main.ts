import { app, BrowserWindow, screen, ipcMain, Tray, Menu, nativeImage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { exec, execSync } from 'child_process';

let win: BrowserWindow | null = null;
let quitPending = false; // true once quit animation has been triggered
let settingsWin: BrowserWindow | null = null;
let menuWin: BrowserWindow | null = null;
let menuPreviewMode = false;
let dialogWin: BrowserWindow | null = null;
let bubbleWin: BrowserWindow | null = null;
let mouseInterval: NodeJS.Timeout | null = null;
let tray: Tray | null = null;

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
  menuApps: DEFAULT_MENU_APPS.map(a => ({ ...a })) as MenuApp[],
  bubbleOffsetY:    0,    // fine-tune: positive = cloud rises higher, negative = lower
  bubbleCloudOffset:  0,  // new image has 56px built-in transparent padding; no extra needed
  bubbleCanvasTopPad: 55, // transparent margin above cloud in canvas
  bubbleCanvasBotPad: 30, // transparent margin below cloud in canvas
  bubbleExpand:       0,  // extra transparent padding added to window on all sides
  bubbleClipX:       0,   // hide N px from left+right source edges (set >0 only if source has edge artifacts)
  bubbleClipYTop:    0,   // hide N px from top source edge (0 = off)
  bubbleDrawOffsetX: 0,   // shift drawing horizontally within canvas
  bubbleMenuLeft:   100,  // menu overlay left offset within cloud (CLOUD_OFFSET=0, so shifted right)
  bubbleMenuTop:     90,  // menu overlay top offset within cloud
  bubbleScale:       0.85, // scale factor applied to cloud drawing (dst size in drawImage)
  showWindowBorder:  false,
  showBubbleDebug:   false,
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

  win.on('closed', () => {
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
  saveSettings();
  if (win && !win.isDestroyed()) {
    win.webContents.send('settings-changed', currentSettings);
  }
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.webContents.send('settings-current', currentSettings);
  }
  const show = !!currentSettings.showWindowBorder;
  for (const w of [menuWin, dialogWin, bubbleWin, settingsWin]) {
    if (w && !w.isDestroyed()) w.webContents.send('window-border', show);
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

  dialogWin.on('closed', () => {
    dialogWin = null;
  });
}

ipcMain.on('open-dialog', () => {
  createDialogWindow();
});

ipcMain.on('dialog-send', (_event, msg: string) => {
  console.log('[Dialog]', msg);
});

ipcMain.on('dialog-bubble', (_event, text: string) => {
  if (win && !win.isDestroyed()) {
    win.webContents.send('api-bubble', text);
  }
});

// ---- Bubble window ----

function createBubbleWindow() {
  if (bubbleWin && !bubbleWin.isDestroyed()) return;

  bubbleWin = new BrowserWindow({
    width: 300,
    height: 300,
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

function createSettingsWindow() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.focus();
    return;
  }

  settingsWin = new BrowserWindow({
    width: 360,
    height: 520,
    resizable: false,
    transparent: false,
    frame: true,
    titleBarStyle: 'hiddenInset',
    hasShadow: true,
    title: 'Screen Toy Settings',
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
