import { API_BASE } from '@/config';
import { AUTH_KEYS } from '@/auth/storage';

export type StreamCallbacks = {
  onMeta?: (meta: { model: string }) => void;
  onDelta: (text: string) => void;
  onError?: (message: string) => void;
  onDone?: () => void;
};

export async function streamAiChat(
  payload: { prompt: string; systemPrompt?: string },
  callbacks: StreamCallbacks,
): Promise<void> {
  const token = localStorage.getItem(AUTH_KEYS.access) ?? '';
  const response = await fetch(`${API_BASE}/ai/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `请求失败(${response.status})`);
  }
  if (!response.body) {
    throw new Error('流式响应为空');
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

    for (const eventRaw of events) {
      const lines = eventRaw.split('\n').map((l) => l.trim());
      const eventLine = lines.find((l) => l.startsWith('event:'));
      const dataLine = lines.find((l) => l.startsWith('data:'));
      const eventName = eventLine?.slice(6).trim() ?? 'message';
      const dataText = dataLine?.slice(5).trim() ?? '{}';
      let data: any = {};
      try {
        data = JSON.parse(dataText);
      } catch {
        // ignore
      }

      if (eventName === 'meta') {
        callbacks.onMeta?.(data as { model: string });
      } else if (eventName === 'delta') {
        callbacks.onDelta((data.text as string) ?? '');
      } else if (eventName === 'error') {
        callbacks.onError?.((data.message as string) ?? '模型返回错误');
      } else if (eventName === 'done') {
        callbacks.onDone?.();
      }
    }
  }
}
