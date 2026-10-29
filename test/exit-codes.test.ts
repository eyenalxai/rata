import type { Handler } from "@test/fake-linear/model"

import { runIssue, runRoot } from "@test/cli-harness"
import { body } from "@test/issue-body/fixtures"
import { jsonResponse } from "@test/issue-fixtures"
import { afterEach, describe, expect, test } from "bun:test"
import { CliError } from "effect/cli"

import type { ErrorCode } from "@/cli/error-report"

import {
  LinearAuthError,
  LinearGraphQLError,
  LinearNetworkError,
  LinearRateLimitError,
} from "@/api/errors"
import { ProjectNameAmbiguousError } from "@/api/project/errors"
import { TeamResolutionError } from "@/api/team"
import { classifyError, exitCodeOf } from "@/cli/error-report"
import { exitCodeOfCliError } from "@/cli/exit"
import { ConflictError } from "@/domain/conflict"
import { InvalidIssueRef } from "@/domain/ref"

const expectedExitCodes: Record<ErrorCode, number> = {
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

const classify = (error: Parameters<typeof classifyError>[0]): ErrorCode =>
  classifyError(error).code

afterEach(() => {
  process.exitCode = 0
})

describe("the exit code map", () => {
  test("maps every error code to its stable exit code", () => {
    for (const code of errorCodes) {
      expect(exitCodeOf(code)).toBe(expectedExitCodes[code])
    }
  })

  test("classifies a representative error of each class", () => {
    expect(classify(new InvalidIssueRef({ input: "x", message: "bad ref" }))).toBe("validation")
    expect(classify(new TeamResolutionError({ message: "no team" }))).toBe("not_linked")
    expect(
      classify(new ProjectNameAmbiguousError({ name: "Tracker", message: "two projects" })),
    ).toBe("ambiguous")
    expect(classify(new LinearAuthError({ message: "rejected", status: 401 }))).toBe("auth")
    expect(classify(new LinearAuthError({ message: "denied", status: 403 }))).toBe("forbidden")
    expect(classify(new LinearRateLimitError({ message: "slow down" }))).toBe("rate_limited")
    expect(classify(new LinearNetworkError({ message: "offline" }))).toBe("network")
    expect(
      classify(new LinearGraphQLError({ message: "Entity not found: Issue", details: [] })),
    ).toBe("not_found")
    expect(
      classify(new ConflictError({ expected: "a", current: "b", message: "The issue changed." })),
    ).toBe("conflict")
    expect(classify(new Error("boom"))).toBe("internal")
  })
})

describe("the process exit code", () => {
  test("a bad flag exits 2", async () => {
    const failure = await runRoot(unusedHandler, ["issue", "show", "--bogus"], []).catch(
      (error: unknown) => error,
    )

    if (!CliError.isCliError(failure)) {
      throw new Error("expected a CLI parse error")
    }
    expect(exitCodeOfCliError(failure)).toBe(2)
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

  test("a bad limit exits 2", async () => {
    await runIssue(unusedHandler, ["list", "--limit", "0", "--json"], [])

    expect(process.exitCode).toBe(2)
  })

  test("a missing issue exits 3", async () => {
    await runIssue(graphqlErrors("Entity not found: Issue"), ["show", "RAT-404", "--json"], [])

    expect(process.exitCode).toBe(3)
  })

  test("a stale --if-unchanged write exits 4", async () => {
    const { recorder } = body("Intro.")

    await runIssue(
      recorder.handler,
      [
        "update",
        "RAT-1",
        "--priority",
        "high",
        "--if-unchanged",
        "2025-01-01T09:00:00.000Z",
        "--json",
      ],
      [],
    )

    expect(process.exitCode).toBe(4)
  })

  test("a missing key exits 5", async () => {
    await runRoot(unusedHandler, ["whoami", "--json"], [], undefined, {
      env: { HOME: "/home/test" },
      profiles: [],
    })

    expect(process.exitCode).toBe(5)
  })

  test("a forbidden request exits 5", async () => {
    await runRoot(forbidden, ["whoami", "--json"], [])

    expect(process.exitCode).toBe(5)
  })

  test("a rate limit exits 6", async () => {
    await runIssue(rateLimited, ["show", "RAT-1", "--json"], [])

    expect(process.exitCode).toBe(6)
  })

  test("an unexpected failure exits 1", async () => {
    await runIssue(graphqlErrors("Something broke"), ["show", "RAT-1", "--json"], [])

    expect(process.exitCode).toBe(1)
  })
})
