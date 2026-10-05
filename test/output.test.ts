import { afterEach, describe, expect, test } from "bun:test"
import { ConfigProvider, Console, Effect } from "effect"

import { LinearNetworkError } from "@/api/errors"
import { reportFailure } from "@/cli/output"

const ignore = (): void => undefined

const recordingConsole = (lines: string[]): Console.Console => {
  const record = (...args: readonly unknown[]): void => {
    lines.push(args.map(String).join(" "))
  }
  return {
    assert: ignore,
    clear: ignore,
    count: ignore,
    countReset: ignore,
    debug: ignore,
    dir: ignore,
    dirxml: ignore,
    error: record,
    group: ignore,
    groupCollapsed: ignore,
    groupEnd: ignore,
    info: ignore,
    log: record,
    table: ignore,
    time: ignore,
    timeEnd: ignore,
    timeLog: ignore,
    trace: ignore,
    warn: ignore,
  }
}

const runReport = (error: LinearNetworkError, env: Record<string, string>, lines: string[]) =>
  reportFailure(error).pipe(
    Effect.provideService(Console.Console, recordingConsole(lines)),
    Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromEnvRecord(env)),
    Effect.runPromise,
  )

const networkError = () =>
  new LinearNetworkError({
    message: "Linear returned HTTP 500.",
    cause: new Error("inner failure"),
  })

afterEach(() => {
  process.exitCode = 0
})

describe("reportFailure", () => {
  test("prints the cause when RATA_DEBUG is set", async () => {
    const lines: string[] = []
    await runReport(networkError(), { RATA_DEBUG: "1" }, lines)
    expect(lines[0]).toBe("error: Linear returned HTTP 500.")
    expect(lines.some((line) => line.includes("inner failure"))).toBe(true)
  })

  test("does not print the cause without RATA_DEBUG", async () => {
    const lines: string[] = []
    await runReport(networkError(), {}, lines)
    expect(lines.length).toBe(1)
  })
})
