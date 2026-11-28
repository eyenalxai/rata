import type { Handler } from "@test/fake-linear/model"

import { runIssue, runRoot } from "@test/cli-harness"
import { jsonResponse } from "@test/issue-fixtures"
import { describe, expect, test } from "bun:test"
import { CliError } from "effect/cli"

import type { ErrorCode } from "@/domain/error"

import { ProjectNameAmbiguousError } from "@/api/project/errors"
import { TeamResolutionError } from "@/api/team"
import { exitCodeOf } from "@/cli/error-report"
import { exitCodeOfCliError } from "@/cli/runner"
import { DatabaseError } from "@/db/database"
import { ConflictError } from "@/domain/conflict"
import { TrackerError } from "@/domain/error"
import { toTrackerError } from "@/domain/error/report"
import { InvalidIssueRef } from "@/domain/issue-ref"
import {
  LinearAuthError,
  LinearGraphQLError,
  LinearNetworkError,
  LinearRateLimitError,
} from "@/linear/errors"

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

const classify = (error: unknown): ErrorCode => toTrackerError(error).code

describe("the exit code map", () => {
  test("maps every error code to its stable exit code", () => {
    for (const code of errorCodes) {
      expect(exitCodeOf(code)).toBe(expectedExitCodes[code])
    }
  })

  test("maps every public error to one TrackerError", () => {
    const samples: readonly unknown[] = [
      new InvalidIssueRef({ input: "x", message: "bad ref" }),
      new TeamResolutionError({ message: "no team" }),
      new ProjectNameAmbiguousError({ name: "Tracker", message: "two projects" }),
      new LinearAuthError({ message: "rejected", status: 401 }),
      new LinearRateLimitError({ message: "slow down" }),
      new LinearNetworkError({ message: "offline" }),
      new LinearGraphQLError({ message: "Entity not found: Issue", details: [] }),
      new ConflictError({ expected: "a", current: "b", message: "The issue changed." }),
      new Error("boom"),
    ]
    for (const sample of samples) {
      expect(toTrackerError(sample)).toBeInstanceOf(TrackerError)
    }
    const passthrough = new TrackerError({ code: "internal", message: "kept", hint: null })
    expect(toTrackerError(passthrough)).toBe(passthrough)
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
    expect(classify(new DatabaseError({ message: "Could not open the database." }))).toBe(
      "internal",
    )
    expect(classify(new Error("boom"))).toBe("internal")
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
    const exit = await runIssue(unusedHandler, ["list", "--limit", "0", "--format", "json"], [])

    expect(exit.code).toBe(2)
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
