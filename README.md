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
rata init                                # configure this repository for the Linear tracker
rata issue list                          # list issues
rata issue show RAT-42                   # read one issue
```

`rata` reads `LINEAR_API_KEY` from the environment when it is set. Otherwise it
reads the key stored by `rata auth login --with-token`.

`rata --help` lists every command.

## Documentation

- `CONTEXT.md`: the domain vocabulary.
- `docs/agents/issue-tracker.md`: how the ask-matt skills use this tracker.
- `AGENTS.md`: how to work in this repository.

## License

MIT
