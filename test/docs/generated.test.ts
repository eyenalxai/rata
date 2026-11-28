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
})
