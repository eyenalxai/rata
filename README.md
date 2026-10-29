# rata

Linear issue tracking for agent workflows.

`rata` is a command-line client for [Linear](https://linear.app) that gives the
[ask-matt](https://github.com/mattpocock/skills) engineering skills a
Linear-backed issue tracker: triage, tracer-bullet tickets, specs and
wayfinding maps. It is built for machines first: every command has a stable
machine-readable form, issue references accept identifiers, UUIDs and URLs, and
the output is deterministic.

The project is in early development. This repository is the first user: its own
work is tracked in Linear and driven with `rata`. The 0.7.0 release adds one
global `--json`, `--fields` selection, structured errors, and read-after-write
checks.

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
rata status                              # show the repo, workspace, team and viewer in one call
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
rata issue list                          # list issues
rata issue list --parent RAT-1 --unblocked --unassigned --sort priority  # the frontier of a map
rata issue list --after <cursor>         # read the next page of a list
rata issue show RAT-42                   # read one issue
rata search "rate limit"                 # search issues by text
rata issue create --title "Fix login" --team RAT   # create an issue
rata issue link RAT-43 --blocked-by RAT-42         # RAT-43 waits for RAT-42
rata issue comment RAT-42 --body "..."   # comment on an issue
rata issue close RAT-42 --comment "..."  # close an issue
```

Every command selects the API key in this order: `LINEAR_API_KEY`, the
repository `workspace` of the repository config, the `default` profile.

`rata --help` lists every command.

## Output and errors

`--json` is one global flag. It may come before or after the subcommand, and
both forms are equivalent:

```bash
rata --json issue list
rata issue list --json
```

With `--json`, every command prints one stable JSON document. With `--json`, a
failure writes one JSON object to stderr, leaves stdout empty, and exits 1. A
bulk write is the exception: it reports one result per issue on stdout and exits
1 when any result failed.

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
`validation`, `not_linked`, `not_found`, `ambiguous`, `auth`, `forbidden`,
`conflict`, `rate_limited`, `network` and `internal`. In human mode the error
prints `error: <message>` and, when present, `hint: <hint>` on stderr.
Argument-parse errors keep the built-in help text.

`--fields` selects dotted paths from the JSON output of a read command. It
requires `--json`:

```bash
rata issue list --json --fields identifier,title,state.name
rata status --json --fields repository.root,team.key
rata config show --json --fields assignee,labels
```

The path applies to the command's own object, not to the JSON key that wraps
it: the `issue` of `issue show`, each item of `issues`, `teams`, `labels` or
`projects`, the `team` of `team show`, the `defaults` object of `config show`,
or the whole `status` document. The wrapper key stays:
`{ "issues": [ { "identifier": "...", "title": "..." } ] }`. An unknown path is
a `validation` error. `--fields` is valid on `status`, `issue show`,
`issue list`, `search`, `team show`, `team list`, `label list`, `project list`
and `config show`. Other commands reject it with `validation`.

Rata's own output is plain text. Effect's help and error presenter honor
`NO_COLOR`, so set `NO_COLOR=1` to drop color from help and errors. There is no
`--no-color` flag.

## Status

`rata status` shows the context in one call: the repository root, the selected
workspace profile and where its API key came from, the linked team, the default
project, the issue defaults, the viewer and the organization. It works without a
link: the team line then reads `not linked (run rata link)` and the command
exits 0. Without an API key it fails with an `auth` error.

```bash
rata status
rata status --json
```

Human output:

```text
repo:      /home/ada/Projects/jyoti
workspace: personal
api key:   profile personal (default)
team:      JYO (Jyoti)
project:   none
defaults:  none
viewer:    Ada <ada@example.com>
org:       Acme (acme)
```

`--json` prints one document:

```json
{
  "repository": { "root": "/home/ada/Projects/jyoti", "linked": true },
  "workspace": { "name": "personal", "keySource": "default" },
  "team": { "id": "t1", "key": "JYO", "name": "Jyoti" },
  "project": null,
  "defaults": { "assignee": "me", "labels": ["enhancement"], "priority": "medium" },
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
field is `null` or empty when it is unset.

## Paging lists

`issue list`, `search`, `team list`, `project list` and `label list` return one
page per call. `--limit` sets the page size: 50 by default, 250 at most. A
value above 250 fails before the API call. `--after <cursor>` reads the page
after a cursor.

`--json` prints one page and its page state:

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

Every list is ordered by creation time (`createdAt`). Cursors are bound to the
query: keep the filters and the order fixed across pages. Pages are consistent
while the data does not change, and best effort when it does. `search` keeps
Linear's relevance ranking, so its paging is best effort.

Internal reads always drain every page. Only these list commands return one
page. In particular, `issue show` is complete: it reads every page of an
issue's labels, children, relations, attachments and comments. `--no-comments`
skips the comment pages.

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

`rata workspace list --json` prints one document:

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
one page per call: see **Paging lists**. `--json` prints
`{ "teams": [...], "pageInfo": { "hasNextPage": ..., "endCursor": ... } }`.

`rata team show [<team-ref>]` prints the full read model of a team: the id, key,
name, timezone, every workflow state with its type and position, every label
with its color and scope, the active members and the workspace priorities.
Without a reference it uses the linked team. Without a reference and without a
link it fails with `not_linked`. The command drains every page of states,
labels and members.

```bash
rata team show JYO
rata team show --json
```

`--json` prints one document:

```json
{
  "team": {
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

`--json` prints one stable document:

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

`--json` prints one stable document:

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

`--json` prints one stable document:

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

`--json` prints `{ "projects": [...], "pageInfo": { "hasNextPage": ..., "endCursor": ... } }`
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

`--json` prints one stable document:

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

`--json` prints one stable document:

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
   `rata issue create --title "Switch billing to Stripe" --label ready-for-agent --priority medium --body-file -`.
2. `/to-tickets` creates each ticket as a child of the spec:
   `rata issue create --title "Add the Stripe client" --parent ABC-42 --label ready-for-agent --priority medium --body-file -`.
   Wire the blocking edges between the tickets with
   `rata issue link ABC-44 --blocked-by ABC-43`.
3. `/implement-spec` fetches the whole set one page at a time:
   `rata issue list --parent ABC-42 --limit 250 --json`, then continue with
   `--after <endCursor>` while `pageInfo.hasNextPage` is true.

`issue show <spec-ref> --json` also lists the child issues.

`issue create --project` and `issue list --project` accept a project name or a
UUID. A wayfinding map stays an issue with child issues.

## Labels

`rata label list` prints the labels of the linked team: name, id, color. Pass
`--team <key>` for another team. It returns one page per call: see
**Paging lists**. `--json` prints
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

`create` and `edit` accept `--json`. Both print
`{ "label": { "id": ..., "name": ..., "color": ... } }`. `create` also prints
`"created": true` or `"created": false` when `--if-not-exists` returns an
existing label.

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
notice on stderr.

| Flag          | Meaning                                                                |
| ------------- | ---------------------------------------------------------------------- |
| `--team`      | Team key or id. Searches every stored workspace without `--workspace`. |
| `--project`   | Default project name or id for the repository.                         |
| `--workspace` | Workspace profile. Skips the workspace prompt.                         |
| `--create`    | Create the team when it does not exist. Needs `--team` and `--name`.   |
| `--name`      | Team name, used with `--create`.                                       |
| `--json`      | Print machine-readable JSON.                                           |

A missing team fails with `TeamNotFoundError` unless `--create` is passed.

`link` sets the timezone of the linked team from the machine: the IANA name that
the machine reports. It calls `teamUpdate` only when the timezone differs, and
it reports the change. When the timezone matches, or the machine reports none,
`link` makes no update.

`link` records the workspace profile and the team in the repository config. The
explicit `--workspace` wins. A team found by `--team` records the profile that
holds it. Without a profile, `link` keeps the `workspace` of an existing config.

`--json` prints one stable document with the linked team and the repository
config:

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
rata unlink --json
```

It prints what it removed, for example `Unlinked RAT from this repository.`, and
it exits non-zero when the repository is not linked. `--json` prints one stable
document with the removed team, project and workspace:

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
rata config show --json
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

`config show --json` prints:

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

`rata issue list` accepts filters. Combine any of them. Without `--team`, the
list shows only the linked team's issues; run `rata link` once to set the link:

```bash
rata issue list --team RAT --state "In Progress" --label bug --limit 100
rata issue list --state-type started --assignee me
rata issue list --parent RAT-1 --text login
rata issue list --parent RAT-1 --unblocked --unassigned --sort priority
rata issue list --limit 100 --after <cursor>
rata issue list --priority urgent --sort priority --limit 10
```

| Flag           | Meaning                                                                      |
| -------------- | ---------------------------------------------------------------------------- |
| `--team`       | Team key or id. Default: the team from `rata link`.                          |
| `--state`      | Workflow state name, for example `In Progress`.                              |
| `--state-type` | One of `triage`, `backlog`, `unstarted`, `started`, `completed`, `canceled`. |
| `--priority`   | `none`, `urgent`, `high`, `medium`, `low`, or `0`-`4`.                       |
| `--label`      | Label name.                                                                  |
| `--assignee`   | `me`, or a user id.                                                          |
| `--project`    | Project id or name.                                                          |
| `--parent`     | Parent issue reference.                                                      |
| `--text`       | Text that appears in the title or the description.                           |
| `--unblocked`  | Keep only open issues with no open blocker.                                  |
| `--unassigned` | Keep only issues with no assignee.                                           |
| `--sort`       | `priority` orders urgent first and none last.                                |
| `--limit`      | Page size. Default: 50, maximum: 250.                                        |
| `--after`      | Continue after a cursor from a previous page.                                |

`--priority` keeps issues with exactly one priority value. `none` and `0`
select the issues with no priority. `--sort priority` orders the results
urgent, high, medium, low, then none. The sort fetches every matching issue
across all pages before `--limit` applies. Issues with equal priorities keep
their incoming order. With `--unblocked`, blocked issues are dropped before
the sort.

An open issue is one whose state type is not `completed` or `canceled`. An open
blocker is a blocker whose state type is not `completed` or `canceled`.
`--unblocked` keeps the open issues whose blockers are all closed. It filters
on the server and composes with the other filters with AND, so a state filter
that contradicts it returns an empty list.
`--parent` with `--unblocked` and `--unassigned` is the **frontier** of a map:
the open, unblocked, unclaimed children. With `--sort priority`, the first
result is the most urgent; ties keep their incoming order.

`rata issue show` accepts an identifier (`RAT-42`), a UUID, or a linear.app
URL. `--comments` adds the comments to the human output. `--json` returns the
complete read model in one call: the issue, its comments, children, relations
and attachments. `--no-comments` skips the comment fetch and omits the key.
`--comments` and `--no-comments` are mutually exclusive. Every collection
drains every page.

Each issue carries `updatedAt`, the Linear modification timestamp. It appears
in `issue list`, `issue show`, `search` and every write result that returns an
issue. Pass it to `--if-unchanged` to make a best-effort conditional write
before a body change.

Every read command accepts the global `--json` and prints one stable JSON
document. The list and search commands print one page:
`{ "issues": [...], "pageInfo": { "hasNextPage": ..., "endCursor": ... } }`.
The show command prints `{ "issue": {...} }`, with the comments, children,
relations and attachments.

`rata search "<text>"` searches by text. Without `--team`, the search stays
inside the linked team; pass `--team <key>` for another team. It keeps Linear's
relevance ranking, so the best match stays first and its paging is best effort.
It accepts `--team`, `--limit`, `--after` and `--json`.

```json
{
  "issues": [
    {
      "id": "b2c3...",
      "identifier": "RAT-42",
      "title": "Add the issue read path",
      "url": "https://linear.app/eyenalx/issue/RAT-42/add-the-issue-read-path",
      "state": { "name": "In Progress", "type": "started" },
      "priority": "high",
      "assignee": { "id": "u1", "name": "Ada", "displayName": "ada" },
      "project": { "id": "p1", "name": "rata" },
      "parent": { "id": "i0", "identifier": "RAT-1", "title": "Map" },
      "labels": [{ "id": "l1", "name": "ready-for-agent" }]
    }
  ],
  "pageInfo": { "hasNextPage": true, "endCursor": "b2c3..." }
}
```

`assignee`, `project` and `parent` are `null` when they are unset. `priority`
is one of `urgent`, `high`, `medium`, `low` or `none`; `none` means no priority
is set.

```json
{
  "issue": {
    "id": "b2c3...",
    "identifier": "RAT-42",
    "title": "Add the issue read path",
    "description": "...",
    "url": "https://linear.app/eyenalx/issue/RAT-42/add-the-issue-read-path",
    "state": { "name": "In Progress", "type": "started" },
    "priority": "high",
    "assignee": null,
    "project": null,
    "parent": null,
    "team": { "id": "t1", "key": "RAT", "name": "rata" },
    "labels": [],
    "children": [
      {
        "id": "i2",
        "identifier": "RAT-43",
        "title": "Child issue",
        "state": { "name": "Todo", "type": "unstarted" }
      }
    ],
    "relations": {
      "blocks": [],
      "blockedBy": [],
      "duplicates": [],
      "duplicatedBy": [],
      "related": [],
      "similar": []
    },
    "attachments": [
      {
        "id": "a1",
        "title": "Design doc",
        "subtitle": "Notion",
        "url": "https://example.com/doc",
        "sourceType": "link",
        "createdAt": "2026-01-01T10:00:00.000Z"
      }
    ],
    "comments": []
  }
}
```

`relations.blocks` lists the issues this issue blocks. `relations.blockedBy`
lists the issues that block it. `--json` includes `comments` by default.
`--no-comments` skips the fetch and omits the key. `--comments` and
`--no-comments` are mutually exclusive.

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
JSON is `{ "section": { "heading", "level", "content" } }`, and `--fields`
applies to `section`.

`append` inserts the content at the end of the section, or creates the section
at the end of the description when the heading is missing. `--level` sets the
new heading level (default 2). `replace` replaces the content and keeps the
heading; a missing heading is `not_found`. Both need `--body` or `--body-file`.

`--dry-run` prints a unified diff and writes nothing. `--if-unchanged
<updatedAt>` fails with `conflict` before the write when the issue changed since
that read; the hint names the current value. Linear has no compare-and-swap, so
the check is best effort.

A duplicate heading is an `ambiguous` error that lists the line numbers. A
missing heading read or replace is `not_found` and lists the available headings.

## Writing issues

`rata issue create` needs a team: pass `--team`, or run `rata link` once. The
`project` of the repository config is the default project for `create`. The
repository issue defaults fill the assignee, the labels and the priority. A team
value is a key or a UUID. A project value is a name or a UUID.

```bash
rata issue create --title "Fix login" --team RAT --label ready-for-agent --priority high
rata issue create --title "Add the client" --parent RAT-1 --wait 10
rata issue comment RAT-42 --body "Looks good."
printf 'From a pipe' | rata issue update RAT-42 --body-file -
printf '\nUpdate.' | rata issue update RAT-42 --body-file - --append
rata issue update RAT-42 --state "In Progress" --assignee me
rata issue update RAT-42 --priority high --if-unchanged 2026-01-01T10:00:00.000Z
rata issue section append RAT-42 "Handoff log" --body "Started."
rata issue section replace RAT-42 "Handoff log" --body-file -
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

| Command                                 | Flags                                                                                                                                                                                         |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `issue create`                          | `--title` (required), `--body`, `--body-file`, `--team`, `--label` (repeatable), `--no-default-labels`, `--parent`, `--project`, `--state`, `--assignee`, `--priority`, `--wait`, `--dry-run` |
| `issue comment <ref>`                   | `--body`, `--body-file` (one is required), `--wait`                                                                                                                                           |
| `issue update <ref>`                    | `--title`, `--body`, `--body-file`, `--append`, `--state`, `--assignee`, `--project`, `--parent`, `--priority`, `--dry-run`, `--if-unchanged`                                                 |
| `issue section get <ref> <heading>`     | `--with-heading`                                                                                                                                                                              |
| `issue section append <ref> <heading>`  | `--body`, `--body-file` (one is required), `--level`, `--dry-run`, `--if-unchanged`                                                                                                           |
| `issue section replace <ref> <heading>` | `--body`, `--body-file` (one is required), `--dry-run`, `--if-unchanged`                                                                                                                      |
| `issue label add [<ref>] <label...>`    | label names, `--parent`, `--dry-run`                                                                                                                                                          |
| `issue label remove [<ref>] <label...>` | label names, `--parent`, `--dry-run`                                                                                                                                                          |
| `issue close <ref>`                     | `--comment`, `--comment-file`                                                                                                                                                                 |
| `issue reopen <ref>`                    |                                                                                                                                                                                               |
| `issue assign [<ref>]`                  | `--assignee` (required): `me`, a user id, or `none`; `--parent`, `--dry-run`                                                                                                                  |
| `issue unassign <ref>`                  | `--dry-run`                                                                                                                                                                                   |
| `issue link <ref>`                      | `--blocks`, `--blocked-by`, `--related`, `--duplicate` (each repeatable), `--dry-run`                                                                                                         |
| `issue unlink <ref>`                    | the same relation flags and `--dry-run`                                                                                                                                                       |

Linear has one `blocks` relation. `link --blocks X` records that the issue blocks
X. `link --blocked-by X` records the same relation in the inverse direction: X
blocks the issue. `--duplicate X` means the issue duplicates X. `--related X`
links the two issues with no direction. Repeat a flag to link several issues at
once. `unlink` removes the relation that the matching flag recorded. A missing
relation is a skipped success, not an error.

`--assignee none` clears the assignee. `issue unassign` is the same write with
less typing. `--assignee me` resolves the viewer.

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
writes. The command exits 1 when any result failed.

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
remove` with an absent label, and `issue close` when the state is already
`completed`. A `canceled` issue still moves to a completed state. `issue close`
with a comment still posts the comment when the issue is already completed; the
state write is skipped. `issue create` and `issue comment` always create a new
object.

`label create --if-not-exists` returns the existing label with `created: false`.

### Read-after-write

Linear documents no read-after-write guarantee. A comment or a child issue that a
write just created can be missing from a later read. `issue comment` and
`issue create --parent` therefore check that the new object appears on a bounded
re-read.

The check waits 5 seconds by default. `--wait <seconds>` changes the bound and
`--wait 0` disables it. A write that never appears exits 0: the mutation payload
is the source of truth. JSON reports `"visible": false` and human mode prints a
warning to stderr. `"visible"` is `null` when the check is disabled and on
`issue create` without `--parent`.

```bash
rata issue comment RAT-42 --body "Looks good." --wait 10
rata issue create --title "Add the client" --parent RAT-1 --wait 0
```

### Dry runs

`--dry-run` resolves the targets and prints the actions without calling a
mutation. It is available on `issue create`, `issue update`,
`issue section append`, `issue section replace`, `issue link`, `issue unlink`,
`issue assign`, `issue unassign`, `issue label add`, `issue label remove`,
`config set` and `config unset`. It is not available on `issue close`,
`issue reopen` or `issue comment`.

```bash
rata issue create --title "Fix login" --dry-run
rata issue assign RAT-42 --assignee me --dry-run
rata config set --label enhancement --dry-run --json
```

`--json` prints `{ "dryRun": true, "actions": [...] }`. Each action carries the
command action, the target and the changes. The issue writes also carry the
status they would reach.

`--body-file -` and `--comment-file -` read the body from standard input. The
`--body` and `--body-file` flags are mutually exclusive, as are `--comment` and
`--comment-file`. The bodies are markdown.

`--assignee me` resolves the viewer. `--state` matches a workflow state name.
`--priority` accepts `none`, `urgent`, `high`, `medium`, `low`, or `0`-`4`.
`issue close` moves the issue to a state of type `completed`; `issue reopen`
moves it to a state of type `unstarted`. The CLI never hard-codes a state id.

The triage roles are label names. `issue label add RAT-42 ready-for-agent` adds
the `ready-for-agent` label. A label name resolves against the team labels and
the workspace labels, ignoring case. `issue label remove` resolves the same way.

Every write command accepts the global `--json`. The update and reopen commands
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
    "labels": []
  }
}
```

`issue create` wraps the same issue and adds `visible`:
`{ "issue": { ... }, "visible": true }`. `visible` is `false` when the parent
does not show the new child before the bound, and `null` without `--parent`.

The idempotent writes add the outcome: `issue close`, `issue assign`,
`issue unassign`, `issue label add` and `issue label remove` print
`{ "dryRun": false, "status": "updated", "issue": { ... } }`. `status` is
`skipped` when the desired state already held.

The comment command prints the comment and its visibility:

```json
{
  "comment": {
    "id": "c1",
    "body": "Looks good.",
    "createdAt": "2026-01-01T10:00:00.000Z",
    "user": { "id": "u1", "name": "Ada", "displayName": "ada" }
  },
  "visible": true
}
```

`visible` is `false` when the comment does not appear before the bound, and
`null` with `--wait 0`.

The link and unlink commands print the relations they changed, with a
`skipped` entry for a relation that already held the desired state:

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

## Documentation

- `GLOSSARY.md`: the domain vocabulary.
- `docs/agents/issue-tracker.md`: how the ask-matt skills use this tracker.
- `docs/agents/triage-labels.md`: the triage roles and their label strings.
- `docs/agents/domain.md`: how the skills consume the domain documentation.
- `AGENTS.md`: how to work in this repository.

## License

MIT
