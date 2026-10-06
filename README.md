# rata

Linear issue tracking for agent workflows.

`rata` is a command-line client for [Linear](https://linear.app) that gives the
[ask-matt](https://github.com/mattpocock/skills) engineering skills a
Linear-backed issue tracker: triage, tracer-bullet tickets, specs and
wayfinding maps. It is built for machines first: every command has a stable
machine-readable form, issue references accept identifiers, UUIDs and URLs, and
the output is deterministic.

The project is in early development. The tracker workflow itself is the first
user: this repository starts on GitHub issues and moves to Linear as soon as
`rata` can run the workflow.

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
rata team list                           # list teams: key, name, id
rata team create --name "Scratch" --key SCR   # create a team
rata team delete SCR --yes               # delete a team
rata project list                        # list projects: name, state, progress, id
rata project create --name "Spec: login" --team RAT   # create a project
rata label list --team RAT               # list a team's labels
rata link --team RAT                     # bind this repository to a Linear team
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
issue's labels, children, relations and comments.

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

The auth file is `$XDG_CONFIG_HOME/rata/auth.json`, or
`~/.config/rata/auth.json` when `XDG_CONFIG_HOME` is unset. It has mode 0600:

```json
{
  "default": "work",
  "workspaces": {
    "default": { "apiKey": "lin_api_..." },
    "work": { "apiKey": "lin_api_..." }
  }
}
```

A file written by an earlier version, `{ "apiKey": "lin_api_..." }`, reads as
the `default` profile and is rewritten in the new shape on the next write.

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
rata project create --name "Spec: login" --team RAT
rata project create --name "Spec: login" --team RAT --team OPS --description "The login spec."
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
    "name": "Spec: login",
    "progress": 0.25,
    "status": { "name": "Started" }
  }
}
```

`rata project list` prints the name, state, progress and id of one page of
projects:

```bash
rata project list
```

`--json` prints `{ "projects": [...], "pageInfo": { "hasNextPage": ..., "endCursor": ... } }`
with the same fields. `--limit` and `--after` page the list; see **Paging
lists**. `progress` is the fraction of the project's issues that are done,
between 0 and 1.

### Specs as projects

The ask-matt skills group a spec with its tickets in one project:

1. `/to-spec` creates a project named after the spec, then creates the spec
   issue in that project:
   `rata project create --name "Spec: login"` and
   `rata issue create --title "Spec: login" --project "Spec: login" --body-file -`.
2. `/to-tickets` creates each ticket in the same project:
   `rata issue create --title "Add the form" --project "Spec: login" --label ready-for-agent --body-file -`.
3. `/implement-spec` fetches the whole set one page at a time:
   `rata issue list --project "Spec: login" --limit 250 --json`, then continue
   with `--after <endCursor>` while `pageInfo.hasNextPage` is true.

`issue create --project` and `issue list --project` accept a project name or a
UUID. A project groups specs; a wayfinding map stays an issue with child issues.

## Labels

`rata label list --team RAT` prints the labels of a team: name, id. It returns
one page per call: see **Paging lists**. `--json` prints
`{ "labels": [...], "pageInfo": { "hasNextPage": ..., "endCursor": ... } }`.

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

## Reading issues

`rata issue list` accepts filters. Combine any of them:

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
| `--team`       | Team key or id.                                                              |
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
URL. `--comments` adds the comments in chronological order. A detail view is
complete: `show` reads every page of the issue's labels, children, relations
and comments.

Every read command accepts `--json` and prints one stable JSON document. The
list and search commands print one page:
`{ "issues": [...], "pageInfo": { "hasNextPage": ..., "endCursor": ... } }`.
The show command prints `{ "issue": {...} }`.

`rata search "<text>"` searches by text. It keeps Linear's relevance ranking,
so the best match stays first and its paging is best effort. It accepts
`--limit`, `--after` and `--json`.

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
    "comments": []
  }
}
```

`relations.blocks` lists the issues this issue blocks. `relations.blockedBy`
lists the issues that block it. The `comments` key is present only with
`--comments`.

## Writing issues

`rata issue create` needs a team: pass `--team`, or run `rata link` once. The
`project` of the repository config is the default project for `create`. A team
value is a key or a UUID. A project value is a name or a UUID.

```bash
rata issue create --title "Fix login" --team RAT --label ready-for-agent --priority high
rata issue comment RAT-42 --body "Looks good."
printf 'From a pipe' | rata issue update RAT-42 --body-file -
rata issue update RAT-42 --state "In Progress" --assignee me
rata issue update RAT-42 --priority high
rata issue label add RAT-42 ready-for-agent bug
rata issue label remove RAT-42 needs-triage
rata issue close RAT-42 --comment "Done in PR #12"
rata issue reopen RAT-42
rata issue assign me RAT-42
rata issue unassign RAT-42
rata issue link RAT-43 --blocked-by RAT-42
rata issue link RAT-42 --blocks RAT-43 --related RAT-44
rata issue unlink RAT-43 --blocked-by RAT-42
```

| Command                               | Flags                                                                                                                                           |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `issue create`                        | `--title` (required), `--body`, `--body-file`, `--team`, `--label` (repeatable), `--parent`, `--project`, `--state`, `--assignee`, `--priority` |
| `issue comment <ref>`                 | `--body`, `--body-file` (one is required)                                                                                                       |
| `issue update <ref>`                  | `--title`, `--body`, `--body-file`, `--state`, `--assignee`, `--project`, `--parent`, `--priority`                                              |
| `issue label add <ref> <label...>`    | label names                                                                                                                                     |
| `issue label remove <ref> <label...>` | label names                                                                                                                                     |
| `issue close <ref>`                   | `--comment`, `--comment-file`                                                                                                                   |
| `issue reopen <ref>`                  |                                                                                                                                                 |
| `issue assign me <ref>`               | `me` or a user id                                                                                                                               |
| `issue unassign <ref>`                |                                                                                                                                                 |
| `issue link <ref>`                    | `--blocks`, `--blocked-by`, `--related`, `--duplicate` (each repeatable)                                                                        |
| `issue unlink <ref>`                  | the same relation flags                                                                                                                         |

Linear has one `blocks` relation. `link --blocks X` records that the issue blocks
X. `link --blocked-by X` records the same relation in the inverse direction: X
blocks the issue. `--duplicate X` means the issue duplicates X. `--related X`
links the two issues with no direction. Repeat a flag to link several issues at
once. `unlink` removes the relation that the matching flag recorded; a missing
relation is an error.

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

Every write command accepts `--json`. The create, update, close, reopen,
assign, unassign and label commands print the summary shape:

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

The comment command prints:

```json
{
  "comment": {
    "id": "c1",
    "body": "Looks good.",
    "createdAt": "2026-01-01T10:00:00.000Z",
    "user": { "id": "u1", "name": "Ada", "displayName": "ada" }
  }
}
```

The link and unlink commands print the relations they changed:

```json
{
  "relations": [{ "action": "created", "kind": "blockedBy", "target": "RAT-42" }]
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
