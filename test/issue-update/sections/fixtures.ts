import { Option, Schema, Stream } from "effect"

const SectionAction = Schema.Struct({
  heading: Schema.String,
  action: Schema.String,
})

const SectionsWrite = Schema.Struct({
  status: Schema.String,
  updatedAt: Schema.String,
  issue: Schema.Struct({
    identifier: Schema.String,
    updatedAt: Schema.String,
  }),
  sections: Schema.Array(SectionAction),
})

const SectionsDryRun = Schema.Struct({
  dryRun: Schema.Boolean,
  status: Schema.String,
  updatedAt: Schema.String,
  sections: Schema.Array(SectionAction),
  diff: Schema.String,
})

const ErrorEnvelope = Schema.Struct({
  error: Schema.Struct({
    code: Schema.String,
    message: Schema.String,
    hint: Schema.NullOr(Schema.String),
  }),
})

const decodeWrite = (value: unknown) =>
  Option.getOrThrow(Schema.decodeUnknownOption(SectionsWrite)(value))

const decodeDryRun = (value: unknown) =>
  Option.getOrThrow(Schema.decodeUnknownOption(SectionsDryRun)(value))

const decodeError = (value: unknown) =>
  Option.getOrThrow(Schema.decodeUnknownOption(ErrorEnvelope)(value)).error

const stdin = (text: string) => ({
  stdio: { stdin: Stream.make(new TextEncoder().encode(text)) },
})

const sectionsInput = (
  sections: readonly { readonly heading: string; readonly content: string }[],
) => JSON.stringify({ sections })

const document = [
  "# Mission",
  "",
  "## Flow",
  "",
  "Old flow.",
  "",
  "## Gates",
  "",
  "Old gate.",
  "",
  "## Outputs",
  "",
  "Old output.",
  "",
  "## Next step",
  "",
  "Old next.",
  "",
].join("\n")

const sections = [
  { heading: "Flow", content: "New flow." },
  { heading: "Gates", content: "New gate." },
  { heading: "Outputs", content: "New output." },
  { heading: "Next step", content: "New next." },
]

export { decodeDryRun, decodeError, decodeWrite, document, sections, sectionsInput, stdin }
