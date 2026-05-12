# Dialog System (dialog.html + dialog.js)

## 概述

AI 对话窗口——用户输入问题，查看 AI 回复，管理 Session 历史。

**文件**: `src/panels/dialog.html` + `src/panels/dialog.js`

## 窗口布局

```
┌───────────────────────────────────────────────────────┐
│  刘看山的脑仁儿    [+ 新会话 ▼]  [🔥 热榜]  [☑ 直答] │ ← Header
├───────────────────────────────────────────────────────┤
│  Messages                                              │
│  ┌─────────────────────────────────────────────────┐  │
│  │ System: [当前风格] ENFJ 主人公  (gray, center)  │  │
│  ├─────────────────────────────────────────────────┤  │
│  │ User: ...                    (blue, right)      │  │
│  │       2026-05-09 14:32                          │  │
│  ├─────────────────────────────────────────────────┤  │
│  │ Bot: ...                      (white, left)     │  │
│  │      2026-05-09 14:32  📋                       │  │
│  ├─────────────────────────────────────────────────┤  │
│  │ System: [当前风格] 已更新为 INTJ 建筑师          │  │
│  └─────────────────────────────────────────────────┘  │
├───────────────────────────────────────────────────────┤
│  [输入...]              [知乎搜 ▼] [发送/搜索]       │ ← Input Row
└───────────────────────────────────────────────────────┘
```

## 核心功能

### 1. 消息发送

```
send()
  ↓ IPC: dialog-send
  ↓ Agent 处理（搜索/直答）
  ↓ 流式渲染: onChunk → md2html → innerHTML
  ↓ 完成: onReceive → 替换为带 footer 的 addMsg
  ↓ triggerBubble('来消息了') → 北极狐 OK 动画
```

### 2. 直答开关

| 状态 | 输入框 | 按钮 | 行为 |
|------|--------|------|------|
| ✅ 直答 ON | `输入问题...` | 发送 | 搜索+Chat API |
| ❌ 直答 OFF | `搜索信息...` | 搜索 | 搜索 only |

直答关闭时显示搜索类型下拉：`[知乎搜 ▼]` / `[全网搜 ▼]`

### 3. 消息脚注（时间戳 + 复制）

每条消息下方独立的一行 footer：

| 消息类型 | footer 内容 | 对齐 |
|----------|-------------|------|
| Bot | `14:32  📋` | 左对齐 |
| User | `14:32` | 右对齐 |
| System | 无 footer | — |

- 时间戳格式：`YYYY-MM-DD HH:MM`
- 复制按钮常显（Material Icon `content_copy`），点击后 1.5s 变为 `check`
- 复制内容为 Bot 回复的原始文本

### 4. 风格信息显示

| 场景 | 显示内容 | 触发方式 |
|------|----------|----------|
| 打开对话框 | `[当前风格] ENFJ 主人公` | `dialog-current-style` IPC |
| 点击"+ 新会话" | `[当前风格] ENFJ 主人公` | 从缓存的 `currentStyle` 渲染 |
| Settings 更改 MBTI | `[当前风格] 已更新为 INTJ 建筑师` | `style-changed` IPC |
| 加载历史 Session | `[会话风格] ENFJ 主人公` | 消息列表第一条 |

`currentStyle` 缓存在 dialog.js 中，每次 `style-changed` 时更新，供"新会话"等场景复用。

### 5. Session 历史下拉框

自定义 div 实现（非原生 `<select>`），支持：

- 标题显示（长标题 CSS `...` 省略）
- 🔄 风格变更标记
- ✕ 删除按钮（点击后立即从列表移除）
- 点击加载完整 Session（消息 + 元信息 + 风格变更 + 初始风格）

### 6. 热榜

点击 `🔥 热榜` 按钮 → `zhihu-hot-list` IPC → 显示结果列表

- 条目可点击（`[标题](url)` markdown 格式）
- 结果保存到当前 Session
- 配额用完时显示错误信息

## Markdown 渲染 (md2html)

| 格式 | 渲染 |
|------|------|
| `**bold**` / `*italic*` | `<strong>` / `<em>` |
| `# ## ###` | `<h1>` `<h2>` `<h3>` |
| `- item` / `1. item` | `<ul><li>` / `<ol><li>` |
| `[text](url)` | `<a>` |
| `https://...` | `<a>` |
| `\n` | `<br>` |

## IPC 接口

| IPC | 方向 | 用途 |
|-----|------|------|
| `dialog-send` | → main | 发送消息 |
| `dialog-message` | ← main | 接收完整回复 |
| `dialog-chunk` | ← main | 流式接收片段 |
| `dialog-clear` | → main | 新 Session |
| `dialog-bubble` | → main | 触发北极狐气泡 |
| `conversation-list` | ↔ main | Session 列表 |
| `conversation-load` | ↔ main | 加载 Session |
| `conversation-delete` | → main | 删除 Session |
| `refresh-conversation-list` | ← main | 通知刷新列表 |
| `dialog-conversation-id` | ← main | 当前 Session ID + 风格信息 |
| `dialog-current-style` | ← main | 对话框打开时下发当前 MBTI |
| `style-changed` | ← main | 风格变更通知（无论有无活跃会话） |
| `zhihu-hot-list` | → main | 获取热榜 |
| `save-hotlist-to-history` | → main | 热榜保存到 Session |

## 相关文档

- [AI Agent](agent.md) — AI 回复处理
- [Session System](session.md) — Session 管理
- [Architecture](architecture.md) — 整体 IPC 架构
- [Settings](settings.md) — MBTI 风格设置
