import type { MemorySeed } from "@test/fake-linear/gateway/model"

import { seed } from "@test/apply/fixtures"
import { memoryApiLayer } from "@test/fake-linear/memory-layer"
import { defaultEnv } from "@test/fake-linear/model"
import { describe, expect, test } from "bun:test"
import { Effect } from "effect"

import { toTrackerError } from "@/cli/error-report"
import { ContextResolver } from "@/context/resolve"
import { TrackerError } from "@/domain/error"
import { IssueApply } from "@/tracker/apply"
import { applyPlan } from "@/tracker/plan"
import { IssuePublish } from "@/tracker/publish"

const repositories = [
  { key: process.cwd(), team: "RAT", teamId: "00000000-0000-0000-0000-000000000001" },
]

const run = <A, E>(
  seedValue: MemorySeed,
  effect: Effect.Effect<A, E, ContextResolver | IssueApply | IssuePublish>,
) =>
  effect.pipe(
    Effect.provide(memoryApiLayer(seedValue, { env: defaultEnv, repositories })),
    Effect.runPromise,
  )

const conflictClassifier = (): TrackerError =>
  new TrackerError({ code: "conflict", message: "The stub classifier ran.", hint: null })

describe("the write plan error channel", () => {
  test("a failed apply step carries a TrackerError cause", async () => {
    const result = await run(
      seed({ failOn: ["mutation CreateComment"] }),
      Effect.gen(function* applyFailingComment() {
        const contexts = yield* ContextResolver
        const apply = yield* IssueApply
        const context = yield* contexts.resolve({ team: "RAT", viewer: true })
        const plan = yield* apply.plan(context, "RAT-1", {
          title: "Changed title",
          comment: { body: "Cannot post.", dedupeKey: "fail-1" },
        })
        return yield* applyPlan(plan, { classifyError: toTrackerError })
      }),
    )

    expect(result.status).toBe("failed")
    expect(result.cause).toBeInstanceOf(TrackerError)
    expect(result.cause?.code).toBe("internal")
  })

  test("a failed publish step carries a TrackerError cause", async () => {
    const result = await run(
      seed({ failOn: ["mutation IssueRelationCreate"] }),
      Effect.gen(function* publishFailingEdge() {
        const contexts = yield* ContextResolver
        const publish = yield* IssuePublish
        const context = yield* contexts.resolve({ team: "RAT", viewer: true })
        const plan = yield* publish.plan(context, {
          team: "RAT",
          parent: "RAT-1",
          defaults: { priority: "medium", labels: ["ready-for-agent"], assignee: "me" },
          nodes: [
            { key: "spec", kind: "spec", title: "The spec" },
            { key: "client", kind: "ticket", title: "The client", blockedBy: ["spec"] },
          ],
        })
        return yield* publish.execute(plan, toTrackerError)
      }),
    )

    expect(result.status).toBe("failed")
    expect(result.cause).toBeInstanceOf(TrackerError)
    expect(result.cause?.code).toBe("internal")
  })

  test("a failed apply step uses the injected classifier", async () => {
    const result = await run(
      seed({ failOn: ["mutation CreateComment"] }),
      Effect.gen(function* applyFailingCommentWithStub() {
        const contexts = yield* ContextResolver
        const apply = yield* IssueApply
        const context = yield* contexts.resolve({ team: "RAT", viewer: true })
        const plan = yield* apply.plan(context, "RAT-1", {
          comment: { body: "Cannot post.", dedupeKey: "stub-1" },
        })
        return yield* applyPlan(plan, { classifyError: conflictClassifier })
      }),
    )

    expect(result.status).toBe("failed")
    expect(result.cause).toBeInstanceOf(TrackerError)
    expect(result.cause?.code).toBe("conflict")
  })

  test("a failed publish step uses the injected classifier", async () => {
    const result = await run(
      seed({ failOn: ["mutation IssueRelationCreate"] }),
      Effect.gen(function* publishFailingEdgeWithStub() {
        const contexts = yield* ContextResolver
        const publish = yield* IssuePublish
        const context = yield* contexts.resolve({ team: "RAT", viewer: true })
        const plan = yield* publish.plan(context, {
          team: "RAT",
          parent: "RAT-1",
          nodes: [
            { key: "spec", kind: "spec", title: "The spec" },
            { key: "client", kind: "ticket", title: "The client", blockedBy: ["spec"] },
          ],
        })
        return yield* publish.execute(plan, conflictClassifier)
      }),
    )

    expect(result.status).toBe("failed")
    expect(result.cause).toBeInstanceOf(TrackerError)
    expect(result.cause?.code).toBe("conflict")
  })
})
