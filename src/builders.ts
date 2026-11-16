import type * as T from './types.js';

/** Anything that can be used where inline content is expected: strings become text nodes. */
export type InlineInput = T.InlineNode | string;

const toInline = (items: InlineInput[]): T.InlineNode[] =>
  items.filter((i) => i !== '').map((i) => (typeof i === 'string' ? text(i) : i));

const withContent = <N extends { content?: unknown[] }>(node: N): N => {
  if (node.content && node.content.length === 0) delete node.content;
  return node;
};

// ───────────── Marks ─────────────

export const mark = {
  code: (): T.CodeMark => ({ type: 'code' }),
  em: (): T.EmMark => ({ type: 'em' }),
  strike: (): T.StrikeMark => ({ type: 'strike' }),
  strong: (): T.StrongMark => ({ type: 'strong' }),
  underline: (): T.UnderlineMark => ({ type: 'underline' }),
  link: (href: string, title?: string): T.LinkMark => ({ type: 'link', attrs: title ? { href, title } : { href } }),
  sub: (): T.SubSupMark => ({ type: 'subsup', attrs: { type: 'sub' } }),
  sup: (): T.SubSupMark => ({ type: 'subsup', attrs: { type: 'sup' } }),
  textColor: (color: string): T.TextColorMark => ({ type: 'textColor', attrs: { color } }),
  backgroundColor: (color: string): T.BackgroundColorMark => ({ type: 'backgroundColor', attrs: { color } }),
  border: (size: 1 | 2 | 3, color: string): T.BorderMark => ({ type: 'border', attrs: { size, color } }),
  alignment: (align: 'center' | 'end'): T.AlignmentMark => ({ type: 'alignment', attrs: { align } }),
  indentation: (level: 1 | 2 | 3 | 4 | 5 | 6): T.IndentationMark => ({ type: 'indentation', attrs: { level } }),
  breakout: (mode: 'wide' | 'full-width'): T.BreakoutMark => ({ type: 'breakout', attrs: { mode } }),
};

// ───────────── Inline ─────────────

export function text(value: string, ...marks: T.TextMark[]): T.TextNode {
  return marks.length ? { type: 'text', text: value, marks } : { type: 'text', text: value };
}

/** Adds marks to a string or existing text node (marks are merged, duplicates by type replaced). */
function marked(m: T.TextMark) {
  return (input: string | T.TextNode): T.TextNode => {
    const node = typeof input === 'string' ? text(input) : input;
    const rest = (node.marks ?? []).filter((x) => x.type !== m.type);
    return { ...node, marks: [...rest, m] };
  };
}
export const strong = marked(mark.strong());
export const em = marked(mark.em());
export const strike = marked(mark.strike());
export const underline = marked(mark.underline());
export const code = marked(mark.code());
export const sub = marked(mark.sub());
export const sup = marked(mark.sup());
export const color = (c: string) => marked(mark.textColor(c));
export const highlight = (c: string) => marked(mark.backgroundColor(c));
export const link = (href: string, label?: string | T.TextNode, title?: string): T.TextNode =>
  marked(mark.link(href, title))(label ?? href);

export const hardBreak = (): T.HardBreakNode => ({ type: 'hardBreak' });

export const mention = (id: string, displayText?: string, extra: Partial<T.MentionNode['attrs']> = {}): T.MentionNode => ({
  type: 'mention',
  attrs: { id, ...(displayText !== undefined ? { text: displayText.startsWith('@') ? displayText : `@${displayText}` } : {}), ...extra },
});

export const emoji = (shortName: string, extra: { id?: string; text?: string } = {}): T.EmojiNode => ({
  type: 'emoji',
  attrs: { shortName: shortName.startsWith(':') ? shortName : `:${shortName}:`, ...extra },
});

export const date = (value: Date | number | string): T.DateNode => {
  let ms: number;
  if (value instanceof Date) {
    ms = value.getTime();
  } else if (typeof value === 'number') {
    ms = value;
  } else if (/^\d+$/.test(value)) {
    ms = Number(value);
  } else {
    ms = Date.parse(value);
  }
  if (!Number.isFinite(ms)) {
    throw new RangeError(`date(): invalid timestamp input ${JSON.stringify(value)}`);
  }
  return { type: 'date', attrs: { timestamp: String(ms) } };
};

export const status = (label: string, statusColor: T.StatusColor = 'neutral'): T.StatusNode => ({
  type: 'status',
  attrs: { text: label, color: statusColor },
});

export const inlineCard = (url: string): T.InlineCardNode => ({ type: 'inlineCard', attrs: { url } });
export const blockCard = (url: string): T.BlockCardNode => ({ type: 'blockCard', attrs: { url } });
export const embedCard = (
  url: string,
  extra: { layout?: T.EmbedCardNode['attrs']['layout']; width?: number } = {},
): T.EmbedCardNode => ({
  type: 'embedCard',
  attrs: { url, ...extra },
});

export const mediaInline = (
  attrs: T.MediaInlineNode['attrs'],
  marks?: T.MediaInlineNode['marks'],
): T.MediaInlineNode => (marks?.length ? { type: 'mediaInline', attrs, marks } : { type: 'mediaInline', attrs });

// ───────────── Blocks ─────────────

export const doc = (...content: T.TopLevelBlockNode[]): T.DocNode => ({ version: 1, type: 'doc', content });

export const paragraph = (...content: InlineInput[]): T.ParagraphNode =>
  withContent({ type: 'paragraph', content: toInline(content) });
export const p = paragraph;

export const heading = (level: T.HeadingNode['attrs']['level'], ...content: InlineInput[]): T.HeadingNode =>
  withContent({ type: 'heading', attrs: { level }, content: toInline(content) });
export const h1 = (...c: InlineInput[]) => heading(1, ...c);
export const h2 = (...c: InlineInput[]) => heading(2, ...c);
export const h3 = (...c: InlineInput[]) => heading(3, ...c);
export const h4 = (...c: InlineInput[]) => heading(4, ...c);
export const h5 = (...c: InlineInput[]) => heading(5, ...c);
export const h6 = (...c: InlineInput[]) => heading(6, ...c);

export const codeBlock = (source: string, language?: string): T.CodeBlockNode => {
  const node: T.CodeBlockNode = { type: 'codeBlock' };
  if (language) node.attrs = { language };
  if (source) node.content = [{ type: 'text', text: source }];
  return node;
};

export const rule = (): T.RuleNode => ({ type: 'rule' });

export const blockquote = (...content: (T.BlockquoteNode['content'][number] | string)[]): T.BlockquoteNode => ({
  type: 'blockquote',
  content: content.map((c) => (typeof c === 'string' ? paragraph(c) : c)),
});

type ListItemInput = T.ListItemNode | T.ListItemNode['content'][number] | string | InlineInput[];
const toListItem = (i: ListItemInput): T.ListItemNode => {
  if (typeof i === 'string') return { type: 'listItem', content: [paragraph(i)] };
  if (Array.isArray(i)) return { type: 'listItem', content: [paragraph(...i)] };
  if (i.type === 'listItem') return i;
  return { type: 'listItem', content: [i] };
};

export const listItem = (...content: (T.ListItemNode['content'][number] | string)[]): T.ListItemNode => ({
  type: 'listItem',
  content: content.map((c) => (typeof c === 'string' ? paragraph(c) : c)),
});

/** `bulletList('a', 'b', ['mixed ', strong('inline')], listItem(p('x'), bulletList('nested')))` */
export const bulletList = (...items: ListItemInput[]): T.BulletListNode => ({ type: 'bulletList', content: items.map(toListItem) });
export const orderedList = (...items: ListItemInput[]): T.OrderedListNode => ({ type: 'orderedList', content: items.map(toListItem) });
export const orderedListFrom = (order: number, ...items: ListItemInput[]): T.OrderedListNode => ({
  type: 'orderedList', attrs: { order }, content: items.map(toListItem),
});

export const panel = (panelType: T.PanelType, ...content: (T.PanelNode['content'][number] | string)[]): T.PanelNode => ({
  type: 'panel',
  attrs: { panelType },
  content: content.map((c) => (typeof c === 'string' ? paragraph(c) : c)),
});

export const expand = (title: string, ...content: (T.ExpandNode['content'][number] | string)[]): T.ExpandNode => ({
  type: 'expand',
  attrs: { title },
  content: content.map((c) => (typeof c === 'string' ? paragraph(c) : c)),
});

export const nestedExpand = (title: string, ...content: (T.NestedExpandContent | string)[]): T.NestedExpandNode => ({
  type: 'nestedExpand',
  attrs: { title },
  content: content.map((c) => (typeof c === 'string' ? paragraph(c) : c)),
});

// ───────────── Media ─────────────

export const media = (attrs: T.MediaNode['attrs'], marks?: T.MediaNode['marks']): T.MediaNode =>
  marks?.length ? { type: 'media', attrs, marks } : { type: 'media', attrs };
export const externalMedia = (url: string, extra: { width?: number; height?: number; alt?: string } = {}): T.MediaNode =>
  media({ type: 'external', url, ...extra });
export const fileMedia = (id: string, collection: string, extra: { width?: number; height?: number; alt?: string } = {}): T.MediaNode =>
  media({ type: 'file', id, collection, ...extra });
export const mediaGroup = (...content: T.MediaNode[]): T.MediaGroupNode => ({ type: 'mediaGroup', content });
export const mediaSingle = (m: T.MediaNode, layout: T.MediaSingleLayout = 'center', width?: number): T.MediaSingleNode => ({
  type: 'mediaSingle',
  attrs: width !== undefined ? { layout, width } : { layout },
  content: [m],
});

// ───────────── Tables ─────────────

const INLINE_TYPES = new Set(['text', 'hardBreak', 'mention', 'emoji', 'date', 'status', 'inlineCard', 'mediaInline']);
const isInlineInput = (x: unknown): x is InlineInput =>
  typeof x === 'string' || (typeof x === 'object' && x !== null && INLINE_TYPES.has((x as T.AdfNode).type));

/** Cell content: a string, inline nodes, a block node, or an array of block nodes. */
export type CellContentInput = string | T.InlineNode | InlineInput[] | T.TableCellContent | T.TableCellContent[];
export type CellInput = CellContentInput | T.TableCellNode | T.TableHeaderNode;

function normalizeCell(c: CellContentInput): T.TableCellContent[] {
  if (Array.isArray(c)) {
    if (c.length === 0) return [paragraph()];
    return c.every(isInlineInput) ? [paragraph(...(c as InlineInput[]))] : (c as T.TableCellContent[]);
  }
  return isInlineInput(c) ? [paragraph(c)] : [c];
}

export const tableCell = (content: CellContentInput = '', attrs?: T.TableCellAttrs): T.TableCellNode =>
  attrs ? { type: 'tableCell', attrs, content: normalizeCell(content) } : { type: 'tableCell', content: normalizeCell(content) };

export const tableHeader = (content: CellContentInput = '', attrs?: T.TableCellAttrs): T.TableHeaderNode =>
  attrs ? { type: 'tableHeader', attrs, content: normalizeCell(content) } : { type: 'tableHeader', content: normalizeCell(content) };

const isCellNode = (c: CellInput): c is T.TableCellNode | T.TableHeaderNode =>
  typeof c === 'object' && !Array.isArray(c) && (c.type === 'tableCell' || c.type === 'tableHeader');

export const tableRow = (...cells: CellInput[]): T.TableRowNode => ({
  type: 'tableRow', content: cells.map((c) => (isCellNode(c) ? c : tableCell(c))),
});
export const tableHeaderRow = (...cells: CellInput[]): T.TableRowNode => ({
  type: 'tableRow', content: cells.map((c) => (isCellNode(c) ? c : tableHeader(c))),
});

export const table = (...rows: T.TableRowNode[]): T.TableNode => ({ type: 'table', content: rows });

/** Convenience: build a table from a header array and row arrays. */
export function tableFrom(headers: CellInput[] | null, rows: CellInput[][], attrs?: T.TableNode['attrs']): T.TableNode {
  const content = [...(headers ? [tableHeaderRow(...headers)] : []), ...rows.map((r) => tableRow(...r))];
  return attrs ? { type: 'table', attrs, content } : { type: 'table', content };
}
