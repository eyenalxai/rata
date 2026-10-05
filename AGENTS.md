# rata

A Linear issue-tracking CLI built for agent workflows. It gives the `ask-matt`
engineering skills a Linear-backed issue tracker: triage, tickets, specs and
wayfinding. `README.md` documents the product; `CONTEXT.md` holds the domain
vocabulary.

## Working agreement

- **Use subagents as much as possible.** Split independent tasks across
  subagents and run them in parallel. Do not serialize work that can run at the
  same time.
- **Change code in a rift.** `rift create --name <change>` makes the worktree
  and the `rift/<change>` branch. One rift per change. Commit the work there.
  When it is ready, rebase the rift onto `main`, bring the rift back into `main`
  with a fast-forward, then push. Never make a merge commit.
- **No backwards compatibility.** Refactor when the long-term design needs it.
  Optimize for long-term maintenance and follow best practice.
- **Use Bun** for every command and script.
- **Place each file where it belongs.** Follow the existing folder structure.
- **Read the source before you guess an API.** Search these checkouts:

| Library                       | Path                               |
| ----------------------------- | ---------------------------------- |
| Effect source                 | `~/Projects/other/effect`          |
| Effect docs                   | `~/Projects/other/effect-docs`     |
| Linear SDK and GraphQL schema | `~/Projects/other/linear`          |
| oxlint and oxfmt source       | `~/Projects/other/oxc`             |
| Browser control               | `~/Projects/other/browser-control` |

## Commands

```bash
bun install
bun run check          # format check, type-aware oxlint, tsc and tests
bun run rata -- --help # run the CLI from source
bun link               # install the `rata` binary from this checkout
```

## Layout

| Path           | Responsibility                                              |
| -------------- | ----------------------------------------------------------- |
| `src/main.ts`  | The `rata` binary entry point and the root command.         |
| `src/cli/`     | One module per command group. Parsing, output, exit codes.  |
| `src/api/`     | The Linear GraphQL client and its typed operations.         |
| `src/domain/`  | Schemas and pure logic: issue references, frontier, labels. |
| `src/config/`  | Auth and repository configuration.                          |
| `src/matt/`    | Tracker documents for the `ask-matt` engineering skills.    |
| `test/`        | Behaviour tests for the tricky logic.                       |
| `docs/agents/` | Skill configuration: tracker, triage labels, domain docs.   |

## Wizards

Setup wizards are ephemeral. Build them under `/tmp/opencode`, run them once,
then delete them. Never commit a wizard to this repository. They follow the
`/wizard` skill and these rules:

- Capture values with visible prompts. Never use hidden input.
- Save every captured secret to the maintainer's 1Password: the `op` CLI, vault
  `Private`, an item named after the tool, category `API Credential`, field
  `credential`.
- Pass secrets to `op` through a JSON template on stdin, never as command
  arguments.
- Tell the human exactly what to do. Do not automate their browser.

## Non-negotiables

- **No barrel files and no re-exports.** `oxc/no-barrel-file` is an error.
- **No default exports.** `import/no-default-export` is an error.
- **Named exports only**, grouped in one export block at the bottom of the file.
- **No relative parent imports.** `import/no-relative-parent-imports` is an error.
  Import through the `@/*` alias, which maps to `src/*`.
- **Do not suppress lint rules unless it is absolutely justified.** Fix the code
  first. Every suppression is a config-level decision with a written reason, and
  every one is surfaced to the maintainer.
- **Never suppress an error** unless the maintainer explicitly allows it. Do not
  swallow a failure.
- **Never access `process.env`.** `node/no-process-env` is an error. Read config
  through Effect `Config`.
- **Do not write to `console`.** `no-console` is an error. Use the Effect
  `Console` service for output.
- **No comments** unless they answer a hard "why is it this way?" question.
- **Write documentation and comments in Simplified Technical English**: short
  sentences, active voice, one term for one concept.
- **Tests are welcome when they are meaningful.** Cover real behaviour and
  failure modes. Never add a test just to raise a number.
- **Keep the docs in step.** A change to commands, flags or behaviour updates
  `README.md`, the CLI help text, and `docs/agents/issue-tracker.md` when the
  tracker workflow changes.

## Effect (v4, pinned)

The repository runs Effect 4 stable. Before you write Effect code, read
`node_modules/effect/AGENTS.md` completely, and search `node_modules/effect/src`
for the exact API.

- Services: `Context.Service<Self, Shape>()("rata/…")` with
  `static readonly layer = Layer.effect(Self, Effect.gen(...))` returning
  `Self.of({ ... })`.
- Service methods and reusable effects: `Effect.fn("Domain.operation")`.
- Errors: `Schema.TaggedError`.
- Records: `Schema.Struct(...)` with a same-name type alias for its decoded type.
- Runtime configuration goes through `Config`, never `process.env`.

## Agent skills

### Issue tracker

Issues live in GitHub Issues on `eyenalxai/rata`, driven with the `gh` CLI. See
`docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`,
`ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: vocabulary in `CONTEXT.md`, decisions in `docs/adr/`. See
`docs/agents/domain.md`.
