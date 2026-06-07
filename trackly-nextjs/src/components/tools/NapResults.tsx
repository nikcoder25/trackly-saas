'use client';

// Shared presentational view for NAP check results — score + summary, possible
// duplicate listings, the per-URL results table, and CSV export. Used by both
// the public free tool and the saved-audit detail page in the dashboard so the
// two surfaces stay identical.

export type FieldStatus = 'match' | 'variation' | 'mismatch' | 'missing';

export interface FieldResult {
  status: FieldStatus;
  expected?: string;
  found?: string;
}

export interface NapUrlResult {
  url: string;
  httpStatus: number | null;
  reachable: boolean;
  error?: string;
  extracted: {
    name?: string;
    phone?: string;
    street?: string;
    city?: string;
    postcode?: string;
  };
  fields: {
    name: FieldResult;
    phone: FieldResult;
    address: FieldResult;
    postcode: FieldResult;
    suite: FieldResult;
  };
  tags: string[];
  matchScore: number;
}

export interface NapDuplicateGroup {
  domain: string;
  urls: string[];
  conflicting: boolean;
}

export interface NapResultsData {
  score: number;
  summary: { total: number; clean: number; withIssues: number; deadLinks: number; duplicateListings: number };
  duplicates: NapDuplicateGroup[];
  results: NapUrlResult[];
}

const cardStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: 16,
  padding: 32,
  boxShadow: '0 4px 24px rgba(0,0,0,.08)',
};

const STATUS_COLOR: Record<FieldStatus, { bg: string; fg: string }> = {
  match: { bg: '#dcfce7', fg: '#166534' },
  variation: { bg: '#fef9c3', fg: '#854d0e' },
  mismatch: { bg: '#fee2e2', fg: '#991b1b' },
  missing: { bg: '#f1f5f9', fg: '#64748b' },
};

function StatusPill({ status }: { status: FieldStatus }) {
  const c = STATUS_COLOR[status];
  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: 11,
        fontWeight: 700,
        padding: '2px 7px',
        borderRadius: 6,
        background: c.bg,
        color: c.fg,
        textTransform: 'capitalize',
      }}
    >
      {status}
    </span>
  );
}

export function scoreColor(score: number): string {
  if (score >= 85) return '#16a34a';
  if (score >= 60) return '#ca8a04';
  return '#dc2626';
}

function csvEscape(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function buildCsv(data: NapResultsData): string {
  const header = [
    'URL', 'HTTP Status', 'Match Score', 'Name Status', 'Found Name', 'Phone Status',
    'Found Phone', 'Address Status', 'Found Address', 'Postcode Status', 'Found Postcode',
    'Suite Status', 'Issues',
  ];
  const rows = data.results.map((r) =>
    [
      r.url,
      r.reachable ? String(r.httpStatus ?? '') : r.error || 'unreachable',
      String(r.matchScore),
      r.fields.name.status,
      r.extracted.name || '',
      r.fields.phone.status,
      r.extracted.phone || '',
      r.fields.address.status,
      r.extracted.street || '',
      r.fields.postcode.status,
      r.extracted.postcode || '',
      r.fields.suite.status,
      r.tags.join('; '),
    ]
      .map((c) => csvEscape(String(c)))
      .join(','),
  );
  return [header.map(csvEscape).join(','), ...rows].join('\n');
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 24, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600 }}>{label}</div>
    </div>
  );
}

export default function NapResults({ data, label }: { data: NapResultsData; label?: string }) {
  const downloadCsv = () => {
    const blob = new Blob([buildCsv(data)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nap-audit-${(label || 'results').trim().toLowerCase().replace(/\s+/g, '-') || 'results'}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ fontSize: 13, color: '#6b7280', fontWeight: 600 }}>Consistency score</div>
            <div style={{ fontSize: 44, fontWeight: 800, color: scoreColor(data.score), lineHeight: 1.1 }}>
              {data.score}
              <span style={{ fontSize: 20, color: '#9ca3af' }}>/100</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            <Stat label="Citations" value={data.summary.total} color="#1a1a2e" />
            <Stat label="Clean" value={data.summary.clean} color="#16a34a" />
            <Stat label="With issues" value={data.summary.withIssues} color="#ca8a04" />
            <Stat label="Dead links" value={data.summary.deadLinks} color="#dc2626" />
            <Stat label="Duplicates" value={data.summary.duplicateListings} color="#9333ea" />
          </div>
          <button
            onClick={downloadCsv}
            style={{
              padding: '10px 18px', borderRadius: 10, border: '1px solid var(--brand, #5B5BD6)',
              background: '#fff', color: 'var(--brand, #5B5BD6)', fontWeight: 700, fontSize: 14, cursor: 'pointer',
            }}
          >
            ↓ Export CSV
          </button>
        </div>
      </div>

      {data.duplicates.length > 0 && (
        <div style={cardStyle}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1a1a2e', margin: '0 0 6px' }}>
            Possible duplicate listings
          </h2>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 14px' }}>
            These directories appear more than once in your list. Duplicate listings split your ranking
            signal — consolidate or remove the extras, starting with any that disagree on NAP.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {data.duplicates.map((g) => (
              <div
                key={g.domain}
                style={{
                  padding: 14, borderRadius: 10,
                  background: g.conflicting ? '#fef2f2' : '#faf5ff',
                  border: g.conflicting ? '1px solid #fecaca' : '1px solid #e9d5ff',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#1a1a2e' }}>{g.domain}</span>
                  <span
                    style={{
                      fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 6,
                      background: g.conflicting ? '#fee2e2' : '#f3e8ff',
                      color: g.conflicting ? '#991b1b' : '#7e22ce',
                    }}
                  >
                    {g.urls.length} listings{g.conflicting ? ' · conflicting NAP' : ''}
                  </span>
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#6b7280' }}>
                  {g.urls.map((u) => (
                    <li key={u} style={{ wordBreak: 'break-all' }}>
                      <a href={u} target="_blank" rel="noopener noreferrer nofollow" style={{ color: '#6b7280', textDecoration: 'none' }}>
                        {u.replace(/^https?:\/\//, '')}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                {['Citation', 'Score', 'Name', 'Phone', 'Address', 'Postcode', 'Suite', 'Issues'].map((h) => (
                  <th
                    key={h}
                    style={{ padding: '12px 14px', fontWeight: 700, color: '#0f172a', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.results.map((r, i) => (
                <tr key={r.url + i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '12px 14px', maxWidth: 260 }}>
                    <a href={r.url} target="_blank" rel="noopener noreferrer nofollow" style={{ color: '#2563eb', textDecoration: 'none', wordBreak: 'break-all' }}>
                      {r.url.replace(/^https?:\/\//, '')}
                    </a>
                    {!r.reachable && (
                      <div style={{ fontSize: 11, color: '#dc2626', marginTop: 2 }}>
                        {r.error || `HTTP ${r.httpStatus ?? '—'}`}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '12px 14px', fontWeight: 700, color: scoreColor(r.matchScore) }}>
                    {r.reachable ? r.matchScore : '—'}
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <StatusPill status={r.fields.name.status} />
                    {r.extracted.name && <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>{r.extracted.name}</div>}
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <StatusPill status={r.fields.phone.status} />
                    {r.extracted.phone && <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>{r.extracted.phone}</div>}
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <StatusPill status={r.fields.address.status} />
                    {r.extracted.street && <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>{r.extracted.street}</div>}
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <StatusPill status={r.fields.postcode.status} />
                    {r.extracted.postcode && <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>{r.extracted.postcode}</div>}
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <StatusPill status={r.fields.suite.status} />
                  </td>
                  <td style={{ padding: '12px 14px', maxWidth: 180 }}>
                    {r.tags.length === 0 ? (
                      <span style={{ color: '#16a34a', fontSize: 12 }}>✓ Consistent</span>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.tags.map((t) => (
                          <span key={t} style={{ fontSize: 11, padding: '2px 6px', borderRadius: 5, background: '#fef2f2', color: '#b91c1c' }}>
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
