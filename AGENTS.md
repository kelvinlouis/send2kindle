# AGENTS.md

This file provides guidance to AI coding agents when working with code in this repository.

## Commands

- `npm test` — run all tests (run after every refactoring or code change)
- `npm run test:watch` — run tests in watch mode
- `npm run test:coverage` — run tests with branch coverage
- `npx vitest run src/utils.test.js` — run a single test file
- `npx prettier --write .` — format all files (run before completing any task)

## Code Quality

- Write small, focused functions that do one thing (Single Responsibility)
- Name functions and variables to reveal intent — avoid abbreviations and generic names
- Keep functions short; extract when a block needs a comment to explain _what_ it does
- No dead code, no commented-out code — delete it (git has history)
- Avoid magic numbers/strings — use named constants
- Prefer early returns over deeply nested conditionals
- Keep function arguments to 3 or fewer; group related args into an object
- Don't repeat yourself — but only extract shared logic when duplication is real, not speculative

## TDD Workflow

Follow Red-Green-Refactor for all code changes:

1. **Red** — Write a failing test that defines the expected behavior
2. **Green** — Write the minimum code to make the test pass
3. **Refactor** — Clean up while keeping tests green

Rules:

- Never write production code without a failing test first
- Run `npm test` after every change — never leave tests red
- One logical assertion per test; test names describe the behavior, not the implementation
- When fixing a bug, first write a test that reproduces it, then fix

## Testing

- Tests use Vitest v3.x with ESM imports and `globals: true` (no need to import `describe`/`it`/`expect`)
- Test files live next to source files with a `.test.js` suffix
- All system dependencies (fs, child_process, os, nodemailer, fetch) are mocked via `vi.mock()`
- Vitest config: `restoreMocks: true`, `clearMocks: true` — mocks auto-reset between tests

## Commits

- Use [Conventional Commits](https://www.conventionalcommits.org/) for all commit messages
- Format: `<type>(<optional scope>): <description>` (e.g., `feat: add PDF support`, `fix(mailer): handle timeout`)
- Common types: `feat`, `fix`, `refactor`, `test`, `chore`, `docs`, `style`, `perf`, `ci`, `build`

## Formatting

- Prettier is configured via `.prettierrc` (printWidth: 100, singleQuote, trailingComma: all)
- All `.js` and `.mjs` files must be formatted with Prettier

## Architecture

CLI tool that sends articles/PDFs to Kindle via email. ESM throughout (`"type": "module"`).

**Pipeline:** `send2kindle.js` (entry/CLI) → extract → convert → send

**Book mode:** `--book "Title"` combines multiple URLs into a single EPUB with chapters.
Each URL is extracted and becomes a chapter split at `<h1>` boundaries via `--epub-chapter-level=1`.

- `send2kindle.js` — CLI entry point, parses args, orchestrates the pipeline (single-article and book mode)
- `src/extractors/index.js` — routes URLs to the right extractor (`isTwitterUrl` check)
  - `src/extractors/article.js` — fetches HTML, uses `@mozilla/readability` + `jsdom` to parse
  - `src/extractors/twitter.js` — uses fxtwitter JSON API, handles both tweets and Twitter Articles
- `src/converter.js` — `convertToEpub` (single article) and `convertBookToEpub` (multi-chapter); writes YAML metadata, shells out to `pandoc`
- `src/mailer.js` — sends file as email attachment via `nodemailer` SMTP
- `src/config.js` — reads env vars (`KINDLE_EMAIL`, `SMTP_*`, `FROM_EMAIL`)
- `src/utils.js` — `commandExists`, `getInputType`, `sanitizeFilename`, `escapeYaml`

**External dependency:** `pandoc` must be installed on the system for EPUB conversion.

All extractors return `{ title, content, textContent, byline, siteName }` — this is the shared interface consumed by `convertToEpub`.
