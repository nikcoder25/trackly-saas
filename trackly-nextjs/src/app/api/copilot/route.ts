import { NextRequest } from 'next/server';
import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const authResult = await requireVerifiedAuth(request, pool);
  if (authResult instanceof Response) return authResult;
  const user = authResult;

  try {
    const { message, history } = await request.json();
    if (!message) return Response.json({ error: 'Message required' }, { status: 400 });

    // Fetch the user's brand data for context-aware answers
    let brandSummary = '';
    try {
      const brandsResult = await pool.query('SELECT * FROM brands WHERE user_id = $1 ORDER BY created_at LIMIT 5', [user.id]);
      if (brandsResult.rows.length > 0) {
        const summaries = brandsResult.rows.map((row: Record<string, unknown>) => {
          const data = (row.data as Record<string, unknown>) || {};
          const runs = (data.runs as Array<Record<string, unknown>>) || [];
          const latestRun = runs.length > 0 ? runs[runs.length - 1] : null;
          const sov = latestRun ? (latestRun.sov as number) || 0 : 0;
          const allResults = latestRun ? (latestRun.allResults as Array<Record<string, unknown>>) || [] : [];
          const totalChecks = allResults.length;
          const found = allResults.filter((r: Record<string, unknown>) => r.mentioned).length;
          const platforms = [...new Set(allResults.map((r: Record<string, unknown>) => r.platform))];
          const queries = (data.queries as string[]) || [];
          const competitors = (data.competitors as string[]) || [];

          return {
            name: data.name || 'Unknown',
            sov,
            totalChecks,
            found,
            notFound: totalChecks - found,
            platforms,
            queryCount: queries.length,
            competitorCount: competitors.length,
            totalRuns: runs.length,
          };
        });

        brandSummary = summaries.map(s =>
          `Brand "${s.name}": SOV ${s.sov}%, ${s.found}/${s.totalChecks} found, ${s.platforms.length} platforms (${s.platforms.join(', ')}), ${s.queryCount} queries, ${s.competitorCount} competitors, ${s.totalRuns} total runs`
        ).join('\n');
      }
    } catch {
      // Continue without brand data if fetch fails
    }

    // Build a helpful response based on common questions with actual data
    const q = message.toLowerCase();
    let reply = '';

    if (q.includes('visibility') || q.includes('score') || q.includes('sov') || q.includes('overall')) {
      if (brandSummary) {
        reply = `Here's your current brand visibility data:\n\n${brandSummary}\n\nYour Share of Voice (SOV) represents how often AI platforms mention your brand when asked relevant queries. `;
        reply += `To improve, focus on creating authoritative content, building citations on reputable sites, and tracking more relevant queries.`;
      } else {
        reply = `I don't have any brand data yet. Set up a brand and run queries to start tracking your AI visibility score.`;
      }
    } else if (q.includes('sov') && (q.includes('low') || q.includes('improve') || q.includes('increase'))) {
      reply = `Here are some strategies to improve your Share of Voice (SOV):

1. **Optimize content for AI platforms** — Ensure your website has clear, factual, well-structured content that AI models can reference.
2. **Add more tracked queries** — Cover different variations of how users might ask about your services.
3. **Focus on high-intent queries** — Track queries where users are actively looking for your type of service.
4. **Build citations** — Get your brand mentioned on authoritative sites that AI platforms cite.
5. **Monitor competitors** — See what competitors are doing right and adapt your strategy.`;
      if (brandSummary) reply += `\n\nYour current data:\n${brandSummary}`;
      reply += `\n\nCheck the Recommendations page for specific, data-driven suggestions for your brand.`;
    } else if (q.includes('recommend') || q.includes('recommendation')) {
      reply = `The AI Recommends You percentage shows how often AI platforms actively recommend your brand when answering relevant queries.

To improve your recommendation rate:
- Ensure your brand has strong reviews and ratings online
- Create helpful, authoritative content in your niche
- Build a strong local presence if you serve a specific area
- Get featured on comparison and review sites

Visit the Recommendations page for personalized suggestions.`;
    } else if (q.includes('platform') || q.includes('chatgpt') || q.includes('perplexity') || q.includes('claude') || q.includes('gemini') || q.includes('grok')) {
      reply = `Livesov tracks your brand across 6 AI platforms:

- **ChatGPT** (OpenAI) — The most popular AI assistant
- **Perplexity** — AI-powered search engine with citations
- **Claude** (Anthropic) — Known for detailed, nuanced responses
- **Gemini** (Google) — Integrated with Google's knowledge graph
- **Grok** (xAI) — Real-time information from X/Twitter
- **Google AI Overviews** (DataForSEO) — AI-generated summaries in Google Search results

Each platform has different data sources and response patterns. Check the Platform Status page for health and performance details.`;
    } else if (q.includes('competitor') || q.includes('competition')) {
      reply = `Competitor tracking helps you understand how your brand compares to others in AI responses.

You can:
1. Add competitors in Brand Setup
2. See co-occurrence data (how often competitors appear alongside your brand)
3. Compare mention rates across platforms
4. Track competitor sentiment

Visit the Competitors page for detailed analysis.`;
    } else {
      if (brandSummary) {
        reply = `Here's a summary of your brand data:\n\n${brandSummary}\n\nI can help with:\n`;
      } else {
        reply = `Thanks for your question! Here's what I can help with:\n\n`;
      }
      reply += `- **"What is my visibility score?"** — Get your current SOV and mention stats
- **SOV Strategy** — Ask about improving your Share of Voice
- **Platform Analysis** — Ask about specific AI platforms
- **Competitor Insights** — Ask about tracking competitors
- **Recommendations** — Ask for optimization suggestions
- **Query Strategy** — Ask about which queries to track

Feel free to ask a specific question and I'll provide detailed guidance based on your brand's data.`;
    }

    return Response.json({ reply });
  } catch {
    return Response.json({ error: 'Failed to process request' }, { status: 500 });
  }
}
