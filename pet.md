# Pet System (renderer.js + behavior.js + doodle-render.js)

## 概述

桌面宠物系统——一只北极狐在屏幕上走动、响应交互、展示动画。

**文件**：
- `src/renderer.js` — 游戏循环、动画管理、鼠标交互
- `src/behavior.js` — 状态机、行为逻辑
- `src/doodle-render.js` — 精灵图加载与渲染

## 状态机 (behavior.js)

```
idle ──→ wander ──→ idle ──→ sit ──→ idle
  │        │                    │
  │        └──→ poke            └──→ falling_asleep → sleeping → waking_up
  │
  └──→ drag → idle
```

| 状态 | 说明 | 帧间隔 |
|------|------|--------|
| idle | 原地待机，身体轻微浮动 | 180ms |
| wander | 随机方向行走，碰壁反弹 | 120ms |
| sit | 坐下，可触发菜单/飞机 | 400ms |
| poke | 被戳中的反应动画 | 70ms |
| drag | 被拖拽中 | — |
| falling_asleep | 角落静止后入睡过渡 | — |
| sleeping | 睡眠循环动画 | — |
| waking_up | 点击唤醒过渡 | — |

## 动画系统 (renderer.js)

| 动画 | 触发方式 | 帧数 | 对话 |
|------|----------|------|------|
| Entrance | 启动时自动 | 24 | — |
| Quit | 退出时 | 24 | — |
| Event Entrance | 日期匹配时自动覆盖入场 | 24 | — |
| Event Quit | 日期匹配时自动覆盖退场 | 24 | — |
| Twist | 自动/手动 | 24×3 | 0%: 哎呀,我拧巴了！ / 100%: 终于不拧了! |
| Hula | 自动/手动 | 24×3 | 0%: 穿裙子咯~ / 50%: 左三圈... / 100%: 跳完啦! |
| Sneeze | 自动/手动 | 24 | 0%: 啊...啊... / 80%: 阿嚏!!! |
| Melt | 自动/手动 | 24 | 0%: 好热啊... / 50%: 我化了... |
| Apple/Hudun | 手动 | 24×2 | 0%: 哎呦! / 50%: 怎么回事... |
| Freeze/Thaw | 手动 | 24×2 | 0%: 嘶—好冷！ / 50%: 冻成冰棍了... |
| BigNose | 手动 | 24 | 0%: 鼻子变大了？ |
| Flower | 手动 | 24×2 | 0%: 人生亦如是... / 50%: 花开花落。 |
| OK | AI 回复时 | 24 | — |
| Sun Game | 手动开关 | — | — |

## 精灵图

**主精灵图**：4 方向（E/S/N/W）× 24 帧，720×600px/帧

**特殊动画精灵图**：6 列 × 4 行 = 24 帧，256×256px/帧

文件位置：`src/assets/doodles/arctic_fox/`

## 事件动画（日期驱动）

特定日期自动切换到配置的入场/退场动画，覆盖默认精灵图。

**配置文件**：`src/assets/doodles/arctic_fox/event_animations.json`

```json
{
  "resource_groups": {
    "christmas": { "enter": "christmas_enter.png", "quit": "quit_sheet.png" }
  },
  "events": [
    { "date": "05-09", "animations": { "enter": "zongzi_enter_sheet.png" } },
    { "date": "12-24", "group": "christmas" }
  ]
}
```

**流程**：
1. `main.ts` 窗口加载后读 JSON，按当天 `MM-DD` 匹配事件
2. 若匹配，通过 IPC `event-animations-config` / `quit-animations-config` 下发到 renderer
3. `renderer.js` 动态替换 `EnterSprite.drawDirect` / `QuitSprite.draw(·)` 为新图像的绘制方法

**字段说明**：

| 字段 | 说明 |
|------|------|
| `events[].date` | 触发日期，`MM-DD` 格式 |
| `events[].animations` | 内联动画映射（`enter`/`quit` → 文件名） |
| `events[].group` | 引用 `resource_groups` 中的动画组 |
| `resource_groups` | 可复用的命名动画组，多个日期共享 |
| 优先级 | `animations` > `group` |

详细示例见 `src/assets/doodles/arctic_fox/animations.md`。

## 交互

| 操作 | 效果 |
|------|------|
| 鼠标悬停 | 眼睛跟随光标 |
| 单击 | 坐下 + 弹出思维气泡菜单 |
| 拖拽 | 拖动到任意位置 |
| 屏幕角落静止 | 触发睡眠 |

## 气泡系统

- 文字分片显示（15 字/段）
- 支持单条序列和队列
- AI 消息触发「来消息了」+ OK 动画

### 动画对话（Animation Dialogue）

动画播放过程中，可按照进度百分比触发文字对话气泡：

- 配置 `ANIM_DIALOGUES` 对象（`{ p: 0-100, text: "..." }[]`）
- `p: 0` = 动画开始，`p: 50` = 动画中间，`p: 100` = 动画结束
- 每个百分比点只触发一次
- 动画重新启动时重置触发记录

```javascript
var ANIM_DIALOGUES = {
  twist: [{ p: 0, text: '哎呀，我拧巴了！' }, { p: 100, text: '终于好了！' }],
  hula:  [{ p: 0, text: '穿裙子咯~'   }, { p: 50, text: '左三圈...'  }],
  ...
};
```

## 相关文档

- [AI Agent](agent.md) — AI 回复触发 OK 动画
- [Bubble System](bubble.md) — 气泡渲染
