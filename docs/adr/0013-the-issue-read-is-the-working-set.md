# ADR-0013: The issue read is the working set

## Status

Accepted. This record replaces the read forms of ADR-0009 and the issue-read
shapes of ADR-0010. The write forms are unchanged until the apply engine lands.

## Context

The 0.10.0 surface split one session start across `issue show`, `issue status`,
`next` and `why`. A caller paid several calls and joined the parts itself.
`issue show` alone was 30.5% of calls and 40.9% of output in the measured window.
The split also gave one object several read shapes and several output flags.

An agent starting a ticket needs the body, the parsed sections, the blockers,
the pull requests, the children, the frontier and the next child. A known set
needs the same data for several refs without one detail read per ref. A search
needs a compact pointer, not a flood of descriptions.

## Decision

`issue <ref>...` is the only issue read.

- One ref prints the working set at the top level. Many refs print
  `{ items, pageInfo }` and use one list request per page, not one detail read
  per ref.
- The working set carries the summary fields, `description`, parsed `sections`,
  `blocked`, `blockedBy`, `prs`, lean `children` with `blocked` and `blockedBy`,
  `frontier`, `nextChild` and `comments: null`.
- `--comments` fills the comments. The default keeps `comments: null`.
- `--summary` returns the summary fields only: identity, labels, URL and
  timestamps. `--full` adds the six relation groups and full child rows.
- `--select` validates the shape of the active mode and may cross arrays.
- `issue search` returns ten summary rows by default. `--limit` changes the page
  size, `--after` continues and `--all` drains. It returns no descriptions.
- A page holds up to 250 refs in summary mode, 5 in working mode and 3 in full
  mode. The query nests its connections, and Linear caps one query at 10,000
  complexity points. Children are capped at 50, relations at 25 per direction,
  attachments at 25, comments at 10 and child blockers at 5.
- `issue show`, `issue view`, `issue status`, `next`, `why`, `--json`, `--fields`,
  `--count`, `--ids-only` and `--include` exit 2 with a `usage` error.

## Consequences

- A session start is one call and one read shape.
- A known set costs one CLI call and one list request per page.
- The read shape is larger than one summary. A caller that only needs the summary
  fields passes `--summary`; a caller that needs every relation passes `--full`.
- The old read commands and flags are gone. They do not become aliases.
- The CLI tests use the in-memory gateway and assert behavior, not GraphQL
  strings.
