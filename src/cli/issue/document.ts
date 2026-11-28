import type { Result } from "effect"

import { Effect, Schema, SchemaIssue } from "effect"

import type { ApplyComment, ApplyDocument, HandoffDocument } from "@/domain/apply"
import type { PublishDocument } from "@/domain/publish"

import { ApplyDocumentJson, HandoffDocumentJson } from "@/domain/apply"
import { TrackerError } from "@/domain/error"
import { PublishDocumentJson } from "@/domain/publish"

const formatIssue = SchemaIssue.makeFormatterDefault()
type Issue = Parameters<typeof formatIssue>[0]

const applyHint = "Pass one JSON object with fields, labels, sections, comment or relations."
const handoffHint =
  "Pass one JSON object with pr and optional fields, labels, sections, comment or relations."
const publishHint = "Pass one JSON object with team, parent, defaults and nodes."

const emptyDocument = (label: string, hint: string): TrackerError =>
  new TrackerError({
    code: "validation",
    message: `The ${label} document is empty.`,
    hint,
  })

const emptyApplyDocument = (): TrackerError => emptyDocument("apply", applyHint)
const emptyHandoffDocument = (): TrackerError => emptyDocument("handoff", handoffHint)
const emptyPublishDocument = (): TrackerError => emptyDocument("publish", publishHint)

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

const decodePublishDocument = (text: string): Effect.Effect<PublishDocument, TrackerError> =>
  decodeResult(
    Schema.decodeResult(PublishDocumentJson, { onExcessProperty: "error" })(text),
    "publish",
    publishHint,
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
  decodePublishDocument,
  emptyApplyDocument,
  emptyHandoffDocument,
  emptyPublishDocument,
  requireDedupeKey,
}
