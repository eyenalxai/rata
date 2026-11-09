import type { Console } from "effect"

const ignore = (): undefined => undefined

const recordInto =
  (target: string[]) =>
  (...args: readonly unknown[]): void => {
    target.push(args.map(String).join(" "))
  }

const recordingConsoleWithErrors = (output: string[], errors: string[]): Console.Console => {
  const record = recordInto(output)
  return {
    assert: ignore,
    clear: ignore,
    count: ignore,
    countReset: ignore,
    debug: ignore,
    dir: ignore,
    dirxml: ignore,
    error: recordInto(errors),
    group: ignore,
    groupCollapsed: ignore,
    groupEnd: ignore,
    info: ignore,
    log: record,
    table: ignore,
    time: ignore,
    timeEnd: ignore,
    timeLog: ignore,
    trace: ignore,
    warn: ignore,
  }
}

const recordingConsole = (lines: string[]): Console.Console =>
  recordingConsoleWithErrors(lines, lines)

export { recordingConsole, recordingConsoleWithErrors }
