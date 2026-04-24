import { Injectable } from '@nestjs/common';

const DASHSCOPE_API_KEY_FALLBACK = 'sk-1bac273fa90c46fea36db007ace65ab9';

type StreamHandlers = {
  onDelta: (delta: string) => void;
  onDone: () => void;
  onError: (message: string) => void;
};

@Injectable()
export class AiService {
  async streamChat(
    prompt: string,
    systemPrompt: string | undefined,
    handlers: StreamHandlers,
  ): Promise<void> {
    // 优先环境变量；若部署环境未正确注入，则使用硬编码兜底 key。
    const apiKey =
      process.env.DASHSCOPE_API_KEY?.trim() || DASHSCOPE_API_KEY_FALLBACK;
    if (!apiKey) {
      handlers.onError('未配置 DASHSCOPE_API_KEY');
      handlers.onDone();
      return;
    }

    const model = process.env.AI_MODEL?.trim() || 'qwen3.5-122b-a10b';
    const apiUrl =
      process.env.DASHSCOPE_BASE_URL?.trim() ||
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

    const body = {
      model,
      stream: true,
      messages: [
        ...(systemPrompt?.trim()
          ? [{ role: 'system', content: systemPrompt.trim() }]
          : []),
        { role: 'user', content: prompt },
      ],
    };

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      handlers.onError(`模型请求失败(${response.status}): ${errText || '未知错误'}`);
      handlers.onDone();
      return;
    }

    if (!response.body) {
      handlers.onError('模型返回为空流');
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
}
