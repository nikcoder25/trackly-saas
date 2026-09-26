/**
 * Seeds a local Postgres with one owner account and two brands whose run
 * history, recommendations and accuracy issues exercise every dashboard page.
 * Idempotent: wipes and re-creates the seed rows on every call.
 *
 *   DATABASE_URL=postgres://postgres@localhost:5432/livesov node tests/e2e-v3/seed.cjs
 *
 * The app must have booted once against the database so its migrations have
 * created the tables. Login: owner@test.dev / Passw0rd!Passw0rd
 */
const { Client } = require('pg');
const bcrypt = require('bcryptjs');

const EMAIL = 'owner@test.dev';
const PASSWORD = 'Passw0rd!Passw0rd';
const USER_ID = 'seed_owner_1';
const ENGINES = ['ChatGPT', 'Claude', 'Gemini', 'Perplexity', 'Grok'];
const RIVALS = ['Polar Air Pros', 'Summit Heating', 'BlueFlame HVAC'];
const QUERIES = [
  'best hvac company in denver',
  'emergency furnace repair denver',
  'who installs heat pumps in denver',
  'affordable ac repair near me denver',
  'denver hvac company with best reviews',
  'polar air pros vs cool breeze hvac',
];
const CITES = ['yelp.com', 'angi.com', 'coolbreezehvac.com', 'reddit.com', 'bbb.org', 'homeadvisor.com', 'google.com'];

// Deterministic pseudo-random so screenshots are stable run to run.
let seed = 42;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function buildRun(i, total, brandName) {
  const time = new Date(Date.now() - (total - 1 - i) * 3 * 86400_000 - 2 * 3600_000).toISOString();
  const allResults = [];
  const platforms = {};
  const competitors = {};
  const citations = {};
  for (const engine of ENGINES) {
    // Grok is the deliberate weak spot; everything else improves over time.
    const base = engine === 'Grok' ? 0.12 : 0.32 + i * 0.03 + (engine === 'ChatGPT' ? 0.1 : 0);
    let m = 0;
    for (const q of QUERIES) {
      const mentioned = rnd() < base;
      if (mentioned) m++;
      const comps = RIVALS.filter(() => rnd() < 0.35);
      for (const c of comps) competitors[c] = (competitors[c] || 0) + 1;
      const cits = CITES.filter(() => rnd() < 0.3).map(d => `https://${d}/${q.split(' ')[0]}`);
      for (const c of cits) { const h = new URL(c).hostname; citations[h] = (citations[h] || 0) + 1; }
      allResults.push({
        query: q, platform: engine, model: engine.toLowerCase() + '-model', mentioned,
        sentiment: mentioned ? (rnd() < 0.7 ? 'positive' : 'neutral') : undefined,
        position: mentioned ? 1 + Math.floor(rnd() * 3) : undefined,
        competitorMentions: comps, citations: cits,
        response: mentioned
          ? `${brandName} is a well reviewed HVAC company in Denver. ${comps.join(', ')} are also options.`
          : `Popular choices include ${comps.join(', ') || 'several local firms'}.`,
      });
    }
    platforms[engine] = { sov: Math.round((m / QUERIES.length) * 100), total: QUERIES.length, mentions: m, errors: 0 };
  }
  const totalM = allResults.filter(r => r.mentioned).length;
  return {
    id: `run_${brandName.replace(/\W/g, '')}_${i}`, time, date: time,
    sov: Math.round((totalM / allResults.length) * 100), totalM, totalQ: allResults.length,
    platforms, competitors, citations, allResults,
  };
}

async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL || 'postgres://postgres@localhost:5432/livesov' });
  await db.connect();
  const hash = await bcrypt.hash(PASSWORD, 10);
  await db.query('DELETE FROM users WHERE email = $1 OR id = $2', [EMAIL, USER_ID]);
  await db.query(`DELETE FROM brands WHERE user_id = $1`, [USER_ID]);
  await db.query(
    `INSERT INTO users (id, email, username, name, password_hash, plan, role, email_verified, settings)
     VALUES ($1, $2, 'nikowner', 'Nik Owner', $3, 'owner', 'admin', true, '{}')`,
    [USER_ID, EMAIL, hash],
  );
  const brands = [
    { id: 'seed_brand_1', name: 'Cool Breeze HVAC', city: 'Denver', website: 'coolbreezehvac.com', runs: 8 },
    { id: 'seed_brand_2', name: 'Aspen Plumbing Co', city: 'Boulder', website: 'aspenplumbing.com', runs: 3 },
  ];
  for (const b of brands) {
    await db.query('DELETE FROM recommendations WHERE brand_id = $1', [b.id]);
    await db.query('DELETE FROM accuracy_issues WHERE brand_id = $1', [b.id]);
    await db.query('DELETE FROM alert_rules WHERE brand_id = $1', [b.id]);
    await db.query('DELETE FROM brand_facts WHERE brand_id = $1', [b.id]);
    await db.query('DELETE FROM brands WHERE id = $1', [b.id]);
    const runs = Array.from({ length: b.runs }, (_, i) => buildRun(i, b.runs, b.name));
    const data = {
      name: b.name, website: b.website, city: b.city, industry: 'HVAC', goal: 60,
      description: `${b.name} is a family owned home services company.`,
      queries: QUERIES, competitors: RIVALS, platforms: ENGINES.map(e => e.toLowerCase()),
      runs, mentions: [], queryStats: {}, sovHistory: runs.map(r => ({ date: r.time, sov: r.sov })),
      schedule: 24,
    };
    await db.query(
      `INSERT INTO brands (id, user_id, data, created_at) VALUES ($1, $2, $3, NOW() - interval '30 days')`,
      [b.id, USER_ID, JSON.stringify(data)],
    );
    const recs = [
      ['critical', 'Get listed on Angi with your Denver service area', 'Angi is cited in 1 of 3 answers for your category.'],
      ['high', 'Add an FAQ page answering "emergency furnace repair"', 'AI engines quote FAQ pages for urgent service questions.'],
      ['high', 'Fix your opening hours on Yelp', 'Two engines repeat the wrong hours from Yelp.'],
      ['medium', 'Publish a heat pump install guide for Denver', 'Rivals win this prompt with a local guide.'],
      ['low', 'Ask happy customers for Google reviews', 'Review volume trails the category leader.'],
    ];
    let n = 0;
    for (const [severity, title, description] of recs) {
      await db.query(
        `INSERT INTO recommendations (id, brand_id, type, severity, title, description, status, created_at)
         VALUES ($1, $2, 'content', $3, $4, $5, 'open', NOW() - ($6 || ' hours')::interval)`,
        [`rec_${b.id}_${n}`, b.id, severity, title, description, String(n++)],
      );
    }
    await db.query(
      `INSERT INTO brand_facts (brand_id, fact_key, fact_value, category) VALUES
       ($1, 'phone', '(303) 555-0142', 'contact'), ($1, 'hours', 'Mon-Sat 7am-7pm', 'hours')`, [b.id]);
    await db.query(
      `INSERT INTO accuracy_issues (brand_id, platform, fact_key, expected, found, severity, category, explanation, query, date, fixed)
       VALUES ($1, 'Gemini', 'hours', 'Mon-Sat 7am-7pm', 'Open 24/7', 'high', 'hours', 'Gemini says you are open 24/7.', $2, NOW(), false),
              ($1, 'Grok', 'phone', '(303) 555-0142', '(303) 555-0100', 'medium', 'contact', 'Grok lists an old phone number.', $2, NOW(), true)`,
      [b.id, QUERIES[1]],
    );
  }
  await db.end();
  console.log('seeded', EMAIL);
}

main().catch(e => { console.error(e); process.exit(1); });
