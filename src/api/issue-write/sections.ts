import { Effect } from "effect"

import type { LinearClient } from "@/api/client"
import type { IssueWriteApiError } from "@/api/issue-write/model"
import type { makeIssueWriteResolvers } from "@/api/issue-write/resolvers"
import type {
  IssueSectionReplacement,
  IssueUpdateSectionsOptions,
  IssueUpdateSectionsPlan,
  IssueUpdateSectionsResult,
  IssueUpdateWriteOptions,
} from "@/api/issue-write/write-types"

import { updateIssueMutation } from "@/api/issue-query"
import { UpdateIssueResponse } from "@/api/issue-schema"
import { ensureUnchanged, makeReadIssueBody } from "@/api/issue-write/body/snapshot"
import { unwrapIssue } from "@/api/issue-write/model"
import { makeUpdateFields } from "@/api/issue-write/update-fields"
import { unifiedDiff } from "@/domain/body/diff"
import { replaceSections as replaceSectionsInText } from "@/domain/body/section/edit"

type SectionDependencies = {
  readonly client: LinearClient["Service"]
  readonly resolvers: ReturnType<typeof makeIssueWriteResolvers>
}

const makeSectionWrites = ({ client, resolvers }: SectionDependencies) => {
  const readIssueBody = makeReadIssueBody(client)
  const resolveUpdateFields = makeUpdateFields(resolvers)

  const resolveSectionsUpdate = Effect.fn("IssueWriteApi.resolveSectionsUpdate")(
    function* resolveSectionsUpdate(
      ref: string,
      options: IssueUpdateSectionsOptions,
      sections: readonly IssueSectionReplacement[],
      writeOptions: IssueUpdateWriteOptions,
    ) {
      const issueBody = yield* readIssueBody(ref)
      yield* ensureUnchanged(issueBody.identifier, issueBody.updatedAt, writeOptions.ifUnchanged)
      const current = issueBody.description ?? ""
      const replaced = yield* Effect.fromResult(replaceSectionsInText(current, sections))
      const input = yield* resolveUpdateFields(issueBody.id, options)
      if (replaced.body !== current) {
        input.description = replaced.body
      }
      return {
        issueBody,
        current,
        next: replaced.body,
        sections: replaced.sections,
        input,
      }
    },
  )

  const planUpdateSections = Effect.fn("IssueWriteApi.planUpdateSections")(
    function* planUpdateSections(
      ref: string,
      options: IssueUpdateSectionsOptions,
      sections: readonly IssueSectionReplacement[],
      writeOptions: IssueUpdateWriteOptions = {},
    ): Effect.fn.Return<IssueUpdateSectionsPlan, IssueWriteApiError> {
      const resolved = yield* resolveSectionsUpdate(ref, options, sections, writeOptions)
      return {
        status: Object.keys(resolved.input).length === 0 ? "skipped" : "updated",
        updatedAt: resolved.issueBody.updatedAt,
        sections: resolved.sections,
        diff: unifiedDiff(resolved.current, resolved.next),
      }
    },
  )

  const updateSections = Effect.fn("IssueWriteApi.updateSections")(function* updateSections(
    ref: string,
    options: IssueUpdateSectionsOptions,
    sections: readonly IssueSectionReplacement[],
    writeOptions: IssueUpdateWriteOptions = {},
  ): Effect.fn.Return<IssueUpdateSectionsResult, IssueWriteApiError> {
    const resolved = yield* resolveSectionsUpdate(ref, options, sections, writeOptions)
    if (Object.keys(resolved.input).length === 0) {
      const issue = yield* resolvers.readIssueSummary(ref)
      return {
        status: "skipped",
        updatedAt: issue.updatedAt,
        issue,
        sections: resolved.sections,
      }
    }
    const data = yield* client.execute(
      updateIssueMutation,
      { id: resolved.issueBody.id, input: resolved.input },
      UpdateIssueResponse,
    )
    const issue = yield* unwrapIssue(data.issueUpdate)
    return {
      status: "updated",
      updatedAt: issue.updatedAt,
      issue,
      sections: resolved.sections,
    }
  })

  return { planUpdateSections, updateSections }
}

export { makeSectionWrites }
