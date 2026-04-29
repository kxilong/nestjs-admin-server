import {
  buildDeterministicEmbedding,
  splitTextIntoChunks,
  vectorToSqlLiteral,
} from './rag.utils';

describe('rag.utils', () => {
  it('should split text into overlapping chunks', () => {
    const text = 'a'.repeat(1200);
    const chunks = splitTextIntoChunks(text, {
      chunkSize: 500,
      chunkOverlap: 100,
    });

    expect(chunks.length).toBe(3);
    expect(chunks[0].length).toBe(500);
    expect(chunks[1].length).toBe(500);
    expect(chunks[2].length).toBe(400);
    expect(chunks[0].slice(400)).toBe(chunks[1].slice(0, 100));
  });

  it('should generate stable normalized embedding', () => {
    const a = buildDeterministicEmbedding('NestJS pgvector rag', 128);
    const b = buildDeterministicEmbedding('NestJS pgvector rag', 128);
    const c = buildDeterministicEmbedding('完全不同内容', 128);

    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    expect(a).toHaveLength(128);
  });

  it('should format vector as pgvector literal', () => {
    const literal = vectorToSqlLiteral([0.1, 0.2, 0.3]);
    expect(literal).toBe('[0.1,0.2,0.3]');
  });
});
