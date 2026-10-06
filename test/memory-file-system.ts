import { ByteSize, Effect, FileSystem, Option } from "effect"

type MemoryTree = {
  readonly directories: readonly string[]
  readonly files: Map<string, string>
}

const fileInfo = (type: FileSystem.File.Type): FileSystem.File.Info => ({
  type,
  mtime: Option.none(),
  atime: Option.none(),
  birthtime: Option.none(),
  dev: 0,
  ino: Option.none(),
  mode: type === "Directory" ? 0o755 : 0o644,
  nlink: Option.none(),
  uid: Option.none(),
  gid: Option.none(),
  rdev: Option.none(),
  size: ByteSize.bytes(0),
  blksize: Option.none(),
  blocks: Option.none(),
})

const memoryFileSystem = (tree: MemoryTree) =>
  FileSystem.layerNoop({
    exists: (target) => Effect.succeed(tree.directories.includes(target) || tree.files.has(target)),
    readFileString: (target) => Effect.succeed(tree.files.get(target) ?? ""),
    remove: (target) =>
      Effect.sync(() => {
        tree.files.delete(target)
      }),
    stat: (target) => {
      if (tree.directories.includes(target)) {
        return Effect.succeed(fileInfo("Directory"))
      }
      if (tree.files.has(target)) {
        return Effect.succeed(fileInfo("File"))
      }
      return Effect.die(`The memory tree has no path: ${target}`)
    },
  })

export { memoryFileSystem, type MemoryTree }
