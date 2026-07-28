import { makeAuthenticatedRequest, OutlookApiError } from './request';
import { MicrosoftAccount } from '../../../types/settings';

const CALENDAR_LIST_URL = 'https://graph.microsoft.com/v1.0/me/calendars';

export interface OutlookCalendarListEntry {
  id: string;
  name: string;
  color?: string;
  canEdit?: boolean;
  isDefaultCalendar?: boolean;
  [key: string]: unknown;
}

interface OutlookCalendarListResponse {
  value?: unknown[];
  '@odata.nextLink'?: string;
}

export async function fetchOutlookCalendarList(
  account: MicrosoftAccount
): Promise<OutlookCalendarListEntry[]> {
  if (!account.accessToken) {
    throw new OutlookApiError('Account is missing an access token.');
  }

  const calendars: OutlookCalendarListEntry[] = [];
  let currentUrl: string | undefined = `${CALENDAR_LIST_URL}?$top=100`;

  while (currentUrl) {
    const data: OutlookCalendarListResponse =
      await makeAuthenticatedRequest<OutlookCalendarListResponse>(account.accessToken, currentUrl);

    if (Array.isArray(data.value)) {
      const pageCalendars = data.value.filter(
        (item: unknown): item is OutlookCalendarListEntry =>
          !!item && typeof item === 'object' && 'id' in item && 'name' in item
      );
      calendars.push(...pageCalendars);
    }

    currentUrl =
      typeof data['@odata.nextLink'] === 'string' && data['@odata.nextLink'].trim().length > 0
        ? data['@odata.nextLink']
        : undefined;
  }

  return calendars;
}
