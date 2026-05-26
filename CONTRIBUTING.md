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
- **Zero Hardcoded UI Strings**: All user-facing strings, headers, placeholders, helper text, and tooltips **MUST** be defined in [en.json](file:///d:/Codes/plugin-full-calendar/src/features/i18n/locales/en.json) and rendered via `t('key.path')`. (Do not modify other locale JSONs directly; maintainers or localized workflows will sync them later).

### 3. Documentation Sync & Formatting
- **Technical & User Docs**: Synchronize architecture docs (under `docs/architecture/`) and user guides (under `docs/user/`) in the same PR. As the name suggests, one is the single source of implementation logic, while the other is for ease of access of users.
- **Formatting Style**: Write extremely concise, hyperlinked, compact markdown. Rely on clean comparison tables and structural note/warning boxes rather than verbose paragraphs.

### 4. Strict Type Safety & Linting
- **Verification**: Run local tests and verify everything builds cleanly before submitting. Run `pnpm run ra` (for TypeScript compiling, Prettier formatting, ESLint/CSS lint checks, i18n validation, and Jest unit tests) and ensure it completes with **0 errors**.

### 5. Test Integrity
- **Don't Modify Existing Tests**: Never modify existing `.test` files. You are encouraged to add new unit or integration tests, but baseline coverage must remain intact to prevent regressions. If there is a good reason to modify the existing test files, please let the maintainers know and do not do it yourself.

---

## 🚀 Getting Started

### 1. Create the Obsidian Vault

To develop locally, set up your development vault and plugin directory:

```bash
mkdir -p .obsidian/.plugins/full-calendar-remastered/
cp manifest.json .obsidian/.plugins/full-calendar-remastered/manifest.json
````

*Currently this folder already exists and will contain the minimified builds accordingly the latest tags (this is done to simplify the obsidian community plugin release process).

> 💡 **Note:** Obsidian expects a CSS file named `styles.css`, but **esbuild** will output one named `main.css`.

---

### 2. Build the Plugin

You can build the plugin in two ways:

* For development:

  ```bash
  pnpm run dev
  ```

* For a production/minified build:

  ```bash
  pnpm run prod
  ```

All build output will appear in the plugin directory created above.

---

### 3. Open the Vault in Obsidian

1. Open **Obsidian**
2. Go to **Vaults** → **Open Folder as Vault**
3. Select the `obsidian-dev-vault` directory

---

## 🧠 Tips for Developers

> 💡 **Recommended:** Use the [Hot Reload plugin](https://github.com/pjeby/hot-reload) to make development smoother — it auto-reloads your plugin changes.

> 📘 **Start Here:** To understand the architecture and get familiar with the codebase, read our [Architecture Guide](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/blob/main/src/README.md).

> 📱 **Android Testing** For testing Android devices use `adb` together with `chrome://inspect/#devices` to see the console on the PC.

---

Thanks for helping improve Full Calendar! 🎨🗓️
