import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import { Pool } from 'pg';
import {
  buildDeterministicEmbedding,
  splitTextIntoChunks,
  vectorToSqlLiteral,
} from './rag.utils';

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
  private readonly pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  private readonly embeddingDimension = Math.max(
    64,
    Number.parseInt(process.env.RAG_EMBEDDING_DIM ?? '256', 10) || 256,
  );

  async onModuleInit() {
    await this.ensureVectorSchema();
  }

  async onModuleDestroy() {
    await this.pool.end();
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
        const chunk = chunks[i];
        const embedding = buildDeterministicEmbedding(
          chunk,
          this.embeddingDimension,
        );
        await client.query(
          `INSERT INTO rag_chunks(document_id, chunk_index, content, embedding)
           VALUES ($1, $2, $3, $4::vector)`,
          [documentId, i, chunk, vectorToSqlLiteral(embedding)],
        );
      }
      await client.query('COMMIT');

      return {
        documentId,
        filename: file.originalname,
        chunkCount: chunks.length,
        totalChars: content.length,
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
    const queryVector = buildDeterministicEmbedding(
      params.question,
      this.embeddingDimension,
    );
    const queryVectorStr = vectorToSqlLiteral(queryVector);

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

      return {
        question: params.question,
        topK,
        minScore,
        matchCount: result.rowCount,
        matches: result.rows.map((row) => ({
          ...row,
          score: Number(row.score.toFixed(4)),
        })),
      };
    } finally {
      client.release();
    }
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
