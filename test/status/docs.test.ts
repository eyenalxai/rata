import { makeFakeLinear } from "@test/fake-linear"
import { docsDirectory, lastJson, profiles, runStatus, team } from "@test/status/harness"
import { afterEach, describe, expect, test } from "bun:test"
import { Option, Schema } from "effect"
import path from "node:path"

const triageDocument = [
  "# Triage labels",
  "",
  "| Canonical label | Label in our tracker | Meaning |",
  "| --------------- | -------------------- | ------- |",
  "| `bug` | `bug` | Something is broken |",
  "| `enhancement` | `enhancement` | New feature |",
  "| `needs-triage` | `needs-triage` | Evaluate this issue |",
  "| `needs-info` | `needs-info` | Waiting on the reporter |",
  "| `ready-for-agent` | `ready-for-agent` | Ready for an agent |",
  "| `ready-for-human` | `ready-for-human` | Needs the maintainer |",
  "| `wontfix` | `wontfix` | Will not be addressed |",
].join("\n")

const trackerDocument = "Load the `rata` skill before the first tracker command."

afterEach(() => {
  process.exitCode = 0
})

describe("status documents", () => {
  test("reports an unhealthy triage document without a canonical label header", async () => {
    const fake = makeFakeLinear({ teams: [team], labels: [] })
    const lines: string[] = []
    const tracker = path.join(docsDirectory, "issue-tracker.md")
    const triage = path.join(docsDirectory, "triage-labels.md")
    await runStatus(fake.handler, ["--json"], lines, {
      profiles,
      repositories: [{ key: process.cwd(), team: "RAT", teamId: "team-1" }],
      files: new Map([
        [tracker, trackerDocument],
        [triage, "# Triage labels\n\nNo table."],
      ]),
    })

    const document = Option.getOrThrow(
      Schema.decodeUnknownOption(
        Schema.Struct({
          team: Schema.NullOr(Schema.Unknown),
          triage: Schema.Null,
          docs: Schema.Struct({
            triage: Schema.Struct({
              healthy: Schema.NullOr(Schema.Boolean),
              warning: Schema.String,
            }),
          }),
          warning: Schema.String,
        }),
      )(lastJson(lines)),
    )

    expect(process.exitCode).toBe(0)
    expect(document.team).not.toBeNull()
    expect(document.triage).toBeNull()
    expect(document.docs.triage.healthy).toBe(false)
    expect(document.docs.triage.warning).toContain("canonical label header")
    expect(document.warning).toContain("canonical label header")
  })

  test("reports the triage map and healthy documents", async () => {
    const fake = makeFakeLinear({ teams: [team], labels: [] })
    const lines: string[] = []
    const tracker = path.join(docsDirectory, "issue-tracker.md")
    const triage = path.join(docsDirectory, "triage-labels.md")
    await runStatus(fake.handler, ["--json"], lines, {
      profiles,
      repositories: [{ key: process.cwd(), teamId: "team-1" }],
      files: new Map([
        [tracker, trackerDocument],
        [triage, triageDocument],
      ]),
    })

    expect(lastJson(lines)).toMatchObject({
      docs: {
        tracker: { path: tracker, exists: true, healthy: true, warning: null },
        triage: { path: triage, exists: true, healthy: true, warning: null },
      },
      triage: {
        source: triage,
        roles: {
          bug: "bug",
          enhancement: "enhancement",
          "needs-triage": "needs-triage",
          "needs-info": "needs-info",
          "ready-for-agent": "ready-for-agent",
          "ready-for-human": "ready-for-human",
          wontfix: "wontfix",
        },
      },
      warning: null,
    })
  })

  test("parses a reordered triage table", async () => {
    const fake = makeFakeLinear({ teams: [team], labels: [] })
    const lines: string[] = []
    const tracker = path.join(docsDirectory, "issue-tracker.md")
    const triage = path.join(docsDirectory, "triage-labels.md")
    const reordered = [
      "# Triage labels",
      "",
      "| Label in our tracker | Canonical label | Meaning |",
      "| -------------------- | --------------- | ------- |",
      "| `bug` | `bug` | Something is broken |",
      "| `enhancement` | `enhancement` | New feature |",
      "| `needs-triage` | `needs-triage` | Evaluate this issue |",
      "| `needs-info` | `needs-info` | Waiting on the reporter |",
      "| `ready-for-agent` | `ready-for-agent` | Ready for an agent |",
      "| `ready-for-human` | `ready-for-human` | Needs the maintainer |",
      "| `wontfix` | `wontfix` | Will not be addressed |",
    ].join("\n")
    await runStatus(fake.handler, ["--json"], lines, {
      profiles,
      repositories: [{ key: process.cwd(), teamId: "team-1" }],
      files: new Map([
        [tracker, trackerDocument],
        [triage, reordered],
      ]),
    })

    expect(lastJson(lines)).toMatchObject({
      docs: { triage: { exists: true, healthy: true, warning: null } },
      triage: {
        source: triage,
        roles: {
          bug: "bug",
          enhancement: "enhancement",
          "needs-triage": "needs-triage",
          "needs-info": "needs-info",
          "ready-for-agent": "ready-for-agent",
          "ready-for-human": "ready-for-human",
          wontfix: "wontfix",
        },
      },
      warning: null,
    })
  })

  test("warns when the triage document misses roles", async () => {
    const fake = makeFakeLinear({ teams: [team], labels: [] })
    const lines: string[] = []
    const tracker = path.join(docsDirectory, "issue-tracker.md")
    const triage = path.join(docsDirectory, "triage-labels.md")
    await runStatus(fake.handler, ["--json"], lines, {
      profiles,
      repositories: [{ key: process.cwd(), teamId: "team-1" }],
      files: new Map([
        [tracker, trackerDocument],
        [
          triage,
          ["| Canonical label | Label in our tracker |", "| --- | --- |", "| `bug` | `bug` |"].join(
            "\n",
          ),
        ],
      ]),
    })

    const document = Option.getOrThrow(
      Schema.decodeUnknownOption(
        Schema.Struct({
          docs: Schema.Struct({
            triage: Schema.Struct({
              healthy: Schema.NullOr(Schema.Boolean),
              warning: Schema.String,
            }),
          }),
          warning: Schema.String,
        }),
      )(lastJson(lines)),
    )

    expect(document.docs.triage.healthy).toBe(false)
    expect(document.docs.triage.warning).toContain("needs-triage")
    expect(document.warning).toContain("needs-triage")
  })

  test("warns when the tracker document does not name the rata skill", async () => {
    const fake = makeFakeLinear({ teams: [team], labels: [] })
    const lines: string[] = []
    const document = path.join(docsDirectory, "issue-tracker.md")
    await runStatus(fake.handler, ["--json"], lines, {
      profiles,
      repositories: [{ key: process.cwd(), team: "RAT", teamId: "team-1" }],
      files: new Map([[document, "# Issue tracker\n\nUse the rata CLI for tracker work."]]),
    })

    expect(process.exitCode).toBe(0)
    expect(lastJson(lines)).toMatchObject({
      warning: `The tracker document at ${document} does not name the rata skill. Add a line that tells agents to load \`rata\` before the first tracker command.`,
    })
  })
})
