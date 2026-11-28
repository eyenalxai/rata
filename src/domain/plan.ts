import { Schema } from "effect"

const planActionNames = [
  "assign",
  "unassign",
  "close",
  "reopen",
  "create",
  "reuse",
  "update",
  "config-set",
  "config-unset",
  "comment-create",
  "comment-update",
  "comment-delete",
  "section-append",
  "section-replace",
  "add-label",
  "remove-label",
  "link",
  "unlink",
  "publish",
] as const
type PlanActionName = (typeof planActionNames)[number]

const PlanActionNameSchema = Schema.Literals(planActionNames)

const planStatuses = ["updated", "skipped"] as const
type PlanStatus = (typeof planStatuses)[number]

const PlanStatusSchema = Schema.Literals(planStatuses)

const PlanAction = Schema.Struct({
  action: PlanActionNameSchema,
  target: Schema.String,
  changes: Schema.Record(Schema.String, Schema.Unknown),
})
type PlanAction = typeof PlanAction.Type

const PlanStep = Schema.Struct({
  action: PlanActionNameSchema,
  target: Schema.String,
  status: PlanStatusSchema,
  changes: Schema.Record(Schema.String, Schema.Unknown),
})
type PlanStep = typeof PlanStep.Type

export { type PlanActionName, type PlanStatus, PlanAction, PlanStep }
