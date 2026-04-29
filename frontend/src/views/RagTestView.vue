<template>
  <div class="rag-test">
    <h1>RAG 功能测试</h1>

    <!-- 文档上传 -->
    <section class="upload-section">
      <h2>1. 文档上传</h2>
      <div class="form-group">
        <label>选择文件 (PDF/Word/TXT/MD)</label>
        <input
          type="file"
          ref="fileInput"
          @change="handleFileChange"
          accept=".pdf,.doc,.docx,.txt,.md"
        />
        <div v-if="selectedFile" class="file-info">
          已选择: {{ selectedFile.name }}
        </div>
      </div>

      <div class="form-group">
        <label>Chunk Size</label>
        <input
          type="number"
          v-model.number="uploadForm.chunkSize"
          min="200"
          max="4000"
        />
      </div>

      <div class="form-group">
        <label>Chunk Overlap</label>
        <input
          type="number"
          v-model.number="uploadForm.chunkOverlap"
          min="0"
          max="1000"
        />
      </div>

      <div class="form-group">
        <label>Source (可选)</label>
        <input type="text" v-model="uploadForm.source" placeholder="文件来源" />
      </div>

      <button
        class="btn-primary"
        @click="uploadDocument"
        :disabled="isUploading"
      >
        {{ isUploading ? '上传中...' : '上传文档' }}
      </button>

      <div v-if="uploadResult" class="result-card">
        <h3>上传结果</h3>
        <pre>{{ JSON.stringify(uploadResult, null, 2) }}</pre>
      </div>
    </section>

    <!-- 语义检索 -->
    <section class="query-section">
      <h2>2. 语义检索</h2>
      <div class="form-group">
        <label>问题</label>
        <textarea
          v-model="queryForm.question"
          rows="3"
          placeholder="输入与上传文档相关的问题..."
        ></textarea>
      </div>

      <div class="form-group">
        <label>Top K</label>
        <input
          type="number"
          v-model.number="queryForm.topK"
          min="1"
          max="100"
        />
      </div>

      <div class="form-group">
        <label>Min Score</label>
        <input
          type="number"
          v-model.number="queryForm.minScore"
          min="0"
          max="1"
          step="0.1"
        />
      </div>

      <button
        class="btn-primary"
        @click="queryDocuments"
        :disabled="isQuerying"
      >
        {{ isQuerying ? '查询中...' : '查询' }}
      </button>

      <div v-if="queryResult" class="result-card">
        <h3>查询结果</h3>
        <div v-if="queryResult.matchCount > 0">
          <p>找到 {{ queryResult.matchCount }} 个匹配</p>
          <div
            v-for="(match, index) in queryResult.matches"
            :key="index"
            class="match-item"
          >
            <h4>匹配 {{ index + 1 }} (得分: {{ match.score.toFixed(2) }})</h4>
            <p><strong>文档:</strong> {{ match.filename }}</p>
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

const fileInput = ref<HTMLInputElement | null>(null);

const selectedFile = ref<File | null>(null);
const uploadForm = ref({
  chunkSize: 1000,
  chunkOverlap: 150,
  source: '',
});
const isUploading = ref(false);
const uploadResult = ref<any>(null);

const queryForm = ref({
  question: '',
  topK: 5,
  minScore: 0,
});
const isQuerying = ref(false);
const queryResult = ref<any>(null);

const handleFileChange = (event: Event) => {
  const target = event.target as HTMLInputElement;
  if (target.files && target.files.length > 0) {
    selectedFile.value = target.files[0];
  }
};

const uploadDocument = async () => {
  if (!selectedFile.value) {
    alert('请选择文件');
    return;
  }

  isUploading.value = true;
  uploadResult.value = null;

  try {
    const formData = new FormData();
    formData.append('file', selectedFile.value);
    formData.append('chunkSize', uploadForm.value.chunkSize.toString());
    formData.append('chunkOverlap', uploadForm.value.chunkOverlap.toString());
    if (uploadForm.value.source) {
      formData.append('source', uploadForm.value.source);
    }

    console.log('准备上传文件:', selectedFile.value.name);
    console.log('上传参数:', {
      chunkSize: uploadForm.value.chunkSize,
      chunkOverlap: uploadForm.value.chunkOverlap,
      source: uploadForm.value.source,
    });

    const response = await fetch('http://localhost:3000/rag/documents/ingest', {
      method: 'POST',
      body: formData,
    });

    console.log('上传响应状态:', response.status);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`上传失败: ${errorData.msg || response.statusText}`);
    }

    uploadResult.value = await response.json();
    console.log('上传成功:', uploadResult.value);
  } catch (error: any) {
    console.error('上传错误:', error);
    alert('上传失败: ' + error.message);
  } finally {
    isUploading.value = false;
  }
};

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

    const json = await response.json();
    queryResult.value = json.data || json;
  } catch (error: any) {
    console.error('查询错误:', error);
    alert('查询失败: ' + error.message);
  } finally {
    isQuerying.value = false;
  }
};
</script>

<style scoped>
.rag-test {
  padding: 20px 0;
  max-width: 800px;
}

h1 {
  color: #333;
  margin-bottom: 30px;
  text-align: center;
}

section {
  margin: 40px 0;
  padding: 20px;
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  background: #fafafa;
}

h2 {
  color: #444;
  margin-bottom: 20px;
  font-size: 18px;
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
  min-height: 80px;
}

.btn-primary {
  background: #1890ff;
  color: white;
  padding: 10px 20px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  margin-top: 10px;
}

.btn-primary:hover {
  background: #40a9ff;
}

.btn-primary:disabled {
  background: #cccccc;
  cursor: not-allowed;
}

.file-info {
  margin-top: 10px;
  color: #666;
}

.result-card {
  margin-top: 20px;
  padding: 15px;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: white;
}

.result-card h3 {
  margin-top: 0;
  color: #333;
}

.result-card pre {
  background: #f5f5f5;
  padding: 15px;
  border-radius: 4px;
  overflow-x: auto;
  font-size: 14px;
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
