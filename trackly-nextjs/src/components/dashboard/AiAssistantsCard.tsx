'use client';
// Account page: personal API keys + copy-paste setup for the Livesov MCP
// server, so customers can ask Claude, Cursor and other MCP apps about their AI
// visibility.

import { useCallback, useEffect, useState } from 'react';
import { Card, Badge, Seg } from '@/app/dashboard-v2/ui';
import { useToast } from '@/components/dashboard/Toast';

interface ApiKey { id: string; name: string; hint: string; createdAt: string; lastUsedAt: string | null }

type Client = 'claude-code' | 'claude-desktop' | 'cursor' | 'vscode' | 'other';

const PLACEHOLDER = 'YOUR_API_KEY';

function snippet(client: Client, url: string, key: string): string {
  switch (client) {
    case 'claude-code':
      return `claude mcp add --transport http livesov ${url} \\\n  --header "Authorization: Bearer ${key}"`;
    case 'claude-desktop':
      return JSON.stringify({
        mcpServers: {
          livesov: {
            command: 'npx',
            args: ['-y', 'mcp-remote', url, '--header', 'Authorization:${LIVESOV_AUTH}'],
            env: { LIVESOV_AUTH: `Bearer ${key}` },
          },
        },
      }, null, 2);
    case 'cursor':
      return JSON.stringify({ mcpServers: { livesov: { url, headers: { Authorization: `Bearer ${key}` } } } }, null, 2);
    case 'vscode':
      return JSON.stringify({ servers: { livesov: { type: 'http', url, headers: { Authorization: `Bearer ${key}` } } } }, null, 2);
    default:
      return `Server URL:  ${url}\nTransport:   Streamable HTTP\nHeader:      Authorization: Bearer ${key}`;
  }
}

const WHERE: Record<Client, string> = {
  'claude-code': 'Run this in your terminal.',
  'claude-desktop': 'Claude Desktop → Settings → Developer → Edit config. Paste into claude_desktop_config.json, then restart Claude. Needs Node.js installed.',
  cursor: 'Cursor → Settings → MCP → Add new server, or paste into ~/.cursor/mcp.json.',
  vscode: 'Paste into .vscode/mcp.json in your project (VS Code with Copilot agent mode).',
  other: 'Use these details in any app that supports remote MCP servers with a custom header.',
};

function when(iso: string | null) {
  if (!iso) return 'Never used';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

async function copy(text: string, toast: (m: string, t?: 'success' | 'error' | 'info') => void) {
  try { await navigator.clipboard.writeText(text); toast('Copied', 'success'); }
  catch { toast('Copy failed. Select the text and copy it by hand.', 'error'); }
}

export default function AiAssistantsCard() {
  const { toast } = useToast();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [max, setMax] = useState(10);
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null);
  const [client, setClient] = useState<Client>('claude-code');
  const [origin, setOrigin] = useState('https://livesov.com');
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => { setOrigin(window.location.origin); }, []);
  const url = `${origin}/api/mcp`;

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/api-keys', { credentials: 'include', cache: 'no-store' });
      if (res.ok) { const d = await res.json(); setKeys(d.keys || []); setMax(d.max || 10); }
    } finally { setLoaded(true); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/api-keys', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Could not create the key');
      setFresh(d.key); setName(''); await load();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally { setBusy(false); }
  };

  const revoke = async (id: string) => {
    setConfirmId(null);
    const res = await fetch(`/api/api-keys/${id}`, { method: 'DELETE', credentials: 'include' });
    if (res.ok) { toast('Key deleted. Apps using it stop working right away.', 'success'); await load(); }
    else toast('Could not delete the key', 'error');
  };

  const code = snippet(client, url, fresh || PLACEHOLDER);

  return (
    <Card title="Connect AI assistants" right={<Badge tone="acc">MCP</Badge>}
      lede="Ask Claude, Cursor and other AI apps about your AI visibility, rivals and fixes, using your live Livesov data.">
      <div className="aic">
        <ol className="aic-steps">
          <li><b>Create a key.</b> It works like a password for your account, so keep it private.</li>
          <li><b>Add Livesov to your app</b> with the setup below.</li>
          <li><b>Ask a question</b>, like &ldquo;Which buyer questions am I losing to rivals?&rdquo;</li>
        </ol>

        <div className="aic-create">
          <label htmlFor="aic-name" className="aic-label">Key name</label>
          <div className="aic-row">
            <input id="aic-name" className="fld-in" placeholder="e.g. Claude on my laptop" value={name} maxLength={60}
              onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !busy) create(); }} />
            <button type="button" className="btn-p" onClick={create} disabled={busy || keys.length >= max}>
              {busy ? 'Creating…' : 'Create key'}
            </button>
          </div>
          {keys.length >= max && <p className="aic-note">You have {max} keys, the maximum. Delete one to create another.</p>}
        </div>

        {fresh && (
          <div className="aic-fresh" role="status">
            <div className="aic-fresh-t">Copy your key now. You won&rsquo;t see it again.</div>
            <div className="aic-keybox">
              <code>{fresh}</code>
              <button type="button" className="btn-g" onClick={() => copy(fresh, toast)}>Copy key</button>
            </div>
            <button type="button" className="aic-link" onClick={() => setFresh(null)}>I&rsquo;ve saved it, hide the key</button>
          </div>
        )}

        <div className="aic-setup">
          <div className="aic-label">Setup</div>
          <Seg value={client} onChange={v => setClient(v as Client)} options={[
            { value: 'claude-code', label: 'Claude Code' },
            { value: 'claude-desktop', label: 'Claude Desktop' },
            { value: 'cursor', label: 'Cursor' },
            { value: 'vscode', label: 'VS Code' },
            { value: 'other', label: 'Other' },
          ]} />
          <p className="aic-note">{WHERE[client]}{!fresh && ` Replace ${PLACEHOLDER} with your key.`}</p>
          <div className="aic-code">
            <pre><code>{code}</code></pre>
            <button type="button" className="btn-g" onClick={() => copy(code, toast)}>Copy</button>
          </div>
        </div>

        <div className="aic-keys">
          <div className="aic-label">Your keys</div>
          {!loaded ? <p className="aic-note">Loading…</p> : keys.length === 0 ? (
            <p className="aic-note">No keys yet.</p>
          ) : (
            <ul>
              {keys.map(k => (
                <li key={k.id}>
                  <span className="aic-kname">{k.name}</span>
                  <code className="aic-khint">{k.hint}</code>
                  <span className="aic-kmeta">Created {when(k.createdAt)} · {k.lastUsedAt ? `Last used ${when(k.lastUsedAt)}` : 'Never used'}</span>
                  {confirmId === k.id ? (
                    <span className="aic-confirm">
                      <button type="button" className="btn-d btn-danger" onClick={() => revoke(k.id)}>Delete</button>
                      <button type="button" className="btn-d" onClick={() => setConfirmId(null)}>Keep</button>
                    </span>
                  ) : (
                    <button type="button" className="btn-d" onClick={() => setConfirmId(k.id)} aria-label={`Delete key ${k.name}`}>Delete</button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <style>{`
        .aic { display: flex; flex-direction: column; gap: 20px; }
        .aic-steps { margin: 0; padding-left: 22px; list-style: decimal; display: grid; gap: 6px; font-size: 14px; color: var(--text-2); }
        .aic-steps b { color: var(--text); font-weight: 600; }
        .aic-label { font-size: 13px; font-weight: 600; color: var(--text); margin-bottom: 8px; }
        .aic-row { display: flex; gap: 8px; flex-wrap: wrap; }
        .aic-row .fld-in { flex: 1 1 240px; min-width: 0; padding: 0 12px; }
        .aic-note { margin: 8px 0 0; font-size: 13px; color: var(--text-3); }
        .aic-fresh { border-radius: 14px; padding: 14px 16px; background: var(--success-50); display: flex; flex-direction: column; gap: 10px; }
        .aic-fresh-t { font-weight: 600; font-size: 14px; color: var(--success); }
        .aic-keybox { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
        .aic-keybox code { flex: 1 1 260px; min-width: 0; overflow-wrap: anywhere; padding: 10px 12px; border-radius: 10px; background: var(--surface); font-size: 13px; user-select: all; }
        .aic-link { align-self: flex-start; background: none; border: 0; padding: 0; color: var(--text-2); font-size: 13px; text-decoration: underline; cursor: pointer; }
        .aic-setup .seg { max-width: 100%; overflow-x: auto; }
        .aic-code { position: relative; margin-top: 10px; border-radius: 14px; background: #1D1D1F; }
        .aic-code pre { margin: 0; padding: 16px 18px; padding-right: 88px; overflow-x: auto; color: #F2F2F7; font-size: 12.5px; line-height: 1.6; }
        .aic-code .btn-g { position: absolute; top: 10px; right: 10px; min-height: 32px; padding: 0 12px; font-size: 12.5px; }
        .aic-keys ul { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--line); }
        .aic-keys li { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 4px 12px; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--line); }
        .aic-kname { font-weight: 600; font-size: 14px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .aic-khint { font-size: 12.5px; color: var(--text-3); }
        .aic-kmeta { grid-column: 1 / 2; font-size: 12.5px; color: var(--text-3); }
        .aic-keys li > .btn-d, .aic-confirm { grid-column: 3; grid-row: 1 / span 2; }
        .aic-confirm { display: inline-flex; gap: 6px; }
        @media (max-width: 639px) {
          .aic-code pre { padding-right: 18px; }
          .aic-code .btn-g { position: static; margin: 0 12px 12px; }
          .aic-keys li { grid-template-columns: minmax(0, 1fr) auto; }
          .aic-khint { grid-column: 1; }
          .aic-kmeta { grid-column: 1; }
          .aic-keys li > .btn-d, .aic-confirm { grid-column: 2; grid-row: 1 / span 3; }
        }
      `}</style>
    </Card>
  );
}
