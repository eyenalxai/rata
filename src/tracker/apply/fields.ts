import { Effect } from "effect"

import type { ResolvedContext } from "@/context/model"
import type { ApplyDocument } from "@/domain/apply"
import type { ApplyPlanError, ApplyWriter } from "@/tracker/apply/model"
import type { IssueWorkingSetFull } from "@/tracker/model"
import type { ApplyStep, PlannedAction } from "@/tracker/plan"

import { TrackerError as TrackerErrorClass } from "@/domain/error"
import { isUuid } from "@/domain/id"
import { parsePriority, priorityValue } from "@/domain/priority"

type FieldName = "title" | "state" | "assignee" | "priority" | "project" | "parent"

type FieldPlan = {
  readonly name: FieldName
  readonly status: "updated" | "skipped"
  readonly value: unknown
  readonly input?: Readonly<Record<string, unknown>> | undefined
}

type FieldDependencies = {
  readonly writer: ApplyWriter
}

const validationError = (message: string, hint: string | null = null) =>
  new TrackerErrorClass({ code: "validation", message, hint })

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
  return dependencies.writer
    .resolveState(context, snapshot.id, state)
    .pipe(
      Effect.map((resolved) =>
        resolved.name === snapshot.state.name
          ? unchanged("state", state)
          : changed("state", state, { stateId: resolved.id }),
      ),
    )
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
  if (isUuid(assignee) || assignee.toLowerCase() === "me") {
    return dependencies.writer
      .resolveAssignee(context, assignee)
      .pipe(
        Effect.map((id) =>
          snapshot.assignee?.id === id
            ? unchanged("assignee", assignee)
            : changed("assignee", assignee, { assigneeId: id }),
        ),
      )
  }
  return Effect.fail(validationError("The assignee accepts `me`, a user UUID, or null."))
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
  return dependencies.writer
    .resolveProject(project)
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
  return dependencies.writer
    .resolveParent(parent)
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
): Effect.Effect<ApplyStep | null, ApplyPlanError> =>
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
      issueId: snapshot.id,
      input: inputOfPlans(updated),
    }
  })

export { planFieldStep }
