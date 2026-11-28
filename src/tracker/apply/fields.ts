/* oxlint-disable complexity -- the planner is a flat list of optional fields, not nested control flow. */
import { Effect } from "effect"

import type { ResolvedContext } from "@/context/model"
import type { ContextResolver } from "@/context/resolve"
import type { ApplyDocument } from "@/domain/apply"
import type { LinearClientShape } from "@/linear/client"
import type { IssueWorkingSetFull } from "@/tracker/model"
import type { ApplyPlanError, PlannedAction, PlanStep } from "@/tracker/plan"
import type { makeIssueWriteResolvers } from "@/tracker/write/resolvers"

import { TrackerError } from "@/domain/error"
import { isUuid, userId } from "@/domain/id"
import { parsePriority, priorityValue } from "@/domain/priority"
import { UpdateIssueResponse } from "@/linear/decode/issue"
import { AssigneeInputError } from "@/tracker/error"
import { updateIssueMutation } from "@/tracker/write/documents"
import { unwrapIssue } from "@/tracker/write/model"

type FieldName = "title" | "state" | "assignee" | "priority" | "project" | "parent"

type FieldPlan = {
  readonly name: FieldName
  readonly status: "updated" | "skipped"
  readonly value: unknown
  readonly input?: Readonly<Record<string, unknown>> | undefined
}

type FieldDependencies = {
  readonly client: LinearClientShape
  readonly contexts: ContextResolver["Service"]
  readonly resolvers: ReturnType<typeof makeIssueWriteResolvers>
}

const validationError = (message: string, hint: string | null = null) =>
  new TrackerError({ code: "validation", message, hint })

const unchanged = (name: FieldName, value: unknown): FieldPlan => ({
  name,
  status: "skipped",
  value,
})

const changed = (
  name: FieldName,
  value: unknown,
  input: Readonly<Record<string, unknown>>,
): FieldPlan => ({ name, status: "updated", value, input })

const planTitle = (title: string | undefined, snapshot: IssueWorkingSetFull) => {
  if (title === undefined) {
    return Effect.succeed<FieldPlan | null>(null)
  }
  const next = title.trim()
  return next.length === 0
    ? Effect.fail(validationError("The title must not be empty."))
    : Effect.succeed(
        next === snapshot.title
          ? unchanged("title", next)
          : changed("title", next, { title: next }),
      )
}

const planState = (
  dependencies: FieldDependencies,
  context: ResolvedContext,
  snapshot: IssueWorkingSetFull,
  state: string | undefined,
) => {
  if (state === undefined) {
    return Effect.succeed<FieldPlan | null>(null)
  }
  if (snapshot.state.name.toLowerCase() === state.toLowerCase()) {
    return Effect.succeed(unchanged("state", state))
  }
  return dependencies.resolvers
    .issueStateIdByName(context, snapshot.id, state)
    .pipe(Effect.map((stateId) => changed("state", state, { stateId })))
}

const planAssignee = (
  dependencies: FieldDependencies,
  context: ResolvedContext,
  snapshot: IssueWorkingSetFull,
  assignee: string | null | undefined,
) => {
  if (assignee === undefined) {
    return Effect.succeed<FieldPlan | null>(null)
  }
  if (assignee === null) {
    return Effect.succeed(
      snapshot.assignee === null
        ? unchanged("assignee", null)
        : changed("assignee", null, { assigneeId: null }),
    )
  }
  if (assignee.toLowerCase() === "me") {
    return dependencies.contexts
      .viewer(context)
      .pipe(
        Effect.map((viewer) =>
          snapshot.assignee?.id === viewer.id
            ? unchanged("assignee", "me")
            : changed("assignee", "me", { assigneeId: viewer.id }),
        ),
      )
  }
  if (!isUuid(assignee)) {
    return Effect.fail(
      new AssigneeInputError({ message: "The assignee accepts `me`, a user UUID, or null." }),
    )
  }
  const id = userId(assignee)
  return Effect.succeed(
    snapshot.assignee?.id === id
      ? unchanged("assignee", assignee)
      : changed("assignee", assignee, { assigneeId: id }),
  )
}

const planPriority = (priority: string | undefined, snapshot: IssueWorkingSetFull) => {
  if (priority === undefined) {
    return Effect.succeed<FieldPlan | null>(null)
  }
  const parsed = parsePriority(priority)
  if (parsed._tag === "Failure") {
    return Effect.fail(validationError(parsed.failure))
  }
  return Effect.succeed(
    parsed.success === snapshot.priority
      ? unchanged("priority", parsed.success)
      : changed("priority", parsed.success, { priority: priorityValue(parsed.success) }),
  )
}

const planProject = (
  dependencies: FieldDependencies,
  snapshot: IssueWorkingSetFull,
  project: string | null | undefined,
) => {
  if (project === undefined) {
    return Effect.succeed<FieldPlan | null>(null)
  }
  if (project === null) {
    return Effect.succeed(
      snapshot.project === null
        ? unchanged("project", null)
        : changed("project", null, { projectId: null }),
    )
  }
  return dependencies.resolvers
    .resolveProjectId(project)
    .pipe(
      Effect.map((projectId) =>
        snapshot.project?.id === projectId
          ? unchanged("project", project)
          : changed("project", project, { projectId }),
      ),
    )
}

const planParent = (
  dependencies: FieldDependencies,
  snapshot: IssueWorkingSetFull,
  parent: string | null | undefined,
) => {
  if (parent === undefined) {
    return Effect.succeed<FieldPlan | null>(null)
  }
  if (parent === null) {
    return Effect.succeed(
      snapshot.parent === null
        ? unchanged("parent", null)
        : changed("parent", null, { parentId: null }),
    )
  }
  return dependencies.resolvers
    .resolveIssueId(parent)
    .pipe(
      Effect.flatMap((parentId) =>
        parentId === snapshot.id
          ? Effect.fail(validationError("An issue cannot be its own parent."))
          : Effect.succeed(
              snapshot.parent?.id === parentId
                ? unchanged("parent", parent)
                : changed("parent", parent, { parentId }),
            ),
      ),
    )
}

const planFields = (
  dependencies: FieldDependencies,
  context: ResolvedContext,
  snapshot: IssueWorkingSetFull,
  document: ApplyDocument,
): Effect.Effect<readonly FieldPlan[], ApplyPlanError> =>
  Effect.gen(function* planIssueFields() {
    const candidates = [
      yield* planTitle(document.title, snapshot),
      yield* planState(dependencies, context, snapshot, document.state),
      yield* planAssignee(dependencies, context, snapshot, document.assignee),
      yield* planPriority(document.priority, snapshot),
      yield* planProject(dependencies, snapshot, document.project),
      yield* planParent(dependencies, snapshot, document.parent),
    ]
    return candidates.filter((plan): plan is FieldPlan => plan !== null)
  })

const fieldAction = (ref: string, plan: FieldPlan): PlannedAction => ({
  action: "update-fields",
  target: ref,
  status: plan.status,
  changes: { field: plan.name, value: plan.value },
})

const inputOfPlans = (plans: readonly FieldPlan[]): Readonly<Record<string, unknown>> =>
  Object.fromEntries(
    plans.flatMap((plan) => (plan.input === undefined ? [] : Object.entries(plan.input))),
  )

const planFieldStep = (
  dependencies: FieldDependencies,
  context: ResolvedContext,
  ref: string,
  snapshot: IssueWorkingSetFull,
  document: ApplyDocument,
): Effect.Effect<PlanStep | null, ApplyPlanError> =>
  Effect.gen(function* planFieldWrite() {
    const plans = yield* planFields(dependencies, context, snapshot, document)
    if (plans.length === 0) {
      return null
    }
    const updated = plans.filter((plan) => plan.status === "updated")
    const status = updated.length === 0 ? "skipped" : "updated"
    return {
      action: "update-fields",
      target: ref,
      status,
      changes: Object.fromEntries(updated.map((plan) => [plan.name, plan.value])),
      changed: updated.map((plan) => plan.name),
      actions: plans.map((plan) => fieldAction(ref, plan)),
      execute:
        status === "skipped"
          ? Effect.void
          : dependencies.client
              .execute(
                updateIssueMutation,
                { id: snapshot.id, input: inputOfPlans(updated) },
                UpdateIssueResponse,
              )
              .pipe(Effect.flatMap((data) => unwrapIssue(data.issueUpdate))),
    }
  })

export { planFieldStep }
