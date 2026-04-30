// TODO(real-data): replace this mock module with a real data source.
// When the geo-audit feature ships, swap callers of `listGeoAudits` /
// `createGeoAudit` to hit a real API route (likely
// /api/geo-audits) backed by the runs table joined with a region column.
// The shape below should stay stable so the UI does not need to change.

export type GeoAuditStatus = 'queued' | 'running' | 'done' | 'failed';

export interface GeoAuditRow {
  id: string;
  // ISO 8601 timestamp of when the audit was created.
  createdAt: string;
  // Country/region the audit was run from. Multi-region audits join with " · ".
  regions: string[];
  // How many tracked prompts were included in the audit.
  promptsRun: number;
  // How many of those prompts surfaced a brand mention.
  mentionsFound: number;
  status: GeoAuditStatus;
}

// TODO(real-data): seed data only — delete once API is wired.
const MOCK_AUDITS: GeoAuditRow[] = [
  {
    id: 'ga_01HZ4QJQ1',
    createdAt: '2026-04-29T14:22:00.000Z',
    regions: ['United States'],
    promptsRun: 24,
    mentionsFound: 17,
    status: 'done',
  },
  {
    id: 'ga_01HZ3K7B2',
    createdAt: '2026-04-28T09:05:00.000Z',
    regions: ['United Kingdom', 'Germany'],
    promptsRun: 24,
    mentionsFound: 11,
    status: 'done',
  },
  {
    id: 'ga_01HZ2N8X3',
    createdAt: '2026-04-26T18:40:00.000Z',
    regions: ['Japan'],
    promptsRun: 12,
    mentionsFound: 3,
    status: 'done',
  },
  {
    id: 'ga_01HZ1F2A4',
    createdAt: '2026-04-25T07:14:00.000Z',
    regions: ['Brazil', 'Mexico', 'Argentina'],
    promptsRun: 18,
    mentionsFound: 9,
    status: 'done',
  },
  {
    id: 'ga_01HYZW6T5',
    createdAt: '2026-04-30T11:01:00.000Z',
    regions: ['Australia'],
    promptsRun: 24,
    mentionsFound: 0,
    status: 'running',
  },
  {
    id: 'ga_01HYZW6T6',
    createdAt: '2026-04-30T11:02:00.000Z',
    regions: ['India'],
    promptsRun: 24,
    mentionsFound: 0,
    status: 'queued',
  },
  {
    id: 'ga_01HYWXP7M',
    createdAt: '2026-04-22T16:33:00.000Z',
    regions: ['France'],
    promptsRun: 12,
    mentionsFound: 0,
    status: 'failed',
  },
];

// TODO(real-data): swap to fetch('/api/geo-audits') once endpoint exists.
export function listGeoAudits(): GeoAuditRow[] {
  return MOCK_AUDITS.slice().sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

// TODO(real-data): swap to POST /api/geo-audits once endpoint exists.
// For now this just appends to the in-memory array so the UI feels real
// during a session. Refresh of the page wipes the submitted row.
export function createGeoAudit(input: {
  regions: string[];
  promptsRun: number;
}): GeoAuditRow {
  const row: GeoAuditRow = {
    id: 'ga_' + Math.random().toString(36).slice(2, 12),
    createdAt: new Date().toISOString(),
    regions: input.regions,
    promptsRun: input.promptsRun,
    mentionsFound: 0,
    status: 'queued',
  };
  MOCK_AUDITS.unshift(row);
  return row;
}
