
# Full Calendar Plugin for Obsidian

This plugin integrates FullCalendar.io into Obsidian. It reads and writes events from local sources (note frontmatter, daily notes, journals) and remote ones (ICS, CalDAV, Google, Outlook), plus several task providers. It is TypeScript-based, modular, and designed for robust event management and calendar views.

> **Package manager: pnpm, not npm.** `preinstall` runs `npx only-allow pnpm`, so `npm install` hard-fails. Every command below uses `pnpm`.

## Essential Architecture

- **UI Layer**: React-style components (`src/ui/`) and FullCalendar.io integration (`src/ui/view.ts`), with `ViewEnhancer` (`src/core/ViewEnhancer.ts`) applying workspace filters. Note that `react`/`react-dom` are aliased to `preact/compat` at build time in `esbuild.config.mjs`.
- **Core Layer**: `EventCache` (`src/core/EventCache.ts`) is the single source of truth, with optimistic writes and rollback on provider failure. It wraps `EventStore` (`src/core/EventStore.ts`), an in-memory DB with secondary indexes.
- **Normalization Layer**: `EventEnhancer` (`src/core/EventEnhancer.ts`) is the chokepoint between raw provider data and canonical events. `enhance()` converts raw → canonical (category split, source timezone → display timezone); `prepareForStorage()` reverses it.
- **Provider Layer**: Pluggable sources under `src/providers/`, contract defined in `src/providers/Provider.ts`, all I/O routed through `ProviderRegistry` (`src/providers/ProviderRegistry.ts`).
- **Abstraction Layer**: `ObsidianAdapter` (`src/ObsidianAdapter.ts`) for testable Obsidian API interactions.
- **ChronoAnalyser**: Data visualization (`src/chrono_analyser/`), consumes `EventCache` via pub/sub for real-time updates.

**Data Flow**: strictly one-way through the cache.
- User actions → `EventCache` → `EventEnhancer` → `ProviderRegistry` → provider → vault or network
- File changes / remote sync → provider → `EventEnhancer` → `EventCache` → UI updates (pub/sub)

### Providers

Thirteen providers are registered in `ProviderRegistry.registerBuiltInProviders()`, all as lazy dynamic imports: `local` (full note), `dailynote`, `journals`, `ical`, `caldav`, `caldavtasks`, `google`, `googletasks`, `outlook`, `tasks`, `tasknotes`, `bases`, `holidays`.

Adding a provider means touching the registry, the settings dropdown in `src/ui/settings/SettingsTab.tsx`, and the docs. Follow `docs/architecture/calendars/provider-blueprint.md`.

## Developer Workflows

- **Bootstrap**:
	- `pnpm install`
- **Build/Test**:
	- `pnpm run compile` (type check, `tsc --noEmit`)
	- `pnpm run lint` (ESLint: one TypeScript pass, one CSS pass)
	- `pnpm test` (Jest, 89 suites / 894 tests / 43 snapshots)
	- `pnpm run build` (esbuild, production)
	- `pnpm run prod` (type check + production build)
- **Development**:
	- `pnpm run dev` (esbuild watch, writes into the dev vault)
	- `pnpm run lint:fix` (ESLint autofix)
	- `pnpm run format` (Prettier write) / `pnpm run format:check`
	- `pnpm run test-dev` (Jest watch mode)
	- `pnpm run coverage` (test coverage)
- **Validation**:
	- While iterating: `pnpm run compile && pnpm test && pnpm run lint`
	- Before opening a PR: `pnpm run ra` must exit with **0 errors**. It runs Prettier `--write`, compile, ESLint (to `lint_report.txt`), CSS lint (to `css_report.txt`), the i18n sync check, and Jest. It **rewrites source files**, so run it deliberately rather than mid-investigation.
	- Test in `obsidian-dev-vault/`. The dev vault is created automatically by `esbuild.config.mjs` on first build; it is gitignored, so its absence is normal.

> **Snapshot warning**: CI runs `pnpm run test-update` (`.github/workflows/check.yml`), i.e. Jest with `--updateSnapshot`. **Snapshot drift cannot fail CI.** Verify snapshots locally with plain `pnpm test`.

## Project Conventions

- **Event Storage**:
	- Full Note: events as separate notes with frontmatter
	- Daily Note: events as list items with inline metadata
- **Category System**:
	- Format: `Category - Title` or `Category - Subcategory - Title`
	- Parsing and color logic live in `EventEnhancer` / `src/features/category/`
- **Recurring Events**:
	- Editing a single instance is "skip and override": the date is pushed into the parent's `skipDates[]` **and** a new `single` event is created carrying `recurringEventId` back to the parent. That is two writes, not one. Providers with native recurrence set `ownsRecurringInstanceOverrides` and bypass this. See `src/features/recur_events/RecurringEventManager.ts`.
- **Timezones**: three are always live — SourceTZ (stored on the event), DisplayTZ (user setting), SystemTZ. `src/features/timezone/Timezone.ts` is a bespoke, luxon-free implementation; luxon remains a dependency for FullCalendar.io but should not be used for core conversion logic.
- **Internationalization**:
	- Uses i18next, translation files in `src/features/i18n/locales/`, type-safe keys.
	- **Zero hardcoded user-facing strings.** Add to `en.json` and render via `t('key.path')`. Do not hand-edit the other locale JSONs; `pnpm run ra` syncs them.
- **Tests**: never modify existing `.test` files. Add new ones freely. See `CONTRIBUTING.md`.

## Key Files & Directories

- `src/main.ts` — Plugin entry
- `src/core/PluginState.ts` — Global singleton wiring
- `src/core/EventCache.ts` — Event management (single source of truth)
- `src/core/EventStore.ts` — In-memory DB
- `src/core/EventEnhancer.ts` — Raw ↔ canonical normalization
- `src/providers/` — Provider implementations
- `src/providers/Provider.ts` — Provider contract
- `src/ui/view.ts` — Calendar view integration
- `src/types/schema.ts` — Zod schemas (`OFCEvent`)
- `test_helpers/` — `MockVault.ts`, `AppBuilder.ts`, `FileBuilder.ts` for Obsidian API mocking
- `docs/architecture/` — Implementation documentation (MkDocs)

## Integration & Extensibility

- **External dependencies**: FullCalendar.io, Preact (aliased from React), Luxon, Zod, i18next (bundled); Obsidian APIs marked external
- **ChronoAnalyser**: Extensible charting via Strategy Pattern; subscribes to EventCache for real-time data
- **Testing**: Unit and integration tests against a mock vault, snapshot tests, coverage available

## Troubleshooting

- Build failures: check TypeScript errors, esbuild config, CSS renaming
- Test failures: check date/timezone assumptions first; see the snapshot warning above before reaching for `test-update`
- Plugin loading: verify build output in the dev vault, check the Obsidian console

## Best Practices

- Minimal, modular changes; follow SOLID/DRY
- ESLint for correctness, Prettier for formatting; Husky pre-commit runs a type check
- Always validate in the dev vault before commit
- Reference [Obsidian plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)


### Repository Structure
```
.
├── README.md
├── CONTRIBUTING.md
├── package.json           # pnpm scripts and dependencies
├── esbuild.config.mjs     # build configuration
├── jest.config.js         # test configuration
├── manifest.json          # Obsidian plugin manifest
├── manifest-beta.json     # manifest copied into the dev vault by the build
├── src/                   # TypeScript source code
│   ├── main.ts            # plugin entry point
│   ├── ObsidianAdapter.ts # Obsidian API abstraction
│   ├── api/               # public and internal API surface
│   ├── core/              # core logic (EventCache, EventStore, EventEnhancer)
│   ├── providers/         # calendar and task source implementations
│   ├── features/          # i18n, timezone, workspaces, recurrence, categories, …
│   ├── ui/                # components, views, settings, modals
│   ├── chrono_analyser/   # data visualization
│   ├── types/             # TypeScript types and Zod schemas
│   ├── utils/             # shared helpers
│   ├── stubs/             # build-time module shims
│   └── workers/           # web workers
├── test_helpers/          # test utilities and mocks
├── docs/                  # documentation (MkDocs)
├── tools/                 # development utilities (i18n sync, generators, Android helpers)
└── obsidian-dev-vault/    # development Obsidian vault (gitignored, created by the build)
```

### Key Source Files
- `src/main.ts` -- Plugin entry point and initialization
- `src/core/EventCache.ts` -- Central event management (single source of truth)
- `src/core/EventStore.ts` -- In-memory event database with indexes
- `src/core/EventEnhancer.ts` -- Normalization chokepoint between raw and canonical events
- `src/providers/Provider.ts` -- The provider contract every source implements
- `src/providers/ProviderRegistry.ts` -- Provider registration, ID mapping, staged load
- `src/providers/fullnote/FullNoteProvider.ts` -- Full note calendar implementation
- `src/providers/dailynote/DailyNoteProvider.ts` -- Daily note calendar implementation
- `src/ui/view.ts` -- Main calendar view integration with FullCalendar.io
- `src/types/schema.ts` -- Zod schemas for data validation

### Build System Details
- **Bundler**: esbuild with custom configuration
- **CSS Handling**: Automatically renames `main.css` to `styles.css` for Obsidian compatibility, then copies `main.js`, `styles.css`, and `manifest-beta.json` (as `manifest.json`) into the dev vault
- **TypeScript**: Strict type checking with `tsc --noEmit`
- **Lean builds**: `pnpm run build:lean` stubs out `plotly.js` and `date-holidays` for a smaller bundle
- **External Dependencies**: FullCalendar.io, Preact, Luxon and others bundled; Obsidian APIs marked as external

### Testing Framework
- **Framework**: Jest with ts-jest preset, jsdom environment
- **Test Types**: Unit tests, integration tests against a mock Obsidian vault
- **Coverage**: Run `pnpm run coverage` for a detailed coverage report
- **Test Files**: `*.test.ts` files alongside source code and in `test_helpers/`
- **Mocking**: `test_helpers/MockVault.ts`, `AppBuilder.ts`, and `FileBuilder.ts` provide Obsidian API mocking; `__mocks__/obsidian.ts` mocks the module itself
- **Property testing**: `fast-check` and `zod-fast-check` are available for schema-level tests

### Development Tools
- **Linting**: ESLint (`pnpm run lint`), including a dedicated CSS pass via `eslint.css.config.mjs`
- **Formatting**: Prettier (`pnpm run format`), separate from linting
- **Git Hooks**: Husky pre-commit runs `npm run compile`, so a type error blocks the commit
- **Utilities**: `tools/` holds the i18n sync script plus optional Python helpers for Android testing and event generation
- **Documentation**: MkDocs setup for the documentation site

## Time Expectations and Timeouts

CRITICAL: NEVER CANCEL builds or long-running commands.

Approximate warm-cache timings, measured on one developer machine. Treat these as order-of-magnitude only; they vary substantially with hardware and cache state.

| Command | Approx. |
|---|---|
| `pnpm run compile` | ~7s |
| `pnpm test` | ~15s |
| `pnpm run lint` | ~30s |
| `pnpm run build` | ~10s |
| `pnpm run prod` | ~10s |
| `pnpm run coverage` | ~10s |
| `pnpm run compile && pnpm test && pnpm run lint` | ~50s |

`pnpm install` is network-bound and varies widely. Set timeouts to at least 2x the expected time.

## Common Issues and Solutions

**Build Issues:**
- If esbuild fails, check TypeScript errors with `pnpm run compile`
- If styles are missing, ensure the CSS renaming plugin ran in `esbuild.config.mjs`

**Test Issues:**
- Use `pnpm run test-dev` for watch mode during development
- Snapshot failures: inspect the diff first. Only run `pnpm run test-update` once you have confirmed the new snapshot is correct — CI already updates snapshots, so it will not catch a wrong one for you
- Date and timezone tests are sensitive to the three-timezone model; a failure there usually indicates a real bug rather than an environment quirk

**Plugin Loading Issues:**
- Ensure the build wrote `main.js`, `styles.css`, and `manifest.json` into `obsidian-dev-vault/.obsidian/plugins/full-calendar-remastered/`
- Check the Obsidian console for plugin loading errors
- The [Hot Reload plugin](https://github.com/pjeby/hot-reload) reloads the plugin automatically on rebuild

**Development Workflow:**
- Use `pnpm run dev` for watch mode during active development
- Run the full validation suite before committing changes
- Test plugin functionality in the dev vault for real-world validation

## Important Notes
- Keep the codebase clean, lean, modular. Follow the SOLID and DRY principle.
- Always follow the Obsidian plugin development [guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines).
- Follow the minimal code changes principle - only modify what is necessary for the feature or fix, unless SOLID and DRY principles dictate otherwise.
- Commit messages should be precise and detailed, stating what changed and why. The repo uses conventional-commit titles, e.g. `fix(caldav): …`, `feat(ui): …`, `docs(calendar): …`.
- Documentation must be synchronized in the same PR: `docs/architecture/` for implementation truth and `docs/user/` for the user guide.
