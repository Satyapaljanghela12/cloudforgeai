import OpenAI from 'openai';
import { config } from '../config/env';
import { embeddingRepository } from '../repositories/embeddingRepository';
import { fileRepository } from '../repositories/fileRepository';
import { logger } from '../utils/logger';

/**
 * Embedding service — chunk code files and store vector embeddings.
 *
 * Why chunk instead of embedding the whole file?
 * LLM context windows and embedding models have token limits.
 * More importantly, a 500-line file contains many different concepts.
 * Chunking lets us retrieve only the relevant portion rather than
 * injecting the entire file every time.
 *
 * Chunking strategy: line-based with overlap.
 * - Each chunk is ~60 lines
 * - Chunks overlap by 10 lines so context isn't lost at boundaries
 * - This is simpler than AST-based chunking but works well in practice
 *
 * Why not AST-based chunking (split by function/class)?
 * It requires language-specific parsers for each language we support.
 * Line-based chunking is language-agnostic and good enough for semantic
 * search. AST chunking would be a quality improvement for Phase 7+.
 *
 * Embedding model: text-embedding-3-small (1536 dimensions)
 * - Fast and cheap (~$0.02 per 1M tokens)
 * - Good code understanding
 * - 1536 dims balances quality vs storage/speed
 *
 * Rate limiting: we batch embedding calls (20 chunks per API call)
 * to stay within rate limits and reduce latency.
 *
 * Interview point: In production you'd use a job queue (BullMQ Phase 12)
 * to run indexing asynchronously so it doesn't block HTTP requests.
 * Here we run it synchronously since it's fast enough for small projects.
 */

const CHUNK_LINES = 60;
const CHUNK_OVERLAP = 10;
const EMBED_BATCH_SIZE = 20;

// Files to skip — binary, lock files, etc.
const SKIP_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'svg', 'ico', 'webp',
  'woff', 'woff2', 'ttf', 'eot',
  'lock', 'map',
  'min.js', 'min.css',
]);

function shouldSkip(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  const ext = lower.split('.').pop() ?? '';
  if (SKIP_EXTENSIONS.has(ext)) return true;
  if (lower.includes('node_modules')) return true;
  if (lower.includes('.git/')) return true;
  return false;
}

/**
 * Split file content into overlapping chunks.
 * Returns array of { index, text } objects.
 */
function chunkFile(content: string, filePath: string): Array<{ index: number; text: string }> {
  const lines = content.split('\n');
  const chunks: Array<{ index: number; text: string }> = [];

  for (let i = 0; i < lines.length; i += CHUNK_LINES - CHUNK_OVERLAP) {
    const slice = lines.slice(i, i + CHUNK_LINES);
    const text = `// ${filePath}\n${slice.join('\n')}`.trim();
    if (text.length > 20) { // skip near-empty chunks
      chunks.push({ index: chunks.length, text });
    }
    if (i + CHUNK_LINES >= lines.length) break;
  }

  return chunks;
}

function getOpenAIClient(): OpenAI {
  return new OpenAI({
    apiKey: config.openaiApiKey,
    baseURL: config.openaiBaseUrl,
    defaultHeaders: {
      'HTTP-Referer': 'https://cloudforge.ai',
      'X-Title': 'CloudForge AI',
    },
  });
}

/**
 * Generate embeddings for a batch of text strings.
 * Returns an array of embedding vectors in the same order as the input.
 */
async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const client = getOpenAIClient();

  const response = await client.embeddings.create({
    model: config.embeddingModel,
    input: texts,
    dimensions: config.embeddingDimensions,
  });

  // Sort by index to guarantee order matches input
  return response.data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}

/**
 * Index a single file — chunk it and store embeddings.
 */
async function indexFile(
  projectId: string,
  fileId: string,
  filePath: string,
  content: string
): Promise<number> {
  if (shouldSkip(filePath) || !content.trim()) {
    return 0;
  }

  const chunks = chunkFile(content, filePath);
  if (chunks.length === 0) return 0;

  // Delete old embeddings for this file before re-indexing
  await embeddingRepository.deleteByFile(fileId);

  // Process in batches to respect rate limits
  for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
    const batch = chunks.slice(i, i + EMBED_BATCH_SIZE);
    const embeddings = await generateEmbeddings(batch.map((c) => c.text));

    for (let j = 0; j < batch.length; j++) {
      await embeddingRepository.upsertChunk({
        projectId,
        fileId,
        filePath,
        chunkIndex: batch[j].index,
        content: batch[j].text,
        embedding: embeddings[j],
      });
    }
  }

  return chunks.length;
}

/**
 * Index all files in a project.
 * Called when the user clicks "Index project" or after AI writes files.
 * Returns the total number of chunks indexed.
 */
export async function indexProject(projectId: string): Promise<{
  filesIndexed: number;
  chunksIndexed: number;
}> {
  if (!config.openaiApiKey) {
    logger.warn('Skipping indexing — no OpenAI API key configured');
    return { filesIndexed: 0, chunksIndexed: 0 };
  }

  const files = await fileRepository.findAllByProject(projectId);
  const indexable = files.filter((f) => !f.isDirectory && !shouldSkip(f.path));

  let totalChunks = 0;
  let filesIndexed = 0;

  for (const file of indexable) {
    try {
      const chunks = await indexFile(projectId, file.id, file.path, file.content);
      if (chunks > 0) {
        totalChunks += chunks;
        filesIndexed++;
      }
    } catch (err) {
      // Log but don't fail the whole index if one file errors
      logger.warn('Failed to index file', { path: file.path, error: (err as Error).message });
    }
  }

  logger.info('Project indexed', { projectId, filesIndexed, totalChunks });
  return { filesIndexed, chunksIndexed: totalChunks };
}

/**
 * Index a single file after it's been updated.
 * Called by the AI agent after write_file tool calls.
 */
export async function indexSingleFile(
  projectId: string,
  fileId: string,
  filePath: string,
  content: string
): Promise<void> {
  if (!config.openaiApiKey) return;
  try {
    await indexFile(projectId, fileId, filePath, content);
  } catch (err) {
    logger.warn('Failed to index file after update', { filePath, error: (err as Error).message });
  }
}

/**
 * Search the project codebase semantically.
 * Embeds the query and finds the most relevant code chunks.
 * Returns formatted context string ready to inject into the AI prompt.
 */
export async function searchCodebase(
  projectId: string,
  query: string,
  topK = 5
): Promise<string> {
  if (!config.openaiApiKey) return '';

  const count = await embeddingRepository.countByProject(projectId);
  if (count === 0) return ''; // Not indexed yet — skip silently

  try {
    const [queryEmbedding] = await generateEmbeddings([query]);
    const results = await embeddingRepository.search(projectId, queryEmbedding, topK);

    if (results.length === 0) return '';

    // Format as readable code blocks for the AI
    const formatted = results
      .map((r) => `// ${r.filePath} (similarity: ${(r.similarity * 100).toFixed(0)}%)\n${r.content}`)
      .join('\n\n---\n\n');

    return formatted;
  } catch (err) {
    logger.warn('Codebase search failed', { error: (err as Error).message });
    return '';
  }
}
