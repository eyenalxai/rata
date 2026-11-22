import { Context, Effect, Layer } from "effect"

import type { IssueWriteApiShape } from "@/api/issue-write/shape"

import { ContextResolver } from "@/context/resolve"
import { IssueWriter } from "@/tracker/write"

class IssueWriteApi extends Context.Service<IssueWriteApi, IssueWriteApiShape>()(
  "rata-cli/api/issue-write/IssueWriteApi",
) {
  static readonly layer = Layer.effect(
    IssueWriteApi,
    Effect.gen(function* issueWriteApiLayer() {
      const contexts = yield* ContextResolver
      const writer = yield* IssueWriter

      return IssueWriteApi.of({
        addLabels: writer.addLabels,
        addLabelsToChildren: writer.addLabelsToChildren,
        appendSection: writer.appendSection,
        assign: writer.assign,
        assignChildren: writer.assignChildren,
        close: writer.close,
        commentCreate: writer.commentCreate,
        commentDelete: writer.commentDelete,
        commentUpdate: writer.commentUpdate,
        create: (options) =>
          contexts
            .resolve({ requireTeam: true, team: options.team })
            .pipe(Effect.flatMap((context) => writer.create(context, options))),
        findComment: writer.findComment,
        link: writer.link,
        planCommentCreate: writer.planCommentCreate,
        planCommentDelete: writer.planCommentDelete,
        planCreate: (options) =>
          contexts
            .resolve({ requireTeam: true, team: options.team })
            .pipe(Effect.flatMap((context) => writer.planCreate(context, options))),
        planUpdate: writer.planUpdate,
        planUpdateSections: writer.planUpdateSections,
        readSection: writer.readSection,
        removeLabels: writer.removeLabels,
        removeLabelsFromChildren: writer.removeLabelsFromChildren,
        reopen: writer.reopen,
        replaceSection: writer.replaceSection,
        unassign: writer.unassign,
        unlink: writer.unlink,
        update: writer.update,
        updateSections: writer.updateSections,
      })
    }),
  )
}

export { IssueWriteApi }
