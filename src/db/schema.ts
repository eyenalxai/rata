import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

const profiles = sqliteTable("profiles", {
  name: text("name").primaryKey(),
  apiKey: text("api_key").notNull(),
  isDefault: integer("is_default").notNull().default(0),
})

const repositories = sqliteTable("repositories", {
  key: text("key").primaryKey(),
  team: text("team"),
  project: text("project"),
  workspace: text("workspace"),
})

export { profiles, repositories }
