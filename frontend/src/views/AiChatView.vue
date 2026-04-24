<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue';
import { message } from 'ant-design-vue';
import { streamAiChat } from '@/api/ai';
import { UserOutlined, RobotOutlined } from '@ant-design/icons-vue';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
};

type ChatSession = {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: string;
};

const STORAGE_KEY = 'ai-chat-sessions-v1';

const prompt = ref('');
const systemPrompt =
  '你是一个后台管理系统助手，请用简洁中文回答，重点给出可执行步骤。';
const loading = ref(false);
const modelName = ref('qwen3.5-122b-a10b');
const chatBodyRef = ref<HTMLElement | null>(null);
const sessions = ref<ChatSession[]>([]);
const activeSessionId = ref('');

const chatList = ref<ChatMessage[]>([]);

const queue = ref('');
let typingTimer: ReturnType<typeof setInterval> | null = null;
let streamingAssistantIndex = -1;

function nowIso() {
  return new Date().toISOString();
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString();
}

function syncActiveMessages() {
  const idx = sessions.value.findIndex((s) => s.id === activeSessionId.value);
  if (idx >= 0) {
    sessions.value[idx].messages = [...chatList.value];
    sessions.value[idx].updatedAt = nowIso();
    if (!sessions.value[idx].title || sessions.value[idx].title === '新对话') {
      const firstUser = chatList.value.find((m) => m.role === 'user')?.content ?? '';
      sessions.value[idx].title = firstUser ? firstUser.slice(0, 18) : '新对话';
    }
  }
}

function saveSessions() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.value));
}

function createSession(title = '新对话') {
  const s: ChatSession = {
    id: makeId(),
    title,
    messages: [],
    updatedAt: nowIso(),
  };
  sessions.value.unshift(s);
  activeSessionId.value = s.id;
  chatList.value = [];
  prompt.value = '';
}

function switchSession(sessionId: string) {
  if (loading.value) {
    message.warning('模型正在回复，请稍后切换会话');
    return;
  }
  clearTyping();
  queue.value = '';
  streamingAssistantIndex = -1;
  activeSessionId.value = sessionId;
  const s = sessions.value.find((x) => x.id === sessionId);
  chatList.value = s ? [...s.messages] : [];
  void scrollToBottom();
}

function removeSession(sessionId: string) {
  if (loading.value) {
    message.warning('模型正在回复，请稍后删除会话');
    return;
  }
  sessions.value = sessions.value.filter((s) => s.id !== sessionId);
  if (!sessions.value.length) {
    createSession();
    return;
  }
  if (activeSessionId.value === sessionId) {
    switchSession(sessions.value[0].id);
  }
}

async function scrollToBottom() {
  await nextTick();
  if (chatBodyRef.value) {
    chatBodyRef.value.scrollTop = chatBodyRef.value.scrollHeight;
  }
}

function startTyping() {
  if (typingTimer) {
    return;
  }
  typingTimer = setInterval(() => {
    if (!queue.value) {
      if (typingTimer) {
        clearInterval(typingTimer);
        typingTimer = null;
      }
      return;
    }
    if (
      streamingAssistantIndex >= 0 &&
      streamingAssistantIndex < chatList.value.length
    ) {
      chatList.value[streamingAssistantIndex].content += queue.value.slice(0, 1);
      chatList.value[streamingAssistantIndex].createdAt = nowIso();
      syncActiveMessages();
      void scrollToBottom();
    }
    queue.value = queue.value.slice(1);
  }, 18);
}

function clearTyping() {
  if (typingTimer) {
    clearInterval(typingTimer);
    typingTimer = null;
  }
}

async function onSend() {
  const ask = prompt.value.trim();
  if (!ask) {
    message.warning('请输入问题');
    return;
  }
  loading.value = true;
  queue.value = '';
  streamingAssistantIndex = -1;

  const userMsg: ChatMessage = {
    id: makeId(),
    role: 'user',
    content: ask,
    createdAt: nowIso(),
  };
  const aiMsg: ChatMessage = {
    id: makeId(),
    role: 'assistant',
    content: '',
    createdAt: nowIso(),
  };
  chatList.value.push(userMsg, aiMsg);
  syncActiveMessages();
  streamingAssistantIndex = chatList.value.length - 1;
  await scrollToBottom();

  try {
    await streamAiChat(
      { prompt: ask, systemPrompt },
      {
        onMeta: (meta) => {
          modelName.value = meta.model;
        },
        onDelta: (text) => {
          queue.value += text;
          startTyping();
        },
        onError: (err) => {
          message.error(err);
        },
      },
    );
    if (
      streamingAssistantIndex >= 0 &&
      !chatList.value[streamingAssistantIndex].content
    ) {
      chatList.value[streamingAssistantIndex].content = '（模型未返回内容）';
      syncActiveMessages();
    }
  } catch (e) {
    message.error((e as Error).message);
    if (streamingAssistantIndex >= 0) {
      chatList.value[streamingAssistantIndex].content = '请求失败，请稍后重试。';
      syncActiveMessages();
    }
  } finally {
    loading.value = false;
    prompt.value = '';
  }
}

function clearChat() {
  clearTyping();
  queue.value = '';
  chatList.value = [];
  streamingAssistantIndex = -1;
  syncActiveMessages();
}

function isActiveSession(id: string) {
  return activeSessionId.value === id;
}

onMounted(() => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      sessions.value = JSON.parse(raw) as ChatSession[];
    } catch {
      sessions.value = [];
    }
  }
  if (!sessions.value.length) {
    createSession();
  } else {
    sessions.value.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    switchSession(sessions.value[0].id);
  }
});

watch(
  sessions,
  () => {
    saveSessions();
  },
  { deep: true },
);
</script>

<template>
  <div class="chat-page">
    <a-layout class="chat-layout">
      <a-layout-sider width="260" class="chat-sider">
        <div class="sider-head">
          <span>会话历史</span>
          <a-button type="primary" size="small" @click="createSession()">
            新建
          </a-button>
        </div>
        <div class="session-list">
          <div
            v-for="s in sessions"
            :key="s.id"
            class="session-item"
            :class="{ active: isActiveSession(s.id) }"
            @click="switchSession(s.id)"
          >
            <div class="session-title">{{ s.title || '新对话' }}</div>
            <div class="session-foot">
              <span>{{ fmtTime(s.updatedAt) }}</span>
              <a-button
                type="link"
                size="small"
                danger
                @click.stop="removeSession(s.id)"
              >
                删除
              </a-button>
            </div>
          </div>
        </div>
      </a-layout-sider>

      <a-layout-content class="chat-main">
        <a-typography-title :level="4">AI 对话（SSE 流式）</a-typography-title>
        <a-typography-paragraph type="secondary">
          当前模型：{{ modelName }}。左侧是 AI，右侧是你。
        </a-typography-paragraph>

        <a-card class="chat-card" :bordered="false">
          <div ref="chatBodyRef" class="chat-body">
            <template v-if="chatList.length">
              <div
                v-for="item in chatList"
                :key="item.id"
                class="chat-row"
                :class="item.role === 'user' ? 'chat-row-user' : 'chat-row-assistant'"
              >
                <div class="avatar-wrap">
                  <a-avatar
                    :style="item.role === 'user' ? { background: '#1677ff' } : { background: '#5b8c00' }"
                  >
                    <template v-if="item.role === 'user'">
                      <UserOutlined />
                    </template>
                    <template v-else>
                      <RobotOutlined />
                    </template>
                  </a-avatar>
                </div>
                <div class="bubble-wrap">
                  <div class="chat-bubble" :class="`chat-bubble-${item.role}`">
                    <pre class="chat-text">{{ item.content || (loading && item.role === 'assistant' ? '思考中...' : '') }}</pre>
                  </div>
                  <div class="chat-time">{{ fmtTime(item.createdAt) }}</div>
                </div>
              </div>
            </template>
            <div v-else class="chat-empty">输入问题后开始对话</div>
          </div>

          <div class="typing-line" v-if="loading">
            <span class="dot"></span>
            <span class="dot"></span>
            <span class="dot"></span>
            <span>AI 正在输入...</span>
          </div>

          <div class="chat-inputs">
            <div class="send-row">
              <a-input
                v-model:value="prompt"
                class="send-input"
                placeholder="请输入你的问题，例如：帮我设计一个用户权限审批流程。"
                @press-enter="onSend"
              />
              <a-button type="primary" :loading="loading" @click="onSend">
                发送
              </a-button>
              <a-button @click="clearChat">清空当前会话</a-button>
            </div>
          </div>
        </a-card>
      </a-layout-content>
    </a-layout>
  </div>
</template>

<style scoped>
.chat-page {
  height: 100%;
  overflow: hidden;
}

.chat-layout {
  height: 100%;
  min-height: 0;
  background: transparent;
}

.chat-sider {
  background: #fff;
  border-right: 1px solid #f0f0f0;
  padding: 10px;
  border-radius: 8px 0 0 8px;
}

.sider-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  font-weight: 600;
}

.session-list {
  overflow-y: auto;
  max-height: calc(100% - 40px);
}

.session-item {
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  padding: 8px 10px;
  margin-bottom: 8px;
  cursor: pointer;
}

.session-item.active {
  border-color: #1677ff;
  background: #f0f7ff;
}

.session-title {
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.session-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #999;
  font-size: 12px;
}

.chat-main {
  padding-left: 12px;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.chat-card {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-radius: 0 8px 8px 0;
  padding: 4px 6px;
}

.chat-body {
  height: 420px;
  min-height: 420px;
  max-height: 420px;
  overflow-y: auto;
  padding: 14px 12px 10px;
  background: #fafbfc;
  border-radius: 8px;
  border: 1px solid #f0f0f0;
}

.chat-row {
  display: flex;
  margin-bottom: 12px;
  align-items: flex-start;
  gap: 8px;
}

.chat-row-user {
  justify-content: flex-end;
}

.chat-row-assistant {
  justify-content: flex-start;
}

.chat-row-user .avatar-wrap {
  order: 2;
}

.chat-row-user .bubble-wrap {
  order: 1;
  align-items: flex-end;
}

.bubble-wrap {
  display: flex;
  flex-direction: column;
  max-width: 76%;
}

.chat-bubble {
  border-radius: 10px;
  padding: 10px 14px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.chat-bubble-user {
  background: #1677ff;
  color: #fff;
}

.chat-bubble-assistant {
  background: #f5f7fa;
  color: #222;
  border: 1px solid #e5e6eb;
}

.chat-text {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
}

.chat-time {
  margin-top: 4px;
  font-size: 12px;
  color: #999;
}

.chat-empty {
  color: #999;
  text-align: center;
  margin-top: 80px;
}

.typing-line {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #888;
  margin: 10px 4px 8px;
  font-size: 13px;
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #999;
  animation: blink 1.2s infinite ease-in-out;
}

.dot:nth-child(2) {
  animation-delay: 0.2s;
}

.dot:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes blink {
  0%,
  80%,
  100% {
    opacity: 0.2;
  }
  40% {
    opacity: 1;
  }
}

.chat-inputs {
  border-top: 1px solid #f0f0f0;
  margin-top: 8px;
  padding: 12px 4px 4px;
  display: flex;
  flex-direction: column;
  background: #fff;
}

.send-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
}

.send-input {
  flex: 1;
}
</style>
