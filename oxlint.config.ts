import type { OxlintConfig } from "oxlint"

import { recommended } from "@effect/tsgo/oxlint-presets"
import { defineConfig } from "oxlint"

type PluginConfig = NonNullable<OxlintConfig["plugins"]>
type RuleConfig = NonNullable<OxlintConfig["rules"]>

// Adapted from vingroto's oxlint config.
const basePlugins: PluginConfig = ["typescript", "unicorn", "oxc", "promise", "import", "node"]

const categories: NonNullable<OxlintConfig["categories"]> = {
  correctness: "error",
  suspicious: "error",
  perf: "error",
  pedantic: "error",
  style: "error",
  restriction: "error",
}

const baseRules: RuleConfig = {
  "node/no-top-level-await": "off", // We don't care about CJS
  "unicorn/max-nested-calls": "off", // I don't like it
  "typescript/prefer-readonly-parameter-types": "off",
  "typescript/explicit-function-return-type": "off",
  "typescript/explicit-module-boundary-types": "off",
  "unicorn/prefer-global-this": "off",
  "func-style": ["error", "expression"],
  "no-magic-numbers": "off",
  "oxc/no-optional-chaining": "off",
  "oxc/no-rest-spread-properties": "off",
  "oxc/no-async-await": "off",
  "unicorn/no-null": "off",
  "sort-imports": "off",
  "no-undefined": "off",
  "max-statements": "off",
  "unicorn/no-process-exit": "off",
  "no-ternary": "off",
  "no-continue": "off",
  "prefer-destructuring": "off",
  "no-console": "error",
  "no-warning-comments": "off",
  "max-params": "off",
  "max-lines-per-function": "off",
  "id-length": "off",
  "no-inline-comments": "off",
  "unicorn/no-array-reduce": "error",
  // Effect combinators share names with array and Promise methods, and these six
  // rules match by name: `Effect.map` is read as an array iteration method,
  // `Effect.forEach` as `Array#forEach`, and `Effect.catch` as
  // `Promise.prototype.catch` (even its arity). No option scopes them to real
  // arrays or promises, and the repository has no raw promise chains or array
  // method references for them to protect, so they are disabled.
  "unicorn/no-array-for-each": "off",
  "unicorn/no-array-callback-reference": "off",
  "unicorn/no-array-method-this-argument": "off",
  "unicorn/prefer-top-level-await": "off",
  "promise/prefer-await-to-then": "off",
  "promise/valid-params": "off",
  "no-use-before-define": "error",
  "node/callback-return": "off", // Results in false positives
  "no-duplicate-imports": "off", // Does not work with oxfmt, yikes
  "no-void": "off",
  "typescript/explicit-member-accessibility": "off",
  // Aligned with `effecttsgo/async-function`: arrow thunks adapt native promise
  // APIs, so they are not forced to be `async`. Named functions and methods keep
  // the rule.
  "typescript/promise-function-async": ["error", { checkArrowFunctions: false }],
  complexity: "error",
  "max-classes-per-file": "off",
  "require-await": "off", // This rule is inferior to the accuracy of the type-aware typescript/require-await rule.
  "no-plusplus": "error",
  "init-declarations": "error",
  "sort-keys": "off",
  "oxc/erasing-op": "error",
  "no-nested-ternary": "off",
  "unicorn/no-nested-ternary": "off",
  "typescript/use-unknown-in-catch-callback-variable": "error",
  "typescript/no-non-null-assertion": "error",
  "typescript/consistent-type-definitions": ["error", "type"],
  "typescript/no-confusing-void-expression": "error",
  "typescript/parameter-properties": "error",
  "typescript/unified-signatures": "error",
  "no-useless-return": "error",
  "promise/no-multiple-resolved": "error",
  "import/no-named-default": "error",
  "import/unambiguous": "error",
  "unicorn/prefer-export-from": "off", // Conflicts with grouped typed imports.
  "unicorn/number-literal-case": "off", // Oxfmt lowercases hex digits.
  "oxc/no-map-spread": "off", // Keeping spread: Object.assign alternative causes accidental mutability
  "unicorn/no-await-expression-member": "error",
  "no-empty-function": "error",
  "unicorn/no-useless-collection-argument": "error",
  "unicorn/prefer-ternary": "error",
  "no-negated-condition": "error",
  "typescript/array-type": "error",
  // Effect builds errors, services and schemas through capitalized factory calls.
  "new-cap": ["error", { capIsNew: false }],
  "unicorn/throw-new-error": "off",
  "one-var": ["error", "never"],
  // Aligned with `effecttsgo/unnecessary-arrow-block`: forcing object-returning
  // arrows into block form (`requireReturnForObjectLiteral`) was the only reason
  // the Effect rule could not be followed. Concise object returns stay
  // parenthesized.
  "arrow-body-style": ["error", "as-needed"],
  "import/prefer-default-export": "off",
  "import/no-namespace": "off",
  "import/no-named-export": "off",
  "import/group-exports": "error",
  "promise/prefer-await-to-callbacks": "off",
  "node/no-process-env": "error",
  "import/exports-last": "error",
  "import/max-dependencies": "off",
  "import/consistent-type-specifier-style": ["error", "prefer-top-level"],
  "typescript/no-import-type-side-effects": "error",
  "import/no-relative-parent-imports": "error",
  "oxc/no-barrel-file": "error",
  "import/first": "error",
  "promise/avoid-new": "error",
  "import/no-nodejs-modules": "off", // This is a Bun process, not a browser app.
  "import/no-default-export": "error",
  "no-underscore-dangle": ["error", { allow: ["__dirname", "__filename", "_tag"] }],
}

// Effect diagnostics keep the recommended preset's warning severity unless a
// rule needs a different one.
const effectRuleSeverities: RuleConfig = {
  "effecttsgo/strict-effect-provide": "warn",
  "effecttsgo/unnecessary-arrow-block": "warn",
}

const disabledEffectRules: RuleConfig = {
  // This repo models records with Schema.Struct plus a same-name type alias and
  // constructs Schema.TaggedError classes with `new`, not `.make`.
  "effecttsgo/new-schema-class": "off",
  // Pipeable overloads are library API design; rata is an application.
  "effecttsgo/missing-pipeable-signature": "off",
  "effecttsgo/missed-pipeable-opportunity": "off",
  // Bun is the runtime; node builtins are the platform API.
  "effecttsgo/node-builtin-import": "off",
  // rata is a CLI. `effect/cli` is the CLI framework in Effect v4, and the
  // module is marked unstable as a whole, so the rule fires on every command
  // definition. The signal is not actionable here.
  "effecttsgo/unstable-api-usage": "off",
}

const ignorePatterns = [
  "**/node_modules/**",
  "**/dist/**",
  "**/*.d.ts",
  "**/*.config.{js,ts,mjs,cjs}",
  "**/tsconfig.tsbuildinfo",
]

export default defineConfig({
  extends: [recommended],
  plugins: basePlugins,
  categories,
  rules: { ...baseRules, ...effectRuleSeverities, ...disabledEffectRules },
  overrides: [
    {
      files: ["src/**/*.ts", "test/**/*.ts"],
      rules: {
        // Data models pair every Schema with a same-name type alias for its
        // decoded type. The rule does not distinguish the value and type
        // declaration spaces, so it reads the pair as a redeclaration.
        "no-redeclare": "off",
      },
    },
    {
      files: ["test/**/*.ts"],
      rules: {
        // Test callbacks are native async functions that await `Effect.runPromise`;
        // the rule's advice to model the flow with Effect values does not fit the
        // test harness.
        "effecttsgo/async-function": "off",
        // Tests own their layers and provide them per case.
        "effecttsgo/strict-effect-provide": "off",
      },
    },
  ],
  env: {
    builtin: true,
  },
  ignorePatterns,
})
