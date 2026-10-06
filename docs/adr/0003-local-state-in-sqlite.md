# ADR-0003: Local state lives in one SQLite database

## Status

Accepted.

## Context

Rata kept local state in two JSON files: `.rata.json` in the working tree for
the repository config, and `auth.json` in the config directory for the API keys.
The repository file sat with the code, so it was easy to commit, review and
share. Rata did not find it from a subdirectory, and a fresh worktree needed its
own copy. Neither file had a schema history, so the shapes could not evolve.

## Decision

Rata keeps all local state in one SQLite database at
`$XDG_DATA_HOME/rata/rata.sqlite`, or `~/.local/share/rata/rata.sqlite` when
`XDG_DATA_HOME` is unset. The database holds the workspace profiles and the
repository configs. Drizzle ORM defines the schema. Drizzle migrations create
and upgrade the database, and rata applies pending migrations when a command
opens it.

A repository config names a team, a project and a workspace profile. The
repository root identifies the config. Inside Git the root is the Git common
directory, so the main checkout and every worktree share one config. Outside Git
the root is the directory where `rata link` ran. Rata walks up from the current
directory to find the config.

On first use, rata imports an existing `.rata.json` or `auth.json` into the
database, deletes the file and prints one notice on stderr. A database row wins
over a legacy file.

Rejected alternatives: keeping the repository file with the code (personal
settings do not belong in the working tree, and every worktree needs a copy) and
storing profiles and repository configs in separate files (two formats and two
migration paths).

## Consequences

- Rata never writes a configuration file into a repository.
- One schema history serves the profiles and the repository configs. Every
  schema change is a Drizzle migration.
- The database holds the API keys, so rata keeps it private: mode 0600 inside a
  directory with mode 0700.
- `XDG_DATA_HOME` decides where the state lives.
- Deleting the database resets all local state. The user runs `rata auth login`
  and `rata link` again.
- Rata pins the Drizzle version exactly while the 1.0.0 line is a release
  candidate.
