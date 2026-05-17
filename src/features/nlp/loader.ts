import { App, normalizePath, requestUrl, getLanguage } from 'obsidian';
import baseEnPayload from './payloads/en.json';
import type { NLPPayload, NLPSupportedLanguage } from './types';

const SUPPORTED_LANGUAGES: NLPSupportedLanguage[] = ['en', 'de', 'fr', 'it', 'es'];
const REMOTE_NLP_ASSET_BASE_URL = 'https://fcr-cdn.plugin-fcr.workers.dev/assets/nlp';

const inMemoryPayloadCache = new Map<NLPSupportedLanguage, NLPPayload>([
  ['en', baseEnPayload as NLPPayload]
]);

function getObsidianLanguage(_app: App): string {
  try {
    const language = getLanguage();
    return typeof language === 'string' && language.length > 0 ? language : 'en';
  } catch {
    return 'en';
  }
}

function isSupportedLanguage(value: string): value is NLPSupportedLanguage {
  return SUPPORTED_LANGUAGES.includes(value as NLPSupportedLanguage);
}

function getPayloadCachePath(app: App, pluginId: string, language: NLPSupportedLanguage) {
  const payloadFolder = normalizePath(`${app.vault.configDir}/plugins/${pluginId}/nlp/locales`);
  const payloadFile = normalizePath(`${payloadFolder}/${language}.json`);
  return { payloadFolder, payloadFile };
}

async function downloadNLPPayload(
  app: App,
  pluginId: string,
  language: NLPSupportedLanguage
): Promise<NLPPayload> {
  const { payloadFolder, payloadFile } = getPayloadCachePath(app, pluginId, language);
  const url = `${REMOTE_NLP_ASSET_BASE_URL}/${language}.json`;
  const response = await requestUrl(url);
  const payloadData = response.text;
  const parsedPayload = JSON.parse(payloadData) as NLPPayload;

  if (!(await app.vault.adapter.exists(payloadFolder))) {
    await app.vault.adapter.mkdir(payloadFolder);
  }
  await app.vault.adapter.write(payloadFile, payloadData);
  inMemoryPayloadCache.set(language, parsedPayload);
  return parsedPayload;
}

export async function refreshCurrentNLPPayloadForVersionUpdate(
  app: App,
  pluginId: string
): Promise<boolean> {
  const detectedLanguage = getObsidianLanguage(app);
  if (!isSupportedLanguage(detectedLanguage) || detectedLanguage === 'en') {
    return false;
  }

  const { payloadFile } = getPayloadCachePath(app, pluginId, detectedLanguage);
  if (!(await app.vault.adapter.exists(payloadFile))) {
    return false;
  }

  await downloadNLPPayload(app, pluginId, detectedLanguage);
  return true;
}

export async function loadNLPPayload(app: App, pluginId: string): Promise<NLPPayload> {
  const detectedLanguage = getObsidianLanguage(app);
  const resolvedLanguage: NLPSupportedLanguage = isSupportedLanguage(detectedLanguage)
    ? detectedLanguage
    : 'en';

  const cachedInMemory = inMemoryPayloadCache.get(resolvedLanguage);
  if (cachedInMemory) {
    return cachedInMemory;
  }

  const { payloadFile } = getPayloadCachePath(app, pluginId, resolvedLanguage);

  try {
    let payloadData = '';

    if (await app.vault.adapter.exists(payloadFile)) {
      payloadData = await app.vault.adapter.read(payloadFile);
    } else {
      const downloadedPayload = await downloadNLPPayload(app, pluginId, resolvedLanguage);
      return downloadedPayload;
    }

    const parsedPayload = JSON.parse(payloadData) as NLPPayload;
    inMemoryPayloadCache.set(resolvedLanguage, parsedPayload);
    return parsedPayload;
  } catch {
    return baseEnPayload as NLPPayload;
  }
}

export function clearNLPPayloadCacheForTests() {
  inMemoryPayloadCache.clear();
  inMemoryPayloadCache.set('en', baseEnPayload as NLPPayload);
}
