# @ai-testing-tool/atlassian-adf-lite

Zero-dependency TypeScript toolkit for the [Atlassian Document Format](https://developer.atlassian.com/cloud/jira/platform/apis/document/structure/) — the rich-text JSON used by Jira Cloud (REST v3 comments, descriptions, textarea fields) and Confluence.

- **Types** for every documented node and mark (`DocNode`, `ParagraphNode`, `TextMark`, …)
- **Builders** that make documents short to write and correct by construction
- **Validator** enforcing the nesting, attribute and mark rules from the spec, with JSON paths in errors
- **Converters**: `toHtml` (safe, escaped), `toMarkdown` (GFM), `toPlainText`, `fromPlainText` / `plainTextToAdf`, `commentTextToAdf`
- **Traversal**: `walk`, `find`, `findAll`, immutable `map`

## Install

```bash
npm install @ai-testing-tool/atlassian-adf-lite
```

## Build & test (contributors)

```bash
npm install
npm run build   # → dist/esm + dist/cjs (dual package)
npm test
npm run release:dry
npm run release   # requires NPM_TOKEN in .env
```

## Build a document

```ts
import { doc, h2, p, strong, em, link, mention, status, bulletList, listItem,
         orderedList, codeBlock, panel, tableFrom, expand } from '@ai-testing-tool/atlassian-adf-lite';

const body = doc(
  h2('Release 2.4'),
  p('Shipped by ', mention('5b10ac8d82e05b22cc7d4ef5', 'Ana'), ' — ', status('Done', 'green')),
  p('See ', link('https://example.com/changelog', 'the changelog'), ' for ', strong(em('everything')), '.'),
  bulletList('Faster search', ['New ', strong('dark mode')], listItem(p('API'), orderedList('v1', 'v2'))),
  codeBlock('npm i our-sdk@2.4', 'bash'),
  panel('warning', 'Tokens issued before 2.0 are revoked.'),
  tableFrom(['Metric', 'Before', 'After'], [['p95 ms', '420', '180']]),
  expand('Migration notes', p('Nothing to do.')),
);

// Jira REST v3
await fetch(`${site}/rest/api/3/issue/${key}/comment`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: auth },
  body: JSON.stringify({ body }),
});
```

Strings are accepted anywhere inline content or a paragraph is expected. Mark helpers (`strong`, `em`, `code`, `strike`, `underline`, `sub`, `sup`, `color('#hex')`, `highlight('#hex')`, `link(href, label)`) take a string or text node and compose: `strong(em('x'))`. For raw marks use `text('x', mark.strong(), mark.textColor('#ff5630'))`.

## Validate untrusted ADF

```ts
import { validate, assertValid, isAdfDoc } from '@ai-testing-tool/atlassian-adf-lite';

const { valid, errors } = validate(json);
// errors: [{ path: 'content[2].content[0].marks[1]', message: 'code mark can only be combined with link (found strong)' }]

const d = assertValid(json);     // throws AdfValidationError
if (isAdfDoc(json)) { /* json is DocNode */ }

validate(json, { strictTypes: false });  // tolerate newer node types (e.g. syncBlock)
```

Checks include: allowed children per node, required/min/max content, `listItem` first child, required attrs and their values (heading level 1–6, panel types, status colours, hex colours, epoch-ms date strings…), which marks are allowed on which node, no marks in `codeBlock` text, `code` only combined with `link`, duplicate marks, and `version` only on the root.

## Convert to HTML and Markdown

```ts
import { toHtml, toMarkdown, DEFAULT_CSS } from '@ai-testing-tool/atlassian-adf-lite';

const html = toHtml(issue.fields.description, {
  mention: (m) => `@${users[m.attrs.id]}`,          // resolve account IDs
  mediaUrl: (m) => (m.type === 'media' && m.attrs.type === 'file' ? `/attachments/${m.attrs.id}` : null),
  pretty: false,                                     // single line
});
document.body.innerHTML = `<style>${DEFAULT_CSS}</style>${html}`;

const md = toMarkdown(issue.fields.description);
```

`toHtml` escapes all text and attributes, only allows `http`, `https` and `mailto` URLs (configurable via `allowedSchemes`), and only accepts hex colours, so it's safe for ADF from untrusted sources. Output is semantic HTML (`<details>` for expands, `<thead>` for header rows, `<time>` for dates) with `adf-*` classes for mentions, statuses, panels and tables; `DEFAULT_CSS` gives a Jira-like look.

`toMarkdown` produces GitHub-flavoured Markdown: tables, nested lists, fenced code with language, panels as `> [!WARNING]` alerts, expands as `<details>`.

## Read / transform

```ts
import { toPlainText, toMarkdown, fromPlainText, findAll, map } from '@ai-testing-tool/atlassian-adf-lite';

toPlainText(issue.fields.description);
fromPlainText('line 1\nline 2\n\nnext paragraph');   // hardBreaks + paragraphs (mode: 'blocks')
plainTextToAdf('line 1\n\nline 2');                   // one paragraph per line (Jira write style)
commentTextToAdf('Thanks', { accountId, displayName }); // reply with leading mention

findAll(body, 'mention').map((m) => m.attrs.id);
const redacted = map(body, (n) => (n.type === 'mention' ? { type: 'text', text: '@someone' } : n));
```

## Scope

Covers the nodes and marks documented on the Jira Cloud ADF pages, plus `blockCard` / `embedCard` / `mediaInline` builders. Newer/experimental nodes listed there without detail (`bodiedSyncBlock`, `syncBlock`, `multiBodiedExtension`, `extensionFrame`, `blockTaskItem`) are not modelled; use `strictTypes: false` to let them pass validation. Markdown output is lossy for colours, alignment and panel styling (panels become GitHub alerts, expands become `<details>`). `toMarkdown` HTML-escapes expand titles and blocks non-`http`/`https`/`mailto` link schemes.
