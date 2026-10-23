/**
 * Pure helpers for the free-text brand location (brand.city, e.g.
 * "Hatfield, England" or "Austin, TX") and brand.country.
 */

import { COUNTRIES } from '@/lib/constants';

export interface SplitLocation {
  city: string;
  region: string;
  country: string;
}

/**
 * Split "City, Region[, Country]" into its parts. "Hatfield, England" gives
 * city "Hatfield" and region "England"; a value without commas is all city.
 */
export function splitCityRegion(location: string | null | undefined): SplitLocation {
  const parts = String(location ?? '').split(',').map(p => p.trim()).filter(Boolean);
  return {
    city: parts[0] ?? '',
    region: parts[1] ?? '',
    country: parts.length > 2 ? parts.slice(2).join(', ') : '',
  };
}

// Common names and constituent parts that map onto a COUNTRIES entry.
const COUNTRY_ALIASES: Record<string, string> = {
  uk: 'United Kingdom', 'u.k.': 'United Kingdom', gb: 'United Kingdom', 'great britain': 'United Kingdom',
  britain: 'United Kingdom', england: 'United Kingdom', scotland: 'United Kingdom', wales: 'United Kingdom',
  'northern ireland': 'United Kingdom',
  us: 'United States', usa: 'United States', 'u.s.': 'United States', 'u.s.a.': 'United States',
  'united states of america': 'United States', america: 'United States',
  uae: 'United Arab Emirates', 'south korea': 'South Korea', korea: 'South Korea',
  holland: 'Netherlands', 'the netherlands': 'Netherlands',
};

/** Resolve a free-text place name to an entry of COUNTRIES, or null. */
export function matchCountry(name: string | null | undefined): string | null {
  const key = String(name ?? '').trim().toLowerCase();
  if (!key) return null;
  const direct = COUNTRIES.find(c => c.toLowerCase() === key);
  if (direct) return direct;
  return COUNTRY_ALIASES[key] ?? null;
}

/**
 * The country a brand most likely operates in: its saved country, else the
 * last part of its location that names a country ("Hatfield, England" is in
 * the United Kingdom). Falls back to `fallback`.
 */
export function brandDefaultCountry(
  brand: { country?: unknown; city?: unknown; location?: unknown } | null | undefined,
  fallback: string = COUNTRIES[0],
): string {
  if (!brand) return fallback;
  const saved = matchCountry(typeof brand.country === 'string' ? brand.country : '');
  if (saved) return saved;
  for (const field of [brand.location, brand.city]) {
    if (typeof field !== 'string') continue;
    const parts = field.split(',').map(p => p.trim()).filter(Boolean);
    for (let i = parts.length - 1; i >= 0; i--) {
      const hit = matchCountry(parts[i]);
      if (hit) return hit;
    }
  }
  return fallback;
}
