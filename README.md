# Screen Toy

macOS 桌面宠物 — 一只在屏幕上闲逛的北极狐，点击弹出思维气泡菜单，可快捷打开应用。

## 运行

```bash
npm install
npm run dev
```

## 项目结构

```
electron/
├── main.ts             # Electron 主进程：窗口管理、IPC、托盘、设置持久化
└── preload.ts          # contextBridge：暴露安全 API 给渲染层

src/
├── index.html          # 主窗口（透明 Canvas，全程置顶）
├── renderer.js         # 游戏循环、鼠标交互、窗口移动
├── behavior.js         # 行为状态机（idle / walk / sit / poke / drag / airplane）
├── doodle-render.js    # 精灵图加载、帧动画渲染、方向匹配
└── panels/
    ├── menu.html/js    # 思维气泡菜单（31 帧 Canvas 动画 + 3-slice 拉伸）
    ├── dialog.html/js  # 知乎对话窗口
    ├── bubble.html/js  # 头顶小气泡提示
    └── settings.html/js# 参数设置面板

src/assets/doodles/
├── arctic_fox/           # 北极狐精灵图（17280×2400，4 方向 × 24 帧 × 720×600）
├── thinking_bubble/    # 思维气泡资产（sheet.png 31 帧 + adaptive_base.png）
├── menu_deco/          # 菜单装饰素材
└── paper_plane/        # 纸飞机动画
```

## 交互

| 操作 | 效果 |
|------|------|
| 鼠标悬停 | 眼睛跟随光标 |
| 点击 | 北极狐坐下，弹出思维气泡菜单 |
| 拖拽 | 拖动北极狐到任意位置 |
| 菜单 → 应用项 | 打开对应 macOS 应用 |
| 菜单 → 去知乎看看 | 在浏览器打开知乎 |
| 菜单 → 知乎对话 | 打开对话窗口 |
| 菜单 → 就这样吧 | 关闭菜单 |
| 托盘 → Settings | 打开设置面板 |
| 托盘 → Quit | 退出 |

## 设置面板

通过系统托盘图标打开，支持：

- **动画参数**：idle / walk / sit / poke 帧间隔、行走速度、显示缩放
- **应用菜单**：从已安装应用列表中选择，添加到气泡菜单，持久化保存
- **气泡位置调节**：四个滑块实时调整气泡的垂直偏移、左右边距、顶部间距、窗口扩展；「预览气泡」按钮即时查看效果

设置保存在 `~/Library/Application Support/screen-toy/screen-toy-settings.json`。

## 思维气泡实现

气泡菜单是一个独立透明 `BrowserWindow`：

1. 播放 31 帧 Canvas 精灵动画（18 fps，约 1.7 秒）
2. 动画结束后切换为 `adaptive_base.png` 3-slice 拉伸，适配不同菜单条目数
3. 菜单 HTML overlay 在动画完成后淡入

## 换动画

1. 将精灵图放入 `src/assets/doodles/新名称/sheet.png`
2. 修改 `src/config.js` 中 `spriteFolder` 为新名称

精灵图规格：4 行（E / S / N / W 方向）× N 列（帧），每帧 720×600。
