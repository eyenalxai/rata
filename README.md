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

## Documentation

- `CONTEXT.md`: the domain vocabulary.
- `docs/agents/issue-tracker.md`: how the ask-matt skills use this tracker.
- `AGENTS.md`: how to work in this repository.

## License

MIT
