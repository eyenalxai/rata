import { describe, expect, test } from "bun:test"
import { Cause, Effect, Exit, Runtime } from "effect"
import { CliError } from "effect/cli"

import type { ErrorCode, ExitCode } from "@/cli/error-report"

import { LinearAuthError, LinearNetworkError, LinearRateLimitError } from "@/api/errors"
import { ProjectNameAmbiguousError } from "@/api/project/errors"
import { TeamNotFoundError, TeamResolutionError } from "@/api/team"
import { BodyInputError } from "@/cli/body"
import { classifyError, exitCodeOf } from "@/cli/error-report"
import { withCliExitCode } from "@/cli/run"
import { ConflictError } from "@/domain/conflict"

const exitCodeByClass: readonly (readonly [ErrorCode, ExitCode])[] = [
  ["validation", 2],
  ["not_linked", 2],
  ["ambiguous", 2],
  ["not_found", 3],
  ["conflict", 4],
  ["auth", 5],
  ["forbidden", 5],
  ["rate_limited", 6],
  ["network", 6],
  ["internal", 1],
]

for (const [code, exitCode] of exitCodeByClass) {
  test(`${code} exits ${exitCode}`, () => {
    expect(exitCodeOf(code)).toBe(exitCode)
  })
}

const exitCodeOfError = (error: { readonly message: string }): ExitCode =>
  exitCodeOf(classifyError(error).code)

const exitCodeOfCliFailure = async (error: CliError.CliError): Promise<number> => {
  const exit = await Effect.runPromiseExit(withCliExitCode(Effect.fail(error)))
  return Exit.isFailure(exit) ? Runtime.getErrorExitCode(Cause.squash(exit.cause)) : 0
}

describe("classifyError exit codes", () => {
  test("a body input error is validation", () => {
    expect(exitCodeOfError(new BodyInputError({ message: "Body." }))).toBe(2)
  })

  test("a missing team link is validation", () => {
    expect(exitCodeOfError(new TeamResolutionError({ message: "Link." }))).toBe(2)
  })

  test("an ambiguous project name is validation", () => {
    expect(
      exitCodeOfError(new ProjectNameAmbiguousError({ name: "Tracker", message: "Two." })),
    ).toBe(2)
  })

  test("a missing team is not found", () => {
    expect(exitCodeOfError(new TeamNotFoundError({ key: "RAT", message: "Missing." }))).toBe(3)
  })

  test("a stale write is conflict", () => {
    expect(
      exitCodeOfError(new ConflictError({ expected: "old", current: "new", message: "Changed." })),
    ).toBe(4)
  })

  test("a rejected key is auth", () => {
    expect(exitCodeOfError(new LinearAuthError({ message: "Rejected.", status: 401 }))).toBe(5)
  })

  test("a forbidden key is auth", () => {
    expect(exitCodeOfError(new LinearAuthError({ message: "Forbidden.", status: 403 }))).toBe(5)
  })

  test("a rate limit is retryable", () => {
    expect(
      exitCodeOfError(new LinearRateLimitError({ message: "Slow down.", retryAfterSeconds: 1 })),
    ).toBe(6)
  })

  test("a network failure is retryable", () => {
    expect(exitCodeOfError(new LinearNetworkError({ message: "Down." }))).toBe(6)
  })

  test("an unexpected failure is internal", () => {
    expect(exitCodeOfError(new Error("Unexpected."))).toBe(1)
  })
})

describe("withCliExitCode", () => {
  test("a parse error exits validation", async () => {
    expect(
      await exitCodeOfCliFailure(
        new CliError.UnrecognizedOption({ option: "--nope", suggestions: [] }),
      ),
    ).toBe(2)
  })

  test("a user error exits internal", async () => {
    expect(await exitCodeOfCliFailure(new CliError.UserError({ cause: new Error("boom") }))).toBe(1)
  })
})
