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

const MAX_TAG_LEN = 20;
const TAG_COUNT = 13;
// Tag-producing modes get the stronger model: gpt-4o-mini follows the 20-char
// limit poorly and misspells more. Other modes stay on mini to control cost.
const TAG_MODEL = 'gpt-4o';
const BASE_MODEL = 'gpt-4o-mini';

// Server-side guardrail: parse a comma-separated tag string, enforce the rules
// (<=20 chars, no duplicate/repeated-word tags) in code so the limit can't be
// violated regardless of what the model returns. Over-limit tags are dropped
// here and refilled by backfillTags so we still land on 13.
function cleanTagList(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const piece of raw.split(',')) {
    const tag = piece
      .replace(/^[\s*\-•]+/, '') // strip leading bullets / markdown
      .replace(/[*`_]/g, '')      // strip stray markdown emphasis
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    if (!tag) continue;
    if (tag.length > MAX_TAG_LEN) continue; // hard limit — drop, backfill later
    const key = tag.replace(/[\s-]/g, ''); // dedup across space/hyphen/case
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out.slice(0, TAG_COUNT);
}

// Replace the body of the "### Tags" section in a chat reply so the text shown
// to the user matches the cleaned tags we persist.
function replaceTagsSection(text: string, tagsLine: string): string {
  return text
    .split(/\n(?=###\s+)/g)
    .map((sec) => {
      if (sec.trim().toLowerCase().startsWith('### tags')) {
        const header = sec.split('\n')[0];
        return `${header}\n${tagsLine}`;
      }
      return sec;
    })
    .join('\n');
}

// Drop & backfill: if cleaning left us under 13 valid tags, ask the model for
// just the missing count, constrained and de-duplicated against what we have.
// Best-effort — never fails the request if the extra call errors.
async function backfillTags(have: string[], context: string): Promise<string[]> {
  const need = TAG_COUNT - have.length;
  if (need <= 0) return have;
  try {
    const resp = await openai.chat.completions.create({
      model: TAG_MODEL,
      temperature: 0.5,
      messages: [
        { role: 'system', content: SYSTEM_BASE },
        { role: 'system', content: MODE_PROMPT.tags },
        { role: 'assistant', content: context },
        {
          role: 'user',
          content: `These tags are already chosen: ${have.join(', ')}.
Give me ${need} MORE Etsy tags for the same product. Each must be 20 characters or fewer, correctly spelled, no abbreviations or cut-off words, and must not repeat any word already used above. Reply with ONLY the new tags, comma-separated.`,
        },
      ],
    });
    const merged = cleanTagList([...have, resp.choices[0]?.message?.content ?? ''].join(', '));
    return merged;
  } catch (err) {
    console.error('backfillTags failed', err);
    return have;
  }
}

// Run a raw tag string through the guardrail and top it up to 13.
async function finalizeTags(raw: string, context: string): Promise<string> {
  let tags = cleanTagList(raw);
  if (tags.length < TAG_COUNT) tags = await backfillTags(tags, context);
  return tags.join(', ');
}

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
      model: mode === 'tags' || mode === 'chat' ? TAG_MODEL : BASE_MODEL,
      messages,
      temperature: mode === 'title' || mode === 'tags' ? 0.4 : 0.6,
    });
    reply = resp.choices[0]?.message?.content?.trim() ?? '';
  } catch (err) {
    console.error(err);
    const errMsg = err instanceof Error ? err.message : '';
    if (errMsg.includes('unsupported image') || errMsg.includes('following formats')) {
      return withCORS(NextResponse.json({ error: 'This file type is not supported. Please use PNG, JPEG, GIF, or WebP.' }, { status: 400 }));
    }
    return withCORS(NextResponse.json({ error: 'AI request failed. Check OPENAI_API_KEY and usage limits.' }, { status: 500 }));
  }

  // Enforce tag rules in code before anything is stored or shown to the user.
  // gpt-4o-mini's "soft" 20-char compliance is the root cause of the long/
  // chopped tags reported by members — this is the hard backstop.
  if (mode === 'tags') {
    reply = await finalizeTags(reply, contextText);
  } else if (mode === 'chat') {
    const draft = extractListingFields(reply);
    if (draft.tags) {
      const cleaned = await finalizeTags(draft.tags, contextText);
      reply = replaceTagsSection(reply, cleaned);
    }
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
    if (imageUrl) updates.image_url = imageUrl;
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
