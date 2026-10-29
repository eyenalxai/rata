import { Result } from "effect"

import { MissionStateError } from "@/domain/mission/state"

type TableSpec = {
  readonly heading: string
  readonly columns: readonly string[]
}

type TableRow = Readonly<Record<string, string>>

type ParsedTable = {
  readonly columns: readonly string[]
  readonly rows: readonly TableRow[]
}

const sessionPlanTable: TableSpec = {
  heading: "Session plan",
  columns: ["Session", "Work", "Exit"],
}

const referencesTable: TableSpec = {
  heading: "References",
  columns: ["Reference", "Why", "Path or URL", "Phase"],
}

const separatorCell = /^:?-+:?$/u

const cellsOf = (line: string): readonly string[] => {
  const trimmed = line.trim()
  const withoutLeading = trimmed.startsWith("|") ? trimmed.slice(1) : trimmed
  const core = withoutLeading.endsWith("|") ? withoutLeading.slice(0, -1) : withoutLeading
  return core.split("|").map((cell) => cell.trim())
}

const contentLines = (content: string): readonly string[] =>
  content.split("\n").filter((line) => line.trim().length > 0)

const rowOf = (columns: readonly string[], cells: readonly string[]): TableRow =>
  Object.fromEntries(columns.map((column, index) => [column, cells[index] ?? ""]))

const parseTable = (
  content: string,
  spec: TableSpec,
): Result.Result<ParsedTable, MissionStateError> => {
  const lines = contentLines(content)
  const [header, separator, ...rows] = lines
  if (header === undefined || separator === undefined) {
    return Result.fail(
      new MissionStateError({
        message: `The ## ${spec.heading} table needs a header and a separator row.`,
      }),
    )
  }
  const headerCells = cellsOf(header)
  if (
    headerCells.length !== spec.columns.length ||
    headerCells.some((cell, index) => cell !== spec.columns[index])
  ) {
    return Result.fail(
      new MissionStateError({
        message: `The ## ${spec.heading} table must have the columns ${spec.columns.join(", ")}.`,
      }),
    )
  }
  const separatorCells = cellsOf(separator)
  if (
    separatorCells.length !== spec.columns.length ||
    !separatorCells.every((cell) => separatorCell.test(cell))
  ) {
    return Result.fail(
      new MissionStateError({
        message: `The ## ${spec.heading} table needs a separator row with ${spec.columns.length} cells.`,
      }),
    )
  }
  const parsed: TableRow[] = []
  for (const row of rows) {
    const rowCells = cellsOf(row)
    if (rowCells.length !== spec.columns.length) {
      return Result.fail(
        new MissionStateError({
          message: `The ## ${spec.heading} table has a malformed row: ${row}`,
        }),
      )
    }
    parsed.push(rowOf(spec.columns, rowCells))
  }
  return Result.succeed({ columns: spec.columns, rows: parsed })
}

const tableSection = (table: ParsedTable): string =>
  [`| ${table.columns.join(" | ")} |`, `| ${table.columns.map(() => "--").join(" | ")} |`].join(
    "\n",
  )

export {
  type ParsedTable,
  parseTable,
  referencesTable,
  sessionPlanTable,
  type TableSpec,
  tableSection,
}
