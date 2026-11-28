import { describe, expect, test } from "bun:test"

import { blockContent, replaceGeneratedBlock, trackerMarkers } from "@/docs/blocks"

const generated = "| Command | Summary |\n| --- | --- |\n| `rata status` | Show status |"

describe("generated blocks", () => {
  test("replaces a marker pair", () => {
    const content = `Intro\n\n${trackerMarkers.begin}\nold\n${trackerMarkers.end}\nAfter`
    const result = replaceGeneratedBlock(content, generated, trackerMarkers)

    expect(result.error).toBeNull()
    expect(result.changed).toBe(true)
    expect(result.content).toContain(`Intro`)
    expect(result.content).toContain(generated)
    expect(result.content).toContain("After")
    expect(result.content).not.toContain("old")
  })

  test("appends a block when both markers are missing", () => {
    const result = replaceGeneratedBlock("Intro", generated, trackerMarkers)

    expect(result.error).toBeNull()
    expect(result.changed).toBe(true)
    expect(result.content).toContain(trackerMarkers.begin)
    expect(result.content).toContain(generated)
    expect(result.content).toContain(trackerMarkers.end)
  })

  test("refuses a begin marker without an end marker", () => {
    const content = `Intro\n${trackerMarkers.begin}\nold`
    const result = replaceGeneratedBlock(content, generated, trackerMarkers)

    expect(result.error).toBe("The generated block has a begin marker but no end marker.")
    expect(result.content).toBe(content)
    expect(result.changed).toBe(false)
  })

  test("refuses an end marker without a begin marker", () => {
    const content = `Intro\nold\n${trackerMarkers.end}`
    const result = replaceGeneratedBlock(content, generated, trackerMarkers)

    expect(result.error).toBe("The generated block has an end marker but no begin marker.")
    expect(result.content).toBe(content)
  })

  test("reads only a complete marker pair", () => {
    expect(blockContent(`${trackerMarkers.begin}\nold`, trackerMarkers)).toBeNull()
    expect(blockContent(`old\n${trackerMarkers.end}`, trackerMarkers)).toBeNull()
  })
})
