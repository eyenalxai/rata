# ADR-0011: The team context is cached in SQLite for seven days

## Status

Accepted.

## Context

An agent needs the team states, labels, members and priorities before it can
write an issue. `rata status` and `rata team show` read that detail from Linear.
The detail changes rarely, but every read costs five requests. An agent that
starts one ticket paid for the same detail again.

The team key can change. The API key can change. A profile can point at another
workspace. The cache must not serve one workspace's detail to another.

An issue cache is out of scope. It would hide writes and needs a sync.

## Decision

Rata stores the team detail in the local SQLite database. The detail holds the
states, labels, members and priorities. It also holds the viewer. The team rows
live in `context_cache`; the viewer rows live in `viewer_cache`. The cache key
is the profile, the team UUID and a SHA-256 hash of the API key. Rata never
stores the key in the cache row.

A cache row stays fresh for seven days. `rata status` reads the cache first. A
warm read makes no Linear request. `rata status --refresh` reads Linear and
replaces the row. A changed key misses the cache because the hash changed. A
different team misses because the team UUID changed.

`rata link` stores the team UUID with the team key. A stored team resolves by
UUID, key, then name. A stale UUID or key that resolves is repaired with a
warning. The fallback runs on a cache miss, after expiry, or on
`rata status --refresh`. A warm cache can serve the stored stale UUID for up to
seven days; `--refresh` forces the revalidation.

An unknown state or label resolves against the cached detail. If the name is
missing, the context refreshes once, then fails with `not_found` and the valid
names. The refresh covers a state or label that Linear added after the last
read.

## Consequences

- The common `status` path costs no requests after one read.
- The cache age is visible, so an agent can ask for a refresh.
- A key change cannot serve stale data under another key.
- A corrupt cache row is a miss, and the next read replaces it.
- The database holds one more table pair. The rows expire by age; rata does not
  run a background cleanup.
- The first state or label resolution after a cache miss fetches the full team
  detail. Later calls use the cache.
- The cache is not an issue cache. Issue reads still go to Linear.
