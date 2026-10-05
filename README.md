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
rata label ensure --team RAT             # create the canonical labels the team misses
rata init                                # configure this repository for the Linear tracker
rata link --team RAT                     # bind this repository to a Linear team
rata issue list                          # list issues
rata issue list --parent RAT-1 --unblocked --unassigned  # the frontier of a map
rata issue show RAT-42                   # read one issue
rata search "rate limit"                 # search issues by text
rata issue create --title "Fix login" --team RAT   # create an issue
rata issue link RAT-43 --blocked-by RAT-42         # RAT-43 waits for RAT-42
rata issue comment RAT-42 --body "..."   # comment on an issue
rata issue close RAT-42 --comment "..."  # close an issue
```

Every command selects the API key in this order: `LINEAR_API_KEY`, the
repository `workspace` from `.rata.json`, the `default` profile.

`label ensure` installs the canonical labels — the five triage state roles, the
`bug` and `enhancement` categories and the `wayfinder:*` labels — and reports
what it created and what already existed. A canonical name counts as existing
when a team label or a workspace label matches it, ignoring case. `label ensure`
creates only the true misses, as team labels.

`rata --help` lists every command.

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
2. The `workspace` named in `.rata.json`, recorded by
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
consult `LINEAR_API_KEY` or `.rata.json`. `rata auth logout` without
`--workspace` removes the `default` profile. When the removed profile was the
default and other profiles remain, no profile is the default. Later commands
fail with ``No default workspace. Run `rata workspace use <name>`.`` Run
`rata workspace use <name>` to select one.

## Teams

`rata team list` prints the teams in the workspace: key, name, id.

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

| Flag            | Meaning                                                       |
| --------------- | ------------------------------------------------------------- |
| `--name`        | Project name. Required.                                       |
| `--team`        | Team key or id. Repeat for more teams. Default: `.rata.json`. |
| `--description` | Project description.                                          |

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

`rata project list` prints the name, state, progress and id of every project:

```bash
rata project list
```

`--json` prints `{ "projects": [...] }` with the same fields. `progress` is the
fraction of the project's issues that are done, between 0 and 1.

### Specs as projects

The ask-matt skills group a spec with its tickets in one project:

1. `/to-spec` creates a project named after the spec, then creates the spec
   issue in that project:
   `rata project create --name "Spec: login"` and
   `rata issue create --title "Spec: login" --project "Spec: login" --body-file -`.
2. `/to-tickets` creates each ticket in the same project:
   `rata issue create --title "Add the form" --project "Spec: login" --label ready-for-agent --body-file -`.
3. `/implement-spec` fetches the whole set:
   `rata issue list --project "Spec: login" --json`.

`issue create --project` and `issue list --project` accept a project name or a
UUID. A project groups specs; a wayfinding map stays an issue with child issues.

## Repository setup

`rata init` configures a repository for the Linear tracker:

```bash
rata init --team RAT --project rata
```

It writes `.rata.json`, installs `docs/agents/issue-tracker.md`,
`docs/agents/triage-labels.md` and `docs/agents/domain.md`, and updates the
`## Agent skills` block in `AGENTS.md`. Missing files are created. Existing
files are left alone unless `--force` is passed.

| Flag              | Meaning                                                    |
| ----------------- | ---------------------------------------------------------- |
| `--team`          | Default team key. Required unless `.rata.json` has a team. |
| `--project`       | Default project name for the repository.                   |
| `--ensure-labels` | Create the canonical labels in the team.                   |
| `--print`         | Print the tracker document and write nothing.              |
| `--force`         | Overwrite existing files.                                  |

`rata init --print` prints the tracker document, so you can review it before
`rata init` writes it.

## Linking a repository

`rata link` binds this repository to a Linear team:

```bash
rata link --team RAT --project rata
rata link --team SCR --create --name "Scratch"
```

Without `--team`, `link` lists the workspace teams and prompts for one. The
prompt needs a terminal; pass `--team` when standard input is a pipe.

`link` writes `.rata.json`, installs `docs/agents/issue-tracker.md`,
`docs/agents/triage-labels.md` and `docs/agents/domain.md`, updates the
`## Agent skills` block in `AGENTS.md`, and creates the canonical labels in the
team, so the ask-matt skills work in the repository. The link itself always
rewrites `.rata.json`. The agent documents and `AGENTS.md` are created when
missing and left alone unless `--force` is passed.

| Flag          | Meaning                                                              |
| ------------- | -------------------------------------------------------------------- |
| `--team`      | Team key or id. Required unless standard input is a terminal.        |
| `--project`   | Default project name or id for the repository.                       |
| `--workspace` | Workspace profile for this repository.                               |
| `--create`    | Create the team when it does not exist. Needs `--team` and `--name`. |
| `--name`      | Team name, used with `--create`.                                     |
| `--force`     | Overwrite the existing agent documents and `AGENTS.md`.              |
| `--json`      | Print machine-readable JSON.                                         |

A missing team fails with `TeamNotFoundError` unless `--create` is passed.

`link` sets the timezone of the linked team from the machine: the IANA name that
the machine reports. It calls `teamUpdate` only when the timezone differs, and
it reports the change. When the timezone matches, or the machine reports none,
`link` makes no update.

`--workspace` records the profile in the repository config. Without it, `link`
keeps the `workspace` of an existing config.

`--json` prints one stable document with the linked team, the repository config
and the files:

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
  "timezone": { "previous": "America/Los_Angeles", "current": "Europe/Amsterdam" },
  "files": [
    { "path": ".rata.json", "action": "create" },
    { "path": "docs/agents/issue-tracker.md", "action": "create" },
    { "path": "docs/agents/triage-labels.md", "action": "create" },
    { "path": "docs/agents/domain.md", "action": "create" },
    { "path": "AGENTS.md", "action": "create" }
  ],
  "labels": {
    "created": [],
    "existing": []
  }
}
```

`project` is `null` when no project is recorded. `workspace` is `null` when no
profile is recorded. `timezone` holds the previous and current IANA names when
`link` changed the team timezone, and `null` otherwise. Each file action is
`create`, `overwrite`, `unchanged` or `skip`.

## Reading issues

`rata issue list` accepts filters. Combine any of them:

```bash
rata issue list --team RAT --state "In Progress" --label bug --limit 100
rata issue list --state-type started --assignee me
rata issue list --parent RAT-1 --text login
rata issue list --parent RAT-1 --unblocked --unassigned
```

| Flag           | Meaning                                                                      |
| -------------- | ---------------------------------------------------------------------------- |
| `--team`       | Team key or id.                                                              |
| `--state`      | Workflow state name, for example `In Progress`.                              |
| `--state-type` | One of `triage`, `backlog`, `unstarted`, `started`, `completed`, `canceled`. |
| `--label`      | Label name.                                                                  |
| `--assignee`   | `me`, or a user id.                                                          |
| `--project`    | Project id or name.                                                          |
| `--parent`     | Parent issue reference.                                                      |
| `--text`       | Text that appears in the title or the description.                           |
| `--unblocked`  | Keep only open issues with no open blocker.                                  |
| `--unassigned` | Keep only issues with no assignee.                                           |
| `--limit`      | Maximum number of issues. Default: 50.                                       |

An open issue is one whose state type is not `completed` or `canceled`. An open
blocker is a blocker whose state type is not `completed` or `canceled`.
`--unblocked` keeps the open issues whose blockers are all closed.
`--parent` with `--unblocked` and `--unassigned` is the **frontier** of a map:
the open, unblocked, unclaimed children.

`rata issue show` accepts an identifier (`RAT-42`), a UUID, or a linear.app
URL. `--comments` adds the comments in chronological order.

Every read command accepts `--json` and prints one stable JSON document. The
list and search commands print `{ "issues": [...] }`; the show command prints
`{ "issue": {...} }`.

```json
{
  "issues": [
    {
      "id": "b2c3...",
      "identifier": "RAT-42",
      "title": "Add the issue read path",
      "url": "https://linear.app/eyenalx/issue/RAT-42/add-the-issue-read-path",
      "state": { "name": "In Progress", "type": "started" },
      "assignee": { "id": "u1", "name": "Ada", "displayName": "ada" },
      "project": { "id": "p1", "name": "rata" },
      "parent": { "id": "i0", "identifier": "RAT-1", "title": "Map" },
      "labels": [{ "id": "l1", "name": "ready-for-agent" }]
    }
  ]
}
```

`assignee`, `project` and `parent` are `null` when they are unset.

```json
{
  "issue": {
    "id": "b2c3...",
    "identifier": "RAT-42",
    "title": "Add the issue read path",
    "description": "...",
    "url": "https://linear.app/eyenalx/issue/RAT-42/add-the-issue-read-path",
    "state": { "name": "In Progress", "type": "started" },
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

`rata issue create` needs a team: pass `--team`, or set `team` in
`.rata.json`. The `project` field in `.rata.json` is the default project for
`create`. A team value is a key or a UUID. A project value is a name or a UUID.

```bash
rata issue create --title "Fix login" --team RAT --label ready-for-agent --priority high
rata issue comment RAT-42 --body "Looks good."
printf 'From a pipe' | rata issue update RAT-42 --body-file -
rata issue update RAT-42 --state "In Progress" --assignee me
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
| `issue update <ref>`                  | `--title`, `--body`, `--body-file`, `--state`, `--assignee`, `--project`, `--parent`                                                            |
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
