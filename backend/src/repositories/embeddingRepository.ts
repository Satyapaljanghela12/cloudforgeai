import { query, queryOne } from '../db/query';

/**
 * Embedding repository — stores and searches code chunk vectors.
 *
 * The core operation is nearest-neighbour search using pgvector's
 * cosine distance operator (<=>). Given a query embedding vector,
 * it returns the most semantically similar code chunks from the project.
 *
 * Why cosine distance for code?
 * Cosine distance measures the angle between vectors, ignoring magnitude.
 * This means a short function and a long file with similar content will
 * have similar scores — which is what we want for relevance.
 *
 * Why pgvector instead of a dedicated vector DB (Pinecone, Weaviate)?
 * - Zero extra infrastructure — already on Supabase PostgreSQL
 * - ACID transactions — embeddings stay consistent with file updates
 * - pgvector is production-ready (used by major companies)
 * - Simpler ops — one database to backup, monitor, and scale
 * - Fast enough for projects with <100K chunks (which covers all our use cases)
 *
 * Interview point: At 10M+ vectors you'd want a dedicated ANN index
 * like HNSW (pgvector also supports this) or a dedicated vector DB.
 * For our scale, IVFFlat with lists=100 is more than sufficient.
 */

export interface EmbeddingRow {
  id: string;
  project_id: string;
  file_id: string;
  file_path: string;
  chunk_index: number;
  content: string;
  created_at: Date;
}

export interface SearchResult {
  fileId: string;
  filePath: string;
  content: string;
  similarity: number;
}

export const embeddingRepository = {
  async upsertChunk(data: {
    projectId: string;
    fileId: string;
    filePath: string;
    chunkIndex: number;
    content: string;
    embedding: number[];
  }): Promise<void> {
    // Format vector as PostgreSQL array literal: [0.1,0.2,...]
    const vectorLiteral = `[${data.embedding.join(',')}]`;

    await query(
      `INSERT INTO code_embeddings
         (project_id, file_id, file_path, chunk_index, content, embedding)
       VALUES ($1, $2, $3, $4, $5, $6::vector)
       ON CONFLICT (file_id, chunk_index)
       DO UPDATE SET
         content   = EXCLUDED.content,
         embedding = EXCLUDED.embedding,
         file_path = EXCLUDED.file_path`,
      [
        data.projectId,
        data.fileId,
        data.filePath,
        data.chunkIndex,
        data.content,
        vectorLiteral,
      ]
    );
  },

  async deleteByFile(fileId: string): Promise<void> {
    await query('DELETE FROM code_embeddings WHERE file_id = $1', [fileId]);
  },

  async deleteByProject(projectId: string): Promise<void> {
    await query('DELETE FROM code_embeddings WHERE project_id = $1', [projectId]);
  },

  /**
   * Semantic search — find the top-K most similar chunks to a query vector.
   *
   * The <=> operator is pgvector's cosine distance.
   * Lower distance = more similar. We convert to similarity = 1 - distance.
   * Results are ordered by similarity descending (most relevant first).
   *
   * The threshold (0.3) filters out low-quality matches — a similarity
   * below 0.3 means the chunk is probably not relevant to the query.
   */
  async search(
    projectId: string,
    queryEmbedding: number[],
    topK = 5,
    threshold = 0.3
  ): Promise<SearchResult[]> {
    const vectorLiteral = `[${queryEmbedding.join(',')}]`;

    const result = await query<{
      file_id: string;
      file_path: string;
      content: string;
      similarity: number;
    }>(
      `SELECT
         file_id,
         file_path,
         content,
         1 - (embedding <=> $2::vector) AS similarity
       FROM code_embeddings
       WHERE project_id = $1
         AND 1 - (embedding <=> $2::vector) > $4
       ORDER BY similarity DESC
       LIMIT $3`,
      [projectId, vectorLiteral, topK, threshold]
    );

    return result.rows.map((r) => ({
      fileId: r.file_id,
      filePath: r.file_path,
      content: r.content,
      similarity: r.similarity,
    }));
  },

  async countByProject(projectId: string): Promise<number> {
    const row = await queryOne<{ count: string }>(
      'SELECT COUNT(*) as count FROM code_embeddings WHERE project_id = $1',
      [projectId]
    );
    return parseInt(row?.count ?? '0', 10);
  },

  async getIndexedFileIds(projectId: string): Promise<Set<string>> {
    const result = await query<{ file_id: string }>(
      'SELECT DISTINCT file_id FROM code_embeddings WHERE project_id = $1',
      [projectId]
    );
    return new Set(result.rows.map((r) => r.file_id));
  },
};
