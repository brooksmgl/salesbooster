'use client';

import { useEffect, useMemo, useState } from 'react';
import { markdownToHtml } from '@/lib/markup';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

const USER_BUBBLE = 'max-w-[75%] rounded-2xl bg-[#F3E7E2] px-4 py-3 text-sm text-slate-800';
const ASSISTANT_BUBBLE = 'max-w-[75%] rounded-2xl bg-white px-4 py-3 text-sm text-slate-900';

const IMAGE_REGEX = /uploaded image:\s*(\S+)/i;

const normalize = (value: string) =>
  value
    .replace(/\[b\]/gi, '**')
    .replace(/\[\/b\]/gi, '**')
    .replace(/\[i\]/gi, '*')
    .replace(/\[\/i\]/gi, '*')
    .replace(/\[u\]|\[center\]|\[size=\d+\]/gi, '')
    .replace(/\[\/u\]|\[\/center\]|\[\/size\]/gi, '');

function extractStoragePath(input: string | undefined) {
  if (!input) return null;

  // Already a storage path
  if (!input.startsWith('http')) {
    return input.replace(/^listing-images\//, '');
  }

  try {
    const url = new URL(input);
    const match = url.pathname.match(/\/storage\/v1\/object\/sign\/(.+)/);
    if (match?.[1]) {
      const fullPath = decodeURIComponent(match[1]);
      return fullPath.replace(/^listing-images\//, '');
    }
  } catch {
    // ignore parse errors
  }
  return null;
}

type Props = {
  message: ChatMessage;
  listingId?: string;
};

export function MessageBubble({ message, listingId }: Props) {
  const match = IMAGE_REGEX.exec(message.content);

  if (match) {
    const [, rawUrl] = match;
    const [resolvedUrl, setResolvedUrl] = useState<string | null>(rawUrl);
    const [previewError, setPreviewError] = useState(false);
    const path = useMemo(() => extractStoragePath(rawUrl), [rawUrl]);

    useEffect(() => {
      if (!listingId || !path) {
        setResolvedUrl(rawUrl);
        setPreviewError(false);
        return;
      }

      let cancelled = false;
      const refreshUrl = async () => {
        try {
          const res = await fetch(`/api/listings/${listingId}/image-url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ path }),
          });
          if (!res.ok) throw new Error(`Failed to sign image: ${res.status}`);
          const data = (await res.json()) as { signedUrl?: string };
          if (!cancelled && data?.signedUrl) {
            setResolvedUrl(data.signedUrl);
            setPreviewError(false);
          }
        } catch (err) {
          console.error(err);
          if (!cancelled) {
            setResolvedUrl(rawUrl);
          }
        }
      };

      void refreshUrl();
      return () => {
        cancelled = true;
      };
    }, [listingId, path, rawUrl]);

    const labelClass = message.role === 'user' ? 'text-slate-600' : 'text-slate-500';
    const frameClass =
      message.role === 'user'
        ? 'overflow-hidden rounded-lg border border-[#e6d7d0] bg-white'
        : 'overflow-hidden rounded-lg border border-border bg-white';
    const linkHref = resolvedUrl ?? rawUrl;

    return (
      <div className={message.role === 'user' ? USER_BUBBLE : ASSISTANT_BUBBLE}>
        <div className="flex flex-col gap-2">
          <p className={`text-xs uppercase tracking-wide ${labelClass}`}>Uploaded image</p>
          <div className={`${frameClass} flex items-center justify-center`}>
            {previewError || !linkHref ? (
              <a
                href={linkHref || rawUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full px-3 py-4 text-center text-sm font-semibold text-accent underline"
              >
                View uploaded image
              </a>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={linkHref}
                alt="Uploaded listing reference"
                className="max-h-56 w-full object-cover"
                onError={() => setPreviewError(true)}
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  const html = markdownToHtml(normalize(message.content));
  const contentClass =
    message.role === 'user'
      ? 'rich-text text-slate-800 [&>h3]:text-slate-600 [&>p]:text-slate-700 [&_.sb-bullet]:text-slate-700 [&>strong]:text-slate-900'
      : 'rich-text';

  return (
    <div className={message.role === 'user' ? USER_BUBBLE : ASSISTANT_BUBBLE}>
      <div className={contentClass} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
