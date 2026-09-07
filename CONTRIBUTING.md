# 🎉 Contributing to Full Calendar

Full Calendar is open to contributions, and we’re excited to have you here! This guide will help you get set up for local development.

> We welcome any and all types of PR, including the ones assisted by AI. Nevertheless, to ensure the code base is clean and up to the standards, it is ensured that it is strictly adhered to the following principles.

## Core Engineering Standards & Guidelines

To maintain a premium, state-of-the-art codebase, all contributions must strictly adhere to the following principles:

### 1. SOLID, DRY & Modularity (Standard Programming practices)
- **Open-Closed Principle (OCP)**: Leverage polymorphic interfaces so new features require extending systems, not modifying core registries or mutating existing flows.
- **Single Responsibility (SRP)**: Keep classes, files, and views highly focused. Decouple concern layers cleanly (e.g. separate upper scrollable list filters from persistent fixed footers).
- **Don't Repeat Yourself (DRY)**: Re-use selectors, normalizers, and formatting helpers. Avoid copy-pasted layout rules or logic.

### 2. Internationalization (i18n)
- **Zero Hardcoded UI Strings**: All user-facing strings, headers, placeholders, helper text, and tooltips **MUST** be defined in [`src/features/i18n/locales/en.json`](src/features/i18n/locales/en.json) and rendered via `t('key.path')`. (Do not modify other locale JSONs directly; maintainers or localized workflows will sync them later).

### 3. Documentation Sync & Formatting
- **Technical & User Docs**: Synchronize architecture docs (under `docs/architecture/`) and user guides (under `docs/user/`) in the same PR. As the name suggests, one is the single source of implementation logic, while the other is for ease of access of users.
- **Formatting Style**: Write extremely concise, hyperlinked, compact markdown. Rely on clean comparison tables and structural note/warning boxes rather than verbose paragraphs.

### 4. Strict Type Safety & Linting
- **Verification**: Run local tests and verify everything builds cleanly before submitting. Run `pnpm run ra` (for TypeScript compiling, Prettier formatting, ESLint/CSS lint checks, i18n validation, and Jest unit tests) and ensure it completes with **0 errors**.

### 5. Test Integrity
- **Don't Modify Existing Tests**: Never modify existing `.test` files. You are encouraged to add new unit or integration tests, but baseline coverage must remain intact to prevent regressions. If there is a good reason to modify the existing test files, please let the maintainers know and do not do it yourself.

---

## 🚀 Getting Started

### 1. Build the Plugin

There is no manual directory setup. `esbuild.config.mjs` creates the development vault and the
plugin folder inside it on the first build, then keeps them up to date on every rebuild.

* For development (watch mode, unminified, inline sourcemaps):

  ```bash
  pnpm run dev
  ```

* For a production/minified build:

  ```bash
  pnpm run prod
  ```

> ⚠️ **Use pnpm, not npm.** `preinstall` runs `npx only-allow pnpm`, so `npm install` fails.

Each build writes to:

```
obsidian-dev-vault/.obsidian/plugins/full-calendar-remastered/
├── main.js
├── styles.css     # esbuild emits main.css; the build renames it for you
└── manifest.json  # copied from manifest-beta.json
```

`obsidian-dev-vault/` is gitignored, so it will not exist until your first build. That is normal.

---

### 2. Open the Vault in Obsidian

1. Open **Obsidian**
2. Go to **Vaults** → **Open Folder as Vault**
3. Select the `obsidian-dev-vault` directory
4. Turn off **Restricted Mode**, then enable **Full Calendar Remastered** in Community Plugins

---

### 3. Verify Your Changes

While iterating (all read-only, none of them write to your tree):

```bash
pnpm run compile   # tsc --noEmit
pnpm test          # jest
pnpm run lint      # eslint, TypeScript pass + CSS pass
```

Before opening a PR, run the full gate. It must exit with **0 errors**:

```bash
pnpm run ra
```

> ⚠️ **`pnpm run ra` rewrites files.** It runs Prettier `--write` over `src/`, regenerates
> `lint_report.txt` and `css_report.txt`, and syncs the non-English locale JSONs. Run it
> deliberately just before committing, not while you are still investigating.

> ⚠️ **Check snapshots locally.** CI runs `pnpm run test-update` (Jest with
> `--updateSnapshot`), so snapshot drift cannot fail CI. Plain `pnpm test` is the only thing
> that catches it.

---

## 🧠 Tips for Developers

> 💡 **Recommended:** Use the [Hot Reload plugin](https://github.com/pjeby/hot-reload) to make development smoother — it auto-reloads your plugin changes.

> 📘 **Start Here:** To understand the architecture and get familiar with the codebase, read our [Architecture Docs](https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/architecture/system/). (`src/README.md` is the older version of this and is marked deprecated.)

> 📱 **Android Testing** For testing Android devices use `adb` together with `chrome://inspect/#devices` to see the console on the PC.

---

Thanks for helping improve Full Calendar! 🎨🗓️
