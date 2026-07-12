/**
 * Fix Engine - spreadsheet tracker (Google Sheets via Apps Script, or any
 * row-append webhook).
 *
 * For teams without Linear/Jira: hand fixes off as rows in a spreadsheet.
 * The user creates a Google Apps Script "web app" bound to their sheet
 * (copy-paste template in the Connections UI), which appends one row per
 * handed-off fix. Creds (encrypted at rest):
 *   { url: "https://script.google.com/macros/s/…/exec", secret: "…" }
 *
 * The secret travels in the JSON body because Apps Script can't read
 * custom request headers. Any webhook that accepts the same payload
 * (Zapier/Make "add row" hooks) works identically.
 *
 * Note: Apps Script web apps answer with a 302 redirect to a
 * googleusercontent.com URL; we treat 2xx/3xx as delivered.
 */

import { safeFetch } from '@/lib/safe-fetch';
import type { Tracker, TrackerCreds, TrackerCreateResult, TrackerIssue, TrackerVerifyResult } from './types';

interface SheetCreds { url: string; secret: string }

function readCreds(raw: TrackerCreds): SheetCreds {
  const c = raw as Partial<SheetCreds>;
  return { url: String(c.url ?? '').trim(), secret: String(c.secret ?? '').trim() };
}

async function post(creds: SheetCreds, payload: Record<string, unknown>): Promise<{ ok: boolean; status: number; detail?: string }> {
  const res = await safeFetch(creds.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, secret: creds.secret }),
    timeoutMs: 15_000,
  });
  // Apps Script replies 302 → googleusercontent; the row is appended
  // before the redirect, so 3xx counts as delivered.
  const ok = res.status >= 200 && res.status < 400;
  return { ok, status: res.status, detail: ok ? undefined : `webhook returned ${res.status}` };
}

export const sheetTracker: Tracker = {
  type: 'sheet',

  async verify(rawCreds): Promise<TrackerVerifyResult> {
    const { url, secret } = readCreds(rawCreds);
    if (!/^https:\/\//i.test(url)) return { ok: false, detail: 'Spreadsheet webhook URL must be https' };
    if (secret.length < 8) return { ok: false, detail: 'Secret must be at least 8 characters' };
    try {
      const r = await post({ url, secret }, { ping: true });
      return r.ok ? { ok: true } : { ok: false, detail: r.detail };
    } catch (e) {
      return { ok: false, detail: (e as Error).message };
    }
  },

  async createIssue(rawCreds, issue: TrackerIssue): Promise<TrackerCreateResult> {
    const creds = readCreds(rawCreds);
    try {
      const r = await post(creds, { title: issue.title, description: issue.description, link: issue.url ?? '' });
      return r.ok ? { ok: true } : { ok: false, detail: r.detail };
    } catch (e) {
      return { ok: false, detail: (e as Error).message };
    }
  },
};
