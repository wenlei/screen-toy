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

export interface ConversationRecord {
  id: string;
  date: string;
  topic?: string;
  provider: string;
  messages: { role: string; content: string }[];
  summary?: string;
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
    kb.conversations[existing] = record;
  } else {
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
