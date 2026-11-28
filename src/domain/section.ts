import { Schema } from "effect"

const sectionLevels = [1, 2, 3, 4, 5, 6] as const
type SectionLevel = (typeof sectionLevels)[number]

const SectionLevelSchema = Schema.Literals(sectionLevels)

const Section = Schema.Struct({
  heading: Schema.String,
  level: SectionLevelSchema,
  content: Schema.String,
  line: Schema.Finite,
})
type Section = typeof Section.Type

const SectionReplacement = Schema.Struct({
  heading: Schema.String,
  content: Schema.String,
})
type SectionReplacement = typeof SectionReplacement.Type

const sectionEditModes = ["replace", "append"] as const
type SectionEditMode = (typeof sectionEditModes)[number]

const SectionEdit = Schema.Struct({
  heading: Schema.String,
  mode: Schema.Literals(sectionEditModes),
  content: Schema.String,
})
type SectionEdit = typeof SectionEdit.Type

const SectionEditAction = Schema.Struct({
  heading: Schema.String,
  mode: Schema.Literals(sectionEditModes),
  action: Schema.Literals(["replaced", "appended", "skipped"]),
})
type SectionEditAction = typeof SectionEditAction.Type

const isSectionLevel = (value: number): value is SectionLevel =>
  sectionLevels.some((level) => level === value)

export {
  isSectionLevel,
  Section,
  SectionEdit,
  SectionEditAction,
  type SectionEditMode,
  sectionEditModes,
  type SectionLevel,
  SectionReplacement,
}
