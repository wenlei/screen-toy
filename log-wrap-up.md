# Log Wrap-Up

> 按需求/模块/改动点分类的近期变更记录

---

## 2026-05-10

### 1. 日期驱动事件动画系统

**需求**：特定日期自动切换入场/退场动画（如端午节、儿童节）

**模块**：`electron/main.ts` · `electron/preload.ts` · `src/renderer.js` · `src/assets/doodles/arctic_fox/`

**改动点**：
- 创建 `event_animations.json` 配置文件，支持内联 `animations` 和 `group` 引用两种写法
- `main.ts:145-168` — 窗口加载后读 JSON，按 `MM-DD` 匹配事件，解析 `group` → `resource_groups` 映射，通过 IPC 下发
- `preload.ts:59-65` — 暴露 `onEventAnimationsConfig`、`onQuitAnimationsConfig` 监听器
- `renderer.js:305-383` — 接收配置后加载事件图片，动态替换 `EnterSprite.drawDirect` / `QuitSprite.draw(·)`
- 删除独立的 `quit_animations.json`，合并到 `event_animations.json` 统一管理

**文件**：
- `src/assets/doodles/arctic_fox/event_animations.json`（新增）
- `animations.md`（新增文档）

---

### 2. MBTI 配置持久化修复

**需求**：Settings 面板关闭重开后 MBTI 始终默认 ENFJ，无法保留用户配置

**模块**：`electron/preload.ts`

**改动点**：
- `preload.ts:73-75` — `onLoad` 注册前调用 `removeAllListeners('settings-current')` 清理旧监听器
- 同理修复 `onApps`（line 78）、`onInstalledApps`（line 97）
- 原因：页面 reload 时旧的 `ipcRenderer.on` 回调引用已销毁的 JS 上下文，报错阻断新回调执行

---

### 3. 热榜 Session 关联修复

**需求**：点击热榜生成的对话应保存到 Session 历史，但实际未保存

**模块**：`electron/preload.ts`

**改动点**：
- `preload.ts:103-105` — `saveHotlistToHistory` 从 `screenToySettings` 移至 `screenToyDialog`
- 原因：dialog.js 检查 `window.screenToyDialog.saveHotlistToHistory`，但该方法原挂在 `screenToySettings` 上，永远为 `undefined`

---

### 4. 对话窗口 UI 增强

**需求**：消息下方显示时间戳和复制按钮；风格信息实时可见

**模块**：`src/panels/dialog.html` · `src/panels/dialog.js`

**改动点**：

#### 4.1 消息脚注（时间戳 + 复制）
- `dialog.html:46-52` — 新增 `.msg-footer` 样式，复制按钮常显（Material Icon `content_copy`）
- `dialog.js:120-179` — `addMsg` 重构：每条消息包裹在 container 中，Bot 消息下方显示 `YYYY-MM-DD HH:MM` + 复制按钮，User 消息仅显示时间戳

#### 4.2 风格信息显示
- `dialog.js:308-325` — 新增 `onCurrentStyle` 监听：对话框打开时接收当前 MBTI 并显示 `[当前风格] ENFJ 主人公`
- `dialog.js:339-342` — `style-changed` 回调同时更新 `currentStyle` 缓存并显示 `[当前风格] 已更新为 INTJ 建筑师`
- `dialog.js:202-218` — 点击"+ 新会话"时从缓存的 `currentStyle` 显示风格

#### 4.3 风格变更通知
- `electron/main.ts:253-261` — `style-changed` IPC 解除 `currentConversationId` 依赖，无活跃会话时也发送
- `electron/main.ts:432-445` — 新会话创建时立即发送 `dialog-conversation-id`（含 MBTI），不再等回复

---

### 5. System Prompt 风格注入顺序修复

**需求**：MBTI 风格对知乎模型反馈不明显

**模块**：`electron/agent.ts`

**改动点**：
- `agent.ts:381` — `replace('## 回答风格\n', '## 回答风格\n' + styleContent + '\n')` 精确匹配换行，风格直接跟在标题下
- `agent.ts:706-707` — 删除 `DEFAULT_SYSTEM_PROMPT` 中无用的"根据用户设置的人格风格调整回复方式："行
- 原来风格细节在说明文字之前，导致模型理解顺序错误

---

### 6. 知乎 API 文档抓取

**需求**：完整保存知乎所有开放 API 文档作为参考

**模块**：`docs/`

**改动点**：
- `docs/zhihu-api-reference.md`（新增，328 行）— developer.zhihu.com 平台 API：Bearer 鉴权、直答 API（3 个模型档位）、知乎搜索 API、全网搜索 API、热榜 API
- `docs/moltbook-api-reference.md`（新增，1030 行）— 社区开放能力 9 个接口 + OAuth 开放能力 6 个接口
- 使用 Playwright 抓取知乎登录态页面，OCR 提取内容
- 修正 `zhida-agent` 显示名称："智能体" → "智能思考"（与官方文档一致）

**涉及文件**：
- `src/panels/settings.html:190` — 模型下拉框名称修正
- `README.md:91` — 模型描述修正
- `settings.md:34` — 模型列表修正

---

### 7. 应用打包（electron-builder）

**需求**：生成 .dmg 安装包供其他 Mac 使用

**模块**：`package.json`

**改动点**：
- 安装 `electron-builder` 依赖
- 新增 `build` 配置：appId、productName、mac target（dmg + zip，x64 + arm64）
- 新增 npm scripts：`npm run pack`（调试用）、`npm run dist`（分发用）
- `dist/` 已添加到 `.gitignore`
- 生成 `Screen Toy-1.0.0.dmg`（Intel）和 `Screen Toy-1.0.0-arm64.dmg`（Apple Silicon）

---

### 8. API Key 申请地址更新

**需求**：Settings 面板中"申请 API"按钮指向新地址

**模块**：`electron/main.ts`

**改动点**：
- `main.ts:629` — `shell.openExternal` URL 从 `https://developer.zhihu.com/profile` 改为 `https://www.zhihu.com/ring/moltbook`

---

### 9. 风格信息持久化到 Session

**需求**：Session 历史中应保留初始风格和风格变更记录

**模块**：`electron/knowledge.ts`

**改动点**：
- `knowledge.ts:193-220` — `saveOrUpdateConversation` 创建新 Session 时在消息列表首位插入 `[会话风格] ENFJ 主人公` 系统消息
- `knowledge.ts:206-212` — `recordStyleChange` 同步写入 `[风格变更] 回答风格已切换：INTJ` 到 messages 数组
- `dialog.js:280` — `loadConv` 增加 `role: 'system'` 消息显示分支

---

### 10. Session 管理修复

**需求**：加载历史 Session 后新消息应关联到正确会话

**模块**：`electron/main.ts`

**改动点**：
- `main.ts:524` — `conversation-load` handler 新增 `currentConversationId = id`，加载历史 Session 时同步设置主进程 ID

---

### 11. 文档更新

**模块**：项目文档

**改动点**：
- `dialog.md` — 重写：新增消息脚注、风格显示、新 IPC `dialog-current-style`
- `session.md` — 重写：新增 system 消息写入机制、风格信息存储、11 个已知修复项
- `architecture.md` — IPC 表新增 `save-hotlist-to-history`、`dialog-current-style`
- `settings.md` — 新增"风格同步"章节、已知问题（MBTI 监听器累积、API URL 更新）
- `pet.md` — 新增"事件动画（日期驱动）"章节
- `background.md`（新增）— 项目背景、想法和方式
- `log-wrap-up.md`（新增）— 本文件

---

### 12. 对话框风格信息增强

**需求**：风格信息显示模型名称；模型变更实时捕捉

**模块**：`electron/main.ts` · `src/panels/dialog.js`

**改动点**：
- `main.ts:382` — `dialog-current-style` 新增 `agentModel` 字段
- `main.ts:254-265` — `style-changed` 条件扩展为 `mbtiChanged || modelChanged`，payload 新增 `agentModel`
- `dialog.js:310-311` — `MODEL_NAMES` 映射：`zhida-fast-1p5` → `快速回答 (zhida-fast-1p5)` 等
- `dialog.js:345-349` — `onStyleChanged` / `onCurrentStyle` / 新会话均显示 `MBTI · 模型名`

**显示效果**：
```
[当前风格] ENFJ 主人公 · 快速回答 (zhida-fast-1p5)
[当前风格] 已更新为 INTJ 建筑师 · 深度思考 (zhida-thinking-1p5)
```

---

### 13. 模型变更写入 Session 历史

**需求**：模型变更在对话记录中可见

**模块**：`electron/knowledge.ts` · `electron/main.ts`

**改动点**：
- `knowledge.ts:231-253` — `recordStyleChange` 接受 `agentModel`，系统消息格式 `[风格变更] ENFJ · 快速回答 (zhida-fast-1p5)`
- `main.ts:243-254` — `apply-settings` 条件扩展为 `mbtiChanged || modelChanged`，传入 `agentModel`

---

### 14. 移除重复 Markdown 格式指令

**需求**：知乎 API 回复自带 Markdown，不再重复格式指令

**模块**：`electron/agent.ts`

**改动点**：
- `agent.ts:700-712` — `DEFAULT_SYSTEM_PROMPT` 删除 `## 回复格式` 章节
- 保留：回答风格、搜索结果引用、代码示例、中文回复

---

### 15. 移除 system role，风格注入 user 消息

**需求**：知乎 API 不支持 system role（官方确认），移除无效代码

**模块**：`electron/agent.ts`

**改动点**：
- `agent.ts:369-385` — 构造函数将 MBTI 风格存为 `stylePrefix`，不再 push `system` 消息
- `agent.ts:403` — 新增 `stylePrefix` 属性
- `agent.ts:519-537` — Zhihu 发送时将 `stylePrefix` + 格式指令注入第一条 `user` 消息前缀
- 移除无效的 `system` role 消息

**发送格式**：
```json
{
  "messages": [
    {"role": "user", "content": "回复风格要求：\n- 热情外放...\n\n用户的问题"}
  ]
}
```

---

### 16. 知乎 API 文档抓取

**需求**：完整保存知乎所有开放 API 文档

**模块**：`docs/`

**改动点**：
- `docs/zhihu-api-reference.md`（328 行）— Bearer 鉴权、直答 API、知乎搜索、全网搜索、热榜
- `docs/moltbook-api-reference.md`（1030 行）— 社区开放能力 9 个接口 + OAuth 6 个接口
- 修正 `zhida-agent` 名称："智能体" → "智能思考"（与官方文档一致）
- 清理 `.playwright-cli/` 目录（4.4MB），添加到 `.gitignore`

---

### 17. Git 提交记录

| Commit | 说明 |
|--------|------|
| `b6b48ca` | v6: 日期驱动事件动画系统、Agent 增强、文档完善（50 files） |
| `44f5e24` | fix: MBTI 监听器累积导致配置丢失 + 更新 API 申请 URL |

---

## 待办 / 未完成

| # | 事项 | 优先级 | 状态 |
|---|------|--------|------|
| 1 | `zhida-agent` 模型不支持上下文历史传参（需验证） | 中 | 待验证 |
| 2 | Windows / Linux / HarmonyOS 打包 | 低 | 待实现 |
| 3 | 内容收藏功能（北极狐 thinking bubble 菜单联动） | 低 | 待讨论 |

---

## 2026-05-12

### 20. 流式响应 reasoning_content 修复

**需求**：直答有时返回"流式响应为空"错误

**模块**：`electron/agent.ts`

**改动点**：
- `agent.ts:603-647` — 流式 SSE 同时累积 `delta.content` 和 `delta.reasoning_content`
- `reasoning_content` 仅内部记录，不发送 `onChunk`（避免干扰流式渲染）
- 响应完结时: `finalReply = fullReply || reasoningText`，content 为空时回退 reasoning

---

### 21. 渲染层引用来源切分

**需求**：AI 回复中的引用来源与搜索上下文框重复显示

**模块**：`src/panels/dialog.js`

**改动点**：
- `dialog.js:291-303` — 新增 `stripCitations(text)` 函数，匹配三种引用块标记（`\n引用来源\n`、`\n---\n* [`、`\n**引用来源**\n`）
- `dialog.js:150` — `addMsg` 对 markdown bot 消息自动调用 `stripCitations`
- 不影响 `history` 保存（完整文本存入 knowledge.json，仅显示层切分）

---

### 22. 划词提问

**需求**：选中文本 → 快捷键直接提问

**模块**：`electron/main.ts` · `electron/preload.ts` · `src/panels/dialog.js`

**改动点**：
- `main.ts:1140-1161` — 注册全局快捷键 `Cmd+Shift+K`
- 触发时：保存剪贴板 → 模拟 Cmd+C → 读取选中文字 → 恢复剪贴板 → 自动打开 dialog 并发送
- `preload.ts:169-172` — `onSelectionQuery` IPC 监听
- `dialog.js:466-472` — 收到后填入 `input.value` 并调用 `send()`

---

### 23. 消息收藏按钮

**需求**：Bot 消息 footer 增加收藏功能

**模块**：`electron/main.ts` · `electron/preload.ts` · `src/panels/dialog.html` · `src/panels/dialog.js`

**改动点**：
- `dialog.html:53-54` — `.save-btn` CSS（颜色 `#FF9500`）
- `dialog.js:183-194` — bot footer 新增 `bookmark_border` 按钮，点击变 `bookmark` 图标
- `preload.ts:173-175` — `bookmarkMessage` IPC
- `main.ts:628-653` — `dialog-bookmark` handler，保存收藏到当前 Session

---

### 24. MBTI 默认值统一 ENTP

**需求**：避免 HTML 默认 ENFJ 与存储值 ENTP 的视觉闪烁

**模块**：`src/panels/settings.html` · `src/panels/settings.js` · `electron/main.ts`

**改动点**：
- HTML 默认 active: E, N, T, P；提示语: T="逻辑清晰...", P="灵活随性..."
- `settings.js:4-7` — `mbtiTF: 'T'`, `mbtiJP: 'P'`
- `main.ts:71-74` — 同理更新
- 三处一致 ENTP，加载无闪烁

---

### 25. 会话下拉图标优化

**需求**：会话切换下拉按钮提示不明显

**模块**：`src/panels/dialog.html`

**改动点**：
- `▼` (10px, `#aaa`) → Material Icon `arrow_drop_down` (16px, `#6E6E73`)

---

### 26. Git 提交记录

| Commit | 说明 |
|--------|------|
| `feafbd4` | fix: 动画审计修复 + 风格模板重构 + 清理无效文件 |
| `6119e5c` | fix: 流式响应 reasoning_content 支持 + 划词提问 + 引用切分 |

---

## 待办 / 未完成

| # | 事项 | 优先级 | 状态 |
|---|------|--------|------|
| 1 | `zhida-agent` 模型不支持上下文历史传参（需验证） | 中 | 待验证 |
| 2 | Windows / Linux / HarmonyOS 打包 | 低 | 待实现 |
| 3 | 内容收藏功能（北极狐 thinking bubble 菜单联动） | 低 | 待讨论 |

---

## 2026-05-11

### 18. 风格注入验证通过

**需求**：确认 `user` 前缀风格注入是否对知乎模型有效

**模块**：`electron/agent.ts`

**测试方法**：curl 发送有风格 vs 无风格的用户消息，对比回复

**发现**：
- ❌ "自我介绍"类问题 → 模型有硬编码模板，无法覆盖（之前误判的根因）
- ✅ 一般性问题（天气等） → 风格注入**完全有效**，差异巨大
  - 有风格："今天天气简直太棒啦！阳光灿烂得让人心情都跟着飞起来！蓝天像棉花糖..."
  - 无风格："以下是 2026 年 5 月 11 日的天气情况：北京晴转多云...最高 33℃..."

**结论**：移除 `system` role、改为 `user` 前缀的方案正确。MBTI 风格对一般性问题有效。无需双轮输出。

---

### 19. 代码审计修复（6 到 1）

对全项目代码逻辑审计，发现并修复 7 个问题，按严重程度排序：

#### 🟡 Medium

**#6 移除死代码** — `agent.ts:522-527`
- `formatInstructions` 搜索已删除的 `## 回复格式` 头，始终返回空
- 移除死代码块，仅保留 `## 关于搜索结果` 提取

**#7 跨年日期范围** — `main.ts:150-165`
- `mmddToNum` 数值比较对跨年范围失效（如 `12-25 ~ 01-03`）
- 修复：`startNum <= endNum` 判断，跨年用 `todayNum >= startNum || todayNum <= endNum`

**#8 ipcRenderer 监听器清理** — `preload.ts:125-130, 160-164`
- `onReceive`、`onChunk`、`onStyleChanged` 注册前缺 `removeAllListeners`
- 补全，防止 dialog 窗口重载时旧回调阻断新回调

#### 🟠 High

**#3 流式回复缺失 footer** — `dialog.js:475-481`
- Zhihu 流式回复创建裸 `<div>`，不经过 `addMsg()` → 无时间戳和复制按钮
- 修复：流式完成后 `remove()` streamingEl → 调用 `addMsg(msg, 'bot', true)`

**#4 热榜不更新 Agent 历史** — `agent.ts:400-403` + `main.ts:653-656`
- `save-hotlist-to-history` 写入 knowledge.json，但已有 agent 不知情
- 修复：新增 `Agent.pushMessage()`，保存后同步推入 agent 历史

#### 🔴 Critical

**#1 加载历史会话 stylePrefix 残留** — `main.ts:579-580`
- `conversation-load` 调 `setHistory()` 但不重建 Agent → `stylePrefix` 保留旧值
- 后续消息用错误 MBTI 风格发送
- 修复：`conversation-load` 设 `agent = null`，下次 `dialog-send` 时重新创建

**#2 事件动画跨天不更新** — `main.ts:136-178`
- `event_animations.json` 仅在 `did-finish-load` 时加载一次
- 应用跨天后动画不随日期切换（如儿童节过了仍显示）
- 修复：提取 `checkEventAnimations()`，外加 60 分钟 `setInterval` 定时刷新

---

### 20. 知乎 API Key 默认值硬编码

**需求**：新用户无需手动配置 API Key

**模块**：`electron/main.ts` · `src/panels/settings.js`

**改动点**：
- `main.ts:65` — `agentApiKey` 默认值从 `''` 改为 `'glywLStqwOGbkLNpO1f3ODZ0EACBTH3X'`
- `settings.js:5` — 同理
- 已有 `screen-toy-settings.json` 的用户不受影响

---

### 21. 刘看山入场位置调整

**需求**：入场动画在屏幕中心偏下

**模块**：`src/renderer.js`

**改动点**：
- `renderer.js:483` — `sy` 计算添加 `+ canvas.height * 0.08` 偏移

---

### 22. 动画注册模块解耦

**需求**：renderer.js 事件动画代码臃肿（95 行）

**模块**：`src/event-anim.js`（新增）

**改动点**：
- 提取 `window.EventAnim.apply()` 统一入口
- `renderer.js` 从 95 行缩至 8 行

---

### 23. 文档 + 展示页更新

**模块**：项目文档

**改动点**：
- `demo/index.html` — 北极狐展示页恢复，"有脾气的错误" → "会说话的'错误'"
- `demo/api.html` — Moltbook API 鉴权 demo 独立页面
- `demo/login.html` + `demo/callback/index.html` — OAuth 登录流程
- `animations.md` — 移至根目录

---

### Git 提交记录

| Commit | 说明 |
|--------|------|
| `feafbd4` | fix: 动画审计修复 + 风格模板重构 + 清理无效文件 |
| `6119e5c` | fix: 流式响应 reasoning_content 支持 + 划词提问 + 引用切分 |
| `6c4b5a8` | fix: MBTI 默认值统一 ENTP + Mother's Day 事件动画配置 |
| `7661734` | fix: 恢复北极狐展示页 + Moltbook demo 移至 api.html |
| `6102da3` | fix: 更新下载地址为 GitHub Release 链接 |
| `82b49c4` | fix: 硬编码知乎 API Key 默认值 |
| `e8a0958` | fix: 刘看山入场位置从中心改为中心偏下 |
