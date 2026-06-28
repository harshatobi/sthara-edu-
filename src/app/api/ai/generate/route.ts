import { generateText, streamText } from 'ai';
import { getAIProvider } from '@/lib/ai/config';
import { db } from '@/lib/firebase/config';
import { doc, getDoc } from 'firebase/firestore';

export async function POST(req: Request) {
  try {
    // ── Auth guard: only allow requests from the app itself ────────────────
    // Accept either a Bearer token (server-to-server) OR the app's own origin
    const authHeader = req.headers.get('authorization') || '';
    const origin = req.headers.get('origin') || '';
    const referer = req.headers.get('referer') || '';
    const appOrigins = [
      process.env.NEXT_PUBLIC_APP_URL || '',
      'http://localhost:3000',
      'https://stharaschoolos.vercel.app',
    ].filter(Boolean);
    const isInternalOrigin = appOrigins.some(o => origin.startsWith(o) || referer.startsWith(o));
    const hasBearerToken = authHeader.startsWith('Bearer ') && authHeader.length > 20;

    if (!isInternalOrigin && !hasBearerToken) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { prompt, systemPrompt, stream = false } = await req.json();

    if (!prompt) {
      return new Response(JSON.stringify({ error: 'Prompt is required' }), { status: 400 });
    }

    // 1. Fetch global model preference from Firestore (cached via module-level var)
    let modelId = 'gemini-2.5-flash'; // default: use Flash (faster + cheaper)
    try {
      const docRef = doc(db, 'platform', 'settings');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists() && docSnap.data().defaultModel) {
        modelId = docSnap.data().defaultModel;
      }
    } catch (e) {
      console.warn("Failed to fetch default model, using fallback", e);
    }

    // 2. Resolve the correct AI Provider using our central config
    const model = getAIProvider(modelId);

    // 3. Generate Content
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
