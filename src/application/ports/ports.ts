import type { CveUpsert, EpssEntry, KevEntry } from '../../domain/cve/cve-ingest.repository.interface.js';

export interface ILogger {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
  debug(obj: unknown, msg?: string): void;
}

export interface NvdPage {
  vulnerabilities: CveUpsert[];
  totalResults: number;
  startIndex: number;
  resultsPerPage: number;
}

export interface INvdClient {
  fetchPage(params: { startIndex: number; lastModStart?: Date; lastModEnd?: Date }): Promise<NvdPage>;
  /** Minimum delay between requests honoring the NVD rate limit. */
  readonly requestDelayMs: number;
}

export interface IKevClient {
  fetchCatalog(): Promise<KevEntry[]>;
}

export interface IEpssClient {
  /** Streams score batches so the full CSV never sits in memory. */
  streamScores(batchSize: number, onBatch: (batch: EpssEntry[]) => Promise<void>): Promise<number>;
}
