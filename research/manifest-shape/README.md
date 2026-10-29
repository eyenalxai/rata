# The rata manifest, prototype 1

A candidate canonical manifest for one team. The data is real: 32 issues of the
RATA team, read from the API on 2026-10-29. The slice is the two open families
under RATA-83 and RATA-109, and it is closed under `parent` and `blocks`: every
key it references is in the file.

- `manifest.yaml` — the candidate, one YAML document.
- 32 issues, 13 comments, 46 `blocks` edges, 14 labels (11 team, 3 workspace),
  7 states, 1 member.

This is a prototype. No rata command reads or writes the file yet.

## Container: one YAML document per team

| Form                                             | 32 issues, 13 comments, 46 links | 300 issues, 200 comments, 80 links |
| ------------------------------------------------ | -------------------------------: | ---------------------------------: |
| One YAML document                                |            131,347 B (128.3 KiB) |             1,476,242 B (1.41 MiB) |
| One JSON document, 2-space indent                |            127,930 B (124.9 KiB) |             1,411,904 B (1.35 MiB) |
| One JSON document, compact                       |            121,947 B (119.1 KiB) |             1,359,114 B (1.30 MiB) |
| Directory, one file per issue plus one team file |            127,285 B (124.3 KiB) |             1,431,306 B (1.37 MiB) |
| YAML, gzip -9                                    |              37,619 B (36.7 KiB) |              421,686 B (411.8 KiB) |

One YAML document wins on review, not on bytes.

- YAML block scalars keep Markdown readable. JSON escapes every newline, so a
  2 KB description becomes one long line and a diff of one paragraph is a diff
  of the whole line.
- One file gives one atomic import and one reviewable diff. The directory form
  saves 3% of the bytes and costs 301 reads, 301 files in a diff, and no single
  view.
- YAML 1.2 parses JSON. One loader reads both, so a machine emission can be JSON
  without a second parser.
- The target shape weighs 1.41 MiB raw and 412 KiB gzipped. That is acceptable
  for a git object and a review.

## Top level

| Field       | Meaning                                                                                                                       |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `version`   | Format version. `1`.                                                                                                          |
| `workspace` | Workspace url key, `utbetdix`. Selects the profile.                                                                           |
| `team`      | `{ key, id }`. `key` resolves the team; `id` detects drift.                                                                   |
| `labels`    | The label vocabulary: `name`, `scope` (`team` or `workspace`), `color`. The scope lives here, never on an entry (RATA-99 D9). |
| `states`    | `{ name, type }` in Linear position order. Resolution is by name.                                                             |
| `members`   | `{ email, id, name }`. The directory for `assignee` and `author`.                                                             |
| `issues`    | The entries, in `createdAt` order.                                                                                            |

The label list is the full team ∪ workspace vocabulary (14), not only the 7
labels this slice references. The file is a team snapshot, and the list is the
resolution table plus the create-on-miss allowlist that RATA-101 owns. A narrow
export would write only the referenced labels; RATA-101 decides.

The workspace labels (`Bug`, `Feature`, `Improvement`) prove that `scope` is a
real field and not a constant. A non-admin key cannot create a workspace label
(RATA-99 D6), so RATA-101 must treat an existing workspace label as a hit, and a
missing one needs an admin key or a clean error.

## Issue entry

| Field         | Contract                                                                                           |
| ------------- | -------------------------------------------------------------------------------------------------- |
| `key`         | Creation identity. Required. Never changes (RATA-96).                                              |
| `id`          | Linear UUID of an existing issue. Export writes it; `apply` prefers it; `import` does not need it. |
| `title`       | String.                                                                                            |
| `description` | Markdown with no trailing newline. `null` is empty.                                                |
| `state`       | State name.                                                                                        |
| `priority`    | `none`, `low`, `medium`, `high` or `urgent`.                                                       |
| `labels`      | Plain names. A name never carries a scope.                                                         |
| `assignee`    | Member email or user UUID. `null` is unassigned.                                                   |
| `parent`      | Issue key. `null` is top level.                                                                    |
| `project`     | Project name. `null` is no project. This workspace has none.                                       |
| `author`      | Email or user id. Advisory on an issue, because Linear cannot set `creator`.                       |
| `createdAt`   | RFC 3339 UTC. Create only.                                                                         |
| `comments`    | Comment entries in `createdAt` order. `[]` when none.                                              |
| `blocks`      | Keys this issue blocks. Written once. `[]` when none.                                              |

## Comment entry

| Field       | Contract                                                                    |
| ----------- | --------------------------------------------------------------------------- |
| `key`       | Dedupe identity, scoped to the issue (ADR-0007). A body edit keeps the key. |
| `id`        | Existing Linear comment UUID. Export writes it; `apply` can address it.     |
| `author`    | Email or user id.                                                           |
| `createdAt` | RFC 3339 UTC.                                                               |
| `body`      | Markdown with no trailing newline.                                          |

The array is the comment order. `createdAt` gives the same order in this file.
An import writes the array order and passes `createdAt`; a retry with the same
key is `skipped`.

## Relations are written once

`blocks` sits on the blocker. The target does not repeat the edge as
`blockedBy`; an import derives the inverse. `blocks: [RATA-101]` on RATA-100
means RATA-100 blocks RATA-101. A file that carries both directions is invalid.

`related` and `duplicate` follow the same rule, but this prototype does not
carry them. The 32-slice has 13 `related` edges, and 3 of them point outside the
slice. RATA-101 decides whether the canonical file carries every relation type.

## Resolution

- **Team**: `team.key`, checked against `team.id`.
- **Labels**: `name` resolves against team ∪ workspace, case-insensitively. One
  name matches one label (RATA-99 D1). `scope` is used to create a miss and to
  report the match, never to address a label.
- **States**: `name` resolves against the team's states, case-insensitively. A
  missing state is an error, not a create. `type` is checked for drift.
- **Assignees**: an email resolves through the workspace member directory. A
  36-character UUID is used as-is.
- **Authors**: the same rule. The display name for a provenance prefix comes
  from `members`.

## Provenance

`author` and `createdAt` are the provenance. Linear accepts `createdAt` on
create only (`IssueCreateInput.createdAt` and `CommentCreateInput.createdAt`). A
later edit cannot change it.

Linear does not accept `author` as written:

- **Issue**: `creator` is read-only. rata writes nothing and reports provenance
  `unavailable` when `author` is not the importing viewer. The manifest keeps the
  value for the record.
- **Comment**: `createAsUser` needs an OAuth `actor=app` app (RATA-93). With an
  API key, rata writes the author as a bold line, then a blank line, then the
  body:

  ```markdown
  **Ada Lovelace** · 2019-04-03
  ```

  The date is the UTC date of `createdAt`. rata reports provenance `prefixed`.
  The prefix keeps the author and the date. It does not keep the avatar or a real
  comment author. On export, rata must split its own prefix
  back into `author` and `body`, or a round trip doubles it (RATA-101).

- **Viewer or absent author**: rata writes nothing and reports provenance
  `native`.

This slice's only author is the viewer, so the file has no prefix. The fallback
is a write rule, not a field.

## Order and normalization

- Issues are in `createdAt` order. Order is not a dependency: keys and the
  derived ids wire the graph, so a child may appear before its parent.
- Comments are in `createdAt` order.
- Bodies have no trailing newline. A writer adds one when the target needs it.
- UTF-8, LF, two-space indent.

## Weight at the target shape

The 300-issue, 200-comment, 80-link file repeats this team's content mix: the
slice's average description (2,144 B) and average comment (2,747 B). Long
decision comments make it heavier than a migration of short notes.

| Component                                            | Bytes |
| ---------------------------------------------------- | ----: |
| Header: 14 labels, 7 states, 1 member                | 1,357 |
| Per issue: title, description, metadata, indentation | 2,718 |
| Per comment: body, four fields, indentation          | 3,293 |
| Per link inside a grouped `blocks` list              |  10.5 |

The measured file is 1,476,242 B (1.41 MiB), 421,686 B gzipped (411.8 KiB).
The marginal costs above are rounded.

## What this does not cover

- `related` and `duplicate` edges.
- Attachments. RATA-110 carries two PR links; the manifest drops them. RATA-105
  owns PR awareness.
- A non-null `project`. This workspace has no project; the field is a name.
- Reading issue `createdAt` and `creator`. `rata issue show` omits both, and
  `issue list` drops `createdAt` from its JSON even though its query fetches it.
  An export needs both. That is a 0.10.0 read change.
- Creating a missing state or label, and whether import creates anything.
  RATA-101.
- Updating an existing issue or comment. RATA-102 (`apply`).
- A stable comment key for an exported comment. This file uses a slug per
  comment. Export needs a rule. The comment id is stable but ADR-0007 derives a
  different id from the key.
- Two agents editing one file. A directory of files would isolate a conflict to
  one issue, at the cost above.

## Check

```bash
python3 -c 'import yaml; yaml.safe_load(open("research/manifest-shape/manifest.yaml"))'
```
