import { NextRequest, NextResponse } from 'next/server';
import { withCORS, options } from '@/lib/cors';
import { rateLimit } from '@/lib/rateLimit';
import { getSessionUser } from '@/lib/session';
import OpenAI, { toFile } from 'openai';

export { options as OPTIONS };

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const TRANSCRIBE_MODEL = 'gpt-4o-mini-transcribe';
// Netlify functions cap request bodies at ~6MB. The client stops recording at
// 2 minutes, which is well under this for webm/mp4 voice audio.
const MAX_AUDIO_BYTES = 5 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) {
    return withCORS(NextResponse.json({ error: 'Not signed in' }, { status: 401 }));
  }

  const requester = req.ip || req.headers.get('x-forwarded-for') || 'public';
  const rl = rateLimit(`${requester}:transcribe`, 20);
  if (!rl.ok) return withCORS(NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 }));

  let audio: File | null = null;
  try {
    const form = await req.formData();
    const value = form.get('audio');
    if (value instanceof File) audio = value;
  } catch {
    // fall through to the missing-audio response
  }
  if (!audio || audio.size === 0) {
    return withCORS(NextResponse.json({ error: "We didn't catch any audio. Please try again." }, { status: 400 }));
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return withCORS(NextResponse.json({ error: 'That recording is too long. Please keep it under 2 minutes.' }, { status: 400 }));
  }

  try {
    const file = await toFile(audio, audio.name || 'dictation.webm', { type: audio.type });
    const result = await openai.audio.transcriptions.create({
      file,
      model: TRANSCRIBE_MODEL,
      // Biases spelling toward Etsy/product vocabulary.
      prompt: 'A seller describing an Etsy product listing: materials, sizes, colors, SVG, PNG, PDF, printable, digital download.',
    });
    return withCORS(NextResponse.json({ text: (result.text || '').trim() }));
  } catch (err) {
    const status = (err as { status?: number })?.status;
    const code = (err as { code?: string })?.code;
    console.error('OpenAI transcribe failed', { status, code, type: audio.type, size: audio.size, err });
    return withCORS(NextResponse.json({ error: "We couldn't hear that clearly. Please try again in a moment." }, { status: 503 }));
  }
}
