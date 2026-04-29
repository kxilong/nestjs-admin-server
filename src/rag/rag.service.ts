import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import { Pool } from 'pg';
import {
  buildDeterministicEmbedding,
  fetchEmbedding,
  splitTextIntoChunks,
  vectorToSqlLiteral,
} from './rag.utils';
import { RedisService } from '../redis/redis.service';

type RetrievedChunk = {
  chunkId: string;
  documentId: string;
  filename: string;
  chunkIndex: number;
  content: string;
  score: number;
};

@Injectable()
export class RagService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RagService.name);
  private readonly pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  private readonly embeddingDimension = Math.max(
    64,
    Number.parseInt(process.env.RAG_EMBEDDING_DIM ?? '1024', 10) || 1024,
  );

  private get useRealEmbedding(): boolean {
    return process.env.RAG_USE_REAL_EMBEDDING !== 'false';
  }

  constructor(private readonly redisService: RedisService) {}

  async onModuleInit() {
    await this.ensureVectorSchema();
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  private async embedTexts(texts: string[]): Promise<number[][]> {
    if (!this.useRealEmbedding) {
      return texts.map((t) =>
        buildDeterministicEmbedding(t, this.embeddingDimension),
      );
    }

    const batchSize = 20;
    const results: number[][] = [];
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const embeddings = await fetchEmbedding(batch);
      results.push(...embeddings);
    }
    return results;
  }

  async ingestDocument(
    file: Express.Multer.File,
    options?: { chunkSize?: number; chunkOverlap?: number; source?: string },
  ) {
    if (!file) {
      throw new BadRequestException('请上传文件');
    }

    const content = await this.parseFileToText(file);
    const chunks = splitTextIntoChunks(content, {
      chunkSize: options?.chunkSize ?? 1000,
      chunkOverlap: options?.chunkOverlap ?? 150,
    });

    if (chunks.length === 0) {
      throw new BadRequestException('文档内容为空，无法向量化');
    }

    const embeddings = await this.embedTexts(chunks);

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const insertedDoc = await client.query<{ id: string }>(
        `INSERT INTO rag_documents(filename, mime_type, source, content)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [file.originalname, file.mimetype, options?.source ?? null, content],
      );
      const documentId = insertedDoc.rows[0]?.id;

      for (let i = 0; i < chunks.length; i += 1) {
        await client.query(
          `INSERT INTO rag_chunks(document_id, chunk_index, content, embedding)
           VALUES ($1, $2, $3, $4::vector)`,
          [documentId, i, chunks[i], vectorToSqlLiteral(embeddings[i])],
        );
      }
      await client.query('COMMIT');

      await this.invalidateRagCache();

      return {
        documentId,
        filename: file.originalname,
        chunkCount: chunks.length,
        totalChars: content.length,
        embeddingModel: this.useRealEmbedding
          ? process.env.EMBEDDING_MODEL?.trim() || 'text-embedding-v3'
          : 'hash-embedding',
        chunkSize: options?.chunkSize ?? 1000,
        chunkOverlap: options?.chunkOverlap ?? 150,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw new InternalServerErrorException(
        `文档入库失败: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      client.release();
    }
  }

  async querySimilarChunks(params: {
    question: string;
    topK?: number;
    minScore?: number;
  }) {
    const topK = params.topK ?? 5;
    const minScore = params.minScore ?? 0;

    const cacheKey = `rag:query:${this.hashText(params.question)}:k${topK}:s${minScore}`;
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        // cache corrupt, re-query
      }
    }

    const [queryEmbedding] = await this.embedTexts([params.question]);
    const queryVectorStr = vectorToSqlLiteral(queryEmbedding);

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL enable_indexscan = off');
      await client.query('SET LOCAL enable_seqscan = on');

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
        [queryVectorStr, minScore, topK],
      );
      await client.query('COMMIT');

      const response = {
        question: params.question,
        topK,
        minScore,
        matchCount: result.rowCount,
        matches: result.rows.map((row) => ({
          ...row,
          score: Number(row.score.toFixed(4)),
        })),
      };

      await this.redisService.set(cacheKey, JSON.stringify(response), 300);

      return response;
    } finally {
      client.release();
    }
  }

  async ragChat(params: {
    question: string;
    topK?: number;
    minScore?: number;
    systemPrompt?: string;
  }) {
    const topK = params.topK ?? 5;
    const minScore = params.minScore ?? 0.3;

    const retrievalResult = await this.querySimilarChunks({
      question: params.question,
      topK,
      minScore,
    });

    const contextText = retrievalResult.matches
      .map((m, i) => `[文档${i + 1}: ${m.filename}]\n${m.content}`)
      .join('\n\n---\n\n');

    const systemPrompt =
      params.systemPrompt?.trim() ||
      `你是一个基于知识库的智能助手。请根据以下检索到的文档内容回答用户的问题。
如果文档内容中没有相关信息，请如实说明，不要编造。
回答时请引用来源文档。

---检索到的文档内容---
${contextText}
---文档内容结束---`;

    const apiKey =
      process.env.DASHSCOPE_API_KEY?.trim() ||
      'sk-1bac273fa90c46fea36db007ace65ab9';
    const model = process.env.AI_MODEL?.trim() || 'qwen3.5-122b-a10b';
    const apiUrl =
      process.env.DASHSCOPE_BASE_URL?.trim() ||
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

    const llmResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: params.question },
        ],
      }),
    });

    if (!llmResponse.ok) {
      const errText = await llmResponse.text().catch(() => '');
      throw new InternalServerErrorException(
        `LLM 请求失败(${llmResponse.status}): ${errText}`,
      );
    }

    const llmData = (await llmResponse.json()) as {
      choices: { message: { content: string } }[];
    };
    const answer = llmData.choices?.[0]?.message?.content ?? '（模型未返回内容）';

    return {
      question: params.question,
      answer,
      sources: retrievalResult.matches.map((m) => ({
        filename: m.filename,
        chunkIndex: m.chunkIndex,
        score: m.score,
        snippet: m.content.slice(0, 200),
      })),
      matchCount: retrievalResult.matchCount,
    };
  }

  async ragChatStream(
    params: {
      question: string;
      topK?: number;
      minScore?: number;
      systemPrompt?: string;
    },
    handlers: {
      onDelta: (delta: string) => void;
      onDone: () => void;
      onError: (message: string) => void;
    },
  ) {
    const topK = params.topK ?? 5;
    const minScore = params.minScore ?? 0.3;

    let retrievalResult;
    try {
      retrievalResult = await this.querySimilarChunks({
        question: params.question,
        topK,
        minScore,
      });
    } catch (e) {
      handlers.onError(
        `检索失败: ${e instanceof Error ? e.message : String(e)}`,
      );
      handlers.onDone();
      return;
    }

    const contextText = retrievalResult.matches
      .map((m, i) => `[文档${i + 1}: ${m.filename}]\n${m.content}`)
      .join('\n\n---\n\n');

    const systemPrompt =
      params.systemPrompt?.trim() ||
      `你是一个基于知识库的智能助手。请根据以下检索到的文档内容回答用户的问题。
如果文档内容中没有相关信息，请如实说明，不要编造。
回答时请引用来源文档。

---检索到的文档内容---
${contextText}
---文档内容结束---`;

    const apiKey =
      process.env.DASHSCOPE_API_KEY?.trim() ||
      'sk-1bac273fa90c46fea36db007ace65ab9';
    const model = process.env.AI_MODEL?.trim() || 'qwen3.5-122b-a10b';
    const apiUrl =
      process.env.DASHSCOPE_BASE_URL?.trim() ||
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        stream: true,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: params.question },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      handlers.onError(`LLM 请求失败(${response.status}): ${errText}`);
      handlers.onDone();
      return;
    }

    if (!response.body) {
      handlers.onError('LLM 返回为空流');
      handlers.onDone();
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });

      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';

      for (const event of events) {
        const lines = event
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l.startsWith('data:'));

        for (const line of lines) {
          const data = line.slice(5).trim();
          if (!data) {
            continue;
          }
          if (data === '[DONE]') {
            handlers.onDone();
            return;
          }

          try {
            const parsed = JSON.parse(data) as {
              choices?: { delta?: { content?: string } }[];
            };
            const delta = parsed.choices?.[0]?.delta?.content ?? '';
            if (delta) {
              handlers.onDelta(delta);
            }
          } catch {
            // ignore malformed chunk
          }
        }
      }
    }

    handlers.onDone();
  }

  async listDocuments() {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT
          d.id::text AS id,
          d.filename,
          d.mime_type AS "mimeType",
          d.source,
          d.created_at AS "createdAt",
          COUNT(c.id)::int AS "chunkCount"
        FROM rag_documents d
        LEFT JOIN rag_chunks c ON c.document_id = d.id
        GROUP BY d.id
        ORDER BY d.created_at DESC
      `);
      return result.rows;
    } finally {
      client.release();
    }
  }

  async deleteDocument(documentId: string) {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'DELETE FROM rag_documents WHERE id = $1::bigint RETURNING id',
        [documentId],
      );
      if (result.rowCount === 0) {
        throw new BadRequestException('文档不存在');
      }
      await this.invalidateRagCache();
      return { deleted: true, documentId };
    } finally {
      client.release();
    }
  }

  private async invalidateRagCache() {
    if (!this.redisService.enabled) {
      return;
    }
    try {
      const client = this.redisService['client'];
      if (client) {
        const keys = await client.keys('rag:query:*');
        if (keys.length > 0) {
          await client.del(...keys);
        }
      }
    } catch {
      // ignore cache invalidation errors
    }
  }

  private hashText(text: string): string {
    let h = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
  }

  private async ensureVectorSchema() {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('CREATE EXTENSION IF NOT EXISTS vector');
      await client.query(`
        CREATE TABLE IF NOT EXISTS rag_documents (
          id BIGSERIAL PRIMARY KEY,
          filename TEXT NOT NULL,
          mime_type TEXT NOT NULL,
          source TEXT NULL,
          content TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS rag_chunks (
          id BIGSERIAL PRIMARY KEY,
          document_id BIGINT NOT NULL REFERENCES rag_documents(id) ON DELETE CASCADE,
          chunk_index INT NOT NULL,
          content TEXT NOT NULL,
          embedding VECTOR(${this.embeddingDimension}) NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS rag_chunks_document_chunk_idx
          ON rag_chunks(document_id, chunk_index)
      `);
      await client.query(`DROP INDEX IF EXISTS rag_chunks_embedding_idx`);
      await client.query(`
        CREATE INDEX IF NOT EXISTS rag_chunks_embedding_idx
          ON rag_chunks
          USING hnsw (embedding vector_cosine_ops)
      `);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw new InternalServerErrorException(
        `初始化 pgvector 失败: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      client.release();
    }
  }

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
      `不支持的文件类型: ${file.mimetype || fileExt}。仅支持 PDF/Word/TXT/MD`,
    );
  }
}
