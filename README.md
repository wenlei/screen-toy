# Screen Toy

macOS 桌面宠物 — 一只名叫刘看山的北极狐在屏幕上闲逛，点击弹出思维气泡菜单，可快捷打开应用。支持知乎直答 AI 智能对话。

## 运行

```bash
npm install
npm run dev
```

## 项目结构

```
electron/                       # 主进程 (TypeScript)
├── main.ts                     # 窗口管理、IPC、托盘、设置持久化、Session 管理
├── preload.ts                  # contextBridge：安全 API
├── agent.ts                    # AI Agent：知乎直答/搜索/热榜、SSE 流式响应
└── knowledge.ts                # Session 持久化存储 (knowledge.json)

src/                            # 渲染进程 (JavaScript)
├── index.html                  # 主窗口（透明 Canvas，全程置顶）
├── renderer.js                 # 游戏循环、动画、对话气泡、躲太阳游戏
├── behavior.js                 # 状态机 (idle/walk/sit/poke/drag/sleep)
├── doodle-render.js            # 精灵图加载与帧动画渲染
├── config.js                   # 默认参数
├── sun-window.html/js          # 躲太阳：太阳窗口
└── panels/
    ├── menu.html/js            # 思维气泡菜单
    ├── dialog.html/js          # AI 对话窗口 (Markdown、流式、热榜)
    ├── bubble.html/js          # 头顶气泡提示
    └── settings.html/js        # 设置面板 (AI、MBTI、动画、API)

📄 模块文档: agent.md · pet.md · dialog.md · settings.md · knowledge.md · session.md · architecture.md
```

## 交互

| 操作 | 效果 |
|------|------|
| 鼠标悬停 | 眼睛跟随光标 |
| 单击 | 坐下 + 弹出思维气泡菜单 |
| 拖拽 | 拖动到任意位置 |
| 屏幕角落静止 | 触发睡眠，点击唤醒 |
| 菜单 → 应用项 | 打开对应 macOS 应用 |
| 菜单 → 去知乎看看 | 浏览器打开知乎 |
| 菜单 → 知乎对话 | 打开 AI 对话窗口 |
| 菜单 → 就这样吧 | 关闭菜单 |
| 对话窗口 → 输入消息 | AI 智能对话 (自动搜索) |
| 对话窗口 → 🔥 热榜 | 查看知乎热点 |
| 托盘 → Settings | 打开设置面板 |
| 托盘 → Quit | 退出 (消失动画) |

## 动画

通过设置面板触发，或随机自动触发。部分动画带有对话气泡 (按进度百分比触发)：

| 动画 | 触发 | 对话 |
|------|------|------|
| 🌀 别拧巴了 | 手/自动 | 0%: 哎呀，我拧巴了！ → 100%: 终于不拧了！ |
| 🌺 草裙舞 | 手/自动 | 三段式: 穿裙 → 跳舞 → 脱裙 |
| 🤧 打喷嚏 | 手/自动 | 阿嚏!!! |
| ☀️ 热化了 | 手/自动 | 好热啊...我化了... |
| 🍎 狐顿 | 手动 | 哎呦！ |
| 🧊 冻成冰棍 | 手动 | 嘶—好冷！→ 冻成冰棍了... |
| 👃 大鼻子 | 手动 | 鼻子变大了？ |
| 🌸 人生亦如是 | 手动 | 花开花落 |
| 🎮 躲太阳 | 开关 | — |

## AI 对话 (刘看山的脑仁儿)

基于知乎直答，支持流式响应、Markdown 渲染、可点击来源链接。

| 功能 | 说明 |
|------|------|
| 💬 多轮对话 | 上下文记忆，Session 持久化 |
| 🔍 自动搜索 | 知乎站内 / 全网搜索 (可切换) |
| 📝 Markdown | 标题、列表、代码块、粗体、链接 |
| 🔗 来源标注 | 带标题的可点击链接，回复底部列出 |
| 🔥 热榜 | 一键查看知乎热点 (条目数可调 1-30) |
| 🔄 会话历史 | 下拉框选择、加载、删除历史 Session |
| 📋 复制 | 每条 Bot 回复右下角复制按钮 |
| ⚠️ 趣味错误 | API 错误用北极狐口吻提示 |

### 对话模型

| 模型 | 说明 |
|------|------|
| zhida-fast-1p5 | 快速回答 (通用) |
| zhida-thinking-1p5 | 深度思考 (推理强) |
| zhida-agent | 智能思考 (规划强) |

### 对话窗口特性

- 流式更新 (逐字显示)
- 直答开关控制搜索/Chat 行为
- 会话历史下拉框 (带删除、带 🔄 风格变更标记)
- 热榜结果自动保存到 Session
- 配额用完后按钮置灰 + 趣味提示

## 躲太阳游戏

开启后太阳追赶北极狐，用鼠标引导躲避：

- 计分：离太阳越近倍率越高 (0.2× → 3.0×)
- 被追上触发热化动画
- 太阳每次加速

## 设置面板

| 区域 | 内容 |
|------|------|
| 应用菜单 | 已选应用列表 + 添加/删除，自动保存 |
| 激活动画 | 一键触发所有特殊动画 |
| 小游戏 | 躲太阳开关 |
| 热榜设置 | 热榜条目数滑块 (1-30) |
| AI Agent | 模型选择、API Key (🔒 锁定保护) |
| 回答风格 | MBTI 4 维度 toggle (16 型人格)，标题显示类型名 |
| 快捷操作 | 应用菜单 / AI 对话 / 🔑 申请 API |

**存储**：`~/Library/Application Support/screen-toy/screen-toy-settings.json`

## 回答风格 (MBTI)

4 个维度，每个 A/B 两选项：

| 维度 | Toggle | 说明 |
|------|--------|------|
| 表达方式 | E 外向 / I 内向 | 热情外放 vs 内敛沉稳 |
| 关注点 | S 实感 / N 直觉 | 务实具体 vs 天马行空 |
| 决策方式 | T 思考 / F 情感 | 逻辑分析 vs 温暖共情 |
| 风格 | J 判断 / P 感知 | 有条理 vs 灵活随性 |

选中组合（如 ENFP）后，风格描述注入系统提示词，AI 自动调整回复方式。风格变更自动记录到 Session。

## 知乎 API

| API | 用途 | 鉴权 |
|-----|------|------|
| 直答 | AI 对话 | Bearer + X-Request-Timestamp |
| 知乎搜索 | 站内搜索 | Bearer + X-Request-Timestamp |
| 全网搜索 | 全网搜索 | Bearer + X-Request-Timestamp |
| 热榜 | 知乎热点 | Bearer + X-Request-Timestamp |

**密钥**：从 [知乎开放平台](https://developer.zhihu.com/profile) 获取 Access Secret。

## Session 会话

所有对话（消息、热榜）以 Session 为单位持久化存储：

- 自动创建：保存时无 Session ID 则自动新建
- 持续追加：同一 Session 内新消息自动合并
- 历史加载：下拉框选择历史 Session，恢复消息 + 元信息
- 风格记录：MBTI 变更记录到 Session，对话区显示 `[风格变更]` 提示

**存储**：`~/Library/Application Support/screen-toy/knowledge.json`

## 精灵图规格

特殊动画：6 列 × 4 行 = 24 帧，256×256px，PNG 透明。

主角色：4 方向 (E/S/N/W) × 24 列，720×600px。

## 文档

| 文档 | 内容 |
|------|------|
| [architecture.md](architecture.md) | 整体架构、IPC、数据流 |
| [session.md](session.md) | Session 机制 Spec |
| [agent.md](agent.md) | AI Agent 模块 |
| [pet.md](pet.md) | 宠物系统（动画、状态机） |
| [dialog.md](dialog.md) | 对话窗口系统 |
| [settings.md](settings.md) | 设置面板系统 |
| [knowledge.md](knowledge.md) | 知识库/Session 存储 |
| [background.md](background.md) | 项目背景、想法和方式 |
| [log-wrap-up.md](log-wrap-up.md) | 近期变更记录（按模块/需求/改动点分类） |

## 近期变更 (2026-05-10)

详见 [log-wrap-up.md](log-wrap-up.md)，主要变更：

| # | 变更 | 状态 |
|---|------|------|
| 1 | 日期驱动事件动画系统 | ✅ |
| 2 | MBTI 配置持久化修复 | ✅ |
| 3 | 热榜 Session 关联修复 | ✅ |
| 4 | 对话窗口 UI 增强（时间戳 + 复制 + 风格显示） | ✅ |
| 5 | System Prompt 风格注入顺序修复 | ✅ |
| 6 | 知乎 API 文档抓取（19 个接口） | ✅ |
| 7 | 应用打包（electron-builder） | ✅ |
| 8 | 对话框风格信息增强（模型名显示） | ✅ |
| 9 | 模型变更写入 Session 历史 | ✅ |
| 10 | 移除重复 Markdown 格式指令 | ✅ |
| 11 | 移除 system role，风格注入 user 消息 | ✅ |
