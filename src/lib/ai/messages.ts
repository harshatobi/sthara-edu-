import type Anthropic from '@anthropic-ai/sdk';

/**
 * The request shape every text route writes (Gemini's, which they already
 * used), and its conversion to Claude messages. Pure, so it is unit-tested.
 */

export interface AiPart { text?: string; inlineData?: { data: string; mimeType: string } }
export interface AiTurn { role: 'user' | 'model'; parts: AiPart[] }
export interface AiRequest {
  /** An AI_MODELS value: names the job, and is the Gemini model used for it. */
  model: string;
  contents: string | AiTurn[];
  config?: {
    systemInstruction?: string;
    /** 'application/json' asks for one JSON object back. */
    responseMimeType?: string;
    /** Gemini only: Claude's current models take no temperature. */
    temperature?: number;
    maxOutputTokens?: number;
    /** Cancels the call on either provider. */
    abortSignal?: AbortSignal;
  };
}
type MediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
const MEDIA: readonly string[] = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

/** Gemini contents -> Claude messages: model -> assistant, same-role turns merged, starts on a user turn. */
export function toClaudeMessages(contents: AiRequest['contents']): Anthropic.Beta.BetaMessageParam[] {
  const turns: AiTurn[] = typeof contents === 'string' ? [{ role: 'user', parts: [{ text: contents }] }] : contents;
  const out: { role: 'user' | 'assistant'; content: Anthropic.Beta.BetaContentBlockParam[] }[] = [];
  for (const t of turns) {
    const role = t.role === 'model' ? 'assistant' : 'user';
    const blocks: Anthropic.Beta.BetaContentBlockParam[] = [];
    for (const p of t.parts) {
      if (p.inlineData?.data) {
        if (role !== 'user') continue;
        const mt = MEDIA.includes(p.inlineData.mimeType) ? (p.inlineData.mimeType as MediaType) : 'image/jpeg';
        blocks.push({ type: 'image', source: { type: 'base64', media_type: mt, data: p.inlineData.data } });
      } else if (p.text && p.text.trim()) {
        blocks.push({ type: 'text', text: p.text });
      }
    }
    if (!blocks.length) continue;
    if (!out.length && role === 'assistant') continue;
    const last = out[out.length - 1];
    if (last && last.role === role) last.content.push(...blocks);
    else out.push({ role, content: blocks });
  }
  return out;
}
