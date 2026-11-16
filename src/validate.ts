import type { AdfNode, DocNode } from './types.js';

export interface ValidationError {
  /** JSON path to the offending value, e.g. "content[0].content[2].marks[1]" */
  path: string;
  message: string;
}
export interface ValidationResult { valid: boolean; errors: ValidationError[] }
export interface ValidateOptions {
  /** Treat node types this library does not know as errors (default true). */
  strictTypes?: boolean;
  /** Stop after this many errors (default Infinity). */
  maxErrors?: number;
}

type AttrCheck = (v: unknown) => string | null;
interface NodeSpec {
  content?: readonly string[];      // allowed child types; undefined = leaf
  minContent?: number;
  maxContent?: number;
  requiredContent?: boolean;        // `content` key must be present
  attrs?: Record<string, { required?: boolean; check: AttrCheck }>;
  marks?: readonly string[];        // allowed marks on this node
  firstChild?: readonly string[];
}

// ── attribute checkers ──
const isStr: AttrCheck = (v) => (typeof v === 'string' ? null : 'must be a string');
const nonEmptyStr: AttrCheck = (v) => (typeof v === 'string' && v.length > 0 ? null : 'must be a non-empty string');
const isNum: AttrCheck = (v) => (typeof v === 'number' && Number.isFinite(v) ? null : 'must be a number');
const isBool: AttrCheck = (v) => (typeof v === 'boolean' ? null : 'must be a boolean');
const oneOf = (...vals: unknown[]): AttrCheck => (v) => (vals.includes(v) ? null : `must be one of ${vals.map((x) => JSON.stringify(x)).join(', ')}`);
const intRange = (min: number, max: number): AttrCheck => (v) =>
  Number.isInteger(v) && (v as number) >= min && (v as number) <= max ? null : `must be an integer ${min}–${max}`;
const hexColor: AttrCheck = (v) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? null : 'must be a hex colour like "#ff5630"');
const numArray: AttrCheck = (v) => (Array.isArray(v) && v.every((n) => typeof n === 'number') ? null : 'must be an array of numbers');

const INLINE = ['text', 'hardBreak', 'mention', 'emoji', 'date', 'status', 'inlineCard', 'mediaInline'] as const;
const TEXT_MARKS = ['code', 'em', 'link', 'strike', 'strong', 'subsup', 'textColor', 'backgroundColor', 'underline'] as const;
const NESTED_EXPAND_CONTENT = ['paragraph', 'heading', 'mediaGroup', 'mediaSingle', 'codeBlock', 'bulletList', 'orderedList', 'panel', 'blockquote', 'rule'] as const;
const TABLE_CELL_CONTENT = [...NESTED_EXPAND_CONTENT, 'nestedExpand'] as const;
const TOP_LEVEL = ['blockquote', 'bulletList', 'codeBlock', 'expand', 'heading', 'mediaGroup', 'mediaSingle', 'orderedList', 'panel', 'paragraph', 'rule', 'table', 'blockCard', 'embedCard'] as const;
const cardAttrs = {
  url: { check: isStr },
  data: { check: (v: unknown) => (typeof v === 'object' && v !== null ? null : 'must be an object') },
};
const cellAttrs = {
  background: { check: isStr }, colspan: { check: intRange(1, 1000) },
  rowspan: { check: intRange(1, 1000) }, colwidth: { check: numArray },
};

export const NODE_SPECS: Record<string, NodeSpec> = {
  doc: { content: TOP_LEVEL, requiredContent: true },
  paragraph: { content: INLINE, marks: ['alignment', 'indentation'], attrs: { localId: { check: isStr } } },
  heading: {
    content: INLINE, marks: ['alignment', 'indentation'],
    attrs: { level: { required: true, check: intRange(1, 6) }, localId: { check: isStr } },
  },
  codeBlock: { content: ['text'], marks: ['breakout'], attrs: { language: { check: isStr } } },
  rule: {},
  blockquote: { content: ['paragraph', 'orderedList', 'bulletList', 'codeBlock', 'mediaGroup', 'mediaSingle'], minContent: 1, requiredContent: true },
  bulletList: { content: ['listItem'], minContent: 1, requiredContent: true },
  orderedList: { content: ['listItem'], minContent: 1, requiredContent: true, attrs: { order: { check: intRange(0, Number.MAX_SAFE_INTEGER) } } },
  listItem: {
    content: ['paragraph', 'bulletList', 'orderedList', 'codeBlock', 'mediaSingle'], minContent: 1, requiredContent: true,
    firstChild: ['paragraph', 'mediaSingle', 'codeBlock'],
  },
  panel: {
    content: ['paragraph', 'heading', 'bulletList', 'orderedList', 'codeBlock', 'mediaGroup', 'mediaSingle', 'rule'], minContent: 1, requiredContent: true,
    attrs: {
      panelType: { required: true, check: oneOf('info', 'note', 'warning', 'success', 'error', 'custom') },
      panelIcon: { check: isStr }, panelIconId: { check: isStr }, panelIconText: { check: isStr }, panelColor: { check: isStr },
    },
  },
  expand: { content: [...NESTED_EXPAND_CONTENT, 'nestedExpand', 'table'], minContent: 1, requiredContent: true, marks: ['breakout'], attrs: { title: { check: isStr } } },
  nestedExpand: { content: NESTED_EXPAND_CONTENT, minContent: 1, requiredContent: true, attrs: { title: { check: isStr } } },
  table: {
    content: ['tableRow'], minContent: 1, requiredContent: true,
    attrs: {
      isNumberColumnEnabled: { check: isBool }, layout: { check: oneOf('center', 'align-start', 'default', 'wide', 'full-width') },
      width: { check: isNum }, displayMode: { check: oneOf('default', 'fixed') }, localId: { check: isStr },
    },
  },
  tableRow: { content: ['tableCell', 'tableHeader'], minContent: 1, requiredContent: true },
  tableCell: { content: TABLE_CELL_CONTENT, minContent: 1, requiredContent: true, attrs: cellAttrs },
  tableHeader: { content: TABLE_CELL_CONTENT, minContent: 1, requiredContent: true, attrs: cellAttrs },
  mediaGroup: { content: ['media'], minContent: 1, requiredContent: true },
  mediaSingle: {
    content: ['media'], minContent: 1, maxContent: 1, requiredContent: true, marks: ['link'],
    attrs: {
      layout: { required: true, check: oneOf('wrap-left', 'center', 'wrap-right', 'wide', 'full-width', 'align-start', 'align-end') },
      width: { check: isNum }, widthType: { check: oneOf('percentage', 'pixel') },
    },
  },
  media: {
    marks: ['link', 'border'],
    attrs: {
      type: { required: true, check: oneOf('file', 'link', 'external') },
      id: { check: isStr }, collection: { check: isStr }, url: { check: isStr },
      width: { check: isNum }, height: { check: isNum }, alt: { check: isStr }, occurrenceKey: { check: isStr }, localId: { check: isStr },
    },
  },
  // inline
  text: { marks: TEXT_MARKS },
  hardBreak: { attrs: { text: { check: oneOf('\n') } } },
  mention: {
    attrs: {
      id: { required: true, check: nonEmptyStr }, text: { check: isStr }, localId: { check: isStr },
      accessLevel: { check: isStr }, userType: { check: oneOf('DEFAULT', 'SPECIAL', 'APP') },
    },
  },
  emoji: { attrs: { shortName: { required: true, check: nonEmptyStr }, id: { check: isStr }, text: { check: isStr } } },
  date: { attrs: { timestamp: { required: true, check: (v) => (typeof v === 'string' && /^\d+$/.test(v) ? null : 'must be a string of epoch milliseconds') } } },
  status: {
    attrs: {
      text: { required: true, check: isStr },
      color: { required: true, check: oneOf('neutral', 'purple', 'blue', 'red', 'yellow', 'green') },
      localId: { check: isStr }, style: { check: isStr },
    },
  },
  inlineCard: { attrs: cardAttrs },
  blockCard: { attrs: cardAttrs },
  embedCard: {
    attrs: {
      ...cardAttrs,
      layout: { check: oneOf('wide', 'full-width', 'center') },
      width: { check: isNum },
    },
  },
  mediaInline: {
    marks: ['link', 'border'],
    attrs: {
      id: { required: true, check: nonEmptyStr }, collection: { required: true, check: isStr },
      type: { check: oneOf('file', 'link', 'image') }, localId: { check: isStr }, alt: { check: isStr },
      width: { check: isNum }, height: { check: isNum },
    },
  },
};

const MARK_ATTRS: Record<string, Record<string, { required?: boolean; check: AttrCheck }>> = {
  code: {}, em: {}, strike: {}, strong: {}, underline: {},
  link: { href: { required: true, check: isStr }, title: { check: isStr }, id: { check: isStr }, collection: { check: isStr }, occurrenceKey: { check: isStr } },
  subsup: { type: { required: true, check: oneOf('sub', 'sup') } },
  textColor: { color: { required: true, check: hexColor } },
  backgroundColor: { color: { required: true, check: hexColor } },
  border: { size: { required: true, check: intRange(1, 3) }, color: { required: true, check: isStr } },
  alignment: { align: { required: true, check: oneOf('center', 'end') } },
  indentation: { level: { required: true, check: intRange(1, 6) } },
  breakout: { mode: { required: true, check: oneOf('wide', 'full-width') }, width: { check: isNum } },
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Validate an ADF document (or any sub-tree) against the structural rules in Atlassian's docs.
 * Accepts `unknown` so it can be used on untrusted JSON.
 */
export function validate(input: unknown, options: ValidateOptions = {}): ValidationResult {
  const { strictTypes = true, maxErrors = Infinity } = options;
  const errors: ValidationError[] = [];
  const err = (path: string, message: string) => { if (errors.length < maxErrors) errors.push({ path: path || '(root)', message }); };
  const join = (base: string, key: string | number) => (typeof key === 'number' ? `${base}[${key}]` : base ? `${base}.${key}` : key);

  function checkAttrs(path: string, attrs: unknown, spec: NodeSpec['attrs'] = {}, owner: string) {
    const required = Object.entries(spec).filter(([, s]) => s.required);
    if (attrs === undefined) {
      if (required.length) err(path, `${owner} requires attrs (${required.map(([k]) => k).join(', ')})`);
      return;
    }
    if (!isObj(attrs)) return err(join(path, 'attrs'), 'attrs must be an object');
    for (const [key, s] of Object.entries(spec)) {
      const v = attrs[key];
      if (v === undefined || v === null) {
        if (s.required) err(join(join(path, 'attrs'), key), `${owner}.attrs.${key} is required`);
        continue;
      }
      const msg = s.check(v);
      if (msg) err(join(join(path, 'attrs'), key), `${owner}.attrs.${key} ${msg}`);
    }
  }

  function checkMarks(path: string, node: Record<string, unknown>, spec: NodeSpec, parentType: string | undefined) {
    if (node.marks === undefined) return;
    const mp = join(path, 'marks');
    if (!Array.isArray(node.marks)) return err(mp, 'marks must be an array');
    const type = node.type as string;
    if (type === 'text' && parentType === 'codeBlock' && node.marks.length) err(mp, 'text inside codeBlock cannot have marks');
    const seen = new Set<string>();
    node.marks.forEach((m, i) => {
      const p = join(mp, i);
      if (!isObj(m) || typeof m.type !== 'string') return err(p, 'mark must be an object with a string "type"');
      if (!(m.type in MARK_ATTRS)) return err(p, `unknown mark "${m.type}"`);
      if (!spec.marks?.includes(m.type)) err(p, `mark "${m.type}" is not allowed on ${type}`);
      if (seen.has(m.type) && m.type !== 'link') err(p, `duplicate mark "${m.type}"`);
      seen.add(m.type);
      checkAttrs(p, m.attrs, MARK_ATTRS[m.type], `mark ${m.type}`);
    });
    if (seen.has('code')) {
      const bad = [...seen].filter((t) => t !== 'code' && t !== 'link');
      if (bad.length) err(mp, `code mark can only be combined with link (found ${bad.join(', ')})`);
    }
  }

  function visit(node: unknown, path: string, parentType?: string) {
    if (errors.length >= maxErrors) return;
    if (!isObj(node)) return err(path, 'node must be an object');
    const type = node.type;
    if (typeof type !== 'string') return err(path, 'node is missing a string "type"');
    const spec = NODE_SPECS[type];
    if (!spec) { if (strictTypes) err(path, `unknown node type "${type}"`); return; }

    if (type === 'doc' && node.version !== 1) err(join(path, 'version'), 'doc.version must be 1');
    if (type !== 'doc' && 'version' in node) err(join(path, 'version'), 'version is only allowed on the root doc node');

    if (type === 'text') {
      if (typeof node.text !== 'string' || node.text.length === 0) err(join(path, 'text'), 'text must be a non-empty string');
    }
    checkAttrs(path, node.attrs, spec.attrs, type);
    checkMarks(path, node, spec, parentType);

    if (type === 'media' && isObj(node.attrs)) {
      if (node.attrs.type === 'external' && typeof node.attrs.url !== 'string') err(join(path, 'attrs.url'), 'external media requires attrs.url');
      if ((node.attrs.type === 'file' || node.attrs.type === 'link') && (typeof node.attrs.id !== 'string' || typeof node.attrs.collection !== 'string'))
        err(join(path, 'attrs'), 'file/link media requires attrs.id and attrs.collection');
    }
    if ((type === 'inlineCard' || type === 'blockCard' || type === 'embedCard') && isObj(node.attrs)
      && node.attrs.url === undefined && node.attrs.data === undefined)
      err(join(path, 'attrs'), `${type} requires attrs.url or attrs.data`);

    const content = node.content;
    if (!spec.content) {
      if (content !== undefined) err(join(path, 'content'), `${type} cannot have content`);
      return;
    }
    if (content === undefined) {
      if (spec.requiredContent) err(path, `${type} requires content`);
      return;
    }
    if (!Array.isArray(content)) return err(join(path, 'content'), 'content must be an array');
    if (spec.minContent && content.length < spec.minContent) err(join(path, 'content'), `${type} needs at least ${spec.minContent} child node(s)`);
    if (spec.maxContent !== undefined && content.length > spec.maxContent) err(join(path, 'content'), `${type} allows at most ${spec.maxContent} child node(s)`);

    content.forEach((child, i) => {
      const cp = join(join(path, 'content'), i);
      if (isObj(child) && typeof child.type === 'string' && NODE_SPECS[child.type] && !spec.content!.includes(child.type)) {
        err(cp, `${child.type} is not allowed inside ${type}`);
      }
      if (i === 0 && spec.firstChild && isObj(child) && typeof child.type === 'string' && !spec.firstChild.includes(child.type)) {
        err(cp, `first child of ${type} must be one of ${spec.firstChild.join(', ')}`);
      }
      visit(child, cp, type);
    });
  }

  if (isObj(input) && input.type !== 'doc' && 'version' in input) {
    err('type', 'root with a version must be of type "doc"');
  }
  visit(input, '');
  return { valid: errors.length === 0, errors };
}

/** Type guard: true if `input` is a structurally valid ADF document. */
export function isAdfDoc(input: unknown): input is DocNode {
  return isObj(input) && input.type === 'doc' && validate(input, { maxErrors: 1 }).valid;
}

/** Throws an AdfValidationError when the document is invalid; returns it typed otherwise. */
export class AdfValidationError extends Error {
  constructor(public readonly errors: ValidationError[]) {
    super(`Invalid ADF:\n${errors.map((e) => `  ${e.path}: ${e.message}`).join('\n')}`);
    this.name = 'AdfValidationError';
  }
}
export function assertValid<T extends AdfNode = DocNode>(input: unknown, options?: ValidateOptions): T {
  const r = validate(input, options);
  if (!r.valid) throw new AdfValidationError(r.errors);
  return input as T;
}
