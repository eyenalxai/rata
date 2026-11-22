import { Console, Context, Effect, Layer, Option, Ref } from "effect"

import type { IssueWriteApiShape } from "@/api/issue-write/shape"
import type { ResolvedContext } from "@/context/model"
import type { ContextResolveError, ResolveOptions } from "@/context/resolve/model"
import type { IssueUpdateOptions } from "@/tracker/write/write-types"

import { ContextResolver } from "@/context/resolve"
import { IssueWriter } from "@/tracker/write"

const identity: ResolveOptions = { viewer: false, withTeam: false }
const team: ResolveOptions = { viewer: false }

const needsTeam = (options: IssueUpdateOptions): boolean => options.state !== undefined

const covers = (context: ResolvedContext, options: ResolveOptions): boolean => {
  if (options.withTeam !== false && context.team === null) {
    return false
  }
  if (options.viewer !== false && context.viewer === null) {
    return false
  }
  if (options.team !== undefined && context.team !== null) {
    return context.team.identity.id === options.team || context.team.identity.key === options.team
  }
  return options.team === undefined
}

const reportWarning = (context: ResolvedContext): Effect.Effect<void> =>
  context.warning === null ? Effect.void : Console.error(`warning: ${context.warning}`)

class IssueWriteApi extends Context.Service<IssueWriteApi, IssueWriteApiShape>()(
  "rata-cli/api/issue-write/IssueWriteApi",
) {
  static readonly layer = Layer.effect(
    IssueWriteApi,
    Effect.gen(function* issueWriteApiLayer() {
      const contexts = yield* ContextResolver
      const writer = yield* IssueWriter
      const cached = yield* Ref.make<Option.Option<ResolvedContext>>(Option.none())
      const warned = yield* Ref.make(false)

      const withContext = <A, E>(
        options: ResolveOptions,
        run: (context: ResolvedContext) => Effect.Effect<A, E>,
        report = false,
      ): Effect.Effect<A, E | ContextResolveError> =>
        Effect.gen(function* runWithContext() {
          const current = yield* Ref.get(cached)
          const context =
            Option.isSome(current) && covers(current.value, options)
              ? current.value
              : yield* contexts.resolve(options)
          if (Option.isNone(current) || !covers(current.value, options)) {
            yield* Ref.set(cached, Option.some(context))
            yield* Ref.set(warned, false)
          }
          if (report && context.warning !== null && !(yield* Ref.get(warned))) {
            yield* reportWarning(context)
            yield* Ref.set(warned, true)
          }
          return yield* run(context)
        })

      return IssueWriteApi.of({
        addLabels: (ref, names, options) =>
          withContext(team, (context) => writer.addLabels(context, ref, names, options), true),
        addLabelsToChildren: (parentRef, names, options) =>
          withContext(
            team,
            (context) => writer.addLabelsToChildren(context, parentRef, names, options),
            true,
          ),
        appendSection: (ref, heading, body, options) =>
          withContext(identity, (context) =>
            writer.appendSection(context, ref, heading, body, options),
          ),
        assign: (ref, assignee, options) =>
          withContext(identity, (context) => writer.assign(context, ref, assignee, options)),
        assignChildren: (parentRef, assignee, options) =>
          withContext(identity, (context) =>
            writer.assignChildren(context, parentRef, assignee, options),
          ),
        close: (ref, body, options) =>
          withContext(team, (context) => writer.close(context, ref, body, options), true),
        commentCreate: (ref, body, options) =>
          withContext(identity, (context) => writer.commentCreate(context, ref, body, options)),
        commentDelete: (commentId) =>
          withContext(identity, (context) => writer.commentDelete(context, commentId)),
        commentUpdate: (commentId, body, options) =>
          withContext(identity, (context) =>
            writer.commentUpdate(context, commentId, body, options),
          ),
        create: (options) =>
          withContext(
            { requireTeam: true, team: options.team, viewer: false },
            (context) => writer.create(context, options),
            true,
          ),
        findComment: (commentId) =>
          withContext(identity, (context) => writer.findComment(context, commentId)),
        link: (ref, changes, options) =>
          withContext(identity, (context) => writer.link(context, ref, changes, options)),
        planCommentCreate: (ref, body, options) =>
          withContext(identity, (context) => writer.planCommentCreate(context, ref, body, options)),
        planCommentDelete: (commentId) =>
          withContext(identity, (context) => writer.planCommentDelete(context, commentId)),
        planCreate: (options) =>
          withContext(
            { requireTeam: true, team: options.team, viewer: false },
            (context) => writer.planCreate(context, options),
            true,
          ),
        planUpdate: (ref, options, writeOptions) =>
          withContext(
            needsTeam(options) ? team : identity,
            (context) => writer.planUpdate(context, ref, options, writeOptions),
            needsTeam(options),
          ),
        planUpdateSections: (ref, options, sections, writeOptions) =>
          withContext(
            needsTeam(options) ? team : identity,
            (context) => writer.planUpdateSections(context, ref, options, sections, writeOptions),
            needsTeam(options),
          ),
        readSection: (ref, heading) =>
          withContext(identity, (context) => writer.readSection(context, ref, heading)),
        removeLabels: (ref, names, options) =>
          withContext(team, (context) => writer.removeLabels(context, ref, names, options), true),
        removeLabelsFromChildren: (parentRef, names, options) =>
          withContext(
            team,
            (context) => writer.removeLabelsFromChildren(context, parentRef, names, options),
            true,
          ),
        reopen: (ref, options) =>
          withContext(team, (context) => writer.reopen(context, ref, options), true),
        replaceSection: (ref, heading, body, options) =>
          withContext(identity, (context) =>
            writer.replaceSection(context, ref, heading, body, options),
          ),
        unassign: (ref, options) =>
          withContext(identity, (context) => writer.unassign(context, ref, options)),
        unlink: (ref, changes, options) =>
          withContext(identity, (context) => writer.unlink(context, ref, changes, options)),
        update: (ref, options, writeOptions) =>
          withContext(
            needsTeam(options) ? team : identity,
            (context) => writer.update(context, ref, options, writeOptions),
            needsTeam(options),
          ),
        updateSections: (ref, options, sections, writeOptions) =>
          withContext(
            needsTeam(options) ? team : identity,
            (context) => writer.updateSections(context, ref, options, sections, writeOptions),
            needsTeam(options),
          ),
      })
    }),
  )
}

export { IssueWriteApi }
