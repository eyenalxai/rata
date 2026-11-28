import { lastJsonRecord, runRootMemory } from "@test/cli-harness"
import { seed } from "@test/issue-read/fixtures"
import { describe, expect, test } from "bun:test"

const checkUsage = async (forms: readonly (readonly string[])[], index = 0): Promise<void> => {
  const form = forms[index]
  if (form === undefined) {
    return
  }
  const lines: string[] = []
  const exit = await runRootMemory(seed(), form, lines)
  expect(exit.code).toBe(2)
  expect(lastJsonRecord(lines)).toMatchObject({ error: { code: "usage" } })
  await checkUsage(forms, index + 1)
}

describe("the old read forms", () => {
  test("exit 2", async () => {
    await checkUsage([
      ["issue", "show", "RAT-1", "--format", "json"],
      ["issue", "view", "RAT-1", "--format", "json"],
      ["issue", "status", "RAT-1", "--format", "json"],
      ["next", "--parent", "RAT-1", "--format", "json"],
      ["why", "RAT-1", "--format", "json"],
      ["search", "read", "--format", "json"],
    ])
  })

  test("the old output flags exit 2 on the new reads", async () => {
    await checkUsage([
      ["issue", "RAT-1", "--json"],
      ["issue", "list", "--json"],
      ["issue", "list", "--fields", "identifier"],
      ["issue", "search", "Title", "--fields", "identifier"],
    ])
  })
})
