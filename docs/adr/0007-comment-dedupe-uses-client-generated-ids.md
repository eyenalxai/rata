# ADR-0007: Comment dedupe uses client-generated ids

## Status

Accepted.

## Context

A mission posts the same handoff comment more than once. A retried command, a
resumed session or a crashed script repeats the write, and Linear's
`commentCreate` creates a second comment each time. The mission loop needs a
retry-safe comment.

Linear has no idempotency key. The obvious alternative is read-then-create: read
the comments of the issue, match on the body, and skip a match. That fails in
two ways. Two agents can post the same text on purpose, and the match then
suppresses a real comment. Between the read and the create there is no
transaction, so two retries can both miss and both create.

`commentCreate` accepts an optional `id`. Linear accepts that id only as a
UUIDv4: it rejects any other shape. A fixed id per issue and key turns the
create into a write with a known identity, and the identity is the thing to
check before the write.

## Decision

`issue comment create --dedupe-key <key>` derives the comment id from the issue
and the key: a UUIDv4 shaped from `sha256(issueId + "\0" + key)`, with the
version and variant nibbles set as RFC 4122 requires. The command then reads
`comments(filter: { id: { eq: uuid } })`. A hit returns the existing comment
with `status: "skipped"`. A miss creates the comment with that id.

A create that still fails re-reads the id. A hit returns the existing comment.
A miss returns the original failure. Two retries that race therefore converge on
one comment instead of two.

Without `--dedupe-key`, every call creates a new comment with a server-assigned
id. The dedupe check also runs in a dry run, so a dry run can report `skipped`.

## Consequences

- The key is scoped to the issue. The same key on another issue derives another
  id and creates another comment.
- The id is deterministic, so the comment is findable by the same key from any
  machine. The key, not the body, is the identity.
- A client-generated id must be a UUIDv4. The version and variant nibbles
  replace two digest nibbles, which costs 8 bits of the 128.
- A retry after the first create succeeds returns `skipped` and does not post
  again. A new comment for the same ticket needs a new key.
- The check is one extra read per create with a key. Without a key, nothing
  changes.
