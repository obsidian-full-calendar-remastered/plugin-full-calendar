/**
 * @file i18n.ts
 * @brief Internationalization (i18n) module for Full Calendar plugin.
 *
 * @description
 * This module provides internationalization support using i18next.
 * It detects the user's Obsidian language setting and loads the appropriate
 * translation resources. If a translation is missing, it gracefully falls back to English.
 *
 * @license See LICENSE.md
 */

import i18next from 'i18next';
import { App, requestUrl, normalizePath, getLanguage } from 'obsidian';

// Load English as default and fallback statically
import en from './locales/en.json';

const REMOTE_I18N_ASSET_BASE_URL = 'https://fcr-cdn.plugin-fcr.workers.dev/assets/i18n';

/**
 * Type-safe translation resources container
 */
const resources: Record<string, { translation: Record<string, unknown> }> = {
  en: { translation: en }
};

function applyLocaleResource(language: LanguageCode, parsedData: Record<string, unknown>): void {
  resources[language] = { translation: parsedData };
  if (i18next.isInitialized) {
    i18next.addResourceBundle(language, 'translation', parsedData, true, true);
  }
}

/**
 * Available language codes
 */
const SUPPORTED_LANGUAGES = ['en', 'de', 'fr', 'it', 'es', 'zh'] as const;
export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number];

/**
 * Get the current Obsidian language setting
 * @param app Obsidian App instance
 * @returns The current language code
 */
function getObsidianLanguage(_app: App): string {
  // Obsidian stores the UI language in global localStorage under 'language'.
  // NOTE: app.loadLocalStorage() is plugin-scoped and prefixes keys with the plugin ID,
  // so it would look for 'full-calendar-remastered-language' which is NOT what we want.
  try {
    const language = getLanguage();
    return typeof language === 'string' && language.length > 0 ? language : 'en';
  } catch {
    return 'en';
  }
}

function isSupportedLanguage(value: string): value is LanguageCode {
  return SUPPORTED_LANGUAGES.includes(value as LanguageCode);
}

function getLocaleCachePath(app: App, pluginId: string, language: LanguageCode) {
  const localesFolder = normalizePath(`${app.vault.configDir}/plugins/${pluginId}/locales`);
  const localeFile = normalizePath(`${localesFolder}/${language}.json`);
  return { localesFolder, localeFile };
}

async function downloadLocaleData(
  app: App,
  pluginId: string,
  language: LanguageCode
): Promise<Record<string, unknown>> {
  const { localesFolder, localeFile } = getLocaleCachePath(app, pluginId, language);
  const url = `${REMOTE_I18N_ASSET_BASE_URL}/${language}.json`;
  const response = await requestUrl(url);
  const localeDataStr = response.text;
  const parsedData = JSON.parse(localeDataStr) as Record<string, unknown>;

  if (!(await app.vault.adapter.exists(localesFolder))) {
    await app.vault.adapter.mkdir(localesFolder);
  }
  await app.vault.adapter.write(localeFile, localeDataStr);
  return parsedData;
}

export async function refreshCurrentI18nLocaleForVersionUpdate(
  app: App,
  pluginId: string
): Promise<boolean> {
  const detectedLanguage = getObsidianLanguage(app);
  if (!isSupportedLanguage(detectedLanguage) || detectedLanguage === 'en') {
    return false;
  }

  const parsedData = await downloadLocaleData(app, pluginId, detectedLanguage);
  applyLocaleResource(detectedLanguage, parsedData);
  return true;
}

/**
 * Initialize the i18n system
 * @param app Obsidian App instance
 * @param pluginId The plugin's manifest ID (e.g. plugin.manifest.id)
 */
export async function initializeI18n(app: App, pluginId: string): Promise<void> {
  const detectedLanguage = getObsidianLanguage(app);
  let resolvedLanguage = 'en';

  if (isSupportedLanguage(detectedLanguage) && detectedLanguage !== 'en') {
    try {
      const { localeFile } = getLocaleCachePath(app, pluginId, detectedLanguage);

      let localeDataStr = '';

      // Check if the localized translation is already present in the plugin directory
      if (await app.vault.adapter.exists(localeFile)) {
        localeDataStr = await app.vault.adapter.read(localeFile);
      } else {
        const parsedData = await downloadLocaleData(app, pluginId, detectedLanguage);
        applyLocaleResource(detectedLanguage, parsedData);
        resolvedLanguage = detectedLanguage;
        localeDataStr = '';
      }

      if (localeDataStr) {
        const parsedData = JSON.parse(localeDataStr) as Record<string, unknown>;
        applyLocaleResource(detectedLanguage, parsedData);
        resolvedLanguage = detectedLanguage;
      }
    } catch {
      // Fails gracefully back to 'en' if network is down and cache is empty
    }
  }

  await i18next.init({
    lng: resolvedLanguage,
    fallbackLng: 'en',
    resources,
    interpolation: {
      escapeValue: false // React already escapes values
    },
    // Return key if translation is missing
    returnNull: false,
    returnEmptyString: false
  });
}

/**
 * Get the i18next instance for translations
 * Use this in your components: i18n.t('key')
 */
export const i18n = i18next;

/**
 * Type-safe translation function
 * Usage: t('commands.newEvent')
 */
export const t = (key: string, options?: Record<string, string | number | null>): string => {
  return i18next.t(key, options);
};
