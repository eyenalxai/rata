import { Schema } from "effect"

const WorkspaceProfile = Schema.Struct({ apiKey: Schema.String })

type WorkspaceProfile = typeof WorkspaceProfile.Type

const AuthFile = Schema.Struct({
  default: Schema.optional(Schema.String),
  workspaces: Schema.Record(Schema.String, WorkspaceProfile),
})

type AuthFile = typeof AuthFile.Type

const LegacyAuthFile = Schema.Struct({ apiKey: Schema.String })
const StoredAuth = Schema.Union([AuthFile, LegacyAuthFile])

type StoredAuth = typeof StoredAuth.Type

const StoredAuthJson = Schema.fromJsonString(StoredAuth)

const normalize = (stored: StoredAuth): AuthFile =>
  "workspaces" in stored
    ? stored
    : { default: "default", workspaces: { default: { apiKey: stored.apiKey } } }

export { normalize, StoredAuthJson }
