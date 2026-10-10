export type TaskNotesProviderConfig = {
  id: string;
  name?: string;
  dispatchMode?: 'search' | 'create';
};

export type TaskNotesTask = {
  path: string;
  title: string;
  status: string;
  dateModified?: string;
  due?: string;
  scheduled?: string;
  recurrence?: string;
  recurrence_anchor?: 'scheduled' | 'completion';
  complete_instances?: string[];
  skipped_instances?: string[];
  timeEstimate?: number;
  completedDate?: string;
  customProperties?: Record<string, unknown>;
  recurringEventId?: string;
};

export type TaskNotesTaskCreationData = {
  title: string;
  scheduled?: string;
  timeEstimate?: number | null;
  customFrontmatter?: Record<string, unknown>;
};

export type TaskNotesPluginApi = {
  cacheManager: {
    getAllTasks(): Promise<TaskNotesTask[]>;
    getTaskInfo(path: string): Promise<TaskNotesTask | null>;
    on(event: string, cb: (data: unknown) => void): void;
    off?(event: string, cb: (data: unknown) => void): void;
  };
  taskService: {
    updateProperty(
      task: TaskNotesTask,
      property: 'scheduled' | 'due' | 'timeEstimate',
      value: unknown
    ): Promise<TaskNotesTask>;
    toggleStatus?(task: TaskNotesTask): Promise<TaskNotesTask>;
    toggleRecurringTaskComplete?(task: TaskNotesTask, date?: Date): Promise<TaskNotesTask>;
    toggleRecurringTaskSkipped?(task: TaskNotesTask, date?: Date): Promise<TaskNotesTask>;
    createTask?(
      taskData: TaskNotesTaskCreationData,
      options?: { applyDefaults?: boolean }
    ): Promise<{ taskInfo: TaskNotesTask }>;
  };
  statusManager?: {
    isCompletedStatus(status: string): boolean;
  };
  openTaskEditModal?: (
    task: TaskNotesTask,
    onTaskUpdated?: (task: TaskNotesTask) => void
  ) => void | Promise<void>;
  openTaskSelectorWithCreate?: () => Promise<void>;
  openTaskCreationModal?: (prePopulatedValues?: Partial<{ title: string }>) => void;
  emitter?: {
    on(event: string, cb: (data: unknown) => void): void;
    off(event: string, cb: (data: unknown) => void): void;
  };
};
