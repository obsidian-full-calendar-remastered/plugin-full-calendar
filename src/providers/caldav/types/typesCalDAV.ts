export type CalDAVProviderConfig = {
  id: string; // The settings-level ID, e.g., "caldav_1"
  name: string;
  url: string; // Server URL, e.g., https://caldav.icloud.com
  homeUrl: string; // Specific calendar collection URL
  username: string;
  password: string;
};

export type CalendarObjectRef = {
  href: string;
  etag?: string;
};

export type CalendarObjectData = CalendarObjectRef & {
  ics: string;
};

export type CalDAVTaskCalendarInfo = {
  id: string;
  name: string;
};

export type CalDAVTaskInboxItem = {
  id: string;
  uid: string;
  title: string;
  calendarId: string;
  calendarName: string;
  description: string;
  location: string;
  url: string;
  status: string;
  completed: boolean;
  etag?: string;
};
