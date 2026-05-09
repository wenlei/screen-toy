# Knowledge Base (knowledge.ts)

## 概述

Session 持久化存储。所有对话记录（对话消息、热榜结果）都保存在本地 JSON 文件中。

**文件**: `electron/knowledge.ts`
**存储路径**: `~/Library/Application Support/screen-toy/knowledge.json`

## 数据结构

### ConversationRecord (Session)

```typescript
ConversationRecord {
  id: string;               // Session ID (Date.now().toString(36))
  date: string;             // 创建时间 ISO
  topic?: string;           // 标题（首条用户消息前 30 字）
  provider: string;         // AI provider ('zhihu')
  messages: Message[];      // 聊天记录
  // 元信息
  mbtiEI/SN/TF/JP?: string;
  agentModel?: string;
  searchType?: string;
  enableDirectAnswer?: boolean;
  // 风格变更历史
  initialStyle?: SessionMeta;
  styleChanges?: StyleChange[];
}
```

### StyleChange

```typescript
StyleChange {
  messageIndex: number;   // 第几条消息时变化
  mbtiEI/SN/TF/JP: string;
  timestamp: string;      // ISO 时间
}
```

## API

| 函数 | 说明 |
|------|------|
| `loadKnowledge()` | 从文件加载完整知识库 |
| `saveKnowledge(kb)` | 写入文件 |
| `getConversationList()` | 获取 Session 列表（含 hasStyleChanges 标记） |
| `getConversationById(id)` | 获取单个 Session |
| `saveOrUpdateConversation(record)` | 保存或更新 Session（合并消息） |
| `deleteConversation(id)` | 删除 Session |
| `recordStyleChange(id, newStyle)` | 记录风格变更到 Session |

## Session ↔ Conversation 关系

- 每个 `ConversationRecord` 就是一个 Session
- 保存时若 Session ID 为空 → 自动创建新 Session
- 更新时合并消息到已有 Session
- 新 Session 创建时记录 `initialStyle`

## 相关文档

- [Session System](session.md) — Session 生命周期
- [AI Agent](agent.md) — Agent 创建时加载 Session 历史
- [Dialog System](dialog.md) — 下拉框显示 Session 列表
