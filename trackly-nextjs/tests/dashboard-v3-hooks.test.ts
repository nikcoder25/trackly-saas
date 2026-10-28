import { describe, it, expect } from 'vitest';
import { agoLabel, untilLabel, lastRunMs, initials } from '@/components/dashboard/v3/hooks';

const H = 3600_000;

describe('v3 dashboard time labels', () => {
  it('agoLabel rounds to the largest sensible unit', () => {
    const now = 1_000_000_000_000;
    expect(agoLabel(null, now)).toBe('never');
    expect(agoLabel(now - 20_000, now)).toBe('just now');
    expect(agoLabel(now - 5 * 60_000, now)).toBe('5m ago');
    expect(agoLabel(now - 3 * H, now)).toBe('3h ago');
    expect(agoLabel(now - 49 * H, now)).toBe('2d ago');
  });

  it('untilLabel says Overdue once a scheduled scan is more than an hour late', () => {
    const now = 1_000_000_000_000;
    expect(untilLabel(null, now)).toBe('Manual scans on your plan');
    expect(untilLabel(now + 30 * 60_000, now)).toBe('Due now');
    expect(untilLabel(now - 30 * 60_000, now)).toBe('Due now');
    expect(untilLabel(now - 2 * H, now)).toBe('Overdue');
    expect(untilLabel(now - 3 * 24 * H, now)).toBe('Overdue');
    expect(untilLabel(now + 5 * H, now)).toBe('In about 5h');
    expect(untilLabel(now + 24 * H, now)).toBe('In about 1 day');
    expect(untilLabel(now + 72 * H, now)).toBe('In about 3 days');
  });

  it('lastRunMs skips reaper and emergency stamps', () => {
    const brand = {
      runs: [
        { time: '2026-09-01T10:00:00Z' },
        { time: '2026-09-02T10:00:00Z', watchdogReap: true },
        { time: '2026-09-03T10:00:00Z', emergencySave: true },
      ],
    };
    expect(lastRunMs(brand)).toBe(new Date('2026-09-01T10:00:00Z').getTime());
    expect(lastRunMs({ runs: [] })).toBeNull();
    expect(lastRunMs(null)).toBeNull();
  });

  it('initials handles one-word and multi-word names', () => {
    expect(initials('Acme')).toBe('AC');
    expect(initials('Acme Widgets Inc')).toBe('AW');
    expect(initials('')).toBe('BR');
  });
});
