import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('screenToy', {
  onMousePos: (callback: (pos: { x: number; y: number }) => void) => {
    ipcRenderer.on('mouse-pos', (_event, pos) => callback(pos));
  },
  sendBounds: (bounds: { x: number; y: number; w: number; h: number }) => {
    ipcRenderer.send('robot-bounds', bounds);
  },
  sendWindowMove: (pos: { x: number; y: number }) => {
    ipcRenderer.send('window-move', pos);
  },
  startDrag: () => {
    ipcRenderer.send('start-drag');
  },
  stopDrag: () => {
    ipcRenderer.send('stop-drag');
  },
  onSettingsChanged: (callback: (settings: any) => void) => {
    ipcRenderer.on('settings-changed', (_event, settings) => callback(settings));
  },
  showMenu: (pos: { x: number; y: number }) => {
    ipcRenderer.send('show-menu', pos);
  },
  onMenuAction: (callback: (action: string) => void) => {
    ipcRenderer.on('menu-action-done', (_event, action: string) => callback(action));
  },
  onTriggerMenu: (callback: () => void) => {
    ipcRenderer.on('trigger-menu', () => callback());
  },
  showBubble: (content: any) => {
    ipcRenderer.send('show-bubble', content);
  },
  onBubbleDone: (callback: () => void) => {
    ipcRenderer.on('bubble-done', () => callback());
  },
  onApiBubble: (callback: (text: string) => void) => {
    ipcRenderer.on('api-bubble', (_event, text: string) => callback(text));
  },
  // Quit animation: main → renderer trigger, renderer → main done signal
  onQuitAnim: (callback: (size: {w: number, h: number}) => void) => {
    ipcRenderer.on('quit-anim', (_event, size) => callback(size));
  },
  quitAnimDone: () => {
    ipcRenderer.send('quit-anim-done');
  },
  // Trigger a named animation on the pet
  onTriggerAnimation: (callback: (name: string) => void) => {
    ipcRenderer.on('trigger-animation', (_event, name: string) => callback(name));
  },
  // Sun game window
  updateSun: (data: { x: number; y: number; closeness: number; angle: number }) => {
    ipcRenderer.send('update-sun', data);
  },
  hideSun: () => {
    ipcRenderer.send('hide-sun');
  },
  onSunData: (callback: (data: { closeness: number; angle: number }) => void) => {
    ipcRenderer.on('sun-data', (_event, data) => callback(data));
  },
});

contextBridge.exposeInMainWorld('screenToySettings', {
  apply: (settings: any) => {
    ipcRenderer.send('apply-settings', settings);
  },
  onLoad: (callback: (settings: any) => void) => {
    ipcRenderer.on('settings-current', (_event, settings) => callback(settings));
  },
  onApps: (callback: (apps: any) => void) => {
    ipcRenderer.on('available-apps', (_event, apps) => callback(apps));
  },
  requestCurrent: () => {
    ipcRenderer.send('request-settings');
  },
  openAppMenu: () => {
    ipcRenderer.send('open-app-menu');
  },
  openDialog: () => {
    ipcRenderer.send('open-dialog');
  },
  triggerAnimation: (name: string) => {
    ipcRenderer.send('trigger-animation', name);
  },
  getInstalledApps: () => {
    ipcRenderer.send('get-installed-apps');
  },
  onInstalledApps: (callback: (apps: string[]) => void) => {
    ipcRenderer.on('installed-apps', (_event, apps) => callback(apps));
  },
  openApiPage: () => {
    ipcRenderer.send('open-api-page');
  },
  saveHotlistToHistory: (text: string) => {
    ipcRenderer.send('save-hotlist-to-history', text);
  },
});

contextBridge.exposeInMainWorld('screenToyMenu', {
  select: (action: string) => {
    ipcRenderer.send('menu-action', action);
  },
  // data can be { apps: [...], windowH: N } or legacy plain array
  onApps: (callback: (data: any) => void) => {
    ipcRenderer.on('menu-apps', (_event, data) => callback(data));
  },
  resize: (w: number, h: number) => {
    ipcRenderer.send('menu-resize', { w, h });
  },
  onLiveParams: (callback: (params: any) => void) => {
    ipcRenderer.on('live-params', (_event, params) => callback(params));
  },
});

contextBridge.exposeInMainWorld('screenToyDialog', {
  onReceive: (callback: (msg: string) => void) => {
    ipcRenderer.on('dialog-message', (_event, msg: string) => callback(msg));
  },
  onChunk: (callback: (chunk: string) => void) => {
    ipcRenderer.on('dialog-chunk', (_event, chunk: string) => callback(chunk));
  },
  onConversationId: (callback: (id: string) => void) => {
    ipcRenderer.on('dialog-conversation-id', (_event, id: string) => callback(id));
  },
  send: (msg: string) => {
    ipcRenderer.send('dialog-send', msg);
  },
  clear: () => {
    ipcRenderer.send('dialog-clear');
  },
  triggerBubble: (text: string) => {
    ipcRenderer.send('dialog-bubble', text);
  },
  getHotList: () => {
    return ipcRenderer.invoke('zhihu-hot-list');
  },
  getConversationList: () => {
    return ipcRenderer.invoke('conversation-list');
  },
  loadConversation: (id: string) => {
    return ipcRenderer.invoke('conversation-load', id);
  },
  deleteConversation: (id: string) => {
    return ipcRenderer.invoke('conversation-delete', id);
  },
});

contextBridge.exposeInMainWorld('bubbleAPI', {
  onShow: (callback: (data: any) => void) => {
    ipcRenderer.on('bubble-show', (_event, data) => callback(data));
  },
  onHide: (callback: () => void) => {
    ipcRenderer.on('bubble-hide', () => callback());
  },
  onNext: (callback: () => void) => {
    ipcRenderer.on('bubble-next', () => callback());
  },
  next: () => {
    ipcRenderer.send('bubble-next');
  },
  done: () => {
    ipcRenderer.send('bubble-done');
  },
  resize: (w: number, h: number) => {
    ipcRenderer.send('bubble-resize', { w, h });
  },
});
