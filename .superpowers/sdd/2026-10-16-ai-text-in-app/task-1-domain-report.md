# Cycle 07A — Task 1 domain report

## Status

Implemented the frozen pure-domain contract. No database, network, tenant authorization, confirmation, or stock-write path was added.

## RED → GREEN evidence

- Wrote the two named unit test files before implementation.
- Initial RED command: `pnpm exec vitest run tests/unit/ai-text-extractor.test.ts tests/unit/ai-proposal-validation.test.ts` failed with `Tsconfig not found` while `@donos/domain-ai` did not yet exist; both suites reported 0 tests.
- After adding the package skeleton, the first run exposed a malformed `tsconfig.json`. Fixed the JSON syntax, then the next RED-to-GREEN run exercised 15 tests; one half-even assertion correctly exposed canonical zero formatting (`"0"` rather than `"0.000000000000"`). Updated the expectation and added the paired even/odd tie cases.
- Final focused command: `pnpm exec vitest run tests/unit/ai-text-extractor.test.ts tests/unit/ai-proposal-validation.test.ts` — **2 files passed, 15 tests passed**.
- Package build/typecheck: `pnpm exec tsc -b packages/domain-ai --pretty false` — **passed**.
- Full unit command: `pnpm test:unit` — **23 files passed, 168 tests passed**.
- The package manager emitted the existing engine warning: required Node `>=24.22.0 <25`, environment Node `v24.19.0`. Tests/typecheck still completed successfully.
- `git diff --check` — passed.

## Files changed

- `packages/domain-ai/package.json`
- `packages/domain-ai/tsconfig.json`
- `packages/domain-ai/src/index.ts`
- `packages/domain-ai/src/text-extractor.ts`
- `packages/domain-ai/src/proposal-validation.ts`
- `tests/unit/ai-text-extractor.test.ts`
- `tests/unit/ai-proposal-validation.test.ts`

The requested `implementer-prompt.md` format file was absent in this worktree; this report follows the explicit RED/GREEN, file list, test evidence, and self-review requirements from the task brief.

## Domain behavior

- Parser is synchronous and deterministic, refuses input over 2,000 characters, returns only the strict candidate DTO, and marks unsupported/multiple-action or multiple-quantity text for review.
- Receipt total remains distinct from unit price; decimal commas are normalized; issue reason is not inferred.
- Catalog resolution considers active entries and resolves only one exact normalized name. Unit families are checked; missing fields, zero quantity, ambiguity, or incompatible units keep the proposal in `needs_review`.
- Receipt supplier and every action's location must be explicitly selected. No supplier, location, IDs, confirmation, or execution command is inferred by the parser.
- Derived price uses integer `BigInt` arithmetic and half-even rounding at 12 decimal places.

## Security and precision self-review

- No persistence, external calls, SQL, tenant context, entitlement checks, confirmation acceptance, or stock mutation is reachable from this pure package.
- Parser text is treated only as untrusted data; there is no instruction execution or output field that can trigger an operation.
- Monetary division avoids binary floating point. Zero quantity is guarded before division, and the validator reports it missing.
- Candidate validity is assumed at the validator boundary according to its frozen typed interface; callers must continue validating untrusted candidate payloads against `AiTextCandidateSchema` before calling it.
- Exact normalized catalog name is the only match criterion; ambiguous or absent matches remain unresolved.

## Limits / integration notes

- Parser intentionally supports a narrow Portuguese pattern set and requires owner correction for unrecognized phrasing.
- The allowed change set excludes workspace lockfile/config registration. `pnpm` auto-detected the package and temporarily changed `pnpm-lock.yaml`; that out-of-scope mutation was reverted. Coordinator should ensure the new workspace package is represented in the shared lockfile/configuration during integration.
- Commit is created after this report and only includes the permitted domain files and the two named tests.
