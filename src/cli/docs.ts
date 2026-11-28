import type { Surface, SurfaceNode, SurfaceParam } from "@/cli/surface"

type BlockMarkers = {
  readonly begin: string
  readonly end: string
}

const trackerMarkers: BlockMarkers = {
  begin: "<!-- rata:commands:begin -->",
  end: "<!-- rata:commands:end -->",
}

const referenceMarkers: BlockMarkers = {
  begin: "<!-- rata:reference:begin -->",
  end: "<!-- rata:reference:end -->",
}

const generatedNote =
  "Generated from the command registry by `bun run docs:generate`. Do not edit this block by hand."

const ignoreStart = "<!-- prettier-ignore-start -->"
const ignoreEnd = "<!-- prettier-ignore-end -->"

const flagSynopsis = (param: SurfaceParam): string => {
  const name = `--${param.name}`
  if (param.type === "boolean") {
    return name
  }
  const metavar = param.choices.length === 0 ? param.type : param.choices.join("|")
  return `${name} <${metavar}>`
}

const argumentSynopsis = (param: SurfaceParam): string => {
  const name = param.variadic ? `<${param.name}...>` : `<${param.name}>`
  return param.required ? name : `[${name}]`
}

const usageOf = (node: SurfaceNode): string => {
  const flags = node.params.filter((param) => param.kind === "flag")
  const args = node.params.filter((param) => param.kind === "argument")
  const parts = ["rata", ...node.path]
  if (node.children.length > 0) {
    parts.push("<subcommand>")
  }
  if (flags.length > 0) {
    parts.push("[flags]")
  }
  for (const arg of args) {
    parts.push(argumentSynopsis(arg))
  }
  return parts.join(" ")
}

const paramTable = (
  params: readonly SurfaceParam[],
  headingOverride?: string,
): readonly string[] => {
  if (params.length === 0) {
    return []
  }
  const heading = headingOverride ?? (params[0]?.kind === "argument" ? "Arguments" : "Flags")
  const lines = [
    `**${heading}**`,
    "",
    "| Name | Type | Required | Description |",
    "| --- | --- | --- | --- |",
  ]
  for (const param of params) {
    const name =
      param.kind === "argument"
        ? `\`<${param.name}>\``
        : `\`${param.aliases.length === 0 ? flagSynopsis(param) : `${flagSynopsis(param)}, ${param.aliases.map((alias) => `-${alias}`).join(", ")}`}\``
    const description = (param.description ?? "").replaceAll("|", String.raw`\|`)
    const type =
      param.choices.length === 0
        ? param.type
        : param.type === "choice"
          ? `choice (${param.choices.join("|")})`
          : param.choices.join("|")
    lines.push(`| ${name} | \`${type}\` | ${param.required ? "yes" : "no"} | ${description} |`)
  }
  return lines
}

const nodeSection = (node: SurfaceNode, level: number): readonly string[] => {
  const heading = `${"#".repeat(level)} \`rata ${node.path.join(" ")}\``
  const lines = [heading, "", node.summary, "", "```text", usageOf(node), "```", ""]
  const argumentsTable = paramTable(node.params.filter((param) => param.kind === "argument"))
  const flagsTable = paramTable(node.params.filter((param) => param.kind === "flag"))
  lines.push(...argumentsTable)
  if (argumentsTable.length > 0 && flagsTable.length > 0) {
    lines.push("")
  }
  lines.push(...flagsTable)
  if (node.examples.length > 0) {
    lines.push("", "**Examples**", "")
    for (const example of node.examples) {
      lines.push(
        `- \`${example.command}\`${example.description === undefined ? "" : `: ${example.description}`}`,
      )
    }
  }
  for (const child of node.children) {
    lines.push("", ...nodeSection(child, Math.min(level + 1, 6)))
  }
  return lines
}

const commandIndex = (surface: Surface): readonly string[] => {
  const lines = ["| Command | Summary |", "| --- | --- |"]
  const visit = (node: SurfaceNode): void => {
    lines.push(
      `| \`rata ${node.path.join(" ")}\` | ${node.summary.replaceAll("|", String.raw`\|`)} |`,
    )
    for (const child of node.children) {
      visit(child)
    }
  }
  for (const root of surface.roots) {
    visit(root)
  }
  return lines
}

const buildReferenceBlock = (surface: Surface): string =>
  [
    ignoreStart,
    generatedNote,
    "",
    "## Command index",
    "",
    ...commandIndex(surface),
    "",
    ...paramTable(surface.globalParams, "Global flags"),
    "",
    "## Commands",
    "",
    ...surface.roots.flatMap((root) => [...nodeSection(root, 3), ""]),
    ignoreEnd,
  ]
    .join("\n")
    .trimEnd()

const buildTrackerBlock = (surface: Surface): string =>
  [ignoreStart, generatedNote, "", ...commandIndex(surface), ignoreEnd].join("\n").trimEnd()

const blockContent = (content: string, markers: BlockMarkers): string | null => {
  const begin = content.indexOf(markers.begin)
  if (begin === -1) {
    return null
  }
  const end = content.indexOf(markers.end, begin + markers.begin.length)
  if (end === -1) {
    return null
  }
  return content.slice(begin + markers.begin.length, end).trim()
}

const replaceGeneratedBlock = (
  content: string,
  block: string,
  markers: BlockMarkers,
): { readonly content: string; readonly changed: boolean } => {
  const begin = content.indexOf(markers.begin)
  const end = content.indexOf(markers.end, begin + 1)
  const body = `${markers.begin}\n${block.trim()}\n${markers.end}`
  if (begin !== -1 && end !== -1) {
    const next = `${content.slice(0, begin)}${body}${content.slice(end + markers.end.length)}`
    return { content: next, changed: next !== content }
  }
  const separator = content.trimEnd().length === 0 ? "" : "\n\n"
  const next = `${content.trimEnd()}${separator}${body}\n`
  return { content: next, changed: next !== content }
}

export {
  blockContent,
  buildReferenceBlock,
  buildTrackerBlock,
  referenceMarkers,
  replaceGeneratedBlock,
  trackerMarkers,
}
