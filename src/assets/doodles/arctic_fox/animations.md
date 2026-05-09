# 日期驱动动画配置

配置文件：`event_animations.json`

## 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `events` | array | 日期事件列表，按 `MM-DD` 格式匹配当天日期 |
| `events[].date` | string | 触发日期，格式 `MM-DD`（如 `05-12`，`12-25`） |
| `events[].animations` | object | 内联动画-文件映射（键名如 `enter`、`quit`，值为精灵图文件名） |
| `events[].group` | string | 引用 `resource_groups` 中的某个动画组 |
| `resource_groups` | object | 可复用的命名动画组，供多个日期通过 `group` 字段引用 |

## 优先级

`animations` > `group`

若事件同时写了 `animations` 和 `group`，以 `animations` 为准。

## 支持的动画键

| 键 | 含义 |
|----|------|
| `enter` | 入场动画精灵图 |
| `quit` | 退场动画精灵图 |

渲染进程只在配置中出现对应键时才覆盖默认动画，不出现则使用默认。

## 素材规范

- 精灵图格式：PNG，6 列 × 4 行 = 24 帧，每帧 256×256
- 素材路径：`src/assets/doodles/arctic_fox/`（与配置文件同目录）

## 示例

### 内联写法

直接在事件中写死动画文件，适合该日期有专属素材的情况：

```json
{
  "events": [
    {
      "date": "05-09",
      "animations": {
        "enter": "zongzi_enter_sheet.png",
        "quit": "quit_sheet.png"
      }
    }
  ]
}
```

### 动画组写法

多个日期共享同一套动画时，先定义 `resource_groups`，再通过 `group` 引用：

```json
{
  "resource_groups": {
    "christmas": {
      "enter": "christmas_enter.png",
      "quit": "quit_sheet.png"
    },
    "newyear": {
      "enter": "newyear_enter.png",
      "quit": "quit_sheet.png"
    }
  },
  "events": [
    { "date": "12-24", "group": "christmas" },
    { "date": "12-25", "group": "christmas" },
    { "date": "01-01", "group": "newyear" }
  ]
}
```

### 混合写法

部分日期独立配置，部分日期复用动画组：

```json
{
  "resource_groups": {
    "christmas": {
      "enter": "christmas_enter.png",
      "quit": "quit_sheet.png"
    }
  },
  "events": [
    { "date": "05-09", "animations": { "enter": "zongzi_enter_sheet.png" } },
    { "date": "12-24", "group": "christmas" },
    { "date": "12-25", "group": "christmas" }
  ]
}
```
