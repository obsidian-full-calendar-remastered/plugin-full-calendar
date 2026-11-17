import { FullCalendarSettings } from '../../../types/settings';

export const DEFAULT_MICROSOFT_CLIENT_ID = '611089cd-328a-4eff-8884-8b941c9e8860';
export const DEFAULT_MICROSOFT_PROXY_BASE_URL = 'https://gcal-proxy-server.plugin-fcr.workers.dev';

function normalizeProxyBaseUrl(value: string): string {
  return value.trim().replace(/\/$/, '');
}

export type OutlookAuthConfig = {
  clientId: string;
  proxyBaseUrl: string;
  isCustom: boolean;
};

export function resolveOutlookAuthConfig(settings: FullCalendarSettings): OutlookAuthConfig {
  const isCustom = !!settings.useCustomMicrosoftClient;

  const clientId = isCustom ? settings.microsoftClientId.trim() : DEFAULT_MICROSOFT_CLIENT_ID;

  const proxyBaseUrl = isCustom
    ? normalizeProxyBaseUrl(settings.microsoftProxyBaseUrl)
    : DEFAULT_MICROSOFT_PROXY_BASE_URL;

  return { clientId, proxyBaseUrl, isCustom };
}
