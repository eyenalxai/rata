# rata

Linear issue tracking for agent workflows.

`rata` is a command-line client for [Linear](https://linear.app) that gives the
[ask-matt](https://github.com/mattpocock/skills) engineering skills a
Linear-backed issue tracker: triage, tracer-bullet tickets, specs and
wayfinding maps. It is built for machines first: every command has a stable
machine-readable form, issue references accept identifiers, UUIDs and URLs, and
the output is deterministic.

The project is in early development. This repository is the first user: its own
work is tracked in Linear and driven with `rata`. In 0.11.0 the CLI has five
roots: `status`, `issue`, `triage`, `map` and `admin`. `admin` holds the setup
commands and a read-only GraphQL escape hatch. The command registry
generates the reference and the tracker command block; run `bun run
docs:generate` after a command change. See **Changes in 0.11.0** for the five-root
surface and the removed commands.

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

The root has five commands. `status` and `issue` are the work surface.
`triage` and `map` are visible phase 2 groups with no work commands yet.
`admin` holds the setup commands.

```bash
pbpaste | rata admin auth login --with-token   # store a Linear API key
pbpaste | rata admin auth login --with-token --workspace work  # store a key as a profile
rata admin workspace list                      # list profiles: viewer and organization
rata admin workspace use work                  # select the default profile
rata status                                    # show the repo, team context, docs and viewer in one call
rata admin team list                           # list teams: key, name, id
rata admin team show RAT                       # show a team's states, labels, members and priorities
rata admin team create --name "Scratch" --key SCR   # create a team
rata admin team delete SCR --yes               # delete a team
rata admin project list                        # list projects: name, state, progress, id
rata admin project create --name "Login revamp" --team RAT  # create a project
rata admin project delete "Login revamp" --yes # move a project to the trash
rata admin project restore "Login revamp"      # bring a project back from the trash
rata admin label list --team RAT               # list a team's labels
rata admin link --team RAT                     # bind this repository to a Linear team
rata admin config set --assignee me --label enhancement --priority medium  # defaults
rata admin config show                         # read the issue defaults
rata admin unlink                              # remove the stored link of this repository
rata admin doctor                              # check the tracker command block
rata admin api --query "query Viewer { viewer { id } }"  # read-only GraphQL
rata issue RAT-42                              # one call: body, sections, blockers, PRs, children, frontier
rata issue RAT-42 --comments                   # add the comments
rata issue RAT-42 --summary                    # summary fields only
rata issue RAT-42 --full                       # add relations and full child rows
rata issue RAT-1 RAT-2 RAT-3                   # read a known set in one list request per page
rata issue list --parent RAT-1 --relations     # the children of a map with their blocking edges
rata issue list --parent RAT-1 --unblocked --unassigned --sort priority  # the frontier of a map
rata issue list --after <cursor>               # read the next page of a list
rata issue list --all                          # drain every page of a list
rata issue search "rate limit"                 # ten summary rows by default
rata issue create --title "Fix login" --team RAT --assignee me  # create an issue
rata issue publish --file graph.json           # create a graph of issues and blocking edges
rata issue start RAT-42                        # claim an unassigned issue and start it
rata issue apply RAT-42 --file -               # fields, labels, sections, comment and relations
rata issue apply RAT-42 --file - --dry-run     # print the plan, write nothing
rata issue handoff RAT-42 --file handoff.json  # attach the PR, state, section and comment
rata issue relate RAT-43 --blocked-by RAT-42   # RAT-43 waits for RAT-42
printf 'Started.' | rata issue comment RAT-42 --body-file - --dedupe-key start-42
printf 'Done in PR #12.' | rata issue close RAT-42 --comment-file -  # close with one comment
```

Every command selects the API key in this order: `LINEAR_API_KEY`, the
repository `workspace` of the repository config, the `default` profile.

`rata --help` lists the five roots.

## Admin

`admin` holds ten commands:

| Command           | Purpose                                                 |
| ----------------- | ------------------------------------------------------- |
| `admin auth`      | Store, inspect and remove workspace profiles            |
| `admin link`      | Bind this repository to a team and set its timezone     |
| `admin unlink`    | Remove the stored repository link                       |
| `admin workspace` | List the profiles and select the default                |
| `admin config`    | Read and change the issue defaults of this repository   |
| `admin team`      | List, show, create and delete teams                     |
| `admin project`   | List, create, delete and restore projects               |
| `admin label`     | List, create and edit the labels of a team              |
| `admin doctor`    | Check the tracker document and repair its command block |
| `admin api`       | Run a read-only GraphQL query against Linear            |

The old root commands (`auth`, `whoami`, `config`, `link`, `unlink`, `workspace`,
`team`, `project`, `label`) exit 2 as unknown subcommands. `whoami` is gone;
`status` and `admin auth status` carry the viewer.

`admin api` reads a GraphQL query from `--query` or standard input. It rejects
mutations and subscriptions before it sends a request. The JSON output is one
`{ data }` object with the raw GraphQL response, and the command never prints the
API key. It uses the same key resolution as every other command.

`admin doctor` reads `docs/agents/issue-tracker.md`, finds the known `rata` commands
and compares their paths with the command registry. It reports a stale form with its
replacement. `--write` rewrites the block between
`<!-- rata:commands:begin -->` and `<!-- rata:commands:end -->`. It writes only
that file under the repository.

## Generated docs

`skills/rata/reference.md` and the tracker command block come from the command
registry. Do not edit their generated blocks by hand.

```bash
bun run docs:generate   # rewrite both blocks
bun run docs:check      # fail when either block is stale
```

`status` runs the same cheap check and reports a stale tracker document in
`docs.tracker`. The test suite checks the generated files, so a stale block
fails `bun run check`.

## One spelling per operation

Each operation has one spelling. A removed form exits 2 with a `usage` error,
and one hint names the canonical form.

| Operation           | Canonical form                                              | Rejected form                                                                                    |
| ------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Read an issue       | `rata issue <ref>`                                          | `rata issue show <ref>`                                                                          |
| Read the summary    | `rata issue <ref> --summary`                                | `rata issue status <ref>`                                                                        |
| Read many issues    | `rata issue <ref> <ref> ...`                                | repeated `issue <ref>` calls                                                                     |
| Change an issue     | `rata issue apply <ref> --file -`                           | `issue update`, `issue label`, `issue section`, `issue assign`, `issue unassign`, `issue reopen` |
| Publish a graph     | `rata issue publish --file -`                               |                                                                                                  |
| Start an issue      | `rata issue start <ref>`                                    | `issue assign --assignee me`                                                                     |
| Hand off an issue   | `rata issue handoff <ref> --file -`                         |                                                                                                  |
| Close an issue      | `rata issue close <ref> --comment-file -`                   | `issue close --comment`                                                                          |
| Comment on an issue | `rata issue comment <ref> --body-file - --dedupe-key <key>` | `issue comment create`, `issue comment update`, `issue comment delete`                           |
| Change a relation   | `rata issue relate <ref> --blocked-by <target>...`          | `issue link`, `issue unlink`                                                                     |

`issue <ref>` is the only read form. `issue show`, `issue view`, `issue status`,
`next` and `why` do not exist.

The setup commands have one home: `admin`. The old root forms `auth`, `whoami`,
`config`, `link`, `unlink`, `workspace`, `team`, `project` and `label` exit 2.
`triage` and `map` exist as phase 2 groups with a description and no work
commands.

## Read shapes

A read of one resource prints the resource object. A read of many prints
`{ items, pageInfo }`. A collection prints `{ <plural>, pageInfo }`. A context
document keeps its named sections. A write prints its result object.

| Command                                                     | JSON                                                                                                                                             |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `issue <ref>`                                               | The working set: summary fields, `description`, `sections`, `blocked`, `blockedBy`, `prs`, `children`, `frontier`, `nextChild`, `comments: null` |
| `issue <ref> --summary`                                     | The summary fields: `id`, `identifier`, `title`, `state`, `priority`, `labels`, `assignee`, `project`, `parent`, `url`, `createdAt`, `updatedAt` |
| `issue <ref> --full`                                        | The working set plus `relations` and full child rows                                                                                             |
| `issue <ref> <ref> ...`                                     | `{ items, pageInfo }`; one working set per ref, one list request per page                                                                        |
| `admin team show [<ref>]`                                   | The team object                                                                                                                                  |
| `issue list`                                                | `{ issues, pageInfo }`; `--relations` adds the six relation groups                                                                               |
| `issue search`                                              | `{ issues, pageInfo }`; ten summary rows by default, no description                                                                              |
| `admin team list`, `admin project list`, `admin label list` | `{ <plural>, pageInfo }`                                                                                                                         |
| `status`                                                    | Named sections: `repository`, `workspace`, `viewer`, `team`, `project`, `defaults`, `states`, `labels`, `triage`, `cache`, `docs`, `warning`     |
| `admin config show`                                         | `{ defaults }`                                                                                                                                   |
| `admin doctor`                                              | `{ document, healthy, stale, block, written }`                                                                                                   |
| `admin api`                                                 | `{ data }` with the raw GraphQL response                                                                                                         |
| A write                                                     | The write result object                                                                                                                          |

The working set carries the summary fields, the parsed `sections`, `blocked` and
`blockedBy`, the Linear `github` attachments as `prs`, lean `children` with
`blocked` and `blockedBy`, `frontier` (open, unblocked, unassigned children),
`nextChild` (the first frontier row) and `comments: null`. `--comments` fills the
comments. `--summary` returns the summary fields only. `--full` adds the six
`relations` groups and full child rows; the summary fields are already present in
the default working set. `issue list` and `issue search` rows are
summaries with `url`, timestamps and labels; search rows have no description.

For an issue read, `--select` starts at the resource for one ref and at each row
for a list. For an admin read it starts at the same place; for `admin config
show`, it starts at the `defaults` object. The command validates every path
against its declared shape before it reads the value, so a typo fails even on an
empty list or a null object. A path may cross an array: `labels.name` returns the
names, and `children.identifier` returns the child identifiers. A path through an
array of scalars is a `validation` error. A command that does not declare a
selectable output rejects `--select` with a hint. See **Field selection**.

## Output and errors

The issue reads (`issue <ref>...`, `issue list`, `issue search`), every issue
write and the `admin` group use `--format json|text`. JSON is the default when
standard output is not a terminal, and `--format text` forces text. Every issue
command, including `issue create`, and the selectable admin reads (`admin auth
status`, `admin team show`, `admin team list`, `admin project list`, `admin
label list`, `admin config show`) also use `--select`.

```bash
rata status
rata status --format text
```

A reordered table parses by header name. A headerless or incomplete
document is an unhealthy `docs.triage` with a warning; `status` still prints the
rest. The first state or label resolution after a cache miss fetches the full
team detail; later calls use the cache. With JSON output, a failure writes one
JSON object to stderr and leaves stdout empty. The exception is a partial
apply: it writes one resource document with the applied actions, the failed
action and `result.error` on stdout, and exits with the failed action's code.

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

The issue reads select dotted paths with `--select` on a JSON read; it implies
JSON. The admin reads use the same flag:

```bash
rata issue RAT-42 --select identifier,title,state.name,children.identifier
rata issue list --select identifier,title,state.name
rata status --select repository.root,team.key
rata admin config show --select assignee,labels
```

The path applies to the command's own resource, not to a wrapper: the working set
of a single-issue read, the team object of `admin team show`, each row of a list,
the `defaults` object of `admin config show`, or the whole `status` document. A
wrapper key stays only for a named section or a list. An unknown path is a
`validation` error, and the hint lists the valid keys at the failing level; the
shape check runs even when the list is empty or the object is null. A path may
cross an array, as `labels.name` and `children.identifier` do. See **Field
selection**.

Rata's own output is plain text. Effect's help and error presenter honor
`NO_COLOR`, so set `NO_COLOR=1` to drop color from help and errors. There is no
`--no-color` flag.

## Status

`rata status` shows the context in one call: the repository root, the selected
workspace profile and where its API key came from, the linked team, the default
project, the issue defaults, the team states and labels, the triage map, the
cache age, the tracker document health, the viewer and the organization. It
works without a link: the team line then reads `not linked (run rata admin link)` and
the command exits 0. Without an API key it fails with an `auth` error.
`status --full` adds the team timezone, members and priorities to the JSON
object. The default status keeps the compact team summary.

The context cache holds the team detail in the local SQLite database for seven
days. The detail holds the states, labels, members and priorities. The cache key
is the workspace profile, the team UUID and a SHA-256 hash of the API key. A warm
read makes no Linear request. A changed key misses the cache because the hash
changed. `status --refresh` reads Linear and replaces the cache. A team stored by
an old key only resolves by key, then by name, and `status` repairs the link to
the team UUID. A link invalidates the cached detail of the linked team, so the
next read fetches the current key. A warm repair writes only the team UUID and
never writes a cached key over the linked key. A cache write or invalidation
failure warns and does not fail the command.

A read resolves the stored team by UUID, then by key, then by name. A stale team
UUID or key that resolves is repaired in place, and the command prints a warning
that names the old and new values. The fallback runs on a cache miss, after
expiry, or on `status --refresh`. A warm cache can keep serving the stored UUID
for up to seven days. When the stored team no longer exists, `status` still
reports the rest of the context: it exits 0, sets `team`, `defaults` and `cache`
to `null`, sets `states` and `labels` to empty, and adds a `warning` that names
the key and the repair: run `rata admin team list`, then `rata admin link --team <key>`. The
triage map and the document health stay. Human output prints the warning on
stderr.

`docs` reports the health of `docs/agents/issue-tracker.md` and
`docs/agents/triage-labels.md`. `exists` says whether the file is present,
`healthy` is `true`, `false`, or `null` when the file is missing, and `warning`
names the repair. The tracker check also finds the known `rata` commands in the
document and compares their paths with the registry. A stale command, a missing
generated block or a stale block makes `docs.tracker` unhealthy; `admin doctor`
names each replacement and `--write` repairs the block. `triage` is the
role-to-label map parsed from the triage document. A reordered table parses by
header name. A headerless or incomplete document is an unhealthy `docs.triage`
with a warning; `status` still prints the rest. The first state or label
resolution after a cache miss fetches the full team detail; later calls use the
cache.

```bash
rata status
rata status --format json
rata status --refresh
rata status --full
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

`issue list`, `issue search`, `admin team list`, `admin project list` and
`admin label list` return one page per call. `--limit` sets the page size: 50 by
default, 10 for `issue search`, 250 at most. A value above 250 fails before the
API call. `--after <cursor>` reads the page after a cursor.

`--all` drains every page in one call. `--limit` stays the page size; it is not
a total bound. `--all` with `--after` starts from the cursor. JSON returns the
full array and `pageInfo: { "hasNextPage": false, "endCursor": null }`. Human
output prints no next-page hint.

```bash
rata issue list --all --format json
rata issue search "rate limit" --all --format json
rata admin team list --all
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
pbpaste | rata admin auth login --with-token                  # store a profile; the first profile becomes the default
pbpaste | rata admin auth login --with-token --workspace work # store the work profile
rata admin auth status                                        # show the selected profile, viewer and organization
rata admin auth status --workspace work                       # show one profile
rata admin auth logout                                        # remove the default profile and select the next profile
rata admin auth logout --workspace work                       # remove one profile
rata admin workspace list                                     # list the profiles with their viewer and organization
rata admin workspace use work                                 # set the default profile
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
   `rata admin link --workspace <name>`.
3. The `default` profile.

A repository that names a missing profile fails with a clear error. The
environment key wins over every stored profile, so a script can point every
repository at one key.

`rata admin workspace list --format json` prints one document:

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

`rata admin auth status --workspace <name>` reads that profile directly; it does not
consult `LINEAR_API_KEY` or the repository config. At most one profile is the
default, and the database rejects a second default profile.

`rata admin auth logout` without `--workspace` removes the default profile.
Rata then makes the next profile by name the default, so the next command
selects a key. When no profile remains, commands that need a key fail with
``Not authenticated. Run `rata admin auth login --with-token`, or set LINEAR_API_KEY.``
Run `rata admin workspace use <name>` to select a different profile.

`rata admin auth logout --format json` reports `removed` (the profile name or
`null`), `defaultProfile` (the promoted profile or `null`) and `remaining` (the
stored profile count).

## Teams

`rata admin team list` prints the teams in the workspace: key, name, id. It returns
one page per call: see **Paging lists**. `--format json` prints
`{ "teams": [...], "pageInfo": { "hasNextPage": ..., "endCursor": ... } }`.

`rata admin team show [<team-ref>]` prints the full read model of a team: the id, key,
name, timezone, every workflow state with its type and position, every label
with its color and scope, the active members and the workspace priorities.
Without a reference it uses the linked team. Without a reference and without a
link it fails with `not_linked`. The command drains every page of states,
labels and members.

```bash
rata admin team show JYO
rata admin team show --format json
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

`rata admin team create` creates a team. The viewer becomes the team owner. Linear
creates the default workflow states and labels with the team. `create` sets the
team timezone from the machine: the IANA name that the machine reports. When the
machine reports no timezone, the create skips it.

```bash
rata admin team create --name "Scratch" --key SCR --description "A scratch team"
rata admin team create --name "Scratch" --copy-settings-from RAT
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

`rata admin team delete` deletes a team. It accepts a team key or a UUID. It asks for
confirmation before it calls the API, and it aborts unless the answer is `y` or
`yes`, in any case.

```bash
rata admin team delete SCR
rata admin team delete SCR --yes
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

A Linear project groups issues. `rata admin project create` creates one:

```bash
rata admin project create --name "Login revamp" --team RAT
rata admin project create --name "Login revamp" --team RAT --team OPS --description "The login work."
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

`rata admin project list` prints the name, state, progress and id of one page of the
projects that include the linked team. Pass `--team <key>` to look at another
team; run `rata admin link` once to set the link.

```bash
rata admin project list
rata admin project list --team RAT
```

`rata admin project list --include-archived` also shows trashed and archived
projects. A trashed row carries a ` (deleted)` marker after the name:

```bash
rata admin project list --include-archived
```

`--format json` prints
`{ "projects": [...], "pageInfo": { "hasNextPage": ..., "endCursor": ... } }`
with the same fields, and every item carries the `trashed` flag. `--limit` and
`--after` page the list; see **Paging lists**. `progress` is the fraction of
the project's issues that are done, between 0 and 1.

`rata admin project delete` moves a project to the trash. It accepts a project name
or a UUID. A name matches case-insensitively across every page. Linear keeps a
deleted project recoverable for 30 days.

```bash
rata admin project delete "Login revamp"
rata admin project delete "Login revamp" --yes
```

| Flag    | Meaning                       |
| ------- | ----------------------------- |
| `--yes` | Skip the confirmation prompt. |

The command asks for confirmation before it calls the API, and it aborts unless
the answer is `y` or `yes`, in any case. The prompt names the project and its
id. An ambiguous name fails and asks for the UUID. A project that is already in
the trash fails and points at `admin project restore`.

`--format json` prints one stable document:

```json
{
  "deleted": {
    "id": "p1",
    "name": "Login revamp"
  }
}
```

`rata admin project restore` brings a trashed project back. It accepts a project name
or a UUID. A name matches case-insensitively across every page. It runs without
a confirmation prompt. Restore works within the 30 days that Linear keeps a
trashed project.

```bash
rata admin project restore "Login revamp"
```

A project that is not in the trash fails and points at `admin project delete`. An
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
   `rata issue relate ABC-44 --blocked-by ABC-43`.
3. `/implement-spec` fetches the whole set:
   `rata issue list --parent ABC-42 --all --relations`. Each row
   then carries its blocking edges, so the frontier needs no per-child read.

`rata issue <spec-ref>` also lists the child issues, the frontier and the next
child in one call.

`issue create --project` and `issue list --project` accept a project name or a
UUID. A wayfinding map stays an issue with child issues.

## Labels

`rata admin label list` prints the labels of the linked team: name, id, color. Pass
`--team <key>` for another team. It returns one page per call: see
**Paging lists**. `--format json` prints
`{ "labels": [...], "pageInfo": { "hasNextPage": ..., "endCursor": ... } }`.

`rata admin label create --name <name> [--color <hex>] [--team <key>] [--if-not-exists]`
creates a team-scoped label. `--team` defaults to the team from `rata admin link`. A
missing `--color` lets Linear pick the color. A duplicate name, ignoring case,
fails with `conflict` and names the existing label. `--if-not-exists` returns
the existing label instead.

`rata admin label edit <label-ref> [--name <new-name>] [--color <hex>] [--team <key>]`
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
The `admin label`, `admin project` and `admin config` commands still use the
migration adapter `RepoTeam`; moving it into the six-layer split is a follow-up.

`issue <ref> --summary` and the lean read do not read the viewer and do not
repair the repository link. `issue list` and `issue search` print the stale-link
warning. So does `issue apply` when it resolves the repository link.

The read gateway exposes its raw client for writes. The write documents stay in
`src/tracker/write/documents.ts`; they do not enter the read gateway.

## Linking a repository

`rata admin link` binds this repository to a Linear team:

```bash
rata admin link
rata admin link --team RAT --project rata
rata admin link --team SCR --create --name "Scratch"
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

`rata admin unlink` removes the stored link of this repository:

```bash
rata admin unlink
rata admin unlink --format json
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

`rata admin config` stores the values that `issue create` applies without explicit
flags:

```bash
rata admin config set --assignee me --label enhancement --priority medium
rata admin config show
rata admin config show --format json
rata admin config unset --label
```

| Flag         | Meaning                                                                                       |
| ------------ | --------------------------------------------------------------------------------------------- |
| `--assignee` | `me`, a user id, or `none` to clear it. `me` follows the current viewer.                      |
| `--label`    | Label name. Repeat to replace the default list. `admin config unset --label` clears the list. |
| `--priority` | `none`, `urgent`, `high`, `medium`, `low`, or `0`-`4`. `none` and `0` clear it.               |

`admin config set` needs a linked team because labels are team-scoped. It
resolves every label against the team and fails with `not_found` for a missing
label. `admin config set --label` replaces the default list; `admin config
unset` clears only the named fields.

`admin config show --format json` prints:

```json
{ "defaults": { "assignee": "me", "labels": ["enhancement"], "priority": "medium" } }
```

`issue create` resolves each field in this order: the explicit flag, the
repository default, unset. An explicit `--priority low` wins, and `--label bug`
adds `bug` to the default labels. `--assignee none` and `--priority none` clear
their fields. To create a graph without the repository labels, set
`defaults.labels` in an `issue publish` document.

When `rata admin link --team` changes the team, rata validates the stored default
labels against the new team. A missing label fails the link and lists the
missing labels. `rata admin unlink` clears the defaults with the rest of the
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
list shows only the linked team's issues; run `rata admin link` once to set the link:

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
| `--team`       | Team key or id. Default: the team from `rata admin link`.                                                                                                                                     |
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

`--select` is valid on every issue command (reads and writes, including `issue
create`), on `status`, and on the selectable admin reads (`admin team show`,
`admin team list`, `admin project list`, `admin label list`, `admin config show`
and `admin auth status`). On an issue read it validates the shape of the active
mode: summary, working or full. `admin api` returns a raw shape, so it does not
take `--select`. An unknown path is a `validation` error whose hint lists the
valid keys at the failing level.

For any other shape, use `--format json` and `jq`. There is no custom format or
template language.

### Writing issues

Every write uses the same plan and result contract. `issue apply` takes the
general document; `issue publish` creates a graph; `issue start`, `issue handoff`
and `issue close` are the lifecycle forms. `issue publish` has a separate planner
because a graph has no single issue snapshot, but it returns the same result
fields.

```bash
# one document for fields, labels, sections, a comment and relations
rata issue apply RAT-42 --file update.json
rata issue apply RAT-42 --file update.json --dry-run
rata issue apply RAT-42 --file update.json --if-unchanged 2026-01-01T10:00:00.000Z
# one document for a graph of new issues and their blocking edges
rata issue publish --file graph.json
rata issue publish --file graph.json --dry-run
# lifecycle
rata issue start RAT-42
rata issue start RAT-42 --state "In Progress" --take
rata issue handoff RAT-42 --file handoff.json
printf 'Done in PR #12.' | rata issue close RAT-42 --comment-file -
rata issue close RAT-42 --force
# one-off relation edges
rata issue relate RAT-42 --blocked-by RAT-41
rata issue relate RAT-42 --related RAT-41 --remove
# one comment
printf 'Started work.' | rata issue comment RAT-42 --body-file - --dedupe-key start-42
```

The apply document has optional `title`, `state`, `assignee`, `priority`,
`project`, `parent`, `labels` (`add` and `remove`), `sections`, `comment` and
`relations` (`blocks`, `blockedBy`, `related`, `duplicate`). Omit a field to
leave it alone. `assignee`, `project` and `parent` accept `null` to clear them.
Sections take `mode: "replace"` or `"append"`; replace needs the heading, and
append creates a missing heading at the end. A duplicate heading is `ambiguous`.
An edit to a parent section and an edit to its nested child in one document are
also `ambiguous`, and nothing is written.
A comment in `issue apply` needs a `dedupeKey`; a retry returns `skipped`.
The handoff document is an apply document plus `pr`, the pull request URL. It
attaches the PR, applies the fields and sections, posts one deduped comment, and
a retry is skipped. `issue close` refuses open children unless `--force`, moves
to the first completed state, and skips a closed issue; a new close comment posts
once, and the same comment is skipped.

The publish document has `team`, `parent`, `defaults` and `nodes`. Each node
requires `key`, `kind` and `title`; `body`, `priority`, `labels`, `assignee`,
`state`, `parent` and `blockedBy` are optional. A parent or a blocker may name a
node key or an existing issue reference. The engine orders the nodes, derives a
stable client UUID from the parent and key (the team scopes a top-level node),
reads the existing ids before it creates, and creates up to fifty nodes per
`issueBatchCreate`. It then adds only the blocking edges that are missing. A
cycle or an unknown key fails before the first write. A retry reuses the created
nodes and skips the edges that already exist. `kind` is recorded on the node and
in the result; in this slice it does not set labels or assignees.

`issue apply` plans every action first, then applies it. `--dry-run` returns the
plan and writes nothing. `--if-unchanged` compares the snapshot once before the
first mutation and exits 4 on a mismatch. A no-op returns `status: "skipped"`.
A partial failure returns the applied actions and the failed action with its
error code. `issue publish` supports `--dry-run` but has no `--if-unchanged`; its
snapshot is the document parent's `updatedAt`, or null.

The result is `{ issue, result }`; `result` carries `action`, `status`,
`changed`, `dryRun`, `snapshot`, `actions` and, on failure, `failed` and
`error`. `issue publish` returns `{ nodes, edges, result }` instead of one
`issue`.

`issue create` returns `{ issue, result }`; its result action is `create`. A
failed create is a normal error, not a partial result. A dry run returns
`issue: null`, the planned action and `result.dryRun: true`, and writes nothing.
The lifecycle commands use the same plan/apply engine. The removed write forms (`issue update`, `issue label`,
`issue section`, `issue assign`, `issue unassign`, `issue reopen`, `issue link`,
`issue unlink`, the old `issue comment` subcommands and the old `issue close
--comment` flag) exit 2 with a `usage` error.

## Changes in 0.11.0

- The root has five commands: `status`, `issue`, `triage`, `map` and `admin`.
  `triage` and `map` are visible phase 2 groups; they have a description and no
  work commands yet.
- The setup commands moved under `admin`: `auth`, `link`, `unlink`, `workspace`,
  `config`, `team`, `project`, `label`, `doctor` and `api`. The old root forms
  exit 2. `whoami` is gone; `status` and `admin auth status` carry the viewer.
- `admin api` runs a read-only GraphQL query. It rejects mutations and
  subscriptions before the request and never prints the API key.
- `status --full` adds the team timezone, members and priorities.
- `admin doctor` checks the known `rata` commands and removed flags in
  `docs/agents/issue-tracker.md` against the registry. `--write` repairs the
  generated command block.
- `skills/rata/reference.md` and the tracker command block are generated from
  the command registry. Run `bun run docs:generate`; `bun run docs:check` fails
  when either block is stale.
- `issue <ref>` is the only read form. `issue apply` is the general write,
  `issue publish` owns a graph, and `start`, `handoff` and `close` own the
  lifecycle.
- `issue create` uses `--format` and `--select`; `--json`, `--fields`, `--body`,
  `--wait` and `--no-default-labels` are gone.
- The old read and write forms stay removed: `issue show`, `issue view`,
  `issue status`, `next`, `why`, `issue update`, `issue label`, `issue section`,
  `issue assign`, `issue unassign`, `issue reopen`, `issue link`, `issue unlink`,
  the old `issue comment` subcommands and `--json`/`--fields` on the migrated
  commands. They exit 2.

## Documentation

- `GLOSSARY.md`: the domain vocabulary.
- `docs/agents/issue-tracker.md`: how the ask-matt skills use this tracker.
- `docs/agents/triage-labels.md`: the triage roles and their label strings.
- `docs/agents/domain.md`: how the skills consume the domain documentation.
- `skills/rata/SKILL.md`: the agent entry point for the CLI.
- `skills/rata/reference.md`: the generated command catalog and the JSON shapes.
- `AGENTS.md`: how to work in this repository.

## License

MIT
