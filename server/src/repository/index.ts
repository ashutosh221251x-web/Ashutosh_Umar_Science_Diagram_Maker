import { DatabaseSync } from 'node:sqlite';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { CONFIG } from '../config/index.js';
import {
  DiagramResult,
  DiagramResultSchema,
  Review,
  ReviewSchema,
  ReviewStatus,
  ChecksMap
} from '../concepts/index.js';

export interface GenerationAttemptLog {
  conceptId: string;
  attemptNumber: number;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  passed: boolean;
  checks: ChecksMap;
  error?: string | null;
}

export interface IRepository {
  init(): Promise<void>;
  healthCheck(): Promise<boolean>;
  getAllDiagrams(): Promise<DiagramResult[]>;
  getDiagram(conceptId: string): Promise<DiagramResult | null>;
  saveDiagramAndResetReview(result: DiagramResult, logs?: GenerationAttemptLog[]): Promise<{ result: DiagramResult; review: Review }>;
  getAllReviews(): Promise<Review[]>;
  getReview(conceptId: string): Promise<Review | null>;
  saveReview(conceptId: string, status: ReviewStatus, note: string): Promise<Review>;
  close(): Promise<void>;
}

// -------------------------------------------------------------
// SQLite Implementation (zero-config, native in Node 22)
// -------------------------------------------------------------
class SqliteRepository implements IRepository {
  private db: DatabaseSync;

  constructor(filePath: string) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.db = new DatabaseSync(filePath);
    this.db.exec('PRAGMA journal_mode = WAL;');
  }

  async init(): Promise<void> {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS diagram_results (
        id TEXT PRIMARY KEY,
        svg TEXT,
        checks_json TEXT NOT NULL,
        usage_json TEXT NOT NULL,
        retry_count INTEGER NOT NULL DEFAULT 0,
        validation_retry_count INTEGER NOT NULL DEFAULT 0,
        api_retry_count INTEGER NOT NULL DEFAULT 0,
        generated_at TEXT NOT NULL,
        error TEXT,
        version INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS generation_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        concept_id TEXT NOT NULL,
        attempt_number INTEGER NOT NULL,
        model TEXT NOT NULL,
        input_tokens INTEGER,
        output_tokens INTEGER,
        cost_usd REAL,
        passed INTEGER NOT NULL,
        checks_json TEXT NOT NULL,
        error TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS reviews (
        concept_id TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'pending',
        note TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1
      );
    `);
  }

  async healthCheck(): Promise<boolean> {
    try {
      const stmt = this.db.prepare('SELECT 1 as alive;');
      const row = stmt.get() as any;
      return row && row.alive === 1;
    } catch {
      return false;
    }
  }

  async getAllDiagrams(): Promise<DiagramResult[]> {
    const stmt = this.db.prepare('SELECT * FROM diagram_results ORDER BY id ASC;');
    const rows = stmt.all() as any[];
    return rows.map(r => this.rowToDiagram(r));
  }

  async getDiagram(conceptId: string): Promise<DiagramResult | null> {
    const stmt = this.db.prepare('SELECT * FROM diagram_results WHERE id = ?;');
    const row = stmt.get(conceptId) as any;
    return row ? this.rowToDiagram(row) : null;
  }

  async saveDiagramAndResetReview(result: DiagramResult, logs: GenerationAttemptLog[] = []): Promise<{ result: DiagramResult; review: Review }> {
    const now = new Date().toISOString();

    // Fetch existing review to preserve prior notes if any
    const existingReview = await this.getReview(result.id);
    const existingDiag = await this.getDiagram(result.id);
    const newVersion = (existingDiag ? 1 : 0) + 1;

    // Use transaction for atomic diagram save and review reset
    this.db.exec('BEGIN TRANSACTION;');
    try {
      const diagStmt = this.db.prepare(`
        INSERT INTO diagram_results (id, svg, checks_json, usage_json, retry_count, validation_retry_count, api_retry_count, generated_at, error, version)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          svg = excluded.svg,
          checks_json = excluded.checks_json,
          usage_json = excluded.usage_json,
          retry_count = excluded.retry_count,
          validation_retry_count = excluded.validation_retry_count,
          api_retry_count = excluded.api_retry_count,
          generated_at = excluded.generated_at,
          error = excluded.error,
          version = diagram_results.version + 1;
      `);

      diagStmt.run(
        result.id,
        result.svg,
        JSON.stringify(result.checks),
        JSON.stringify(result.usage),
        result.retryCount,
        result.validationRetryCount,
        result.apiRetryCount,
        result.generatedAt,
        result.error,
        newVersion
      );

      // Save historical logs
      const logStmt = this.db.prepare(`
        INSERT INTO generation_logs (concept_id, attempt_number, model, input_tokens, output_tokens, cost_usd, passed, checks_json, error, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
      `);

      for (const log of logs) {
        logStmt.run(
          log.conceptId,
          log.attemptNumber,
          log.model,
          log.inputTokens,
          log.outputTokens,
          log.costUsd,
          log.passed ? 1 : 0,
          JSON.stringify(log.checks),
          log.error || null,
          now
        );
      }

      // Reset review to pending atomically
      const reviewStmt = this.db.prepare(`
        INSERT INTO reviews (concept_id, status, note, updated_at, version)
        VALUES (?, 'pending', ?, ?, 1)
        ON CONFLICT(concept_id) DO UPDATE SET
          status = 'pending',
          updated_at = excluded.updated_at,
          version = reviews.version + 1;
      `);

      const preservedNote = existingReview ? existingReview.note : '';
      reviewStmt.run(result.id, preservedNote, now);

      this.db.exec('COMMIT;');

      const updatedReview: Review = {
        conceptId: result.id,
        status: 'pending',
        note: preservedNote,
        updatedAt: now
      };

      return { result, review: updatedReview };
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }
  }

  async getAllReviews(): Promise<Review[]> {
    const stmt = this.db.prepare('SELECT * FROM reviews ORDER BY concept_id ASC;');
    const rows = stmt.all() as any[];
    return rows.map(r => ({
      conceptId: r.concept_id,
      status: r.status,
      note: r.note || '',
      updatedAt: r.updated_at
    }));
  }

  async getReview(conceptId: string): Promise<Review | null> {
    const stmt = this.db.prepare('SELECT * FROM reviews WHERE concept_id = ?;');
    const row = stmt.get(conceptId) as any;
    if (!row) return null;
    return {
      conceptId: row.concept_id,
      status: row.status,
      note: row.note || '',
      updatedAt: row.updated_at
    };
  }

  async saveReview(conceptId: string, status: ReviewStatus, note: string): Promise<Review> {
    const diagram = await this.getDiagram(conceptId);
    if (!diagram) {
      const err: any = new Error(`Cannot review ${conceptId}: no generated diagram exists.`);
      err.statusCode = 404;
      err.code = 'DIAGRAM_NOT_FOUND';
      throw err;
    }

    if (status === 'approved') {
      const allPassed = Object.values(diagram.checks).every(c => c.passed);
      if (!allPassed) {
        const err: any = new Error('Cannot approve diagram: all five validation checks must pass.');
        err.statusCode = 409;
        err.code = 'CHECKS_FAILED';
        throw err;
      }
    }

    const now = new Date().toISOString();
    const cleanNote = (note || '').slice(0, 1000);

    const stmt = this.db.prepare(`
      INSERT INTO reviews (concept_id, status, note, updated_at, version)
      VALUES (?, ?, ?, ?, 1)
      ON CONFLICT(concept_id) DO UPDATE SET
        status = excluded.status,
        note = excluded.note,
        updated_at = excluded.updated_at,
        version = reviews.version + 1;
    `);

    stmt.run(conceptId, status, cleanNote, now);

    return {
      conceptId: conceptId as any,
      status,
      note: cleanNote,
      updatedAt: now
    };
  }

  async close(): Promise<void> {
    this.db.close();
  }

  private rowToDiagram(r: any): DiagramResult {
    return DiagramResultSchema.parse({
      id: r.id,
      svg: r.svg,
      checks: JSON.parse(r.checks_json),
      usage: JSON.parse(r.usage_json),
      retryCount: r.retry_count,
      validationRetryCount: r.validation_retry_count,
      apiRetryCount: r.api_retry_count,
      generatedAt: r.generated_at,
      error: r.error || null
    });
  }
}

// -------------------------------------------------------------
// PostgreSQL Implementation
// -------------------------------------------------------------
class PostgresRepository implements IRepository {
  private pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({
      connectionString,
      ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000
    });
  }

  async init(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS diagram_results (
          id VARCHAR(64) PRIMARY KEY,
          svg TEXT,
          checks_json TEXT NOT NULL,
          usage_json TEXT NOT NULL,
          retry_count INTEGER NOT NULL DEFAULT 0,
          validation_retry_count INTEGER NOT NULL DEFAULT 0,
          api_retry_count INTEGER NOT NULL DEFAULT 0,
          generated_at TIMESTAMPTZ NOT NULL,
          error TEXT,
          version INTEGER NOT NULL DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS generation_logs (
          id SERIAL PRIMARY KEY,
          concept_id VARCHAR(64) NOT NULL,
          attempt_number INTEGER NOT NULL,
          model VARCHAR(128) NOT NULL,
          input_tokens INTEGER,
          output_tokens INTEGER,
          cost_usd DOUBLE PRECISION,
          passed BOOLEAN NOT NULL,
          checks_json TEXT NOT NULL,
          error TEXT,
          created_at TIMESTAMPTZ NOT NULL
        );

        CREATE TABLE IF NOT EXISTS reviews (
          concept_id VARCHAR(64) PRIMARY KEY,
          status VARCHAR(32) NOT NULL DEFAULT 'pending',
          note TEXT NOT NULL DEFAULT '',
          updated_at TIMESTAMPTZ NOT NULL,
          version INTEGER NOT NULL DEFAULT 1
        );
      `);
    } finally {
      client.release();
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await this.pool.query('SELECT 1 as alive;');
      return res.rows[0]?.alive === 1;
    } catch {
      return false;
    }
  }

  async getAllDiagrams(): Promise<DiagramResult[]> {
    const res = await this.pool.query('SELECT * FROM diagram_results ORDER BY id ASC;');
    return res.rows.map(r => this.rowToDiagram(r));
  }

  async getDiagram(conceptId: string): Promise<DiagramResult | null> {
    const res = await this.pool.query('SELECT * FROM diagram_results WHERE id = $1;', [conceptId]);
    return res.rows.length > 0 ? this.rowToDiagram(res.rows[0]) : null;
  }

  async saveDiagramAndResetReview(result: DiagramResult, logs: GenerationAttemptLog[] = []): Promise<{ result: DiagramResult; review: Review }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN;');

      const existingReview = await this.getReview(result.id);
      const preservedNote = existingReview ? existingReview.note : '';
      const now = new Date().toISOString();

      await client.query(`
        INSERT INTO diagram_results (id, svg, checks_json, usage_json, retry_count, validation_retry_count, api_retry_count, generated_at, error, version)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1)
        ON CONFLICT(id) DO UPDATE SET
          svg = EXCLUDED.svg,
          checks_json = EXCLUDED.checks_json,
          usage_json = EXCLUDED.usage_json,
          retry_count = EXCLUDED.retry_count,
          validation_retry_count = EXCLUDED.validation_retry_count,
          api_retry_count = EXCLUDED.api_retry_count,
          generated_at = EXCLUDED.generated_at,
          error = EXCLUDED.error,
          version = diagram_results.version + 1;
      `, [
        result.id,
        result.svg,
        JSON.stringify(result.checks),
        JSON.stringify(result.usage),
        result.retryCount,
        result.validationRetryCount,
        result.apiRetryCount,
        result.generatedAt,
        result.error
      ]);

      for (const log of logs) {
        await client.query(`
          INSERT INTO generation_logs (concept_id, attempt_number, model, input_tokens, output_tokens, cost_usd, passed, checks_json, error, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10);
        `, [
          log.conceptId,
          log.attemptNumber,
          log.model,
          log.inputTokens,
          log.outputTokens,
          log.costUsd,
          log.passed,
          JSON.stringify(log.checks),
          log.error || null,
          now
        ]);
      }

      await client.query(`
        INSERT INTO reviews (concept_id, status, note, updated_at, version)
        VALUES ($1, 'pending', $2, $3, 1)
        ON CONFLICT(concept_id) DO UPDATE SET
          status = 'pending',
          updated_at = EXCLUDED.updated_at,
          version = reviews.version + 1;
      `, [result.id, preservedNote, now]);

      await client.query('COMMIT;');

      return {
        result,
        review: {
          conceptId: result.id,
          status: 'pending',
          note: preservedNote,
          updatedAt: now
        }
      };
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }

  async getAllReviews(): Promise<Review[]> {
    const res = await this.pool.query('SELECT * FROM reviews ORDER BY concept_id ASC;');
    return res.rows.map(r => ({
      conceptId: r.concept_id,
      status: r.status,
      note: r.note || '',
      updatedAt: new Date(r.updated_at).toISOString()
    }));
  }

  async getReview(conceptId: string): Promise<Review | null> {
    const res = await this.pool.query('SELECT * FROM reviews WHERE concept_id = $1;', [conceptId]);
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      conceptId: r.concept_id,
      status: r.status,
      note: r.note || '',
      updatedAt: new Date(r.updated_at).toISOString()
    };
  }

  async saveReview(conceptId: string, status: ReviewStatus, note: string): Promise<Review> {
    const diagram = await this.getDiagram(conceptId);
    if (!diagram) {
      const err: any = new Error(`Cannot review ${conceptId}: no generated diagram exists.`);
      err.statusCode = 404;
      err.code = 'DIAGRAM_NOT_FOUND';
      throw err;
    }

    if (status === 'approved') {
      const allPassed = Object.values(diagram.checks).every(c => c.passed);
      if (!allPassed) {
        const err: any = new Error('Cannot approve diagram: all five validation checks must pass.');
        err.statusCode = 409;
        err.code = 'CHECKS_FAILED';
        throw err;
      }
    }

    const now = new Date().toISOString();
    const cleanNote = (note || '').slice(0, 1000);

    await this.pool.query(`
      INSERT INTO reviews (concept_id, status, note, updated_at, version)
      VALUES ($1, $2, $3, $4, 1)
      ON CONFLICT(concept_id) DO UPDATE SET
        status = EXCLUDED.status,
        note = EXCLUDED.note,
        updated_at = EXCLUDED.updated_at,
        version = reviews.version + 1;
    `, [conceptId, status, cleanNote, now]);

    return {
      conceptId: conceptId as any,
      status,
      note: cleanNote,
      updatedAt: now
    };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private rowToDiagram(r: any): DiagramResult {
    return DiagramResultSchema.parse({
      id: r.id,
      svg: r.svg,
      checks: typeof r.checks_json === 'string' ? JSON.parse(r.checks_json) : r.checks_json,
      usage: typeof r.usage_json === 'string' ? JSON.parse(r.usage_json) : r.usage_json,
      retryCount: r.retry_count,
      validationRetryCount: r.validation_retry_count,
      apiRetryCount: r.api_retry_count,
      generatedAt: new Date(r.generated_at).toISOString(),
      error: r.error || null
    });
  }
}

// Factory function
export function createRepository(customPath?: string): IRepository {
  if (CONFIG.databaseUrl && (CONFIG.databaseUrl.startsWith('postgres://') || CONFIG.databaseUrl.startsWith('postgresql://'))) {
    console.log('[Repository] Using PostgreSQL repository');
    return new PostgresRepository(CONFIG.databaseUrl);
  }
  const dbPath = customPath || CONFIG.sqlitePath;
  console.log(`[Repository] Using SQLite repository at ${dbPath}`);
  return new SqliteRepository(dbPath);
}

