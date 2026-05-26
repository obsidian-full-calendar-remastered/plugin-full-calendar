<!--
Thanks for the Pull Request (PR)!

Name your PR with one of the following prefixes, e.g. "feat: add support for XYZ", to indicate the type of changes proposed. This is based on the [Conventional Commits specification](https://www.conventionalcommits.org/en/v1.0.0/#summary).
  - FORMAT: `type(scope): one line explaination`
Examples:
  - feat(ui): new feature for the user, not a new feature for build script
  - fix(cache): bug fix for the user, not a fix to a build script
  - docs(calendar): changes to the documentation
  - style(mobile): formatting, missing semicolons, etc; no production code change
  - refactor(tasks): refactoring production code, eg. renaming a variable
  - perf(DailyNote): code changes that improve performance
  - test(timezone): adding missing tests, refactoring tests; no production code change
  - chore: updating grunt tasks etc; no production code change
  - build: changes that affect the build system or external dependencies
  - ci: changes to configuration files and scripts
  - revert: reverts a previous commit

Please keep your PR:
- Small and focused
- Well explained (what + why)
- Aligned with project scope

Acceptance Criteria:
- Open an issue/discussion before implementing large changes especially if your PR involves `src/core/`.  
- Large or unclear PRs may be closed without in-depth review. 
- Low-quality contributions that cost more to review than to write from scratch will be closed without explaination. 
- AI assisted PRs are welcome, but do not offload basic common sense (surgical changes, architectural decisions, alignment with the project scope, ...). Prefer Vibe Programmed over Vibe Coded PRs. See [Programming vs Coding difference](https://www.geeksforgeeks.org/blogs/programming-vs-coding-a-short-comparison-between-both/).


-->

## Description
<!-- Provide a brief, concise description of your changes and why they are necessary. -->


## Type of Change

- [ ] Bug fix <!-- Add `Related Issue / Discussion #__ if applicable-->
- [ ] New feature <!-- Add `Related Issue / Discussion #__ if applicable-->
- [ ] Refactor  <!-- Add `Related Issue / Discussion #__ if applicable-->
- [ ] Documentation <!-- Add `Related Issue / Discussion #__ if applicable-->
- [ ] Chore / maintenance <!-- Add `Related Issue / Discussion #__ if applicable-->

## Code Quality Checklist (MANDATORY)
*Please read and verify you have adhered to all guidelines outlined in [CONTRIBUTING.md](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/blob/main/CONTRIBUTING.md).*

- **[SOLID](https://en.wikipedia.org/wiki/SOLID), [DRY](https://en.wikipedia.org/wiki/Don%27t_repeat_yourself)** :
  - [ ] Designed polymorphically where appropriate.
  - [ ] Kept classes and UI views decoupled (e.g., separating layout/filtering scroll sections from persistent creation footers).
  - [ ] Shared reusable helpers instead of copying/pasting logic.
- **Internationalization (i18n)**:
  - [ ] Declared all new UI headers, text, labels, and placeholders inside `src/features/i18n/locales/en.json` and retrieved them using `t()`; **no** user-facing strings are hardcoded in the codebase. <!-- Not necessary to translate other lang files, updating the en.json and running pnpm run ra should en.json entries into other files - which is fine!  -->
- **Documentation Sync**:
<!-- Take this as an opportunity not only to inform others of your addition but also align yourself with the current existing architecture surrounding your PR making you well aware of the downstream implications of this PR. -->
  - [ ] Updated corresponding architectural documentation (under `docs/architecture/`).
  - [ ] Updated corresponding user-facing documentation (under `docs/user/`).
  - [ ] Adhered to the hyperlinked, compact, table-based concise formatting style.
- **Code Integrity & Type Safety**:
  - [ ] Ran `pnpm run ra` locally and confirmed that compilation, ESLint (`lint_report.txt` and `css_report.txt`), i18n checks, and Jest unit tests pass with **0 errors**.
- **Test Integrity**:
  - [ ] Kept all existing `.test` files completely untouched.
  - [ ] Added new unit/integration tests for new features.
