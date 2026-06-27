import { generateText, streamText } from 'ai';
import { getAIProvider } from '@/lib/ai/config';
import { db } from '@/lib/firebase/config';
import { doc, getDoc } from 'firebase/firestore';

export async function POST(req: Request) {
  try {
    const { prompt, systemPrompt, stream = false } = await req.json();

    if (!prompt) {
      return new Response(JSON.stringify({ error: 'Prompt is required' }), { status: 400 });
    }

    // 1. Fetch global model preference from Firestore
    let modelId = 'gemini-2.5-pro'; // default fallback
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
  } catch (error: any) {
    console.error('AI Generation Error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Failed to generate content' }), { status: 500 });
  }
}
