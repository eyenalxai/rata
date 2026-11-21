import { Effect, FileSystem, Path, Result, Schema } from "effect"

import { RepoConfigError } from "@/config/repo"

const triageRoles = [
  "bug",
  "enhancement",
  "needs-triage",
  "needs-info",
  "ready-for-agent",
  "ready-for-human",
  "wontfix",
] as const

type DocHealth = {
  readonly path: string
  readonly exists: boolean
  readonly healthy: boolean | null
  readonly warning: string | null
}

type TriageMap = {
  readonly source: string
  readonly roles: Readonly<Record<string, string>>
}

type ContextDocs = {
  readonly docs: {
    readonly tracker: DocHealth
    readonly triage: DocHealth
  }
  readonly triage: TriageMap | null
}

type TriageDocument = {
  readonly health: DocHealth
  readonly map: TriageMap | null
}

class TriageMapError extends Schema.TaggedError<TriageMapError>()("TriageMapError", {
  file: Schema.String,
  message: Schema.String,
}) {}

const namesRataSkill = (content: string): boolean =>
  /\brata\b[^.\n]{0,40}\bskill\b|\bskill\b[^.\n]{0,40}\brata\b/iu.test(content)

const readText = (
  fs: FileSystem.FileSystem,
  file: string,
): Effect.Effect<string | null, RepoConfigError> =>
  Effect.gen(function* readDocument() {
    const exists = yield* fs.exists(file)
    if (!exists) {
      return null
    }
    return yield* fs.readFileString(file)
  }).pipe(
    Effect.mapError((cause) => new RepoConfigError({ message: `Could not read ${file}.`, cause })),
  )

const parseTriageMap = (
  content: string,
  file: string,
): Effect.Effect<Readonly<Record<string, string>>, TriageMapError> =>
  Effect.gen(function* parseTriage() {
    const roles: Record<string, string> = {}
    let canonicalColumn = -1
    let labelColumn = -1
    let header = false
    for (const line of content.split(/\r?\n/u)) {
      const cells = line
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim())
      if (!header) {
        const canonical = cells.findIndex(
          (cell) => /canonical/iu.test(cell) && /label/iu.test(cell),
        )
        const label = cells.findIndex((cell) => /label/iu.test(cell) && /tracker/iu.test(cell))
        if (canonical !== -1 && label !== -1) {
          canonicalColumn = canonical
          labelColumn = label
          header = true
        }
        continue
      }
      const canonical = cells[canonicalColumn]?.replaceAll("`", "")
      const label = cells[labelColumn]?.replaceAll("`", "")
      if (
        canonical !== undefined &&
        label !== undefined &&
        triageRoles.some((role) => role === canonical)
      ) {
        roles[canonical] = label
      }
    }
    if (!header) {
      return yield* new TriageMapError({
        file,
        message: `The triage labels document at ${file} has no canonical label header.`,
      })
    }
    return roles
  })

const trackerDocument = (
  fs: FileSystem.FileSystem,
  file: string,
): Effect.Effect<DocHealth, RepoConfigError> =>
  Effect.gen(function* readTrackerDocument() {
    const content = yield* readText(fs, file)
    if (content === null) {
      return { path: file, exists: false, healthy: null, warning: null }
    }
    if (namesRataSkill(content)) {
      return { path: file, exists: true, healthy: true, warning: null }
    }
    const warning = `The tracker document at ${file} does not name the rata skill. Add a line that tells agents to load \`rata\` before the first tracker command.`
    return { path: file, exists: true, healthy: false, warning }
  })

const triageDocument = (
  fs: FileSystem.FileSystem,
  file: string,
): Effect.Effect<TriageDocument, RepoConfigError> =>
  Effect.gen(function* readTriageDocument() {
    const content = yield* readText(fs, file)
    if (content === null) {
      return {
        health: { path: file, exists: false, healthy: null, warning: null },
        map: null,
      }
    }
    const parsed = yield* Effect.result(parseTriageMap(content, file))
    if (Result.isFailure(parsed)) {
      return {
        health: { path: file, exists: true, healthy: false, warning: parsed.failure.message },
        map: null,
      }
    }
    const roles = parsed.success
    const missing = triageRoles.filter((role) => roles[role] === undefined)
    const warning =
      missing.length === 0
        ? null
        : `The triage labels document at ${file} does not map these roles: ${missing.join(", ")}.`
    return {
      health: { path: file, exists: true, healthy: missing.length === 0, warning },
      map: { source: file, roles },
    }
  })

const readContextDocs = Effect.fn("ContextDocs.read")(function* readDocs(root: string) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const directory = path.join(root, "docs", "agents")
  const trackerFile = path.join(directory, "issue-tracker.md")
  const triageFile = path.join(directory, "triage-labels.md")
  const tracker = yield* trackerDocument(fs, trackerFile)
  const triage = yield* triageDocument(fs, triageFile)
  return {
    docs: { tracker, triage: triage.health },
    triage: triage.map,
  } satisfies ContextDocs
})

export { type ContextDocs, readContextDocs, triageRoles, type TriageMap, TriageMapError }
