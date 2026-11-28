import { eq } from "drizzle-orm"
import { Effect, Option } from "effect"

import type { OpenDatabase } from "@/db/database"

import { profiles } from "@/db/schema"

const storeProfile = (opened: OpenDatabase, apiKey: string, workspace: string) =>
  opened.drizzle.transaction((tx) =>
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

const removeProfile = (opened: OpenDatabase, workspace: Option.Option<string>) =>
  opened.drizzle.transaction((tx) =>
    Effect.gen(function* removeProfileRow() {
      const stored = yield* tx.select().from(profiles).orderBy(profiles.name).all()
      const target = Option.isSome(workspace)
        ? stored.find((row) => row.name === workspace.value)
        : stored.find((row) => row.isDefault === 1)
      if (target === undefined) {
        return {
          removed: Option.none<string>(),
          default: Option.fromUndefinedOr(stored.find((row) => row.isDefault === 1)?.name),
        }
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
      return {
        removed: Option.some(target.name),
        default: Option.fromUndefinedOr(promoted?.name),
      }
    }),
  )

const selectDefaultProfile = (opened: OpenDatabase, workspace: string) =>
  opened.drizzle.transaction((tx) =>
    Effect.gen(function* selectDefaultProfileRow() {
      yield* tx.update(profiles).set({ isDefault: 0 }).where(eq(profiles.isDefault, 1)).run()
      yield* tx.update(profiles).set({ isDefault: 1 }).where(eq(profiles.name, workspace)).run()
    }),
  )

export { removeProfile, selectDefaultProfile, storeProfile }
