export function escapeHtml(str: string) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatInline(text: string) {
  let html = escapeHtml(text);
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(^|[^\*])\*(?!\*)([^*]+?)\*(?=$|[^\*])/g, (_m, prefix, content) => `${prefix}<em>${content}</em>`);
  html = html.replace(/^Q:\s*/i, '<strong>Q:</strong> ');
  html = html.replace(/^A:\s*/i, '<strong>A:</strong> ');
  return html;
}

export function markdownToHtml(value: string) {
  const lines = value.split(/\r?\n/);
  const parts: string[] = [];
  let inList = false;

  const closeList = () => {
    if (inList) {
      parts.push('</ul>');
      inList = false;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      closeList();
      continue;
    }

    if (/^###\s+/.test(trimmed)) {
      closeList();
      parts.push(`<h3>${formatInline(trimmed.replace(/^###\s+/, ''))}</h3>`);
      continue;
    }
    if (/^##\s+/.test(trimmed)) {
      closeList();
      parts.push(`<h2>${formatInline(trimmed.replace(/^##\s+/, ''))}</h2>`);
      continue;
    }
    if (/^#\s+/.test(trimmed)) {
      closeList();
      parts.push(`<h1>${formatInline(trimmed.replace(/^#\s+/, ''))}</h1>`);
      continue;
    }

    if (/^[-•]\s+/.test(trimmed)) {
      if (!inList) {
        parts.push('<ul class="sb-list">');
        inList = true;
      }
      parts.push(`<li>${formatInline(trimmed.replace(/^[-•]\s+/, ''))}</li>`);
      continue;
    }

    if (/^[A-Za-z0-9 &]+:\s*$/.test(trimmed)) {
      closeList();
      parts.push(`<h4>${formatInline(trimmed.replace(/:$/, ''))}</h4>`);
      continue;
    }

    closeList();
    parts.push(`<p>${formatInline(trimmed)}</p>`);
  }

  closeList();
  return parts.join('');
}
