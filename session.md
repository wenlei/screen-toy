# Session 会话机制 Spec

## 概述

Session（会话）是将聊天历史按时间序列组织的功能。每个 Session 是一个独立的对话单元，包含元信息和完整的聊天记录。

**核心规则**：每个 conversation 都属于一个 session。当保存 conversation 时，如果没有既有的 session，系统自动创建新 session。新 session 会立即出现在会话历史下拉列表中。

## 核心流程

```
任何 conversation 保存操作（对话/热榜）
  ↓
currentConversationId 为空？
  ├─ 是 → 自动创建新 Session
  └─ 否 → 追加到已有 Session
  ↓
新 Session 立即出现在下拉列表
```

```
用户打开对话窗口
  → 发送 dialog-current-style IPC → 显示 [当前风格] ENFJ 主人公
  → 自动加载最新 session（如果有）
  → 显示该 session 的完整聊天记录（含风格信息）
  → 用户可继续聊天，新消息追加到当前 session

用户选择历史 session
  → 加载该 session 的聊天记录到对话区
  → 加载该 session 的元信息（MBTI 风格、模型等）
  → 显示初始风格系统消息 + 风格变更记录
  → 用户可继续聊天，新消息追加到该 session

用户点击「新会话」
  → 重置 currentConversationId
  → 清空对话区 → 显示 [当前风格]（从缓存读取）
  → 下次保存 conversation 时自动创建新 session
```

## 数据结构

### knowledge.json 中的 ConversationRecord

```typescript
interface StyleChange {
  messageIndex: number;       // 第几条消息时发生变化
  mbtiEI: string;             // 变化后的 MBTI 风格
  mbtiSN: string;
  mbtiTF: string;
  mbtiJP: string;
  timestamp: string;          // 变化时间 ISO 字符串
}

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ConversationRecord {
  id: string;                 // session 唯一标识（Date.now().toString(36)）
  date: string;               // 创建时间 ISO 字符串
  topic?: string;             // 第一条 user 消息的前 30 字（作为标题）
  provider: string;           // AI provider（zhihu）
  messages: Message[];        // 聊天记录数组（含 system 风格消息）

  // ---- Session 元信息（当前生效的风格） ----
  mbtiEI?: string;            // 当前人格风格 E/I
  mbtiSN?: string;            // 当前人格风格 S/N
  mbtiTF?: string;            // 当前人格风格 T/F
  mbtiJP?: string;            // 当前人格风格 J/P
  agentModel?: string;        // AI 模型名
  searchType?: string;        // 搜索类型（zhihu / global）
  enableDirectAnswer?: boolean; // 是否启用直答

  // ---- 风格变更历史 ----
  styleChanges?: StyleChange[]; // 记录会话中所有风格变更
  initialStyle?: {             // 会话创建时的初始风格
    mbtiEI: string;
    mbtiSN: string;
    mbtiTF: string;
    mbtiJP: string;
  };
}
```

### 风格信息在消息中的存储

每条 Session 的消息列表（`messages[]`）以系统消息形式包含风格信息：

| 消息位置 | 内容 | 写入时机 |
|----------|------|----------|
| 第 1 条 | `[会话风格] ENFJ 主人公` | `saveOrUpdateConversation` 创建时 |
| 中间 | `[风格变更] 回答风格已切换：INTJ` | `recordStyleChange` |

`role: 'system'` 的消息在加载历史时通过 `addMsg('...', 'system', false)` 渲染。

### 风格感知机制

```
用户在 Settings 调整 MBTI toggle
  ↓
apply({ mbtiEI: 'I', ... })
  ↓
main.ts: currentSettings 更新
  ↓
agent 重建（下次 dialog-send 生效）
  ↓
style-changed IPC → dialog 窗口立即显示更新（无论有无活跃会话）
```

**风格生效范围**（已验证）：
| 问题类型 | 风格效果 |
|----------|----------|
| 自我介绍 / 你是谁 | ❌ 模型有硬编码模板，无法覆盖 |
| 一般性知识问答 | ✅ 风格注入完全有效 |

测试对比："今天的天气怎么样？"→ 有风格（热情活泼+感叹号）与无风格（数据罗列）差异巨大。日常对话中 99% 为一般性问题，风格注入有效。
用户在 Settings 调整 MBTI toggle
  ↓
apply({ mbtiEI: 'I', ... })
  ↓
main.ts: currentSettings 更新
  ↓
agent 重建（下次 dialog-send 生效）
  ↓
style-changed IPC → dialog 窗口立即显示更新（无论有无活跃会话）
  ↓
如果当前 session 已有消息 → recordStyleChange 写入 system 消息
```

### 风格变更记录格式

```json
{
  "styleChanges": [
    {
      "messageIndex": 4,
      "mbtiEI": "I",
      "mbtiSN": "N",
      "mbtiTF": "F",
      "mbtiJP": "J",
      "timestamp": "2026-05-08T20:30:00.000Z"
    }
  ]
}
```

表示在第 4 条消息后，风格从初始 ENTP 变为 INFJ。

### 文件位置

```
~/Library/Application Support/screen-toy/knowledge.json
```

### Conversation ↔ Session 关系

每个 `ConversationRecord` 就是一个独立的 Session。所有对话记录——无论是来自对话窗口的消息还是热榜查询——都必须归属于某个 Session。

| 规则 | 说明 |
|------|------|
| **自动创建** | 保存 conversation 时，`currentConversationId` 为空 → 自动创建新 Session（`Date.now().toString(36)`） |
| **立即可见** | 新 Session 创建后通过 `refresh-conversation-list` IPC 刷新，下拉框即刻显示 |
| **ID 稳定** | Session ID 在应用生命周期中保持不变，直到用户点击「新会话」重置 |
| **双入口** | `dialog-send` 和 `save-hotlist-to-history` 都遵循相同的自动创建逻辑 |
| **初始风格** | 新 Session 创建时自动在消息列表首位插入 `[会话风格] ENFJ` 系统消息 |

## Session 生命周期

### 1. Session 创建（自动）

**触发条件**：保存 conversation 时检测到 `currentConversationId` 为空

**触发点**：
- `dialog-send` IPC Handler — 用户发送消息后保存回复
- `save-hotlist-to-history` IPC Handler — 用户点击热榜后保存结果

**流程**：
```
saveOrUpdateConversation()
  ↓
检查 currentConversationId
  ↓ (为空)
生成新 Session ID：cid = Date.now().toString(36)
  ↓
设置 currentConversationId = cid
  ↓
通知 dialog：dialog-conversation-id IPC（含 MBTI 风格信息）
  ↓
保存到 knowledge.json：
  - 创建新记录（记录 initialStyle）
  - 插入 [会话风格] 系统消息到首位
  - 写入 user + assistant 消息
  ↓
发送 refresh-conversation-list → 下拉框出现新 Session
```

### 2. Session 加载

**触发条件**：用户打开对话窗口 或 从下拉框选择历史会话

**流程**：
```
用户操作
  ↓
main.ts: knowledge.getConversationById(id)
  ↓
agent.clearHistory()
agent.setHistory(messages)        # 仅 user/assistant 角色
  ↓
dialog: 显示 messages（逐个 addMsg，含 system 风格消息）
  ↓
恢复元信息：mbtiEI/SN/TF/JP/agentModel/searchType/enableDirectAnswer
```

### 3. Session 更新

**触发条件**：每次 AI 回复后

**流程**：
```
AI 回复到达
  ↓
main.ts onDone 回调
  ↓
查找已有记录：knowledge.getConversationById(cid)
  ↓
合并消息：existing.messages + [userMsg, assistantMsg]
  ↓
knowledge.saveOrUpdateConversation({ id: cid, ..., messages: allMessages })
  ↓
通知 dialog 刷新下拉列表：dialogWin.webContents.send('refresh-conversation-list')
```

### 4. Session 切换

**触发条件**：用户点击「新会话」或选择历史会话

**流程**：
```
点击「新会话」：
  → dialog-clear IPC
  → currentConversationId = ''
  → agent.clearHistory()
  → 清空对话区 → 显示 [当前风格]（从缓存 currentStyle 读取）
  → 下次发消息自动创建新 session

选择历史会话：
  → conversation-load IPC
  → currentConversationId = id
  → 恢复元信息到 currentSettings
  → agent = null（销毁旧 Agent，下次 dialog-send 时用新 MBTI 重建）
  → 下次发消息时：重新创建 Agent（包含正确的 stylePrefix） + 加载该 Session 的完整历史
```

## 元信息恢复

加载历史 session 时，需要恢复以下设置：

| 字段 | 恢复目标 | 说明 |
|------|----------|------|
| mbtiEI/SN/TF/JP | currentSettings | Settings 面板 MBTI toggle |
| agentModel | currentSettings.agentModel | AI 模型选择 |
| searchType | currentSettings.searchType | 搜索类型 |
| enableDirectAnswer | currentSettings.enableDirectAnswer | 直答开关 |

## IPC 接口

| IPC | 方向 | 用途 |
|-----|------|------|
| `dialog-send` | dialog → main | 发送消息 |
| `dialog-clear` | dialog → main | 新会话 |
| `conversation-list` | dialog → main → dialog | 获取会话列表 |
| `conversation-load` | dialog → main → dialog | 加载指定会话（同步设置 currentConversationId） |
| `conversation-delete` | dialog → main | 删除会话 |
| `refresh-conversation-list` | main → dialog | 通知刷新列表 |
| `dialog-conversation-id` | main → dialog | 通知当前 session ID + MBTI 风格信息 |
| `dialog-current-style` | main → dialog | 对话框打开时下发当前 MBTI |
| `style-changed` | main → dialog | 风格变更通知（无会话时也发送） |
| `save-hotlist-to-history` | dialog → main | 热榜结果保存到 Session |

## 涉及文件

| 文件 | 职责 |
|------|------|
| `electron/main.ts` | Session 创建/加载/更新/切换；元信息管理；风格变更检测与记录 |
| `electron/knowledge.ts` | ConversationRecord 定义；CRUD 操作；styleChange 同时写入 system 消息 |
| `electron/preload.ts` | 暴露 IPC 接口；监听器注册前 removeAllListeners 防累积 |
| `src/panels/dialog.js` | 对话 UI；风格显示（当前/变更/初始）；会话下拉框；时间戳+复制 |
| `src/panels/dialog.html` | 对话窗口布局；.msg-footer 样式 |
| `src/panels/settings.html` | MBTI toggle（触发风格变更） |

## 相关文档

| 文档 | 关联点 |
|------|--------|
| [knowledge.md](knowledge.md) | Session 持久化存储、CRUD 操作 |
| [agent.md](agent.md) | Agent 创建时加载 Session 历史 |
| [dialog.md](dialog.md) | Session 列表下拉框、加载/切换/删除、风格显示 |
| [settings.md](settings.md) | Session 风格变更（MBTI）记录与感知 |

## 已知问题和修复项

| # | 问题 | 状态 |
|----|------|------|
| 1 | Agent 在 dialog 打开时不存在 | ✅ 已修复 — 改为 `dialog-send` 时延迟加载 |
| 2 | Session 缺少元信息 | ✅ 已修复 — `ConversationRecord` 已扩展 |
| 3 | 加载历史会话时不恢复元信息 | ✅ 已修复 — `conversation-load` 恢复 currentSettings |
| 4 | 保存会话时不保存元信息 | ✅ 已修复 — `saveOrUpdateConversation` 传入元字段 |
| 5 | 风格变更不记录到 session | ✅ 已修复 — `recordStyleChange` + `style-changed` IPC |
| 6 | 加载历史不显示初始风格/变更 | ✅ 已修复 — system 消息写入 messages 数组 |
| 7 | 对话框打开不显示当前风格 | ✅ 已修复 — `dialog-current-style` IPC |
| 8 | 无活跃会话时风格变更不通知 dialog | ✅ 已修复 — style-changed 解除 currentConversationId 依赖 |
| 9 | 加载历史不设置 currentConversationId | ✅ 已修复 — conversation-load 同步设置 |
| 10 | ipcRenderer 监听器页面重载后累积 | ✅ 已修复 — removeAllListeners 清理 |
| 11 | 热榜不保存到 Session | ✅ 已修复 — saveHotlistToHistory 从 Settings bridge 移至 Dialog bridge |
| 12 | 加载历史 Session 后 MBTI 风格残留 | ✅ 已修复 — conversation-load 设 agent = null 强制重建 |
| 13 | 热榜不更新 Agent 历史 | ✅ 已修复 — 新增 pushMessage() 方法同步 agent 内部历史 |
| 14 | 流式响应 reasoning_content 未累积 → 空响应 | ✅ 已修复 — agent.ts 同步捕获两种 delta |
| 15 | 渲染层引用来源未切分 | ✅ 已修复 — stripCitations() 仅影响显示层 |
| 16 | MBTI 默认值 HTML/JS/main 不一致 | ✅ 已修复 — 统一为 ENTP |
