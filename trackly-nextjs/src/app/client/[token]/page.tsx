/**
 * Public, read-only client portal: /client/<token>.
 * The token is the login. Unknown or revoked tokens get a plain page that
 * reveals nothing. Plain inline styles, no dashboard CSS.
 */
import type { Metadata } from 'next';
import type React from 'react';
import { pool } from '@/lib/db';
import { clientByToken, type ClientUserRow } from '@/lib/rank-tracking/clients';
import { websiteDetail } from '@/lib/rank-tracking/queries';
import { clientScopeSql } from '@/lib/rank-tracking/access';
import { getBranding, logoSrc } from '@/lib/rank-tracking/reports';
import type { KeywordDto, WebsiteDetail } from '@/lib/rank-tracking/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Your rankings',
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: 'no-referrer',
};

const C = {
  ink: '#0f172a', text: '#334155', muted: '#475569', line: '#e2e8f0', lineSoft: '#f1f5f9', bg: '#f8fafc',
  up: '#15803d', down: '#b91c1c', indigo: '#4f46e5',
};
const FONT = 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** White or dark text, whichever reads better on the brand color. */
function textOn(hex: string): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return '#fff';
  const lin = (v: string) => { const c = parseInt(v, 16) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * lin(m[1]) + 0.7152 * lin(m[2]) + 0.0722 * lin(m[3]);
  return (1.05 / (L + 0.05)) >= 4.5 ? '#fff' : C.ink;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: FONT, color: C.ink, background: C.bg, minHeight: '100vh', margin: 0 }}>
      {children}
    </div>
  );
}

function Inactive() {
  return (
    <Shell>
      <main style={{ maxWidth: 520, margin: '0 auto', padding: '96px 16px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>This link is no longer active</h1>
        <p style={{ margin: 0, fontSize: 15, color: C.muted }}>Ask whoever sent it to you for a new link.</p>
      </main>
    </Shell>
  );
}

async function websiteIdsFor(c: ClientUserRow): Promise<string[]> {
  if (c.scope === 'groups') {
    if (!c.group_ids.length) return [];
    const r = await pool.query(
      `SELECT DISTINCT w.id, w.domain FROM rt_groups g JOIN rt_websites w ON w.id = g.website_id
        WHERE g.id = ANY($1::text[]) AND w.account_id = $2 ORDER BY w.domain`, [c.group_ids, c.account_id]);
    return r.rows.map((x) => x.id as string);
  }
  return c.website_ids;
}

const AI_TEXT: Record<string, { label: string; color: string }> = {
  recommended: { label: 'Recommended', color: C.up },
  mentioned: { label: 'Mentioned', color: '#3730a3' },
  not_mentioned: { label: 'Not mentioned', color: C.muted },
};

function Badge({ k }: { k: KeywordDto }) {
  const r = k.rank;
  const top3 = r != null && r <= 3;
  const top10 = r != null && r <= 10;
  return (
    <span style={{
      display: 'inline-block', minWidth: 36, textAlign: 'center', padding: '4px 8px', borderRadius: 8, fontWeight: 700, fontSize: 13,
      background: top3 ? '#312e81' : top10 ? '#e0e7ff' : C.lineSoft, color: top3 ? '#fff' : top10 ? '#312e81' : C.muted,
    }}>{r ?? `${k.depth}+`}</span>
  );
}

function ChangeText({ v }: { v: number }) {
  const n = Math.abs(Math.round(v));
  if (!n) return <span style={{ color: C.muted, fontWeight: 600 }}>0</span>;
  return (
    <span style={{ color: v > 0 ? C.up : C.down, fontWeight: 600 }}>
      <span aria-hidden="true">{v > 0 ? '▲' : '▼'} </span>
      <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{v > 0 ? 'up ' : 'down '}</span>
      {n}
    </span>
  );
}

function Tile({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, padding: '14px 16px', flex: '1 1 140px', minWidth: 0 }}>
      <div style={{ fontSize: 13, color: C.muted, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: color || C.ink, marginTop: 4 }}>{value}</div>
    </div>
  );
}

const th: React.CSSProperties = { padding: '12px 12px', fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '12px 12px', borderTop: `1px solid ${C.lineSoft}`, verticalAlign: 'middle' };

function SiteSection({ d, accent }: { d: WebsiteDetail; accent: string }) {
  return (
    <section aria-labelledby={`site-${d.website.id}`} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h2 id={`site-${d.website.id}`} style={{ margin: 0, fontSize: 20, fontWeight: 700, overflowWrap: 'anywhere', borderLeft: `4px solid ${accent}`, paddingLeft: 10 }}>
        {d.website.domain}
      </h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <Tile label="Top 10" value={`${d.stats.top10} of ${d.stats.total}`} />
        <Tile label="Moved up" value={String(d.stats.up)} color={d.stats.up ? C.up : undefined} />
        {d.sov != null && <Tile label="AI share of voice" value={`${d.sov}%`} />}
      </div>
      <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'hidden' }}>
        {!d.keywords.length ? (
          <p style={{ margin: 0, padding: 20, fontSize: 14, color: C.muted }}>No keywords to show yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ color: C.muted, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                  <th scope="col" style={{ ...th, paddingLeft: 16 }}>Keyword</th>
                  <th scope="col" style={th}>City</th>
                  <th scope="col" style={th}>Rank</th>
                  <th scope="col" style={th}>Change</th>
                  <th scope="col" style={th}>Best</th>
                  <th scope="col" style={{ ...th, paddingRight: 16 }}>In AI answers</th>
                </tr>
              </thead>
              <tbody>
                {d.keywords.map((k) => {
                  const ai = k.ai ? AI_TEXT[k.ai] : null;
                  return (
                    <tr key={k.id}>
                      <td style={{ ...td, paddingLeft: 16, fontWeight: 500, overflowWrap: 'anywhere' }}>{k.keyword}</td>
                      <td style={{ ...td, color: C.text, whiteSpace: 'nowrap' }}>{k.city || '-'}</td>
                      <td style={td}><Badge k={k} /></td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}><ChangeText v={k.change} /></td>
                      <td style={{ ...td, color: C.text }}>{k.best ?? '-'}</td>
                      <td style={{ ...td, paddingRight: 16, color: ai ? ai.color : C.muted, fontWeight: 500, whiteSpace: 'nowrap' }}>{ai ? ai.label : 'Not tracked'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

export default async function ClientPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let client: ClientUserRow | null = null;
  try {
    client = await clientByToken(decodeURIComponent(token || ''));
  } catch {
    client = null;
  }
  if (!client) return <Inactive />;

  const brand = await getBranding(client.account_id);
  const accent = /^#[0-9a-f]{6}$/i.test(brand.primaryColor || '') ? brand.primaryColor! : C.indigo;
  const onAccent = textOn(accent);
  const title = brand.agencyName || 'Your rankings';

  const ids = await websiteIdsFor(client);
  const scope = clientScopeSql(client, 1);
  const details = (await Promise.all(ids.map((id) => websiteDetail(client!.account_id, id, 'last', scope))))
    .filter((d): d is WebsiteDetail => !!d);

  return (
    <Shell>
      <header style={{ background: accent, color: onAccent }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          {brand.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoSrc(client.account_id, brand.logoUrl)} alt={title} style={{ maxHeight: 40, maxWidth: 200, objectFit: 'contain', background: '#fff', borderRadius: 6, padding: 4 }} />
          ) : (
            <span style={{ fontSize: 18, fontWeight: 700 }}>{title}</span>
          )}
          <span style={{ fontSize: 14, fontWeight: 500 }}>{client.name}</span>
        </div>
      </header>
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 16px 56px', display: 'flex', flexDirection: 'column', gap: 32, boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: -0.5 }}>Google rankings</h1>
          <p style={{ margin: 0, fontSize: 15, color: C.muted }}>Where your keywords rank today and how they moved since the last check.</p>
        </div>
        {!details.length ? (
          <p style={{ margin: 0, fontSize: 15, color: C.muted }}>There is nothing to show yet. Check back after the next rank check.</p>
        ) : details.map((d) => <SiteSection key={d.website.id} d={d} accent={accent} />)}
      </main>
    </Shell>
  );
}
