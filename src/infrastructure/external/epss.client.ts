import { createInterface } from 'readline';
import { Readable } from 'stream';
import { createGunzip } from 'zlib';
import { injectable } from 'inversify';
import { CveId, Probability } from '../../domain/cve/value-objects/index.js';
import { fetchRetry } from './fetch-retry.js';
import type { IEpssClient } from '../../application/ports/ports.js';
import type { EpssEntry } from '../../domain/cve/cve-ingest.repository.interface.js';

const EPSS_URL = 'https://epss.empiricalsecurity.com/epss_scores-current.csv.gz';

@injectable()
export class EpssClient implements IEpssClient {
  async streamScores(batchSize: number, onBatch: (batch: EpssEntry[]) => Promise<void>): Promise<number> {
    const res = await fetchRetry(EPSS_URL, { headers: { 'user-agent': 'cti-backend/0.1' }, timeoutMs: 300_000 });
    if (!res.ok || !res.body) throw new Error(`EPSS responded ${res.status}`);

    const lines = createInterface({
      input: Readable.fromWeb(res.body as never).pipe(createGunzip()),
      crlfDelay: Infinity,
    });
    let batch: EpssEntry[] = [];
    let total = 0;
    for await (const line of lines) {
      // First line is a "#model_version:...,score_date:..." comment, then the header.
      if (!line || line.startsWith('#') || line.startsWith('cve,')) continue;
      const [cveId, epss, percentile] = line.split(',');
      if (!cveId || epss === undefined || percentile === undefined) continue;
      // Malformed rows are skipped rather than aborting a 380k-row import.
      const id = CveId.tryFrom(cveId);
      const score = Probability.tryFrom(Number(epss));
      const pct = Probability.tryFrom(Number(percentile));
      if (!id || !score || !pct) continue;
      batch.push({ cveId: id.value, epss: score.value, percentile: pct.value });
      total++;
      if (batch.length >= batchSize) {
        await onBatch(batch);
        batch = [];
      }
    }
    if (batch.length) await onBatch(batch);
    return total;
  }
}
