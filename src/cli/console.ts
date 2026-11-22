import type { Console } from "effect"

const dropEmptyLine = (base: Console.Console): Console.Console =>
  new Proxy(base, {
    get(target, property, receiver) {
      if (property === "log") {
        const log: unknown = Reflect.get(target, "log", target)
        if (typeof log !== "function") {
          return log
        }
        return (...args: readonly unknown[]) => {
          if (args.length === 1 && args[0] === "") {
            return
          }
          Reflect.apply(log, target, args)
        }
      }
      const value: unknown = Reflect.get(target, property, receiver)
      return value
    },
  })

export { dropEmptyLine }
