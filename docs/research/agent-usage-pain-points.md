# Agent usage pain points in rata

Date: 2026-11-09
Status: partial

## Question

How did agents use rata between 2026-10-24 and 2026-11-09, and which failures
cost them the most calls?

## Answer

Agents used rata as the main tracker in five repositories: the founders app,
jyoti, harbagsa, phaephe, and the skills repository. The run covers 3,159 shell
commands that name `rata` across 307 threads. The CLI worked for most reads and
writes. The failures cluster in four places:

1. The natural noun forms are not accepted. Agents type `rata issue <ref>`,
   `rata issue comment <ref> --body-file -`, and `rata issue assign <ref> me`.
   The first two print the group help and fail. The third fails with a hint that
   is reversed in one argument order.
2. A list of issues does not carry its blocking edges. `issue list --parent`
   returns rows without `relations`, so an agent that needs the frontier falls
   back to one `issue show` per child. A graph read was decided for the 0.10
   contract but is not implemented.
3. The JSON shape is learned by trial. Single-issue reads wrap the issue in
   `{"issue": ...}`, list rows do not carry `relations`, comments are a list,
   and priority is a string. Agents guessed the wrong shape in several threads.
4. Two reliability paths turn a small local problem into a failed command. A
   failed cleanup of a legacy `.rata.json` fails the whole command, and a stale
   team key fails `status` instead of reporting the rest of the context.

The natural-form failures are mostly a skill-loading problem. The skill was
absent in every sampled assign and comment failure. The CLI error is the second
cause: the assign hint is reversed, and the group errors print the full help
instead of naming the canonical form. The fix is to keep one form and make the
error teach it.

The highest-value fixes, by observed cost:

| Rank | Pain                                          | Evidence                                                                                                                  | Fix                                                                         |
| ---- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 1    | Direct `issue comment <ref>`                  | Dozens of calls in every repository; the group rejects a ref as an unknown subcommand and prints the full help            | Return a one-line hint for the canonical `create` form; do not add an alias |
| 2    | Positional `issue assign`                     | 6 non-zero rows, 5 repositories; one hint is reversed (`assign me --assignee HARB-322`)                                   | Fix the hint and keep `--assignee` as the only form                         |
| 3    | `issue list` has no edges                     | 2 failures reading `relations`; many per-child `issue show` loops in mission work                                         | Implement `issue list --include relations` from the graph-read decision     |
| 4    | Wrapped JSON shape                            | 7 observed failures in 6 threads; `identifier`, `description`, `state`, `labels`, and `team.states` read at the top level | Flatten single-resource reads, or add a shape section to the skill          |
| 5    | Bare `issue <ref>`                            | 3 threads; the command prints the full group help                                                                         | Return a one-line hint for `show`; do not add an alias                      |
| 6    | Dotted `--fields` through null                | 2 observed; `assignee.name` and `parent.identifier` fail when the object is null                                          | Return `null` for the path instead of a validation error                    |
| 7    | `createdAt` is missing                        | 3 validation errors; the list query already fetches it                                                                    | Add it to the summary and detail models                                     |
| 8    | Legacy `.rata.json` cleanup is fatal          | 3 commands in one thread; a failed unlink returns `internal` and blocks `status`, `search`, and `list`                    | Make cleanup best effort and treat a missing file as success                |
| 9    | Stale team key fails `status`                 | 7 commands in 4 threads (`JYO`, `PHA`, `RAT`)                                                                             | Report `team: null` and a warning, and keep the rest of the context         |
| 10   | `issue delete` and `issue restore` are absent | 1 attempt in the skills repository; the command prints help                                                               | Defer to the 0.10 trash surface, already decided                            |

Out of scope for a daily-loop fix: bulk import, export, and apply; the graph
command; `--ids-only`; the cache and audit log; PR awareness; and the trash
surface. The 0.10 map already settles them.

## Evidence

- **Command volume**: 3,159 command rows name `rata`; 307 threads; range
  2026-10-24T06:23Z to 2026-11-09T18:27Z. Source: the local T3 state database
  `~/.t3/userdata/statev2.sqlite`, table `orchestration_v2_projection_turn_items`,
  query saved at `/tmp/opencode/rata-usage/analyze.ts`. The database is local and
  not committed.
- **Failure classes**: 52 rows exited non-zero. 22 are JSON shape or parser
  errors, 6 are assign-order errors, 2 are comment-group errors, 1 is bare
  `issue` help, 2 are team-config errors, 1 is the repository-config migration,
  and 18 are agent or dev-environment errors. The count is a lower bound:
  agents often pipe to `head`, so the pipeline exit hides a rata failure.
- **Skill loading**: the `rata` skill is installed at `~/.agents/skills/rata`
  and loads on request. None of the 6 threads with an assign-order failure
  loaded it before the failure; 3 of those 6 had read
  `docs/agents/issue-tracker.md`, which names the canonical form. None of the 2
  sampled comment-group failures loaded the skill; 1 had read the tracker doc.
  The skill was absent in every sampled natural-form failure, and the tracker
  doc was present in some. The failures are mostly a skill-loading problem,
  with a poor CLI error as the second cause.
- **Direct comment form**: the form appears in the founders app, jyoti,
  harbagsa, phaephe, and the skills repository. The group parser in
  `src/cli/issue/comment.ts:234` has no default action. A ref becomes an unknown
  subcommand.
- **Assign order**: `src/cli/issue-transition.ts:171` reads two positionals. The
  hint at line 177 builds `assign ${legacyAssignee} --assignee ${ref}`, which is
  reversed when the ref is first. The canonical form is in the help examples at
  line 246.
- **List edges**: `src/api/issue-query.ts:17` has no relation connection. The
  graph-read decision requires `issue list --include relations` with the same
  `relations` object as `issue show`, one request, and a rejection of other
  include paths. Source: the decision comment on the graph-aware read.
- **JSON shape**: `src/cli/issue/show.ts:105` wraps the detail in `{issue}`.
  The list writer at `src/cli/issue-page.ts:37` wraps rows in `{issues}`.
  Comments are a list in `src/api/issue-schema.ts`. `priority` is a string in
  `src/api/issue-model.ts:123`.
- **Null field paths**: `src/cli/fields.ts:69` treats a null intermediate as an
  unknown path. `rata issue list --parent RATA-83 --json --fields identifier,assignee.name`
  fails on an unassigned child.
  `rata issue show RATA-83 --json --fields identifier,parent.identifier` fails
  on a root issue.
- **`createdAt`**: the summary query selects it at `src/api/issue-query.ts:10`,
  but `toSummary` at `src/api/issue-model.ts:117` drops it. The validation hint
  lists the valid paths and omits it.
- **Legacy config**: `src/config/repo.ts:219` removes `.rata.json` after the
  database upsert and maps a failure to `RepoConfigError`. A concurrent remover
  or an unlink failure therefore fails the command. The observed error is
  `Could not remove .../.rata.json.` in three consecutive commands.
- **Stale team**: `src/cli/status.ts:66` resolves the stored team through
  `TeamService.byKey` and fails when the key is gone. `RepoTeam.resolve` has the
  same dependency for every list command.
- **Operator cost**: the harbagsa migration used 304 creates, 194 comments, 80
  links, and 578 subprocesses in 25 minutes. Source: the 0.10 map notes. That is
  the bulk path, not the daily loop.

## Conflicts

- **One name per operation versus the natural noun forms.** The command-surface
  decision fixes the verb surface and says `issue view` is the only alias. The
  usage evidence shows the direct `issue` and `issue comment` forms are the
  first ones agents try. The skill-loading check shows the skill was absent in
  every sampled natural-form failure, so the canonical form was not known. The
  fix is to keep one form and make the error teach it, not to add a second
  spelling.
- **The JSON envelope.** The output contract keeps the envelope. The usage
  evidence shows agents guess the flat shape. Backwards compatibility is not a
  constraint. The consistent choice is one rule for reads: a single resource is
  the object, and a collection is `{ items, pageInfo }`. That flattens
  `issue show`, `issue status`, `next`, `team show`, and `section get`, and
  keeps the list commands wrapped. The alternative is to keep every read
  wrapped and document the shape.
- **`issue list --include relations` is decided and unimplemented.** The
  graph-read decision already names the flag, the shape, the one-request cost,
  and the error for other paths. This is not a new design.

## Not found

- The exact cause of the `.rata.json` removal failure. The code path suggests a
  concurrent remove or an unlink failure; the error hides the platform cause
  behind `RATA_DEBUG=1`. The safe fix is to make cleanup best effort, not to
  depend on the cause.
- Whether every direct `issue comment` command failed. Many commands pipe to
  `head`, so the pipeline exit is 0 and the error is only visible in the output.
  The form itself is rejected by the group parser in the source, so the failure
  is certain when it reaches rata.
- Whether the `JYO` team key was stale in the database or only in a repository
  config at the time. The database now holds `JYOT`; the failure was observed
  before the repair. The `RAT` key in the package repository is still stale.

## References

- `src/cli/issue-transition.ts`: assign argument handling and hint.
- `src/cli/issue/comment.ts`: comment group and create command.
- `src/cli/issue.ts`: issue group and subcommands.
- `src/cli/issue/show.ts`: show command and JSON envelope.
- `src/cli/issue-page.ts`: list writer.
- `src/cli/fields.ts`: dotted path selection.
- `src/api/issue-query.ts`: list and show queries.
- `src/api/issue-model.ts`: summary and detail models.
- `src/config/repo.ts`: legacy config import.
- `src/cli/status.ts`: status document and team lookup.
- `docs/agents/issue-tracker.md`: tracker conventions and the implement-spec
  fetch.
- `skills/rata/SKILL.md` and `skills/rata/reference.md`: agent-facing CLI docs.
- The 0.10 map and the command-surface, graph-read, and trash decisions in
  Linear. The decision comments name the flags and shapes used above.
