import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  doc, p, h2, text, strong, em, code, link, mark, bulletList, orderedList, listItem, codeBlock,
  panel, expand, nestedExpand, tableFrom, mention, emoji, status, date, rule, blockquote,
  mediaSingle, externalMedia, mediaInline, blockCard, embedCard, hardBreak,
  validate, isAdfDoc, assertValid, AdfValidationError,
  toPlainText, toMarkdown, fromPlainText, plainTextToAdf, commentTextToAdf, toHtml,
  findAll, map, walk,
} from '../src/index.js';
import type { AdfNode, TextNode } from '../src/index.js';

const sample = doc(
  h2('Release notes'),
  p('Hello ', strong('world'), ', see ', link('https://example.com', 'docs'), '.'),
  p('Ping ', mention('abc123', 'Ana'), ' ', emoji('smile'), ' ', status('In progress', 'blue')),
  bulletList('one', ['two ', em('italic')], listItem(p('three'), orderedList('a', 'b'))),
  codeBlock('const x = 1;', 'ts'),
  panel('warning', 'Careful'),
  blockquote('quoted'),
  expand('More', p('hidden'), nestedExpand('Deeper', 'x')),
  tableFrom(['Name', 'Score'], [['Ana', '10'], [[strong('Bo')], '7']]),
  mediaSingle(externalMedia('https://example.com/a.png', { alt: 'pic' })),
  blockCard('https://example.com/issue/1'),
  rule(),
);

test('matches the doc example from the Atlassian page', () => {
  const d = doc(p('Hello ', strong('world')));
  assert.deepEqual(d, {
    version: 1, type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello ' }, { type: 'text', text: 'world', marks: [{ type: 'strong' }] }] }],
  });
});

test('builders produce a valid document', () => {
  const r = validate(sample);
  assert.deepEqual(r.errors, []);
  assert.ok(isAdfDoc(sample));
});

test('empty doc and empty paragraph are valid', () => {
  assert.ok(validate(doc()).valid);
  assert.ok(validate(doc(p())).valid);
});

test('validator catches structural errors', () => {
  const bad = {
    version: 2, type: 'doc',
    content: [
      { type: 'listItem', content: [{ type: 'paragraph' }] },
      { type: 'heading', content: [] },
      { type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'code' }, { type: 'strong' }] }] },
      { type: 'codeBlock', content: [{ type: 'text', text: 'y', marks: [{ type: 'em' }] }] },
      { type: 'bulletList', content: [] },
      { type: 'paragraph', content: [{ type: 'text', text: 'z', marks: [{ type: 'textColor', attrs: { color: 'red' } }] }] },
      { type: 'mysteryNode' },
    ],
  };
  const { valid, errors } = validate(bad);
  assert.equal(valid, false);
  const msgs = errors.map((e) => `${e.path}: ${e.message}`).join('\n');
  for (const needle of [
    'doc.version must be 1', 'listItem is not allowed inside doc', 'heading requires attrs',
    'code mark can only be combined with link', 'text inside codeBlock cannot have marks',
    'bulletList needs at least 1', 'hex colour', 'unknown node type "mysteryNode"',
  ]) assert.ok(msgs.includes(needle), `missing: ${needle}\n${msgs}`);
  assert.equal(validate(bad, { strictTypes: false }).errors.some((e) => e.message.includes('mysteryNode')), false);
});

test('assertValid throws with paths', () => {
  assert.throws(() => assertValid({ version: 1, type: 'doc', content: [{ type: 'rule', content: [] }] }), AdfValidationError);
});

test('mark helpers compose and dedupe', () => {
  const t = strong(em(strong('x')));
  assert.deepEqual(t.marks?.map((m) => m.type), ['em', 'strong']);
  assert.deepEqual(text('y', mark.strike(), mark.textColor('#ff5630')).marks?.length, 2);
});

test('date accepts Date, number, ISO string and rejects invalid', () => {
  assert.equal(date(new Date(0)).attrs.timestamp, '0');
  assert.equal(date(1700000000000).attrs.timestamp, '1700000000000');
  assert.equal(date('1970-01-02T00:00:00Z').attrs.timestamp, '86400000');
  assert.throws(() => date('not-a-date'), RangeError);
  assert.throws(() => date(Number.NaN), RangeError);
});

test('toPlainText', () => {
  const t = toPlainText(doc(p('a ', strong('b')), p('c', hardBreak(), 'd'), bulletList('e', 'f')));
  assert.equal(t, 'a b\nc\nd\ne\nf');
  assert.match(toPlainText(doc(blockCard('https://ex.com'), p(mediaInline({ id: '1', collection: '', alt: 'file' })))), /https:\/\/ex.com/);
  assert.match(toPlainText(doc(p(mediaInline({ id: '1', collection: '', alt: 'file' })))), /file/);
});

test('toMarkdown', () => {
  const md = toMarkdown(sample);
  assert.match(md, /^## Release notes/);
  assert.match(md, /Hello \*\*world\*\*, see \[docs\]\(https:\/\/example.com\)\./);
  assert.match(md, /- one\n- two _italic_\n- three\n  1\. a\n  2\. b/);
  assert.match(md, /```ts\nconst x = 1;\n```/);
  assert.match(md, /> \[!WARNING\]\n> Careful/);
  assert.match(md, /\| Name \| Score \|\n\| --- \| --- \|\n\| Ana \| 10 \|\n\| \*\*Bo\*\* \| 7 \|/);
  assert.match(md, /!\[pic\]\(https:\/\/example.com\/a.png\)/);
  assert.match(md, /<https:\/\/example.com\/issue\/1>/);
});

test('toMarkdown escapes expand titles and unsafe link schemes', () => {
  const md = toMarkdown(doc(
    expand('</summary><img src=x onerror=alert(1)>', p('x')),
    p(link('javascript:alert(1)', 'click')),
  ));
  assert.match(md, /<summary>&lt;\/summary&gt;&lt;img src=x onerror=alert\(1\)&gt;<\/summary>/);
  assert.ok(!md.includes('</summary><img'));
  assert.match(md, /\]\(#\)/);
});

test('fromPlainText blocks mode', () => {
  const d = fromPlainText('line1\nline2\n\npara2');
  assert.ok(validate(d).valid);
  assert.equal(d.content.length, 2);
  assert.equal(toPlainText(d), 'line1\nline2\npara2');
});

test('plainTextToAdf is paragraph-per-line', () => {
  const built = plainTextToAdf('Hello\n\nWorld');
  assert.equal(built.content.length, 3);
  assert.deepEqual(built.content[0], { type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] });
  assert.deepEqual(built.content[1], { type: 'paragraph', content: [] });
  assert.deepEqual(built.content[2], { type: 'paragraph', content: [{ type: 'text', text: 'World' }] });
});

test('commentTextToAdf leading mention', () => {
  const built = commentTextToAdf('Thanks', { accountId: 'acc-1', displayName: 'Jexpense' });
  assert.deepEqual(built.content[0], {
    type: 'paragraph',
    content: [
      { type: 'mention', attrs: { id: 'acc-1', text: '@Jexpense', accessLevel: '' } },
      { type: 'text', text: ' Thanks' },
    ],
  });
  const mentionOnly = commentTextToAdf('@Jexpense', { accountId: 'acc-1', displayName: 'Jexpense' });
  assert.equal((mentionOnly.content[0] as { content: unknown[] }).content.length, 1);
});

test('traversal helpers', () => {
  assert.equal(findAll(sample, 'listItem').length, 5);
  let max = 0; walk(sample, (_, c) => { max = Math.max(max, c.depth); });
  assert.ok(max >= 4);
  const upper = map(sample, (n: AdfNode) => (n.type === 'text' ? { ...n, text: (n as TextNode).text.toUpperCase() } : n));
  assert.match(toPlainText(upper!), /RELEASE NOTES/);
  assert.match(toPlainText(sample), /Release notes/); // original untouched
});

test('toHtml renders the Atlassian example', () => {
  assert.equal(toHtml(doc(p('Hello ', strong('world')))), '<p>Hello <strong>world</strong></p>');
});

test('toHtml renders structure', () => {
  const html = toHtml(sample);
  assert.match(html, /<h2>Release notes<\/h2>/);
  assert.match(html, /<a href="https:\/\/example.com" rel="noopener noreferrer">docs<\/a>/);
  assert.match(html, /<span class="adf-mention" data-user-id="abc123">@Ana<\/span>/);
  assert.match(html, /<span class="adf-status adf-status-blue">In progress<\/span>/);
  assert.match(html, /<li>three\n?<ol>/);
  assert.match(html, /<pre><code class="language-ts">const x = 1;<\/code><\/pre>/);
  assert.match(html, /adf-panel-warning/);
  assert.match(html, /<thead>\n<tr><th>Name<\/th><th>Score<\/th><\/tr>\n<\/thead>/);
  assert.match(html, /<td><strong>Bo<\/strong><\/td>/);
  assert.match(html, /<details class="adf-expand">\n<summary>More<\/summary>/);
  assert.match(html, /<img src="https:\/\/example.com\/a.png" alt="pic">/);
  assert.match(html, /adf-block-card/);
  assert.match(toHtml(doc(embedCard('https://example.com/e'))), /adf-embed-card/);
});

test('toHtml escapes and blocks unsafe URLs', () => {
  const html = toHtml(doc(p('<script>x</script>', link('javascript:alert(1)', 'click'), text('t', mark.textColor('red;}body{x')))));
  assert.ok(!html.includes('<script>'));
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /href="#"/);
  assert.ok(!html.includes('red;'));
  assert.ok(!toHtml(doc(p('a')), { pretty: false }).includes('\n'));
});
