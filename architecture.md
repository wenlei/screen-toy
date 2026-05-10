# Screen Toy — Architecture Document

## Overview

Screen Toy is a macOS desktop pet application built with Electron. An arctic fox character lives on the screen, responds to interactions, and provides AI-powered conversations via Zhihu's developer APIs.

**Tech Stack**: Electron + TypeScript (main process) + vanilla JavaScript (renderer process)

---

## Architecture Layers

```
┌─────────────────────────────────────────────────────────┐
│                   Renderer Process                       │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │
│  │ index    │  │ dialog   │  │ settings │  │ bubble  │ │ │
│  │ (pet)    │  │ (chat)   │  │ (config) │  │ (popup) │ │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬────┘ │ │
│       │             │             │             │       │
│       │    behavior.js   dialog.js  settings.js  │       │
│       │    renderer.js                          │       │
│       │    doodle-render.js                     │       │
│       │                                         │       │
├───────┼─────────────┼─────────────┼─────────────┼───────┤
│       │   preload.ts (contextBridge)             │       │
├───────┼─────────────┼─────────────┼─────────────┼───────┤
│                   Main Process (Node.js)                 │
│                                                         │
│  ┌────────────────────────────────────────────────────┐ │
│  │  main.ts                                          │ │
│  │  ┌──────┐ ┌──────┐ ┌───────────┐ ┌──────────────┐ │ │
│  │  │agent │ │know- │ │settings   │ │window/tray   │ │ │
│  │  │.ts   │ │ledge │ │persistence│ │management    │ │ │
│  │  │      │ │.ts   │ │           │ │              │ │ │
│  │  └──────┘ └──────┘ └───────────┘ └──────────────┘ │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### Process Model

| Process | Runtime | Files | Capabilities |
|---------|---------|-------|--------------|
| **Main** | Node.js | `main.ts`, `agent.ts`, `knowledge.ts` | File I/O, HTTP requests, window/tray management |
| **Renderer** | Chromium | `dialog.js`, `settings.js`, `renderer.js` | DOM manipulation, UI rendering |
| **Preload** | Bridge | `preload.ts` | Exposes safe IPC API via `contextBridge` |

## IPC (Inter-Process Communication)

Communication between main and renderer processes via typed IPC channels:

```
┌─────────────────┐         ┌─────────────────┐
│  Renderer       │  IPC    │  Main           │
│  (dialog.js)    │◄───────►│  (main.ts)      │
└─────────────────┘         └─────────────────┘
```

### IPC Channels

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `dialog-send` | dialog → main | User sends a message |
| `dialog-message` | main → dialog | AI response delivered |
| `dialog-chunk` | main → dialog | Streaming response chunk |
| `dialog-clear` | dialog → main | Start new conversation |
| `dialog-bubble` | dialog → main | Trigger fox bubble animation |
| `api-bubble` | main → renderer | Show bubble text on fox |
| `conversation-list` | dialog ↔ main | Get Session history list |
| `conversation-load` | dialog ↔ main | Load a Session with meta info |
| `conversation-delete` | dialog → main | Delete a Session |
| `refresh-conversation-list` | main → dialog | Notify to refresh dropdown |
| `dialog-conversation-id` | main → dialog | Current Session ID |
| `style-changed` | main → dialog | MBTI style change notification |
| `zhihu-hot-list` | dialog → main | Fetch hotlist |
| `save-hotlist-to-history` | dialog → main | Save hotlist to Session |
| `apply-settings` | settings → main | Save settings |
| `settings-current` | main → settings | Load settings into panel |
| `mouse-pos` | main → renderer | Mouse position for pet interaction |
| `event-animations-config` | main → renderer | Date-matched event animation override (enter) |
| `quit-animations-config` | main → renderer | Date-matched event animation override (quit) |
| `save-hotlist-to-history` | dialog → main | Save hotlist result to session |
| `dialog-current-style` | main → dialog | Send current MBTI style on dialog open |

---

## Core Components

### 1. Pet System → [pet.md](pet.md)

The arctic fox character that lives on screen. Handles animations, state machine, and user interactions.

```
┌─────────────────────────────────────────────┐
│                renderer.js                   │
│  ┌───────────────────────────────────────┐  │
│  │  Game Loop (requestAnimationFrame)    │  │
│  │  ├─ Entrance/Quit animations          │  │
│  │  ├─ Special animations (twist/sneeze) │  │
│  │  ├─ Sun-dodge mini-game               │  │
│  │  ├─ Bubble display                    │  │
│  │  └─ Sprite rendering                  │  │
│  └───────────────────────────────────────┘  │
│                   ↕                          │
│  ┌───────────────────────────────────────┐  │
│  │            behavior.js                │  │
│  │  State Machine:                       │  │
│  │  idle → wander → sit → poke → drag    │  │
│  │       → falling_asleep → sleeping     │  │
│  │       → waking_up                     │  │
│  │                                       │  │
│  │  Bubble logic (scheduled/random)      │  │
│  │  Eye tracking (follows mouse)         │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
**

### 2. AI Agent System → [agent.md](agent.md)

Handles all external API communication.

```
┌─────────────────────────────────────────────────────────┐
│                     agent.ts                            │
│                                                         │
│  Agent Class                                            │
│  ├─ Constructor: system prompt + MBTI style injection   │
│  ├─ sendMessage(): non-streaming API call               │
│  ├─ sendMessageStream(): SSE streaming API call         │
│  ├─ setHistory(): load conversation history             │
│  └─ clearHistory(): reset conversation                  │
│                                                         │
│  Search Functions                                       │
│  ├─ searchZhihu(): 知乎站内搜索                         │
│  ├─ searchZhihuGlobal(): 全网搜索                       │
│  ├─ searchBing(): Bing scrape fallback                  │
│  └─ fetchZhihuHotList(): 知乎热榜                       │
│                                                         │
│  Error Handling                                         │
│  └─ getErrorMessage(): maps API codes to fun messages   │
│                                                         │
│  MBTI Style System                                      │
│  └─ MBTI_STYLE: 8-dimension personality descriptions    │
└─────────────────────────────────────────────────────────┘
```

**API Endpoints Used**:

| API | Endpoint | Method |
|-----|----------|--------|
| 直答 (Chat) | `developer.zhihu.com/v1/chat/completions` | POST |
| 知乎搜索 | `developer.zhihu.com/api/v1/content/zhihu_search` | GET |
| 全网搜索 | `developer.zhihu.com/api/v1/content/global_search` | GET |
| 热榜 | `developer.zhihu.com/api/v1/content/hot_list` | GET |

**Authentication**: Bearer token (`Authorization: Bearer <access_secret>`) + `X-Request-Timestamp`

### 3. Knowledge Base → [knowledge.md](knowledge.md)

Persistent file-based storage for Sessions and topics.

```
knowledge.json
├─ conversations[]       ← each entry is a Session
│  ├─ id, date, topic, provider
│  ├─ messages[] (user/assistant)
│  ├─ mbtiEI/SN/TF/JP (current style)
│  ├─ agentModel, searchType, enableDirectAnswer
│  ├─ initialStyle (Session creation style)
│  └─ styleChanges[] (style transitions during Session)
└─ topics[] (user interest topics)
```

**File**: `~/Library/Application Support/screen-toy/knowledge.json`

### 4. Settings System → [settings.md](settings.md)

Application configuration panel.

```
┌─────────────────────────┐     ┌──────────────────────────┐
│    settings.html/js      │ IPC │       main.ts            │
│                         │────►│                          │
│  AI Agent config        │     │  currentSettings object   │
│  ├─ Provider (知乎直答)  │     │  ├─ agentApiKey          │
│  ├─ Model (zhida-fast)  │     │  ├─ agentModel           │
│  ├─ API Key (🔒 locked) │     │  ├─ enableDirectAnswer   │
│  └─ 回答风格 (MBTI)      │     │  ├─ searchType           │
│                         │     │  ├─ mbtiEI/SN/TF/JP      │
│  应用菜单                │     │  ├─ menuApps[]           │
│  ├─ App list            │     │  └─ hotListLimit         │
│  └─ + 添加              │     │                          │
│                         │     │  screen-toy-settings.json │
│  激活动画                │     │──────────────────────────│
│  小游戏 (躲太阳)         │     │  ~/Library/Application   │
│  热榜设置 (条目数)       │     │  Support/screen-toy/     │
│  快捷操作                │     │                          │
└─────────────────────────┘     └──────────────────────────┘
```

**File**: `~/Library/Application Support/screen-toy/screen-toy-settings.json`

### 5. Dialog System → [dialog.md](dialog.md)

The AI chat window.

```
┌───────────────────────────────────────────────────────┐
│  刘看山的脑仁儿    [+ 新会话 ▼]  [🔥 热榜]  [☑ 直答] │
├───────────────────────────────────────────────────────┤
│                                                       │
│  Messages area                                        │
│  ┌─────────────────────────────────────────────────┐ │
│  │ User: 数字水印有什么标准吗？                     │ │
│  ├─────────────────────────────────────────────────┤ │
│  │ Bot: 根据搜索结果，数字水印标准主要包括...  [📋] │ │
│  ├─────────────────────────────────────────────────┤ │
│  │ System: [风格变更] 回答风格已切换：INTJ 建筑师   │ │
│  └─────────────────────────────────────────────────┘ │
├───────────────────────────────────────────────────────┤
│  [输入问题...]                              [发送]    │
└───────────────────────────────────────────────────────┘
```

**Direct Answer Toggle**:
- ✅ ON: Search context + Chat API → AI-generated response
- ❌ OFF: Search only → formatted result list

**Session History Dropdown**:
- Shows all past sessions with title + 🔄 style change indicator
- ✕ delete button on each item
- Click to load session (restores messages + meta info)

### 6. MBTI Personality System → [settings.md](settings.md#mbti-人格风格)

Users configure an MBTI style in Settings, which influences AI responses.

```
Settings: 回答风格
├─ 表达方式 [ E 外向 ←→ I 内向 ]
├─ 关注点   [ S 实感 ←→ N 直觉 ]
├─ 决策方式 [ T 思考 ←→ F 情感 ]
└─ 风格     [ J 判断 ←→ P 感知 ]

         │
         ▼ apply-settings IPC
         
main.ts: currentSettings.mbti*
         │
         ▼ Agent constructor
         
System Prompt injection:
  ## 回答风格
  - 热情外放，语调活泼，喜欢用感叹号     (E)
  - 天马行空，善于联想和抽象思考          (N)
  - 温暖共情，注重感受，有人情味          (F)
  - 灵活随性，自然不做作，像即兴聊天      (P)
```

**Style Changes**: When MBTI changes mid-session, it's recorded in `styleChanges[]` with message index and timestamp. Dialog shows `[风格变更] 回答风格已切换：ENFP → INTJ`.

---

## Data Flow

### Message Send Flow

```
User types message → clicks Send
  ↓
dialog.js: send()
  ↓ IPC: dialog-send
  ↓
main.ts: dialog-send handler
  ├─ Check API key
  ├─ Create/update Agent (with current MBTI)
  ├─ Load session history from knowledge.json
  ├─ Call agent.sendMessageStream(msg)
  │   ↓
  │ agent.ts: _sendMessageInternal()
  │   ├─ enableDirectAnswer?
  │   │   ├─ false → searchZhihu/searchGlobal → return results
  │   │   └─ true  → searchZhihu (context) → chat API call
  │   └─ Format: system prompt + user msg + history
  │
  ├─ Stream chunks → dialog-chunk IPC → dialog.js onChunk
  └─ onDone:
      ├─ dialog-message IPC → dialog.js onReceive
      ├─ saveOrUpdateConversation() → knowledge.json
      ├─ refresh-conversation-list IPC
      └─ triggerBubble('来消息了') → fox OK animation
```

### Session Flow

```
Dialog Opens
  ↓ (if no currentConversationId)
  ↓ IPC: conversation-load(latest session id)
  ↓
  │ main.ts: getConversationById(id)
  │   → agent.setHistory(messages)
  │   → restore currentSettings (mbti, model, etc.)
  │   → return { messages, styleChanges }
  ↓
dialog.js: display messages in chat area

User sends new message
  ↓
Appended to same session (saveOrUpdateConversation merges)
  ↓
Refresh dropdown
```

### Settings Apply Flow

```
settings.js: apply({ key: value, ... })
  ↓ IPC: apply-settings
  ↓
main.ts:
  ├─ Object.assign(currentSettings, settings)
  ├─ If MBTI changed + active session → recordStyleChange()
  │   → style-changed IPC → dialog shows notification
  ├─ Reset agent (null) for next dialog-send
  └─ saveSettings() → screen-toy-settings.json
```

---

## Error Handling Strategy

All Zhihu API errors are caught and mapped to fun, character-appropriate messages:

| Error Code | Message |
|------------|---------|
| 30001 | 我脑仁儿干了，一滴都没了。(今日配额已用完) |
| 20001 | 拿别人的钥匙开不了我的门。(API Key 鉴权失败) |
| 10001 | 能换种说法，再说一遍吗？(请求参数错误) |
| 90001 | 我处理点私事儿。(服务内部错误) |
| 429 | 我再消化一会儿。(请求过于频繁) |
| 401 | 硬来是不行的。(未授权) |
| 422 | 要不你再说一句别的？(请求参数错误) |
| 500 | 这次是我的问题。(服务器错误) |
| network_error | 信号不好，我听不见。(网络连接失败) |

**Error Flow**:
```
API Error Response
  ↓
agent.ts: getErrorMessage(code)
  ↓
main.ts: sendFn().catch()
  ↓
dialog.js: addMsg('⚠️ ' + error, 'system')
```

---

## File Structure

```
screen-toy/
├── electron/                    # Main process (TypeScript)
│   ├── main.ts                  # Window management, IPC, settings
│   ├── preload.ts               # contextBridge API
│   ├── agent.ts                 # AI Agent, search, hotlist
│   └── knowledge.ts             # Session storage, CRUD
│
├── src/                         # Renderer process (JavaScript)
│   ├── index.html               # Main pet window (transparent)
│   ├── renderer.js              # Game loop, animations, drag
│   ├── behavior.js              # Pet state machine
│   ├── doodle-render.js         # Sprite rendering
│   ├── config.js                # Default parameters
│   ├── sun-window.html/js       # Sun-dodge game window
│   ├── panels/
│   │   ├── dialog.html/js       # AI chat window
│   │   ├── settings.html/js     # Settings panel
│   │   ├── bubble.html/js       # Thinking bubble popup
│   │   └── menu.html/js         # Right-click menu
│   └── assets/
│       └── doodles/arctic_fox/  # Sprite sheets
│           ├── event_animations.json  # Date-driven event animation config
│           └── animations.md          # Event animation documentation
│
├── session.md                   # Session mechanism spec
├── agent.md                     # AI Agent module
├── pet.md                       # Pet System module
├── dialog.md                    # Dialog System module
├── settings.md                  # Settings System module
├── knowledge.md                 # Knowledge Base module
├── architecture.md              # This document
├── README.md                    # User documentation
├── package.json
└── tsconfig.json
```

## Storage Locations

| File | Path | Purpose |
|------|------|---------|
| `knowledge.json` | `~/Library/Application Support/screen-toy/knowledge.json` | Session data: messages, meta, style changes |
| `screen-toy-settings.json` | `~/Library/Application Support/screen-toy/screen-toy-settings.json` | App settings: API key, MBTI, model, menus |

---

## Key Design Decisions

1. **Vanilla JavaScript in renderer**: No framework overhead for small UI windows
2. **Streaming SSE for chat**: Better UX with real-time response display
3. **knowledge.json as Session store**: Simple file-based storage, no database
4. **MBTI as system prompt injection**: Style instructions become part of the AI context
5. **Copy button on bot messages**: `content_copy` icon with clipboard API
6. **Lock icon on API key**: Material Symbols `lock`/`lock_open` toggle
7. **Session dropdown as custom div**: Supports delete buttons and style markers, unlike native `<select>`
