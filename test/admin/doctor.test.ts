import type { MemorySeed } from "@test/fake-linear/gateway/model"

import { lastJson, runRootMemory } from "@test/cli-harness"
import { defaultViewer } from "@test/fake-linear/model"
import { afterEach, describe, expect, test } from "bun:test"
import { Option, Schema } from "effect"
import path from "node:path"

import { buildTrackerBlock, trackerMarkers } from "@/cli/docs"
import { surface } from "@/cli/registry"
import { Viewer } from "@/linear/decode/viewer"

const viewer = Option.getOrThrow(Schema.decodeOption(Viewer)(defaultViewer))
const seed: MemorySeed = { viewer, teams: [], labels: [] }

const trackerFile = path.join(process.cwd(), "docs", "agents", "issue-tracker.md")
const commandBlock = buildTrackerBlock(surface())

const withBlock = (body: string): string =>
  ["Load the `rata` skill before the first tracker command.", "", body].join("\n")

const block = (content: string): string =>
  [trackerMarkers.begin, content, trackerMarkers.end].join("\n")

const runDoctor = (args: readonly string[], files: Map<string, string>, lines: string[]) =>
  runRootMemory(seed, ["admin", "doctor", ...args], lines, [], {
    files,
    env: { HOME: "/home/test" },
  })

afterEach(() => {
  process.exitCode = 0
})

describe("admin doctor", () => {
  test("reports a stale command with its replacement", async () => {
    const lines: string[] = []
    const files = new Map([
      [
        trackerFile,
        withBlock(`${block(commandBlock)}\n\nRun \`rata team list\` to see the teams.`),
      ],
    ])
    await runDoctor(["--format", "json"], files, lines)

    expect(lastJson(lines)).toMatchObject({
      healthy: false,
      stale: [{ command: "rata team list", replacement: "rata admin team list" }],
      block: { present: true, fresh: true },
      written: false,
    })
    expect(process.exitCode).toBe(0)
  })

  test("names the replacement in the text output", async () => {
    const lines: string[] = []
    const files = new Map([
      [trackerFile, withBlock(`${block(commandBlock)}\n\nRun \`rata issue show RAT-1\`.`)],
    ])
    await runDoctor([], files, lines)

    expect(lines.join("\n")).toContain("`rata issue show` -> `rata issue <ref>`")
  })

  test("--write repairs a stale block", async () => {
    const lines: string[] = []
    const files = new Map([[trackerFile, withBlock(block("stale block"))]])
    await runDoctor(["--write", "--format", "json"], files, lines)

    expect(lastJson(lines)).toMatchObject({
      healthy: true,
      stale: [],
      block: { present: true, fresh: true },
      written: true,
    })
    const repaired = files.get(trackerFile) ?? ""
    expect(repaired).toContain(trackerMarkers.begin)
    expect(repaired).toContain(commandBlock)
    expect(repaired).not.toContain("stale block")

    const second: string[] = []
    await runDoctor(["--format", "json"], files, second)
    expect(lastJson(second)).toMatchObject({ healthy: true, written: false })
  })

  test("--write adds the block when the markers are missing", async () => {
    const lines: string[] = []
    const files = new Map([[trackerFile, withBlock("Run `rata status`.")]])
    await runDoctor(["--write", "--format", "json"], files, lines)

    expect(lastJson(lines)).toMatchObject({
      healthy: true,
      block: { present: true, fresh: true },
      written: true,
    })
    expect(files.get(trackerFile)).toContain(commandBlock)
  })

  test("writes only the tracker document", async () => {
    const lines: string[] = []
    const files = new Map([[trackerFile, withBlock(block("stale block"))]])
    await runDoctor(["--write", "--format", "json"], files, lines)

    expect([...files.keys()]).toEqual([trackerFile])
  })
})
