# Issue tracker: Linear

Load the `rata` skill before the first tracker command. The skill covers the
first command, the canonical forms, the read loop, the write loop and the
errors. This file covers this repository's facts.

- **Team**: the repository link stores the team UUID and the default project;
  `rata status` prints them with the workflow states, labels, triage map,
  cache age and document health. A warm `status` makes no Linear request;
  `--refresh` reads Linear again. A cache miss or `--refresh` repairs a renamed
  team UUID or key and warns; if the team is gone, the error or `status` names
  the repair. Do not pass `--team` for work in this repository, which does not
  use Linear projects: a spec is an issue.
- **Labels**: the triage roles map to label strings in
  `docs/agents/triage-labels.md`. Read that file before you apply a label; the
  role name is not always the label string.
- **Priority**: every issue that leaves triage for `ready-for-agent` or
  `ready-for-human` carries a priority. Issues in `needs-triage`, `needs-info`
  and `wontfix` may have `none`. Values: `urgent` (breaks production or blocks a
  release), `high` (blocks other work), `medium` (the fallback), `low`
  (nice-to-have).
- **Assignee**: every issue is assigned to the authenticated user with
  `--assignee me`. Wayfinder maps and their children stay unassigned until the
  claim step.
- **Bulk repair**: `--parent` writes are for a spec's tickets. Do not bulk-label
  a map: its children are claimed one by one as the frontier moves.

## Specs and tickets

A spec is an issue. Do not prefix its title and do not wrap it in a project. Its
tickets are child issues.

- **Publish the spec**: `rata issue create --title "<title>" --label ready-for-agent --priority medium --assignee me --body-file -`
- **Publish a ticket**: `rata issue create --title "<title>" --parent <spec-ref> --label ready-for-agent --priority medium --assignee me --body-file -`
- **Wire blocking**: `rata issue relate <ticket-ref> --blocked-by <blocker-ref>`.
- **Read a ticket**: `rata issue <ticket-ref>`. The read carries the description, sections, blockers, pull requests, children, frontier and next child in one call.
- **Start a ticket**: `rata issue start <ticket-ref>`. It claims an unassigned issue and moves it to the first started state. Add `--take` only when another user holds it.
- **Read a known set**: `rata issue <ref> <ref> ...`.
- **Implement**: `rata issue list --parent <spec-ref> --relations --all`. Each row carries its blocking edges.
- **Close the spec**: `printf '%s' "<result>" | rata issue close <spec-ref> --comment-file -`.

## Wayfinding operations

The map is an issue labelled `wayfinder:map`. Its children carry
`wayfinder:<type>`, where type is `research`, `prototype`, `grilling` or `task`.

- **Map**: `rata issue create --title "<title>" --label wayfinder:map --no-default-labels --assignee none --body-file -`
- **Child**: `rata issue create --title "<title>" --parent <map-ref> --label wayfinder:<type> --no-default-labels --assignee none --body-file -`
- **Wire**: `rata issue relate <child-ref> --blocked-by <blocker-ref>`.
- **Frontier**: `rata issue <map-ref>` returns `frontier` and `nextChild`. For the whole frontier as rows, use `rata issue list --parent <map-ref> --unblocked --unassigned --relations --sort priority --all`.
- **Claim**: `rata issue start <ref>`. It claims an unassigned issue, skips your own claim, and exits 4 with the holder when another user holds it. Add `--take` to reassign.
- **Resolve**: `printf '%s' "<result>" | rata issue close <ref> --comment-file -`, then `rata issue apply <map-ref> --file -` with a `sections` append.

## Pull requests

- **Hand off**: `rata issue handoff <ref> --file -` with `pr`, the PR URL, plus optional `state`, `sections` and `comment`. It attaches the PR, applies the state and sections, and posts one deduped comment. A retry is skipped.
- A PR closes its issue with `Closes RATA-42` in the body. Use the Linear identifier, not `#42`.
- A bare `#42` or `Closes #45` in a review is a GitHub number. Resolve it to the Linear issue, then read it with `rata issue <ref>`.
- PRs are not a request surface. Triage an external PR where it lives and mirror the outcome here.

## Skill phrases

- "Publish to the issue tracker": create a Linear issue.
- "Fetch the relevant ticket": `rata issue <ref>`.
