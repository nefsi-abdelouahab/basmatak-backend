# Basmatak knowledge corpus

**Status:** initial seed corpus. The content in this folder is a foundation for
content owners, not a complete manual. Review it before launch and keep it in
sync with the public product and legal copy.

This folder is the curated knowledge source for the Basmatak Tatatoua assistant.
It is committed to the backend repository and ships with the backend service.
There is no runtime upload screen and no database collection for knowledge.

## Purpose and grounding sources

The assistant is allowed to ground answers in exactly two sources:

1. **Curated knowledge** in this folder: reviewed Markdown, TXT, JSON, and CSV.
2. **Read-only public database tools** implemented in later sessions, limited to
   published opportunities, verified active organizations, public reference
   data, and public platform counts.

There is no web search, no browsing tool, and no general-knowledge fallback. If
neither source contains the answer, the assistant must say so and point to the
closest official page or support channel.

Version 1 is public-data only. Do not add individual volunteer or talent
profiles, private organization fields, applications, submissions, account data,
contact details, or internal identifiers to this corpus.

## Location and runtime resolution

The canonical location is:

```text
ai-agent/
```

At runtime the backend resolves the root with:

```text
AI_AGENT_KNOWLEDGE_DIR, otherwise process.cwd()/ai-agent
```

On Render the service root is the repository root, so the committed folder is
present at runtime. Do not point the override at `docs/`, a home directory, or
any folder that contains environment files or internal notes. Do not rely on
files outside `ai-agent/`; they are outside the deployed service root.

## What is indexed

Indexed formats:

| Format | Parsing behavior |
|---|---|
| `.md` | UTF-8 prose with optional YAML front matter. Split by headings and paragraphs; keep a heading trail per chunk. |
| `.txt` | UTF-8 prose with optional YAML front matter. Split by paragraphs; the first Markdown-style H1 is used as a title fallback. |
| `.json` | UTF-8 JSON. String leaves are flattened with key paths; arrays of objects become records. No YAML front matter. |
| `.csv` | UTF-8 CSV with a header row. One chunk per row, with column names. No YAML front matter. |

PDF and DOCX are not supported. Images, video, archives, and executable files
are not knowledge. Do not add them here.

`README.md` and the `_config/` directory are not indexed. Hidden files, hidden
directories, underscore directories, `node_modules`, `dist`, `.git`, and
symlinks are ignored or rejected. Every other supported file under this folder
is a candidate knowledge document.

Hard limits enforced before deployment:

- at most 100 indexed files;
- at most 5 MB of indexed content in total;
- at most 1 MB per indexed file;
- strict UTF-8, no binary content and no legacy encodings.

## Recommended directory layout

```text
ai-agent/
  README.md                 # authoring guide, not indexed
  _config/
    synonyms.json           # retrieval synonyms, not indexed
  faq/
    en.md
    ar.md
  guides/
    en.md
    ar.md
  policies/
    en.md
    ar.md
  data/
    glossary.csv
    topics.json
```

Group content by purpose, not by author. Keep one topic per section and split a
large guide into several files rather than one long document.

Recommended filename conventions:

- `<topic>.<locale>.md` or `<topic>-<locale>.md`, for example
  `verification.en.md` and `verification.ar.md`;
- or a locale filename inside a topic folder, for example `faq/en.md` and
  `faq/ar.md`;
- or a locale subfolder, for example `faq/en/verification.md`;
- data files: `topics.json`, `glossary.csv`, or locale variants such as
  `topics.en.json` and `topics.ar.json`.

Locale suffixes and directory names are `en`, `ar`, and `fr`. Use lowercase.

## Markdown and TXT front matter

Front matter is optional. When a block is present, it must start and end with a
line containing only `---`, and it must contain all four keys:

```yaml
---
title: How verification works
locale: en
tags: [verification, certificates, trust]
priority: 1
---
```

| Key | Rule |
|---|---|
| `title` | Non-empty string. Titles must be unique across indexed content after lowercase, trim, and whitespace normalization. |
| `locale` | One of `en`, `ar`, or `fr`. |
| `tags` | Array of short strings. Use an inline array (`[a, b]`) or a block list (`- a`). |
| `priority` | Integer from 1 to 5. `1` is core, `3` is normal, `5` is low. |

Unknown keys are ignored. Duplicate keys are not supported. Keep values free of
inline YAML comments; the checker does not strip them.

If no front matter is present, the title is derived from the first H1 heading
or, when there is no H1, from the filename. The locale is derived from the
filename suffix (`verification.en.md`), a locale filename (`en.md`), or a
locale directory (`en/verification.md`). When front matter is present but a key
is missing or invalid, `ai:check` fails; it does not silently guess.

The checker warns, but does not fail, when a directory has only one side of an
English/Arabic Markdown or TXT pair. French is supported in front matter but is
not part of that pairing warning.

## JSON metadata

JSON files do not use YAML front matter. A top-level object may provide
explicit metadata:

```json
{
  "title": "Platform topics",
  "locale": "en",
  "topics": []
}
```

If those fields are absent, the title comes from the filename stem and the
locale from the filename suffix or a locale directory. A stem such as
`topics.en.json` produces the title `topics` and the locale `en`.

Arrays of objects become records. For bilingual data, put the language on each
record or in explicit field names, for example `title_en`, `title_ar`,
`summary_en`, and `summary_ar`. JSON must be valid UTF-8 and must not nest
objects or arrays deeper than 10 levels. There is no `_meta` requirement.

## CSV metadata

CSV files do not use YAML front matter. The first row is the header. A metadata
title comes from the filename stem; a locale can come from the filename suffix
or a locale directory. For bilingual records, use explicit columns such as
`term_en`, `term_ar`, `title_en`, `title_ar`, `definition_en`, and
`definition_ar`, or a `locale` column.

Quote fields that contain commas, quotes, or line breaks. The current checker
checks formula prefixes per row; keep each record on one physical line so the
parser and checker agree. The checker uses the filename stem as the document
title for duplicate detection.

## Writing for retrieval

Write for small retrieved chunks, not for a printed handbook:

- Use short sections with descriptive H2 headings.
- Put one topic in each section. Do not mix privacy, applications, and
  organization verification in one long paragraph.
- Answer first, then add the conditions or exceptions that matter.
- Prefer explicit names and short sentences over marketing language.
- Do not duplicate live listings, counts, dates, or statistics. Live facts come
  from database tools. The one exception is stable public product copy such as
  the number of wilayas currently covered.
- Do not use large tables or long bullet lists; they chunk poorly.
- Do not copy internal implementation details, API payloads, or database field
  names into public content.

## Bilingual expectations

The platform is bilingual in English and Arabic. Core topics must exist in both
languages, with the same facts and the same conditions. French is supported by
the schema for future content, but do not publish French copy unless a reviewer
has checked it.

- Use a native-speaker review for Arabic before publishing.
- Keep titles and section order parallel where practical.
- Keep Arabic text right-to-left clean; do not mix direction markers or raw
  HTML.
- Do not translate organization names, proper names, or legal wording beyond
  what the public source says.
- When one language changes a policy or a fact, update the counterpart in the
  same change.

## Safety and privacy rules

Everything in the indexed corpus can be sent to a language model provider and
may become public in an answer. Treat it as public.

Do not include:

- secrets, API keys, tokens, passwords, private-key headers, or connection
  strings with credentials;
- environment variable names or values;
- email addresses, phone numbers, exact private addresses, birth dates, account
  data, application data, submission evidence, or internal identifiers;
- another person's personal information without permission;
- invented policies, fees, legal terms, deadlines, statistics, or contact
  details;
- claims that cannot be verified from public message catalogs, public legal or
  privacy copy, public pages, or public documentation;
- raw HTML, `<script>` markup, `javascript:` URLs, or CSV formulas;
- placeholder markers, draft notes, or unfinished text.

If a fact is uncertain, omit it. An incomplete answer is better than an
invented one. Draft notes belong only in this README, never in an indexed file.

## Review and update workflow

1. Edit the English and Arabic counterpart files together.
2. From the repository root, run `npm run ai:check`.
3. Fix every error. Read every warning; locale-pair warnings should be resolved
   or explicitly accepted.
4. Ask a content owner to review facts, tone, and both languages.
5. Commit the content with the code or documentation change that caused it.
6. Deploy. The folder ships with the backend; there is no runtime upload step.
7. In development, restart the backend after content changes so the knowledge
   index is rebuilt once ingestion is implemented.

`npm run build` runs `npm run ai:check` through the `prebuild` hook. A corpus
that fails the checker cannot produce a backend build.

## The `ai:check` checker

Run from the repository root:

```powershell
npm run ai:check
```

The checker resolves the same root as the runtime: an explicit path, then
`AI_AGENT_KNOWLEDGE_DIR`, then `process.cwd()/ai-agent`. It prints the root,
files scanned, indexed files, total indexed bytes, warnings, and errors. It
exits with code `1` when there are errors and `0` when the corpus is clean or
has warnings only.

`files scanned` counts candidate regular files after ignored directories,
hidden files, dotfiles, and `README.md` are excluded. `indexed files` counts
candidate files with an allowed extension. Total bytes are the bytes of those
allowed files.

The checker fails on:

- a missing or non-directory root;
- unsupported extensions;
- more than 100 indexed files, more than 5 MB total, or a file over 1 MB;
- invalid UTF-8;
- symlinks;
- malformed front matter, a missing or empty title, an invalid locale, tags
  that are not an array of strings, or a priority outside 1 to 5;
- duplicate titles after lowercase, trim, and whitespace normalization;
- secret-like values, including Google-style keys, API-key prefixes,
  private-key headers, MongoDB connection strings with credentials, and secret
  or provider environment variable names;
- email addresses and Algerian or international phone-number patterns;
- `TODO`, `TBD`, `FIXME`, `lorem ipsum`, `<script`, and `javascript:`;
- CSV cells that begin with `=`, `+`, `-`, or `@` after trimming;
- JSON nesting deeper than 10 levels;
- invalid JSON.

It warns when a directory has English Markdown/TXT without Arabic, or Arabic
without English. It never prints file contents or matched values: only paths,
issue codes, and short messages.

Checker tests live in `src/scripts/ai-check.spec.ts` and use temporary
directories. Do not put test fixtures in this folder. Do not weaken the checker
to make a content problem disappear; fix the content or change the contract
explicitly.

## Ownership

Content owners are responsible for factual accuracy, bilingual parity, legal
wording, and removing stale copy. Engineering owns the folder contract, the
checker, and the deployment guard. The initial corpus in this folder is a
review baseline, not an approved final manual.
