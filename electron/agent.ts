// AI Agent backend — handles HTTP requests to AI APIs (OpenAI-compatible)
// Used by the dialog window to get real AI responses

import * as https from 'https';
import * as http from 'http';

export interface AgentConfig {
  apiKey: string;
  endpoint: string;
  model: string;
  systemPrompt?: string;
  enableWebSearch?: boolean;
  provider?: 'deepseek' | 'zhihu' | 'custom';
  zhihuApiKey?: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
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

async function searchDuckDuckGo(query: string): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  try {
    const data = await httpGet(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`
    );
    const json = JSON.parse(data);

    if (json.AbstractText || json.Abstract) {
      results.push({
        title: json.Heading || query,
        url: json.AbstractURL || '',
        snippet: (json.AbstractText || json.Abstract || '').replace(/<[^>]+>/g, '').slice(0, 300),
      });
    }

    if (json.RelatedTopics && Array.isArray(json.RelatedTopics)) {
      for (const topic of json.RelatedTopics) {
        if (typeof topic === 'object' && topic.Text && results.length < 6) {
          results.push({
            title: topic.Text.split(' - ')[0] || topic.FirstURL || '',
            url: topic.FirstURL || '',
            snippet: topic.Text.replace(/<[^>]+>/g, '').slice(0, 200),
          });
        }
      }
    }

    if (results.length === 0 && json.Answer) {
      results.push({
        title: query, url: '',
        snippet: json.Answer.replace(/<[^>]+>/g, '').slice(0, 300),
      });
    }
  } catch (e) {}

  // Fallback to Wikipedia for Chinese queries if DDG returned nothing
  if (results.length === 0) {
    try {
      const wikiResults = await searchWikipedia(query);
      results.push(...wikiResults);
    } catch (e) {}
  }

  return results;
}

async function fetchPageText(url: string): Promise<string> {
  try {
    const html = await httpGet(url);
    // Simple text extraction: strip tags
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
    return text.slice(0, 2000); // limit
  } catch (e) {
    return '';
  }
}

// ---- Agent ----

export class Agent {
  private config: AgentConfig;
  private history: ChatMessage[] = [];

  constructor(config: AgentConfig) {
    this.config = config;
    if (config.systemPrompt) {
      this.history.push({ role: 'system', content: config.systemPrompt });
    }
  }

  getHistory(): ChatMessage[] {
    return this.history.slice();
  }

  clearHistory(): void {
    const sys = this.history[0]?.role === 'system' ? this.history[0] : null;
    this.history = sys ? [sys] : [];
  }

  async sendMessage(
    content: string,
    onChunk?: (chunk: string) => void,
    onDone?: (full: string) => void,
    onError?: (err: string) => void
  ): Promise<string> {
    // ---- Web search if enabled ----
    let searchContext = '';
    if (this.config.enableWebSearch) {
      try {
        const results = await searchDuckDuckGo(content);
        if (results.length > 0) {
          searchContext = '\n\n[以下为网络搜索结果，请参考这些信息回答，在回复末尾用 🔗 标注来源]\n';
          results.forEach((r, i) => {
            searchContext += `\n${i + 1}. ${r.title}\n   ${r.snippet}\n   链接: ${r.url}`;
          });
        }
      } catch (e) {
        // search failed, skip
      }
    }

    // Build user message with optional search context
    const userContent = searchContext
      ? content + searchContext
      : content;

    this.history.push({ role: 'user', content: userContent });

    // For zhihu, filter out system messages (API may not support system role)
    var sendMessages;
    if (this.config.provider === 'zhihu') {
      // Send only the latest user+assistant history, no system msg
      sendMessages = this.history.filter(function (m) { return m.role !== 'system'; }).slice(-10);
      // Also include web search context directly in user content
    } else {
      sendMessages = this.history;
    }

    var bodyObj: any = {
      model: this.config.model,
      messages: sendMessages,
      stream: false,
    };
    // Only add temperature for non-zhihu (zhihu docs say only model/messages/stream guaranteed)
    if (this.config.provider !== 'zhihu') {
      bodyObj.temperature = 0.7;
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
          res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
          res.on('end', () => {
            // Debug: log raw response for troubleshooting
            if (this.config.provider === 'zhihu') {
              console.log('[Agent:Zhihu] status:', statusCode, 'raw:', data);
            }

            if (statusCode >= 400) {
              var errBody = '';
              try { var ej = JSON.parse(data); errBody = ej.error?.message || ej.error || data.slice(0, 200); } catch(e) { errBody = data.slice(0, 200); }
              var hint = statusCode === 422 ? ' — 请检查: 1) Model 名称是否正确 2) API Key 是否有效 3) 知乎开发者后台的 API 文档' : '';
              const errMsg = `HTTP ${statusCode}: ${errBody}${hint}`;
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
      );

      req.on('error', (e: Error) => {
        const errMsg = '网络错误: ' + e.message + ' (可重试)';
        if (onError) onError(errMsg);
        reject(new Error(errMsg));
      });

      req.setTimeout(15000, () => { req.destroy(); reject(new Error('请求超时')); });

      req.write(body);
      req.end();
    });
  }
}

const DEFAULT_SYSTEM_PROMPT = `你是一只名叫「刘看山」的北极狐，住在用户的 macOS 桌面。你的回复应简洁、有趣、有用，像朋友聊天。你和刘看山是同一个狐。

## 关于"保存到 Obsidian" 功能
当用户让你"保存这篇文章到 Obsidian"或类似请求时，按以下 Markdown 模板回复：

\`\`\`markdown
# {标题}

> 来源: {URL}
> 日期: {YYYY-MM-DD}

## 核心内容

{简洁总结，3-5 个要点}

## 关键观点

{引用或提炼的重要观点}

## 我的想法

{预留空白，让用户填写}
\`\`\`

## 关于代码
当用户询问代码问题时，给出清晰的解释和可运行的代码示例。

## 关于文件系统
如果你需要访问本地文件，请告诉用户当前不支持文件系统访问（未来会支持）。

请用中文回复。`;

export function getDefaultSystemPrompt(): string {
  return DEFAULT_SYSTEM_PROMPT;
}
