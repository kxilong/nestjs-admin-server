import { Body, Controller, Post, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Authorize } from '../rbac/permissions.decorator';
import { ChatStreamDto } from './dto/chat-stream.dto';
import { AiService } from './ai.service';

@ApiTags('AI 对话')
@ApiBearerAuth('access-token')
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('chat/stream')
  @Authorize('system:ai:chat')
  async streamChat(@Body() dto: ChatStreamDto, @Res() res: Response) {
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
      });

      await this.aiService.streamChat(dto.prompt, dto.systemPrompt, {
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
