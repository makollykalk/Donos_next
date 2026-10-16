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

## Independent review fixes — RED → GREEN

Regression tests were written first for each review finding. RED command: `pnpm exec vitest run tests/unit/ai-text-extractor.test.ts tests/unit/ai-proposal-validation.test.ts` — **4 failed, 15 passed**. The failures reproduced: `R$ 1.200,00` becoming `1.2`; `R$ 38/kg` becoming a total; trailing operation/item conjunction accepted as unambiguous; and an over-range derived price returning `ready`.

Fixes:

- Parse Brazilian grouped currency by removing grouping dots when a decimal comma is present (or valid thousands grouping is present), preserving `R$ 1.200,00` as `1200`.
- Recognize explicit `/kg`, `/g`, `/L`, `/mL`, `/un` and `por <unit>` suffixes as unit-price semantics unsupported by this DTO parser; keep total price null and mark ambiguous for review.
- Count operation cues and flag repeated operations; flag conjunction-tail content after the extracted quantity to require review for additional item/operation clauses.
- Validate derived or supplied unit price against `PriceStringSchema`; out-of-range values are returned as null and add `price` to missing fields, preventing `ready`.

GREEN evidence:

- `pnpm exec vitest run tests/unit/ai-text-extractor.test.ts tests/unit/ai-proposal-validation.test.ts` — **2 files passed, 19 tests passed**.
- `pnpm exec tsc -b packages/domain-ai --pretty false` — **passed**.
- `pnpm test:unit` — **23 files passed, 172 tests passed**; Node engine warning remains (`v24.19.0`, requested `>=24.22.0 <25`).

Self-review: grouped prices and unit-price suffixes are conservative and deterministic. Conjunction detection intentionally prefers review over a possibly incomplete proposal, including compound item clauses. Derived price now respects the frozen price schema bound; no schema or shared configuration changed. Only the two domain source files, two named test files, and this report were changed for this fix cycle.

## Independent re-review round 1 — RED → GREEN

Added regression test first for `Comprei 0.125 kg de arroz por R$ 40`. RED command: `pnpm exec vitest run tests/unit/ai-text-extractor.test.ts` — **1 failed, 10 passed**; extracted quantity was incorrectly `125`.

Separated quantity decimal normalization from Brazilian currency grouping. Quantities now only normalize comma decimal separators and preserve dot decimals such as `0.125`; money normalization separately applies localized grouping rules, preserving `R$ 1.200,00` as `1200` and decimal comma values as before.

GREEN evidence:

- `pnpm exec vitest run tests/unit/ai-text-extractor.test.ts` — **1 file passed, 11 tests passed**.
- `pnpm exec tsc -b packages/domain-ai --pretty false` — **passed**.
- `pnpm test:unit` — **23 files passed, 173 tests passed**; existing Node engine warning remains (`v24.19.0`, requested `>=24.22.0 <25`).

Self-review: grouping behavior is now isolated to currency parsing, avoiding reinterpretation of quantity precision. The parser regression suite still covers comma decimals and grouped currency after the split.
