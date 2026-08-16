// import_caldav.ts
import { Authentication, CalDAVSource, CalDAVTaskSource } from '../../types';
import { t } from '../../features/i18n/i18n';
import { generateCalendarId } from '../../types/calendar_settings';
import { splitCalDAVUrl, ensureTrailingSlash, fetchCalendarInfo } from './helper_caldav';

/**
 * Imports a CalDAV calendar by validating the URL using PROPFIND,
 * and auto-populates name and color from server-provided metadata.
 */
export type CalDAVImportSourceType = 'caldav' | 'caldavtasks';

export async function importCalendars(
  auth: Authentication,
  inputUrl: string,
  existingIds: string[],
  sourceType: 'caldavtasks'
): Promise<CalDAVTaskSource[]>;
export async function importCalendars(
  auth: Authentication,
  inputUrl: string,
  existingIds: string[],
  sourceType?: 'caldav'
): Promise<CalDAVSource[]>;
export async function importCalendars(
  auth: Authentication,
  inputUrl: string,
  existingIds: string[],
  sourceType: CalDAVImportSourceType = 'caldav'
): Promise<(CalDAVSource | CalDAVTaskSource)[]> {
  const { serverUrl, collectionUrl } = splitCalDAVUrl(inputUrl);

  const { isCalendar, displayName, color, supportedComponents, error } = await fetchCalendarInfo(
    collectionUrl,
    {
      username: auth.username,
      password: auth.password
    }
  );

  if (!isCalendar) {
    if (error) {
      throw new Error(
        sourceType === 'caldavtasks'
          ? t('settings.calendars.caldavTasks.errors.importFailedDetails', { message: error })
          : `Failed to import CalDAV calendar: ${error}`
      );
    }
    throw new Error(
      sourceType === 'caldavtasks'
        ? t('settings.calendars.caldavTasks.errors.invalidCollection')
        : 'The provided URL does not appear to be a valid CalDAV calendar collection. Please ensure it points directly to a calendar.'
    );
  }

  if (
    sourceType === 'caldavtasks' &&
    supportedComponents &&
    supportedComponents.length > 0 &&
    !supportedComponents.includes('VTODO')
  ) {
    throw new Error(t('settings.calendars.caldavTasks.errors.noVtodoCapability'));
  }

  const id = generateCalendarId(sourceType, existingIds);
  existingIds.push(id);

  return [
    {
      type: sourceType,
      id,
      name:
        displayName ??
        (sourceType === 'caldavtasks'
          ? t('settings.calendars.caldavTasks.title')
          : 'CalDAV Calendar'),
      url: ensureTrailingSlash(serverUrl),
      homeUrl: ensureTrailingSlash(collectionUrl),
      color: color ?? '#888888',
      username: auth.username,
      password: auth.password
    }
  ];
}
