import { Effect } from "effect"

import type { ResolvedContext } from "@/context/model"
import type { SectionReplacement } from "@/domain/section"
import type { LinearClientShape } from "@/linear/client"
import type { IssueWriteApiError } from "@/tracker/write/model"
import type { makeIssueWriteResolvers } from "@/tracker/write/resolvers"
import type {
  IssueUpdateSectionsOptions,
  IssueUpdateSectionsPlan,
  IssueUpdateSectionsResult,
  IssueUpdateWriteOptions,
} from "@/tracker/write/write-types"

import { unifiedDiff } from "@/domain/body/diff"
import { editSections as editSectionsInText } from "@/domain/body/section/batch"
import { UpdateIssueResponse } from "@/linear/decode/issue"
import { ensureUnchanged, makeReadIssueBody } from "@/tracker/write/body/snapshot"
import { updateIssueMutation } from "@/tracker/write/documents"
import { unwrapIssue } from "@/tracker/write/model"
import { makeUpdateFields } from "@/tracker/write/update-fields"

type SectionDependencies = {
  readonly client: LinearClientShape
  readonly resolvers: ReturnType<typeof makeIssueWriteResolvers>
}

const makeSectionWrites = ({ client, resolvers }: SectionDependencies) => {
  const readIssueBody = makeReadIssueBody(client)
  const resolveUpdateFields = makeUpdateFields(resolvers)

  const resolveSectionsUpdate = Effect.fn("IssueWriter.resolveSectionsUpdate")(
    function* resolveSectionsUpdate(
      context: ResolvedContext,
      ref: string,
      options: IssueUpdateSectionsOptions,
      sections: readonly SectionReplacement[],
      writeOptions: IssueUpdateWriteOptions,
    ) {
      const issueBody = yield* readIssueBody(ref)
      yield* ensureUnchanged(issueBody.identifier, issueBody.updatedAt, writeOptions.ifUnchanged)
      const current = issueBody.description ?? ""
      const replaced = yield* Effect.fromResult(
        editSectionsInText(
          current,
          sections.map((section) => ({ ...section, mode: "replace" as const })),
        ),
      )
      const input = yield* resolveUpdateFields(context, issueBody.id, options)
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

  const planUpdateSections = Effect.fn("IssueWriter.planUpdateSections")(
    function* planUpdateSections(
      context: ResolvedContext,
      ref: string,
      options: IssueUpdateSectionsOptions,
      sections: readonly SectionReplacement[],
      writeOptions: IssueUpdateWriteOptions = {},
    ): Effect.fn.Return<IssueUpdateSectionsPlan, IssueWriteApiError> {
      const resolved = yield* resolveSectionsUpdate(context, ref, options, sections, writeOptions)
      return {
        status: Object.keys(resolved.input).length === 0 ? "skipped" : "updated",
        updatedAt: resolved.issueBody.updatedAt,
        sections: resolved.sections,
        diff: unifiedDiff(resolved.current, resolved.next),
      }
    },
  )

  const updateSections = Effect.fn("IssueWriter.updateSections")(function* updateSections(
    context: ResolvedContext,
    ref: string,
    options: IssueUpdateSectionsOptions,
    sections: readonly SectionReplacement[],
    writeOptions: IssueUpdateWriteOptions = {},
  ): Effect.fn.Return<IssueUpdateSectionsResult, IssueWriteApiError> {
    const resolved = yield* resolveSectionsUpdate(context, ref, options, sections, writeOptions)
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
