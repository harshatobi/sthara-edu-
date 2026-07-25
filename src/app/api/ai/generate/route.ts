import { generateText, streamText } from 'ai';
import { getAIProvider } from '@/lib/ai/config';

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const origin = req.headers.get('origin') || '';
    const referer = req.headers.get('referer') || '';
    const appOrigins = [
      process.env.NEXT_PUBLIC_APP_URL || '',
      'http://localhost:3000',
      'https://stharaschoolos.vercel.app',
      'https://sthara.in',
      'https://www.sthara.in',
    ].filter(Boolean);
    const isInternalOrigin = appOrigins.some(o => origin.startsWith(o) || referer.startsWith(o));
    const hasBearerToken = authHeader.startsWith('Bearer ') && authHeader.length > 20;
    const noOrigin = !origin;

    if (!isInternalOrigin && !hasBearerToken && !noOrigin) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { prompt, systemPrompt, stream = false } = await req.json();

    if (!prompt) {
      return new Response(JSON.stringify({ error: 'Prompt is required' }), { status: 400 });
    }

    const modelId = 'gemini-2.0-flash';
    const model = getAIProvider(modelId);

    if (stream) {
      const result = await streamText({
        model,
        system: systemPrompt,
        prompt: prompt,
      });
      return result.toTextStreamResponse();
    } else {
      const result = await generateText({
        model,
        system: systemPrompt,
        prompt: prompt,
      });
      return new Response(JSON.stringify({ text: result.text }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to generate content';
    console.error('AI Generation Error:', error);
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
}
