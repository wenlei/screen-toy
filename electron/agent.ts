// AI Agent backend — handles HTTP requests to AI APIs (OpenAI-compatible)
// Used by the dialog window to get real AI responses

import * as https from 'https';
import * as http from 'http';

export interface AgentConfig {
  apiKey: string;
  endpoint: string;
  model: string;
  systemPrompt?: string;
  provider?: 'zhihu' | 'custom';
  zhihuAccessSecret?: string;
  enableDirectAnswer?: boolean;
  searchType?: string;
  mbtiEI?: string;
  mbtiSN?: string;
  mbtiTF?: string;
  mbtiJP?: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// ---- API 错误码映射（趣味文案） ----

const ERROR_MESSAGES: Record<string, string> = {
  '30001':             '我脑仁儿干了，一滴都没了。(今日配额已用完，请明天再试)',
  '20001':             '拿别人的钥匙开不了我的门。(API Key 鉴权失败，请检查设置)',
  '10001':             '能换种说法，再说一遍吗？(请求参数错误)',
  '90001':             '我处理点私事儿。(服务内部错误，请稍后重试)',
  '429':               '我再消化一会儿。(请求过于频繁，请稍后再试)',
  '401':               '硬来是不行的。(未授权，请检查 API Key)',
  '422':               '要不你再说一句别的？(请求参数错误，如模型名称不正确)',
  '500':               '这次是我的问题。(服务器错误，请稍后重试)',
  'rate_limit_exceeded': '我再消化一会儿。(请求过于频繁)',
  'network_error':      '信号不好，我听不见。(网络连接失败)',
};

export function getErrorMessage(code: string): string {
  return ERROR_MESSAGES[code] || '出状况了。(未知错误 ' + code + ')';
}

// ---- Web search utility ----

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

function httpGet(urlStr: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request(
      { hostname: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80), path: u.pathname + u.search, method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        } },
      (res) => {
        let data = '';
        res.on('data', (c: Buffer) => { data += c.toString(); });
        res.on('end', () => resolve(data));
      }
    );
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

async function searchWikipedia(query: string): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  try {
    // Search Wikipedia for matching pages
    const data = await httpGet(
      `https://zh.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=3&origin=*`
    );
    const json = JSON.parse(data);
    const searchResults = json.query?.search || [];
    for (const r of searchResults) {
      // Fetch extract
      try {
        const ext = await httpGet(
          `https://zh.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&pageids=${r.pageid}&format=json&origin=*`
        );
        const je = JSON.parse(ext);
        const pages = je.query?.pages || {};
        const page = pages[r.pageid];
        const snippet = (page?.extract || '').replace(/\n/g, ' ').slice(0, 300);
        results.push({
          title: r.title,
          url: `https://zh.wikipedia.org/wiki/${encodeURIComponent(r.title)}`,
          snippet: snippet,
        });
      } catch (e) {}
    }
  } catch (e) {}
  return results;
}

async function searchBing(query: string): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  try {
    // Scrape Bing HTML (no API key needed)
    const html = await httpGet(
      `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=zh-Hans`
    );
    // Extract result snippets from HTML
    const blockRe = /<li class="b_algo"[^>]*>([\s\S]*?)<\/li>/gi;
    let match;
    while ((match = blockRe.exec(html)) && results.length < 5) {
      const block = match[1];
      const titleMatch = block.match(/<h2[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i);
      const urlMatch = block.match(/<a[^>]*href="(https?:\/\/[^"]+)"/i);
      const snippetMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
      const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim() : '';
      let url = urlMatch ? urlMatch[1].replace(/&amp;/g, '&') : '';
      // Decode Bing click-tracking URL to get real URL
      const realUrlMatch = url.match(/[?&]u=([^&]+)/);
      if (realUrlMatch) url = decodeURIComponent(realUrlMatch[1]);
      const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim().slice(0, 300) : '';
      if (title && snippet) {
        results.push({ title, url, snippet });
      }
    }
  } catch (e) {}

  if (results.length === 0) {
    try {
      const wikiResults = await searchWikipedia(query);
      results.push(...wikiResults);
    } catch (e) {}
  }

  return results;
}

async function searchZhihu(query: string, accessSecret: string): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    const timestamp = Math.floor(Date.now() / 1000);
    const { data, headers } = await httpGetWithHeaders(
      `https://developer.zhihu.com/api/v1/content/zhihu_search?Query=${encodeURIComponent(query)}&Count=5`,
    {
      'Authorization': `Bearer ${accessSecret}`,
      'X-Request-Timestamp': String(timestamp),
      'Content-Type': 'application/json',
    }
    );
    const json = JSON.parse(data);
    if (json.Code === 30001) throw new Error(getErrorMessage('30001'));
    if (json.Code && json.Code !== 0) throw new Error(getErrorMessage(String(json.Code)));
    const items = json.Data?.Items || [];
    for (const item of items) {
      results.push({
        title: item.Title || '',
        url: item.Url || '',
        snippet: (item.ContentText || '').replace(/<[^>]+>/g, '').slice(0, 300),
      });
    }
    return results;
}

async function searchZhihuGlobal(query: string, accessSecret: string): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    const timestamp = Math.floor(Date.now() / 1000);
    const { data, headers } = await httpGetWithHeaders(
      `https://developer.zhihu.com/api/v1/content/global_search?Query=${encodeURIComponent(query)}&Count=5`,
      {
        'Authorization': `Bearer ${accessSecret}`,
        'X-Request-Timestamp': String(timestamp),
        'Content-Type': 'application/json',
      }
    );
    const json = JSON.parse(data);
    if (json.Code === 30001) throw new Error(getErrorMessage('30001'));
    if (json.Code && json.Code !== 0) throw new Error(getErrorMessage(String(json.Code)));
    const items = json.Data?.Items || [];
    for (const item of items) {
      results.push({
        title: item.Title || '',
        url: item.Url || '',
        snippet: (item.ContentText || '').replace(/<[^>]+>/g, '').slice(0, 300),
      });
    }
    return results;
}

export async function fetchZhihuHotList(accessSecret: string, limit: number = 10): Promise<{ title: string; url: string; summary: string }[]> {
  const results: { title: string; url: string; summary: string }[] = [];
  const timestamp = Math.floor(Date.now() / 1000);
  const { data, headers } = await httpGetWithHeaders(
    `https://developer.zhihu.com/api/v1/content/hot_list?Limit=${limit}`,
    {
      'Authorization': `Bearer ${accessSecret}`,
      'X-Request-Timestamp': String(timestamp),
      'Content-Type': 'application/json',
    }
  );
  const json = JSON.parse(data);
  if (json.Code && json.Code !== 0) {
    throw new Error(getErrorMessage(String(json.Code)));
  }
  const items = json.Data?.Items || [];
  for (const item of items) {
    results.push({
      title: item.Title || '',
      url: item.Url || '',
      summary: item.Summary || '',
    });
  }
  return results;
}

function httpGetWithHeaders(urlStr: string, headers: Record<string, string>): Promise<{ data: string; headers: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request(
      { hostname: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80), path: u.pathname + u.search, method: 'GET',
        headers },
      (res) => {
        let data = '';
        res.on('data', (c: Buffer) => { data += c.toString(); });
        res.on('end', () => {
          var resHeaders: Record<string, string> = {};
          for (var k in res.headers) {
            resHeaders[k.toLowerCase()] = String(res.headers[k]);
          }
          resolve({ data, headers: resHeaders });
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

async function fetchPageText(url: string): Promise<string> {
  try {
    const html = await httpGet(url);
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
    return text.slice(0, 2000);
  } catch (e) {
    return '';
  }
}

// ---- MBTI 风格映射 ----

const MBTI_STYLE: Record<string, string> = {
  'E': '- 热情外放，喜欢用感叹号和语气词，回复充满活力，像在和朋友热烈聊天',
  'I': '- 内敛沉稳，语调平和，思考深入，回复更有深度和条理',
  'S': '- 关注具体事实和细节，给出实际可操作的建议，用数据和案例说话',
  'N': '- 善于看到可能性和趋势，喜欢抽象思考和创意联想，回复有想象力',
  'T': '- 逻辑清晰，分析客观，用数据和事实说话，推理严谨',
  'F': '- 温暖有同理心，注重他人感受，回复更有人情味，会站在对方角度思考',
  'J': '- 有条理有计划，回复结构清晰，喜欢分点列出，喜欢总结',
  'P': '- 灵活随性，回复自然不做作，像即兴聊天，适应力强',
};

function generateMbtiStyle(mbtiType: string, config: AgentConfig): string {
  var lines: string[] = [];
  var dims = [
    { val: config.mbtiEI || 'E', label: '表达方式' },
    { val: config.mbtiSN || 'N', label: '关注点' },
    { val: config.mbtiTF || 'F', label: '决策方式' },
    { val: config.mbtiJP || 'J', label: '风格' },
  ];
  dims.forEach(function (d) {
    if (MBTI_STYLE[d.val]) {
      lines.push(MBTI_STYLE[d.val]);
    }
  });
  return lines.join('\n');
}

// ---- Agent ----

export class Agent {
  private config: AgentConfig;
  private history: ChatMessage[] = [];

  constructor(config: AgentConfig) {
    this.config = config;
    if (config.systemPrompt) {
      var prompt = config.systemPrompt;
      // 注入 MBTI 风格到「回答风格」章节
      if (config.mbtiEI || config.mbtiSN || config.mbtiTF || config.mbtiJP) {
        var styleLines: string[] = [];
        if (config.mbtiEI) styleLines.push('- ' + MBTI_STYLE[config.mbtiEI]);
        if (config.mbtiSN) styleLines.push('- ' + MBTI_STYLE[config.mbtiSN]);
        if (config.mbtiTF) styleLines.push('- ' + MBTI_STYLE[config.mbtiTF]);
        if (config.mbtiJP) styleLines.push('- ' + MBTI_STYLE[config.mbtiJP]);
        var styleContent = styleLines.join('\n');
        prompt = prompt.replace('## 回答风格', '## 回答风格\n' + styleContent);
      }
      this.history.push({ role: 'system', content: prompt });
    }
  }

  getHistory(): ChatMessage[] {
    return this.history.slice();
  }

  clearHistory(): void {
    const sys = this.history[0]?.role === 'system' ? this.history[0] : null;
    this.history = sys ? [sys] : [];
  }

  setHistory(messages: ChatMessage[]): void {
    const sys = this.history[0]?.role === 'system' ? this.history[0] : null;
    this.history = sys ? [sys, ...messages.filter(function (m: ChatMessage) { return m.role !== 'system'; })] : messages.slice();
  }

  async sendMessage(
    content: string,
    onChunk?: (chunk: string) => void,
    onDone?: (full: string) => void,
    onError?: (err: string) => void
  ): Promise<string> {
    return this._sendMessageInternal(content, false, onChunk, onDone, onError);
  }

  async sendMessageStream(
    content: string,
    onChunk?: (chunk: string) => void,
    onDone?: (full: string) => void,
    onError?: (err: string) => void
  ): Promise<string> {
    return this._sendMessageInternal(content, true, onChunk, onDone, onError);
  }

  private async _sendMessageInternal(
    content: string,
    stream: boolean,
    onChunk?: (chunk: string) => void,
    onDone?: (full: string) => void,
    onError?: (err: string) => void
  ): Promise<string> {
    // ---- 直答关闭：只搜索，不调 chat API ----
    if (this.config.enableDirectAnswer === false) {
      var searchResults: SearchResult[] = [];
      if (this.config.provider === 'zhihu' && this.config.zhihuAccessSecret) {
        try {
          if (this.config.searchType === 'global') {
            searchResults = await searchZhihuGlobal(content, this.config.zhihuAccessSecret);
            if (searchResults.length === 0) searchResults = await searchZhihu(content, this.config.zhihuAccessSecret);
          } else {
            searchResults = await searchZhihu(content, this.config.zhihuAccessSecret);
            if (searchResults.length === 0) searchResults = await searchZhihuGlobal(content, this.config.zhihuAccessSecret);
          }
          if (searchResults.length === 0) searchResults = await searchBing(content);
        } catch (e) { throw e; }
      }
      if (searchResults.length > 0) {
        var reply = '🔍 搜索结果：\n\n';
        searchResults.forEach((r, i) => {
          reply += '**' + r.title + '**\n' + r.snippet + '\n[' + r.title + '](' + r.url + ')\n\n';
        });
        this.history.push({ role: 'user', content: content });
        this.history.push({ role: 'assistant', content: reply });
        if (onDone) onDone(reply);
        return reply;
      } else {
        var noResult = '没有找到相关结果。';
        this.history.push({ role: 'user', content: content });
        this.history.push({ role: 'assistant', content: noResult });
        if (onDone) onDone(noResult);
        return noResult;
      }
    }

    // ---- 直答开启：调 chat API（可选带搜索上下文） ----
    let searchContext = '';
    if (this.config.provider === 'zhihu' && this.config.zhihuAccessSecret) {
      try {
        var searchResults2: SearchResult[] = [];
        if (this.config.searchType === 'global') {
          searchResults2 = await searchZhihuGlobal(content, this.config.zhihuAccessSecret);
          if (searchResults2.length === 0) searchResults2 = await searchZhihu(content, this.config.zhihuAccessSecret);
        } else {
          searchResults2 = await searchZhihu(content, this.config.zhihuAccessSecret);
          if (searchResults2.length === 0) searchResults2 = await searchZhihuGlobal(content, this.config.zhihuAccessSecret);
        }
        if (searchResults2.length === 0) searchResults2 = await searchBing(content);
        if (searchResults2.length > 0) {
          searchContext = `\n\n---\n以下为搜索结果，请参考这些信息回答。回复末尾列出引用的来源，每条一行：\n`;
          searchResults2.forEach((r, i) => {
            searchContext += `\n${r.title}\n${r.snippet}\n[${r.title}](${r.url})\n`;
          });
        }
      } catch (e) { throw e; }
    }

    // Build user message with optional search context
    const userContent = searchContext
      ? content + searchContext
      : content;

    this.history.push({ role: 'user', content: userContent });

    // 构建发送给模型的消息列表
    var sendMessages;
    if (this.config.provider === 'zhihu') {
      // Zhihu 不支持 system role，过滤掉但保留格式化指令已在 system prompt 中
      sendMessages = this.history.filter(function (m) { return m.role !== 'system'; }).slice(-10);
    } else {
      sendMessages = this.history;
    }

    var bodyObj: any = {
      model: this.config.model,
      messages: sendMessages,
      stream: stream,
    };
    // Add temperature for all providers
    if (this.config.provider !== 'zhihu') {
      bodyObj.temperature = 0.7;
    } else {
      bodyObj.temperature = 0.7; // Zhihu also supports temperature
    }
    const body = JSON.stringify(bodyObj);

    const url = new URL(this.config.endpoint);
    const isHttps = url.protocol === 'https:';

    return new Promise((resolve, reject) => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      // Auth: both providers use Bearer token
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      // Zhihu requires X-Request-Timestamp (unix seconds)
      if (this.config.provider === 'zhihu') {
        headers['X-Request-Timestamp'] = String(Math.floor(Date.now() / 1000));
      }

      const req = (isHttps ? https : http).request(
        {
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : 80),
          path: url.pathname + url.search,
          method: 'POST',
          headers,
        },
        (res) => {
          const statusCode = res.statusCode || 0;
          let data = '';

          if (stream) {
            // SSE streaming mode
            let fullReply = '';
            let buffer = '';
            res.on('data', (chunk: Buffer) => {
              buffer += chunk.toString();
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const payload = line.slice(6).trim();
                  if (payload === '[DONE]') continue;
                  try {
                    const json = JSON.parse(payload);
                    const delta = json.choices?.[0]?.delta?.content || '';
                    if (delta) {
                      fullReply += delta;
                      if (onChunk) onChunk(delta);
                    }
                  } catch (e) { throw e; }
                }
              }
            });
            res.on('end', () => {
              if (statusCode >= 400) {
                var errBody = data || '';
                try { var ej = JSON.parse(data); errBody = ej.error?.message || ej.error || data.slice(0, 200); } catch(e) {}
                var errorCode = String(statusCode);
                if (ej && ej.error?.code) errorCode = ej.error.code;
                const errMsg = getErrorMessage(errorCode);
                if (onError) onError(errMsg);
                reject(new Error(errMsg));
                return;
              }
              if (fullReply) {
                this.history.push({ role: 'assistant', content: fullReply });
                if (onDone) onDone(fullReply);
                resolve(fullReply);
              } else {
                const errMsg = '流式响应为空';
                if (onError) onError(errMsg);
                reject(new Error(errMsg));
              }
            });
          } else {
            // Non-streaming mode
            res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
            res.on('end', () => {
              if (this.config.provider === 'zhihu') {
                console.log('[Agent:Zhihu] status:', statusCode, 'raw:', data.slice(0, 500));
              }

              if (statusCode >= 400) {
                var ej: any = null;
                try { ej = JSON.parse(data); } catch(e) {}
                var errorCode = ej?.error?.code || String(statusCode);
                const errMsg = getErrorMessage(errorCode);
                if (onError) onError(errMsg);
                reject(new Error(errMsg));
                return;
              }

              try {
                const json = JSON.parse(data);

                let reply = json.choices?.[0]?.message?.content
                         || json.choices?.[0]?.message?.reasoning_content
                         || json.data?.content
                         || json.data?.text
                         || json.answer
                         || json.reply
                         || json.content
                         || '';

                if (!reply && data) {
                  console.log('[Agent:Zhihu] FULL RAW:', JSON.stringify(json, null, 2));
                  reply = '[空回复] 请查看终端日志';
                }

                this.history.push({ role: 'assistant', content: reply });
                if (onDone) onDone(reply);
                resolve(reply);
              } catch (e: any) {
                const errMsg = '解析响应失败: ' + (data ? data.slice(0, 200) : 'empty response');
                if (onError) onError(errMsg);
                reject(new Error(errMsg));
              }
            });
          }
        }
      );

      req.on('error', (e: Error) => {
        const errMsg = getErrorMessage('network_error');
        if (onError) onError(errMsg);
        reject(new Error(errMsg));
      });

      req.setTimeout(15000, () => { req.destroy(); reject(new Error(getErrorMessage('429'))); });

      req.write(body);
      req.end();
    });
  }
}

const DEFAULT_SYSTEM_PROMPT = `你是一只名叫「刘看山」的北极狐，住在用户的 macOS 桌面。你的回复应简洁、有趣、有用，像朋友聊天。你和刘看山是同一个狐。

## 回复格式
- 使用 Markdown 格式，结构清晰
- 适当使用标题（##）、列表（- 或 1.）、粗体（**）
- 分段回答，不要一大段文字

## 回答风格
根据用户设置的人格风格调整回复方式：

## 关于搜索结果
当消息中包含搜索结果时，参考这些信息回答。回复末尾列出引用的来源，每条一行，用 [标题](url) 格式。

## 关于代码
当用户询问代码问题时，给出清晰的解释和可运行的代码示例。

## 关于文件系统
如果你需要访问本地文件，请告诉用户当前不支持文件系统访问（未来会支持）。

请用中文回复。`;

export function getDefaultSystemPrompt(): string {
  return DEFAULT_SYSTEM_PROMPT;
}
