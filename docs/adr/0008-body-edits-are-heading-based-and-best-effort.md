# ADR-0008: Body edits are heading-based and best effort

## Status

Accepted.

## Context

A mission body is a living document. Its sections are headings: `Route`,
`Gates`, `Session plan`, `Handoff log`, `Next step`. Every mission step updates
one section. A whole-body replace forces a fetch-edit-rewrite cycle that is slow,
easy to clobber, and impossible to review as a diff.

Linear has no section API. A description is one markdown string. The alternatives
were a general markdown parser as a dependency, a regular expression per
heading, or a small local parser for the heading form that Linear renders.

Setext headings (`===` and `---`) are valid markdown, but no skill writes them
and no mission body uses them. HTML headings are not markdown. Fenced code blocks
do contain `#` lines, and a parser that ignores fences would split a section in
the wrong place.

Linear has no compare-and-swap. A read-then-write can lose a concurrent edit
between the two calls, and no client-side check closes that window.

## Decision

A section is an ATX heading (`#` to `######`), followed by a space or a tab, and
the heading text. A closing sequence of `#` marks is removed. The text is
trimmed. Match is exact and case-sensitive.

A section ends at the next heading whose level is less than or equal to its own.
Deeper headings stay inside the content. Lines inside a fence opened with three
or more backticks or tildes are not headings; the parser tracks the opening
marker and closes on a fence of the same marker with at least the same length.

The parser is local and supports ATX only. Setext headings are not sections.

- A duplicate heading is an `ambiguous` error that lists the line numbers.
- A missing heading is `not_found` on `get` and `replace`, and lists the
  available headings.
- `append` creates a missing heading at the end of the body. `--level` sets its
  level; the default is 2.
- `--if-unchanged <updatedAt>` compares the read snapshot before the write and
  fails with `conflict` on a mismatch. The check is best effort.

`append` and `replace` write the whole body back, so the rest of the body is
preserved byte for byte. The body is normalized to `\n` line endings.

## Consequences

- A mission update is one command and one unified diff.
- Setext and HTML headings are invisible to the parser. A body that uses them
  cannot be edited by section.
- A duplicate heading is refused instead of guessed. The author renames one
  heading, or rewrites the section with `issue update --body-file -`.
- A concurrent write between the read and the write can be lost. `--if-unchanged`
  makes the common case safe; it is not a lock.
- `append` is safe to retry only in the sense that it adds again. A retried
  append duplicates its content. A caller that needs one write uses
  `--if-unchanged`.
