# AI Agent (agent.ts)

## 概述

AI Agent 是应用程序与知乎 API 通信的核心模块，负责搜索、直答（chat）和热榜功能。

**文件**: `electron/agent.ts`

## 核心类

### Agent Class

```typescript
class Agent {
  constructor(config: AgentConfig)
  sendMessage(content, onChunk?, onDone?, onError?): Promise<string>
  sendMessageStream(content, onChunk?, onDone?, onError?): Promise<string>
  getHistory(): ChatMessage[]
  setHistory(messages): void
  clearHistory(): void
}
```

### AgentConfig

| 字段 | 类型 | 说明 |
|------|------|------|
| `apiKey` | string | Bearer Token 鉴权 |
| `endpoint` | string | API 端点 |
| `model` | string | 模型名（zhida-fast-1p5 等） |
| `systemPrompt` | string | 系统提示词（含 MBTI 注入） |
| `provider` | 'zhihu' | API Provider |
| `zhihuAccessSecret` | string | 知乎 Access Secret（搜索用） |
| `enableDirectAnswer` | boolean | 直答开关 |
| `searchType` | 'zhihu' / 'global' | 搜索类型 |
| `mbtiEI/SN/TF/JP` | string | MBTI 人格风格 |

## API 端点

| 功能 | 端点 | Method | 鉴权 |
|------|------|--------|------|
| 直答 | `developer.zhihu.com/v1/chat/completions` | POST | Bearer + X-Request-Timestamp |
| 知乎搜索 | `developer.zhihu.com/api/v1/content/zhihu_search` | GET | Bearer + X-Request-Timestamp |
| 全网搜索 | `developer.zhihu.com/api/v1/content/global_search` | GET | Bearer + X-Request-Timestamp |
| 热榜 | `developer.zhihu.com/api/v1/content/hot_list` | GET | Bearer + X-Request-Timestamp |

## 搜索逻辑

```
_sendMessageInternal()
  ├─ enableDirectAnswer?
  │   ├─ false → searchZhihu/searchGlobal → return results
  │   └─ true  → searchZhihu (context) → chat API call
  │
  └─ 搜索顺序: zhihu → global → Bing (fallback)
```

## 直答流程

```
用户消息
  ↓
构建 messages: [system?, ...history, user msg + search context]
  ↓
POST chat/completions { model, messages, stream, temperature }
  ↓
流式解析 SSE → onChunk(delta) → dialog.js 实时渲染
  ↓
完成 → onDone(fullReply) → 保存到 Session
```

## 系统提示词

```
DEFAULT_SYSTEM_PROMPT
  └─ ## 回复格式
  └─ ## 回答风格        ← MBTI 动态注入
  └─ ## 关于搜索结果
  └─ ## 关于代码
  └─ ## 关于文件系统
```

**MBTI 注入**：在 Agent 构造函数中，从 `config.mbtiEI/SN/TF/JP` 读取当前风格，注入到 `## 回答风格` 章节。

## 错误处理

`getErrorMessage(code)` 将 API 错误码映射为趣味提示：

| Code | Message |
|------|---------|
| 30001 | 我脑仁儿干了，一滴都没了。(今日配额已用完) |
| 20001 | 拿别人的钥匙开不了我的门。(API Key 鉴权失败) |
| 429 | 我再消化一会儿。(请求过于频繁) |
| 网络错误 | 信号不好，我听不见。(网络连接失败) |

## 相关文档

- [Session System](session.md) — Session 生命周期
- [Dialog System](dialog.md) — 对话 UI
- [Error Handling](architecture.md#error-handling-strategy) — 完整错误码表
