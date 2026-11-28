import type { Handler } from "@test/fake-linear/model"

import { runIssue, runRoot } from "@test/cli-harness"
import { makeFakeLinear } from "@test/fake-linear"
import { jsonResponse } from "@test/issue-fixtures"
import { rat } from "@test/link-harness"
import { recordingConsole } from "@test/recording-console"
import { describe, expect, test } from "bun:test"
import { ConfigProvider, Console, Effect } from "effect"
import { CliError } from "effect/cli"

import type { CodedError, ErrorCode } from "@/domain/error"

import { ProjectNameAmbiguousError, ProjectNotFoundError } from "@/api/project/errors"
import { TeamResolutionError } from "@/api/team"
import { exitCodeOf, toTrackerError } from "@/cli/error-report"
import { FieldSelectionError } from "@/cli/field/error"
import { JsonOutput, reportFailure } from "@/cli/output"
import { exitCodeOfCliError } from "@/cli/runner"
import { DatabaseError } from "@/db/database"
import { ConflictError } from "@/domain/conflict"
import { TrackerError } from "@/domain/error"
import { InvalidIssueRef } from "@/domain/issue-ref"
import { LinearAuthError, LinearNetworkError, LinearRateLimitError } from "@/linear/errors"

const expectedExitCodes: Record<ErrorCode, number> = {
  usage: 2,
  validation: 2,
  not_linked: 2,
  ambiguous: 2,
  not_found: 3,
  conflict: 4,
  auth: 5,
  forbidden: 5,
  rate_limited: 6,
  network: 6,
  internal: 1,
}

const errorCodes: readonly ErrorCode[] = [
  "usage",
  "validation",
  "not_linked",
  "ambiguous",
  "not_found",
  "conflict",
  "auth",
  "forbidden",
  "rate_limited",
  "network",
  "internal",
]

const samples: Record<ErrorCode, CodedError> = {
  usage: new TrackerError({ code: "usage", message: "bad flag", hint: null }),
  validation: new InvalidIssueRef({ input: "x", message: "bad ref" }),
  not_linked: new TeamResolutionError({ message: "no team" }),
  ambiguous: new ProjectNameAmbiguousError({ name: "Tracker", message: "two projects" }),
  not_found: new ProjectNotFoundError({ ref: "Tracker", message: "no project" }),
  conflict: new ConflictError({ expected: "a", current: "b", message: "The issue changed." }),
  auth: new LinearAuthError({ code: "auth", message: "rejected", status: 401 }),
  forbidden: new LinearAuthError({ code: "forbidden", message: "denied", status: 403 }),
  rate_limited: new LinearRateLimitError({ message: "slow down" }),
  network: new LinearNetworkError({ message: "offline" }),
  internal: new DatabaseError({ message: "Could not open the database." }),
}

const graphqlErrors =
  (message: string): Handler =>
  () =>
    jsonResponse({ data: null, errors: [{ message }] })

const rateLimited: Handler = () =>
  new Response("{}", {
    status: 429,
    headers: { "content-type": "application/json", "retry-after": "0" },
  })

const forbidden: Handler = () => jsonResponse({ errors: [{ message: "Forbidden" }] }, 403)

const unusedHandler: Handler = () => {
  throw new Error("the command must fail before the first request")
}

const report = (error: unknown) =>
  Effect.gen(function* runReport() {
    const lines: string[] = []
    const exit = yield* reportFailure(error).pipe(
      Effect.provideService(Console.Console, recordingConsole(lines)),
      Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromEnvRecord({})),
      Effect.provideService(JsonOutput, true),
    )
    return { exit, lines }
  }).pipe(Effect.runPromise)

describe("the exit code map", () => {
  test("maps every error code to its stable exit code", () => {
    for (const code of errorCodes) {
      expect(exitCodeOf(code)).toBe(expectedExitCodes[code])
    }
  })

  test("turns a representative error of every code into that code", () => {
    for (const code of errorCodes) {
      expect(toTrackerError(samples[code]).code).toBe(code)
    }
  })

  test("writes the exit code of every code", async () => {
    const results = await Promise.all(errorCodes.map((code) => report(samples[code])))
    for (const [index, code] of errorCodes.entries()) {
      const result = results[index]
      expect(result?.exit.code).toBe(expectedExitCodes[code])
      expect(JSON.parse(result?.lines.at(-1) ?? "")).toMatchObject({ error: { code } })
    }
  })

  test("keeps a TrackerError unchanged", () => {
    const passthrough = new TrackerError({ code: "internal", message: "kept", hint: null })
    expect(toTrackerError(passthrough)).toBe(passthrough)
  })

  test("keeps the hint and the details of a coded error", () => {
    const classified = toTrackerError(
      new FieldSelectionError({
        message: "Unknown field.",
        hint: "Pick a valid path.",
        path: "title",
        validPaths: ["id", "title"],
      }),
    )
    expect(classified.hint).toBe("Pick a valid path.")
    expect(classified.details).toEqual({ path: "title", validPaths: ["id", "title"] })
  })

  test("falls back to internal for an untrusted error", () => {
    const classified = toTrackerError(new Error("boom"))
    expect(classified.code).toBe("internal")
    expect(classified.hint).toBe("Run with RATA_DEBUG=1 for details.")
  })
})

describe("the process exit code", () => {
  test("a bad flag exits 2 with a usage error object", async () => {
    const lines: string[] = []
    const exit = await runRoot(
      unusedHandler,
      ["issue", "RAT-1", "--bogus", "--format", "json"],
      lines,
    )

    expect(exit.code).toBe(2)
    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines.at(-1) ?? "")).toMatchObject({
      error: { code: "usage" },
    })
  })

  test("--help exits 0 and a parse error exits 2", () => {
    const help = new CliError.ShowHelp({ commandPath: ["rata"], errors: [] })
    const parseError = new CliError.ShowHelp({
      commandPath: ["rata", "issue", "show"],
      errors: [new CliError.UnrecognizedOption({ option: "--bogus", suggestions: [] })],
    })

    expect(exitCodeOfCliError(help)).toBe(0)
    expect(exitCodeOfCliError(parseError)).toBe(2)
  })

  test("issue create without a linked team exits 2", async () => {
    const lines: string[] = []
    const exit = await runIssue(
      unusedHandler,
      ["create", "--title", "T", "--format", "json"],
      lines,
      [],
    )

    expect(exit.code).toBe(2)
    expect(JSON.parse(lines.at(-1) ?? "")).toMatchObject({
      error: { code: "not_linked" },
    })
  })

  test("a bad limit exits 2", async () => {
    const lines: string[] = []
    const exit = await runIssue(unusedHandler, ["list", "--limit", "0", "--format", "json"], lines)

    expect(exit.code).toBe(2)
    expect(JSON.parse(lines.at(-1) ?? "")).toMatchObject({ error: { code: "validation" } })
  })

  test("a missing issue exits 3 and writes one error object", async () => {
    const errors: string[] = []
    const exit = await runIssue(
      graphqlErrors("Entity not found: Issue"),
      ["RAT-404", "--format", "json"],
      [],
      undefined,
      { errors },
    )

    expect(exit.code).toBe(3)
    expect(errors).toHaveLength(1)
    expect(JSON.parse(errors[0] ?? "")).toMatchObject({ error: { code: "not_found" } })
  })

  test("a duplicate team key exits 4 with conflict", async () => {
    const lines: string[] = []
    const exit = await runRoot(
      makeFakeLinear({ teams: [rat], labels: [] }).handler,
      ["admin", "team", "create", "--name", "Rata", "--key", "RAT", "--format", "json"],
      lines,
    )

    expect(exit.code).toBe(4)
    expect(JSON.parse(lines.at(-1) ?? "")).toMatchObject({
      error: { code: "conflict", message: "Duplicate team key: RAT" },
    })
  })

  test("a missing key exits 5", async () => {
    const exit = await runRoot(
      unusedHandler,
      ["admin", "auth", "status", "--format", "json"],
      [],
      undefined,
      {
        env: { HOME: "/home/test" },
        profiles: [],
      },
    )

    expect(exit.code).toBe(5)
  })

  test("a forbidden request exits 5", async () => {
    const exit = await runRoot(forbidden, ["admin", "auth", "status", "--format", "json"], [])

    expect(exit.code).toBe(5)
  })

  test("a rate limit exits 6", async () => {
    const exit = await runIssue(rateLimited, ["RAT-1", "--format", "json"], [])

    expect(exit.code).toBe(6)
  })

  test("an unexpected failure exits 1", async () => {
    const exit = await runIssue(graphqlErrors("Something broke"), ["RAT-1", "--format", "json"], [])

    expect(exit.code).toBe(1)
  })
})
