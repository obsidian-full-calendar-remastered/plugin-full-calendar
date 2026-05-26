## Description
Describe the purpose of this PR.
<!-- Provide a brief, concise description of your changes and why they are necessary. -->


## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Refactor
- [ ] Documentation
- [ ] Chore / maintenance

## Related Issues

- Closes #
- Related to #

## Code Quality Checklist (MANDATORY)
*Please read and verify you have adhered to all guidelines outlined in [CONTRIBUTING.md](../CONTRIBUTING.md).*

- **SOLID & DRY**:
  - [ ] Designed polymorphically where appropriate.
  - [ ] Kept classes and UI views decoupled (e.g., separating layout/filtering scroll sections from persistent creation footers).
  - [ ] Shared reusable helpers instead of copying/pasting logic.
- **Internationalization (i18n)**:
  - [ ] Declared all new UI headers, text, labels, and placeholders inside `src/features/i18n/locales/en.json` and retrieved them using `t()`; **no** user-facing strings are hardcoded in the codebase.
- **Documentation Sync**:
  - [ ] Updated corresponding architectural documentation (under `docs/architecture/`).
  - [ ] Updated corresponding user-facing documentation (under `docs/user/`).
  - [ ] Adhered to the hyperlinked, compact, table-based concise formatting style.
- **Code Integrity & Type Safety**:
  - [ ] Ran `pnpm run ra` locally and confirmed that compilation, ESLint (`lint_report.txt` and `css_report.txt`), i18n checks, and Jest unit tests pass with **0 errors**.
- **Test Integrity**:
  - [ ] Kept all existing `.test` files completely untouched.
  - [ ] Added new unit/integration tests for new features.
