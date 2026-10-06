# ADR-0004: Project delete moves the project to the trash

## Status

Accepted.

## Context

The Linear API has no permanent project delete. `projectDelete` moves a project
to the trash, and `projectUnarchive` restores it. The older `projectArchive`
mutation is deprecated in favor of `projectDelete`.

Linear calls the operation "Delete" in its interface and its documentation. A
deleted project waits under "Recently deleted projects" in the team archive,
and the user restores it from there. `rata team delete` already uses the same
word for an operation that Linear keeps recoverable.

The alternatives were `archive` with `unarchive` (Linear's deprecated
vocabulary) and `delete` with `unarchive` (the literal mutation names). They
either avoid the word the user sees in Linear or invent a word for an action
that Linear calls restore.

## Decision

`rata project delete` moves the project to the trash. `rata project restore`
brings a trashed project back. The names match Linear's user-facing language
and the existing `team delete` command. The help text and the README state that
Linear keeps the project recoverable.

## Consequences

- `project delete` does not destroy a project. `project restore` brings it back
  until Linear removes it permanently, 30 days after the delete.
- The trash is out of the default `project list`. `project list
--include-archived` shows trashed projects.
- A delete of an already trashed project fails with a message that points at
  `project restore`. A restore of a live project fails with a message that
  points at `project delete`.
