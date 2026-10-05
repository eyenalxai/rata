import { describe, expect, test } from "bun:test"

import { injectAgentSkillsBlock } from "@/matt/agents-block"

const block = `## Agent skills

### Issue tracker

Issues live in Linear. See \`docs/agents/issue-tracker.md\`.
`

describe("injectAgentSkillsBlock", () => {
  test("appends the block when it is missing", () => {
    const result = injectAgentSkillsBlock("# Project\n\nSome rules.\n", block)
    expect(result).toBe(`# Project\n\nSome rules.\n\n${block}`)
  })

  test("replaces an existing block between sections", () => {
    const content = `# Project

## Agent skills

Old text.

## Commands

bun run check
`
    const result = injectAgentSkillsBlock(content, block)
    expect(result).toBe(`# Project\n\n${block}\n## Commands\n\nbun run check\n`)
  })

  test("replaces a block at the end of the file", () => {
    const content = `# Project

## Agent skills

Old text.
`
    const result = injectAgentSkillsBlock(content, block)
    expect(result).toBe(`# Project\n\n${block}`)
  })

  test("is idempotent", () => {
    const once = injectAgentSkillsBlock("# Project\n", block)
    const twice = injectAgentSkillsBlock(once, block)
    expect(twice).toBe(once)
  })
})
