# Issue tracker: Linear

Load the `rata` skill before the first tracker command. The skill covers the
first command, the canonical forms, the read loop, the write loop and the
errors. This file covers this repository's facts.

- **Team**: the repository link stores the team UUID and the default project;
  `rata status` prints them with the workflow states, labels, triage map,
  cache age and document health. A warm `status` makes no Linear request;
  `--refresh` reads Linear again. A cache miss or `--refresh` repairs a renamed
  team UUID or key and warns; a link invalidates the cached detail. If the team
  is gone, the error or `status` names the repair. Do not pass `--team` for work
  in this repository, which does not use Linear projects: a spec is an issue.
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

## Command map

<!-- rata:commands:begin -->
<!-- prettier-ignore-start -->
Generated from the command registry by `bun run docs:generate`. Do not edit this block by hand.

| Command | Summary |
| --- | --- |
| `rata status` | Show the repository, workspace, team context and tracker document health |
| `rata issue` | Read and write Linear issues |
| `rata issue list` | List issues |
| `rata issue search` | Search issues by text |
| `rata issue create` | Create an issue |
| `rata issue publish` | Create a graph of issues and blocking edges from one document |
| `rata issue start` | Claim an issue and move it to a started state |
| `rata issue handoff` | Attach a pull request, apply fields, sections and one comment |
| `rata issue close` | Close an issue and move it to a completed state |
| `rata issue apply` | Apply one document to fields, labels, sections, a comment and relations |
| `rata issue relate` | Add or remove relation edges on an issue |
| `rata issue comment` | Post one comment on an issue |
| `rata triage` | Triage the queue and change roles. Not available yet. |
| `rata map` | Claim and resolve wayfinding work. Not available yet. |
| `rata admin` | Manage auth, the repository link, teams, projects, labels, the tracker doctor and the read-only API |
| `rata admin auth` | Manage Linear authentication |
| `rata admin auth login` | Store a Linear API key as a workspace profile |
| `rata admin auth status` | Show the selected profile, viewer and organization |
| `rata admin auth logout` | Remove one stored workspace profile |
| `rata admin link` | Bind this repository to a Linear team and set its timezone |
| `rata admin unlink` | Remove the stored link of this repository |
| `rata admin workspace` | Manage the stored Linear workspace profiles |
| `rata admin workspace list` | List the stored workspaces with their viewer and organization |
| `rata admin workspace use` | Set the default workspace profile |
| `rata admin config` | Show and change the issue defaults of this repository |
| `rata admin config show` | Show the issue defaults of this repository |
| `rata admin config set` | Set the issue defaults of this repository |
| `rata admin config unset` | Clear the issue defaults of this repository |
| `rata admin team` | Inspect, create and delete the teams in the workspace |
| `rata admin team list` | List the teams in the workspace |
| `rata admin team show` | Show the states, labels, members and priorities of a team |
| `rata admin team create` | Create a team with the machine timezone |
| `rata admin team delete` | Delete a team |
| `rata admin project` | Create, inspect, delete and restore the projects in the workspace |
| `rata admin project list` | List the projects in the workspace |
| `rata admin project create` | Create a project in one or more teams |
| `rata admin project delete` | Move a project to the trash, where Linear keeps it recoverable |
| `rata admin project restore` | Bring a project back from the trash, without a prompt |
| `rata admin label` | Create and inspect the labels of a team |
| `rata admin label list` | List the labels of a team |
| `rata admin label create` | Create a label |
| `rata admin label edit` | Update a label |
| `rata admin doctor` | Check the tracker document and repair its generated command block |
| `rata admin api` | Run a read-only GraphQL query against Linear |
<!-- prettier-ignore-end -->
<!-- rata:commands:end -->

## Specs and tickets

A spec is an issue. Do not prefix its title and do not wrap it in a project. Its
tickets are child issues.

- **Publish a spec graph**: `rata issue publish --file -` with one document for the spec, its tickets and their blocking edges.
- **Publish a single issue**: `rata issue create --title "<title>" --label ready-for-agent --priority medium --assignee me --body-file -` when the issue is not part of a graph.
- **Publish a ticket under a spec**: `rata issue create --title "<title>" --parent <spec-ref> --label ready-for-agent --priority medium --assignee me --body-file -`.
- **Wire blocking for a single issue**: `rata issue relate <ticket-ref> --blocked-by <blocker-ref>`.
- **Read a ticket**: `rata issue <ticket-ref>`. The read carries the description, sections, blockers, pull requests, children, frontier and next child in one call.
- **Start a ticket**: `rata issue start <ticket-ref>`. It claims an unassigned issue and moves it to the first started state. Add `--take` only when another user holds it.
- **Read a known set**: `rata issue <ref> <ref> ...`.
- **Implement**: `rata issue list --parent <spec-ref> --relations --all`. Each row carries its blocking edges.
- **Close the spec**: `printf '%s' "<result>" | rata issue close <spec-ref> --comment-file -`.

## Wayfinding operations

The map is an issue labelled `wayfinder:map`. Its children carry
`wayfinder:<type>`, where type is `research`, `prototype`, `grilling` or `task`.

- **Map**: `printf '%s' '{"defaults":{"labels":[],"assignee":null},"nodes":[{"key":"map","kind":"map","title":"<title>","labels":["wayfinder:map"]}]}' | rata issue publish --file -`
- **Child**: `printf '%s' '{"defaults":{"labels":[],"assignee":null},"parent":"<map-ref>","nodes":[{"key":"task","kind":"task","title":"<title>","labels":["wayfinder:<type>"]}]}' | rata issue publish --file -`
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
