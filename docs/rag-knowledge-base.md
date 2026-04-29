# RAG 知识库模块详细设计文档

---

## 一、模块概述

### 1.1 定位与目标

RAG（Retrieval-Augmented Generation）知识库是本项目的核心功能模块，旨在实现：

| 目标 | 说明 |
|------|------|
| **文档管理** | 支持多种格式文档的上传、存储和管理 |
| **语义检索** | 基于向量相似度的智能文档检索 |
| **智能问答** | 结合 LLM 的知识库问答能力 |
| **私有化部署** | 数据本地化，保障信息安全 |

### 1.2 核心架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        RAG 知识库架构                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐            │
│   │  文档上传    │───>│  文本解析    │───>│  分块处理    │            │
│   └──────────────┘    └──────────────┘    └──────────────┘            │
│          │                                          │                  │
│          │                                          ▼                  │
│          │                                   ┌──────────────┐          │
│          │                                   │  Embedding   │          │
│          │                                   │  (1024维)    │          │
│          │                                   └──────────────┘          │
│          │                                          │                  │
│          │                                          ▼                  │
│          │                                   ┌──────────────┐          │
│          │                                   │  向量存储    │          │
│          │                                   │ (PostgreSQL) │          │
│          │                                   └──────────────┘          │
│          │                                          │                  │
│          │                                          ▼                  │
│          │                                   ┌──────────────┐          │
│          │                                   │  语义检索    │          │
│          │                                   │ (HNSW索引)   │          │
│          │                                   └──────────────┘          │
│          │                                          │                  │
│          │                                          ▼                  │
│          │                                   ┌──────────────┐          │
│          │                                   │  LLM 生成    │          │
│          │                                   │  (通义千问)  │          │
│          │                                   └──────────────┘          │
│          │                                          │                  │
│          ▼                                          ▼                  │
│   ┌──────────────┐                          ┌──────────────┐          │
│   │  文档列表    │                          │  智能回答    │          │
│   └──────────────┘                          └──────────────┘          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 二、核心技术实现

### 2.1 文档处理流程

#### 2.1.1 文件上传与解析

**支持格式**：
| 格式 | MIME 类型 | 解析库 | 说明 |
|------|-----------|--------|------|
| PDF | `application/pdf` | `pdf-parse` | 提取文本内容 |
| Word | `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | `mammoth` | DOC/DOCX 支持 |
| TXT | `text/plain` | 原生 | 直接读取 |
| Markdown | `text/markdown` | 原生 | 保留格式 |

**核心代码**（`src/rag/rag.service.ts`）：

```typescript
private async parseFileToText(file: Express.Multer.File): Promise<string> {
const fileExt = file.originalname.split('.').pop()?.toLowerCase() ?? '';
const mime = file.mimetype.toLowerCase();

if (mime.includes('pdf') || fileExt === 'pdf') {
    const pdf = require('pdf-parse');
    const data = await pdf(file.buffer);
    return data.text?.trim() ?? '';
}

if (mime.includes('word') || fileExt === 'docx' || fileExt === 'doc') {
    const parsed = await mammoth.extractRawText({ buffer: file.buffer });
    return parsed.value?.trim() ?? '';
}

if (mime.includes('text') || ['txt', 'md', 'markdown'].includes(fileExt)) {
    return file.buffer.toString('utf-8').trim();
}

throw new BadRequestException(
    `不支持的文件类型: ${file.mimetype || fileExt}`
);
}
```

#### 2.1.2 文本分块策略

**分块算法**：滑动窗口分块

```typescript
export function splitTextIntoChunks(
text: string,
options: { chunkSize: number; chunkOverlap: number }
): string[] {
const normalized = text.replace(/\r\n/g, '\n').trim();
const chunkSize = Math.max(200, options.chunkSize);
const chunkOverlap = Math.min(Math.max(0, options.chunkOverlap), chunkSize - 1);
const step = Math.max(1, chunkSize - chunkOverlap);
const chunks: string[] = [];

for (let start = 0; start < normalized.length; start += step) {
    const end = Math.min(normalized.length, start + chunkSize);
    const chunk = normalized.slice(start, end).trim();
    if (chunk.length > 0) {
    chunks.push(chunk);
    }
}

return chunks;
}
```

**参数配置**：

| 参数 | 默认值 | 范围 | 说明 |
|------|--------|------|------|
| `chunkSize` | 1000 | 200-4000 | 每个分块的字符数 |
| `chunkOverlap` | 150 | 0-1000 | 相邻分块重叠字符数 |

**分块策略设计原则**：
1. **语义完整性**：通过重叠确保上下文连贯性
2. **LLM 适配**：分块大小适配模型上下文窗口
3. **检索精度**：较小分块提高检索准确性

---

### 2.2 Embedding 生成

#### 2.2.1 模型选择

**生产级方案**：阿里云 DashScope `text-embedding-v3`

| 特性 | 说明 |
|------|------|
| 向量维度 | 1024 维（可配置） |
| 支持语言 | 中文、英文 |
| 语义理解 | 支持多义词、上下文理解 |
| 调用方式 | REST API |

**降级方案**：哈希嵌入（开发测试用）

```typescript
export function buildDeterministicEmbedding(
text: string,
dimension: number
): number[] {
const vec = new Array<number>(dimension).fill(0);
const tokens = text.toLowerCase().split(/\s+/).filter(Boolean);

for (const token of tokens) {
    let h = 2166136261; // FNV-1a 初始值
    for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 16777619); // FNV-1a 乘数
    }
    vec[Math.abs(h) % dimension] += 1;
}

const norm = Math.sqrt(vec.reduce((a, b) => a + b * b, 0));
return vec.map(v => Number((v / norm).toFixed(6)));
}
```

#### 2.2.2 API 调用封装

```typescript
export async function fetchEmbedding(texts: string[]): Promise<number[][]> {
const apiKey = process.env.DASHSCOPE_API_KEY ?? 'default-key';
const model = process.env.EMBEDDING_MODEL ?? 'text-embedding-v3';
const dimension = Number(process.env.RAG_EMBEDDING_DIM ?? '1024');

const response = await fetch(
    'https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings',
    {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
        model,
        input: texts,
        dimensions: dimension,
    }),
    }
);

const data = await response.json() as {
    data: { embedding: number[]; index: number }[];
};

return data.data.sort((a, b) => a.index - b.index).map(item => item.embedding);
}
```

**批量处理策略**：
- 每批最多 20 条文本
- 避免 API 限流
- 异步并行处理

---

### 2.3 向量存储

#### 2.3.1 数据库表设计

**rag_documents（文档表）**：

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | BIGSERIAL | PRIMARY KEY | 自增主键 |
| `filename` | TEXT | NOT NULL | 原始文件名 |
| `mime_type` | TEXT | NOT NULL | MIME 类型 |
| `source` | TEXT | NULL | 来源标识 |
| `content` | TEXT | NOT NULL | 完整文本内容 |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | 创建时间 |

**rag_chunks（分块表）**：

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | BIGSERIAL | PRIMARY KEY | 自增主键 |
| `document_id` | BIGINT | FOREIGN KEY | 关联文档 |
| `chunk_index` | INT | NOT NULL | 分块序号 |
| `content` | TEXT | NOT NULL | 分块内容 |
| `embedding` | VECTOR(1024) | NOT NULL | 向量表示 |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | 创建时间 |

#### 2.3.2 索引优化

**索引策略**：

| 索引名 | 字段 | 类型 | 作用 |
|--------|------|------|------|
| `rag_chunks_document_chunk_idx` | `document_id, chunk_index` | B-Tree | 文档分块查询 |
| `rag_chunks_embedding_idx` | `embedding` | HNSW | 向量相似度搜索 |

**HNSW 索引创建**：

```sql
CREATE INDEX rag_chunks_embedding_idx
ON rag_chunks
USING hnsw (embedding vector_cosine_ops);
```

**索引选择理由**：
- **HNSW vs IVFFlat**：HNSW 在小规模数据集上效果更好，查询速度更快
- **Cosine 相似度**：文本语义匹配首选余弦相似度

---

### 2.4 语义检索

#### 2.4.1 检索流程

```
用户提问 → 生成查询向量 → 向量相似度搜索 → 返回 Top-K 结果
```

**核心 SQL 查询**：

```typescript
const result = await client.query<RetrievedChunk>(
`SELECT
    c.id::text AS "chunkId",
    c.document_id::text AS "documentId",
    d.filename AS "filename",
    c.chunk_index AS "chunkIndex",
    c.content AS "content",
    1 - (c.embedding <=> $1::vector) AS "score"
FROM rag_chunks c
JOIN rag_documents d ON d.id = c.document_id
WHERE 1 - (c.embedding <=> $1::vector) >= $2
ORDER BY c.embedding <=> $1::vector
LIMIT $3`,
[queryVectorStr, minScore, topK]
);
```

**相似度计算**：
- 使用 pgvector 的 `<=>` 操作符（L2 距离）
- 转换为相似度分数：`1 - L2距离`
- 分数范围：0-1，越高越相似

#### 2.4.2 Redis 缓存集成

**缓存策略**：

| 缓存项 | Key 格式 | TTL | 失效时机 |
|--------|----------|-----|----------|
| 查询结果 | `rag:query:{hash}:k{topK}:s{minScore}` | 300秒 | 文档变更时 |

**缓存实现**：

```typescript
async querySimilarChunks(params: { question: string; topK?: number; minScore?: number }) {
const cacheKey = `rag:query:${this.hashText(params.question)}:k${topK}:s${minScore}`;
const cached = await this.redisService.get(cacheKey);

if (cached) {
    return JSON.parse(cached); // 命中缓存
}

// 查询逻辑...

await this.redisService.set(cacheKey, JSON.stringify(response), 300);
return response;
}
```

**缓存失效机制**：

```typescript
private async invalidateRagCache() {
const client = this.redisService['client'];
if (client) {
    const keys = await client.keys('rag:query:*');
    if (keys.length > 0) {
    await client.del(...keys);
    }
}
}
```

---

### 2.5 RAG 问答

#### 2.5.1 同步问答接口

**接口**：`POST /rag/chat`

**请求参数**：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `question` | string | 是 | - | 用户问题 |
| `topK` | number | 否 | 5 | 返回分块数 |
| `minScore` | number | 否 | 0.3 | 最低相似度 |
| `systemPrompt` | string | 否 | 默认模板 | 系统提示词 |

**系统提示词模板**：

```typescript
const systemPrompt = `你是一个基于知识库的智能助手。请根据以下检索到的文档内容回答用户的问题。
如果文档内容中没有相关信息，请如实说明，不要编造。
回答时请引用来源文档。

---检索到的文档内容---
${contextText}
---文档内容结束---`;
```

**响应示例**：

```json
{
"code": 200,
"msg": "success",
"data": {
    "question": "NestJS 是什么？",
    "answer": "NestJS 是一个用于构建高效、可扩展的 Node.js 服务器端应用程序的框架...",
    "sources": [
    {
        "filename": "nestjs-intro.md",
        "chunkIndex": 0,
        "score": 0.74,
        "snippet": "NestJS 是一个渐进式 Node.js 框架..."
    }
    ],
    "matchCount": 3
}
}
```

#### 2.5.2 SSE 流式问答

**接口**：`POST /rag/chat/stream`

**响应格式**（SSE）：

```
event: meta
data: {"model": "qwen3.5-122b-a10b", "mode": "rag"}

event: delta
data: {"text": "NestJS"}

event: delta
data: {"text": " 是一个"}

event: delta
data: {"text": " 基于 TypeScript 的"}

event: done
data: {"ok": true}
```

**流式处理优势**：
- 降低感知延迟
- 实时显示回答进度
- 减少前端等待时间

---

## 三、API 接口详细说明

### 3.1 文档管理接口

#### 3.1.1 上传文档

**接口**：`POST /rag/documents/ingest`

**Content-Type**：`multipart/form-data`

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `file` | File | 是 | 文档文件 |
| `chunkSize` | number | 否 | 分块大小 |
| `chunkOverlap` | number | 否 | 重叠大小 |
| `source` | string | 否 | 来源标识 |

**成功响应**（200）：

```json
{
"code": 200,
"msg": "success",
"data": {
    "documentId": "1",
    "filename": "test.md",
    "chunkCount": 5,
    "totalChars": 3500,
    "embeddingModel": "text-embedding-v3",
    "chunkSize": 1000,
    "chunkOverlap": 150
}
}
```

#### 3.1.2 获取文档列表

**接口**：`GET /rag/documents`

**成功响应**（200）：

```json
{
"code": 200,
"msg": "success",
"data": [
    {
    "id": "1",
    "filename": "test.md",
    "mimeType": "text/markdown",
    "source": null,
    "createdAt": "2024-01-01T10:00:00Z",
    "chunkCount": 5
    }
]
}
```

#### 3.1.3 删除文档

**接口**：`DELETE /rag/documents/:id`

**路径参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| `id` | string | 文档 ID |

**成功响应**（200）：

```json
{
"code": 200,
"msg": "success",
"data": {
    "deleted": true,
    "documentId": "1"
}
}
```

### 3.2 检索接口

#### 3.2.1 语义检索

**接口**：`POST /rag/query`

**请求体**：

```json
{
"question": "NestJS 是什么？",
"topK": 5,
"minScore": 0.0
}
```

**成功响应**（200）：

```json
{
"code": 200,
"msg": "success",
"data": {
    "question": "NestJS 是什么？",
    "topK": 5,
    "minScore": 0.0,
    "matchCount": 3,
    "matches": [
    {
        "chunkId": "1",
        "documentId": "1",
        "filename": "test.md",
        "chunkIndex": 0,
        "content": "NestJS 是一个...",
        "score": 0.74
    }
    ]
}
}
```

### 3.3 问答接口

#### 3.3.1 同步问答

**接口**：`POST /rag/chat`

**请求体**：

```json
{
"question": "NestJS 的核心特性有哪些？",
"topK": 5,
"minScore": 0.3
}
```

**成功响应**（200）：

```json
{
"code": 200,
"msg": "success",
"data": {
    "question": "NestJS 的核心特性有哪些？",
    "answer": "NestJS 的核心特性包括：模块化架构、依赖注入、TypeScript 支持...",
    "sources": [
    {
        "filename": "test.md",
        "chunkIndex": 0,
        "score": 0.74,
        "snippet": "NestJS 采用模块化架构..."
    }
    ],
    "matchCount": 3
}
}
```

#### 3.3.2 流式问答

**接口**：`POST /rag/chat/stream`

**请求体**：同同步接口

**成功响应**（SSE）：

```
event: meta
data: {"model": "qwen3.5-122b-a10b", "mode": "rag"}

event: delta
data: {"text": "NestJS"}

event: delta
data: {"text": " 的核心特性包括"}

event: done
data: {"ok": true}
```

---

## 四、前端集成

### 4.1 页面结构

**知识库页面**（`/admin/rag`）包含三个标签页：

#### 4.1.1 文档管理标签

| 功能 | 说明 |
|------|------|
| 文档上传 | 支持 PDF/Word/TXT/MD |
| 文档列表 | 展示所有已上传文档 |
| 分块配置 | chunkSize/chunkOverlap |
| 删除文档 | 级联删除分块 |

**核心组件**：

```vue
<a-upload
:before-upload="handleBeforeUpload"
:show-upload-list="false"
accept=".pdf,.doc,.docx,.txt,.md"
>
<a-button type="primary">上传文档</a-button>
</a-upload>
```

#### 4.1.2 知识库问答标签

| 功能 | 说明 |
|------|------|
| 消息输入 | 支持回车发送 |
| 消息历史 | 展示对话记录 |
| 流式显示 | SSE 实时推送 |
| 思考动画 | 打字效果提示 |

**SSE 处理**：

```typescript
const reader = res.body.getReader();
const decoder = new TextDecoder('utf-8');
let buffer = '';

while (true) {
const { done, value } = await reader.read();
if (done) break;
buffer += decoder.decode(value, { stream: true });
const events = buffer.split('\n\n');

for (const event of events) {
    // 解析 event 和 data
    // 更新 UI
}
}
```

#### 4.1.3 语义检索标签

| 功能 | 说明 |
|------|------|
| 关键词输入 | 支持回车检索 |
| 结果列表 | 展示匹配分块 |
| 得分显示 | 相似度分数 |
| 内容预览 | 分块内容摘要 |

---

## 五、配置与部署

### 5.1 环境变量

```bash
# RAG 配置
RAG_EMBEDDING_DIM=1024              # 向量维度
RAG_USE_REAL_EMBEDDING=true         # 是否使用真实 Embedding

# AI 配置
DASHSCOPE_API_KEY=your-api-key      # DashScope API 密钥
EMBEDDING_MODEL=text-embedding-v3   # Embedding 模型
AI_MODEL=qwen3.5-122b-a10b         # LLM 模型

# 数据库
DATABASE_URL=postgresql://user:pass@localhost:5432/db

# Redis（缓存）
REDIS_HOST=localhost
REDIS_PORT=6379
```

### 5.2 启动步骤

```bash
# 1. 确保 PostgreSQL + pgvector 已安装
# 2. 配置环境变量
# 3. 启动服务
pnpm run start:dev

# 4. 访问前端
http://localhost:5173/admin/rag
```

### 5.3 测试验证

**验证步骤**：

1. **上传文档**：
    ```bash
    curl -X POST http://localhost:3000/rag/documents/ingest \
    -F "file=@test.md"
    ```

2. **语义检索**：
    ```bash
    curl -X POST http://localhost:3000/rag/query \
    -H "Content-Type: application/json" \
    -d '{"question": "NestJS 是什么"}'
    ```

3. **RAG 问答**：
    ```bash
    curl -X POST http://localhost:3000/rag/chat \
    -H "Content-Type: application/json" \
    -d '{"question": "NestJS 的核心特性"}'
    ```

---

## 六、性能优化

### 6.1 索引优化

| 优化项 | 说明 |
|--------|------|
| HNSW 索引 | 向量搜索速度提升 10x+ |
| 禁用索引扫描 | 小规模数据时强制顺序扫描 |
| 批量插入 | 减少事务开销 |

### 6.2 缓存策略

| 缓存项 | 收益 |
|--------|------|
| 查询结果缓存 | 重复查询直接返回 |
| 文档变更失效 | 保证数据一致性 |
| 5 分钟 TTL | 平衡缓存命中率和数据新鲜度 |

### 6.3 异步处理

| 优化项 | 说明 |
|--------|------|
| 批量 Embedding | 减少 API 调用次数 |
| 流式响应 | 降低前端等待时间 |
| 事务管理 | 保证数据完整性 |

---

## 七、安全考虑

### 7.1 文件上传安全

| 措施 | 说明 |
|------|------|
| 文件类型白名单 | 仅允许 PDF/Word/TXT/MD |
| 文件大小限制 | 防止超大文件攻击 |
| 文件名过滤 | 去除特殊字符 |

### 7.2 数据保护

| 措施 | 说明 |
|------|------|
| 私有化部署 | 数据本地存储 |
| 权限控制 | JWT 认证 |
| 日志脱敏 | 不记录敏感内容 |

---

## 八、扩展方向

### 8.1 功能扩展

| 方向 | 说明 |
|------|------|
| 文档版本管理 | 支持文档更新和历史回溯 |
| 多模态支持 | 图片、表格解析 |
| 知识库统计 | 文档使用情况分析 |

### 8.2 性能扩展

| 方向 | 说明 |
|------|------|
| 分布式向量检索 | 支持大规模数据 |
| 增量更新 | 支持文档增量索引 |
| 模型微调 | 领域特定优化 |

---

*文档生成时间：2026-04-29*