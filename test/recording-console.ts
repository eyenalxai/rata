import type { Console } from "effect"

const ignore = (): undefined => undefined

const recordingConsole = (lines: string[]): Console.Console => {
  const record = (...args: readonly unknown[]): void => {
    lines.push(args.map(String).join(" "))
  }
  return {
    assert: ignore,
    clear: ignore,
    count: ignore,
    countReset: ignore,
    debug: ignore,
    dir: ignore,
    dirxml: ignore,
    error: ignore,
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

export { recordingConsole }
