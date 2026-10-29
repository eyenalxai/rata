import { Result } from "effect"

import type { Section, SectionLookupError } from "@/domain/body/section/model"

import { parseBody, publicSection, resolveSection } from "@/domain/body/section/model"

const readSection = (body: string, heading: string): Result.Result<Section, SectionLookupError> =>
  Result.map(resolveSection(parseBody(body).sections, heading), publicSection)

const parseSections = (body: string): readonly Section[] =>
  parseBody(body).sections.map(publicSection)

export { parseSections, readSection }
