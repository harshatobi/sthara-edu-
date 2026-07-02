import { NextResponse, NextRequest } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const dynamic = 'force-dynamic';

/* ── Foul language word list (common profanity) ── */
const FOUL_WORDS = [
  'fuck', 'shit', 'damn', 'bitch', 'ass', 'bastard', 'crap', 'piss',
  'cock', 'dick', 'pussy', 'cunt', 'asshole', 'motherfucker', 'wtf',
  'hell', 'sex', 'nude', 'porn', 'bullshit', 'whore', 'slut',
  // Telugu / Hinglish common slurs (transliterated)
  'madarchod', 'bsdk', 'bhosdi', 'chutiya', 'randi', 'lund', 'gaand',
  'harami', 'mc', 'bc', 'sala', 'saala', 'maryadaga',
];

function containsFoulLanguage(text: string): boolean {
  const lower = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  return FOUL_WORDS.some(word => {
    const regex = new RegExp(`\\b${word}\\b`, 'i');
    return regex.test(lower) || lower.includes(word);
  });
}

export async function POST(request: NextRequest) {
  // ── Lightweight origin check (same approach as teacher AI) ──────────────
  const origin = request.headers.get('origin') || '';
  const referer = request.headers.get('referer') || '';
  const authHeader = request.headers.get('authorization') || '';
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
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const { messages, studentId, studentName, studentClass, schoolId, violationCount = 0, institutionType = 'school', branch, year, semester } = await request.json();

    // ── FOUL LANGUAGE CHECK ──
    const lastUserMessage = [...messages].reverse().find((m: any) => m.sender === 'user');
    if (lastUserMessage && containsFoulLanguage(lastUserMessage.text)) {
      const newViolationCount = violationCount + 1;
      
      if (newViolationCount === 1) {
        return NextResponse.json({
          text: institutionType === 'college'
            ? `⚠️ **Inappropriate language detected.**\n\nThis platform maintains professional academic standards. Please keep the conversation respectful and focused on your academic work.\n\n**Consider this a formal warning.**`
            : `⚠️ **Please watch your language.**\n\nThis is a school learning environment and I'm here to help you study. Using inappropriate or offensive language is not acceptable here.\n\n**This is your first warning.** Please keep our conversation respectful so I can help you learn better! 📚`,
          isFoulWarning: true,
          newViolationCount,
        });
      }

      return NextResponse.json({
        text: institutionType === 'college'
          ? `⛔ **Second violation — inappropriate language.**\n\nYour professor has been notified. Continued misuse will result in restricted access. Please maintain professional conduct.`
          : `⛔ **This is your second warning for inappropriate language.**\n\nYour teacher has been notified of this behavior. Please remember that respectful communication is important in every learning space.\n\nIf you'd like to continue learning, please ask your academic question politely.`,
        isFoulWarning: true,
        notifyTeacher: true,
        newViolationCount,
        studentId,
        studentName,
        studentClass,
        schoolId,
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini API key not configured on server.' }, { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    let memoryData = { known: [] as string[], struggling: [] as string[] };

    // ── System instruction — switches between school (child) and college (adult) mode ──
    const isCollege = institutionType === 'college';

    const collegeSystemInstruction = `You are an advanced AI Academic Assistant for ${studentName || 'a student'} — ${branch || 'a student'}, ${year || ''} ${semester || ''} at their institution.

CORE BEHAVIOUR:
1. STRICTLY ACADEMIC: Decline all non-academic requests professionally. Say: "I'm your academic assistant. I'm here to support your coursework and studies."

2. TONE & STYLE — CRITICAL:
   - Treat this person as an intelligent adult and a peer in learning.
   - Use technical, precise academic language appropriate for undergraduate/postgraduate level.
   - Do NOT use child-friendly phrases like "Great job!", "Amazing!", "You're doing great!", "Buddy", "Let's explore together!" etc.
   - Be direct, concise, and intellectually rigorous.
   - Reference academic concepts, textbooks, research papers, and real-world applications where relevant.

3. PEDAGOGICAL APPROACH:
   - Use the Socratic method to guide reasoning for conceptual questions.
   - If the student says "I don't know", "explain", "just tell me", or similar — switch immediately to a clear, structured explanation with technical depth.
   - For engineering/science: derive formulas, explain assumptions, cite relevant theorems.
   - For commerce/humanities: discuss frameworks, cite relevant authors/theories, analyze critically.

4. VIDEO RECOMMENDATIONS: If videos are requested, output EXACTLY: \`[YOUTUBE_SEARCH: <specific_topic>]\`

5. FORMATTING:
   - Use clean markdown with headers, numbered steps, and bullet points.
   - For math: use readable notation — × ÷ √ ² ³ — not LaTeX.
   - Keep explanations concise but technically complete.`;

    const schoolSystemInstruction = `You are a warm, adaptive AI Tutor for Sthara School OS.
The student is ${studentName || 'a student'} in ${studentClass || 'a class'}.

CORE RULES:
1. STRICTLY ACADEMIC: Refuse any non-academic question. Say: "I am your AI Tutor. I can only assist with your academic subjects."

2. ADAPTIVE QUESTIONING (critical):
   - By default, use the Socratic method — ask ONE guiding question per response to lead the student to the answer.
   - However, if the student says anything like "I don't know", "i dont know", "no idea", "I have no clue", "I'm not sure", "I'm lost", "I don't understand", "help me", "just explain", "tell me the answer", "I give up", or similar — IMMEDIATELY STOP asking questions.
   - When you detect a "don't know" signal, switch to EXPLANATION MODE: give a clear, thorough, step-by-step explanation of the concept. Use examples, analogies, and numbered steps. Do not ask questions during this explanation.
   - After the explanation, you may ask a single gentle check-in like "Does that make sense?" or "Want to try a practice question now?"

3. VIDEO RECOMMENDATIONS: If the student asks for video lectures, output EXACTLY: \`[YOUTUBE_SEARCH: <specific_topic>]\`. The system will render live videos automatically. No other links.

4. ADAPTIVE PERSONALIZATION:
   What they know: ${memoryData.known?.join(', ') || 'Not yet assessed'}
   What they struggle with: ${memoryData.struggling?.join(', ') || 'Not yet assessed'}
   Keep responses concise, encouraging, and at their level.

5. FORMATTING: Use clear markdown. For math, write equations in plain readable text using × ÷ ² ³ √ symbols — do NOT use LaTeX notation like \\( \\) or x^2. Write x² not x^2, write √x not \\sqrt{x}.`;

    const systemInstruction = isCollege ? collegeSystemInstruction : schoolSystemInstruction;


    let contents = messages.map((msg: any) => ({
      role: msg.sender === 'ai' ? 'model' : 'user',
      parts: [{ text: msg.text }]
    }));

    // Gemini API requires the conversation history to strictly start with a 'user' role
    // and alternate. We will remove leading 'model' messages.
    while (contents.length > 0 && contents[0].role === 'model') {
      contents.shift();
    }
    
    // Also merge consecutive messages from the same role to prevent "400 alternating roles" errors
    const mergedContents: any[] = [];
    for (const msg of contents) {
      if (mergedContents.length > 0 && mergedContents[mergedContents.length - 1].role === msg.role) {
        mergedContents[mergedContents.length - 1].parts[0].text += '\n\n' + msg.parts[0].text;
      } else {
        mergedContents.push(msg);
      }
    }

    // Prepend the system instruction to the very first user message 
    const firstUserMsgIndex = mergedContents.findIndex(c => c.role === 'user');
    if (firstUserMsgIndex !== -1) {
      mergedContents[firstUserMsgIndex].parts[0].text = systemInstruction + '\n\n' + mergedContents[firstUserMsgIndex].parts[0].text;
    }

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
    });

    // Primary Call: Answer Student
    const response = await model.generateContent({
      contents: mergedContents,
      generationConfig: {
        temperature: 0.7,
      }
    });

    const aiText = response.response.text();

    return NextResponse.json({
      text: aiText
    });

  } catch (error: any) {
    console.error('Tutor API Error:', error?.message || error);
    return NextResponse.json(
      { error: 'Failed to generate response: ' + (error?.message || 'Unknown error') },
      { status: 500 }
    );
  }
}
