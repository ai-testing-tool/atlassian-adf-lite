/** Shared escaping / URL helpers for HTML and Markdown serializers. */

const ESC: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ESC[c]!);

export const DEFAULT_URL_SCHEMES = ['http', 'https', 'mailto'] as const;

/**
 * Allow only listed URL schemes. Scheme-relative and relative URLs pass through;
 * disallowed schemes (e.g. javascript:) become "#".
 */
export function safeUrl(u: string, schemes: readonly string[] = DEFAULT_URL_SCHEMES): string {
  const t = u.trim();
  const m = /^([a-z][a-z0-9+.-]*):/i.exec(t);
  if (m && !schemes.includes(m[1]!.toLowerCase())) return '#';
  return t;
}
