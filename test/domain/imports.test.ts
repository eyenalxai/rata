import { describe, expect, test } from "bun:test"
import { readdir, readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"

const domainDirectory = fileURLToPath(new URL("../../src/domain", import.meta.url))

const importPattern = /\bfrom\s+"(?<specifier>[^"]+)"/gu
const bareImportPattern = /\bimport\s+"(?<specifier>[^"]+)"/gu

const importsOf = (file: string): Promise<readonly string[]> =>
  readFile(`${domainDirectory}/${file}`, "utf8").then((source) =>
    [
      ...Array.from(source.matchAll(importPattern), (match) => match.groups?.specifier),
      ...Array.from(source.matchAll(bareImportPattern), (match) => match.groups?.specifier),
    ].filter((specifier): specifier is string => specifier !== undefined),
  )

const allowed = (specifier: string): boolean =>
  specifier === "effect" || specifier === "node:crypto" || specifier.startsWith("@/domain/")

describe("the domain boundary", () => {
  test("imports only effect, node:crypto and the domain itself", async () => {
    const entries = await readdir(domainDirectory, { recursive: true })
    const files = entries.map(String).filter((file) => file.endsWith(".ts"))
    const checked = await Promise.all(
      files.map(async (file) => {
        const specifiers = await importsOf(file)
        return specifiers
          .filter((specifier) => !allowed(specifier))
          .map((specifier) => `${file}: ${specifier}`)
      }),
    )
    const violations = checked.flat()
    expect(violations).toEqual([])
  })
})
