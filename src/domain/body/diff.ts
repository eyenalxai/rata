import { normalizeLineEndings } from "@/domain/body/text"

const linesOf = (text: string): readonly string[] => {
  const lines = normalizeLineEndings(text).split("\n")
  if (lines.at(-1) === "") {
    lines.pop()
  }
  return lines
}

type DiffLine = {
  readonly type: "equal" | "insert" | "delete"
  readonly text: string
}

type PositionedLine = DiffLine & {
  readonly oldIndex: number
  readonly newIndex: number
}

type Hunk = {
  readonly start: number
  readonly end: number
}

const contextLines = 3

const itemAt = <A>(items: readonly A[], index: number): A => {
  const item = items[index]
  if (item === undefined) {
    throw new Error(`Missing item at index ${index}.`)
  }
  return item
}
const maxLcsCells = 4_000_000

const diffMiddle = (
  oldLines: readonly string[],
  newLines: readonly string[],
): readonly DiffLine[] => {
  const oldCount = oldLines.length
  const newCount = newLines.length
  if (oldCount === 0) {
    return newLines.map((text) => ({ type: "insert" as const, text }))
  }
  if (newCount === 0) {
    return oldLines.map((text) => ({ type: "delete" as const, text }))
  }
  if ((oldCount + 1) * (newCount + 1) > maxLcsCells) {
    return [
      ...oldLines.map((text) => ({ type: "delete" as const, text })),
      ...newLines.map((text) => ({ type: "insert" as const, text })),
    ]
  }

  const width = newCount + 1
  const table = new Uint32Array((oldCount + 1) * width)
  for (let oldIndex = oldCount - 1; oldIndex >= 0; oldIndex -= 1) {
    for (let newIndex = newCount - 1; newIndex >= 0; newIndex -= 1) {
      const cell = oldIndex * width + newIndex
      table[cell] =
        oldLines[oldIndex] === newLines[newIndex]
          ? (table[(oldIndex + 1) * width + newIndex + 1] ?? 0) + 1
          : Math.max(table[(oldIndex + 1) * width + newIndex] ?? 0, table[cell + 1] ?? 0)
    }
  }

  const lines: DiffLine[] = []
  let oldIndex = 0
  let newIndex = 0
  while (oldIndex < oldCount && newIndex < newCount) {
    if (oldLines[oldIndex] === newLines[newIndex]) {
      lines.push({ type: "equal", text: itemAt(oldLines, oldIndex) })
      oldIndex += 1
      newIndex += 1
    } else if (
      (table[(oldIndex + 1) * width + newIndex] ?? 0) >=
      (table[oldIndex * width + newIndex + 1] ?? 0)
    ) {
      lines.push({ type: "delete", text: itemAt(oldLines, oldIndex) })
      oldIndex += 1
    } else {
      lines.push({ type: "insert", text: itemAt(newLines, newIndex) })
      newIndex += 1
    }
  }
  while (oldIndex < oldCount) {
    lines.push({ type: "delete", text: itemAt(oldLines, oldIndex) })
    oldIndex += 1
  }
  while (newIndex < newCount) {
    lines.push({ type: "insert", text: itemAt(newLines, newIndex) })
    newIndex += 1
  }
  return lines
}

const diffLines = (
  oldLines: readonly string[],
  newLines: readonly string[],
): readonly DiffLine[] => {
  let prefix = 0
  while (
    prefix < oldLines.length &&
    prefix < newLines.length &&
    oldLines[prefix] === newLines[prefix]
  ) {
    prefix += 1
  }
  let suffix = 0
  while (
    suffix < oldLines.length - prefix &&
    suffix < newLines.length - prefix &&
    oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) {
    suffix += 1
  }
  return [
    ...oldLines.slice(0, prefix).map((text): DiffLine => ({ type: "equal", text })),
    ...diffMiddle(
      oldLines.slice(prefix, oldLines.length - suffix),
      newLines.slice(prefix, newLines.length - suffix),
    ),
    ...oldLines.slice(oldLines.length - suffix).map((text): DiffLine => ({ type: "equal", text })),
  ]
}

const positionLines = (lines: readonly DiffLine[]): readonly PositionedLine[] => {
  let oldIndex = 0
  let newIndex = 0
  return lines.map((line) => {
    const positioned = { ...line, oldIndex, newIndex }
    if (line.type !== "insert") {
      oldIndex += 1
    }
    if (line.type !== "delete") {
      newIndex += 1
    }
    return positioned
  })
}

const groupHunks = (lines: readonly PositionedLine[]): readonly Hunk[] => {
  const changed = lines
    .map((line, index) => (line.type === "equal" ? -1 : index))
    .filter((index) => index >= 0)
  const first = changed[0]
  if (first === undefined) {
    return []
  }
  const hunks: Hunk[] = []
  let start = Math.max(0, first - contextLines)
  let end = Math.min(lines.length - 1, first + contextLines)
  let lastChanged = first
  for (const index of changed.slice(1)) {
    if (index - lastChanged - 1 >= contextLines * 2) {
      hunks.push({ start, end })
      start = Math.max(0, index - contextLines)
    }
    end = Math.min(lines.length - 1, index + contextLines)
    lastChanged = index
  }
  hunks.push({ start, end })
  return hunks
}

const formatRange = (start: number, count: number): string =>
  count === 1 ? `${start}` : `${start},${count}`

const formatHunk = (lines: readonly PositionedLine[], hunk: Hunk): readonly string[] => {
  const hunkLines = lines.slice(hunk.start, hunk.end + 1)
  const first = itemAt(hunkLines, 0)
  const oldCount = hunkLines.filter((line) => line.type !== "insert").length
  const newCount = hunkLines.filter((line) => line.type !== "delete").length
  const oldStart = oldCount === 0 ? first.oldIndex : first.oldIndex + 1
  const newStart = newCount === 0 ? first.newIndex : first.newIndex + 1
  return [
    `@@ -${formatRange(oldStart, oldCount)} +${formatRange(newStart, newCount)} @@`,
    ...hunkLines.map((line) => {
      const prefix = line.type === "equal" ? " " : line.type === "insert" ? "+" : "-"
      return `${prefix}${line.text}`
    }),
  ]
}

const unifiedDiff = (before: string, after: string): string => {
  const lines = positionLines(diffLines(linesOf(before), linesOf(after)))
  const hunks = groupHunks(lines)
  if (hunks.length === 0) {
    return ""
  }
  return hunks.flatMap((hunk) => formatHunk(lines, hunk)).join("\n")
}

export { unifiedDiff }
