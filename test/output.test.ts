import { afterEach, describe, expect, test } from "bun:test"
import { ConfigProvider, Console, Effect } from "effect"

import { LinearAuthError, LinearNetworkError, LinearRateLimitError } from "@/api/errors"
import { LabelCreateError } from "@/api/label"
import { TeamResolutionError } from "@/api/team"
import { JsonOutput, reportFailure } from "@/cli/output"

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

const runReport = (
  error:
    | LinearAuthError
    | LinearNetworkError
    | LinearRateLimitError
    | LabelCreateError
    | TeamResolutionError,
  env: Record<string, string>,
  lines: string[],
  json = false,
) =>
  reportFailure(error).pipe(
    Effect.provideService(Console.Console, recordingConsole(lines)),
    Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromEnvRecord(env)),
    Effect.provideService(JsonOutput, json),
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
    expect(lines).toEqual([
      "error: Linear returned HTTP 500.",
      "hint: Check the connection and retry.",
    ])
    expect(process.exitCode).toBe(6)
  })

  test("prints the code and hint in JSON mode", async () => {
    const lines: string[] = []
    await runReport(networkError(), {}, lines, true)
    expect(JSON.parse(lines[0] ?? "")).toEqual({
      error: {
        code: "network",
        message: "Linear returned HTTP 500.",
        hint: "Check the connection and retry.",
      },
    })
  })

  test("maps a rate limit to the retry hint", async () => {
    const lines: string[] = []
    await runReport(
      new LinearRateLimitError({ message: "Too many requests.", retryAfterSeconds: 3 }),
      {},
      lines,
      true,
    )
    expect(JSON.parse(lines[0] ?? "")).toMatchObject({
      error: { code: "rate_limited", hint: "Retry later." },
    })
    expect(process.exitCode).toBe(6)
  })

  test("maps a forbidden key to auth with exit code 5", async () => {
    const lines: string[] = []
    await runReport(new LinearAuthError({ message: "Forbidden.", status: 403 }), {}, lines, true)
    expect(JSON.parse(lines[0] ?? "")).toMatchObject({
      error: { code: "forbidden" },
    })
    expect(process.exitCode).toBe(5)
  })

  test("maps a duplicate label to conflict", async () => {
    const lines: string[] = []
    await runReport(
      new LabelCreateError({ name: "bug", message: "The label already exists." }),
      {},
      lines,
      true,
    )
    expect(JSON.parse(lines[0] ?? "")).toMatchObject({
      error: { code: "conflict" },
    })
  })

  test("maps a missing team link to not_linked", async () => {
    const lines: string[] = []
    await runReport(
      new TeamResolutionError({ message: "No team. Pass --team, or run `rata link`." }),
      {},
      lines,
      true,
    )
    expect(JSON.parse(lines[0] ?? "")).toMatchObject({
      error: { code: "not_linked" },
    })
  })
})
