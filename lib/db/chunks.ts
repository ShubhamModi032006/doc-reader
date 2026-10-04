import { query } from './pool';

export interface ChunkRow {
  id: string;
  document_id: string;
  chunk_index: number;
  heading?: string | null;
  start_page: number;
  end_page: number;
  start_char: number;
  end_char: number;
  text: string;
  rank?: number;
}

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'do', 'for', 'from',
  'how', 'i', 'in', 'is', 'it', 'many', 'need', 'of', 'on', 'or', 'that',
  'the', 'this', 'to', 'was', 'what', 'when', 'where', 'which', 'who', 'will', 'with',
  'should', 'would', 'could', 'about', 'get', 'give', 'given'
]);

const SYNONYMS: Record<string, string[]> = {
  submit: ['submit', 'submission', 'deliverables', 'github', 'repo'],
  submitting: ['submit', 'submission', 'deliverables', 'github', 'repo'],
  requirements: ['requirements', 'requirement', 'need', 'must', 'should', 'build'],
  requirement: ['requirements', 'requirement', 'need', 'must', 'should', 'build'],
  deadline: ['deadline', 'days', 'due', 'duration', 'time'],
  days: ['days', 'day', 'duration', 'deadline', 'time'],
  day: ['days', 'day', 'duration', 'deadline', 'time'],
  extras: ['extras', 'extra', 'optional', 'bonus'],
  extra: ['extras', 'extra', 'optional', 'bonus'],
  optional: ['optional', 'extras', 'extra', 'bonus'],
  project: ['project', 'assignment', 'app', 'system'],
  assignment: ['assignment', 'project', 'app'],
};

export function extractKeywords(userQuery: string): string[] {
  return userQuery
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

export function buildExpandedTsQuery(userQuery: string, joinMode: 'AND' | 'OR' = 'OR'): string {
  const keywords = extractKeywords(userQuery);
  if (keywords.length === 0) return '';

  const clauseGroups = keywords.map((k) => {
    const syns = SYNONYMS[k] || [k];
    const unique = Array.from(new Set([k, ...syns]));
    return `(${unique.join(' | ')})`;
  });

  const joinOperator = joinMode === 'AND' ? ' & ' : ' | ';
  return clauseGroups.join(joinOperator);
}

export async function insertChunks(
  documentId: string,
  chunks: Array<{
    text: string;
    heading?: string;
    startPage: number;
    endPage: number;
    startChar: number;
    endChar: number;
  }>
): Promise<void> {
  for (let idx = 0; idx < chunks.length; idx++) {
    const c = chunks[idx];
    await query(
      `INSERT INTO chunks (document_id, chunk_index, heading, start_page, end_page, start_char, end_char, text)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [documentId, idx, c.heading || null, c.startPage, c.endPage, c.startChar, c.endChar, c.text]
    );
  }
}

export async function searchChunksFTS(
  documentIds: string[],
  userQuery: string,
  limitPerDoc = 5
): Promise<ChunkRow[]> {
  if (documentIds.length === 0) return [];

  // Try websearch_to_tsquery or AND tsquery first
  const andTsQuery = buildExpandedTsQuery(userQuery, 'AND');
  const sql = `
    WITH ranked AS (
      SELECT 
        c.*,
        ts_rank_cd(c.tsv, to_tsquery('english', $2)) as rank,
        ROW_NUMBER() OVER (PARTITION BY c.document_id ORDER BY ts_rank_cd(c.tsv, to_tsquery('english', $2)) DESC, c.chunk_index ASC) as rn
      FROM chunks c
      WHERE c.document_id = ANY($1::uuid[])
        AND (c.tsv @@ to_tsquery('english', $2) OR c.tsv @@ websearch_to_tsquery('english', $3))
    )
    SELECT id, document_id, chunk_index, heading, start_page, end_page, start_char, end_char, text, rank
    FROM ranked
    WHERE rn <= $4
    ORDER BY rank DESC, chunk_index ASC;
  `;

  if (andTsQuery) {
    try {
      const res = await query<ChunkRow>(sql, [documentIds, andTsQuery, userQuery, limitPerDoc]);
      if (res.rows.length > 0) return res.rows;
    } catch (_) {}
  }

  // Fallback to OR tsquery
  const orTsQuery = buildExpandedTsQuery(userQuery, 'OR');
  if (orTsQuery) {
    try {
      const orSql = `
        WITH ranked AS (
          SELECT 
            c.*,
            ts_rank_cd(c.tsv, to_tsquery('english', $2)) as rank,
            ROW_NUMBER() OVER (PARTITION BY c.document_id ORDER BY ts_rank_cd(c.tsv, to_tsquery('english', $2)) DESC, c.chunk_index ASC) as rn
          FROM chunks c
          WHERE c.document_id = ANY($1::uuid[])
            AND c.tsv @@ to_tsquery('english', $2)
        )
        SELECT id, document_id, chunk_index, heading, start_page, end_page, start_char, end_char, text, rank
        FROM ranked
        WHERE rn <= $3
        ORDER BY rank DESC, chunk_index ASC;
      `;
      const resOr = await query<ChunkRow>(orSql, [documentIds, orTsQuery, limitPerDoc]);
      if (resOr.rows.length > 0) return resOr.rows;
    } catch (_) {}
  }

  // Secondary fallback using keyword ILIKE
  const keywords = extractKeywords(userQuery);
  if (keywords.length > 0) {
    const ilikeConditions = keywords.map((_, i) => `c.text ILIKE $${i + 2}`).join(' OR ');
    const ilikeSql = `
      SELECT c.id, c.document_id, c.chunk_index, c.heading, c.start_page, c.end_page, c.start_char, c.end_char, c.text, 0.5 as rank
      FROM chunks c
      WHERE c.document_id = ANY($1::uuid[]) AND (${ilikeConditions})
      ORDER BY c.chunk_index ASC
      LIMIT $${keywords.length + 2};
    `;
    const params = [documentIds, ...keywords.map((k) => `%${k}%`), limitPerDoc];
    const resIlike = await query<ChunkRow>(ilikeSql, params);
    if (resIlike.rows.length > 0) return resIlike.rows;
  }

  return [];
}

export async function getAllChunksForDocument(documentId: string): Promise<ChunkRow[]> {
  const res = await query<ChunkRow>(
    'SELECT * FROM chunks WHERE document_id = $1 ORDER BY chunk_index ASC',
    [documentId]
  );
  return res.rows;
}

export async function countChunksForDocuments(documentIds: string[]): Promise<number> {
  const res = await query<{ count: string }>(
    'SELECT COUNT(*) FROM chunks WHERE document_id = ANY($1::uuid[])',
    [documentIds]
  );
  return parseInt(res.rows[0]?.count || '0', 10);
}
