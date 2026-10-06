import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"

import { injectAgentSkillsBlock } from "@/matt/agents-block"
import { agentSkillDocuments, agentSkillsBlock } from "@/matt/tracker-doc"

const read = (path: string): Promise<string> => readFile(`${process.cwd()}/${path}`, "utf8")

describe("the installed agent documents", () => {
  test("match the generated documents", async () => {
    const installed = await Promise.all(
      agentSkillDocuments.map(async (document) => ({
        content: await read(document.path),
        path: document.path,
      })),
    )
    const generated = agentSkillDocuments.map((document) => ({
      content: document.content,
      path: document.path,
    }))
    expect(installed).toEqual(generated)
  })

  test("AGENTS.md carries the current agent skills block", async () => {
    const agents = await read("AGENTS.md")
    expect(injectAgentSkillsBlock(agents, agentSkillsBlock)).toBe(agents)
  })
})
