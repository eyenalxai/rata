# ADR-0014: Cache writes are advisory

## Status

Accepted.

## Context

The team detail cache is an optimization. `rata status` and the issue commands
read it before they call Linear. A write or an invalidation can fail when the
database is locked or full. The Linear read or the link has already succeeded at
that point.

A failed write leaves the previous row. A failed invalidation leaves the row
that a link wanted to remove. That row can hold an old team key. The cache key
still includes the profile, the team UUID and the key hash, so the stale row
only affects the team whose key changed.

## Decision

Cache writes and cache invalidations are advisory. A failure prints a warning
and does not fail a successful Linear read, `rata admin link`, or any other
command. The mutation or the Linear payload stays authoritative.

A failed write warns that the command continues without the cache. A failed
invalidation warns that the cache may still serve the old key until the next
successful read or refresh, or until the seven-day TTL expires. The next
successful read replaces the stale row.

A warm cache repair writes only the team UUID. It never writes a cached key over
the linked key. A link invalidates the cache rows for the profile that the next
read uses and for the link target.

## Consequences

- A stale key can be served for up to seven days if an invalidation fails. The
  warning names the condition; `rata status --refresh` repairs it at once.
- A failed cache write cannot turn a successful command into a failure.
- The cache can be empty and every command still works. The only cost is an
  extra Linear read.
- Warnings are per operation: a failed write and a failed invalidation say
  different things because they leave different state behind.
