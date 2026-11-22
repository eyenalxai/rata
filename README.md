# rata

Linear issue tracking for agent workflows.

`rata` is a command-line client for [Linear](https://linear.app) that gives the
[ask-matt](https://github.com/mattpocock/skills) engineering skills a
Linear-backed issue tracker: triage, tracer-bullet tickets, specs and
wayfinding maps. It is built for machines first: every command has a stable
machine-readable form, issue references accept identifiers, UUIDs and URLs, and
the output is deterministic.

The project is in early development. This repository is the first user: its own
work is tracked in Linear and driven with `rata`. The 0.10.0 release makes the
agent path the primary path: batch section writes, session and batch reads,
field array projection, stale-team repair, honest filter results, executable
hints, a lower-cost link and a server-side priority sort. The 0.9.0 release
added the one-way command forms, `--include relations`, the flat read shapes and
`createdAt`. The 0.8.0 release added heading section edits, the comment
lifecycle with retry-safe dedupe, the `next` and `why` frontier commands,
selectable reads, and `--all` paging. See **Changes in 0.10.0**, **Breaking
changes in 0.9.0** and **Breaking changes in 0.8.0** for the surface that moved.

## For agents

Load the `rata` skill before the first tracker command:
`skills/rata/SKILL.md`. It covers the first command, the canonical forms and the
read and write loops. The repository facts, including the labels and the priority
and assignee rules, are in `docs/agents/issue-tracker.md`. For every command,
flag and JSON shape, read `skills/rata/reference.md`. This README is the human
manual: install, authentication, the full catalog and examples.

## Install

From a checkout:

```bash
bun install
bun install -g .
```

`bun install -g .` installs the `rata` binary into Bun's global bin
directory. Bun prints the directory when it is not on `PATH` yet.

To run from the checkout without installing:

```bash
bun run rata -- --help
```

## Usage

```bash
pbpaste | rata auth login --with-token   # store a Linear API key
pbpaste | rata auth login --with-token --workspace work  # store a key as a profile
rata workspace list                      # list profiles: viewer and organization
rata workspace use work                  # select the default profile
rata status                              # show the repo, team context, docs and viewer in one call
rata team list                           # list teams: key, name, id
rata team show RAT                       # show a team's states, labels, members and priorities
rata team create --name "Scratch" --key SCR   # create a team
rata team delete SCR --yes               # delete a team
rata project list                        # list projects: name, state, progress, id
rata project create --name "Login revamp" --team RAT  # create a project
rata project delete "Login revamp" --yes # move a project to the trash
rata project restore "Login revamp"      # bring a project back from the trash
rata label list --team RAT               # list a team's labels
rata link --team RAT                     # bind this repository to a Linear team
rata config set --assignee me --label enhancement --priority medium  # defaults for new issues
rata config show                         # read the issue defaults
rata unlink                              # remove the stored link of this repository
rata issue RAT-42                        # one call: body, sections, blockers, PRs, children, frontier
rata issue RAT-42 --comments             # add the comments
rata issue RAT-42 --summary              # summary fields only
rata issue RAT-42 --full                 # add relations and full child rows
rata issue RAT-1 RAT-2 RAT-3             # read a known set in one list request per page
rata issue list --parent RAT-1 --relations  # the children of a map with their blocking edges
rata issue list --parent RAT-1 --unblocked --unassigned --sort priority  # the frontier of a map
rata issue list --after <cursor>         # read the next page of a list
rata issue list --all                    # drain every page of a list
rata issue search "rate limit"           # ten summary rows by default
rata issue create --title "Fix login" --team RAT --assignee me  # create an issue
rata issue link RAT-43 --blocked-by RAT-42         # RAT-43 waits for RAT-42
rata issue comment create RAT-42 --body "..."      # comment on an issue
rata issue section append RAT-42 "Handoff log" --body "Started."  # edit one section
rata issue update RAT-42 --sections-file - --dry-run  # preview several section writes
rata issue close RAT-42 --comment "..."  # close an issue
```

Every command selects the API key in this order: `LINEAR_API_KEY`, the
repository `workspace` of the repository config, the `default` profile.

`rata --help` lists every command.

## One spelling per operation

Each operation has one spelling. A removed read form fails with a `usage` error;
a wrong write form fails with a `validation` error. One hint names the canonical
form.

| Operation           | Canonical form                                                        | Rejected form                |
| ------------------- | --------------------------------------------------------------------- | ---------------------------- |
| Read an issue       | `rata issue <ref>`                                                    | `rata issue show <ref>`      |
| Read the summary    | `rata issue <ref> --summary`                                          | `rata issue status <ref>`    |
| Read many issues    | `rata issue <ref> <ref> ...`                                          | repeated `issue <ref>` calls |
| Comment on an issue | `rata issue comment create <ref> --body-file -`                       | `rata issue comment <ref>`   |
| Assign an issue     | `rata issue assign <ref> --assignee <me\|none\|id> [--take]`          | `rata issue assign <ref> me` |
| Assign every child  | `rata issue assign --parent <ref> --assignee <me\|none\|id> [--take]` |                              |
| Change an issue     | `rata issue update <ref> <flags>`                                     |                              |
| Edit one section    | `rata issue section replace <ref> "<heading>" --body-file -`          |                              |

`issue <ref>` is the only read form. `issue show`, `issue view`, `issue status`,
`next` and `why` do not exist; they exit 2 with a `usage` error. A wrong write
form exits 2 with a `validation` error. There is no positional assignee, no
direct `issue comment <ref>` form, and no other read alias. `issue update` also
sets `--assignee` and `--state`: these are fields of one compound update, not a
second spelling of `issue assign`. An assign to an issue held by another user
exits 4 and names the holder; `--take` reassigns it.

## Read shapes

A read of one resource prints the resource object. A read of many prints
`{ items, pageInfo }`. A collection prints `{ <plural>, pageInfo }`. A context
document keeps its named sections. A write prints its result object.

| Command                                   | JSON                                                                                                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `issue <ref>`                             | The working set: summary fields, `description`, `sections`, `blocked`, `blockedBy`, `prs`, `children`, `frontier`, `nextChild`, `comments: null` |
| `issue <ref> --summary`                   | The summary fields: `id`, `identifier`, `title`, `state`, `priority`, `labels`, `assignee`, `project`, `parent`, `url`, `createdAt`, `updatedAt` |
| `issue <ref> --full`                      | The working set plus `relations` and full child rows                                                                                             |
| `issue <ref> <ref> ...`                   | `{ items, pageInfo }`; one working set per ref, one list request per page                                                                        |
| `team show [<ref>]`                       | The team object                                                                                                                                  |
| `issue section get <ref> "<heading>"`     | The section object: `heading`, `level`, `content`                                                                                                |
| `issue list`                              | `{ issues, pageInfo }`; `--relations` adds the six relation groups                                                                               |
| `issue search`                            | `{ issues, pageInfo }`; ten summary rows by default, no description                                                                              |
| `team list`, `project list`, `label list` | `{ <plural>, pageInfo }`                                                                                                                         |
| `status`                                  | Named sections: `repository`, `workspace`, `viewer`, `team`, `project`, `defaults`, `states`, `labels`, `triage`, `cache`, `docs`, `warning`     |
| `config show`                             | `{ defaults }`                                                                                                                                   |
| A write                                   | The write result object                                                                                                                          |

The working set carries the summary fields, the parsed `sections`, `blocked` and
`blockedBy`, the Linear `github` attachments as `prs`, lean `children` with
`blocked` and `blockedBy`, `frontier` (open, unblocked, unassigned children),
`nextChild` (the first frontier row) and `comments: null`. `--comments` fills the
comments. `--summary` returns the summary fields only. `--full` adds the six
`relations` groups and full child rows; the summary fields are already present in
the default working set. `issue list` and `issue search` rows are
summaries with `url`, timestamps and labels; search rows have no description.

For an issue read, `--select` starts at the resource for one ref and at each row
for a list. For an admin read it starts at the same place; for `config show`, it
starts at the `defaults` object. The command validates every path against its
declared shape before it reads the value, so a typo fails even on an empty list
or a null object. A path may cross an array: `labels.name` returns the names, and
`children.identifier` returns the child identifiers. A path through an array of
scalars is a `validation` error. A write rejects field selection with a hint.
See **Field selection**.

## Output and errors

The issue reads (`issue <ref>...`, `issue list`, `issue search`) and the admin
commands (`auth`, `link`, `unlink`, `workspace`, `config`, `team`, `project`,
`label`, `status`, `whoami`) use `--format json|text`. JSON is the default when
standard output is not a terminal, and `--format text` forces text. The issue
reads also use `--select`; the issue writes still use `--json` until the apply
engine lands.

```bash
rata status
rata status --format text
```

A reordered table parses by header name. A headerless or incomplete
document is an unhealthy `docs.triage` with a warning; `status` still prints the
rest. The first state or label resolution after a cache miss fetches the full
team detail; later calls use the cache. With JSON output, a failure writes one
JSON object to stderr and leaves stdout empty. Two cases are
the exceptions: a bulk write reports one result per issue on stdout, and
`issue update --comment` writes the issue update and the `error` object on
stdout when the comment fails.

```json
{
  "error": {
    "code": "conflict",
    "message": "The label `Bug` already exists.",
    "hint": "Labels resolve case-insensitively; use `Bug`, or pass `--if-not-exists`."
  }
}
```

`hint` is a string or `null`. Set `RATA_DEBUG=1` to add `details`. The codes are
`usage`, `validation`, `not_linked`, `not_found`, `ambiguous`, `auth`,
`forbidden`, `conflict`, `rate_limited`, `network` and `internal`. In human mode
the error prints `error: <message>` and, when present, `hint: <hint>` on stderr.
A parse error writes the normal error object with code `usage`; help prints only
for `--help`.

### Exit codes

Every failure exits with the code of its class. The code is stable, so a script
branches on the number, not the message.

| Code | Meaning                                                                                                    |
| ---- | ---------------------------------------------------------------------------------------------------------- |
| `0`  | Success, including a skipped idempotent write                                                              |
| `1`  | Internal error                                                                                             |
| `2`  | Usage: bad input, missing flag, missing link, unknown command, parse error. Checked input is `validation`. |
| `3`  | Not found: issue, comment, label, project, team, section                                                   |
| `4`  | Conflict: stale `updatedAt`, or an object in the wrong state                                               |
| `5`  | Auth: missing or invalid key, or forbidden                                                                 |
| `6`  | Retryable: rate limit or network                                                                           |

A bulk write exits with the code of its first failed result, or `0` when every
result succeeds.

The issue reads select dotted paths with `--select` on a JSON read; it implies
JSON. The admin reads use the same flag:

```bash
rata issue RAT-42 --select identifier,title,state.name,children.identifier
rata issue list --select identifier,title,state.name
rata status --select repository.root,team.key
rata config show --select assignee,labels
```

The path applies to the command's own resource, not to a wrapper: the working set
of a single-issue read, the team object of `team show`, the section object
of `issue section get`, each row of a list, the `defaults` object of
`config show`, or the whole `status` document. A wrapper key stays only for a
named section or a list. An unknown path is a `validation` error, and the hint
lists the valid keys at the failing level; the shape check runs even when the
list is empty or the object is null. A path may cross an array, as `labels.name`
and `children.identifier` do. See **Field selection**.

Rata's own output is plain text. Effect's help and error presenter honor
`NO_COLOR`, so set `NO_COLOR=1` to drop color from help and errors. There is no
`--no-color` flag.

## Status

`rata status` shows the context in one call: the repository root, the selected
workspace profile and where its API key came from, the linked team, the default
project, the issue defaults, the team states and labels, the triage map, the
cache age, the tracker document health, the viewer and the organization. It
works without a link: the team line then reads `not linked (run rata link)` and
the command exits 0. Without an API key it fails with an `auth` error.

The context cache holds the team detail in the local SQLite database for seven
days. The detail holds the states, labels, members and priorities. The cache key
is the workspace profile, the team UUID and a SHA-256 hash of the API key. A warm
read makes no Linear request. A changed key misses the cache because the hash
changed. `status --refresh` reads Linear and replaces the cache. A team stored by
an old key only resolves by key, then by name, and `status` repairs the link to
the team UUID.

A read resolves the stored team by UUID, then by key, then by name. A stale team
UUID or key that resolves is repaired in place, and the command prints a warning
that names the old and new values. The fallback runs on a cache miss, after
expiry, or on `status --refresh`. A warm cache can keep serving the stored UUID
for up to seven days. When the stored team no longer exists, `status` still
reports the rest of the context: it exits 0, sets `team`, `defaults` and `cache`
to `null`, sets `states` and `labels` to empty, and adds a `warning` that names
the key and the repair: run `rata team list`, then `rata link --team <key>`. The
triage map and the document health stay. Human output prints the warning on
stderr.

`docs` reports the health of `docs/agents/issue-tracker.md` and
`docs/agents/triage-labels.md`. `exists` says whether the file is present,
`healthy` is `true`, `false`, or `null` when the file is missing, and `warning`
names the repair. `triage` is the role-to-label map parsed from the triage
document. A reordered table parses by header name. A headerless or incomplete
document is an unhealthy `docs.triage` with a warning; `status` still prints the
rest. The first state or label resolution after a cache miss fetches the full
team detail; later calls use the cache.

```bash
rata status
rata status --format json
rata status --refresh
```

Human output:

```text
repo:      /home/ada/Projects/jyoti
workspace: personal
api key:   profile personal (default)
team:      JYO (Jyoti)
project:   none
defaults:  none
states:    Backlog, Todo, In Progress, Done, Canceled
labels:    bug, enhancement, needs-triage, ready-for-agent
triage:    7 roles (/home/ada/Projects/jyoti/docs/agents/triage-labels.md)
cache:     0s old
docs:      tracker ok, triage ok
viewer:    Ada <ada@example.com>
org:       Acme (acme)
```

`--format json` prints one document:

```json
{
  "repository": { "root": "/home/ada/Projects/jyoti", "linked": true },
  "workspace": { "name": "personal", "keySource": "default" },
  "team": { "id": "t1", "key": "JYO", "name": "Jyoti" },
  "project": null,
  "defaults": { "assignee": "me", "labels": ["enhancement"], "priority": "medium" },
  "states": [
    { "id": "s1", "name": "Todo", "type": "unstarted", "position": 1 },
    { "id": "s2", "name": "In Progress", "type": "started", "position": 2 }
  ],
  "labels": [{ "id": "l1", "name": "enhancement", "color": "#5E6AD2", "scope": "team" }],
  "triage": {
    "source": "/home/ada/Projects/jyoti/docs/agents/triage-labels.md",
    "roles": {
      "bug": "bug",
      "enhancement": "enhancement",
      "needs-triage": "needs-triage",
      "needs-info": "needs-info",
      "ready-for-agent": "ready-for-agent",
      "ready-for-human": "ready-for-human",
      "wontfix": "wontfix"
    }
  },
  "cache": { "ageSeconds": 0, "fetchedAt": "2026-11-22T00:00:00.000Z" },
  "docs": {
    "tracker": {
      "path": "/home/ada/Projects/jyoti/docs/agents/issue-tracker.md",
      "exists": true,
      "healthy": true,
      "warning": null
    },
    "triage": {
      "path": "/home/ada/Projects/jyoti/docs/agents/triage-labels.md",
      "exists": true,
      "healthy": true,
      "warning": null
    }
  },
  "warning": null,
  "viewer": {
    "id": "u1",
    "name": "Ada",
    "displayName": "ada",
    "email": "ada@example.com",
    "organization": { "id": "o1", "name": "Acme", "urlKey": "acme" }
  }
}
```

`keySource` is `env` for `LINEAR_API_KEY`, `repo` for the `workspace` in the
repository config, and `default` for the default profile. `team` and `project`
are `null` when unset. `defaults` holds the repository issue defaults; each
field is `null` or empty when it is unset. `states` and `labels` come from the
context cache. `cache` is `null` without a team; `ageSeconds` counts from
the last Linear read. `warning` is `null` unless the stored team key changed or
is missing, or a document is unhealthy.

## Paging lists

`issue list`, `issue search`, `team list`, `project list` and `label list` return
one page per call. `--limit` sets the page size: 50 by default, 10 for `issue
search`, 250 at most. A value above 250 fails before the API call.
`--after <cursor>` reads the page after a cursor.

`--all` drains every page in one call. `--limit` stays the page size; it is not
a total bound. `--all` with `--after` starts from the cursor. JSON returns the
full array and `pageInfo: { "hasNextPage": false, "endCursor": null }`. Human
output prints no next-page hint.

```bash
rata issue list --all --format json
rata issue search "rate limit" --all --format json
rata team list --all
```

`--format json` prints one page and its page state:

```json
{
  "issues": [],
  "pageInfo": { "hasNextPage": true, "endCursor": "b2c3..." }
}
```

Every list command uses the same shape, with its own plural key: `issues`,
`teams`, `projects`, or `labels`. `pageInfo.hasNextPage` says whether a next
page exists. `pageInfo.endCursor` is the cursor for `--after`. The output is
pure JSON; there is no hint.

The human output prints a next-page hint when `hasNextPage` is true:

```
More issues available. Continue with --after b2c3...
```

Without `--sort`, every list is ordered by creation time (`createdAt`). Cursors
are bound to the query: keep the filters and the order fixed across pages. Pages are consistent
while the data does not change, and best effort when it does. `search` keeps
Linear's relevance ranking, so its paging is best effort.

Internal reads follow the nested connection pages they need. The list commands
return one page by default and drain every page with `--all`. In particular,
`issue <ref>` drains every nested connection; comments are read only with
`--comments`. `issue <ref> <ref> ...` drains every page of refs, so one CLI call
returns the whole set. See **Paging lists** for the connection drain.

## Authentication

One Linear API key belongs to one Linear workspace. `rata` stores named
workspace profiles, and each repository selects one:

```bash
pbpaste | rata auth login --with-token                  # store the default profile
pbpaste | rata auth login --with-token --workspace work # store the work profile
rata auth status                                        # show the selected profile, viewer and organization
rata auth status --workspace work                       # show one profile
rata auth logout --workspace work                       # remove one profile
rata workspace list                                     # list the profiles with their viewer and organization
rata workspace use work                                 # set the default profile
```

The profiles live in the local database at `$XDG_DATA_HOME/rata/rata.sqlite`,
or `~/.local/share/rata/rata.sqlite` when `XDG_DATA_HOME` is unset. The database
holds the API keys, so rata keeps it private: mode 0600 inside a 0700 directory.

On the first command that reads the profiles, rata imports a legacy `auth.json`
file from `$XDG_CONFIG_HOME/rata/auth.json`, or `~/.config/rata/auth.json` when
`XDG_CONFIG_HOME` is unset. Rata imports the file, deletes it and prints one
notice on stderr. Both legacy shapes are accepted:

```json
{ "apiKey": "lin_api_..." }
```

```json
{
  "default": "work",
  "workspaces": {
    "default": { "apiKey": "lin_api_..." },
    "work": { "apiKey": "lin_api_..." }
  }
}
```

The single-key file becomes the `default` profile. Rata never overwrites
existing profiles: when the database already holds a profile, it leaves the
legacy file in place. A corrupt legacy file fails the command and stays on
disk.

Every command selects the profile in this order:

1. `LINEAR_API_KEY` from the environment.
2. The `workspace` of the repository config, recorded by
   `rata link --workspace <name>`.
3. The `default` profile.

A repository that names a missing profile fails with a clear error. The
environment key wins over every stored profile, so a script can point every
repository at one key.

`rata workspace list --format json` prints one document:

```json
{
  "workspaces": [
    {
      "name": "default",
      "default": true,
      "viewer": {
        "id": "u1",
        "name": "Ada",
        "displayName": "ada",
        "email": "ada@example.com",
        "organization": { "id": "o1", "name": "Acme", "urlKey": "acme" }
      }
    }
  ]
}
```

`rata auth status --workspace <name>` reads that profile directly; it does not
consult `LINEAR_API_KEY` or the repository config. `rata auth logout` without
`--workspace` removes the `default` profile. When the removed profile was the
default and other profiles remain, no profile is the default. Later commands
fail with ``No default workspace. Run `rata workspace use <name>`.`` Run
`rata workspace use <name>` to select one.

## Teams

`rata team list` prints the teams in the workspace: key, name, id. It returns
one page per call: see **Paging lists**. `--format json` prints
`{ "teams": [...], "pageInfo": { "hasNextPage": ..., "endCursor": ... } }`.

`rata team show [<team-ref>]` prints the full read model of a team: the id, key,
name, timezone, every workflow state with its type and position, every label
with its color and scope, the active members and the workspace priorities.
Without a reference it uses the linked team. Without a reference and without a
link it fails with `not_linked`. The command drains every page of states,
labels and members.

```bash
rata team show JYO
rata team show --format json
```

`--format json` prints the team object at the top level:

```json
{
  "id": "t1",
  "key": "JYO",
  "name": "Jyoti",
  "timezone": "Europe/Amsterdam",
  "states": [{ "id": "s1", "name": "Todo", "type": "unstarted", "position": 1 }],
  "labels": [{ "id": "l1", "name": "bug", "color": "#EB5757", "scope": "team" }],
  "members": [{ "id": "u1", "name": "Ada", "displayName": "ada", "email": "ada@example.com" }],
  "priorities": [
    { "priority": 0, "label": "No priority" },
    { "priority": 1, "label": "Urgent" }
  ]
}
```

`scope` is `team` for a team label and `workspace` for a workspace label.
Priorities are workspace-wide, not team-specific.

`rata team create` creates a team. The viewer becomes the team owner. Linear
creates the default workflow states and labels with the team. `create` sets the
team timezone from the machine: the IANA name that the machine reports. When the
machine reports no timezone, the create skips it.

```bash
rata team create --name "Scratch" --key SCR --description "A scratch team"
rata team create --name "Scratch" --copy-settings-from RAT
```

| Flag                   | Meaning                                                      |
| ---------------------- | ------------------------------------------------------------ |
| `--name`               | Team name. Required.                                         |
| `--key`                | Team key, for example `SCR`. Linear derives one when absent. |
| `--description`        | Team description.                                            |
| `--copy-settings-from` | Team key or id. The new team copies its settings.            |

`--copy-settings-from` copies the workflow states, labels and other settings of
another team. The value is a team key or a UUID.

`--format json` prints one stable document:

```json
{
  "team": {
    "id": "t1",
    "key": "SCR",
    "name": "Scratch",
    "timezone": "Europe/Amsterdam"
  }
}
```

`rata team delete` deletes a team. It accepts a team key or a UUID. It asks for
confirmation before it calls the API, and it aborts unless the answer is `y` or
`yes`, in any case.

```bash
rata team delete SCR
rata team delete SCR --yes
```

| Flag    | Meaning                       |
| ------- | ----------------------------- |
| `--yes` | Skip the confirmation prompt. |

`--format json` prints one stable document:

```json
{
  "deleted": {
    "id": "t1",
    "key": "SCR"
  }
}
```

## Projects

A Linear project groups issues. `rata project create` creates one:

```bash
rata project create --name "Login revamp" --team RAT
rata project create --name "Login revamp" --team RAT --team OPS --description "The login work."
```

| Flag            | Meaning                                                                |
| --------------- | ---------------------------------------------------------------------- |
| `--name`        | Project name. Required.                                                |
| `--team`        | Team key or id. Repeat for more teams. Default: the repository config. |
| `--description` | Project description.                                                   |

`--format json` prints one stable document:

```json
{
  "project": {
    "id": "p1",
    "name": "Login revamp",
    "progress": 0.25,
    "status": { "name": "Started" },
    "trashed": false
  }
}
```

`rata project list` prints the name, state, progress and id of one page of the
projects that include the linked team. Pass `--team <key>` to look at another
team; run `rata link` once to set the link.

```bash
rata project list
rata project list --team RAT
```

`rata project list --include-archived` also shows trashed and archived
projects. A trashed row carries a ` (deleted)` marker after the name:

```bash
rata project list --include-archived
```

`--format json` prints
`{ "projects": [...], "pageInfo": { "hasNextPage": ..., "endCursor": ... } }`
with the same fields, and every item carries the `trashed` flag. `--limit` and
`--after` page the list; see **Paging lists**. `progress` is the fraction of
the project's issues that are done, between 0 and 1.

`rata project delete` moves a project to the trash. It accepts a project name
or a UUID. A name matches case-insensitively across every page. Linear keeps a
deleted project recoverable for 30 days.

```bash
rata project delete "Login revamp"
rata project delete "Login revamp" --yes
```

| Flag    | Meaning                       |
| ------- | ----------------------------- |
| `--yes` | Skip the confirmation prompt. |

The command asks for confirmation before it calls the API, and it aborts unless
the answer is `y` or `yes`, in any case. The prompt names the project and its
id. An ambiguous name fails and asks for the UUID. A project that is already in
the trash fails and points at `project restore`.

`--format json` prints one stable document:

```json
{
  "deleted": {
    "id": "p1",
    "name": "Login revamp"
  }
}
```

`rata project restore` brings a trashed project back. It accepts a project name
or a UUID. A name matches case-insensitively across every page. It runs without
a confirmation prompt. Restore works within the 30 days that Linear keeps a
trashed project.

```bash
rata project restore "Login revamp"
```

A project that is not in the trash fails and points at `project delete`. An
ambiguous name fails and asks for the UUID.

`--format json` prints one stable document:

```json
{
  "restored": {
    "id": "p1",
    "name": "Login revamp"
  }
}
```

### Specs and tickets

A spec is an issue. Do not prefix the title with `Spec:`. Its tickets are child
issues of the spec, so the set stays together:

1. `/to-spec` creates the spec issue:
   `rata issue create --title "Switch billing to Stripe" --label ready-for-agent --priority medium --assignee me --body-file -`.
2. `/to-tickets` creates each ticket as a child of the spec:
   `rata issue create --title "Add the Stripe client" --parent ABC-42 --label ready-for-agent --priority medium --assignee me --body-file -`.
   Wire the blocking edges between the tickets with
   `rata issue link ABC-44 --blocked-by ABC-43`.
3. `/implement-spec` fetches the whole set:
   `rata issue list --parent ABC-42 --all --relations`. Each row
   then carries its blocking edges, so the frontier needs no per-child read.

`rata issue <spec-ref>` also lists the child issues, the frontier and the next
child in one call.

`issue create --project` and `issue list --project` accept a project name or a
UUID. A wayfinding map stays an issue with child issues.

## Labels

`rata label list` prints the labels of the linked team: name, id, color. Pass
`--team <key>` for another team. It returns one page per call: see
**Paging lists**. `--format json` prints
`{ "labels": [...], "pageInfo": { "hasNextPage": ..., "endCursor": ... } }`.

`rata label create --name <name> [--color <hex>] [--team <key>] [--if-not-exists]`
creates a team-scoped label. `--team` defaults to the team from `rata link`. A
missing `--color` lets Linear pick the color. A duplicate name, ignoring case,
fails with `conflict` and names the existing label. `--if-not-exists` returns
the existing label instead.

`rata label edit <label-ref> [--name <new-name>] [--color <hex>] [--team <key>]`
changes an existing label. A label reference is a name or a UUID. A name
resolves, ignoring case, against the team labels and the workspace labels. Pass
at least one of `--name` and `--color`.

The color is 6 hex digits, with or without `#`: `#EB5757` and `EB5757` are both
valid. rata adds the `#` when it is missing and keeps the case.

`create` and `edit` accept `--format json`. Both print
`{ "label": { "id": ..., "name": ..., "color": ... } }`. `create` also prints
`"created": true` or `"created": false` when `--if-not-exists` returns an
existing label.

## Context and team resolution

One command resolves one context: the repository root, the profile, the team and
its cached detail, the states, the labels, the defaults and the stale-link
warning. The reader and writer take that context as an argument.

A team-scoped single write uses the issue's team when it differs from the linked
team, or when the repository has no link. Otherwise it uses the linked team.
Cross-team bulk label writes resolve the label names against each child's team.
The old `label`, `project` and `config` commands still use the migration adapter
`RepoTeam`; that is a ticket-scoped migration path, not a compatibility
guarantee.

`show`, `summary` and `why` do not read the viewer and do not repair the
repository link. `list` and `search` print the stale-link warning. So do
`close`, `reopen`, the label writes, `issue update --state`, and
`issue update --sections-file --state` when they resolve the repository link.

The read gateway exposes its raw client for writes. The write documents stay in
`src/tracker/write/documents.ts`; they do not enter the read gateway.

## Linking a repository

`rata link` binds this repository to a Linear team:

```bash
rata link
rata link --team RAT --project rata
rata link --team SCR --create --name "Scratch"
```

Without flags, `link` prompts. It lists the stored workspace profiles with their
viewer and organization, and asks which workspace to use. It then lists the
teams of that workspace and asks which team to use. The prompt needs a terminal;
pass `--team` when standard input is a pipe.

`--workspace <name>` skips the workspace prompt and uses that profile for every
call. `--team <key>` without `--workspace` searches the key in every stored
workspace:

- One workspace holds the team: `link` uses it and records that workspace.
- Several workspaces hold the team: `link` fails and asks for `--workspace`.
- No workspace holds the team: `link` fails, unless `--create` is passed. Then
  `link` creates the team in the resolved profile: the `workspace` of the
  repository config, or the default profile.

When `LINEAR_API_KEY` is set, the environment key is the only target: `link`
ignores the stored profiles. It keeps a `workspace` already recorded in the
repository config. An explicit `--workspace` still selects that profile.

`link` writes the repository config to rata's local database at
`$XDG_DATA_HOME/rata/rata.sqlite`, or `~/.local/share/rata/rata.sqlite` when
`XDG_DATA_HOME` is unset. Every later command finds the config from any
subdirectory. Inside a Git repository the config belongs to the Git common
directory, so the main checkout and every worktree share it. Outside Git it
belongs to the directory where `link` ran, and its subdirectories find it. rata
never writes a configuration file into a repository. On first use, rata imports
an existing `.rata.json` into the database, deletes the file and prints one
notice on stderr. If the delete fails, rata prints a warning and keeps the
imported config. A file that is already gone is not an error.

| Flag          | Meaning                                                                |
| ------------- | ---------------------------------------------------------------------- |
| `--team`      | Team key or id. Searches every stored workspace without `--workspace`. |
| `--project`   | Default project name or id for the repository.                         |
| `--workspace` | Workspace profile. Skips the workspace prompt.                         |
| `--create`    | Create the team when it does not exist. Needs `--team` and `--name`.   |
| `--name`      | Team name, used with `--create`.                                       |
| `--format`    | Print JSON or text. JSON is the default off a terminal.                |

A missing team fails with `TeamNotFoundError` unless `--create` is passed.

`link` sets the timezone of the linked team from the machine: the IANA name that
the machine reports. It calls `teamUpdate` only when the timezone differs, and
it reports the change. When the timezone matches, or the machine reports none,
`link` makes no update.

`link` records the workspace profile and the team in the repository config. It
stores the team key and the team UUID, so later reads use the UUID. The explicit
`--workspace` wins. A team found by `--team` records the profile that holds it.
Without a profile, `link` keeps the `workspace` of an existing config.

`--format json` prints one stable document with the linked team and the
repository config:

```json
{
  "team": {
    "id": "t1",
    "key": "RAT",
    "name": "rata",
    "timezone": "Europe/Amsterdam"
  },
  "project": "rata",
  "workspace": null,
  "timezone": { "previous": "America/Los_Angeles", "current": "Europe/Amsterdam" }
}
```

`project` is `null` when no project is recorded. `workspace` is `null` when no
profile is recorded. `timezone` holds the previous and current IANA names when
`link` changed the team timezone, and `null` otherwise.

`rata unlink` removes the stored link of this repository:

```bash
rata unlink
rata unlink --format json
```

It prints what it removed, for example `Unlinked RAT from this repository.`, and
it exits non-zero when the repository is not linked. `--format json` prints one
stable document with the removed team, project and workspace:

```json
{
  "team": "RAT",
  "project": "rata",
  "workspace": null
}
```

## Repository issue defaults

`rata config` stores the values that `issue create` applies without explicit
flags:

```bash
rata config set --assignee me --label enhancement --priority medium
rata config show
rata config show --format json
rata config unset --label
```

| Flag         | Meaning                                                                                 |
| ------------ | --------------------------------------------------------------------------------------- |
| `--assignee` | `me`, a user id, or `none` to clear it. `me` follows the current viewer.                |
| `--label`    | Label name. Repeat to replace the default list. `config unset --label` clears the list. |
| `--priority` | `none`, `urgent`, `high`, `medium`, `low`, or `0`-`4`. `none` and `0` clear it.         |

`config set` needs a linked team because labels are team-scoped. It resolves
every label against the team and fails with `not_found` for a missing label.
`config set --label` replaces the default list; `config unset` clears only the
named fields.

`config show --format json` prints:

```json
{ "defaults": { "assignee": "me", "labels": ["enhancement"], "priority": "medium" } }
```

`issue create` resolves each field in this order: the explicit flag, the
repository default, unset. An explicit `--priority low` wins, and `--label bug`
adds `bug` to the default labels. `--no-default-labels` drops the default labels
for one call. `--assignee none` and `--priority none` clear their fields.

When `rata link --team` changes the team, rata validates the stored default
labels against the new team. A missing label fails the link and lists the
missing labels. `rata unlink` clears the defaults with the rest of the
repository config.

## Reading issues

`rata issue <ref>` is the one read. It accepts an identifier (`RAT-42`), a UUID,
or a linear.app URL. It returns the working set in one call: the summary fields,
the description, the parsed `sections`, `blocked`, `blockedBy`, the Linear GitHub
attachments as `prs`, lean `children`, `frontier`, `nextChild` and
`comments: null`.

```bash
rata issue RAT-42
rata issue RAT-42 --comments
rata issue RAT-42 --summary
rata issue RAT-42 --full
```

The summary fields are `id`, `identifier`, `title`, `state`, `priority`,
`labels`, `assignee`, `project`, `parent`, `url`, `createdAt` and `updatedAt`.
`--summary` returns only those fields. `--full` adds the six `relations` groups
and full child rows; the summary fields are already in the default working set.
`--summary` and `--full` are mutually exclusive, and `--summary` rejects
`--comments`.

```bash
rata issue RAT-42 --select identifier,title,state.name,children.identifier
```

The lean child rows carry `id`, `identifier`, `title`, `state`, `priority`,
`assignee`, `blocked` and `blockedBy`. `frontier` holds the open, unblocked,
unassigned children ordered by priority then creation time. `nextChild` is the
first frontier row, or `null`. The `sections` array carries `heading`, `level`,
`content` and `line`. The comments are `null` unless `--comments` is passed.

Many refs are one call and one list request per page, not one detail read per
ref:

```bash
rata issue RAT-1 RAT-2 RAT-3
```

Many refs print `{ "items": [...], "pageInfo": { ... } }`. One ref prints the
working-set object at the top level.

The working-set query nests its connections. Linear caps one query at 10,000
complexity points, so the page size and the first page of each connection use
safe bounds: one page holds up to 250 refs in `--summary` mode, 5 refs in the
working mode and 3 refs in `--full` mode. When a requested connection has a next
page, rata drains it with one batched request per connection page, merges the
rows, then computes `frontier`, `nextChild` and `blockedBy`. Children, relations,
labels, attachments and comments are all drained; no output is silently capped.

The PR projection reads the Linear `github` attachments. Each PR carries its
number, repo, url, status, draft flag, reviews, conflict flag, `mergedAt` and
`closedAt`. The repo comes from `repo`, or from `repoLogin` and `repoName` when
Linear omits `repo`. `checks` and `mergeCommit` are `null`: Linear does not
carry them. Each PR says `source: "linear"`. A missing attachment gives
`prs: []`, and missing metadata gives `null` fields. The command needs no GitHub
token.

`rata issue list` accepts filters. Combine any of them. Without `--team`, the
list shows only the linked team's issues; run `rata link` once to set the link:

```bash
rata issue list --team RAT --state "In Progress" --label bug --limit 100
rata issue list --state-type started --assignee me
rata issue list --parent RAT-1 --text login
rata issue list --parent RAT-1 --unblocked --unassigned --sort priority
rata issue list --parent RAT-1 --relations
rata issue list --limit 100 --after <cursor>
rata issue list --priority urgent --sort priority --limit 10
```

| Flag           | Meaning                                                                                                                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--team`       | Team key or id. Default: the team from `rata link`.                                                                                                                                           |
| `--state`      | Workflow state name, for example `In Progress`.                                                                                                                                               |
| `--state-type` | One of `triage`, `backlog`, `unstarted`, `started`, `completed`, `canceled`, `duplicate`.                                                                                                     |
| `--priority`   | `none`, `urgent`, `high`, `medium`, `low`, or `0`-`4`.                                                                                                                                        |
| `--label`      | Label name.                                                                                                                                                                                   |
| `--assignee`   | `me`, or a user id.                                                                                                                                                                           |
| `--project`    | Project id or name.                                                                                                                                                                           |
| `--parent`     | Parent issue reference.                                                                                                                                                                       |
| `--text`       | Text that appears in the title or the description.                                                                                                                                            |
| `--unblocked`  | Keep only open issues with no open blocker.                                                                                                                                                   |
| `--unassigned` | Keep only issues with no assignee.                                                                                                                                                            |
| `--relations`  | Add `blocks`, `blockedBy`, `duplicates`, `duplicatedBy`, `related` and `similar` to every row. One list request per page and no per-child read; up to 250 per outgoing or inverse connection. |
| `--sort`       | `priority` orders urgent first and none last; ties go to the oldest. Linear sorts on the server.                                                                                              |
| `--limit`      | Page size. Default: 50, maximum: 250.                                                                                                                                                         |
| `--after`      | Continue after a cursor from a previous page.                                                                                                                                                 |
| `--all`        | Drain every page. `--limit` stays the page size.                                                                                                                                              |

`--relations` is the one-call path to the blocking edges of a parent's children.
It adds the same six groups that `issue <ref> --full` returns. The flag composes
with every filter, `--all` and `--select`. Without the flag, a row has no
`relations` key.

On an empty page, `--state`, `--label` and `--project` are checked for
existence. An unknown name is `not_found`, and the hint lists the valid names. A
valid name with no matching issues stays an empty page and exits 0. `--assignee`
accepts `me` or a user UUID; a malformed value is `validation`, and an unknown
UUID is `not_found`.

`--priority` keeps issues with exactly one priority value. `none` and `0`
select the issues with no priority. `--sort priority` orders the results
urgent, high, medium, low, then none. Linear sorts on the server, so `--limit`
stays the page size and `--after` continues the sorted result. Issues with equal
priorities stay in `createdAt` order, oldest first. With `--unblocked`, blocked
issues are dropped before the sort.

An open issue is one whose state type is not `completed`, `canceled` or
`duplicate`. An open blocker is a blocker whose state type is not `completed`,
`canceled` or `duplicate`. `--unblocked` keeps the open issues whose blockers
are all closed. `--parent` with `--unblocked` and `--unassigned` is the
**frontier** of a map: the open, unblocked, unclaimed children. The map's own
read carries the same frontier in `frontier` and `nextChild`.

`rata issue search "<text>"` searches by text. Without `--team`, the search stays
inside the linked team; pass `--team <key>` for another team. It returns ten
summary rows by default. `--limit` changes the page size, `--after` continues
from a cursor, `--all` drains every page, and the rows carry no description. It
keeps Linear's relevance ranking.

```bash
rata issue search "rate limit"
rata issue search "rate limit" --limit 25
rata issue search "rate limit" --after <cursor>
rata issue search "rate limit" --all --format json
```

### Field selection

`--select` selects dotted paths from the JSON output of an issue read. It implies
JSON, and it starts at the command's resource:

```bash
rata issue RAT-42 --select identifier,title,state.name,children.identifier
rata issue list --select identifier,title --limit 10
rata issue search "rate limit" --select identifier,title
```

A single-resource read has no wrapper:
`{ "identifier": "...", "title": "..." }`. A list selection applies to each
item:
`{ "issues": [ { "identifier": "...", "title": "..." } ], "pageInfo": ... }`.
`pageInfo` stays in a list result. Paths are dotted and nested, such as
`state.name` or `parent.identifier`.

A path through a null object returns `null` and does not fail: `assignee.name`
on an unassigned issue gives `{ "assignee": null }`. The selector validates the
whole path against the command's declared shape before it reads the value, so a
typo fails even when the list is empty or the object is null.

A path may cross an array. A final array segment returns the array, such as
`labels`. A segment after an array maps each element. A scalar leaf returns an
array of scalars: `labels.name` gives `{ "labels": ["bug"] }`. An object leaf
returns an array of objects: `children.state` gives
`{ "children": [{ "state": ... }] }`. Two paths that cross the same array merge.
A path through an array of scalars is a `validation` error. An empty array is
validated and returns `[]`.

`--select` is valid on `issue <ref>...`, `issue list`, `issue search`, `status`,
`team show`, `team list`, `project list`, `label list`, `config show` and
`whoami`. On an issue read it validates the shape of the active mode: summary,
working or full. The issue writes still use `--json` and `--fields` until the
apply engine lands. An unknown path is a `validation` error whose hint lists the
valid keys at the failing level.

For any other shape, use `--format json` and `jq`. There is no custom format or
template language.

### Section editing

`issue section` reads and edits one heading section of the description. A
section is an ATX heading (`#` to `######`) and the content under it. It ends at
the next heading of the same or higher level; deeper headings stay inside. A
heading inside a fenced code block is not a section. The heading match is exact
and case-sensitive.

```bash
rata issue section get RAT-42 "Handoff log"
rata issue section get RAT-42 "Handoff log" --with-heading
rata issue section append RAT-42 "Handoff log" --body "Started."
printf 'New content' | rata issue section replace RAT-42 "Handoff log" --body-file -
```

`get` prints the content only. `--with-heading` prints the heading line first.
JSON is the section object `{ "heading", "level", "content" }` at the top level,
and `--fields` starts at that object.

`append` inserts the content at the end of the section, or creates the section
at the end of the description when the heading is missing. `--level` sets the
new heading level (default 2). `replace` replaces the content and keeps the
heading; a missing heading is `not_found`. Both need `--body` or `--body-file`.

`--dry-run` prints a unified diff and writes nothing.
`--if-unchanged <updatedAt>` fails with `conflict` before the write when the
issue changed since that read; the hint names the current value. Linear has no
compare-and-swap, so the check is best effort.

A duplicate heading is an `ambiguous` error that lists the line numbers. A
missing heading read or replace is `not_found` and lists the available headings.

For several sections, use one `issue update --sections-file` call. The document
holds a `sections` array of `heading` and `content` pairs:

```json
{
  "sections": [
    { "heading": "Flow", "content": "New flow." },
    { "heading": "Gates", "content": "New gate." }
  ]
}
```

One read, one diff and one write replace every heading. The heading line stays,
and deeper headings inside each section stay. A missing heading is `not_found`,
a duplicate is `ambiguous`, and an empty heading is `validation`; every heading
is checked before the first write. The flag cannot combine with `--body`,
`--body-file` or `--append`; it composes with the other update fields,
`--comment`, `--if-unchanged` and `--dry-run`.

The dry run returns the snapshot `updatedAt`, so the write takes that value:

```bash
printf '%s' "$SECTIONS_JSON" | rata issue update RAT-42 --sections-file - --dry-run
printf '%s' "$SECTIONS_JSON" | rata issue update RAT-42 --sections-file - --if-unchanged <updatedAt>
```

The write returns `{ "status", "updatedAt", "issue", "sections" }`. Each section
action is `replaced` or `skipped`. A repeated write with the same content reports
`skipped` and calls no mutation.

## Writing issues

`rata issue create` needs a team: pass `--team`, or run `rata link` once. The
`project` of the repository config is the default project for `create`. The
repository issue defaults fill the assignee, the labels and the priority. A team
value is a key or a UUID. A project value is a name or a UUID.

```bash
rata issue create --title "Fix login" --team RAT --label ready-for-agent --priority high --assignee me
rata issue create --title "Add the client" --parent RAT-1 --assignee me --wait 10
rata issue comment create RAT-42 --body "Looks good."
rata issue comment create RAT-42 --body "Handoff." --dedupe-key mission-42-handoff
printf 'From a pipe' | rata issue update RAT-42 --body-file -
printf '\nUpdate.' | rata issue update RAT-42 --body-file - --append
rata issue update RAT-42 --state "In Progress" --assignee me
rata issue update RAT-42 --priority high --if-unchanged 2026-01-01T10:00:00.000Z
rata issue update RAT-42 --assignee me --comment "Claimed."
rata issue section append RAT-42 "Handoff log" --body "Started."
rata issue section replace RAT-42 "Handoff log" --body-file -
printf '{"sections":[{"heading":"Flow","content":"New flow."}]}' | rata issue update RAT-42 --sections-file - --dry-run
rata issue label add RAT-42 ready-for-agent bug
rata issue label remove RAT-42 needs-triage
rata issue close RAT-42 --comment "Done in PR #12"
rata issue reopen RAT-42
rata issue assign RAT-42 --assignee me
rata issue assign RAT-42 --assignee none
rata issue unassign RAT-42
rata issue assign --parent RAT-1 --assignee me
rata issue label add --parent RAT-1 enhancement bug
rata issue label remove --parent RAT-1 needs-triage
rata issue link RAT-43 --blocked-by RAT-42
rata issue link RAT-42 --blocks RAT-43 --related RAT-44
rata issue unlink RAT-43 --blocked-by RAT-42
```

| Command                                 | Flags                                                                                                                                                                                           |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `issue create`                          | `--title` (required), `--body`, `--body-file`, `--team`, `--label` (repeatable), `--no-default-labels`, `--parent`, `--project`, `--state`, `--assignee`, `--priority`, `--wait`, `--dry-run`   |
| `issue update <ref>`                    | `--title`, `--body`, `--body-file`, `--append`, `--sections-file`, `--state`, `--assignee`, `--project`, `--parent`, `--priority`, `--comment`, `--comment-file`, `--dry-run`, `--if-unchanged` |
| `issue comment create <ref>`            | `--body`, `--body-file` (one is required), `--dedupe-key`, `--wait`, `--dry-run`                                                                                                                |
| `issue comment update <comment-id>`     | `--body`, `--body-file` (one is required), `--dry-run`                                                                                                                                          |
| `issue comment delete <comment-id>`     | `--yes`, `--dry-run`                                                                                                                                                                            |
| `issue section get <ref> <heading>`     | `--with-heading`                                                                                                                                                                                |
| `issue section append <ref> <heading>`  | `--body`, `--body-file` (one is required), `--level`, `--dry-run`, `--if-unchanged`                                                                                                             |
| `issue section replace <ref> <heading>` | `--body`, `--body-file` (one is required), `--dry-run`, `--if-unchanged`                                                                                                                        |
| `issue label add [<ref>] <label...>`    | label names, `--parent`, `--dry-run`                                                                                                                                                            |
| `issue label remove [<ref>] <label...>` | label names, `--parent`, `--dry-run`                                                                                                                                                            |
| `issue close <ref>`                     | `--comment`, `--comment-file`, `--dry-run`                                                                                                                                                      |
| `issue reopen <ref>`                    | `--dry-run`                                                                                                                                                                                     |
| `issue assign [<ref>]`                  | `--assignee` (required): `me`, a user id, or `none`; `--take` reassigns an issue held by another user; `--parent`, `--dry-run`                                                                  |
| `issue unassign <ref>`                  | `--dry-run`                                                                                                                                                                                     |
| `issue link <ref>`                      | `--blocks`, `--blocked-by`, `--related`, `--duplicate` (each repeatable), `--dry-run`                                                                                                           |
| `issue unlink <ref>`                    | the same relation flags and `--dry-run`                                                                                                                                                         |

Linear has one `blocks` relation. `link --blocks X` records that the issue blocks
X. `link --blocked-by X` records the same relation in the inverse direction: X
blocks the issue. `--duplicate X` means the issue duplicates X. `--related X`
links the two issues with no direction. Repeat a flag to link several issues at
once. `unlink` removes the relation that the matching flag recorded. A missing
relation is a skipped success, not an error.

`--assignee none` clears the assignee. `issue unassign` is the same write with
less typing. `--assignee me` resolves the viewer.

### Comment lifecycle

`issue comment` is a group: `create`, `update` and `delete`.

```bash
rata issue comment create RAT-42 --body "Looks good."
printf '## Handoff\n...' | rata issue comment create RAT-42 --body-file -
rata issue comment create RAT-42 --body "Handoff." --dedupe-key mission-42-handoff
rata issue comment update c1 --body "Revised."
rata issue comment delete c1
rata issue comment delete c1 --yes
```

`create` needs exactly one of `--body` and `--body-file -`. It waits up to 5
seconds for the new comment to appear on a re-read; `--wait <seconds>` changes
the bound and `--wait 0` skips the check. A timeout still exits 0, because the
mutation payload is the source of truth.

`--dedupe-key <key>` makes a retried comment idempotent. The key is scoped to
the issue. rata derives a UUIDv4 from `sha256(issueId + "\0" + key)` and checks
for a comment with that id. When the comment exists, the command returns it
without writing. The same key on another issue creates a separate comment.
Without `--dedupe-key`, every call creates a comment.

JSON prints the outcome and the comment:

```json
{
  "status": "created",
  "comment": {
    "id": "c1",
    "body": "Looks good.",
    "createdAt": "2026-01-01T10:00:00.000Z",
    "user": { "id": "u1", "name": "Ada", "displayName": "ada" }
  },
  "visible": true
}
```

`status` is `created` or `skipped`. `visible` follows **Read-after-write**:
`true`, `false`, or `null` when the check is disabled. Human output prints
`Commented on RAT-42.` or `Comment already exists on RAT-42.`

`update <comment-id>` replaces the body. The id is a UUID. A missing comment is
`not_found`. JSON prints `{ "comment": ... }`; human output prints
`Updated comment c1.`

`delete <comment-id>` moves the comment to the trash. Linear keeps it
recoverable. Human mode asks for confirmation; `--yes` skips the prompt. JSON
mode requires `--yes` and fails with `validation` without it. JSON prints
`{ "deleted": true, "id": "c1" }`; human output prints `Deleted comment c1.`

All three accept `--dry-run`. `create` runs the dedupe check and reports the
outcome without writing, so a dry run can report `skipped`. `update` prints a
unified diff. `delete` prints the comment that would be deleted and asks nothing.

`issue update <ref>` also takes `--comment` and `--comment-file -`. The update
and the comment compose with the other flags, so one call changes the body, the
state and the comment:

```bash
rata issue update RAT-42 --state "In Progress" --comment "Started work."
printf 'Handoff note.' | rata issue update RAT-42 --comment-file -
```

The two flags are mutually exclusive, and an empty comment body is a
`validation` error. The command validates every target before it writes: the
issue, the state, the assignee, the project, the parent, the priority and the
comment body. A validation failure aborts with zero writes. It then applies the
issue update and creates the comment. Linear has no transaction, so the issue
update stays when the comment fails.

JSON on success prints the issue and the comment:

```json
{
  "issue": { "identifier": "RAT-42", "updatedAt": "2026-01-01T10:00:00.000Z" },
  "comment": { "id": "c1", "body": "Shipped in PR #12." }
}
```

Without `--comment` or `--comment-file`, the output stays `{ "issue": ... }`. A
comment failure prints the issue update, `"comment": null` and the `error`
object, and exits with the code of that error. This is the one single-issue
command that writes a partial result to stdout on failure, because the issue
update already landed. Human mode prints the issue result and the error on
stderr.

`--dry-run` prints `{ "dryRun": true, "actions": [...] }` with the issue update
action and the comment action, and writes nothing.

### Bulk writes by parent

`issue assign`, `issue label add` and `issue label remove` accept `--parent`.
The command then targets every child of the parent issue, open and closed, in
creation order. Pass an issue reference or `--parent`, not both.

```bash
rata issue assign --parent RAT-1 --assignee me
rata issue label add --parent RAT-1 enhancement bug
rata issue label remove --parent RAT-1 needs-triage
```

For the label commands, `--parent` makes every positional a label. Without it,
the first positional is the issue reference.

Rata validates every target and every label before the first write. A bad
reference or a missing label aborts the whole batch with zero changes. The
writes then run best-effort: a failure mid-batch does not roll back the earlier
writes. The command exits with the code of the first failed result.

`--json` prints one result per issue:

```json
{
  "dryRun": false,
  "results": [
    { "identifier": "RAT-3", "status": "updated", "issue": { "identifier": "RAT-3" } },
    { "identifier": "RAT-4", "status": "skipped", "issue": { "identifier": "RAT-4" } },
    {
      "identifier": "RAT-5",
      "status": "failed",
      "error": { "code": "not_found", "message": "No issue RAT-5.", "hint": null }
    }
  ]
}
```

`status` is `updated`, `skipped` or `failed`. Human output prints one line per
issue. `--dry-run` resolves the children and reports the same results with
`"dryRun": true`, without calling a mutation.

### Idempotency

A write that finds the desired state already in place exits 0 and reports
`skipped`. This holds for `issue link` with an existing relation, `issue unlink`
with a missing relation, `issue assign` with the same assignee, `issue unassign`
when the issue has none, `issue label add` with a present label, `issue label
remove` with an absent label, `issue close` when the state is already
`completed`, and `issue reopen` when the state is already `unstarted`. A
`canceled` issue still moves to a completed state. `issue close` on an already
completed issue is skipped, including its comment; a retry cannot post the same
comment twice. `issue create` always creates a new object. `issue comment create`
creates a comment unless `--dedupe-key` finds the one it made before.

`label create --if-not-exists` returns the existing label with `created: false`.

### Read-after-write

Linear documents no read-after-write guarantee. A comment or a child issue that a
write just created can be missing from a later read. `issue comment create` and
`issue create --parent` therefore check that the new object appears on a bounded
re-read.

The check waits 5 seconds by default. `--wait <seconds>` changes the bound and
`--wait 0` disables it. A write that never appears exits 0: the mutation payload
is the source of truth. JSON reports `"visible": false` and human mode prints a
warning to stderr. `"visible"` is `null` when the check is disabled and on
`issue create` without `--parent`.

```bash
rata issue comment create RAT-42 --body "Looks good." --wait 10
rata issue create --title "Add the client" --parent RAT-1 --assignee me --wait 0
```

### Dry runs

`--dry-run` resolves the targets and prints the actions without calling a
mutation. Every issue write accepts it: `issue create`, `issue update`,
`issue section append`, `issue section replace`, `issue comment create`,
`issue comment update`, `issue comment delete`, `issue link`, `issue unlink`,
`issue assign`, `issue unassign`, `issue label add`, `issue label remove`,
`issue close` and `issue reopen`. It stays on `config set` and `config unset`.

```bash
rata issue create --title "Fix login" --assignee me --dry-run
rata issue assign RAT-42 --assignee me --dry-run
rata issue close RAT-42 --comment "Done." --dry-run
rata config set --label enhancement --dry-run --format json
```

With JSON output, most writes print `{ "dryRun": true, "actions": [...] }`. Each
action carries the command action, the target and the changes. Comment and
section writes print one `action` with their own fields; **Dry runs** in
`skills/rata/reference.md` lists the shape by command.

`issue update --sections-file` is the one dry run with a snapshot: it prints
`{ "dryRun": true, "status", "updatedAt", "sections", "diff" }`. Pass that
`updatedAt` to `--if-unchanged` on the write.

The body writes print a unified diff: `issue update --append`,
`issue section append`, `issue section replace`, `issue update --sections-file`
and `issue comment update`.
`issue update --comment` prints the planned issue update and the comment action.
No mutation runs.

`--body-file -` and `--comment-file -` read the body from standard input. The
`--body` and `--body-file` flags are mutually exclusive, as are `--comment` and
`--comment-file`. The bodies are markdown.

`--assignee me` resolves the viewer. `--state` matches a workflow state name.
`--priority` accepts `none`, `urgent`, `high`, `medium`, `low`, or `0`-`4`.
`issue close` moves the issue to a state of type `completed`; `issue reopen`
moves it to a state of type `unstarted`. The CLI never hard-codes a state id.

The triage roles map to label strings in `docs/agents/triage-labels.md`; the
role name is not always the label string. `issue label add RAT-42 <label>` adds
one. A label name resolves against the team labels and the workspace labels,
ignoring case. `issue label remove` resolves the same way.

Every work-surface write command accepts `--json`. The update and reopen commands
print the summary shape:

```json
{
  "issue": {
    "id": "b2c3...",
    "identifier": "RAT-42",
    "title": "Fix login",
    "url": "https://linear.app/eyenalx/issue/RAT-42/fix-login",
    "state": { "name": "Todo", "type": "unstarted" },
    "priority": "high",
    "assignee": null,
    "project": null,
    "parent": null,
    "labels": [],
    "createdAt": "2025-12-30T10:00:00.000Z",
    "updatedAt": "2026-01-01T10:00:00.000Z"
  }
}
```

`issue create` wraps the same issue and adds `visible`:
`{ "issue": { ... }, "visible": true }`. `visible` is `false` when the parent
does not show the new child before the bound, and `null` without `--parent`.

The idempotent writes add the outcome: `issue close`, `issue assign`,
`issue unassign`, `issue label add` and `issue label remove` print
`{ "dryRun": false, "status": "updated", "issue": { ... } }`. `status` is
`skipped` when the desired state already held. `issue reopen` prints the plain
summary shape `{ "issue": { ... } }`; its status shows only in the dry run.

`issue comment create` prints `{ "status", "comment", "visible" }`; see
**Comment lifecycle** for the shape and the meaning of `visible`.

The link and unlink commands print the relations they changed, with a
`skipped` entry for a relation that already held the desired state. The command
resolves the source and every target in one id query, reads both relation
directions in one query, and needs no id query for a UUID reference. One target
and three targets each cost two read requests in the common case:

```json
{
  "dryRun": false,
  "status": "updated",
  "relations": [
    { "action": "created", "kind": "blockedBy", "target": "RAT-42" },
    { "action": "skipped", "kind": "blocks", "target": "RAT-43" }
  ]
}
```

## Changes in 0.10.0

- `issue update --sections-file -` replaces several headings in one read, one
  diff and one write. A dry run returns the snapshot `updatedAt`.
- `issue status` gains `--with-body`, `--comments` and `--children`. The default
  shape stays; the child list reuses the detail id, so the common read drops from
  three requests to two.
- `issue list` gains `--id`, `--count` and `--ids-only`; `search` gains
  `--count` and `--ids-only`; `next` gains `--ids-only`.
- `--fields` validates each path against the command's declared shape, so a typo
  fails on an empty list or a null object. A path may cross an array, and a
  scalar or object leaf projects to an array.
- A read resolves a stale team key and repairs the stored link with a warning. A
  key that no longer exists fails with `not_found` and the repair hint; `status`
  keeps its exit 0 and reports the warning.
- An unknown state, label or project name on an empty list is `not_found` with
  the valid names. A valid name with no issues stays an empty page.
- Known wrong forms now fail with an executable command: `issue update --label`,
  `issue update --blocked-by`, `issue create --blocked-by`, a bare `issue link`,
  and a write with `--fields`. Write help ends with an agent notes block.
- `issue link` resolves the source and every target in one id query, reads both
  relation directions in one query, and needs no id query for a UUID reference.
  One target and three targets each cost two requests in the common case.
- `--sort priority` uses Linear's server sort. `--limit` is the page size and
  `--after` continues the sorted result; the command no longer reads every page
  to sort.

This is the one 0.10.0 agent-experience release. The 0.10 map's
import/export/apply, graph read, PR awareness, cache and audit log, and API
escape hatch stay out.

## Breaking changes in 0.9.0

- `issue <ref>` and a positional assignee are rejected. Read with
  `issue show <ref>` and assign with `issue assign <ref> --assignee <value>`.
  The error hint names the canonical form.
- `issue list` gains `--include relations`, which adds the six relation groups
  to every row with one list request per page and no per-child read.
- Single-resource reads print the resource object: `issue show` (summary and
  detail), `issue status`, `next`, `why`, `team show` and `issue section get`.
  `issue list` and `search` keep `{ "issues", "pageInfo" }`.
- `--fields` starts at the resource, returns `null` for a path through a null
  object, and rejects a path into an array. `next` and `why` accept it.
- `IssueSummary` and `IssueDetail` gain `createdAt`. Every issue read carries
  it, and so does every write result that returns a full issue summary.
- `rata status` reports the rest of the context when the stored team key is
  stale: `team` and `defaults` are `null` and `warning` names the repair. It
  exits 0.
- A failed legacy `.rata.json` cleanup prints a warning instead of failing the
  command.

## Breaking changes in 0.8.0

- `issue comment <ref>` becomes `issue comment create <ref>`. The group also
  gains `update` and `delete`.
- `issue section` is new: `get`, `append` and `replace`.
- `issue update` gains `--append`, `--dry-run`, `--if-unchanged`, `--comment`
  and `--comment-file`.
- `issue show` gains `--summary`, `--no-body`, `--no-relations`, `--no-children`
  and `--no-attachments`.
- `issue list`, `search`, `team list`, `project list` and `label list` gain
  `--all`.
- `issue show` gains the `view` alias.
- `IssueSummary` and `IssueDetail` gain `updatedAt`. Every issue in every read
  and write result carries it.
- `--dry-run` now covers every issue write, including `issue comment create`,
  `issue comment update`, `issue comment delete`, `issue close` and
  `issue reopen`.
- `rata next` and `rata why` are new top-level commands.
- An unknown `--fields` path now fails with a hint that lists the valid keys at
  the failing level.

## Documentation

- `GLOSSARY.md`: the domain vocabulary.
- `docs/agents/issue-tracker.md`: how the ask-matt skills use this tracker.
- `docs/agents/triage-labels.md`: the triage roles and their label strings.
- `docs/agents/domain.md`: how the skills consume the domain documentation.
- `skills/rata/SKILL.md`: the agent entry point for the CLI.
- `skills/rata/reference.md`: every command, flag and JSON shape.
- `AGENTS.md`: how to work in this repository.

## License

MIT
