<template>
  <div class="rag-test">
    <h1>RAG 功能测试</h1>

    <!-- 文档上传 -->
    <section class="upload-section">
      <h2>1. 文档上传</h2>
      <form @submit.prevent="uploadDocument">
        <div class="form-group">
          <label for="file">选择文件 (PDF/Word/TXT/MD)</label>
          <input type="file" id="file" ref="fileInput" />
        </div>
        <div class="form-group">
          <label for="chunkSize">Chunk Size:</label>
          <input
            type="number"
            id="chunkSize"
            v-model.number="uploadForm.chunkSize"
            min="200"
            max="4000"
          />
        </div>
        <div class="form-group">
          <label for="chunkOverlap">Chunk Overlap:</label>
          <input
            type="number"
            id="chunkOverlap"
            v-model.number="uploadForm.chunkOverlap"
            min="0"
            max="1000"
          />
        </div>
        <div class="form-group">
          <label for="source">Source (可选):</label>
          <input type="text" id="source" v-model="uploadForm.source" />
        </div>
        <button type="submit" :disabled="isUploading">
          {{ isUploading ? '上传中...' : '上传文档' }}
        </button>
      </form>

      <div v-if="uploadResult" class="result">
        <h3>上传结果</h3>
        <pre>{{ JSON.stringify(uploadResult, null, 2) }}</pre>
      </div>
    </section>

    <!-- 语义检索 -->
    <section class="query-section">
      <h2>2. 语义检索</h2>
      <form @submit.prevent="queryDocuments">
        <div class="form-group">
          <label for="question">问题:</label>
          <textarea
            id="question"
            v-model="queryForm.question"
            rows="3"
            placeholder="输入与上传文档相关的问题..."
          ></textarea>
        </div>
        <div class="form-group">
          <label for="topK">Top K:</label>
          <input
            type="number"
            id="topK"
            v-model.number="queryForm.topK"
            min="1"
            max="100"
          />
        </div>
        <div class="form-group">
          <label for="minScore">Min Score:</label>
          <input
            type="number"
            id="minScore"
            v-model.number="queryForm.minScore"
            min="0"
            max="1"
            step="0.1"
          />
        </div>
        <button type="submit" :disabled="isQuerying">
          {{ isQuerying ? '查询中...' : '查询' }}
        </button>
      </form>

      <div v-if="queryResult" class="result">
        <h3>查询结果</h3>
        <div v-if="queryResult.matchCount > 0">
          <p>找到 {{ queryResult.matchCount }} 个匹配</p>
          <div
            v-for="(match, index) in queryResult.matches"
            :key="index"
            class="match-item"
          >
            <h4>
              匹配 {{ (index as number) + 1 }} (得分:
              {{ match.score.toFixed(2) }})
            </h4>
            <p><strong>文档:</strong> {{ match.documentName }}</p>
            <p><strong>内容:</strong> {{ match.content }}</p>
          </div>
        </div>
        <div v-else>
          <p>没有找到匹配结果</p>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

// 上传表单
const fileInput = ref<HTMLInputElement>();
const uploadForm = ref({
  chunkSize: 1000,
  chunkOverlap: 150,
  source: '',
});
const isUploading = ref(false);
const uploadResult = ref<any>(null);

// 查询表单
const queryForm = ref({
  question: '',
  topK: 5,
  minScore: 0,
});
const isQuerying = ref(false);
const queryResult = ref<any>(null);

// 上传文档
const uploadDocument = async () => {
  const file = fileInput.value?.files?.[0];
  if (!file) {
    alert('请选择文件');
    return;
  }

  isUploading.value = true;
  uploadResult.value = null;

  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('chunkSize', uploadForm.value.chunkSize.toString());
    formData.append('chunkOverlap', uploadForm.value.chunkOverlap.toString());
    if (uploadForm.value.source) {
      formData.append('source', uploadForm.value.source);
    }

    const response = await fetch('http://localhost:3000/rag/documents/ingest', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error('上传失败');
    }

    uploadResult.value = await response.json();
  } catch (error) {
    console.error('上传错误:', error);
    alert('上传失败，请检查控制台');
  } finally {
    isUploading.value = false;
  }
};

// 查询文档
const queryDocuments = async () => {
  if (!queryForm.value.question) {
    alert('请输入问题');
    return;
  }

  isQuerying.value = true;
  queryResult.value = null;

  try {
    const response = await fetch('http://localhost:3000/rag/query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        question: queryForm.value.question,
        topK: queryForm.value.topK,
        minScore: queryForm.value.minScore,
      }),
    });

    if (!response.ok) {
      throw new Error('查询失败');
    }

    queryResult.value = await response.json();
  } catch (error) {
    console.error('查询错误:', error);
    alert('查询失败，请检查控制台');
  } finally {
    isQuerying.value = false;
  }
};
</script>

<style scoped>
.rag-test {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
  font-family: Arial, sans-serif;
}

h1 {
  text-align: center;
  color: #333;
}

section {
  margin: 30px 0;
  padding: 20px;
  border: 1px solid #ddd;
  border-radius: 8px;
  background: #f9f9f9;
}

h2 {
  color: #444;
  margin-bottom: 20px;
}

.form-group {
  margin: 15px 0;
}

label {
  display: block;
  margin-bottom: 5px;
  font-weight: bold;
  color: #555;
}

input[type='file'],
input[type='number'],
input[type='text'],
textarea {
  width: 100%;
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  box-sizing: border-box;
}

textarea {
  resize: vertical;
  min-height: 100px;
}

button {
  background: #4caf50;
  color: white;
  padding: 10px 20px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 16px;
}

button:hover {
  background: #45a049;
}

button:disabled {
  background: #cccccc;
  cursor: not-allowed;
}

.result {
  margin-top: 20px;
  padding: 15px;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: white;
}

.result h3 {
  margin-top: 0;
  color: #333;
}

pre {
  background: #f5f5f5;
  padding: 10px;
  border-radius: 4px;
  overflow-x: auto;
}

.match-item {
  margin: 15px 0;
  padding: 10px;
  border: 1px solid #eee;
  border-radius: 4px;
  background: #fafafa;
}

.match-item h4 {
  margin-top: 0;
  color: #333;
}

.match-item p {
  margin: 5px 0;
}
</style>
