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
  const chunkOverlap = Math.min(Math.max(0, options.chunkOverlap), chunkSize - 1);
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
