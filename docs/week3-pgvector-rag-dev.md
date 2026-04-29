# 第 3 周任务交付：PGVector + 向量嵌入（RAG 基础）

## 1. 目标与交付范围

本次交付对齐你给出的第 3 周目标，完成了以下能力：

1. **PGVector 安装与建表初始化**：服务启动时自动执行 `CREATE EXTENSION IF NOT EXISTS vector`，并创建 RAG 文档表与切片表。  
2. **文档解析**：支持上传 `PDF / DOC / DOCX / TXT / MD`，自动提取纯文本。  
3. **向量嵌入与存储**：文本切片后生成 embedding，写入 PostgreSQL（`vector` 类型列）。  
4. **向量检索**：支持自然语言查询，按余弦距离检索最相似切片。  
5. **基础单元测试**：覆盖分块、embedding 稳定性、向量字面量格式。  

---

## 2. 代码结构

新增文件如下：

- `src/rag/rag.controller.ts`：RAG 接口层（文档入库 + 语义检索）
- `src/rag/rag.service.ts`：核心业务（解析、分块、向量化、入库、检索）
- `src/rag/rag.utils.ts`：纯函数工具（切片、embedding、vector 字面量）
- `src/rag/dto/rag-query.dto.ts`：请求参数校验 DTO
- `src/rag/rag.utils.spec.ts`：单元测试
- `docs/week3-pgvector-rag-dev.md`：本开发文档

同时更新：

- `src/app.module.ts`：注册 `RagController` / `RagService`
- `package.json`：新增依赖 `pdf-parse`、`mammoth`

---

## 3. 技术实现说明

## 3.1 数据库层（PostgreSQL + pgvector）

`RagService.onModuleInit()` 会自动执行 schema 初始化：

- `CREATE EXTENSION IF NOT EXISTS vector`
- 创建 `rag_documents`：
  - `id`
  - `filename`
  - `mime_type`
  - `source`
  - `content`
  - `created_at`
- 创建 `rag_chunks`：
  - `id`
  - `document_id`
  - `chunk_index`
  - `content`
  - `embedding VECTOR(<dim>)`
  - `created_at`

索引：

- `rag_chunks_document_chunk_idx`（文档内顺序索引）
- `rag_chunks_embedding_idx`（`ivfflat + vector_cosine_ops`）

embedding 维度由环境变量控制：

- `RAG_EMBEDDING_DIM`（默认 `256`）

---

## 3.2 文档解析

按 MIME 或扩展名路由：

- PDF：`pdf-parse`
- Word：`mammoth`
- TXT / MD：UTF-8 文本读取

不支持格式会返回 `400 BadRequest`。

---

## 3.3 分块策略

使用滑窗分块：

- `chunkSize` 默认 `1000`
- `chunkOverlap` 默认 `150`
- 步长 `step = chunkSize - chunkOverlap`

通过重叠区域提高跨段语义召回。

---

## 3.4 向量生成策略

当前版本使用**确定性本地 embedding**（哈希词袋 + L2 归一化），优点：

- 无外部服务依赖，开发环境可立即跑通
- 同一文本 embedding 稳定可复现

后续可平滑替换为真实 embedding API（如 DashScope/OpenAI）：

- 在 `rag.service.ts` 中替换 `buildDeterministicEmbedding()` 调用即可
- 数据库结构无需改动（仍为 `vector` 列）

---

## 3.5 检索策略

查询流程：

1. 对 `question` 生成 query embedding  
2. SQL 执行 `ORDER BY embedding <=> query_vector`（余弦距离）  
3. 返回 `score = 1 - distance`  
4. 支持 `topK`、`minScore` 过滤

---

## 4. API 说明（Swagger 可见）

## 4.1 文档入库

- `POST /rag/documents/ingest`
- `multipart/form-data`
- 字段：
  - `file`（必填）
  - `chunkSize`（可选，200~4000）
  - `chunkOverlap`（可选，0~1000）
  - `source`（可选）

返回：

- `documentId`
- `filename`
- `chunkCount`
- `totalChars`
- `chunkSize`
- `chunkOverlap`

## 4.2 语义检索

- `POST /rag/query`
- JSON 参数：
  - `question`（必填）
  - `topK`（可选，默认 5）
  - `minScore`（可选，默认 0）

返回：

- `matchCount`
- `matches[]`（包含文档名、切片内容、得分等）

---

## 5. 本地运行步骤

1. 启动数据库（确保 PostgreSQL 可连接且支持安装扩展）  
2. 配置 `DATABASE_URL`  
3. 启动项目：

```bash
pnpm run start:dev:api
```

4. 访问 Swagger：

- [http://localhost:3000/api](http://localhost:3000/api)

---

## 6. 测试与验收标准（什么才算完成）

以下全部通过，才算“第 3 周任务完成”：

### A. 基础能力验收

1. 服务启动日志无 pgvector 初始化错误  
2. 数据库中存在 `rag_documents`、`rag_chunks` 表  
3. 数据库已启用 `vector` 扩展

### B. 文档入库验收

1. 上传 1 个 PDF/Word 文档成功  
2. 返回 `chunkCount > 0`  
3. `rag_documents` 新增 1 条记录  
4. `rag_chunks` 新增 N 条切片记录（N = chunkCount）

### C. 向量检索验收

1. 使用文档相关问题调用 `/rag/query` 成功  
2. 返回 `matchCount > 0`  
3. `matches[0].score` 在 `[0, 1]` 范围  
4. Top1 内容与问题语义相关（人工抽检）

### D. 自动化测试验收

执行：

```bash
pnpm test -- rag.utils.spec.ts
```

应全部通过，覆盖：

- 分块重叠逻辑正确
- embedding 结果稳定可复现
- pgvector 字面量格式正确

### E. 稳定性与边界验收

1. 上传空文件应返回 400  
2. 上传不支持类型（如 xlsx）应返回 400  
3. 传入非法参数（如 `topK = 1000`）应触发 DTO 校验错误

---

## 7. 后续优化建议（第 4 周可做）

1. 对接真实 embedding 模型（千问向量模型/OpenAI text-embedding-3）  
2. 引入 ANN 参数调优（`lists`、`probes`）  
3. 增加“文档删除/重建索引”接口  
4. 增加基于检索结果的答案生成（RAG generation）  
5. 建立端到端评测集（命中率、MRR、召回率）

---

## 8. 风险与说明

1. `ivfflat` 索引在低数据量时收益不明显，量大时才体现性能优势。  
2. 当前 embedding 为教学版本地算法，语义效果不如商用模型，但流程完整。  
3. 若数据库用户权限不足，`CREATE EXTENSION vector` 可能失败，需要 DBA 先安装。
