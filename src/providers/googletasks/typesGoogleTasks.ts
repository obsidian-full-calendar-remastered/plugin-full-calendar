export type GoogleTasksProviderConfig = {
  id: string; // The settings-level ID, e.g., "googletasks_1"
  name: string; // The display name of the list (e.g., "My Tasks")
  listId: string; // Google's own ID for the task list
  googleAccountId?: string; // Optional link to connected Google Account
};

export interface GoogleTaskApiItem {
  id: string;
  title: string;
  notes?: string;
  due?: string; // RFC 3339 timestamp (YYYY-MM-DDThh:mm:ssZ)
  status: 'needsAction' | 'completed';
  completed?: string; // RFC 3339 timestamp
  updated?: string;
  [key: string]: unknown;
}
