import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import path from "node:path"

import {
  blockContent,
  buildReferenceBlock,
  buildTrackerBlock,
  referenceMarkers,
  trackerMarkers,
} from "@/cli/docs"
import { surface } from "@/cli/registry"

const root = path.resolve(import.meta.dir, "..", "..")

const read = (file: string): Promise<string> => readFile(path.join(root, file), "utf8")

describe("generated docs", () => {
  test("the reference block is current", async () => {
    const content = await read("skills/rata/reference.md")
    expect(blockContent(content, referenceMarkers)).toBe(buildReferenceBlock(surface()))
  })

  test("the tracker command block is current", async () => {
    const content = await read("docs/agents/issue-tracker.md")
    expect(blockContent(content, trackerMarkers)).toBe(buildTrackerBlock(surface()))
  })

  test("the reference names the admin commands", async () => {
    const content = await read("skills/rata/reference.md")
    expect(content).toContain("`rata admin api`")
    expect(content).toContain("`rata admin doctor`")
  })

  test("the reference includes the choice values", async () => {
    const content = await read("skills/rata/reference.md")
    expect(content).toContain(
      "`--state-type <triage|backlog|unstarted|started|completed|canceled|duplicate>`",
    )
    expect(content).toContain("`--sort <priority>`")
    expect(content).toContain("`--format <json|text>`")
  })

  test("the reference includes the issue create flags", async () => {
    const content = await read("skills/rata/reference.md")
    expect(content).toContain("`--wait <integer>`")
    expect(content).toContain("`--dry-run`")
    expect(content).toContain("`--body-file <string>`")
    expect(content).not.toContain("`--body <")
  })

  test("the issue create section has no legacy output flags", async () => {
    const content = await read("skills/rata/reference.md")
    const start = content.indexOf("#### `rata issue create`")
    const end = content.indexOf("#### `rata issue publish`")
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const section = content.slice(start, end)
    expect(section).not.toContain("--json")
    expect(section).not.toContain("--fields")
  })
})
