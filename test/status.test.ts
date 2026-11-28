import type { Handler } from "@test/fake-linear/model"

import { makeFakeLinear } from "@test/fake-linear"
import {
  lastJson,
  missingDocs,
  profiles,
  runStatus,
  statusViewer,
  team,
} from "@test/status/harness"
import { afterEach, describe, expect, test } from "bun:test"
import { Option, Schema } from "effect"

const unusedHandler: Handler = () => {
  throw new Error("status must not call the Linear API without a key")
}

const WorkspaceOnly = Schema.Struct({
  workspace: Schema.Struct({
    name: Schema.NullOr(Schema.String),
    keySource: Schema.String,
  }),
})

const ErrorEnvelope = Schema.Struct({
  error: Schema.Struct({ code: Schema.String }),
})

const CacheDocument = Schema.Struct({
  ageSeconds: Schema.Finite,
  fetchedAt: Schema.String,
})

const readStatus = (lines: readonly string[]) => {
  const value = Option.getOrThrow(
    Schema.decodeUnknownOption(Schema.Record(Schema.String, Schema.Unknown))(lastJson(lines)),
  )
  const { cache, ...rest } = value
  const decoded = Option.getOrThrow(Schema.decodeUnknownOption(Schema.NullOr(CacheDocument))(cache))
  return { cache: decoded, rest }
}

afterEach(() => {
  process.exitCode = 0
})

describe("status", () => {
  test("prefers the environment key over the repository profile", async () => {
    const fake = makeFakeLinear({ teams: [team], labels: [] })
    const lines: string[] = []
    await runStatus(fake.handler, ["--format", "json"], lines, {
      profiles,
      repositories: [{ key: process.cwd(), team: "RAT", workspace: "work" }],
    })

    const { cache, rest } = readStatus(lines)
    expect(rest).toEqual({
      repository: { root: process.cwd(), linked: true },
      workspace: { name: null, keySource: "env" },
      viewer: statusViewer,
      team: { id: "00000000-0000-0000-0000-000000000001", key: "RAT", name: "Rata" },
      project: null,
      defaults: { assignee: null, labels: [], priority: null },
      states: [],
      labels: [],
      triage: null,
      docs: missingDocs,
      warning: null,
    })
    expect(cache?.ageSeconds).toBe(0)
  })

  test("adds the team detail with --full", async () => {
    const fake = makeFakeLinear({ teams: [team], labels: [] })
    const lines: string[] = []
    await runStatus(fake.handler, ["--full", "--format", "json"], lines, {
      env: { HOME: "/home/test" },
      profiles,
      repositories: [{ key: process.cwd(), team: "RAT", workspace: "work" }],
    })

    expect(lastJson(lines)).toMatchObject({
      teamDetail: {
        timezone: "America/Los_Angeles",
        members: [],
      },
    })
  })

  test("returns a null team detail with --full when no team is linked", async () => {
    const fake = makeFakeLinear({ teams: [team], labels: [] })
    const lines: string[] = []
    await runStatus(fake.handler, ["--full", "--select", "teamDetail", "--format", "json"], lines, {
      env: { HOME: "/home/test" },
      profiles,
      repositories: [],
    })

    expect(lastJson(lines)).toEqual({ teamDetail: null })
    expect(process.exitCode ?? 0).toBe(0)
  })

  test("uses the repository profile and shows the linked team and project", async () => {
    const fake = makeFakeLinear({ teams: [team], labels: [] })
    const lines: string[] = []
    await runStatus(fake.handler, ["--format", "json"], lines, {
      env: { HOME: "/home/test" },
      profiles,
      repositories: [{ key: process.cwd(), team: "RAT", project: "rata", workspace: "work" }],
    })

    const { cache, rest } = readStatus(lines)
    expect(rest).toEqual({
      repository: { root: process.cwd(), linked: true },
      workspace: { name: "work", keySource: "repo" },
      viewer: statusViewer,
      team: { id: "00000000-0000-0000-0000-000000000001", key: "RAT", name: "Rata" },
      project: "rata",
      defaults: { assignee: null, labels: [], priority: null },
      states: [],
      labels: [],
      triage: null,
      docs: missingDocs,
      warning: null,
    })
    expect(cache?.ageSeconds).toBe(0)
  })

  test("keeps the context when the stored team key is stale", async () => {
    const fake = makeFakeLinear({ teams: [team], labels: [] })
    const lines: string[] = []
    await runStatus(fake.handler, ["--format", "json"], lines, {
      env: { HOME: "/home/test" },
      profiles,
      repositories: [{ key: process.cwd(), team: "GONE", project: "rata", workspace: "work" }],
    })

    expect(lastJson(lines)).toEqual({
      repository: { root: process.cwd(), linked: true },
      workspace: { name: "work", keySource: "repo" },
      viewer: statusViewer,
      team: null,
      project: "rata",
      defaults: null,
      states: [],
      labels: [],
      triage: null,
      cache: null,
      docs: missingDocs,
      warning:
        "The stored team key GONE no longer exists. Run `rata admin team list` to see the team keys, then run `rata admin link --team <key>` to repair the link.",
    })
    expect(process.exitCode).toBe(0)
  })

  test("prints the stale team warning on standard error only", async () => {
    const fake = makeFakeLinear({ teams: [team], labels: [] })
    const stdout: string[] = []
    const stderr: string[] = []
    await runStatus(
      fake.handler,
      [],
      stdout,
      {
        env: { HOME: "/home/test" },
        profiles,
        repositories: [{ key: process.cwd(), team: "GONE", project: "rata" }],
      },
      stderr,
    )

    expect(stderr).toEqual([
      "warning: The stored team key GONE no longer exists. Run `rata admin team list` to see the team keys, then run `rata admin link --team <key>` to repair the link.",
    ])
    const output = stdout.join("\n")
    expect(output).toContain("repo:")
    expect(output).toContain("team:      missing key GONE (run rata admin link --team GONE)")
    expect(output).toContain("project:   rata")
    expect(output).toContain("defaults:  none")
    expect(output).not.toContain("warning:")
  })

  test("falls back to the default profile", async () => {
    const fake = makeFakeLinear({ teams: [team], labels: [] })
    const lines: string[] = []
    await runStatus(fake.handler, ["--format", "json"], lines, {
      env: { HOME: "/home/test" },
      profiles,
      repositories: [{ key: process.cwd(), team: "RAT" }],
    })

    const document = Option.getOrThrow(Schema.decodeUnknownOption(WorkspaceOnly)(lastJson(lines)))
    expect(document.workspace).toEqual({ name: "default", keySource: "default" })
  })

  test("prints the unlinked team line and exits 0", async () => {
    const fake = makeFakeLinear({ teams: [team], labels: [] })
    const lines: string[] = []
    await runStatus(fake.handler, [], lines, { profiles })

    expect(lines[0]).toContain("team:      not linked (run rata admin link)")
    expect(lines[0]).toContain("defaults:  none")
    expect(process.exitCode).toBe(0)
  })

  test("fails with an auth error when no key exists", async () => {
    const lines: string[] = []
    await runStatus(unusedHandler, ["--format", "json"], lines, {
      env: { HOME: "/home/test" },
      profiles: [],
    })

    const error = Option.getOrThrow(Schema.decodeUnknownOption(ErrorEnvelope)(lastJson(lines)))
    expect(error.error.code).toBe("auth")
    expect(process.exitCode).toBe(5)
  })

  test("selects fields on the whole document", async () => {
    const fake = makeFakeLinear({ teams: [team], labels: [] })
    const lines: string[] = []
    await runStatus(
      fake.handler,
      ["--format", "json", "--select", "repository.root,team.key"],
      lines,
      {
        profiles,
        repositories: [{ key: process.cwd(), team: "RAT" }],
      },
    )

    expect(lastJson(lines)).toEqual({
      repository: { root: process.cwd() },
      team: { key: "RAT" },
    })
  })

  test("repairs a stale team key and reports the repair", async () => {
    const fake = makeFakeLinear({ teams: [team], labels: [] })
    const lines: string[] = []
    await runStatus(fake.handler, ["--format", "json"], lines, {
      profiles,
      repositories: [
        { key: process.cwd(), team: "OLD", teamId: "00000000-0000-0000-0000-000000000001" },
      ],
    })

    expect(lastJson(lines)).toMatchObject({
      team: { id: "00000000-0000-0000-0000-000000000001", key: "RAT", name: "Rata" },
      warning: "The stored team key OLD is stale. Repaired the link to RAT.",
    })
    expect(process.exitCode).toBe(0)
  })
})
