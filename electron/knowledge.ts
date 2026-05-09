// Knowledge base — stores conversations, tracked topics, and daily briefings
// Saves to ~/Library/Application Support/screen-toy/knowledge.json

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export interface TrackedTopic {
  name: string;
  tags: string[];
  createdAt: string;
  lastDiscussed: string;
  conversationCount: number;
  source: 'manual' | 'auto';
}

export interface StyleChange {
  messageIndex: number;
  mbtiEI: string;
  mbtiSN: string;
  mbtiTF: string;
  mbtiJP: string;
  timestamp: string;
}

export interface SessionMeta {
  mbtiEI?: string;
  mbtiSN?: string;
  mbtiTF?: string;
  mbtiJP?: string;
  agentModel?: string;
  searchType?: string;
  enableDirectAnswer?: boolean;
}

export interface ConversationRecord {
  id: string;
  date: string;
  topic?: string;
  provider: string;
  messages: { role: string; content: string }[];
  summary?: string;
  // Session 元信息
  mbtiEI?: string;
  mbtiSN?: string;
  mbtiTF?: string;
  mbtiJP?: string;
  agentModel?: string;
  searchType?: string;
  enableDirectAnswer?: boolean;
  // 风格变更历史
  initialStyle?: SessionMeta;
  styleChanges?: StyleChange[];
}

export interface KnowledgeBase {
  topics: TrackedTopic[];
  conversations: ConversationRecord[];
  updatedAt: string;
}

const EMPTY_KB: KnowledgeBase = {
  topics: [],
  conversations: [],
  updatedAt: new Date().toISOString(),
};

function getFilePath(): string {
  const dir = path.join(app.getPath('userData'));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'knowledge.json');
}

export function loadKnowledge(): KnowledgeBase {
  try {
    const file = getFilePath();
    if (!fs.existsSync(file)) return EMPTY_KB;
    const data = fs.readFileSync(file, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    return EMPTY_KB;
  }
}

export function saveKnowledge(kb: KnowledgeBase): void {
  kb.updatedAt = new Date().toISOString();
  fs.writeFileSync(getFilePath(), JSON.stringify(kb, null, 2), 'utf-8');
}

export function addConversation(record: ConversationRecord): KnowledgeBase {
  const kb = loadKnowledge();
  // 用第一个用户消息作为标题
  if (!record.topic) {
    const firstUserMsg = (record.messages || []).find(function (m: { role: string; content: string }) { return m.role === 'user'; });
    record.topic = firstUserMsg ? firstUserMsg.content.slice(0, 30) : '新对话';
  }
  kb.conversations.push(record);
  // Keep last 50 conversations
  if (kb.conversations.length > 50) {
    kb.conversations = kb.conversations.slice(-50);
  }
  saveKnowledge(kb);
  return kb;
}

export function addOrUpdateTopic(name: string, tags: string[]): KnowledgeBase {
  const kb = loadKnowledge();
  const existing = kb.topics.find(t => t.name === name);
  if (existing) {
    existing.conversationCount++;
    existing.tags = [...new Set([...existing.tags, ...tags])];
    existing.lastDiscussed = new Date().toISOString();
  } else {
    kb.topics.push({
      name,
      tags,
      createdAt: new Date().toISOString(),
      lastDiscussed: new Date().toISOString(),
      conversationCount: 1,
      source: 'auto',
    });
  }
  saveKnowledge(kb);
  return kb;
}

export function removeTopic(name: string): KnowledgeBase {
  const kb = loadKnowledge();
  kb.topics = kb.topics.filter(t => t.name !== name);
  saveKnowledge(kb);
  return kb;
}

export function getTopics(): TrackedTopic[] {
  return loadKnowledge().topics;
}

export function getConversations(): ConversationRecord[] {
  return loadKnowledge().conversations;
}

export interface ConversationListItem {
  id: string;
  title: string;
  date: string;
  messageCount: number;
  hasStyleChanges: boolean;
}

export function getConversationList(): ConversationListItem[] {
  const convos = loadKnowledge().conversations;
  const list: ConversationListItem[] = [];
  for (let i = convos.length - 1; i >= 0; i--) {
    const c = convos[i];
    var title = c.topic;
    if (!title) {
      var firstUser = (c.messages || []).find(function (m: { role: string; content: string }) { return m.role === 'user'; });
      title = firstUser ? firstUser.content.slice(0, 30) : '未命名对话';
    }
    list.push({
      id: c.id,
      title: title,
      date: c.date,
      messageCount: (c.messages || []).length,
      hasStyleChanges: !!(c.styleChanges && c.styleChanges.length > 0),
    });
  }
  return list;
}

export function getConversationById(id: string): ConversationRecord | null {
  const convos = loadKnowledge().conversations;
  return convos.find(function (c: ConversationRecord) { return c.id === id; }) || null;
}

export function saveOrUpdateConversation(record: ConversationRecord): void {
  const kb = loadKnowledge();
  const existing = kb.conversations.findIndex(function (c: ConversationRecord) { return c.id === record.id; });
  if (!record.topic) {
    const firstUserMsg = (record.messages || []).find(function (m: { role: string; content: string }) { return m.role === 'user'; });
    record.topic = firstUserMsg ? firstUserMsg.content.slice(0, 30) : '新对话';
  }
  if (existing >= 0) {
    // 保留已有的 styleChanges（不覆盖已记录的风格变更）
    var existingRecord = kb.conversations[existing];
    if (!record.styleChanges && existingRecord.styleChanges) {
      record.styleChanges = existingRecord.styleChanges;
    }
    if (!record.initialStyle && existingRecord.initialStyle) {
      record.initialStyle = existingRecord.initialStyle;
    }
    kb.conversations[existing] = record;
  } else {
    // 新会话：记录创建时的初始风格
    if (!record.initialStyle) {
      record.initialStyle = {
        mbtiEI: record.mbtiEI,
        mbtiSN: record.mbtiSN,
        mbtiTF: record.mbtiTF,
        mbtiJP: record.mbtiJP,
        agentModel: record.agentModel,
        searchType: record.searchType,
        enableDirectAnswer: record.enableDirectAnswer,
      };
    }
    kb.conversations.push(record);
    if (kb.conversations.length > 50) {
      kb.conversations = kb.conversations.slice(-50);
    }
  }
  saveKnowledge(kb);
}

export function deleteConversation(id: string): void {
  const kb = loadKnowledge();
  kb.conversations = kb.conversations.filter(function (c: ConversationRecord) { return c.id !== id; });
  saveKnowledge(kb);
}

export function recordStyleChange(id: string, newStyle: SessionMeta): void {
  const kb = loadKnowledge();
  const conv = kb.conversations.find(function (c: ConversationRecord) { return c.id === id; });
  if (!conv) return;
  var change: StyleChange = {
    messageIndex: (conv.messages || []).length,
    mbtiEI: newStyle.mbtiEI || '',
    mbtiSN: newStyle.mbtiSN || '',
    mbtiTF: newStyle.mbtiTF || '',
    mbtiJP: newStyle.mbtiJP || '',
    timestamp: new Date().toISOString(),
  };
  if (!conv.styleChanges) conv.styleChanges = [];
  conv.styleChanges.push(change);
  saveKnowledge(kb);
}
