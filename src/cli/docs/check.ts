import type { Surface } from "@/cli/surface"

import { blockContent, buildTrackerBlock, trackerMarkers } from "@/cli/docs"

type StaleCommand = {
  readonly command: string
  readonly replacement: string | null
}

type TrackerCommandCheck = {
  readonly stale: readonly StaleCommand[]
  readonly hasBlock: boolean
  readonly blockFresh: boolean
}

const movedRoots = new Map([
  ["auth", "admin auth"],
  ["config", "admin config"],
  ["link", "admin link"],
  ["unlink", "admin unlink"],
  ["workspace", "admin workspace"],
  ["team", "admin team"],
  ["project", "admin project"],
  ["label", "admin label"],
])

const replacedRoots = new Map([
  ["next", "issue <ref>"],
  ["why", "issue <ref>"],
])

const commandTokens = (text: string): readonly string[] => {
  const tokens: string[] = []
  const words = text
    .trim()
    .replace(/^\$\s+/u, "")
    .split(/\s+/u)
  const start = words[0] === "rata" ? 1 : 0
  for (const token of words.slice(start)) {
    if (!/^[a-z][a-z0-9-]*$/u.test(token)) {
      break
    }
    tokens.push(token)
  }
  return tokens
}

const invocations = (content: string): readonly string[] =>
  content
    .split(/\r?\n/u)
    .flatMap((line) =>
      [...line.matchAll(/\brata(?:\s+[a-z][a-z0-9-]*){1,4}/gu)].map((match) => match[0]),
    )

const knownRoots = (surface: Surface): ReadonlySet<string> =>
  new Set([
    ...surface.roots.map((root) => root.name),
    ...movedRoots.keys(),
    ...replacedRoots.keys(),
    "whoami",
  ])

const replacementFor = (path: readonly string[]): string | null => {
  const first = path[0]
  if (first === undefined) {
    return null
  }
  if (first === "issue") {
    const second = path[1]
    if (second === undefined) {
      return null
    }
    if (second === "show" || second === "view" || second === "status") {
      return "rata issue <ref>"
    }
    if (
      second === "update" ||
      second === "label" ||
      second === "section" ||
      second === "assign" ||
      second === "unassign" ||
      second === "reopen"
    ) {
      return "rata issue apply <ref> --file -"
    }
    if (second === "link" || second === "unlink") {
      return "rata issue relate <ref> --blocked-by <target>"
    }
    if (second === "comment" && path[2] !== undefined) {
      return "rata issue comment <ref> --body-file -"
    }
  }
  return null
}

const movedCommand = (tokens: readonly string[], surface: Surface): StaleCommand | null => {
  const first = tokens[0]
  if (first === undefined) {
    return null
  }
  const moved = movedRoots.get(first)
  if (moved === undefined) {
    return null
  }
  const child = tokens[1]
  const group = surface.roots
    .find((root) => root.name === "admin")
    ?.children.find((node) => node.name === first)
  const hasChild =
    child !== undefined && group?.children.some((node) => node.name === child) === true
  return {
    command: `rata ${[first, ...(hasChild ? [child] : [])].join(" ")}`,
    replacement: `rata ${[moved, ...(hasChild ? [child] : [])].join(" ")}`,
  }
}

const resolveCommand = (tokens: readonly string[], surface: Surface): StaleCommand | null => {
  const moved = movedCommand(tokens, surface)
  if (moved !== null) {
    return moved
  }
  const first = tokens[0]
  if (first === undefined) {
    return null
  }
  const root = surface.roots.find((node) => node.name === first)
  if (root === undefined) {
    if (first === "whoami") {
      return { command: "rata whoami", replacement: "rata admin auth status" }
    }
    const replaced = replacedRoots.get(first)
    if (replaced !== undefined) {
      return { command: `rata ${first}`, replacement: `rata ${replaced}` }
    }
    return { command: `rata ${first}`, replacement: null }
  }
  const path: string[] = []
  let children = surface.roots
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (token === undefined) {
      return null
    }
    const node = children.find((child) => child.name === token)
    if (node === undefined) {
      path.push(token)
      return { command: `rata ${path.join(" ")}`, replacement: replacementFor(path) }
    }
    path.push(token)
    if (node.children.length === 0) {
      const next = tokens[index + 1]
      const oldComment =
        path.length === 2 &&
        path[0] === "issue" &&
        path[1] === "comment" &&
        (next === "create" || next === "update" || next === "delete")
      if (oldComment && next !== undefined) {
        path.push(next)
        return { command: `rata ${path.join(" ")}`, replacement: replacementFor(path) }
      }
      return null
    }
    children = node.children
  }
  return null
}

const staleCommands = (content: string, surface: Surface): readonly StaleCommand[] => {
  const stale: StaleCommand[] = []
  const seen = new Set<string>()
  const roots = knownRoots(surface)
  for (const text of invocations(content)) {
    const tokens = commandTokens(text)
    const first = tokens[0]
    if (first === undefined || !roots.has(first)) {
      continue
    }
    const result = resolveCommand(tokens, surface)
    if (result !== null && !seen.has(result.command)) {
      seen.add(result.command)
      stale.push(result)
    }
  }
  return stale.filter(
    (item) =>
      !stale.some((other) => other !== item && other.command.startsWith(`${item.command} `)),
  )
}

const checkTrackerCommands = (content: string, surface: Surface): TrackerCommandCheck => {
  const block = blockContent(content, trackerMarkers)
  return {
    stale: staleCommands(content, surface),
    hasBlock: block !== null,
    blockFresh: block === buildTrackerBlock(surface),
  }
}

const staleHint = (stale: readonly StaleCommand[]): string =>
  stale
    .map((item) =>
      item.replacement === null
        ? `\`${item.command}\` is not a command`
        : `\`${item.command}\` -> \`${item.replacement}\``,
    )
    .join(", ")

const trackerCommandWarning = (content: string, surface: Surface, file: string): string | null => {
  const check = checkTrackerCommands(content, surface)
  const warnings: string[] = []
  if (check.stale.length > 0) {
    warnings.push(`The tracker document at ${file} has stale commands: ${staleHint(check.stale)}.`)
  }
  if (!check.hasBlock) {
    warnings.push(
      `The tracker document at ${file} has no generated command block. Run \`rata admin doctor --write\`.`,
    )
  } else if (!check.blockFresh) {
    warnings.push(
      `The tracker document at ${file} has a stale command block. Run \`rata admin doctor --write\`.`,
    )
  }
  return warnings.length === 0 ? null : warnings.join(" ")
}

const doctorValue = (check: TrackerCommandCheck) => ({
  healthy: check.stale.length === 0 && check.hasBlock && check.blockFresh,
  stale: check.stale,
  block: { present: check.hasBlock, fresh: check.blockFresh },
})

const describeCheck = (
  file: string,
  check: TrackerCommandCheck,
  written: boolean,
): readonly string[] => {
  const lines: string[] = []
  if (check.stale.length === 0 && check.hasBlock && check.blockFresh) {
    lines.push(`${file}: the command block is current.`)
  } else {
    if (check.stale.length > 0) {
      lines.push(`${file}: stale commands: ${staleHint(check.stale)}.`)
    }
    if (!check.hasBlock) {
      lines.push(`${file}: no generated command block.`)
    } else if (!check.blockFresh) {
      lines.push(`${file}: the command block is stale.`)
    }
  }
  if (written) {
    lines.push(`Wrote ${file}.`)
  }
  return lines
}

export {
  checkTrackerCommands,
  describeCheck,
  doctorValue,
  type StaleCommand,
  staleCommands,
  trackerCommandWarning,
}
