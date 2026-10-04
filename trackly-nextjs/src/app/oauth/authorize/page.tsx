import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { pool } from '@/lib/db';
import { COOKIE_NAMES, verifyToken } from '@/lib/auth';
import { validateAuthorizeRequest, OAuthError } from '@/lib/oauth';
import ConsentForm from './ConsentForm';
import './consent.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Connect an app · Livesov', robots: { index: false, follow: false } };

type Search = Record<string, string | string[] | undefined>;

const PARAMS = ['client_id', 'redirect_uri', 'response_type', 'code_challenge', 'code_challenge_method', 'scope', 'state', 'resource'] as const;

/**
 * OAuth consent screen for MCP clients (claude.ai, ChatGPT and others).
 * Middleware sends signed-out visitors to /login first and brings them back.
 */
export default async function AuthorizePage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const q = Object.fromEntries(PARAMS.map(k => [k, typeof sp[k] === 'string' ? (sp[k] as string) : undefined])) as Record<(typeof PARAMS)[number], string | undefined>;

  const store = await cookies();
  const token = store.get(COOKIE_NAMES.access)?.value || store.get('livesov_token')?.value;
  const session = token ? verifyToken(token) : null;
  if (!session) {
    const back = '/oauth/authorize?' + new URLSearchParams(Object.entries(q).filter(([, v]) => v) as [string, string][]).toString();
    redirect(`/login?redirect=${encodeURIComponent(back)}`);
  }

  let problem: string | null = null;
  let appName = '';
  let appHost = '';
  try {
    const { client, params } = await validateAuthorizeRequest(q);
    appName = client.clientName;
    appHost = new URL(params.redirectUri).host;
  } catch (e) {
    problem = e instanceof OAuthError ? e.message : 'This connection request could not be read.';
  }

  const u = await pool.query('SELECT email, name FROM users WHERE id = $1', [session.id]).catch(() => ({ rows: [] as Record<string, unknown>[] }));
  const email = String(u.rows[0]?.email || session.email || '');

  return (
    <main className="oc">
      <div className="oc-card">
        <div className="oc-logos" aria-hidden="true">
          <span className="oc-app">{(appName || '?').charAt(0).toUpperCase()}</span>
          <span className="oc-dots"><i /><i /><i /></span>
          <span className="oc-lv">
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none"><path d="M2 9h2l2-5 3 9 2-6 1 2h2" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
        </div>
        {problem ? (
          <>
            <h1 className="oc-t">This connection didn&rsquo;t work</h1>
            <p className="oc-p">{problem}</p>
            <a className="oc-btn oc-btn-2" href="/dashboard">Go to your dashboard</a>
          </>
        ) : (
          <>
            <h1 className="oc-t"><b>{appName}</b> wants to connect to your Livesov account</h1>
            <p className="oc-p">Signed in as <b>{email}</b></p>
            <div className="oc-list">
              <div className="oc-list-h">It will be able to</div>
              <ul>
                <li>See your brands, AI visibility, rivals and the answers AI engines gave</li>
                <li>See and update your fix list</li>
                <li>Start scans, which use your scan credits</li>
              </ul>
              <div className="oc-list-h">It can&rsquo;t</div>
              <ul className="oc-no">
                <li>Change your password, billing or plan</li>
                <li>Delete brands or your account</li>
              </ul>
            </div>
            <ConsentForm params={q} />
            <p className="oc-foot">After you allow it, you&rsquo;ll go back to <b>{appHost}</b>. You can disconnect it any time in Account &amp; Plan.</p>
          </>
        )}
      </div>
    </main>
  );
}
