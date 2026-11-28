import { sql } from "drizzle-orm"
import { integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"

const profiles = sqliteTable(
  "profiles",
  {
    name: text("name").primaryKey(),
    apiKey: text("api_key").notNull(),
    isDefault: integer("is_default").notNull().default(0),
  },
  (table) => [
    uniqueIndex("profiles_one_default")
      .on(table.isDefault)
      .where(sql`${table.isDefault} = 1`),
  ],
)

const repositories = sqliteTable("repositories", {
  key: text("key").primaryKey(),
  team: text("team"),
  teamId: text("team_id"),
  project: text("project"),
  workspace: text("workspace"),
  defaultAssignee: text("default_assignee"),
  defaultLabels: text("default_labels"),
  defaultPriority: integer("default_priority"),
})

const contextCache = sqliteTable(
  "context_cache",
  {
    profile: text("profile").notNull(),
    teamId: text("team_id").notNull(),
    keyHash: text("key_hash").notNull(),
    detail: text("detail").notNull(),
    fetchedAt: integer("fetched_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.profile, table.teamId, table.keyHash] })],
)

const viewerCache = sqliteTable(
  "viewer_cache",
  {
    profile: text("profile").notNull(),
    keyHash: text("key_hash").notNull(),
    viewer: text("viewer").notNull(),
    fetchedAt: integer("fetched_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.profile, table.keyHash] })],
)

export { contextCache, profiles, repositories, viewerCache }
