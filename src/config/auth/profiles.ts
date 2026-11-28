import { eq } from "drizzle-orm"
import { Effect, Option } from "effect"

import type { OpenDatabase } from "@/db/database"

import { profiles } from "@/db/schema"

type LogoutResult = {
  readonly removed: Option.Option<string>
  readonly defaultProfile: Option.Option<string>
  readonly remaining: number
}

const storeProfile = Effect.fn("Auth.storeProfile")(function* storeProfileRows(
  opened: OpenDatabase,
  apiKey: string,
  workspace: string,
) {
  yield* opened.drizzle.transaction((tx) =>
    Effect.gen(function* storeProfileRow() {
      const defaults = yield* tx
        .select({ name: profiles.name })
        .from(profiles)
        .where(eq(profiles.isDefault, 1))
        .all()
      const query = tx.insert(profiles).values({
        name: workspace,
        apiKey,
        isDefault: defaults.length === 0 ? 1 : 0,
      })
      const upsert =
        defaults.length === 0
          ? query.onConflictDoUpdate({
              target: profiles.name,
              set: { apiKey, isDefault: 1 },
            })
          : query.onConflictDoUpdate({ target: profiles.name, set: { apiKey } })
      yield* upsert.run()
    }),
  )
})

const removeProfile = Effect.fn("Auth.removeProfile")(function* removeProfileRows(
  opened: OpenDatabase,
  workspace: Option.Option<string>,
) {
  return yield* opened.drizzle.transaction((tx) =>
    Effect.gen(function* removeProfileRow() {
      const stored = yield* tx.select().from(profiles).orderBy(profiles.name).all()
      const target = Option.isSome(workspace)
        ? stored.find((row) => row.name === workspace.value)
        : stored.find((row) => row.isDefault === 1)
      if (target === undefined) {
        const unchanged: LogoutResult = {
          removed: Option.none<string>(),
          defaultProfile: Option.fromUndefinedOr(stored.find((row) => row.isDefault === 1)?.name),
          remaining: stored.length,
        }
        return unchanged
      }
      yield* tx.delete(profiles).where(eq(profiles.name, target.name)).run()
      const remaining = stored.filter((row) => row.name !== target.name)
      const promoted =
        target.isDefault === 1 ? remaining[0] : remaining.find((row) => row.isDefault === 1)
      if (target.isDefault === 1 && promoted !== undefined) {
        yield* tx
          .update(profiles)
          .set({ isDefault: 1 })
          .where(eq(profiles.name, promoted.name))
          .run()
      }
      const removed: LogoutResult = {
        removed: Option.some(target.name),
        defaultProfile: Option.fromUndefinedOr(promoted?.name),
        remaining: remaining.length,
      }
      return removed
    }),
  )
})

const selectDefaultProfile = Effect.fn("Auth.selectDefaultProfile")(
  function* selectDefaultProfileRows(opened: OpenDatabase, workspace: string) {
    return yield* opened.drizzle.transaction((tx) =>
      Effect.gen(function* selectDefaultProfileRow() {
        const target = yield* tx
          .select({ name: profiles.name })
          .from(profiles)
          .where(eq(profiles.name, workspace))
          .all()
        if (target.length === 0) {
          return false
        }
        yield* tx.update(profiles).set({ isDefault: 0 }).where(eq(profiles.isDefault, 1)).run()
        yield* tx.update(profiles).set({ isDefault: 1 }).where(eq(profiles.name, workspace)).run()
        return true
      }),
    )
  },
)

export { type LogoutResult, removeProfile, selectDefaultProfile, storeProfile }
