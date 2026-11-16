import type { AdfNode, NodeOfType, NodeType } from './types.js';

export interface VisitContext {
  parent: AdfNode | null;
  index: number;
  depth: number;
  /** Ancestors from root to direct parent. */
  ancestors: AdfNode[];
}

const childrenOf = (n: AdfNode): AdfNode[] => ((n as { content?: AdfNode[] }).content ?? []);

/** Depth-first, pre-order walk. Return `false` from the visitor to skip a node's children. */
export function walk(root: AdfNode, visitor: (node: AdfNode, ctx: VisitContext) => void | false): void {
  const go = (node: AdfNode, ctx: VisitContext) => {
    if (visitor(node, ctx) === false) return;
    const ancestors = [...ctx.ancestors, node];
    childrenOf(node).forEach((child, index) => go(child, { parent: node, index, depth: ctx.depth + 1, ancestors }));
  };
  go(root, { parent: null, index: 0, depth: 0, ancestors: [] });
}

/** All nodes of a given type, in document order. */
export function findAll<T extends NodeType>(root: AdfNode, type: T): NodeOfType<T>[] {
  const out: NodeOfType<T>[] = [];
  walk(root, (n) => { if (n.type === type) out.push(n as NodeOfType<T>); });
  return out;
}

/** First node matching the predicate, or undefined. */
export function find(root: AdfNode, pred: (n: AdfNode) => boolean): AdfNode | undefined {
  let hit: AdfNode | undefined;
  walk(root, (n) => { if (hit) return false; if (pred(n)) { hit = n; return false; } });
  return hit;
}

/**
 * Immutable, bottom-up transform. The mapper receives a node whose children are already
 * transformed and returns a replacement node, an array of nodes (spliced in), or null to remove it.
 */
export function map(root: AdfNode, fn: (node: AdfNode) => AdfNode | AdfNode[] | null): AdfNode | null {
  const rec = (node: AdfNode): AdfNode[] => {
    const kids = (node as { content?: AdfNode[] }).content;
    const copy = (kids ? { ...node, content: kids.flatMap(rec) } : { ...node }) as AdfNode;
    const r = fn(copy);
    return r === null ? [] : Array.isArray(r) ? r : [r];
  };
  const out = rec(root);
  return out[0] ?? null;
}

/** Deep clone (ADF is plain JSON). */
export const clone = <T extends AdfNode>(n: T): T => JSON.parse(JSON.stringify(n));
