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

const SectionReplacementAction = Schema.Struct({
  heading: Schema.String,
  action: Schema.Literals(["replaced", "skipped"]),
})
type SectionReplacementAction = typeof SectionReplacementAction.Type

const isSectionLevel = (value: number): value is SectionLevel =>
  sectionLevels.some((level) => level === value)

export { isSectionLevel, type SectionLevel, Section, SectionReplacement, SectionReplacementAction }
