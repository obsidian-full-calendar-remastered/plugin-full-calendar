export type FullNoteProviderConfig = {
  id: string; // The settings-level ID, e.g., "local_1"
  name?: string;
  directory: string;
  template?: string;
  taskCompletionStyle?: 'datetime' | 'boolean';
};
