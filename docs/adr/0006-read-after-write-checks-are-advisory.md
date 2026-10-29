# ADR-0006: Read-after-write checks are advisory

## Status

Accepted.

## Context

Linear documents no read-after-write guarantee. A comment or a child issue that
a mutation just created can be missing from the next read. RAT-66 requires
`issue comment` and `issue create --parent` to report whether the new object is
visible. The contract has one field, `visible`, with three values: `true` when
the object appears, `false` when the bound expires, and `null` when the check is
disabled or does not apply.

The check is a second read after a successful write. That read has its own
failure modes: a revoked key, a network fault, a rate limit or a malformed
response. The contract has no place to report a failed check, and a failed
check must not turn the successful write into a command failure.

## Decision

The visibility check is advisory. A failed check read is treated like an object
that has not appeared yet: retry until the bound, then report `visible: false`
and exit 0. The mutation payload stays the source of truth. The human warning
says the object is not visible yet; JSON carries `visible: false`.

Each poll reads the newest 50 comments or children of the issue with a single
`last` query. A just-created object is the newest, so the check does not have to
drain every page.

## Consequences

- A genuine read failure looks like a timeout. The command still exits 0 and
  does not claim that the write failed.
- The check never blocks on a large comment thread: one request per poll, not a
  full page drain.
- The check can produce a false negative, for example when the object sorts
  before the newest 50. A false negative exits 0 with `visible: false`; it never
  turns a successful write into a failure.
