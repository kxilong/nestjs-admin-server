export interface ChunkOptions {
  chunkSize: number;
  chunkOverlap: number;
}

export function splitTextIntoChunks(
  text: string,
  options: ChunkOptions,
): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return [];
  }

  const chunkSize = Math.max(200, options.chunkSize);
  const chunkOverlap = Math.min(
    Math.max(0, options.chunkOverlap),
    chunkSize - 1,
  );
  const step = Math.max(1, chunkSize - chunkOverlap);
  const chunks: string[] = [];

  for (let start = 0; start < normalized.length; start += step) {
    const end = Math.min(normalized.length, start + chunkSize);
    const chunk = normalized.slice(start, end).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
    if (end >= normalized.length) {
      break;
    }
  }

  return chunks;
}

export function buildDeterministicEmbedding(
  text: string,
  dimension: number,
): number[] {
  const dim = Math.max(32, dimension);
  const vec = new Array<number>(dim).fill(0);
  const tokens = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);

  if (tokens.length === 0) {
    vec[0] = 1;
    return vec;
  }

  for (const token of tokens) {
    let h = 2166136261;
    for (let i = 0; i < token.length; i += 1) {
      h ^= token.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const idx = Math.abs(h) % dim;
    vec[idx] += 1;
  }

  let norm = 0;
  for (const value of vec) {
    norm += value * value;
  }
  norm = Math.sqrt(norm) || 1;

  return vec.map((value) => Number((value / norm).toFixed(6)));
}

export function vectorToSqlLiteral(vector: number[]): string {
  return `[${vector.join(',')}]`;
}

export async function fetchEmbedding(texts: string[]): Promise<number[][]> {
  const apiKey =
    process.env.DASHSCOPE_API_KEY?.trim() ||
    'sk-1bac273fa90c46fea36db007ace65ab9';
  const model = process.env.EMBEDDING_MODEL?.trim() || 'text-embedding-v3';
  const dimension = Number(process.env.RAG_EMBEDDING_DIM ?? '1024') || 1024;

  const apiUrl =
    process.env.DASHSCOPE_BASE_URL?.trim()?.replace(
      '/chat/completions',
      '/embeddings',
    ) || 'https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings';

  const response = await fetch(apiUrl, {
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
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Embedding API 请求失败(${response.status}): ${errText}`);
  }

  const data = (await response.json()) as {
    data: { embedding: number[]; index: number }[];
  };

  if (!data.data || data.data.length === 0) {
    throw new Error('Embedding API 返回为空');
  }

  const sorted = data.data.sort((a, b) => a.index - b.index);
  return sorted.map((item) => item.embedding);
}
