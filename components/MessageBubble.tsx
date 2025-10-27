import { markdownToHtml } from '@/lib/markup';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

const USER_BUBBLE = 'max-w-[75%] rounded-2xl bg-[#F3E7E2] px-4 py-3 text-sm text-slate-800';
const ASSISTANT_BUBBLE = 'max-w-[75%] rounded-2xl bg-white px-4 py-3 text-sm text-slate-900';

const IMAGE_REGEX = /uploaded image:\s*(https?:\/\/\S+)/i;

const normalize = (value: string) =>
  value
    .replace(/\[b\]/gi, '**')
    .replace(/\[\/b\]/gi, '**')
    .replace(/\[i\]/gi, '*')
    .replace(/\[\/i\]/gi, '*')
    .replace(/\[u\]|\[center\]|\[size=\d+\]/gi, '')
    .replace(/\[\/u\]|\[\/center\]|\[\/size\]/gi, '');

export function MessageBubble({ message }: { message: ChatMessage }) {
  const match = IMAGE_REGEX.exec(message.content);

  if (match) {
    const [, url] = match;
    const labelClass = message.role === 'user' ? 'text-slate-600' : 'text-slate-500';
    const frameClass =
      message.role === 'user'
        ? 'overflow-hidden rounded-lg border border-[#e6d7d0] bg-white'
        : 'overflow-hidden rounded-lg border border-border bg-white';

    return (
      <div className={message.role === 'user' ? USER_BUBBLE : ASSISTANT_BUBBLE}>
        <div className="flex flex-col gap-2">
          <p className={`text-xs uppercase tracking-wide ${labelClass}`}>Uploaded image</p>
          <div className={frameClass}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="Uploaded listing reference" className="max-h-56 w-full object-cover" />
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
