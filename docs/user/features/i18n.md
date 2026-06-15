# Internationalization (i18n) Guide for Full Calendar

Full Calendar supports multiple languages through a robust i18n system. This guide explains how to use, extend, and contribute translations for the plugin.

---


## How It Works
- The plugin uses [i18next](https://www.i18next.com/) for internationalization.
- Translation files are located in `src/features/i18n/locales/`.
- The UI language automatically matches your Obsidian language setting.
- All translation keys are type-safe and validated at compile time.

### Supported Languages

The following languages are currently supported:

- English (`en`)
- French (`fr`)
- German (`de`)
- Spanish (`es`)
- Italian (`it`)

---

## Adding a New Language
1. **Create a new translation file** in `src/features/i18n/locales/` (e.g., `fr.json` for French).
2. **Copy the structure** from an existing file (such as `en.json`).
3. **Translate each key**. Do not change the key names—only the values.
4. **Test your translation** by switching your Obsidian language setting.

---

## Contributing Translations
- Submit a pull request with your new or updated translation file.
- Ensure all keys are present and translated.
- If you add new features or UI elements, update the English file first and notify maintainers to propagate changes.

---

## Best Practices
- Keep translations concise and clear.
- Use placeholders (e.g., `{{date}}`) for dynamic values.
- Avoid hardcoding language in code—always use translation keys.

---

## Troubleshooting

See the **[Central Troubleshooting Guide](../guides/troubleshooting.md#internationalization-i18n)** for help with translation keys or missing locale strings.

---

## Resources
- [i18next Documentation](https://www.i18next.com/)
- [Obsidian Plugin Guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)

---

## Related Features

The [Natural Language Quick Add](nlp.md) feature uses the same i18n download-and-cache pipeline for its language-specific NLP payloads. When you add a new language to the i18n system, consider also creating a matching NLP payload in `src/features/nlp/payloads/`.

---

For questions or help, submit an issue on GitHub or reach out to the maintainers.
