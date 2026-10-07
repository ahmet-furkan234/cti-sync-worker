import { inject, injectable } from 'inversify';
import { TYPES } from '../../shared/tokens.js';
import type { IKevClient, ILogger } from '../../application/ports/ports.js';
import type { KevEntry } from '../../domain/cve/cve-ingest.repository.interface.js';
import { CveId } from '../../domain/cve/value-objects/index.js';
import { fetchRetry } from './fetch-retry.js';

// The CISA site sits behind bot protection that some networks/IPs get 403 from or cannot reach at all;
// cisagov/kev-data is CISA's own repository mirror of the same catalog.
const KEV_URLS = [
  'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json',
  'https://raw.githubusercontent.com/cisagov/kev-data/develop/known_exploited_vulnerabilities.json',
];
const ATTEMPTS = 2;
const TIMEOUT_MS = 15_000;

interface KevFeed {
  vulnerabilities: {
    cveID: string;
    dateAdded: string;
    dueDate?: string;
    knownRansomwareCampaignUse?: string;
  }[];
}

@injectable()
export class KevClient implements IKevClient {
  /** The source that worked last time goes first, so an unreachable one costs a timeout only once. */
  private preferred = 0;

  constructor(@inject(TYPES.ILogger) private readonly logger: ILogger) {}

  async fetchCatalog(): Promise<KevEntry[]> {
    let lastError = 'no source available';
    const order = KEV_URLS.map((_, i) => i).sort((a, b) => Number(b === this.preferred) - Number(a === this.preferred) || a - b);
    for (const i of order) {
      const url = KEV_URLS[i]!;
      try {
        const res = await fetchRetry(url, { headers: { 'user-agent': 'cti-backend/0.1', accept: 'application/json' }, timeoutMs: TIMEOUT_MS }, ATTEMPTS);
        if (!res.ok) {
          lastError = `${url} responded ${res.status}`;
          this.logger.warn({ url, status: res.status }, 'KEV source unavailable, trying next');
          continue;
        }
        const feed = (await res.json()) as KevFeed;
        this.preferred = i;
        return feed.vulnerabilities.flatMap((v) => {
          const id = CveId.tryFrom(v.cveID);
          return id ? [{ v, id }] : [];
        }).map(({ v, id }) => ({
          cveId: id.value,
          dateAdded: new Date(`${v.dateAdded}T00:00:00Z`),
          dueDate: v.dueDate ? new Date(`${v.dueDate}T00:00:00Z`) : null,
          ransomware: v.knownRansomwareCampaignUse?.toLowerCase() === 'known',
        }));
      } catch (err) {
        lastError = String(err);
        this.logger.warn({ url, err: lastError }, 'KEV fetch failed, trying next');
      }
    }
    throw new Error(`CISA KEV unavailable: ${lastError}`);
  }
}
