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
