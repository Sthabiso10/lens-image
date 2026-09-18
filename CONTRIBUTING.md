# Contributing

## Setup

```bash
npm install
npm run build     # required before the adapters typecheck. They read core's .d.ts
npm test
```

**Node 18.17+.** The build is `tsc` twice per package (ESM and CJS) and nothing
else, no bundler, by design.

## Commands

| | |
|---|---|
| `npm run build` | All packages, dual ESM + CJS. Takes a package name to narrow it. |
| `npm test` | 213 tests on Node's built-in runner, via tsx. |
| `npm test core` | One package. |
| `npm run test:watch` | |
| `npm run typecheck` | The whole workspace, including tests and examples. |
| `npm run release:check` | Enforces the publishing rules below. |
| `npm run set-scope @you` | Renames the npm scope across the repo. |
| `npm run dev --workspace @lens-image/docs` | The docs site on :3000. |

## The rules that are not negotiable

These are what the project is *for*, so they are enforced by
`scripts/release-check.mjs` and by tests rather than by review:

1. **`@lens-image/core` has zero `dependencies`.** Not "few". Zero. Heavy things go in
   `peerDependencies` with `peerDependenciesMeta.optional`, and are loaded with
   a dynamic `import()` at the point of use.
2. **Adapters declare their SDK as a peer**, for the same reason.
3. **`@lens-image/core/browser` imports nothing from `node:`.** A test walks its
   import graph and fails with the offending file if it does.
4. **Errors are `LensError` with a stable code.** Never throw a bare `Error`
   across a public boundary, callers branch on `code`, not on message text.

## Adding a storage adapter

Adapters live in `packages/adapter-<name>` and implement `StorageAdapter`. The
smallest complete example is `packages/core/src/adapters/memory.ts` (about forty
lines of real logic); `adapter-local` is the smallest *real* one.

- Only `upload` is required. `exists` unlocks `cache: 'storage'`, `remove`
  unlocks `optimizer.delete()`.
- **Throw on failure.** Do not swallow errors: the core needs the throw to
  trigger a retry.
- **Do not retry inside the adapter.** It compounds with the core's policy into
  surprising delays.
- **Translate the SDK's errors.** A raw `AccessDenied` has never helped anybody;
  say what to check.
- Test against a stub rather than a live account. `adapter-s3`'s tests stub the
  SDK and assert on the exact `PutObject` parameters, which is where the bugs
  actually are.

## Tests

Node's built-in runner, `node:assert/strict`, no framework.

Assertions carry a message saying what the behaviour *is*, not what the values
are, `assert.equal(x, y, 'the fallback produced output')` beats a bare
comparison when it fails at 2am.

Prefer the fake engine and `MemoryAdapter` over real codecs: the suite runs in
about a second and needs no native binary in CI.

## Code style

- Comments explain **why**, not what. If a line needs a comment to say what it
  does, rename something instead.
- JSDoc on everything exported, with a worked `@example` on anything a user
  calls directly.
- No `any` in public signatures. `unknown` plus a narrowing guard.
- Error messages are written for the person reading a stack trace at 2am: what
  was expected, what happened, and what to do about it.

## Releasing

All five packages ship together at one version.

```bash
npm run build
npm test
npm run release:check
npm publish --workspaces --access public
```

`release:check` will refuse a release with version drift, a missing README,
a dependency in the core, or a cross-package range that does not match.
