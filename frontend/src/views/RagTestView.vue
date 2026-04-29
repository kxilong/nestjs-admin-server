<template>
  <div class="rag-page">
    <a-tabs v-model:activeKey="activeTab" size="large">
      <a-tab-pane key="docs" tab="文档管理">
        <div class="tab-header">
          <a-upload
            :before-upload="handleBeforeUpload"
            :show-upload-list="false"
            accept=".pdf,.doc,.docx,.txt,.md"
          >
            <a-button type="primary">上传文档</a-button>
          </a-upload>
          <a-button @click="loadDocuments" style="margin-left: 8px">刷新</a-button>
        </div>

        <a-spin :spinning="docsLoading">
          <a-table
            :columns="docColumns"
            :data-source="documents"
            row-key="id"
            :pagination="false"
            size="middle"
            style="margin-top: 16px"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'createdAt'">
                {{ formatDate(record.createdAt) }}
              </template>
              <template v-if="column.key === 'action'">
                <a-popconfirm
                  title="确认删除？删除后相关分块也会清除。"
                  @confirm="deleteDoc(record.id)"
                >
                  <a-button type="link" danger size="small">删除</a-button>
                </a-popconfirm>
              </template>
            </template>
          </a-table>
        </a-spin>

        <a-modal
          v-model:open="uploadModalVisible"
          title="上传文档"
          @ok="doUpload"
          :confirm-loading="uploading"
        >
          <a-form layout="vertical">
            <a-form-item label="已选文件">
              <span v-if="selectedFile">{{ selectedFile.name }}</span>
              <span v-else style="color: #999">未选择</span>
            </a-form-item>
            <a-form-item label="Chunk Size">
              <a-input-number v-model:value="uploadForm.chunkSize" :min="200" :max="4000" style="width: 100%" />
            </a-form-item>
            <a-form-item label="Chunk Overlap">
              <a-input-number v-model:value="uploadForm.chunkOverlap" :min="0" :max="1000" style="width: 100%" />
            </a-form-item>
          </a-form>
        </a-modal>
      </a-tab-pane>

      <a-tab-pane key="chat" tab="知识库问答">
        <div class="chat-container">
          <div ref="chatBodyRef" class="chat-body">
            <template v-if="chatMessages.length">
              <div
                v-for="msg in chatMessages"
                :key="msg.id"
                class="chat-row"
                :class="msg.role === 'user' ? 'row-user' : 'row-assistant'"
              >
                <div class="bubble" :class="msg.role">
                  <pre class="bubble-text">{{ msg.content || (msg.role === 'assistant' && chatLoading ? '思考中...' : '') }}</pre>
                </div>
              </div>
            </template>
            <div v-else class="chat-empty">
              上传文档后，在此提问，AI 将基于知识库内容回答
            </div>
          </div>

          <div class="typing-hint" v-if="chatLoading">
            <span class="dot"></span>
            <span class="dot"></span>
            <span class="dot"></span>
            <span>AI 正在思考...</span>
          </div>

          <div class="chat-input-area">
            <a-input
              v-model:value="chatInput"
              placeholder="输入问题，例如：NestJS 是什么？"
              @press-enter="sendChat"
              :disabled="chatLoading"
              size="large"
            />
            <a-button
              type="primary"
              @click="sendChat"
              :loading="chatLoading"
              size="large"
            >
              发送
            </a-button>
          </div>
        </div>
      </a-tab-pane>

      <a-tab-pane key="search" tab="语义检索">
        <div class="search-area">
          <a-input
            v-model:value="searchQuery"
            placeholder="输入检索内容"
            size="large"
            @press-enter="doSearch"
          />
          <a-button type="primary" @click="doSearch" :loading="searching" size="large" style="margin-left: 8px">
            检索
          </a-button>
        </div>

        <div v-if="searchResult" style="margin-top: 16px">
          <a-alert
            :message="`找到 ${searchResult.matchCount} 个匹配`"
            type="info"
            show-icon
            style="margin-bottom: 16px"
          />
          <div v-for="(m, i) in searchResult.matches" :key="i" class="match-card">
            <div class="match-header">
              <a-tag color="blue">{{ m.filename }}</a-tag>
              <a-tag>分块 #{{ m.chunkIndex }}</a-tag>
              <a-tag color="green">得分: {{ m.score }}</a-tag>
            </div>
            <pre class="match-content">{{ m.content }}</pre>
          </div>
        </div>
      </a-tab-pane>
    </a-tabs>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue';
import { message } from 'ant-design-vue';
import { API_BASE } from '@/config';
import { AUTH_KEYS } from '@/auth/storage';

const activeTab = ref('docs');

const documents = ref<any[]>([]);
const docsLoading = ref(false);
const uploadModalVisible = ref(false);
const uploading = ref(false);
const selectedFile = ref<File | null>(null);
const uploadForm = ref({ chunkSize: 1000, chunkOverlap: 150 });

const chatMessages = ref<{ id: string; role: 'user' | 'assistant'; content: string }[]>([]);
const chatInput = ref('');
const chatLoading = ref(false);
const chatBodyRef = ref<HTMLElement | null>(null);
let streamingIndex = -1;
let typingQueue = '';
let typingTimer: ReturnType<typeof setInterval> | null = null;

const searchQuery = ref('');
const searching = ref(false);
const searchResult = ref<any>(null);

const docColumns = [
  { title: '文件名', dataIndex: 'filename', key: 'filename' },
  { title: '类型', dataIndex: 'mimeType', key: 'mimeType' },
  { title: '分块数', dataIndex: 'chunkCount', key: 'chunkCount' },
  { title: '来源', dataIndex: 'source', key: 'source' },
  { title: '上传时间', dataIndex: 'createdAt', key: 'createdAt' },
  { title: '操作', key: 'action', width: 80 },
];

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatDate(iso: string) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString();
}

function getHeaders() {
  const token = localStorage.getItem(AUTH_KEYS.access) ?? '';
  return { Authorization: `Bearer ${token}` };
}

async function loadDocuments() {
  docsLoading.value = true;
  try {
    const res = await fetch(`${API_BASE}/rag/documents`, { headers: getHeaders() });
    const json = await res.json();
    documents.value = json.data || json;
  } catch (e: any) {
    message.error('加载文档列表失败');
  } finally {
    docsLoading.value = false;
  }
}

function handleBeforeUpload(file: File) {
  selectedFile.value = file;
  uploadModalVisible.value = true;
  return false;
}

async function doUpload() {
  if (!selectedFile.value) {
    message.warning('请选择文件');
    return;
  }
  uploading.value = true;
  try {
    const formData = new FormData();
    formData.append('file', selectedFile.value);
    formData.append('chunkSize', uploadForm.value.chunkSize.toString());
    formData.append('chunkOverlap', uploadForm.value.chunkOverlap.toString());

    const res = await fetch(`${API_BASE}/rag/documents/ingest`, {
      method: 'POST',
      body: formData,
      headers: getHeaders(),
    });
    const json = await res.json();
    if (json.code !== 200) {
      throw new Error(json.msg || '上传失败');
    }
    message.success(`上传成功，生成 ${json.data.chunkCount} 个分块`);
    uploadModalVisible.value = false;
    selectedFile.value = null;
    await loadDocuments();
  } catch (e: any) {
    message.error(e.message || '上传失败');
  } finally {
    uploading.value = false;
  }
}

async function deleteDoc(id: string) {
  try {
    const res = await fetch(`${API_BASE}/rag/documents/${id}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    const json = await res.json();
    if (json.code !== 200) {
      throw new Error(json.msg || '删除失败');
    }
    message.success('删除成功');
    await loadDocuments();
  } catch (e: any) {
    message.error(e.message);
  }
}

async function scrollToBottom() {
  await nextTick();
  if (chatBodyRef.value) {
    chatBodyRef.value.scrollTop = chatBodyRef.value.scrollHeight;
  }
}

function startTyping() {
  if (typingTimer) return;
  typingTimer = setInterval(() => {
    if (!typingQueue) {
      if (typingTimer) { clearInterval(typingTimer); typingTimer = null; }
      return;
    }
    if (streamingIndex >= 0 && streamingIndex < chatMessages.value.length) {
      chatMessages.value[streamingIndex].content += typingQueue.slice(0, 1);
      void scrollToBottom();
    }
    typingQueue = typingQueue.slice(1);
  }, 18);
}

function clearTyping() {
  if (typingTimer) { clearInterval(typingTimer); typingTimer = null; }
  typingQueue = '';
}

async function sendChat() {
  const q = chatInput.value.trim();
  if (!q || chatLoading.value) return;

  chatLoading.value = true;
  clearTyping();
  streamingIndex = -1;

  chatMessages.value.push({ id: makeId(), role: 'user', content: q });
  const aiMsg = { id: makeId(), role: 'assistant' as const, content: '' };
  chatMessages.value.push(aiMsg);
  streamingIndex = chatMessages.value.length - 1;
  chatInput.value = '';
  await scrollToBottom();

  try {
    const res = await fetch(`${API_BASE}/rag/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getHeaders(),
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({ question: q }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(errText || `请求失败(${res.status})`);
    }

    if (!res.body) {
      throw new Error('流式响应为空');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';

      for (const eventRaw of events) {
        const lines = eventRaw.split('\n').map((l) => l.trim());
        const eventLine = lines.find((l) => l.startsWith('event:'));
        const dataLine = lines.find((l) => l.startsWith('data:'));
        const eventName = eventLine?.slice(6).trim() ?? 'message';
        const dataText = dataLine?.slice(5).trim() ?? '{}';
        let data: any = {};
        try { data = JSON.parse(dataText); } catch { /* ignore */ }

        if (eventName === 'delta') {
          typingQueue += (data.text as string) ?? '';
          startTyping();
        } else if (eventName === 'error') {
          message.error(data.message || '模型返回错误');
        }
      }
    }

    if (streamingIndex >= 0 && !chatMessages.value[streamingIndex].content) {
      chatMessages.value[streamingIndex].content = '（模型未返回内容）';
    }
  } catch (e: any) {
    message.error(e.message);
    if (streamingIndex >= 0) {
      chatMessages.value[streamingIndex].content = '请求失败，请稍后重试。';
    }
  } finally {
    chatLoading.value = false;
    clearTyping();
  }
}

async function doSearch() {
  const q = searchQuery.value.trim();
  if (!q) return;
  searching.value = true;
  searchResult.value = null;
  try {
    const res = await fetch(`${API_BASE}/rag/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getHeaders() },
      body: JSON.stringify({ question: q, topK: 5, minScore: 0 }),
    });
    const json = await res.json();
    searchResult.value = json.data || json;
  } catch (e: any) {
    message.error('检索失败');
  } finally {
    searching.value = false;
  }
}

onMounted(() => {
  loadDocuments();
});
</script>

<style scoped>
.rag-page {
  padding: 0;
  max-width: 100%;
}

.tab-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.chat-container {
  display: flex;
  flex-direction: column;
  height: 520px;
}

.chat-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  background: #fafbfc;
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  min-height: 0;
}

.chat-empty {
  text-align: center;
  color: #999;
  margin-top: 120px;
}

.chat-row {
  margin-bottom: 12px;
  display: flex;
}

.row-user {
  justify-content: flex-end;
}

.row-assistant {
  justify-content: flex-start;
}

.bubble {
  max-width: 80%;
  padding: 10px 14px;
  border-radius: 10px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.bubble.user {
  background: #1677ff;
  color: #fff;
}

.bubble.assistant {
  background: #f5f7fa;
  color: #222;
  border: 1px solid #e5e6eb;
}

.bubble-text {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
}

.typing-hint {
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
.dot:nth-child(2) { animation-delay: 0.2s; }
.dot:nth-child(3) { animation-delay: 0.4s; }

@keyframes blink {
  0%, 80%, 100% { opacity: 0.2; }
  40% { opacity: 1; }
}

.chat-input-area {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
.chat-input-area .ant-input {
  flex: 1;
}

.search-area {
  display: flex;
  gap: 0;
}
.search-area .ant-input {
  flex: 1;
}

.match-card {
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
  background: #fafafa;
}

.match-header {
  margin-bottom: 8px;
}

.match-content {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 13px;
  max-height: 200px;
  overflow-y: auto;
  font-family: inherit;
}
</style>
