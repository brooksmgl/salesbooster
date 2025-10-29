import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabaseServer';
import { withCORS, options } from '@/lib/cors';
import { MODE_PROMPT, SYSTEM_BASE } from '@/lib/prompts';
import { rateLimit } from '@/lib/rateLimit';
import { getSessionUser } from '@/lib/session';
import OpenAI from 'openai';

export { options as OPTIONS };

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type Mode = 'chat' | 'read' | 'title' | 'tags' | 'description' | 'faqs';

function extractListingFields(message: string) {
  const normalized = message.replace(/\r\n/g, '\n');
  const sections: Partial<Record<'title' | 'tags' | 'description' | 'faqs', string>> = {};

  const extract = (heading: string) => {
    const sections = normalized.split(/\n(?=###\s+)/g);
    for (const section of sections) {
      const trimmed = section.trim();
      if (trimmed.toLowerCase().startsWith(`### ${heading.toLowerCase()}`)) {
        return trimmed.split('\n').slice(1).join('\n').trim();
      }
    }
    return null;
  };

  const titleSection = extract('Title');
  if (titleSection) sections.title = titleSection.split('\n')[0]?.trim();

  const tagsSection = extract('Tags');
  if (tagsSection) {
    sections.tags = tagsSection
      .replace(/^[\s*\-•]+/gm, '')
      .replace(/\s+/g, ' ')
      .replace(/\s*,\s*/g, ', ') // normalize commas
      .trim();
  }

  const descriptionSection = extract('Description');
  if (descriptionSection) sections.description = descriptionSection.trim();

  const faqsSection = extract('FAQs');
  if (faqsSection) sections.faqs = faqsSection.trim();

  return sections;
}

function toStringArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.reduce<string[]>((acc, item) => {
      if (typeof item === 'string') {
        acc.push(item);
      } else if (item != null) {
        try {
          acc.push(JSON.stringify(item));
        } catch {
          // ignore serialization errors
        }
      }
      return acc;
    }, []);
  }
  if (typeof value === 'string') return [value];
  return [];
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getSessionUser(req);
  if (!user) {
    return withCORS(NextResponse.json({ error: 'Not signed in' }, { status: 401 }));
  }
  const { mode, message, imageUrl }: { mode: Mode; message?: string; imageUrl?: string } = await req.json();
  if (!mode || !MODE_PROMPT[mode]) return withCORS(NextResponse.json({ error: 'Invalid mode' }, { status: 400 }));

  // Rate limit per user+mode
  const requester = req.ip || req.headers.get('x-forwarded-for') || 'public';
  const rl = rateLimit(`${requester}:${mode}`, 30);
  if (!rl.ok) return withCORS(NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 }));

  const sb = getServiceClient();
  const { data: listing, error: e0 } = await sb
    .from('listings')
    .select('*')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single();
  if (e0 || !listing) return withCORS(NextResponse.json({ error: e0?.message || 'Not found' }, { status: 404 }));

  // Build history
  const history = Array.isArray(listing.chat_history) ? listing.chat_history : [];

  // Assemble OpenAI messages
  const userContent: any[] = [];
  if (message) userContent.push({ type: 'text', text: message });
  if (mode === 'read' && imageUrl) {
    userContent.push({ type: 'image_url', image_url: { url: imageUrl } });
  }

  // Provide running context = fields + last turns
  const contextText = `CURRENT LISTING FIELDS
Title: ${listing.title ?? ''}
Tags: ${listing.tags ?? ''}
Description: ${listing.description ?? ''}
FAQs: ${listing.faqs ?? ''}
Vision: ${listing.vision_summary ?? ''}`;

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM_BASE },
    { role: 'system', content: MODE_PROMPT[mode] },
    { role: 'assistant', content: contextText },
    ...history,
  ];

  if (userContent.length > 0) messages.push({ role: 'user', content: userContent as any });

  let reply = '';
  try {
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      temperature: mode === 'title' || mode === 'tags' ? 0.4 : 0.6,
    });
    reply = resp.choices[0]?.message?.content?.trim() ?? '';
  } catch (err) {
    console.error(err);
    return withCORS(NextResponse.json({ error: 'AI request failed. Check OPENAI_API_KEY and usage limits.' }, { status: 500 }));
  }

  // Persist: chat turn + field updates
  const newHistory = [
    ...history,
    ...(message || imageUrl ? [{ role: 'user', content: message || (imageUrl ? `Uploaded image: ${imageUrl}` : '') }] : []),
    { role: 'assistant', content: reply },
  ];

  const updates: Record<string, unknown> = { chat_history: newHistory };
  if (mode === 'chat') {
    const extracted = extractListingFields(reply);
    if (extracted.title) updates.title = extracted.title;
    if (extracted.tags) updates.tags = extracted.tags;
    if (extracted.description) updates.description = extracted.description;
    if (extracted.faqs) updates.faqs = extracted.faqs;
  }
  if (mode === 'title') updates.title = reply;
  if (mode === 'tags') updates.tags = reply;
  if (mode === 'description') updates.description = reply;
  if (mode === 'faqs') updates.faqs = reply;
  if (mode === 'read') {
    updates.vision_summary = reply;
    const existingSummaries = toStringArray(listing.vision_summaries ?? listing.vision_summary);
    const existingImages = toStringArray(listing.image_urls ?? listing.image_url);
    updates.vision_summaries = [...existingSummaries, reply];
    if (imageUrl) {
      updates.image_url = imageUrl;
      updates.image_urls = [...existingImages, imageUrl];
    } else {
      updates.image_urls = existingImages;
    }
  }

  const { error: e1, data: updated } = await sb
    .from('listings')
    .update(updates)
    .eq('id', params.id)
    .eq('user_id', user.id)
    .select('*')
    .single();

  if (e1) return withCORS(NextResponse.json({ error: e1.message }, { status: 400 }));
  return withCORS(NextResponse.json({ reply, listing: updated }));
}
