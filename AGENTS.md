# rata

A Linear issue-tracking CLI built for agent workflows. It gives the `ask-matt`
engineering skills a Linear-backed issue tracker: triage, tickets, specs and
wayfinding. `README.md` documents the product; `GLOSSARY.md` holds the domain
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
| Drizzle ORM and drizzle-kit   | `~/Projects/other/drizzle-orm`     |
| Linear SDK and GraphQL schema | `~/Projects/other/linear`          |
| oxlint and oxfmt source       | `~/Projects/other/oxc`             |
| Bun source                    | `~/Projects/other/bun`             |
| Rift worktree tool            | `~/Projects/other/rift`            |
| Agent skills CLI              | `~/Projects/other/vercel-skills`   |
| Railway CLI (link prior art)  | `~/Projects/other/railway-cli`     |
| yadm (dotfiles manager)       | `~/Projects/other/yadm`            |
| Browser control               | `~/Projects/other/browser-control` |

## Commands

```bash
bun install
bun run check          # format check, type-aware oxlint, tsc and tests
bun run rata -- --help # run the CLI from source
bun install -g .       # install the `rata` binary globally
```

## Releases

A release is not done until the Arch package tracks it. The full checklist:

1. Bump `version` in `package.json` and the version in `src/main.ts`, then land
   it on `main`.
2. Tag `v<version>` and push it: `git tag -a v0.2.0 -m "rata v0.2.0"`,
   `git push origin v0.2.0`.
3. Create the GitHub release: `gh release create v0.2.0 --title v0.2.0 --notes "..."`.
4. Update `~/Projects/other/pkgbuilds/rata`: set `pkgver`, refresh
   `sha256sums` (`makepkg -g`), regenerate `.SRCINFO`
   (`makepkg --printsrcinfo > .SRCINFO`), and rebuild with `makepkg -f` to
   prove the tag builds.
5. Commit and push the package via yadm, to both remotes:
   `yadm add Projects/other/pkgbuilds/rata && yadm commit -m "feat(pkgbuild/rata): update to <version>" && yadm push && yadm push gitlab main`.
6. Refresh the installed agent skill: `bunx skills@latest update rata -g -y`.

`nvchecker -c .nvchecker.toml` in the package directory reports the next
upstream version.

## Layout

| Path           | Responsibility                                                    |
| -------------- | ----------------------------------------------------------------- |
| `src/main.ts`  | The `rata` binary entry point and the root command.               |
| `src/cli/`     | One module per command group. Parsing, output, exit codes.        |
| `src/api/`     | The Linear GraphQL client and its typed operations.               |
| `src/domain/`  | Pure logic: references, labels, priorities, prompts, timezones.   |
| `src/config/`  | Auth and repository configuration.                                |
| `src/db/`      | The local SQLite store: Drizzle schema and the database service.  |
| `drizzle/`     | Committed Drizzle migrations.                                     |
| `test/`        | Behaviour tests for the tricky logic.                             |
| `skills/`      | Agent skills for driving rata, installable with `npx skills add`. |
| `docs/agents/` | Skill configuration: tracker, triage labels, domain docs.         |

## File naming

- Never repeat a shared leading prefix across sibling files. When two or more files in one directory share a leading hyphenated prefix, group them into a directory named after that prefix and drop the prefix from the filenames: `company-admin-options.ts` and `company-member-access.ts` become `company/admin-options.ts` and `company/member-access.ts`.
- Stacked prefixes collapse the same way, one directory per prefix segment: `advertisement-lead-chat-inbox-rows.ts` becomes `advertisement/lead/chat/inbox/rows.ts`.
- When the directory already names the concept (singular or plural), drop the redundant prefix in place: `companies/company-card.tsx` becomes `companies/card.tsx`.
- A file named exactly after the prefix (or its plural) stays as the entry file next to the group directory: `schedule.ts` next to `schedule/`.
- Cross-directory imports use the `@/*` alias; parent-relative imports are lint errors.

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
- **Test only super-tricky logic.** Write a test when a subtle bug would slip
  past manual checking: parsing edge cases, retries and error mapping, filter
  composition, idempotency, string surgery. Never test wiring, pass-through, or
  trivial behavior. Delete a test that stops earning its keep.
- **Keep the docs in step.** A change to commands, flags or behaviour updates
  `README.md`, the CLI help text, and `docs/agents/issue-tracker.md` when the
  tracker workflow changes.
- **All database migrations go through Drizzle, including custom ones.** Create
  every migration with `drizzle-kit generate`. Write hand-written SQL migrations
  with `drizzle-kit generate --custom`. Apply migrations only through Drizzle's
  migrator, which runs when the database opens. Never run ad-hoc DDL or edit the
  database by hand.

## Effect (v4, pinned)

The repository runs Effect 4 stable. Before you write Effect code, read
`node_modules/effect/AGENTS.md` completely, and search `node_modules/effect/src`
for the exact API.

- Services: `Context.Service<Self, Shape>()("rata-cli/<path>")` with
  `static readonly layer = Layer.effect(Self, Effect.gen(...))` returning
  `Self.of({ ... })`. The ID starts with the package name and then the service
  path, for example `rata-cli/config/auth` and `rata-cli/api/client/LinearClient`.
  The `effecttsgo/deterministic-keys` rule enforces this shape.
- Service methods and reusable effects: `Effect.fn("Domain.operation")`.
- Errors: `Schema.TaggedError`.
- Records: `Schema.Struct(...)` with a same-name type alias for its decoded type.
- Runtime configuration goes through `Config`, never `process.env`.

## Skills

The repository ships agent skills under `skills/`. Install them into an agent
with `npx skills add eyenalxai/rata`. Keep them in step with the command
surface.

## Agent skills

### Issue tracker

Issues live in Linear, driven with the `rata` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary: `needs-triage`, `needs-info`,
`ready-for-agent`, `ready-for-human`, `wontfix`. See
`docs/agents/triage-labels.md`.

### Domain docs

Single-context: vocabulary in `GLOSSARY.md`, decisions in `docs/adr/`. See
`docs/agents/domain.md`.
