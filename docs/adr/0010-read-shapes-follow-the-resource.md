# ADR-0010: Read shapes follow the resource

## Status

Accepted.

## Context

The read commands wrap the primary object in a named key: `{ "issue": ... }` for
`issue show`, `{ "team": ... }` for `team show`, and `{ "section": ... }` for
`issue section get`. `issue status`, `next` and `why` nest the same data. A
caller must know the wrapper before it can parse the object.

The wrapper also shapes `--fields`. A path starts at the wrapper key, so
`issue status --fields issue.identifier` selects the identifier while
`issue show --fields identifier` is an unknown path.

Some reads are not one resource. A list is a collection with page state. The
top-level `status` document, `config show` and `auth status` are context
documents with named sections. A write reports the result of the write, not the
resource it changed.

Backwards compatibility is not a constraint. There are no older callers to keep.

## Decision

The read shape follows the resource.

- A resource with an identifier is the object at the top level. This covers
  `issue show` (summary and detail), `issue status`, `next`, `why`,
  `team show` and `issue section get`.
- A collection is `{ <plural>, pageInfo }`. This covers `issue list`, `search`,
  `team list`, `project list` and `label list`.
- A multi-section context document keeps its named sections. This covers
  `status`, `config show` and `auth status`.
- A write keeps its result object, such as `{ "issue": ... }`,
  `{ "status", "comment", "visible" }` or `{ "results": [...] }`.

`--fields` starts at the resource for a read and at each item for a list. Write
commands reject the flag. A list result keeps `pageInfo`. A path through a null
object returns `null` for that path and does not fail. An array is selectable as
a whole; a path into an array is a `validation` error whose hint names the array.
An unknown path is a `validation` error whose hint lists the valid paths.

`issue status` carries the summary fields plus `blocked`, `blockedBy`, `prs` and
`nextChild`. `why` carries the summary fields plus `blocked` and `blockedBy`.
`next` returns the summary or `null`. The summary carries `createdAt` and
`updatedAt`.

## Consequences

- A caller parses a single resource at the top level, with no wrapper to guess.
- `--fields` paths are short and match the printed object.
- `pageInfo` stays for a collection; a single resource has none.
- A context document is the exception, and its named sections are part of its
  contract.
- A path into an array needs a whole-array selection followed by a local filter.
- The change is not compatible with the wrapped reads. There is no dual shape.
