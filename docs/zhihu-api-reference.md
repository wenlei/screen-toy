# 知乎开放平台 API 文档参考

来源：https://developer.zhihu.com/docs

---

## Bearer 鉴权说明

### 说明

知乎开放平台当前推荐通过 `Authorization: Bearer <your_access_secret>` 的方式调用数据接口。

对于 `zhihu_search`、`global_search`、`hot_list` 等接口，调用时统一使用 Bearer 鉴权即可。

### 获取 Access Secret

请在知乎开放平台 [个人中心](https://developer.zhihu.com/profile) 查看并获取 Access Secret

说明：
- 调用方需要将 Access Secret 作为 Bearer Token 放入请求头。
- 服务端会校验 `Authorization` 与 `X-Request-Timestamp`。
- `X-Request-Timestamp` 需要传秒级 Unix 时间戳。

### 请求头示例

| 名称 | 示例值 | 说明 |
|------|--------|------|
| Authorization | `Bearer <your_access_secret>` | Bearer 鉴权头 |
| X-Request-Timestamp | `1742822400` | 秒级 Unix 时间戳 |
| Content-Type | `application/json` | JSON 接口固定值 |

### Curl 示例

```
curl -G 'https://developer.zhihu.com/api/v1/content/zhihu_search' \
  --data-urlencode 'Query=怎么理解rave文化' \
  -H 'Authorization: Bearer <your_access_secret>' \
  -H "X-Request-Timestamp: $(date +%s)" \
  -H 'Content-Type: application/json'
```

---

## 直答 API

### 接口说明

该接口提供知乎直答 3 个模型档位：快速回答、深度思考、智能思考。

当前支持 3 个请求字段：
- `model`
- `messages`
- `stream`

### 接口信息

| 说明 | 值 |
|------|-----|
| HTTP URL | `https://developer.zhihu.com/v1/chat/completions` |
| HTTP Method | `POST` |
| 请求类型 | `application/json` |
| 响应类型 | `application/json`（stream=false） / `text/event-stream`（stream=true） |

### 鉴权

Header：
- `Authorization: Bearer <your_access_secret>`
- `X-Request-Timestamp: <unix_seconds>`

说明：
- 当前统一使用 Access Secret 的 Bearer 鉴权语义。
- `X-Request-Timestamp` 为秒级 Unix 时间戳。

### 请求参数

#### Body

| 名称 | 类型 | 必填 | 说明 |
|------|------|------|------|
| model | String | 是 | 模型档位，支持 `zhida-fast-1p5`、`zhida-thinking-1p5`、`zhida-agent` |
| messages | Array[Message] | 是 | 对话消息列表 |
| stream | Bool | 否 | 是否流式返回，默认 `false` |

#### Message

| 名称 | 类型 | 必填 | 说明 |
|------|------|------|------|
| role | String | 是 | 消息角色 |
| content | String | 是 | 问题内容 |

### 响应说明

#### 非流式（stream=false）

```json
{
  "id": "chatcmpl-xxxx",
  "object": "chat.completion",
  "created": 1740470400,
  "model": "zhida-thinking-1p5",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "reasoning_content": "先给出分析过程...",
        "content": "..."
      },
      "finish_reason": "stop"
    }
  ]
}
```

#### 流式（stream=true）

```
data: {"id":"chatcmpl-xxxx","object":"chat.completion.chunk","created":1740470400,"model":"zhida-thinking-1p5","choices":[{"index":0,"delta":{"role":"assistant","reasoning_content":"先分析背景"},"finish_reason":null}]}

data: {"id":"chatcmpl-xxxx","object":"chat.completion.chunk","created":1740470400,"model":"zhida-thinking-1p5","choices":[{"index":0,"delta":{"content":"最终回答片段"},"finish_reason":null}]}

data: {"id":"chatcmpl-xxxx","object":"chat.completion.chunk","created":1740470400,"model":"zhida-thinking-1p5","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: [DONE]
```

说明：
- 服务端会发送心跳注释：`: keep-alive`

### 错误响应

```json
{
  "error": {
    "message": "xxx",
    "type": "invalid_request_error",
    "param": "model",
    "code": "model_not_found"
  }
}
```

流式中途错误（HTTP 200 已发出）返回：

```
data: {"id":"chatcmpl-xxxx","object":"chat.completion.chunk","created":1740470400,"model":"zhida-thinking-1p5","choices":[{"index":0,"delta":{},"finish_reason":"error"}],"error":{"message":"Internal server error","type":"server_error","code":"internal_error"}}

data: [DONE]
```

### 注意事项

- 当前仅保证 `model/messages/stream` 三个字段的能力语义。
- 其他请求字段当前不作为正式支持能力，不保证生效。
- `id` 在同一次流式响应中保持一致。
- `model` 为必填，缺失时返回 `missing_required_parameter`。
- 支持 role、content 上下文传参的模型：`zhida-fast-1p5`、`zhida-thinking-1p5`。
- 实际可用模型还会受租户授权配置影响。

---

## 知乎搜索 API

### 接口说明

该接口用于知乎站内内容搜索，返回与查询相关的问题、回答或文章结果。

### 接口信息

| 说明 | 值 |
|------|-----|
| HTTP URL | `https://developer.zhihu.com/api/v1/content/zhihu_search` |
| HTTP Method | `GET` |

### 请求参数

#### Header

- Authorization：`Bearer <your_access_secret>`
- X-Request-Timestamp：秒级 Unix 时间戳
- Content-Type：固定值 `application/json`

#### Query

| 名称 | 类型 | 必填 | 说明 |
|------|------|------|------|
| Query | String | 是 | 查询关键词 |
| Count | Int32 | 否 | 请求数量，默认 10，最大 10 |

说明：
- `Query` 不能为空。
- 当 `Count <= 0` 时，服务端默认回退为 `10`。
- 当 `Count > 10` 时，服务端会自动截断为 `10`。

### 响应参数

#### Data

| 参数名 | 类型 | 是否必返 | 描述 |
|--------|------|----------|------|
| HasMore | Bool | 是 | 当前实现固定返回 `false` |
| SearchHashId | String | 是 | 搜索请求标识 |
| Items | Array[Item] | 是 | 搜索结果列表 |
| EmptyReason | String | 否 | 无结果时的原因说明 |

#### Item

| 参数名 | 类型 | 是否必返 | 描述 |
|--------|------|----------|------|
| Title | String | 是 | 内容标题 |
| ContentType | String | 是 | 内容类型 |
| ContentID | String | 是 | 内容标识 |
| ContentText | String | 是 | 内容摘要 |
| Url | String | 是 | 内容链接（带溯源 utm 参数） |
| CommentCount | Int32 | 是 | 评论数 |
| VoteUpCount | Int32 | 是 | 赞同数 |
| AuthorName | String | 是 | 作者昵称 |
| AuthorAvatar | String | 是 | 作者头像 |
| AuthorBadge | String | 是 | 作者认证图标 |
| AuthorBadgeText | String | 是 | 作者认证文案 |
| EditTime | Int32 | 是 | 发布时间或更新时间戳 |
| CommentInfoList | Array[CommentInfo] | 否 | 精选评论 |
| AuthorityLevel | String | 是 | 权威等级 |
| RankingScore | Float32 | 是 | 排序分数 |

#### CommentInfo

| 参数名 | 类型 | 是否必返 | 描述 |
|--------|------|----------|------|
| Content | String | 是 | 评论内容 |

### 错误码

| 错误码 | 说明 |
|--------|------|
| 0 | 成功 |
| 10001 | 参数错误 |
| 20001 | 鉴权失败 |
| 30001 | 频率限制 |
| 90001 | 内部错误 |

### Curl 示例

```
curl -G 'https://developer.zhihu.com/api/v1/content/zhihu_search' \
  --data-urlencode 'Query=怎么理解rave文化' \
  -d 'Count=5' \
  -H 'Authorization: Bearer <your_access_secret>' \
  -H "X-Request-Timestamp: $(date +%s)"
```

---

## 全网搜索 API

### 接口说明

该接口用于全网内容搜索。

### 接口信息

| 说明 | 值 |
|------|-----|
| HTTP URL | `https://developer.zhihu.com/api/v1/content/global_search` |
| HTTP Method | `GET` |

### 请求参数

#### Header

- Authorization：`Bearer <your_access_secret>`
- X-Request-Timestamp：秒级 Unix 时间戳
- Content-Type：固定值 `application/json`

#### Query

| 名称 | 类型 | 必填 | 说明 |
|------|------|------|------|
| Query | String | 是 | 查询关键词 |
| Count | Int32 | 否 | 请求数量，默认 10，最大 20 |

### 响应参数

#### Data

| 参数名 | 类型 | 是否必返 | 描述 |
|--------|------|----------|------|
| HasMore | Bool | 是 | 是否有下一页数据 |
| Items | Array[Item] | 是 | 内容数据列表 |

#### Item

| 参数名 | 类型 | 是否必返 | 描述 |
|--------|------|----------|------|
| Title | String | 是 | 内容标题 |
| ContentType | String | 是 | 内容类型，如回答、文章 |
| ContentID | String | 是 | 内容 Token |
| ContentText | String | 是 | 内容摘要，高亮部分用 `<em>` 标签表示 |
| Url | String | 是 | 内容链接（带溯源 utm 参数） |
| CommentCount | Int32 | 是 | 评论数 |
| VoteUpCount | Int32 | 是 | 赞同数 |
| AuthorName | String | 是 | 作者昵称，匿名时展示为：知乎用户 |
| AuthorAvatar | String | 是 | 作者头像 |
| AuthorBadge | String | 是 | 认证标图片 Url |
| AuthorBadgeText | String | 是 | 认证文案 |
| EditTime | Int64 | 是 | 最后编辑时间戳，如 1745486539 |
| CommentInfoList | Array[CommentInfo] | 否 | 精选评论 |
| AuthorityLevel | String | 是 | 权威等级（1 低权威，2 中权威，3 高权威，4 超高权威） |

#### CommentInfo

| 参数名 | 类型 | 是否必选 | 描述 |
|--------|------|----------|------|
| Content | String | 是 | 评论内容 |

### Curl 示例

```
curl -G 'https://developer.zhihu.com/api/v1/content/global_search' \
  --data-urlencode 'Query=怎么理解rave文化' \
  -d 'Count=5' \
  -H 'Authorization: Bearer <your_access_secret>' \
  -H "X-Request-Timestamp: $(date +%s)"
```

---

## 知乎热榜 API

### 接口说明

获取当前知乎热榜内容，返回结构化的标题、链接、缩略图与摘要列表。

### 接口信息

| 说明 | 值 |
|------|-----|
| HTTP URL | `https://developer.zhihu.com/api/v1/content/hot_list` |
| HTTP Method | `GET` |

### 请求参数

#### Header

- Authorization：`Bearer <your_access_secret>`
- X-Request-Timestamp：秒级 Unix 时间戳
- Content-Type：固定值 `application/json`

#### Query

| 名称 | 类型 | 必填 | 说明 |
|------|------|------|------|
| Limit | Int32 | 否 | 返回数量，默认 30，最大 30 |

说明：
- 当 `Limit <= 0` 或 `Limit > 30` 时，服务端会自动回退为 `30`。

### 响应参数

#### Data

| 参数名 | 类型 | 是否必返 | 描述 |
|--------|------|----------|------|
| Total | Int64 | 是 | 实际返回的热榜条数 |
| Items | Array[Item] | 是 | 热榜内容列表 |

#### Item

| 参数名 | 类型 | 是否必返 | 描述 |
|--------|------|----------|------|
| Title | String | 是 | 热榜标题 |
| Url | String | 是 | 热榜对应的知乎链接 |
| ThumbnailUrl | String | 是 | 缩略图 URL，无封面图时为空字符串 |
| Summary | String | 是 | 内容摘要，无摘要时为空字符串 |

说明：
- 当前仅返回问题和文章两类热榜内容。
- 若下游内容信息缺失，对应条目会被过滤，不会出现在结果中。
- `ThumbnailUrl` 和 `Summary` 始终返回，无数据时值为 `""`。

### 错误码

| 错误码 | 说明 |
|--------|------|
| 0 | 成功 |
| 20001 | 鉴权失败 |
| 30001 | 频率限制 |
| 90001 | 内部错误 |

### Curl 示例

```
curl 'https://developer.zhihu.com/api/v1/content/hot_list?Limit=10' \
  -H 'Authorization: Bearer <your_access_secret>' \
  -H "X-Request-Timestamp: $(date +%s)"
```
curl -G 'https://developer.zhihu.com/api/v1/content/global_search' \
  --data-urlencode 'Query=怎么理解rave文化' \
  -d 'Count=5' \
  -H 'Authorization: Bearer <your_access_secret>' \
  -H "X-Request-Timestamp: $(date +%s)"
```
