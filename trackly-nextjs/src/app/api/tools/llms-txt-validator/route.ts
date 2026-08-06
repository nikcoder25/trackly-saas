import { NextRequest } from 'next/server';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { safeFetch, SSRFError } from '@/lib/safe-fetch';
import { logError, serverError } from '@/lib/api-error';

// Validator for the /llms.txt format (spec: https://llmstxt.org).
//
// The spec is short, so the checks below are the whole of it plus the quality
// rules that decide whether a technically-valid file is actually useful to a
// retrieval stack:
//
//   REQUIRED   exactly one H1, first non-blank line, carrying the project name.
//   OPTIONAL   a blockquote summary immediately after the H1.
//   OPTIONAL   H2 sections, each holding a bullet list of markdown links in the
//              form `- [title](url)` with an optional `: description` suffix.
//
// Anything the spec permits but that degrades retrieval (no links at all, an
// oversized section, relative URLs, duplicates) is reported as a WARNING rather
// than an error - the file is still valid, it just will not perform.

const MAX_CONTENT_BYTES = 512 * 1024;
/** Above this, a section stops being a curated list and starts diluting signal. */
const SECTION_URL_WARN = 50;
/** Above this the whole file is too long for most retrieval budgets. */
const TOTAL_URL_WARN = 500;

type Level = 'pass' | 'warn' | 'fail';

interface Check {
  id: string;
  label: string;
  level: Level;
  detail: string;
}

interface ParsedSection {
  title: string;
  links: { title: string; url: string; description?: string }[];
  /** Non-link, non-blank lines directly under this H2. */
  strayLines: number;
}

interface ParseResult {
  h1: string | null;
  h1Count: number;
  h1LineIndex: number;
  firstContentLineIndex: number;
  blockquote: string | null;
  sections: ParsedSection[];
  malformedLinkLines: { line: number; text: string }[];
}

const LINK_RE = /^\s*[-*+]\s+\[([^\]]*)\]\(([^)\s]+)\)\s*(?::\s*(.*))?$/;
/** A bullet that is trying to be a link but isn't well-formed markdown. */
const BULLET_RE = /^\s*[-*+]\s+/;

function parse(content: string): ParseResult {
  const lines = content.split(/\r?\n/);
  const res: ParseResult = {
    h1: null,
    h1Count: 0,
    h1LineIndex: -1,
    firstContentLineIndex: -1,
    blockquote: null,
    sections: [],
    malformedLinkLines: [],
  };

  let current: ParsedSection | null = null;
  let sawH1 = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (res.firstContentLineIndex === -1) res.firstContentLineIndex = i;

    const h1 = /^#\s+(.*)$/.exec(trimmed);
    if (h1) {
      res.h1Count++;
      if (!sawH1) {
        res.h1 = h1[1].trim();
        res.h1LineIndex = i;
        sawH1 = true;
      }
      continue;
    }

    const h2 = /^##\s+(.*)$/.exec(trimmed);
    if (h2) {
      current = { title: h2[1].trim(), links: [], strayLines: 0 };
      res.sections.push(current);
      continue;
    }

    // A blockquote counts as THE description only when it precedes any section.
    if (trimmed.startsWith('>') && !current && res.blockquote === null) {
      res.blockquote = trimmed.replace(/^>\s?/, '').trim();
      continue;
    }

    const link = LINK_RE.exec(line);
    if (link) {
      const entry = {
        title: link[1].trim(),
        url: link[2].trim(),
        description: link[3]?.trim() || undefined,
      };
      if (current) current.links.push(entry);
      else {
        // Links before any H2 still count - the spec allows a bare list.
        current = { title: '', links: [entry], strayLines: 0 };
        res.sections.push(current);
      }
      continue;
    }

    if (BULLET_RE.test(line) && line.includes('[')) {
      res.malformedLinkLines.push({ line: i + 1, text: trimmed.slice(0, 120) });
      continue;
    }

    if (current) current.strayLines++;
  }

  return res;
}

function validate(parsed: ParseResult, content: string): { checks: Check[]; score: number } {
  const checks: Check[] = [];
  const allLinks = parsed.sections.flatMap((s) => s.links);
  const named = parsed.sections.filter((s) => s.title);

  // ── Required: exactly one H1, and it comes first ──
  if (parsed.h1Count === 0) {
    checks.push({
      id: 'h1',
      label: 'H1 project title',
      level: 'fail',
      detail: 'No H1 found. The spec requires a single `# Project Name` heading - it carries the most weight of anything in the file.',
    });
  } else if (parsed.h1Count > 1) {
    checks.push({
      id: 'h1',
      label: 'H1 project title',
      level: 'fail',
      detail: `Found ${parsed.h1Count} H1 headings. The spec allows exactly one; use \`##\` for section headings.`,
    });
  } else if (parsed.h1LineIndex !== parsed.firstContentLineIndex) {
    checks.push({
      id: 'h1',
      label: 'H1 project title',
      level: 'warn',
      detail: `"${parsed.h1}" is present but is not the first content in the file. Move it to the top.`,
    });
  } else {
    checks.push({
      id: 'h1',
      label: 'H1 project title',
      level: 'pass',
      detail: `"${parsed.h1}"`,
    });
  }

  // ── Optional but high-value: the blockquote summary ──
  checks.push(
    parsed.blockquote
      ? { id: 'summary', label: 'Blockquote summary', level: 'pass', detail: `"${parsed.blockquote.slice(0, 160)}"` }
      : {
          id: 'summary',
          label: 'Blockquote summary',
          level: 'warn',
          detail: 'No `> summary` line after the H1. It is optional in the spec, but it is the one sentence a model is most likely to reuse verbatim when describing you.',
        },
  );

  // ── Sections ──
  if (named.length === 0) {
    checks.push({
      id: 'sections',
      label: 'H2 sections',
      level: 'warn',
      detail: 'No `##` sections. A flat link list still parses, but sections tell a model how your site is organised and which topics matter.',
    });
  } else {
    const oversized = named.filter((s) => s.links.length > SECTION_URL_WARN);
    checks.push(
      oversized.length
        ? {
            id: 'sections',
            label: 'H2 sections',
            level: 'warn',
            detail: `${named.length} sections, but ${oversized.length} exceed ${SECTION_URL_WARN} links (${oversized.map((s) => `${s.title}: ${s.links.length}`).join(', ')}). Density beats breadth - trim to your best 10-20 per section.`,
          }
        : { id: 'sections', label: 'H2 sections', level: 'pass', detail: `${named.length} sections: ${named.map((s) => s.title).join(', ')}` },
    );

    const empty = named.filter((s) => s.links.length === 0);
    if (empty.length) {
      checks.push({
        id: 'empty-sections',
        label: 'Empty sections',
        level: 'warn',
        detail: `${empty.length} section(s) contain no links: ${empty.map((s) => s.title).join(', ')}.`,
      });
    }
  }

  // ── Links ──
  if (allLinks.length === 0) {
    checks.push({
      id: 'links',
      label: 'Markdown links',
      level: 'fail',
      detail: 'No `- [title](url)` links found. A file with no links gives a model nothing to retrieve.',
    });
  } else {
    checks.push({
      id: 'links',
      label: 'Markdown links',
      level: allLinks.length > TOTAL_URL_WARN ? 'warn' : 'pass',
      detail:
        allLinks.length > TOTAL_URL_WARN
          ? `${allLinks.length} links - above the ${TOTAL_URL_WARN} that most retrieval budgets will read. Cut to your highest-value pages.`
          : `${allLinks.length} links parsed cleanly.`,
    });
  }

  if (parsed.malformedLinkLines.length) {
    checks.push({
      id: 'malformed',
      label: 'Malformed link syntax',
      level: 'fail',
      detail: `${parsed.malformedLinkLines.length} bullet(s) look like links but do not parse. First: line ${parsed.malformedLinkLines[0].line} - "${parsed.malformedLinkLines[0].text}". Expected \`- [title](https://...)\`.`,
    });
  }

  // ── Absolute URLs ──
  const relative = allLinks.filter((l) => !/^https?:\/\//i.test(l.url));
  checks.push(
    relative.length
      ? {
          id: 'absolute',
          label: 'Absolute URLs',
          level: 'warn',
          detail: `${relative.length} link(s) are relative (e.g. "${relative[0].url}"). Models fetch llms.txt out of context - use full https:// URLs.`,
        }
      : { id: 'absolute', label: 'Absolute URLs', level: 'pass', detail: 'All links are absolute.' },
  );

  // ── Duplicates ──
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const l of allLinks) {
    const k = l.url.replace(/\/$/, '').toLowerCase();
    if (seen.has(k)) dupes.add(l.url);
    seen.add(k);
  }
  if (dupes.size) {
    checks.push({
      id: 'duplicates',
      label: 'Duplicate URLs',
      level: 'warn',
      detail: `${dupes.size} URL(s) appear more than once (e.g. ${[...dupes][0]}). Duplicates waste retrieval budget.`,
    });
  }

  // ── Descriptions ──
  const described = allLinks.filter((l) => l.description).length;
  if (allLinks.length > 0) {
    const pct = Math.round((described / allLinks.length) * 100);
    checks.push({
      id: 'descriptions',
      label: 'Link descriptions',
      level: pct >= 50 ? 'pass' : 'warn',
      detail:
        pct >= 50
          ? `${pct}% of links carry a description.`
          : `Only ${pct}% of links carry a \`: description\`. Descriptions are how a model decides which URL answers a question - aim for your top 20 at minimum.`,
    });
  }

  // ── Size ──
  const bytes = Buffer.byteLength(content, 'utf8');
  checks.push({
    id: 'size',
    label: 'File size',
    level: bytes > 100_000 ? 'warn' : 'pass',
    detail: bytes > 100_000
      ? `${(bytes / 1024).toFixed(0)} KB - large enough that some crawlers will truncate it.`
      : `${(bytes / 1024).toFixed(1)} KB.`,
  });

  const weight = { pass: 1, warn: 0.5, fail: 0 } as const;
  const score = Math.round((checks.reduce((s, c) => s + weight[c.level], 0) / checks.length) * 100);
  return { checks, score };
}

function normalizeLlmsTxtUrl(input: string): string {
  let d = input.trim();
  if (!/^https?:\/\//i.test(d)) d = `https://${d}`;
  const url = new URL(d);
  // Accept a bare domain and resolve the conventional location for them.
  if (!/llms(-full)?\.txt$/i.test(url.pathname)) {
    return `${url.protocol}//${url.host}/llms.txt`;
  }
  return url.toString();
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const { allowed, retryAfter } = await rateLimit(`llms-txt-val:${ip}`, 60 * 60 * 1000, 20);
    if (!allowed) return rateLimitResponse(retryAfter);

    const body = await req.json().catch(() => ({}));
    const rawUrl = typeof body?.url === 'string' ? body.url : '';
    const pasted = typeof body?.content === 'string' ? body.content : '';

    let content = '';
    let source = '';

    if (pasted.trim()) {
      if (Buffer.byteLength(pasted, 'utf8') > MAX_CONTENT_BYTES) {
        return Response.json({ error: 'Pasted content is too large (max 512 KB).' }, { status: 400 });
      }
      content = pasted;
      source = 'pasted content';
    } else if (rawUrl.trim()) {
      if (rawUrl.length > 500) {
        return Response.json({ error: 'URL is too long (max 500 chars).' }, { status: 400 });
      }
      let target: string;
      try {
        target = normalizeLlmsTxtUrl(rawUrl);
      } catch {
        return Response.json({ error: 'Invalid URL.' }, { status: 400 });
      }
      try {
        const res = await safeFetch(target, { timeoutMs: 10_000, maxBytes: MAX_CONTENT_BYTES });
        if (!res.ok) {
          return Response.json(
            { error: `No llms.txt found at ${target} (HTTP ${res.status}).` },
            { status: 404 },
          );
        }
        content = await res.text();
        source = target;
      } catch (err) {
        if (err instanceof SSRFError) {
          return Response.json({ error: 'That URL is not reachable from our servers.' }, { status: 400 });
        }
        return Response.json({ error: `Could not fetch ${target}.` }, { status: 400 });
      }
    } else {
      return Response.json({ error: 'Provide a URL or paste your llms.txt content.' }, { status: 400 });
    }

    if (!content.trim()) {
      return Response.json({ error: 'That file is empty.' }, { status: 400 });
    }

    const parsed = parse(content);
    const { checks, score } = validate(parsed, content);

    return Response.json({
      source,
      score,
      valid: !checks.some((c) => c.level === 'fail'),
      checks,
      stats: {
        sections: parsed.sections.filter((s) => s.title).length,
        links: parsed.sections.reduce((n, s) => n + s.links.length, 0),
        bytes: Buffer.byteLength(content, 'utf8'),
      },
    });
  } catch (error) {
    logError('tools.llms_txt_validator.failed', error);
    return serverError({ message: 'Failed to validate llms.txt. Please try again.' });
  }
}
