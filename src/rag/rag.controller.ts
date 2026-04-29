import {
  Body,
  Controller,
  Post,
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
import { IngestDocumentDto, RagQueryDto } from './dto/rag-query.dto';
import { RagService } from './rag.service';

@ApiTags('RAG 文档检索')
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

  @Post('query')
  @ApiOperation({
    summary: '基于自然语言检索最相似的文档切片',
  })
  async query(@Body() dto: RagQueryDto) {
    return this.ragService.querySimilarChunks(dto);
  }
}
