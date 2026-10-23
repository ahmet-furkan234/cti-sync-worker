import { inject, injectable } from 'inversify';
import { TYPES } from '../../shared/tokens.js';
import type { ILogger, INvdClient, NvdPage } from '../../application/ports/ports.js';
import type { CpeMatch, CveReference, CveUpsert, SeverityLevel } from '../../domain/cve/cve-ingest.repository.interface.js';
import type { EnvConfig } from '../common/env.config.js';
import { CpeName, CveId, CvssScore } from '../../domain/cve/value-objects/index.js';

const NVD_URL = 'https://services.nvd.nist.gov/rest/json/cves/2.0';
const PAGE_SIZE = 2000;
const MAX_ATTEMPTS = 12; // full load lasts ~1h: outlast transient DNS/network outages (backoff caps at 2 min)
const MAX_AFFECTED = 200;
const MAX_VENDORS = 100;
const MAX_CPE_MATCHES = 300;

interface NvdMetric {
  type?: string;
  baseSeverity?: string;
  cvssData: { baseScore: number; baseSeverity?: string; vectorString?: string; version?: string };
}
interface NvdCveItem {
  id: string;
  published: string;
  lastModified: string;
  vulnStatus?: string;
  descriptions?: { lang: string; value: string }[];
  metrics?: Record<string, NvdMetric[] | undefined>;
  weaknesses?: { description: { value: string }[] }[];
  configurations?: {
    nodes?: {
      cpeMatch?: {
        vulnerable: boolean;
        criteria: string;
        versionStartIncluding?: string;
        versionStartExcluding?: string;
        versionEndIncluding?: string;
        versionEndExcluding?: string;
      }[];
    }[];
  }[];
  references?: { url: string; source?: string; tags?: string[] }[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// NVD timestamps carry no zone designator and are UTC.
const utc = (s: string) => new Date(/Z|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`);

const SEVERITY_NAMES: Record<string, SeverityLevel> = { NONE: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };

export function parseNvdCve(item: NvdCveItem): CveUpsert {
  const description =
    item.descriptions?.find((d) => d.lang === 'en')?.value ?? item.descriptions?.[0]?.value ?? '';

  let cvss = CvssScore.UNSCORED;
  let severity: SeverityLevel = 0;
  let vector: string | null = null;
  let version: string | null = null;
  for (const key of ['cvssMetricV40', 'cvssMetricV31', 'cvssMetricV30', 'cvssMetricV2']) {
    const list = item.metrics?.[key];
    const metric = list?.find((m) => m.type === 'Primary') ?? list?.[0];
    if (metric) {
      cvss = CvssScore.tryFrom(metric.cvssData.baseScore) ?? CvssScore.UNSCORED;
      const name = (metric.cvssData.baseSeverity ?? metric.baseSeverity)?.toUpperCase();
      severity = (name !== undefined ? SEVERITY_NAMES[name] : undefined) ?? cvss.severity;
      vector = metric.cvssData.vectorString ?? null;
      version = metric.cvssData.version ?? key.replace('cvssMetricV', '').replace(/^(\d)(\d)$/, '$1.$2');
      break;
    }
  }

  const cwe = [...new Set((item.weaknesses ?? []).flatMap((w) => w.description.map((d) => d.value)))];

  const affected = new Set<string>();
  const vendors = new Set<string>();
  const cpeMatches: CpeMatch[] = [];
  for (const conf of item.configurations ?? []) {
    for (const node of conf.nodes ?? []) {
      for (const m of node.cpeMatch ?? []) {
        if (!m.vulnerable) continue;
        const cpe = CpeName.tryFrom(m.criteria);
        const key = cpe?.productKey;
        if (cpe && key) {
          if (affected.size < MAX_AFFECTED) affected.add(key);
          if (vendors.size < MAX_VENDORS) vendors.add(cpe.vendor!);
        }
        if (cpeMatches.length < MAX_CPE_MATCHES) {
          const match: CpeMatch = { c: m.criteria };
          if (m.versionStartIncluding) match.vsi = m.versionStartIncluding;
          if (m.versionStartExcluding) match.vse = m.versionStartExcluding;
          if (m.versionEndIncluding) match.vei = m.versionEndIncluding;
          if (m.versionEndExcluding) match.vee = m.versionEndExcluding;
          cpeMatches.push(match);
        }
      }
    }
  }

  const references: CveReference[] = (item.references ?? []).slice(0, 100).map((r) => ({
    url: r.url,
    ...(r.source ? { source: r.source } : {}),
    ...(r.tags?.length ? { tags: r.tags } : {}),
  }));

  return {
    id: CveId.from(item.id).value,
    published: utc(item.published),
    lastModified: utc(item.lastModified),
    vulnStatus: item.vulnStatus ?? null,
    description,
    cvssScore: cvss.value,
    cvssSeverity: severity,
    cvssVector: vector,
    cvssVersion: version,
    cwe,
    references,
    affected: [...affected],
    vendors: [...vendors],
    cpeMatches,
  };
}

@injectable()
export class NvdClient implements INvdClient {
  readonly requestDelayMs: number;

  constructor(
    @inject(TYPES.EnvConfig) private readonly config: EnvConfig,
    @inject(TYPES.ILogger) private readonly logger: ILogger,
  ) {
    // 5 req/30s without a key, 50 req/30s with one.
    this.requestDelayMs = config.NVD_API_KEY ? 700 : 6500;
  }

  async fetchPage(params: { startIndex: number; lastModStart?: Date; lastModEnd?: Date }): Promise<NvdPage> {
    const url = new URL(NVD_URL);
    url.searchParams.set('startIndex', String(params.startIndex));
    url.searchParams.set('resultsPerPage', String(PAGE_SIZE));
    if (params.lastModStart && params.lastModEnd) {
      url.searchParams.set('lastModStartDate', params.lastModStart.toISOString());
      url.searchParams.set('lastModEndDate', params.lastModEnd.toISOString());
    }
    const headers: Record<string, string> = { 'user-agent': 'cti-backend/0.1' };
    if (this.config.NVD_API_KEY) headers['apiKey'] = this.config.NVD_API_KEY;

    for (let attempt = 1; ; attempt++) {
      try {
        const res = await fetch(url, { headers, signal: AbortSignal.timeout(180_000) });
        if (res.ok) {
          const body = (await res.json()) as {
            totalResults: number; startIndex: number; resultsPerPage: number;
            vulnerabilities: { cve: NvdCveItem }[];
          };
          return {
            totalResults: body.totalResults,
            startIndex: body.startIndex,
            resultsPerPage: body.resultsPerPage,
            vulnerabilities: body.vulnerabilities.flatMap((v) => {
              try {
                return [parseNvdCve(v.cve)];
              } catch (err) {
                this.logger.warn({ cve: v.cve?.id, err: String(err) }, 'skipping unparsable NVD entry');
                return [];
              }
            }),
          };
        }
        // 403/429/503 are how NVD signals throttling or a busy backend.
        if (![403, 429, 500, 502, 503, 504].includes(res.status)) {
          throw new Error(`NVD responded ${res.status}: ${(await res.text()).slice(0, 200)}`);
        }
        throw new RetryableError(`NVD responded ${res.status}`);
      } catch (err) {
        const retryable = err instanceof RetryableError || err instanceof TypeError || (err instanceof DOMException);
        if (!retryable || attempt >= MAX_ATTEMPTS) throw err;
        const wait = Math.min(120_000, 8_000 * 2 ** (attempt - 1));
        this.logger.warn({ attempt, wait, err: String(err) }, 'nvd request failed, retrying');
        await sleep(wait);
      }
    }
  }
}

class RetryableError extends Error {}
