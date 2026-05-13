// AI Agent backend — handles HTTP requests to AI APIs (OpenAI-compatible)
// Used by the dialog window to get real AI responses

import * as https from 'https';
import * as http from 'http';

/**
 * AI Agent 配置接口
 * 用于定义与后端大模型及搜索服务交互所需的各项参数
 */
export interface AgentConfig {
  apiKey: string; // 模型服务的 API Key
  endpoint: string; // 模型服务的 API 接口地址 (例如: https://api.openai.com/v1/chat/completions)
  model: string; // 使用的模型名称 (例如: gpt-3.5-turbo, gpt-4)
  systemPrompt?: string; // 系统提示词，用于设定 AI 的初始人设和行为规范
  provider?: 'zhihu' | 'custom'; // 服务提供商，支持知乎或自定义兼容 OpenAI 的服务
  zhihuAccessSecret?: string; // 知乎开发者平台的 Access Secret (用于调用知乎搜索等 API)
  enableDirectAnswer?: boolean; // 是否启用直接回答。如果为 false，则只进行搜索而不调用大模型
  searchType?: string; // 搜索类型设置，例如全局搜索 (global)
  // 以下为 MBTI 人格设定参数
  mbtiEI?: string; // 外向 (E) / 内向 (I)
  mbtiSN?: string; // 感觉 (S) / 直觉 (N)
  mbtiTF?: string; // 思考 (T) / 情感 (F)
  mbtiJP?: string; // 判断 (J) / 知觉 (P)
}

/**
 * 聊天消息体接口
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'; // 消息角色
  content: string; // 消息内容
}

// ---- API 错误码映射（趣味文案） ----

const ERROR_MESSAGES: Record<string, string> = {
  '30001': '我脑仁儿干了，一滴都没了。(今日配额已用完，请明天再试)',
  '20001': '拿别人的钥匙开不了我的门。(API Key 鉴权失败，请检查设置)',
  '10001': '能换种说法，再说一遍吗？(请求参数错误)',
  '90001': '我处理点私事儿。(服务内部错误，请稍后重试)',
  '429': '我再消化一会儿。(请求过于频繁，请稍后再试)',
  '401': '硬来是不行的。(未授权，请检查 API Key)',
  '422': '要不你再说一句别的？(请求参数错误，如模型名称不正确)',
  '500': '这次是我的问题。(服务器错误，请稍后重试)',
  'rate_limit_exceeded': '我再消化一会儿。(请求过于频繁)',
  'network_error': '信号不好，我听不见。(网络连接失败)',
};

/**
 * 根据错误码获取友好的中文错误提示文案
 * @param code 错误码字符串
 */
export function getErrorMessage(code: string): string {
  var raw = ERROR_MESSAGES[code] || '出状况了。';
  // 提取趣味文案和括号内的技术说明，拆分为两行
  var match = raw.match(/^(.+?)\((.+?)\)$/);
  if (match) {
    var funMsg = match[1].trim();
    var explain = match[2].trim();
    return '出错了：' + explain + '，错误码是(' + code + ')。\n我翻译一下，这段话的意思是，' + funMsg + '。';
  }
  return '出错了，错误码是(' + code + ')。\n' + raw;
}

// ---- Web search utility ----

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

/**
 * 基础的 HTTP GET 请求工具函数
 * @param urlStr 请求的 URL 字符串
 * @returns 返回响应的文本内容
 */
function httpGet(urlStr: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request(
      {
        hostname: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80), path: u.pathname + u.search, method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        }
      },
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

/**
 * 搜索维基百科中文页面
 * @param query 搜索关键词
 * @returns 包含标题、URL 和摘要的搜索结果数组
 */
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
      } catch (e) { }
    }
  } catch (e) { }
  return results;
}

/**
 * 搜索 Bing 搜索引擎 (通过解析 HTML 页面，无需 API Key)
 * @param query 搜索关键词
 * @returns 包含标题、URL 和摘要的搜索结果数组
 */
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
  } catch (e) { }

  if (results.length === 0) {
    try {
      const wikiResults = await searchWikipedia(query);
      results.push(...wikiResults);
    } catch (e) { }
  }

  return results;
}

/**
 * 调用知乎内容搜索 API
 * @param query 搜索关键词
 * @param accessSecret 知乎开发者 Access Secret
 */
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

/**
 * 调用知乎全局搜索 API
 * @param query 搜索关键词
 * @param accessSecret 知乎开发者 Access Secret
 */
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

/**
 * 获取知乎热榜数据
 * @param accessSecret 知乎开发者 Access Secret
 * @param limit 获取条数，默认为 10
 */
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

/**
 * 带自定义请求头的 HTTP GET 请求工具函数
 * @param urlStr 请求的 URL 字符串
 * @param headers 自定义请求头对象
 * @returns 返回响应的文本内容和响应头
 */
function httpGetWithHeaders(urlStr: string, headers: Record<string, string>): Promise<{ data: string; headers: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request(
      {
        hostname: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80), path: u.pathname + u.search, method: 'GET',
        headers
      },
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

/**
 * 获取指定 URL 网页的纯文本内容 (去除 HTML 标签、脚本和样式)
 * @param url 目标 URL
 */
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

/**
 * 根据用户的 MBTI 类型生成对应的回答风格提示词 (已弃用 mbtiType 参数，直接从 config 获取)
 * @param mbtiType 完整的 MBTI 字符串
 * @param config Agent 配置文件
 */
/**
 * 构建风格前缀模板。当模型/风格更新时，Agent 重建时重新调用。
 */
function buildStylePrefix(config: AgentConfig): string {
  if (!config.mbtiEI && !config.mbtiSN && !config.mbtiTF && !config.mbtiJP) return '';
  var lines: string[] = [];
  if (config.mbtiEI) lines.push(MBTI_STYLE[config.mbtiEI]);
  if (config.mbtiSN) lines.push(MBTI_STYLE[config.mbtiSN]);
  if (config.mbtiTF) lines.push(MBTI_STYLE[config.mbtiTF]);
  if (config.mbtiJP) lines.push(MBTI_STYLE[config.mbtiJP]);
  return '回复风格要求：\n' + lines.join('\n') + '\n\n';
}

// ---- Agent ----

/**
 * Agent 核心类
 * 负责管理对话历史记录、发起 API 请求 (支持流式/非流式)、处理搜索上下文以及与不同的 AI 提供商对接
 */
export class Agent {
  private config: AgentConfig; // Agent 配置信息
  private history: ChatMessage[] = []; // 当前对话的历史记录
  private stylePrefix: string = ''; // MBTI 风格前缀（用于 Zhihu user 消息注入）
  public searchResults: SearchResult[] = []; // 搜索结果数据（给 dialog 做模板渲染）

  /**
   * 构造函数，初始化配置并注入系统提示词和 MBTI 风格
   * @param config Agent 配置信息
   */
  constructor(config: AgentConfig) {
    this.config = config;
    this.stylePrefix = buildStylePrefix(config);
    // 仍保留 system prompt 作为内部历史记录（不发送给 Zhihu）
    if (config.systemPrompt) {
      this.history.push({ role: 'system', content: config.systemPrompt });
    }
  }

  /**
   * 模板函数：拼接风格前缀 + 用户输入。
   * 每次发送消息时调用，当 Agent 重建（风格/模型更新）时自动使用新模板。
   */
  buildUserMessage(userInput: string): string {
    if (this.config.provider !== 'zhihu') return userInput;
    return (this.stylePrefix || '') + userInput;
  }

  /**
   * 获取当前对话历史记录的副本
   */
  getHistory(): ChatMessage[] {
    return this.history.slice();
  }

  /**
   * 清空对话历史，但保留第一条系统提示词 (如果存在)
   */
  clearHistory(): void {
    const sys = this.history[0]?.role === 'system' ? this.history[0] : null;
    this.history = sys ? [sys] : [];
  }

  /**
   * 向对话历史中追加一条消息（用于外部同步，如热榜）
   */
  pushMessage(msg: ChatMessage): void {
    this.history.push(msg);
  }

  /**
   * 覆盖设置新的对话历史记录，会自动保留首条系统提示词并过滤传入列表中的 system 角色消息
   * @param messages 新的对话记录
   */
  setHistory(messages: ChatMessage[]): void {
    const sys = this.history[0]?.role === 'system' ? this.history[0] : null;
    this.history = sys ? [sys, ...messages.filter(function (m: ChatMessage) { return m.role !== 'system'; })] : messages.slice();
  }

  /**
   * 发送非流式聊天消息
   * @param content 用户输入的消息内容
   * @param onChunk 流式数据块回调 (非流式请求中不触发)
   * @param onDone 请求完成回调，返回完整的响应文本
   * @param onError 发生错误时的回调
   */
  async sendMessage(
    content: string,
    onChunk?: (chunk: string) => void,
    onDone?: (full: string) => void,
    onError?: (err: string) => void
  ): Promise<string> {
    return this._sendMessageInternal(content, false, onChunk, onDone, onError);
  }

  /**
   * 发送流式聊天消息 (SSE 模式)
   * @param content 用户输入的消息内容
   * @param onChunk 每次收到流式数据块时的回调
   * @param onDone 完整响应接收完毕时的回调
   * @param onError 发生错误时的回调
   */
  async sendMessageStream(
    content: string,
    onChunk?: (chunk: string) => void,
    onDone?: (full: string) => void,
    onError?: (err: string) => void
  ): Promise<string> {
    return this._sendMessageInternal(content, true, onChunk, onDone, onError);
  }

  /**
   * 内部核心发送方法，处理直答开关、搜索逻辑、知乎/自定义 API 请求构建以及响应解析
   */
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
        var html = '<div class="search-results" style="margin-bottom:8px;">🔍 <strong>搜索结果</strong></div>';
        searchResults.forEach(function (r: SearchResult) {
          html += '<div class="hotlist-item">';
          if (r.snippet) html += '<span class="hotlist-toggle material-symbols-outlined">expand_more</span>';
          html += '<a href="' + r.url + '" target="_blank" rel="noopener">' + r.title + '</a>';
          if (r.snippet) html += '<div class="hotlist-summary">' + r.snippet + '</div>';
          html += '</div>';
        });
        this.history.push({ role: 'user', content: content });
        this.history.push({ role: 'assistant', content: html });
        if (onDone) onDone(html);
        return html;
      } else {
        var noResult = '没有找到相关结果。';
        this.history.push({ role: 'user', content: content });
        this.history.push({ role: 'assistant', content: noResult });
        if (onDone) onDone(noResult);
        return noResult;
      }
    }

    // ---- 直答开启：搜索与模型请求并行，搜索结果仅展示不注入 prompt ----
    // 立刻启动搜索（不等待），同时直接向模型发送用户消息
    let searchPromise: Promise<SearchResult[]> = Promise.resolve([]);
    if (this.config.provider === 'zhihu' && this.config.zhihuAccessSecret) {
      const accessSecret = this.config.zhihuAccessSecret;
      const searchType = this.config.searchType;
      searchPromise = (async () => {
        try {
          var results: SearchResult[] = [];
          if (searchType === 'global') {
            results = await searchZhihuGlobal(content, accessSecret);
            if (results.length === 0) results = await searchZhihu(content, accessSecret);
          } else {
            results = await searchZhihu(content, accessSecret);
            if (results.length === 0) results = await searchZhihuGlobal(content, accessSecret);
          }
          if (results.length === 0) results = await searchBing(content);
          return results;
        } catch (e) {
          return [];
        }
      })();
    }
    this.searchResults = []; // 清空上次结果，搜索完成后由调用方取 searchResults

    // 模型直接用原始用户消息（不注入搜索上下文）
    const userContent = content;

    // 构建发送给模型的消息列表
    var sendMessages;
    if (this.config.provider === 'zhihu') {
      // 拿历史（不含当前消息），少拿一条给模板版留位置
      sendMessages = this.history.filter(function (m) { return m.role !== 'system'; }).slice(-9);
      // 直接推模板结果
      sendMessages.push({ role: 'user', content: this.buildUserMessage(userContent) });
    } else {
      sendMessages = this.history;
    }

    // 保存干净版到 history（模板版不发回显示，也不发给模型做历史上下文）
    this.history.push({ role: 'user', content: userContent });

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

    // 日志输出完整请求
    console.log('[Agent] === Request ===');
    console.log('[Agent] URL:', this.config.endpoint);
    console.log('[Agent] Model:', this.config.model);
    console.log('[Agent] Stream:', stream);
    console.log('[Agent] System prompt:', this.history[0]?.content || '(empty)');
    console.log('[Agent] Messages count:', sendMessages.length);
    console.log('[Agent] Messages:', JSON.stringify(sendMessages, null, 2));
    console.log('[Agent] =================');

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
            let reasoningText = '';
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
                    const delta = json.choices?.[0]?.delta || {};
                    const content = delta.content || '';
                    const reasoning = delta.reasoning_content || '';
                    if (content) {
                      fullReply += content;
                      if (onChunk) onChunk(content);
                    }
                    if (reasoning) {
                      reasoningText += reasoning;
                    }
                  } catch (e) { throw e; }
                }
              }
            });
            res.on('end', () => {
              if (statusCode >= 400) {
                var errBody = '';
                var ej: any = null;
                try { ej = JSON.parse(buffer || data); errBody = ej?.error?.message || ej?.error || (buffer || data).slice(0, 200); } catch (e) { }
                var errorCode = ej?.error?.code ? String(ej.error.code) : String(statusCode);
                const errMsg = getErrorMessage(errorCode);
                if (onError) onError(errMsg);
                reject(new Error(errMsg));
                return;
              }
              // 优先 content，空时回退 reasoning
              var finalReply = fullReply || reasoningText;
              if (!finalReply) {
                const errMsg = '流式响应为空';
                if (onError) onError(errMsg);
                reject(new Error(errMsg));
                return;
              }
              this.history.push({ role: 'assistant', content: finalReply });
              // 等待并行搜索完成（通常已完成），再触发 onDone 让调用方取 searchResults
              searchPromise.then(results => {
                this.searchResults = results;
                if (onDone) onDone(finalReply);
                resolve(finalReply);
              }).catch(() => {
                this.searchResults = [];
                if (onDone) onDone(finalReply);
                resolve(finalReply);
              });
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
                try { ej = JSON.parse(data); } catch (e) { }
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
                searchPromise.then(results => {
                  this.searchResults = results;
                  if (onDone) onDone(reply);
                  resolve(reply);
                }).catch(() => {
                  this.searchResults = [];
                  if (onDone) onDone(reply);
                  resolve(reply);
                });
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

const DEFAULT_SYSTEM_PROMPT = `## 关于代码
当用户询问代码问题时，给出清晰的解释和可运行的代码示例。

## 关于文件系统
如果你需要访问本地文件，请告诉用户当前不支持文件系统访问（未来会支持）。

请用中文回复。`;

export function getDefaultSystemPrompt(): string {
  return DEFAULT_SYSTEM_PROMPT;
}
