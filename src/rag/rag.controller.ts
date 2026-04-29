import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { IngestDocumentDto, RagChatDto, RagQueryDto } from './dto/rag-query.dto';
import { RagService } from './rag.service';

@ApiTags('RAG 知识库')
@Controller('rag')
export class RagController {
  constructor(private readonly ragService: RagService) {}

  @Post('documents/ingest')
  @ApiOperation({
    summary: '上传并向量化文档(PDF/Word/TXT/MD)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        chunkSize: { type: 'integer', minimum: 200, maximum: 4000 },
        chunkOverlap: { type: 'integer', minimum: 0, maximum: 1000 },
        source: { type: 'string' },
      },
      required: ['file'],
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async ingestDocument(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: IngestDocumentDto,
  ) {
    return this.ragService.ingestDocument(file, dto);
  }

  @Get('documents')
  @ApiOperation({ summary: '获取文档列表' })
  async listDocuments() {
    return this.ragService.listDocuments();
  }

  @Delete('documents/:id')
  @ApiOperation({ summary: '删除文档及其分块' })
  async deleteDocument(@Param('id') id: string) {
    return this.ragService.deleteDocument(id);
  }

  @Post('query')
  @ApiOperation({
    summary: '基于自然语言检索最相似的文档切片',
  })
  async query(@Body() dto: RagQueryDto) {
    return this.ragService.querySimilarChunks(dto);
  }

  @Post('chat')
  @ApiOperation({
    summary: 'RAG 知识库问答（检索+LLM生成回答）',
  })
  async chat(@Body() dto: RagChatDto) {
    return this.ragService.ragChat(dto);
  }

  @Post('chat/stream')
  @ApiOperation({
    summary: 'RAG 知识库问答（SSE 流式）',
  })
  async chatStream(@Body() dto: RagChatDto, @Res() res: Response) {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      send('meta', {
        model: process.env.AI_MODEL?.trim() || 'qwen3.5-122b-a10b',
        mode: 'rag',
      });

      await this.ragService.ragChatStream(dto, {
        onDelta: (delta) => send('delta', { text: delta }),
        onError: (message) => send('error', { message }),
        onDone: () => send('done', { ok: true }),
      });
    } catch (e) {
      send('error', { message: e instanceof Error ? e.message : String(e) });
    } finally {
      res.end();
    }
  }
}
