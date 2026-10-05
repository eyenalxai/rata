const sectionHeading = "## Agent skills"

const isBlank = (line: string): boolean => line.trim() === ""

const trimTrailingBlank = (lines: readonly string[]): string[] => {
  const trimmed = [...lines]
  while (trimmed.length > 0 && isBlank(trimmed.at(-1) ?? "")) {
    trimmed.pop()
  }
  return trimmed
}

const injectAgentSkillsBlock = (content: string, block: string): string => {
  const lines = content.split("\n")
  const blockLines = trimTrailingBlank(block.split("\n"))
  const startIndex = lines.findIndex((line) => line.trimEnd() === sectionHeading)

  if (startIndex === -1) {
    return `${[...trimTrailingBlank(lines), "", ...blockLines].join("\n").trimEnd()}\n`
  }

  const endIndex = lines.findIndex((line, index) => index > startIndex && line.startsWith("## "))
  const before = trimTrailingBlank(lines.slice(0, startIndex))
  const after = endIndex === -1 ? [] : lines.slice(endIndex)
  const parts = [...before, "", ...blockLines]
  if (after.length > 0) {
    parts.push("", ...after)
  }
  return `${parts.join("\n").trimEnd()}\n`
}

export { injectAgentSkillsBlock }
