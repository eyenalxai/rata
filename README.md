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

```bash
bun install -g rata-cli
```

Or from a checkout:

```bash
bun install
bun link
```

## Usage

```bash
pbpaste | rata auth login --with-token   # store a Linear API key
rata team list                           # list teams: key, name, id
rata project list                        # list projects
rata label list --team RAT               # list a team's labels
rata label ensure --team RAT             # create the canonical labels the team misses
rata init                                # configure this repository for the Linear tracker
rata issue list                          # list issues
rata issue show RAT-42                   # read one issue
rata search "rate limit"                 # search issues by text
rata issue create --title "Fix login" --team RAT   # create an issue
rata issue comment RAT-42 --body "..."   # comment on an issue
rata issue close RAT-42 --comment "..."  # close an issue
```

`rata` reads `LINEAR_API_KEY` from the environment when it is set. Otherwise it
reads the key stored by `rata auth login --with-token`.

`label ensure` installs the canonical labels — the five triage roles and the
`wayfinder:*` labels — and reports what it created and what already existed.

`rata --help` lists every command.

## Repository setup

`rata init` configures a repository for the Linear tracker:

```bash
rata init --team RAT --project rata
```

It writes `.rata.json`, installs `docs/agents/issue-tracker.md`, and updates the
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

## Reading issues

`rata issue list` accepts filters. Combine any of them:

```bash
rata issue list --team RAT --state "In Progress" --label bug --limit 100
rata issue list --state-type started --assignee me
rata issue list --parent RAT-1 --text login
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
| `--limit`      | Maximum number of issues. Default: 50.                                       |

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

`--body-file -` and `--comment-file -` read the body from standard input. The
`--body` and `--body-file` flags are mutually exclusive, as are `--comment` and
`--comment-file`. The bodies are markdown.

`--assignee me` resolves the viewer. `--state` matches a workflow state name.
`--priority` accepts `none`, `urgent`, `high`, `medium`, `low`, or `0`-`4`.
`issue close` moves the issue to a state of type `completed`; `issue reopen`
moves it to a state of type `unstarted`. The CLI never hard-codes a state id.

The triage roles are label names. `issue label add RAT-42 ready-for-agent` adds
the `ready-for-agent` label of the issue's team.

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

## Documentation

- `CONTEXT.md`: the domain vocabulary.
- `docs/agents/issue-tracker.md`: how the ask-matt skills use this tracker.
- `AGENTS.md`: how to work in this repository.

## License

MIT
