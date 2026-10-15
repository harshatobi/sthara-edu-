import { randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { requireStaff } from '@/lib/teacher/serverAuth';
import { inScope } from '@/lib/teacher/scope';
import { checkRateLimit } from '@/lib/rateLimit';
import { AI_MODELS, limitOf } from '@/lib/settings/limits';
import { aiGate } from '@/lib/settings/server';
import { generateMetered } from '@/lib/ai/usage';
import { aiFailure, withRetry } from '@/lib/ai/retry';

export const dynamic = 'force-dynamic';
export const maxDuration = 90;

const BUCKET = 'copilot-images';
const LINK_SECONDS = 600;
const PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.png$/;
const str = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

/**
 * Copilot illustrations.
 *   POST { class, subject, prompt }  generate one image (costs money: the teacher asks for it), store it privately
 *                                     -> { path, url }
 *   GET  ?path=<school>/<teacher>/<id>.png   a fresh signed link (10 minutes), staff of that school only
 *
 * Labels are never drawn by the model (image models misspell them); diagrams with labels are the SVG kind.
 */
export async function POST(req: NextRequest) {
  const auth = await requireStaff(req, { academic: true });
  if ('res' in auth) return auth.res;
  const { staff, db } = auth;
  if (!checkRateLimit(`copilotImage:${staff.id}`, ...limitOf('copilotImage')).allowed) {
    return NextResponse.json({ error: 'That’s a lot of pictures at once. Try again in a few minutes.' }, { status: 429 });
  }
  const b = await req.json().catch(() => null);
  const cls = str(b?.class, 40), subject = str(b?.subject, 60), prompt = str(b?.prompt, 800);
  if (!cls || !subject || prompt.length < 8) return NextResponse.json({ error: 'Describe the picture you want.' }, { status: 400 });
  if (staff.role === 'teacher' && !inScope(staff.scope, cls, subject)) return NextResponse.json({ error: `You don't teach ${subject} to ${cls}.` }, { status: 403 });

  const aiBlocked = await aiGate(staff.id, 'teacherTools');
  if (aiBlocked) return aiBlocked;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'Pictures aren’t set up on this server (no AI key).' }, { status: 503 });

  const framed = [
    `An illustration for a CBSE ${subject} class (${cls}) in an Indian school, to show on a classroom board or print on a worksheet.`,
    prompt,
    'Style: clear, friendly educational illustration with a plain light background and good contrast. Scientifically and historically accurate.',
    'Do not include any text, letters, numbers or labels in the image. No logos, brands or real people.',
  ].join('\n');

  try {
    const ai = new GoogleGenAI({ apiKey });
    const res = await withRetry(() => generateMetered(ai, {
      model: AI_MODELS.image,
      contents: [{ role: 'user', parts: [{ text: framed }] }],
      config: { responseModalities: ['TEXT', 'IMAGE'] },
    }, { feature: 'copilotImage', userId: staff.id, schoolId: staff.schoolId }), { tries: 2 });
    const part = res.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.data && /^image\//.test(p.inlineData.mimeType ?? ''));
    if (!part?.inlineData?.data) return NextResponse.json({ error: 'No picture came back. Try describing it differently.' }, { status: 502 });

    const path = `${staff.schoolId}/${staff.id}/${randomUUID()}.png`;
    const bytes = Buffer.from(part.inlineData.data, 'base64');
    const { error: upErr } = await db.storage.from(BUCKET).upload(path, bytes, { contentType: part.inlineData.mimeType || 'image/png', upsert: false });
    if (upErr) { console.error('[copilot image] upload', upErr.message); return NextResponse.json({ error: 'Could not keep the picture. Try again.' }, { status: 500 }); }
    const { data: link } = await db.storage.from(BUCKET).createSignedUrl(path, LINK_SECONDS);
    return NextResponse.json({ path, url: link?.signedUrl ?? null });
  } catch (e: any) {
    console.error('[copilot image]', e?.message);
    const kind = aiFailure(e);
    return NextResponse.json({
      error: kind === 'quota' ? 'Pictures need a paid Gemini plan, and the school’s quota with Google is used up or not enabled. Your Sthara administrator needs to check the Gemini plan and billing.'
        : kind === 'busy' ? 'Google’s image model is overloaded right now. Try again in a few minutes.'
          : 'The picture couldn’t be made. Try again, or describe it differently.',
      code: kind,
    }, { status: kind === 'quota' ? 429 : kind === 'busy' ? 503 : 502 });
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireStaff(req, { academic: true });
  if ('res' in auth) return auth.res;
  const { staff, db } = auth;
  const path = str(req.nextUrl.searchParams.get('path'), 200);
  // Any staff member of the school may see its pictures; never another school's.
  if (!PATH.test(path) || !path.startsWith(`${staff.schoolId}/`)) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  const { data, error } = await db.storage.from(BUCKET).createSignedUrl(path, LINK_SECONDS);
  if (error || !data) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  return NextResponse.json({ url: data.signedUrl });
}
