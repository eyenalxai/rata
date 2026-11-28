import type { MemorySeed } from "@test/fake-linear/gateway/model"

import { seed } from "@test/apply/fixtures"
import { lastJsonRecord, runIssueMemory } from "@test/cli-harness"
import { makeMemoryGateway } from "@test/fake-linear/gateway/memory"
import { describe, expect, test } from "bun:test"
import { Effect, Stream } from "effect"

import type { LinearGatewayShape } from "@/linear/gateway"

import { LinearGraphQLError } from "@/linear/errors"

const failWorkingRead = (gateway: LinearGatewayShape): LinearGatewayShape => ({
  ...gateway,
  issue: {
    ...gateway.issue,
    workingSet: (refs, options) =>
      options.mode === "working"
        ? Effect.fail(
            new LinearGraphQLError({ message: "The follow-up read failed.", details: [] }),
          )
        : gateway.issue.workingSet(refs, options),
  },
})

const stdin = (value: unknown) =>
  Stream.make(new TextEncoder().encode(typeof value === "string" ? value : JSON.stringify(value)))

const runApply = async (
  seedValue: MemorySeed,
  gateway: LinearGatewayShape,
  document: unknown,
  args: readonly string[],
) => {
  const lines: string[] = []
  const exit = await runIssueMemory(
    seedValue,
    ["apply", "RAT-1", "--file", "-", ...args],
    lines,
    undefined,
    { gateway, stdio: { stdin: stdin(document) } },
  )
  return { exit, lines }
}

describe("issue write output", () => {
  test("a failed post-read after apply keeps the write result and omits the issue", async () => {
    const seedValue = seed()
    const gateway = failWorkingRead(makeMemoryGateway(seedValue))
    const { exit, lines } = await runApply(seedValue, gateway, { title: "The map, updated" }, [
      "--format",
      "json",
    ])

    const output = lastJsonRecord(lines)
    expect(exit.code).toBe(0)
    expect(output.result).toMatchObject({ action: "apply", status: "updated" })
    expect(output.issue).toBeNull()
    expect(output.warning).toEqual(expect.any(String))
  })

  test("a failed post-read after relate keeps the write result", async () => {
    const seedValue = seed()
    const gateway = failWorkingRead(makeMemoryGateway(seedValue))
    const lines: string[] = []
    const exit = await runIssueMemory(
      seedValue,
      ["relate", "RAT-1", "--related", "RAT-3", "--format", "json"],
      lines,
      undefined,
      { gateway },
    )

    const output = lastJsonRecord(lines)
    expect(exit.code).toBe(0)
    expect(output.result).toMatchObject({ action: "relate", status: "updated" })
    expect(output.issue).toBeNull()
    expect(output.warning).toEqual(expect.any(String))
  })

  test("a successful post-read returns the current issue", async () => {
    const seedValue = seed()
    const gateway = makeMemoryGateway(seedValue)
    const { exit, lines } = await runApply(
      seedValue,
      gateway,
      { title: "The map, updated", state: "Done" },
      ["--format", "json"],
    )

    const output = lastJsonRecord(lines)
    expect(exit.code).toBe(0)
    expect(output.issue).toMatchObject({
      identifier: "RAT-1",
      title: "The map, updated",
      state: { name: "Done", type: "completed" },
    })
    expect(output.warning).toBeNull()
  })

  test("a dry run with a failed post-read keeps its result and omits the issue", async () => {
    const seedValue = seed()
    const gateway = failWorkingRead(makeMemoryGateway(seedValue))
    const { exit, lines } = await runApply(seedValue, gateway, { title: "The map, updated" }, [
      "--dry-run",
      "--format",
      "json",
    ])

    const output = lastJsonRecord(lines)
    expect(exit.code).toBe(0)
    expect(output.result).toMatchObject({ status: "updated", dryRun: true })
    expect(output.issue).toBeNull()
    expect(output.warning).toEqual(expect.any(String))
  })

  test("a failed post-read prints no issue block and one warning line", async () => {
    const seedValue = seed()
    const gateway = failWorkingRead(makeMemoryGateway(seedValue))
    const { exit, lines } = await runApply(seedValue, gateway, { title: "The map, updated" }, [])

    expect(exit.code).toBe(0)
    expect(lines.some((line) => line.startsWith("RAT-1:"))).toBe(false)
    expect(lines.filter((line) => line.startsWith("warning: "))).toHaveLength(1)
  })
})
