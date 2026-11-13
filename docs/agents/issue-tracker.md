# Issue tracker: Linear

Load the `rata` skill before the first tracker command. The skill covers the
first command, the canonical forms, the read loop, the write loop and the
errors. This file covers this repository's facts.

- **Team**: the repository link stores the team and the default project;
  `rata status --json` prints them. Do not pass `--team` for work in this
  repository, which does not use Linear projects: a spec is an issue.
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
- **Wire blocking**: `rata issue link <ticket-ref> --blocked-by <blocker-ref>`.
- **Implement**: `rata issue list --parent <spec-ref> --all --json --include relations`. Each row carries its blocking edges.
- **Close the spec**: `rata issue close <spec-ref> --comment "<result>"`.

## Wayfinding operations

The map is an issue labelled `wayfinder:map`. Its children carry
`wayfinder:<type>`, where type is `research`, `prototype`, `grilling` or `task`.

- **Map**: `rata issue create --title "<title>" --label wayfinder:map --no-default-labels --assignee none --body-file -`
- **Child**: `rata issue create --title "<title>" --parent <map-ref> --label wayfinder:<type> --no-default-labels --assignee none --body-file -`
- **Wire**: `rata issue link <child-ref> --blocked-by <blocker-ref>`.
- **Frontier**: `rata next --parent <map-ref>`. For the whole frontier, use `rata issue list --parent <map-ref> --unblocked --unassigned --include relations --sort priority --all --json`.
- **Claim**: `rata issue assign <ref> --assignee me`.
- **Resolve**: `rata issue comment create <ref> --body-file -`, then `rata issue close <ref>`, then `rata issue section append <map-ref> "Decisions so far" --body-file -`.

## Pull requests

- A PR closes its issue with `Closes RATA-42` in the body. Use the Linear identifier, not `#42`.
- A bare `#42` or `Closes #45` in a review is a GitHub number. Resolve it to the Linear issue, then read it with `rata issue show <ref>`.
- PRs are not a request surface. Triage an external PR where it lives and mirror the outcome here.

## Skill phrases

- "Publish to the issue tracker": create a Linear issue.
- "Fetch the relevant ticket": `rata issue show <ref> --json`.
