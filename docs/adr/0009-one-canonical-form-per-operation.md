# ADR-0009: One canonical form per operation

## Status

Accepted.

## Context

The groups `issue` and `issue comment` have subcommands. A caller that knows the
noun but not the subcommand types `rata issue <ref>` or
`rata issue comment <ref>`. Without a canonical form, the group parser reports an
unknown subcommand and prints the full group help. The caller learns the form
from a page of help, not from the failure.

An assignment needs the assignee. A positional value and a flag give two
spellings for the same write. Two spellings double the surface to document, test
and keep in step, and a hint that reconstructs the form must pick one order.

An alias is easy to add and hard to remove. The failure is the one moment when
the caller is certain to read the correction, so the failure is the right place
to teach the form. The alternative to one canonical form was to accept both
spellings or aliases.

## Decision

Each operation has one canonical form. A different spelling fails with a
`validation` error and one hint that names the canonical form. The command reads
and writes no data.

- Read one issue: `rata issue show <ref>`. `view` is the only alias.
- Comment on an issue: `rata issue comment create <ref>`.
- Assign an issue: `rata issue assign <ref> --assignee <me|none|id>`.
- Assign every child: `rata issue assign --parent <ref> --assignee <me|none|id>`.

There is no bare `issue <ref>` execution, no direct `issue comment <ref>` form,
and no positional assignee. The hint is one line, for example
`rata issue show RAT-42`, and it does not print the group help.

## Consequences

- A missed skill load costs one error and one hint, not a help dump.
- The canonical form appears in the skill, the reference, the tracker document
  and the README, and all four agree.
- A rejected form never reads or writes an issue.
- The hint text is part of the command contract and gets a test.
- A second spelling for an operation is not added later. A rename changes the
  one form and its hint.
