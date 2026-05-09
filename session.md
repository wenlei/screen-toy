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
  → 自动加载最新 session（如果有）
  → 显示该 session 的完整聊天记录
  → 用户可继续聊天，新消息追加到当前 session

用户选择历史 session
  → 加载该 session 的聊天记录到对话区
  → 加载该 session 的元信息（MBTI 风格、模型等）
  → 用户可继续聊天，新消息追加到该 session

用户点击「新会话」
  → 重置 currentConversationId
  → 清空对话区
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
  role: 'user' | 'assistant';
  content: string;
  styleChange?: StyleChange;  // 如果这条消息触发了风格变更，记录在这里
}

interface ConversationRecord {
  id: string;                 // session 唯一标识（Date.now().toString(36)）
  date: string;               // 创建时间 ISO 字符串
  topic?: string;             // 第一条用户消息的前 30 字（作为标题）
  provider: string;           // AI provider（zhihu）
  messages: Message[];        // 聊天记录数组
  
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
如果当前 session 已有消息 → 记录风格变更
  ↓
保存到 session 的 styleChanges 数组
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

## Session 生命周期

### 1. Session 创建（自动）

**触发条件**：保存 conversation 时检测到 `currentConversationId` 为空

**触发点**：
- `dialog-send` IPC Handler — 用户发送消息后保存回复
- `save-hotlist-to-history` IPC Handler — 用户点击热榜后保存结果

**流程**：
```
saveOrUpdateConversation() / saveHotlistToHistory()
  ↓
检查 currentConversationId
  ↓ (为空)
生成新 Session ID：cid = Date.now().toString(36)
  ↓
设置 currentConversationId = cid
  ↓
通知 dialog：dialog-conversation-id IPC
  ↓
保存到 knowledge.json：
  - 创建新记录（首次记录 initialStyle）
  - 写入第一条 user + assistant 消息
  ↓
发送 refresh-conversation-list → 下拉框出现新 Session

### 2. Session 加载

**触发条件**：用户打开对话窗口 或 从下拉框选择历史会话

**流程**：
```
用户操作
  ↓
main.ts: knowledge.getConversationById(id)
  ↓
agent.clearHistory()
agent.setHistory(messages)
  ↓
dialog: 显示 messages（逐个 addMsg）
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
  → 下次发消息自动创建新 session

选择历史会话：
  → conversation-load IPC
  → knowledge.getConversationById(id)
  → agent.clearHistory() + agent.setHistory(messages)
  → 恢复元信息到 currentSettings
  → 下次发消息追加到该 session
```

## 元信息恢复

加载历史 session 时，需要恢复以下设置：

| 字段 | 恢复目标 | 说明 |
|------|----------|------|
| mbtiEI/SN/TF/JP | currentSettings | Settings 面板 MBTI toggle |
| agentModel | currentSettings.agentModel | AI 模型选择 |
| searchType | currentSettings.searchType | 搜索类型 |
| enableDirectAnswer | currentSettings.enableDirectAnswer | 直答开关 |

**注意**：恢复元信息不应影响 Settings 面板的当前显示，仅在 Agent 创建时使用。

## IPC 接口

| IPC | 方向 | 用途 |
|-----|------|------|
| `dialog-send` | dialog → main | 发送消息 |
| `dialog-clear` | dialog → main | 新会话 |
| `conversation-list` | dialog → main → dialog | 获取会话列表 |
| `conversation-load` | dialog → main → dialog | 加载指定会话 |
| `conversation-delete` | dialog → main | 删除会话 |
| `refresh-conversation-list` | main → dialog | 通知刷新列表 |
| `dialog-conversation-id` | main → dialog | 通知当前 session ID |
| `style-changed` | main → dialog | 通知风格变更（含新的 MBTI 值） |

## 涉及文件

| 文件 | 职责 |
|------|------|
| `electron/main.ts` | Session 创建/加载/更新/切换；元信息管理；风格变更检测与记录 |
| `electron/knowledge.ts` | ConversationRecord 定义；CRUD 操作 |
| `electron/preload.ts` | 暴露 IPC 接口 |
| `src/panels/dialog.js` | 对话 UI；下拉框交互；风格变更提示 |
| `src/panels/dialog.html` | 对话窗口布局 |
| `src/panels/settings.html` | MBTI toggle（触发风格变更） |

## 相关文档

| 文档 | 关联点 |
|------|--------|
| [knowledge.md](knowledge.md) | Session 持久化存储、CRUD 操作 |
| [agent.md](agent.md) | Agent 创建时加载 Session 历史 |
| [dialog.md](dialog.md) | Session 列表下拉框、加载/切换/删除 |
| [settings.md](settings.md) | Session 风格变更（MBTI）记录与感知 |

## 风格变更感知

### 变更时机

用户在 Settings 中调整 MBTI 后，下一次发送消息时 agent 重建，新风格生效。此时：

1. **记录变更**：如果当前 session 已有消息（消息数 > 0），将本次变更写入 session 的 `styleChanges`
2. **通知 dialog**：主进程发送 `style-changed` 事件，携带新旧风格的 MBTI 值
3. **对话区显示**：dialog 添加一条 system 消息，提示风格已变更

### 对话区显示格式

```
[系统] 回答风格已切换：ENFP 竞选者 → INFJ 提倡者
```

### 会话记录中的体现

在对话历史下拉框中，发生过风格变更的 session 可以在标题旁显示标记：

```
浏阳烟花爆炸是怎么回事？ 🔄
```

查看历史 session 时，对话区显示风格变更标记，让用户感知到风格的变化点。

### 风格变更不触发 agent 重建

风格变更通过 Settings panel 操作，agent 在下次 `dialog-send` 时使用最新 `currentSettings` 重建，自动包含新风格。不需要额外的 agent 重建逻辑。

## 已知问题和修复项

| # | 问题 | 状态 |
|----|------|------|
| 1 | Agent 在 dialog 打开时不存在 | ✅ 已修复 — 改为 `dialog-send` 时延迟加载 |
| 2 | Session 缺少元信息 | ✅ 已修复 — `ConversationRecord` 已扩展 |
| 3 | 加载历史会话时不恢复元信息 | ✅ 已修复 — `conversation-load` 恢复 currentSettings |
| 4 | 保存会话时不保存元信息 | ✅ 已修复 — `saveOrUpdateConversation` 传入元字段 |
| 5 | 风格变更不记录到 session | ✅ 已修复 — `recordStyleChange` + `style-changed` IPC |
| 6 | 对话区不显示风格变更标记 | ✅ 已修复 — dialog.js 监听 `onStyleChanged` |
