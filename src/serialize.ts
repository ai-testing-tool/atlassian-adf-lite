import type * as T from './types.js';
import { doc, mention, paragraph, text as textNode } from './builders.js';
import { DEFAULT_URL_SCHEMES, escapeHtml, safeUrl } from './escape.js';

const kids = (n: T.AdfNode): T.AdfNode[] => ((n as { content?: T.AdfNode[] }).content ?? []);

/** Join inline fragments; insert a space when ADF omitted one between nodes (common around mentions). */
const joinInline = (parts: string[]): string =>
  parts.reduce((acc, part) => {
    if (!part) return acc;
    if (!acc) return part;
    return !/\s$/u.test(acc) && !/^\s/u.test(part) ? `${acc} ${part}` : acc + part;
  }, '');

// ─────────────────────────── Plain text ───────────────────────────

export interface PlainTextOptions {
  /** Separator between block nodes (default "\n"). */
  blockSeparator?: string;
}

/** Flatten ADF to readable plain text (e.g. for search indexing or notifications). */
export function toPlainText(node: T.AdfNode, opts: PlainTextOptions = {}): string {
  const sep = opts.blockSeparator ?? '\n';
  const inline = (n: T.AdfNode): string => {
    switch (n.type) {
      case 'text': return n.text;
      case 'hardBreak': return '\n';
      case 'mention': return n.attrs.text ?? `@${n.attrs.id}`;
      case 'emoji': return n.attrs.text ?? n.attrs.shortName;
      case 'date': {
        const ms = Number(n.attrs.timestamp);
        return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : '';
      }
      case 'status': return `[${n.attrs.text}]`;
      case 'inlineCard': return n.attrs.url ?? '';
      case 'mediaInline': return n.attrs.alt ?? '';
      default: return block(n);
    }
  };
  const block = (n: T.AdfNode): string => {
    switch (n.type) {
      case 'paragraph': case 'heading': case 'codeBlock':
        return joinInline(kids(n).map(inline));
      case 'rule': return '---';
      case 'media': return n.attrs.alt ?? '';
      case 'blockCard': case 'embedCard': return n.attrs.url ?? '';
      case 'tableRow': return kids(n).map(block).join('\t');
      case 'tableCell': case 'tableHeader': return kids(n).map(block).join(' ');
      case 'expand': case 'nestedExpand': {
        const body = kids(n).map(block).filter(Boolean).join(sep);
        return n.attrs?.title ? `${n.attrs.title}${sep}${body}` : body;
      }
      default:
        if ('text' in n || n.type === 'hardBreak') return inline(n);
        return kids(n).map(block).filter((s) => s !== '').join(sep);
    }
  };
  return block(node);
}

// ─────────────────────────── Markdown ───────────────────────────

export interface MarkdownOptions {
  /** Resolve a mention to display text (default: attrs.text or "@id"). */
  mention?: (n: T.MentionNode) => string;
  /** Resolve a media node to a URL for ![alt](url). Return null to emit alt text only. */
  mediaUrl?: (n: T.MediaNode) => string | null;
  /** Allowed URL schemes for links and images (default http, https, mailto). */
  allowedSchemes?: string[];
}

const escapeMd = (s: string) => s.replace(/([\\`*_[\]#<>|~])/g, '\\$1');

const mdHref = (href: string, schemes: readonly string[]): string => {
  const u = safeUrl(href, schemes);
  // Escape unbalanced parens that would break Markdown link destinations.
  return u.replace(/[()]/g, (c) => encodeURIComponent(c));
};

/** Render ADF as GitHub-flavoured Markdown. Lossy for colours, panels, alignment etc. */
export function toMarkdown(root: T.AdfNode, opts: MarkdownOptions = {}): string {
  const schemes = opts.allowedSchemes ?? [...DEFAULT_URL_SCHEMES];
  const mediaUrl = opts.mediaUrl ?? ((m) => (m.attrs.type === 'external' ? m.attrs.url : null));

  const textNode = (n: T.TextNode): string => {
    const marks = n.marks ?? [];
    const has = (t: string) => marks.some((m) => m.type === t);
    let s: string;
    if (has('code')) {
      const ticks = n.text.includes('`') ? '``' : '`';
      s = `${ticks}${ticks.length > 1 ? ' ' : ''}${n.text}${ticks.length > 1 ? ' ' : ''}${ticks}`;
    } else {
      // keep surrounding whitespace outside of emphasis markers
      const [, lead = '', core = '', trail = ''] = /^(\s*)([\s\S]*?)(\s*)$/.exec(n.text) ?? [];
      s = escapeMd(core);
      if (core) {
        if (has('strike')) s = `~~${s}~~`;
        if (has('em')) s = `_${s}_`;
        if (has('strong')) s = `**${s}**`;
        if (has('subsup')) {
          const sub = marks.find((m): m is T.SubSupMark => m.type === 'subsup')!;
          s = `<${sub.attrs.type}>${s}</${sub.attrs.type}>`;
        }
        if (has('underline')) s = `<u>${s}</u>`;
      }
      s = lead + s + trail;
    }
    const link = marks.find((m): m is T.LinkMark => m.type === 'link');
    if (link) {
      const title = link.attrs.title ? ` "${link.attrs.title.replace(/"/g, '\\"')}"` : '';
      s = `[${s}](${mdHref(link.attrs.href, schemes)}${title})`;
    }
    return s;
  };

  const inline = (nodes: T.AdfNode[], inTable = false): string =>
    nodes.map((n) => {
      switch (n.type) {
        case 'text': return textNode(n);
        case 'hardBreak': return inTable ? '<br>' : '  \n';
        case 'mention': return opts.mention ? opts.mention(n) : n.attrs.text ?? `@${n.attrs.id}`;
        case 'emoji': return n.attrs.text ?? n.attrs.shortName;
        case 'date': {
          const ms = Number(n.attrs.timestamp);
          return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : '';
        }
        case 'status': return `\`${n.attrs.text.toUpperCase()}\``;
        case 'inlineCard': return n.attrs.url ? `<${mdHref(n.attrs.url, schemes)}>` : '';
        case 'mediaInline': return n.attrs.alt ?? '';
        default: return '';
      }
    }).join('');

  const indent = (s: string, pad: string) => s.split('\n').map((l) => (l ? pad + l : l)).join('\n');

  const media = (m: T.MediaNode): string => {
    const url = mediaUrl(m);
    const alt = m.attrs.alt ?? '';
    if (!url) return alt;
    return `![${escapeMd(alt)}](${mdHref(url, schemes)})`;
  };

  const card = (n: T.BlockCardNode | T.EmbedCardNode | T.InlineCardNode): string =>
    n.attrs.url ? `<${mdHref(n.attrs.url, schemes)}>` : '';

  const cell = (c: T.TableCellNode | T.TableHeaderNode): string =>
    c.content.map((b) => (b.type === 'paragraph' || b.type === 'heading' ? inline(b.content ?? [], true) : blocks([b]).replace(/\n+/g, '<br>')))
      .join('<br>').replace(/\|/g, '\\|');

  const table = (t: T.TableNode): string => {
    const rows = t.content.map((r) => r.content.map(cell));
    const width = Math.max(...rows.map((r) => r.length));
    const pad = (r: string[]) => [...r, ...Array(width - r.length).fill('')];
    const firstIsHeader = t.content[0]?.content.every((c) => c.type === 'tableHeader');
    const header = firstIsHeader ? pad(rows.shift()!) : Array(width).fill('');
    const line = (r: string[]) => `| ${r.join(' | ')} |`;
    return [line(header), line(Array(width).fill('---')), ...rows.map((r) => line(pad(r)))].join('\n');
  };

  const list = (l: T.BulletListNode | T.OrderedListNode): string => {
    const start = l.type === 'orderedList' ? l.attrs?.order ?? 1 : 0;
    return l.content.map((item, i) => {
      const marker = l.type === 'orderedList' ? `${start + i}. ` : '- ';
      const body = blocks(item.content, '\n');
      return marker + indent(body, ' '.repeat(marker.length)).slice(marker.length);
    }).join('\n');
  };

  const block = (n: T.AdfNode): string => {
    switch (n.type) {
      case 'doc': return blocks(n.content);
      case 'paragraph': return inline(n.content ?? []);
      case 'heading': return `${'#'.repeat(n.attrs.level)} ${inline(n.content ?? [])}`;
      case 'codeBlock': {
        const src = (n.content ?? []).map((t) => t.text).join('');
        const fence = src.includes('```') ? '~~~~' : '```';
        return `${fence}${n.attrs?.language ?? ''}\n${src}\n${fence}`;
      }
      case 'rule': return '---';
      case 'blockquote': return indent(blocks(n.content), '> ').replace(/^$/gm, '>');
      case 'bulletList': case 'orderedList': return list(n);
      case 'listItem': return blocks(n.content, '\n');
      case 'panel': {
        const kind = { info: 'NOTE', note: 'NOTE', success: 'TIP', warning: 'WARNING', error: 'CAUTION', custom: 'NOTE' }[n.attrs.panelType];
        return `> [!${kind}]\n` + indent(blocks(n.content), '> ').replace(/^$/gm, '>');
      }
      case 'expand': case 'nestedExpand':
        // Titles are embedded in HTML; escape as HTML, not Markdown.
        return `<details>\n<summary>${escapeHtml(n.attrs?.title ?? '')}</summary>\n\n${blocks(n.content)}\n\n</details>`;
      case 'table': return table(n);
      case 'mediaSingle': return media(n.content[0]);
      case 'mediaGroup': return n.content.map(media).join('\n');
      case 'media': return media(n);
      case 'blockCard': case 'embedCard': return card(n);
      default: return inline([n]);
    }
  };

  const blocks = (nodes: T.AdfNode[], sep = '\n\n'): string => nodes.map(block).filter((s) => s !== '').join(sep);

  return block(root);
}

// ─────────────────────────── Text → ADF ───────────────────────────

export interface FromPlainTextOptions {
  /**
   * - `blocks` (default): blank lines separate paragraphs; single newlines become hardBreaks.
   * - `lines`: each line (including blanks) becomes its own paragraph — Jira write style.
   */
  mode?: 'blocks' | 'lines';
}

/**
 * Convert plain text into an ADF doc.
 * Handy for Jira REST v3 fields that require ADF.
 */
export function fromPlainText(input: string, opts: FromPlainTextOptions = {}): T.DocNode {
  const mode = opts.mode ?? 'blocks';
  const normalized = input.replace(/\r\n?/g, '\n');

  if (mode === 'lines') {
    const lines = normalized.split('\n');
    return {
      version: 1,
      type: 'doc',
      content: lines.map((line): T.ParagraphNode =>
        line.length === 0 ? { type: 'paragraph', content: [] } : { type: 'paragraph', content: [{ type: 'text', text: line }] },
      ),
    };
  }

  const paras = normalized.split(/\n{2,}/).filter((p) => p.trim() !== '');
  return {
    version: 1,
    type: 'doc',
    content: paras.map((para): T.ParagraphNode => {
      const content: T.InlineNode[] = [];
      para.split('\n').forEach((line, i) => {
        if (i > 0) content.push({ type: 'hardBreak' });
        if (line) content.push({ type: 'text', text: line });
      });
      return content.length ? { type: 'paragraph', content } : { type: 'paragraph' };
    }),
  };
}

/** Alias for `fromPlainText(text, { mode: 'lines' })` — one paragraph per line. */
export const plainTextToAdf = (text: string): T.DocNode => fromPlainText(text, { mode: 'lines' });

export interface AdfMentionRef {
  accountId: string;
  displayName: string;
}

/**
 * Build ADF for a comment, optionally starting with a user mention (reply).
 * Strips a leading `@displayName` from plain text when a mention ref is provided.
 * Uses paragraph-per-line layout to match Jira Cloud comment writes.
 */
export function commentTextToAdf(input: string, leadingMention?: AdfMentionRef): T.DocNode {
  const normalized = input.replace(/\r\n?/g, '\n');
  if (!leadingMention?.accountId.trim()) {
    return plainTextToAdf(normalized);
  }

  const mentionLabel = `@${leadingMention.displayName.trim() || 'user'}`;
  // Match historical @atlaskit/adf-utils builder output (empty accessLevel).
  const mentionNode = mention(leadingMention.accountId.trim(), mentionLabel, { accessLevel: '' });

  let remainder = normalized;
  const escaped = mentionLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  remainder = remainder.replace(new RegExp(`^\\s*${escaped}\\s*`), '');

  const lines = remainder.split('\n');
  const firstLine = lines[0] ?? '';
  const firstContent: T.InlineNode[] = firstLine.length === 0
    ? [mentionNode]
    : [mentionNode, textNode(` ${firstLine}`)];
  const rest = lines.slice(1).map((line): T.ParagraphNode =>
    line.length === 0 ? { type: 'paragraph', content: [] } : paragraph(line),
  );
  return doc({ type: 'paragraph', content: firstContent }, ...rest);
}
