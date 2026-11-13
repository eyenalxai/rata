# ADR-0010: Read shapes follow the resource

## Status

Accepted. Amended by RATA-133 to record the array contract and the corrected read
rule.

## Context

The read commands used to wrap the primary object in a named key:
`{ "issue": ... }` for `issue show`, `{ "team": ... }` for `team show`, and
`{ "section": ... }` for `issue section get`. `issue status`, `next` and `why`
nested the same data. A caller had to know the wrapper before it could parse the
object.

The wrapper also shaped `--fields`. A path started at the wrapper key, so
`issue status --fields issue.identifier` selected the identifier while
`issue show --fields identifier` was an unknown path.

Some reads are not one resource. A list is a collection with page state. The
top-level `status` document, `config show` and `auth status` are context
documents with named sections. A write reports the result of the write, not the
resource it changed.

Backwards compatibility is not a constraint. There are no older callers to keep.
The alternative to the flat reads was to keep the wrappers and document them.

## Decision

The read shape follows the resource.

- A resource is the object at the top level, whether it carries an identifier
  or is addressed by its heading. This covers `issue show` (summary and detail),
  `issue status`, `next`, `why`, `team show` and the section of
  `issue section get`.
- A collection is `{ <plural>, pageInfo }`. This covers `issue list`, `search`,
  `team list`, `project list` and `label list`.
- A context document keeps its named sections. This covers `status`,
  `config show` and `auth status`.
- A write keeps its result object, such as `{ "issue": ... }`,
  `{ "status", "comment", "visible" }` or `{ "results": [...] }`.

`--fields` starts at the resource for a read and at each item for a list. For
`config show` it starts at the `defaults` object, and for `status` it starts at
the whole document. Write commands reject the flag. A list result keeps
`pageInfo`.

Each read command declares its shape. The selector validates a path against the
declared shape before it walks the value, so a wrong path fails on an empty list
and a null object cannot hide a typo. A path through a null object returns
`null` for that path and does not fail. The shape still validates the rest of
the path.

A path may cross an array. These rules apply:

- A final array segment returns the array whole.
- A segment after an array maps each element.
- A scalar leaf returns an array of scalars.
- An object leaf returns an array of objects.
- A path through an array of scalars is a `validation` error.
- An empty array is validated and returns `[]`.

`pageInfo` stays outside the selection. An unknown path is a `validation` error
whose hint lists the valid keys at the failing level. A field-path error carries
`details` with `path` and `validPaths`.

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
- A path into an array projects each element, and a scalar leaf gives an array
  of scalars.
- The change is not compatible with the wrapped reads. There is no dual shape.
