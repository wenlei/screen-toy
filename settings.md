# Settings System (settings.html + settings.js)

## 概述

应用设置面板——配置 AI Agent、管理应用菜单、控制动画和游戏。

**文件**: `src/panels/settings.html` + `src/panels/settings.js`
**存储路径**: `~/Library/Application Support/screen-toy/screen-toy-settings.json`

## 面板布局

```
┌──────────────────────────────────────┐
│            Settings                  │ ← 标题栏
├──────────────────────────────────────┤
│  应用菜单                            │
│  ├─ App list (with ✕ delete)        │
│  └─ [— 选择应用 —] [+ 添加]         │
│──────────────────────────────────────│
│  激活动画                            │
│  ├─ 🌀 别拧巴了  🌺 草裙舞           │
│  ├─ 🤧 打喷嚏   ☀️ 热化了            │
│  ├─ 🍎 狐顿     🧊 冻成冰棍          │
│  └─ 👃 大鼻子                        │
│──────────────────────────────────────│
│  小游戏                              │
│  └─ 🎮 躲太阳                        │
│──────────────────────────────────────│
│  热榜设置                            │
│  └─ 条目数 [———●———] 10             │
│──────────────────────────────────────│
│  AI Agent                           │
│  ├─ Provider: 知乎直答               │
│  ├─ Model: [快速/深度/智能思考 ▼]      │
│  └─ API Key: [•••••••] 🔒 🔓        │
│──────────────────────────────────────│
│  回答风格 (MBTI)                     │
│  ├─ 表达方式 [E 外向 ←→ I 内向]      │
│  ├─ 关注点   [S 实感 ←→ N 直觉]      │
│  ├─ 决策方式 [T 思考 ←→ F 情感]      │
│  └─ 风格     [J 判断 ←→ P 感知]      │
│──────────────────────────────────────│
│  快捷操作                            │
│  ├─ 应用菜单  AI 对话  🔑 申请 API   │
└──────────────────────────────────────┘
```

## 设置字段

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `agentApiKey` | string | '' | 知乎 Access Secret |
| `agentProvider` | string | 'zhihu' | AI Provider |
| `agentModel` | string | 'zhida-fast-1p5' | AI 模型 |
| `enableDirectAnswer` | bool | true | 直答开关 |
| `searchType` | string | 'zhihu' | 搜索类型 |
| `hotListLimit` | int | 10 | 热榜条目数 (1-30) |
| `mbtiEI` | string | 'E' | MBTI 表达方式 |
| `mbtiSN` | string | 'N' | MBTI 关注点 |
| `mbtiTF` | string | 'F' | MBTI 决策方式 |
| `mbtiJP` | string | 'J' | MBTI 风格 |
| `menuApps` | array | [] | 应用菜单列表 |

## NBTI 人格风格

4 个 toggle 维度，每个维度 A/B 两个选项，组合为 16 种人格类型。

| 维度 | Toggle | 说明 |
|------|--------|------|
| 表达方式 | E 外向 / I 内向 | 热情外放 vs 内敛沉稳 |
| 关注点 | S 实感 / N 直觉 | 务实具体 vs 天马行空 |
| 决策方式 | T 思考 / F 情感 | 逻辑分析 vs 温暖共情 |
| 风格 | J 判断 / P 感知 | 有条理 vs 灵活随性 |

解释文字根据选中选项动态变化，标题显示组合类型名（如 `ENFP 竞选者`）。

## API Key 锁定

默认锁定 `aiLocked = true` → 图标 `lock` → 输入框 readOnly

点击解锁 `aiLocked = false` → 图标 `lock_open` → 可编辑

## 数据流

```
settings.js: apply({ key: value })
  ↓ IPC: apply-settings
  ↓
main.ts: Object.assign(currentSettings, settings)
  ↓
saveSettings() → screen-toy-settings.json
```

## 相关文档

- [AI Agent](agent.md) — AgentConfig
- [Session System](session.md) — Session 元信息
- [Dialog System](dialog.md) — 直答开关联动、风格实时更新

## 风格同步

Settings 中更改 MBTI 后：
1. `apply-settings` IPC 更新 `currentSettings`
2. `style-changed` IPC 实时通知 dialog 窗口（无活跃会话时也发送）
3. dialog 显示 `[当前风格] 已更新为 INTJ 建筑师`
4. 下次打开 dialog 时通过 `dialog-current-style` 显示当前风格

## 已知问题

| # | 问题 | 状态 |
|----|------|------|
| 1 | 设置面板重载后 MBTI 始终默认 ENFJ | ✅ 已修复 — `ipcRenderer.removeAllListeners` 清理累积监听器 |
| 2 | API 申请 URL 为旧地址 | ✅ 已修复 — 更新为 `zhihu.com/ring/moltbook` |
