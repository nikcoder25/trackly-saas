/**
 * Fix Engine - Jira (Cloud) tracker adapter.
 *
 * Auth: Basic auth with an Atlassian account email + API token
 * (id.atlassian.com → Security → API tokens). Creds shape (encrypted at
 * rest in fix_connections):
 *   { email, apiToken, domain, projectKey, issueType? }
 * `domain` may be "acme", "acme.atlassian.net", or a full URL.
 *
 * Uses Jira Cloud REST API v3 (description is Atlassian Document Format).
 */

import { safeFetch } from '@/lib/safe-fetch';
import type { Tracker, TrackerCreds, TrackerCreateResult, TrackerIssue, TrackerVerifyResult } from './types';

interface JiraCreds { email: string; apiToken: string; domain: string; projectKey: string; issueType: string }

function readCreds(raw: TrackerCreds): JiraCreds {
  const c = raw as Partial<JiraCreds>;
  return {
    email: String(c.email ?? '').trim(),
    apiToken: String(c.apiToken ?? '').trim(),
    domain: String(c.domain ?? '').trim(),
    projectKey: String(c.projectKey ?? '').trim().toUpperCase(),
    issueType: String(c.issueType ?? 'Task').trim() || 'Task',
  };
}

/** Resolve a domain input to the site origin. */
function originFor(domain: string): string {
  const d = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!d) return '';
  return d.includes('.') ? `https://${d}` : `https://${d}.atlassian.net`;
}

function authHeader(creds: JiraCreds): string {
  return 'Basic ' + Buffer.from(`${creds.email}:${creds.apiToken}`).toString('base64');
}

/** Minimal Atlassian Document Format wrapper for a plain paragraph. */
function adf(text: string): Record<string, unknown> {
  return {
    type: 'doc',
    version: 1,
    content: text.split('\n').filter(Boolean).map((line) => ({
      type: 'paragraph',
      content: [{ type: 'text', text: line }],
    })),
  };
}

export const jiraTracker: Tracker = {
  type: 'jira',

  async verify(rawCreds): Promise<TrackerVerifyResult> {
    const creds = readCreds(rawCreds);
    if (!creds.email || !creds.apiToken) return { ok: false, detail: 'Missing Jira email or API token' };
    const origin = originFor(creds.domain);
    if (!origin) return { ok: false, detail: 'Missing Jira site domain' };
    if (!creds.projectKey) return { ok: false, detail: 'Missing Jira project key' };
    try {
      const res = await safeFetch(`${origin}/rest/api/3/myself`, {
        headers: { Authorization: authHeader(creds), Accept: 'application/json' },
        timeoutMs: 12_000,
      });
      if (res.status === 401 || res.status === 403) return { ok: false, detail: 'Invalid Jira email or API token' };
      if (!res.ok) return { ok: false, detail: `Jira returned HTTP ${res.status}` };
      return { ok: true };
    } catch (e) {
      return { ok: false, detail: (e as Error).message };
    }
  },

  async createIssue(rawCreds, issue: TrackerIssue): Promise<TrackerCreateResult> {
    const creds = readCreds(rawCreds);
    const origin = originFor(creds.domain);
    const body = issue.url ? `${issue.description}\nOpen in Livesov: ${issue.url}` : issue.description;
    try {
      const res = await safeFetch(`${origin}/rest/api/3/issue`, {
        method: 'POST',
        headers: { Authorization: authHeader(creds), 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          fields: {
            project: { key: creds.projectKey },
            summary: issue.title.slice(0, 250),
            description: adf(body),
            issuetype: { name: creds.issueType },
          },
        }),
        timeoutMs: 12_000,
      });
      const json = (await res.json().catch(() => ({}))) as { key?: string };
      if (!res.ok || !json.key) return { ok: false, detail: `Jira rejected the issue (HTTP ${res.status})` };
      return { ok: true, id: json.key, url: `${origin}/browse/${json.key}` };
    } catch (e) {
      return { ok: false, detail: (e as Error).message };
    }
  },
};
