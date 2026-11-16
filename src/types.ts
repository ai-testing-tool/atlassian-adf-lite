/**
 * Type definitions for the Atlassian Document Format (ADF).
 * https://developer.atlassian.com/cloud/jira/platform/apis/document/structure/
 */

// ───────────────────────────── Marks ─────────────────────────────

export interface CodeMark { type: 'code' }
export interface EmMark { type: 'em' }
export interface StrikeMark { type: 'strike' }
export interface StrongMark { type: 'strong' }
export interface UnderlineMark { type: 'underline' }
export interface LinkMark {
  type: 'link';
  attrs: { href: string; title?: string; id?: string; collection?: string; occurrenceKey?: string };
}
export interface SubSupMark { type: 'subsup'; attrs: { type: 'sub' | 'sup' } }
/** Hex colour, e.g. "#ff5630". */
export interface TextColorMark { type: 'textColor'; attrs: { color: string } }
export interface BackgroundColorMark { type: 'backgroundColor'; attrs: { color: string } }
export interface BorderMark { type: 'border'; attrs: { size: 1 | 2 | 3; color: string } }
/** Block mark for paragraph / heading. */
export interface AlignmentMark { type: 'alignment'; attrs: { align: 'center' | 'end' } }
/** Block mark for paragraph / heading. */
export interface IndentationMark { type: 'indentation'; attrs: { level: 1 | 2 | 3 | 4 | 5 | 6 } }
/** Block mark for codeBlock / expand / layoutSection. */
export interface BreakoutMark { type: 'breakout'; attrs: { mode: 'wide' | 'full-width'; width?: number } }

export type TextMark =
  | CodeMark | EmMark | StrikeMark | StrongMark | UnderlineMark | LinkMark
  | SubSupMark | TextColorMark | BackgroundColorMark;

export type Mark = TextMark | BorderMark | AlignmentMark | IndentationMark | BreakoutMark;
export type MarkType = Mark['type'];

// ─────────────────────────── Inline nodes ───────────────────────────

export interface TextNode { type: 'text'; text: string; marks?: TextMark[] }
export interface HardBreakNode { type: 'hardBreak'; attrs?: { text?: '\n' } }
export interface MentionNode {
  type: 'mention';
  attrs: {
    id: string; text?: string; localId?: string;
    accessLevel?: 'NONE' | 'SITE' | 'APPLICATION' | 'CONTAINER' | string;
    userType?: 'DEFAULT' | 'SPECIAL' | 'APP';
  };
}
export interface EmojiNode { type: 'emoji'; attrs: { shortName: string; id?: string; text?: string } }
/** timestamp: Unix epoch milliseconds, as a string. */
export interface DateNode { type: 'date'; attrs: { timestamp: string } }
export type StatusColor = 'neutral' | 'purple' | 'blue' | 'red' | 'yellow' | 'green';
export interface StatusNode {
  type: 'status';
  attrs: { text: string; color: StatusColor; localId?: string; style?: string };
}
export type CardAttrs =
  | { url: string; data?: never }
  | { data: Record<string, unknown>; url?: never };

export interface InlineCardNode {
  type: 'inlineCard';
  attrs: CardAttrs;
}
export interface MediaInlineNode {
  type: 'mediaInline';
  attrs: {
    id: string; collection: string; type?: 'file' | 'link' | 'image';
    localId?: string; alt?: string; width?: number; height?: number;
  };
  marks?: (LinkMark | BorderMark)[];
}

/** Block smart-link card (Jira/Confluence). */
export interface BlockCardNode {
  type: 'blockCard';
  attrs: CardAttrs;
}

/** Embedded smart-link card (Confluence; also seen in some Jira ADF). */
export interface EmbedCardNode {
  type: 'embedCard';
  attrs: CardAttrs & { layout?: 'wide' | 'full-width' | 'center'; width?: number };
}

export type InlineNode =
  | TextNode | HardBreakNode | MentionNode | EmojiNode | DateNode
  | StatusNode | InlineCardNode | MediaInlineNode;

// ─────────────────────────── Block nodes ───────────────────────────

export interface ParagraphNode {
  type: 'paragraph';
  content?: InlineNode[];
  marks?: (AlignmentMark | IndentationMark)[];
  attrs?: { localId?: string };
}

export interface HeadingNode {
  type: 'heading';
  attrs: { level: 1 | 2 | 3 | 4 | 5 | 6; localId?: string };
  content?: InlineNode[];
  marks?: (AlignmentMark | IndentationMark)[];
}

/** Text inside a code block carries no marks. */
export interface CodeBlockNode {
  type: 'codeBlock';
  attrs?: { language?: string };
  content?: { type: 'text'; text: string }[];
  marks?: BreakoutMark[];
}

export interface RuleNode { type: 'rule' }

export interface BlockquoteNode {
  type: 'blockquote';
  content: (ParagraphNode | BulletListNode | OrderedListNode | CodeBlockNode | MediaGroupNode | MediaSingleNode)[];
}

export interface ListItemNode {
  type: 'listItem';
  content: (ParagraphNode | BulletListNode | OrderedListNode | CodeBlockNode | MediaSingleNode)[];
}
export interface BulletListNode { type: 'bulletList'; content: ListItemNode[] }
export interface OrderedListNode { type: 'orderedList'; attrs?: { order?: number }; content: ListItemNode[] }

export type PanelType = 'info' | 'note' | 'warning' | 'success' | 'error' | 'custom';
export interface PanelNode {
  type: 'panel';
  attrs: { panelType: PanelType; panelIcon?: string; panelIconId?: string; panelIconText?: string; panelColor?: string };
  content: (ParagraphNode | HeadingNode | BulletListNode | OrderedListNode | CodeBlockNode | MediaGroupNode | MediaSingleNode | RuleNode)[];
}

export interface MediaNode {
  type: 'media';
  attrs:
    | { type: 'file' | 'link'; id: string; collection: string; width?: number; height?: number; alt?: string; occurrenceKey?: string; localId?: string }
    | { type: 'external'; url: string; width?: number; height?: number; alt?: string; localId?: string };
  marks?: (LinkMark | BorderMark)[];
}
export interface MediaGroupNode { type: 'mediaGroup'; content: MediaNode[] }
export type MediaSingleLayout =
  | 'wrap-left' | 'center' | 'wrap-right' | 'wide' | 'full-width' | 'align-start' | 'align-end';
export interface MediaSingleNode {
  type: 'mediaSingle';
  attrs: { layout: MediaSingleLayout; width?: number; widthType?: 'percentage' | 'pixel' };
  /** Exactly one media node. */
  content: [MediaNode];
  marks?: LinkMark[];
}

export type NestedExpandContent =
  | ParagraphNode | HeadingNode | MediaGroupNode | MediaSingleNode | CodeBlockNode
  | BulletListNode | OrderedListNode | PanelNode | BlockquoteNode | RuleNode;

export interface NestedExpandNode { type: 'nestedExpand'; attrs: { title?: string }; content: NestedExpandContent[] }
export interface ExpandNode {
  type: 'expand';
  attrs?: { title?: string };
  content: (NestedExpandContent | NestedExpandNode | TableNode)[];
  marks?: BreakoutMark[];
}

export interface TableCellAttrs {
  background?: string;
  colspan?: number;
  rowspan?: number;
  /** One width (px) per column spanned. */
  colwidth?: number[];
}
export type TableCellContent =
  | ParagraphNode | HeadingNode | BulletListNode | OrderedListNode | CodeBlockNode
  | MediaGroupNode | MediaSingleNode | PanelNode | BlockquoteNode | RuleNode | NestedExpandNode;
export interface TableCellNode { type: 'tableCell'; attrs?: TableCellAttrs; content: TableCellContent[] }
export interface TableHeaderNode { type: 'tableHeader'; attrs?: TableCellAttrs; content: TableCellContent[] }
export interface TableRowNode { type: 'tableRow'; content: (TableCellNode | TableHeaderNode)[] }
export interface TableNode {
  type: 'table';
  attrs?: {
    isNumberColumnEnabled?: boolean;
    layout?: 'center' | 'align-start' | 'default' | 'wide' | 'full-width';
    width?: number;
    displayMode?: 'default' | 'fixed';
    localId?: string;
  };
  content: TableRowNode[];
}

export type TopLevelBlockNode =
  | BlockquoteNode | BulletListNode | CodeBlockNode | ExpandNode | HeadingNode
  | MediaGroupNode | MediaSingleNode | OrderedListNode | PanelNode | ParagraphNode
  | RuleNode | TableNode | BlockCardNode | EmbedCardNode;

export type ChildBlockNode =
  | ListItemNode | MediaNode | NestedExpandNode | TableCellNode | TableHeaderNode | TableRowNode;

export interface DocNode { version: 1; type: 'doc'; content: TopLevelBlockNode[] }

export type BlockNode = TopLevelBlockNode | ChildBlockNode;
export type AdfNode = DocNode | BlockNode | InlineNode;
export type NodeType = AdfNode['type'];

/** Lookup a node interface by its `type` string. */
export type NodeOfType<T extends NodeType> = Extract<AdfNode, { type: T }>;
