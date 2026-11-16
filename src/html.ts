import type * as T from './types.js';
import { DEFAULT_URL_SCHEMES, escapeHtml, safeUrl as allowUrl } from './escape.js';

export { escapeHtml } from './escape.js';

export interface HtmlOptions {
  /** Resolve a mention to display text (default: attrs.text or "@id"). */
  mention?: (n: T.MentionNode) => string;
  /** Resolve a media node to an image URL. Return null to skip the image (default: external URLs only). */
  mediaUrl?: (n: T.MediaNode | T.MediaInlineNode) => string | null;
  /** Indent output with newlines between blocks (default true). */
  pretty?: boolean;
  /** Prefix for generated CSS classes (default "adf-"). */
  classPrefix?: string;
  /** Allowed URL schemes for links and images (default http, https, mailto). Others become "#". */
  allowedSchemes?: string[];
}

const PANEL_ICON: Record<string, string> = { info: 'ℹ️', note: '📝', warning: '⚠️', success: '✅', error: '⛔', custom: '' };

/**
 * Render ADF as semantic HTML. All text and attributes are escaped and link/image URLs are
 * restricted to safe schemes, so output from untrusted ADF can be inserted into a page.
 * Styling hooks are exposed as `adf-*` classes; colours are emitted as inline styles.
 */
export function toHtml(root: T.AdfNode, opts: HtmlOptions = {}): string {
  const cls = opts.classPrefix ?? 'adf-';
  const pretty = opts.pretty ?? true;
  const nl = pretty ? '\n' : '';
  const schemes = opts.allowedSchemes ?? [...DEFAULT_URL_SCHEMES];
  const mediaUrl = opts.mediaUrl ?? ((m) => (m.type === 'media' && m.attrs.type === 'external' ? m.attrs.url : null));

  const safeUrl = (u: string): string => escapeHtml(allowUrl(u, schemes));
  const color = (c: string) => (/^#[0-9a-f]{3,8}$/i.test(c) ? c : null);
  const attr = (name: string, v: string | number | undefined | null) => (v === undefined || v === null || v === '' ? '' : ` ${name}="${escapeHtml(String(v))}"`);

  const textNode = (n: T.TextNode): string => {
    let s = escapeHtml(n.text);
    const styles: string[] = [];
    let href: T.LinkMark | undefined;
    for (const m of n.marks ?? []) {
      switch (m.type) {
        case 'strong': s = `<strong>${s}</strong>`; break;
        case 'em': s = `<em>${s}</em>`; break;
        case 'strike': s = `<s>${s}</s>`; break;
        case 'underline': s = `<u>${s}</u>`; break;
        case 'code': s = `<code>${s}</code>`; break;
        case 'subsup': s = `<${m.attrs.type}>${s}</${m.attrs.type}>`; break;
        case 'textColor': { const c = color(m.attrs.color); if (c) styles.push(`color:${c}`); break; }
        case 'backgroundColor': { const c = color(m.attrs.color); if (c) styles.push(`background-color:${c}`); break; }
        case 'link': href = m; break;
      }
    }
    if (styles.length) s = `<span style="${styles.join(';')}">${s}</span>`;
    if (href) s = `<a href="${safeUrl(href.attrs.href)}"${attr('title', href.attrs.title)} rel="noopener noreferrer">${s}</a>`;
    return s;
  };

  const img = (m: T.MediaNode | T.MediaInlineNode): string => {
    const url = mediaUrl(m);
    if (!url) return m.attrs.alt ? `<span class="${cls}media-placeholder">${escapeHtml(m.attrs.alt)}</span>` : '';
    let s = `<img src="${safeUrl(url)}" alt="${escapeHtml(m.attrs.alt ?? '')}"${attr('width', m.attrs.width)}${attr('height', m.attrs.height)}>`;
    const border = m.marks?.find((x): x is T.BorderMark => x.type === 'border');
    if (border && color(border.attrs.color)) s = s.replace('<img ', `<img style="border:${border.attrs.size}px solid ${border.attrs.color}" `);
    const link = m.marks?.find((x): x is T.LinkMark => x.type === 'link');
    return link ? `<a href="${safeUrl(link.attrs.href)}" rel="noopener noreferrer">${s}</a>` : s;
  };

  const card = (n: T.InlineCardNode | T.BlockCardNode | T.EmbedCardNode, kind: string): string => {
    if (!n.attrs.url) return '';
    return `<a class="${cls}${kind}" href="${safeUrl(n.attrs.url)}" rel="noopener noreferrer">${escapeHtml(n.attrs.url)}</a>`;
  };

  const inline = (nodes: T.AdfNode[] = []): string =>
    nodes.map((n) => {
      switch (n.type) {
        case 'text': return textNode(n);
        case 'hardBreak': return '<br>';
        case 'mention': {
          const label = opts.mention ? opts.mention(n) : n.attrs.text ?? `@${n.attrs.id}`;
          return `<span class="${cls}mention"${attr('data-user-id', n.attrs.id)}>${escapeHtml(label)}</span>`;
        }
        case 'emoji': return `<span class="${cls}emoji"${attr('title', n.attrs.shortName)}>${escapeHtml(n.attrs.text ?? n.attrs.shortName)}</span>`;
        case 'date': {
          const ms = Number(n.attrs.timestamp);
          if (!Number.isFinite(ms)) return '';
          const iso = new Date(ms).toISOString().slice(0, 10);
          return `<time class="${cls}date" datetime="${iso}">${iso}</time>`;
        }
        case 'status': return `<span class="${cls}status ${cls}status-${escapeHtml(n.attrs.color)}">${escapeHtml(n.attrs.text)}</span>`;
        case 'inlineCard': return card(n, 'inline-card');
        case 'mediaInline': return img(n);
        default: return '';
      }
    }).join('');

  const blockStyle = (marks: (T.AlignmentMark | T.IndentationMark)[] | undefined): string => {
    const st: string[] = [];
    for (const m of marks ?? []) {
      if (m.type === 'alignment') st.push(`text-align:${m.attrs.align === 'end' ? 'right' : 'center'}`);
      if (m.type === 'indentation') st.push(`margin-left:${m.attrs.level * 30}px`);
    }
    return st.length ? ` style="${st.join(';')}"` : '';
  };

  const cellAttrs = (c: T.TableCellNode | T.TableHeaderNode): string => {
    const a = c.attrs ?? {};
    const bg = a.background && color(a.background);
    return attr('colspan', a.colspan && a.colspan > 1 ? a.colspan : undefined)
      + attr('rowspan', a.rowspan && a.rowspan > 1 ? a.rowspan : undefined)
      + (bg ? ` style="background-color:${bg}"` : '');
  };

  const blocks = (nodes: T.AdfNode[]): string => nodes.map(block).join(nl);

  const block = (n: T.AdfNode): string => {
    switch (n.type) {
      case 'doc': return blocks(n.content);
      case 'paragraph': return `<p${blockStyle(n.marks)}>${inline(n.content)}</p>`;
      case 'heading': return `<h${n.attrs.level}${blockStyle(n.marks)}>${inline(n.content)}</h${n.attrs.level}>`;
      case 'codeBlock': {
        const lang = n.attrs?.language;
        const src = escapeHtml((n.content ?? []).map((t) => t.text).join(''));
        return `<pre><code${lang ? ` class="language-${escapeHtml(lang)}"` : ''}>${src}</code></pre>`;
      }
      case 'rule': return '<hr>';
      case 'blockquote': return `<blockquote>${nl}${blocks(n.content)}${nl}</blockquote>`;
      case 'bulletList': return `<ul>${nl}${blocks(n.content)}${nl}</ul>`;
      case 'orderedList': {
        const start = n.attrs?.order;
        return `<ol${start !== undefined && start !== 1 ? ` start="${start}"` : ''}>${nl}${blocks(n.content)}${nl}</ol>`;
      }
      case 'listItem': {
        // Keep items tight: a leading plain paragraph is rendered without <p>.
        const [first, ...rest] = n.content;
        if (first?.type === 'paragraph' && !first.marks?.length && rest.every((c) => c.type !== 'paragraph'))
          return `<li>${inline(first.content)}${rest.length ? nl + blocks(rest) : ''}</li>`;
        return `<li>${blocks(n.content)}</li>`;
      }
      case 'panel': {
        const t = n.attrs.panelType;
        const bg = n.attrs.panelColor && color(n.attrs.panelColor);
        const icon = n.attrs.panelIconText ?? PANEL_ICON[t] ?? '';
        return `<div class="${cls}panel ${cls}panel-${t}" role="note"${bg ? ` style="background-color:${bg}"` : ''}>`
          + (icon ? `<span class="${cls}panel-icon" aria-hidden="true">${escapeHtml(icon)}</span>` : '')
          + `<div class="${cls}panel-content">${nl}${blocks(n.content)}${nl}</div></div>`;
      }
      case 'expand': case 'nestedExpand':
        return `<details class="${cls}${n.type === 'expand' ? 'expand' : 'nested-expand'}">${nl}<summary>${escapeHtml(n.attrs?.title ?? '')}</summary>${nl}${blocks(n.content)}${nl}</details>`;
      case 'table': {
        const rows = n.content;
        const firstIsHeader = rows.length > 1 && rows[0]!.content.every((c) => c.type === 'tableHeader');
        const headRows = firstIsHeader ? rows.slice(0, 1) : [];
        const bodyRows = rows.slice(headRows.length);
        const layout = n.attrs?.layout;
        const open = `<table class="${cls}table${layout ? ` ${cls}table-${escapeHtml(layout)}` : ''}">`;
        const thead = headRows.length ? `<thead>${nl}${blocks(headRows)}${nl}</thead>${nl}` : '';
        const tbody = bodyRows.length ? `<tbody>${nl}${blocks(bodyRows)}${nl}</tbody>${nl}` : '';
        return `${open}${nl}${thead}${tbody}</table>`;
      }
      case 'tableRow': return `<tr>${n.content.map(block).join('')}</tr>`;
      case 'tableHeader': case 'tableCell': {
        const tag = n.type === 'tableHeader' ? 'th' : 'td';
        const body = n.content.length === 1 && n.content[0]!.type === 'paragraph' && !n.content[0]!.marks?.length
          ? inline(n.content[0]!.content) : n.content.map(block).join('');
        return `<${tag}${cellAttrs(n)}>${body}</${tag}>`;
      }
      case 'mediaSingle': {
        const w = n.attrs.width;
        const style = w ? ` style="max-width:${n.attrs.widthType === 'pixel' ? `${w}px` : `${w}%`}"` : '';
        return `<figure class="${cls}media-single ${cls}layout-${escapeHtml(n.attrs.layout)}"${style}>${img(n.content[0])}</figure>`;
      }
      case 'mediaGroup': return `<div class="${cls}media-group">${n.content.map(img).join('')}</div>`;
      case 'media': return img(n);
      case 'blockCard': return `<p class="${cls}block-card">${card(n, 'block-card')}</p>`;
      case 'embedCard': return `<div class="${cls}embed-card">${card(n, 'embed-card')}</div>`;
      default: return inline([n]);
    }
  };

  return block(root);
}

/** Minimal default stylesheet for the classes `toHtml` emits. */
export const DEFAULT_CSS = `
.adf-mention{background:#e9f2ff;color:#0c66e4;border-radius:12px;padding:0 4px}
.adf-status{font-size:11px;font-weight:700;text-transform:uppercase;border-radius:3px;padding:0 4px}
.adf-status-neutral{background:#dcdfe4}.adf-status-purple{background:#dfd8fd}.adf-status-blue{background:#cce0ff}
.adf-status-red{background:#ffd5d2}.adf-status-yellow{background:#f8e6a0}.adf-status-green{background:#baf3db}
.adf-panel{display:flex;gap:8px;border-radius:3px;padding:8px 12px;margin:8px 0}
.adf-panel-info{background:#e9f2ff}.adf-panel-note{background:#f3f0ff}.adf-panel-warning{background:#fff7d6}
.adf-panel-success{background:#dcfff1}.adf-panel-error{background:#ffeceb}
.adf-panel-content>:first-child{margin-top:0}.adf-panel-content>:last-child{margin-bottom:0}
.adf-table{border-collapse:collapse}.adf-table th,.adf-table td{border:1px solid #dcdfe4;padding:6px 10px;vertical-align:top}
.adf-table th{background:#f1f2f4;text-align:left}
.adf-media-single{margin:8px auto}.adf-media-single img{max-width:100%;height:auto}
.adf-layout-wrap-left{float:left;margin-right:12px}.adf-layout-wrap-right{float:right;margin-left:12px}
.adf-block-card,.adf-embed-card,.adf-inline-card{word-break:break-all}
`.trim();
