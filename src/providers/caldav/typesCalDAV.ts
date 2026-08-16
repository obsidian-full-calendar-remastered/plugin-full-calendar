export type CalDAVProviderConfig = {
  id: string; // The settings-level ID, e.g., "caldav_1"
  name: string;
  url: string; // Server URL, e.g., https://caldav.icloud.com
  homeUrl: string; // Specific calendar collection URL
  username: string;
  password: string;
};

export type CalDAVTaskProviderConfig = CalDAVProviderConfig;
