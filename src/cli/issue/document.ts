import type { Result } from "effect"

import { Effect, Schema, SchemaIssue } from "effect"

import type { ApplyComment, ApplyDocument, HandoffDocument } from "@/domain/apply"

import { ApplyDocumentJson, HandoffDocumentJson } from "@/domain/apply"
import { TrackerError } from "@/domain/error"

const formatIssue = SchemaIssue.makeFormatterDefault()
type Issue = Parameters<typeof formatIssue>[0]

const applyHint = "Pass one JSON object with fields, labels, sections, comment or relations."
const handoffHint =
  "Pass one JSON object with pr and optional fields, labels, sections, comment or relations."

const emptyDocument = (label: string, hint: string): TrackerError =>
  new TrackerError({
    code: "validation",
    message: `The ${label} document is empty.`,
    hint,
  })

const emptyApplyDocument = (): TrackerError => emptyDocument("apply", applyHint)
const emptyHandoffDocument = (): TrackerError => emptyDocument("handoff", handoffHint)

const decodeResult = <A, E extends { readonly issue: Issue }>(
  decoded: Result.Result<A, E>,
  label: string,
  hint: string,
): Effect.Effect<A, TrackerError> => {
  if (decoded._tag === "Success") {
    return Effect.succeed(decoded.success)
  }
  return Effect.fail(
    new TrackerError({
      code: "validation",
      message: `The ${label} document is invalid: ${formatIssue(decoded.failure.issue)}`,
      hint,
    }),
  )
}

const decodeApplyDocument = (text: string): Effect.Effect<ApplyDocument, TrackerError> =>
  decodeResult(
    Schema.decodeUnknownResult(ApplyDocumentJson, { onExcessProperty: "error" })(text),
    "apply",
    applyHint,
  )

const decodeHandoffDocument = (text: string): Effect.Effect<HandoffDocument, TrackerError> =>
  decodeResult(
    Schema.decodeUnknownResult(HandoffDocumentJson, { onExcessProperty: "error" })(text),
    "handoff",
    handoffHint,
  )

const requireDedupeKey = (document: {
  readonly comment?: ApplyComment | undefined
}): Effect.Effect<void, TrackerError> => {
  const comment = document.comment
  if (comment === undefined) {
    return Effect.void
  }
  if (comment.dedupeKey === undefined || comment.dedupeKey.trim().length === 0) {
    return Effect.fail(
      new TrackerError({
        code: "validation",
        message: "The comment needs a dedupeKey.",
        hint: "Set comment.dedupeKey to a stable string so a retry is safe.",
      }),
    )
  }
  return Effect.void
}

export {
  decodeApplyDocument,
  decodeHandoffDocument,
  emptyApplyDocument,
  emptyHandoffDocument,
  requireDedupeKey,
}
