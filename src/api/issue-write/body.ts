import { Effect } from "effect"

import type { LinearClient } from "@/api/client"
import type { IssueSummary } from "@/api/issue-model"
import type { IssueWriteApiError } from "@/api/issue-write/model"
import type { makeIssueWriteResolvers } from "@/api/issue-write/resolvers"
import type {
  IssueUpdateOptions,
  IssueUpdatePlan,
  IssueUpdateWriteOptions,
  SectionWriteOptions,
  SectionWriteResult,
} from "@/api/issue-write/write-types"
import type { Section } from "@/domain/body/section/model"

import { updateIssueMutation } from "@/api/issue-query"
import { UpdateIssueResponse } from "@/api/issue-schema"
import { ensureUnchanged, makeReadIssueBody } from "@/api/issue-write/body/snapshot"
import { unwrapIssue } from "@/api/issue-write/model"
import { makeUpdateFields } from "@/api/issue-write/update-fields"
import { unifiedDiff } from "@/domain/body/diff"
import { readSection as readSectionText } from "@/domain/body/section"
import {
  appendSection as appendToText,
  replaceSection as replaceInText,
} from "@/domain/body/section/edit"
import { normalizeLineEndings } from "@/domain/body/text"
import { toPriority } from "@/domain/priority"

type BodyDependencies = {
  readonly client: LinearClient["Service"]
  readonly resolvers: ReturnType<typeof makeIssueWriteResolvers>
}

type SectionTransform = (
  body: string,
  heading: string,
  content: string,
) => ReturnType<typeof replaceInText>

const appendBody = (current: string, addition: string): string => {
  const base = normalizeLineEndings(current).trimEnd()
  const tail = normalizeLineEndings(addition).replace(/\n+$/u, "")
  return base.length === 0 ? tail : `${base}\n\n${tail}`
}

const updateChanges = (options: IssueUpdateOptions): Readonly<Record<string, unknown>> => {
  const changes: Record<string, unknown> = {}
  if (options.title !== undefined) {
    changes.title = options.title
  }
  if (options.body !== undefined) {
    changes.body = options.append === true ? "append" : "replace"
  }
  if (options.state !== undefined) {
    changes.state = options.state
  }
  if (options.assignee !== undefined) {
    changes.assignee = options.assignee
  }
  if (options.project !== undefined) {
    changes.project = options.project
  }
  if (options.parent !== undefined) {
    changes.parent = options.parent
  }
  if (options.priority !== undefined) {
    changes.priority = toPriority(options.priority)
  }
  return changes
}

const makeBodyWrites = ({ client, resolvers }: BodyDependencies) => {
  const readIssueBody = makeReadIssueBody(client)
  const resolveUpdateFields = makeUpdateFields(resolvers)

  const writeBody = Effect.fn("IssueWriteApi.writeBody")(function* writeBody(
    issueId: string,
    body: string,
  ) {
    const data = yield* client.execute(
      updateIssueMutation,
      { id: issueId, input: { description: body } },
      UpdateIssueResponse,
    )
    return yield* unwrapIssue(data.issueUpdate)
  })

  const readSection = Effect.fn("IssueWriteApi.readSection")(function* readSection(
    ref: string,
    heading: string,
  ): Effect.fn.Return<Section, IssueWriteApiError> {
    const issue = yield* readIssueBody(ref)
    return yield* Effect.fromResult(readSectionText(issue.description ?? "", heading))
  })

  const changeSection = (
    action: "section-append" | "section-replace",
    ref: string,
    heading: string,
    body: string,
    options: SectionWriteOptions,
    transform: SectionTransform,
  ): Effect.Effect<SectionWriteResult, IssueWriteApiError> =>
    Effect.gen(function* changeSectionBody() {
      const issue = yield* readIssueBody(ref)
      yield* ensureUnchanged(issue.identifier, issue.updatedAt, options.ifUnchanged)
      const current = issue.description ?? ""
      const next = yield* Effect.fromResult(transform(current, heading, body))
      const section = yield* Effect.fromResult(readSectionText(next, heading))
      if (options.dryRun === true) {
        return {
          dryRun: true,
          action,
          target: issue.identifier,
          heading,
          level: section.level,
          diff: unifiedDiff(current, next),
        }
      }
      const updated = yield* writeBody(issue.id, next)
      return {
        dryRun: false,
        action,
        target: issue.identifier,
        heading,
        level: section.level,
        issue: updated,
      }
    })

  const appendSection = Effect.fn("IssueWriteApi.appendSection")(function* appendSection(
    ref: string,
    heading: string,
    body: string,
    options: SectionWriteOptions = {},
  ): Effect.fn.Return<SectionWriteResult, IssueWriteApiError> {
    return yield* changeSection(
      "section-append",
      ref,
      heading,
      body,
      options,
      (current, name, content) => appendToText(current, name, content, options.level),
    )
  })

  const replaceSection = Effect.fn("IssueWriteApi.replaceSection")(function* replaceSection(
    ref: string,
    heading: string,
    body: string,
    options: SectionWriteOptions = {},
  ): Effect.fn.Return<SectionWriteResult, IssueWriteApiError> {
    return yield* changeSection("section-replace", ref, heading, body, options, replaceInText)
  })

  const resolveUpdate = Effect.fn("IssueWriteApi.resolveUpdate")(function* resolveUpdate(
    ref: string,
    options: IssueUpdateOptions,
    writeOptions: IssueUpdateWriteOptions,
  ) {
    const readsBody = options.append === true || writeOptions.ifUnchanged !== undefined
    const issueBody = readsBody ? yield* readIssueBody(ref) : undefined
    const issueId = issueBody === undefined ? yield* resolvers.resolveIssueId(ref) : issueBody.id
    if (issueBody !== undefined) {
      yield* ensureUnchanged(issueBody.identifier, issueBody.updatedAt, writeOptions.ifUnchanged)
    }
    const input = yield* resolveUpdateFields(issueId, options)
    if (options.body !== undefined) {
      input.description =
        options.append === true
          ? appendBody(issueBody?.description ?? "", options.body)
          : options.body
    }
    return { issueId, input, issueBody }
  })

  const planUpdate = Effect.fn("IssueWriteApi.planUpdate")(function* planUpdate(
    ref: string,
    options: IssueUpdateOptions,
    writeOptions: IssueUpdateWriteOptions = {},
  ): Effect.fn.Return<IssueUpdatePlan, IssueWriteApiError> {
    const resolved = yield* resolveUpdate(ref, options, writeOptions)
    const summary = resolved.issueBody ?? (yield* resolvers.readIssueSummary(ref))
    const current = resolved.issueBody?.description ?? ""
    const diff =
      options.append === true && typeof resolved.input.description === "string"
        ? unifiedDiff(current, resolved.input.description)
        : null
    return { identifier: summary.identifier, changes: updateChanges(options), diff }
  })

  const update = Effect.fn("IssueWriteApi.update")(function* update(
    ref: string,
    options: IssueUpdateOptions,
    writeOptions: IssueUpdateWriteOptions = {},
  ): Effect.fn.Return<IssueSummary, IssueWriteApiError> {
    const resolved = yield* resolveUpdate(ref, options, writeOptions)
    if (Object.keys(resolved.input).length === 0) {
      return yield* resolvers.readIssueSummary(ref)
    }
    const data = yield* client.execute(
      updateIssueMutation,
      { id: resolved.issueId, input: resolved.input },
      UpdateIssueResponse,
    )
    return yield* unwrapIssue(data.issueUpdate)
  })

  return { appendSection, planUpdate, readSection, replaceSection, update }
}

export { makeBodyWrites }
