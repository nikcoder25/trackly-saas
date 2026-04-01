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

    // Build a helpful response based on common questions
    const q = message.toLowerCase();
    let reply = '';

    if (q.includes('sov') && (q.includes('low') || q.includes('improve') || q.includes('increase'))) {
      reply = `Here are some strategies to improve your Share of Voice (SOV):

1. **Optimize content for AI platforms** — Ensure your website has clear, factual, well-structured content that AI models can reference.
2. **Add more tracked queries** — Cover different variations of how users might ask about your services.
3. **Focus on high-intent queries** — Track queries where users are actively looking for your type of service.
4. **Build citations** — Get your brand mentioned on authoritative sites that AI platforms cite.
5. **Monitor competitors** — See what competitors are doing right and adapt your strategy.

Check the Recommendations page for specific, data-driven suggestions for your brand.`;
    } else if (q.includes('recommend') || q.includes('recommendation')) {
      reply = `The AI Recommends You percentage shows how often AI platforms actively recommend your brand when answering relevant queries.

To improve your recommendation rate:
- Ensure your brand has strong reviews and ratings online
- Create helpful, authoritative content in your niche
- Build a strong local presence if you serve a specific area
- Get featured on comparison and review sites

Visit the Recommendations page for personalized suggestions.`;
    } else if (q.includes('platform') || q.includes('chatgpt') || q.includes('perplexity') || q.includes('claude') || q.includes('gemini') || q.includes('grok')) {
      reply = `Livesov tracks your brand across 5 AI platforms:

- **ChatGPT** (OpenAI) — The most popular AI assistant
- **Perplexity** — AI-powered search engine with citations
- **Claude** (Anthropic) — Known for detailed, nuanced responses
- **Gemini** (Google) — Integrated with Google's knowledge graph
- **Grok** (xAI) — Real-time information from X/Twitter

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
      reply = `Thanks for your question! Here's what I can help with:

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
