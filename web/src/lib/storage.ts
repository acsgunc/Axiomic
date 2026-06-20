/**
 * Client-side persistence and SQL analytics via DuckDB-WASM.
 *
 * DuckDB-WASM runs entirely in the browser. We use it as the analytical store
 * for historical OHLCV data so the app works fully offline. The DuckDB bundle
 * is lazy-loaded on first use to keep the initial page load light.
 *
 * For durable persistence across reloads we additionally mirror each symbol's
 * candles into the Origin Private File System (OPFS) as JSON, and re-hydrate
 * DuckDB from there on startup. OPFS is used (rather than IndexedDB) because it
 * provides fast, synchronous-friendly file access for cached datasets.
 */

import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import type { Candle } from '../types';

let dbPromise: Promise<AsyncDuckDB> | null = null;

async function getDb(): Promise<AsyncDuckDB> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const duckdb = await import('@duckdb/duckdb-wasm');
      const bundles = duckdb.getJsDelivrBundles();
      const bundle = await duckdb.selectBundle(bundles);
      const worker = new Worker(bundle.mainWorker!);
      const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
      const db = new duckdb.AsyncDuckDB(logger, worker);
      await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
      const conn = await db.connect();
      await conn.query(`
        CREATE TABLE IF NOT EXISTS candles (
          symbol VARCHAR,
          time   BIGINT,
          open   DOUBLE,
          high   DOUBLE,
          low    DOUBLE,
          close  DOUBLE,
          volume DOUBLE
        );
      `);
      await conn.close();
      return db;
    })();
  }
  return dbPromise;
}

/** Whether DuckDB analytics are available in this environment. */
export async function isStorageReady(): Promise<boolean> {
  try {
    await getDb();
    return true;
  } catch (err) {
    console.warn('DuckDB-WASM unavailable; falling back to in-memory only.', err);
    return false;
  }
}

/** Inserts (replacing) a symbol's candles into DuckDB and mirrors to OPFS. */
export async function saveCandles(symbol: string, candles: Candle[]): Promise<void> {
  const db = await getDb();
  const conn = await db.connect();
  try {
    await conn.query(`DELETE FROM candles WHERE symbol = '${escapeSql(symbol)}';`);
    // Register the data as a JSON virtual file and bulk-insert.
    const rows = candles.map((c) => ({ symbol, ...c }));
    await db.registerFileText(`${symbol}.json`, JSON.stringify(rows));
    await conn.query(`
      INSERT INTO candles
      SELECT symbol, time, open, high, low, close, volume
      FROM read_json_auto('${symbol}.json');
    `);
  } finally {
    await conn.close();
  }
  await writeOpfs(symbol, candles);
}

/** Loads a symbol's candles from DuckDB (ascending by time). */
export async function loadCandles(symbol: string): Promise<Candle[]> {
  const db = await getDb();
  const conn = await db.connect();
  try {
    const res = await conn.query(`
      SELECT time, open, high, low, close, volume
      FROM candles
      WHERE symbol = '${escapeSql(symbol)}'
      ORDER BY time ASC;
    `);
    return res.toArray().map((r: any) => ({
      time: Number(r.time),
      open: Number(r.open),
      high: Number(r.high),
      low: Number(r.low),
      close: Number(r.close),
      volume: Number(r.volume),
    }));
  } finally {
    await conn.close();
  }
}

/** Runs an arbitrary read-only SQL query against the candles store. */
export async function querySql(sql: string): Promise<Record<string, unknown>[]> {
  const db = await getDb();
  const conn = await db.connect();
  try {
    const res = await conn.query(sql);
    return res.toArray().map((r: any) => {
      const obj: Record<string, unknown> = {};
      for (const key of Object.keys(r)) {
        const v = r[key];
        obj[key] = typeof v === 'bigint' ? Number(v) : v;
      }
      return obj;
    });
  } finally {
    await conn.close();
  }
}

// ---------------------------------------------------------------------------
// OPFS mirror for durable offline cache.
// ---------------------------------------------------------------------------

async function opfsDir(): Promise<FileSystemDirectoryHandle | null> {
  if (!('storage' in navigator) || !navigator.storage?.getDirectory) return null;
  try {
    const root = await navigator.storage.getDirectory();
    return await root.getDirectoryHandle('axiomic', { create: true });
  } catch {
    return null;
  }
}

async function writeOpfs(symbol: string, candles: Candle[]): Promise<void> {
  const dir = await opfsDir();
  if (!dir) return;
  try {
    const file = await dir.getFileHandle(`${symbol}.json`, { create: true });
    const writable = await file.createWritable();
    await writable.write(JSON.stringify(candles));
    await writable.close();
  } catch (err) {
    console.warn('OPFS write failed', err);
  }
}

/** Lists symbols cached in OPFS. */
export async function listCachedSymbols(): Promise<string[]> {
  const dir = await opfsDir();
  if (!dir) return [];
  const symbols: string[] = [];
  try {
    // @ts-expect-error - entries() is available on FileSystemDirectoryHandle.
    for await (const [name] of dir.entries()) {
      if (name.endsWith('.json')) symbols.push(name.replace(/\.json$/, ''));
    }
  } catch {
    /* ignore */
  }
  return symbols;
}

/** Reads a cached symbol's candles directly from OPFS (offline boot path). */
export async function readOpfs(symbol: string): Promise<Candle[] | null> {
  const dir = await opfsDir();
  if (!dir) return null;
  try {
    const file = await dir.getFileHandle(`${symbol}.json`);
    const text = await (await file.getFile()).text();
    return JSON.parse(text) as Candle[];
  } catch {
    return null;
  }
}

function escapeSql(s: string): string {
  return s.replace(/'/g, "''");
}
