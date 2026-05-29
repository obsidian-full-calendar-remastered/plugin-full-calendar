/**
 * @file TasksPluginProvider.test.ts
 * @brief Unit tests for TasksPluginProvider functionality.
 *
 * @license See LICENSE.md
 */

import { TasksPluginProvider } from '../TasksPluginProvider';
import { TasksProviderConfig } from '../typesTask';
import type { OFCEvent } from '../../../types/schema';
import type { ObsidianInterface } from '../../../ObsidianAdapter';
import type FullCalendarPlugin from '../../../main';
import { PluginState } from '../../../core/PluginState';
import type EventCache from '../../../core/EventCache';
import { DEFAULT_SETTINGS, FullCalendarSettings } from '../../../types/settings';
import type { ProviderRegistry } from '../../ProviderRegistry';

// Mock the dependencies
jest.mock('../../../ObsidianAdapter');
// NOTE: NOT mocking TasksParser so we can test the real enhanced parsing functionality

type MockApp = {
  read: jest.Mock;
  getAbstractFileByPath: jest.Mock;
  getFileByPath: jest.Mock;
  getMetadata: jest.Mock;
  create: jest.Mock;
  rewrite: jest.Mock;
  delete: jest.Mock;
};

type MockPlugin = {
  app: {
    vault: { getMarkdownFiles: jest.Mock };
    workspace: { trigger: jest.Mock; on: jest.Mock };
    plugins?: {
      plugins?: Record<
        string,
        {
          apiV1?: { editTaskLineModal: jest.Mock };
          settings?: { globalQuery?: string };
        }
      >;
    };
  };
  registerEvent: jest.Mock;
  settings: FullCalendarSettings;
  providerRegistry: {
    refreshBacklogViews: jest.Mock;
    reloadProviderNow: jest.Mock;
    processProviderUpdates: jest.Mock;
  };
};

describe('TasksPluginProvider', () => {
  let provider: TasksPluginProvider;
  let mockApp: MockApp;
  let mockPlugin: MockPlugin;

  beforeEach(() => {
    // Mock ObsidianInterface
    mockApp = {
      read: jest.fn(),
      getAbstractFileByPath: jest.fn(),
      getFileByPath: jest.fn(),
      getMetadata: jest.fn(),
      create: jest.fn(),
      rewrite: jest.fn(),
      delete: jest.fn()
    };

    // Mock FullCalendarPlugin
    mockPlugin = {
      app: {
        vault: {
          getMarkdownFiles: jest.fn().mockReturnValue([])
        },
        workspace: {
          on: jest.fn().mockReturnValue({}),
          trigger: jest.fn((eventName: string, callback: (data: unknown) => void) => {
            if (eventName === 'obsidian-tasks-plugin:request-cache-update') {
              callback({ state: 'Warm', tasks: [] }); // MODIFIED: resolves cache warm promise
            }
          })
        }
      },
      registerEvent: jest.fn(),
      settings: {
        ...DEFAULT_SETTINGS,
        timeFormat24h: true,
        tasksIntegration: {
          backlogDateTarget: 'scheduledDate',
          calendarDisplayDateTarget: 'scheduledDate',
          openEditModalAfterBacklogDrop: false
        }
      },
      providerRegistry: {
        refreshBacklogViews: jest.fn(),
        reloadProviderNow: jest.fn(),
        processProviderUpdates: jest.fn()
      }
    };

    PluginState.setSettings(mockPlugin.settings);
    PluginState.setProviderRegistry(mockPlugin.providerRegistry as unknown as ProviderRegistry);
    PluginState.setCache({ getEventById: jest.fn() } as unknown as EventCache);

    const config: TasksProviderConfig = {
      id: 'tasks_1',
      name: 'Test Tasks'
    };

    provider = new TasksPluginProvider(
      config,
      mockPlugin as unknown as FullCalendarPlugin,
      mockApp as unknown as ObsidianInterface
    );
  });

  describe('basic properties', () => {
    it('should have correct static properties', () => {
      expect(TasksPluginProvider.type).toBe('tasks');
      expect(TasksPluginProvider.displayName).toBe('Obsidian Tasks');
      expect(provider.type).toBe('tasks');
      expect(provider.displayName).toBe('Obsidian Tasks');
      expect(provider.isRemote).toBe(false);
      expect(provider.loadPriority).toBe(130);
    });

    it('should return writable capabilities', () => {
      const capabilities = provider.getCapabilities();

      expect(capabilities.canCreate).toBe(false);
      expect(capabilities.canEdit).toBe(true);
      expect(capabilities.canDelete).toBe(true);
      expect(capabilities.contextMenu).toMatchObject({
        allowGenericTaskActions: false,
        providesNativeTaskSemantics: true
      });
    });
  });

  describe('Tasks API integration', () => {
    it('keeps explicit task time ranges for timed calendar events', async () => {
      mockPlugin.app.workspace.trigger.mockImplementation(
        (eventName: string, callback: (data: unknown) => void) => {
          if (eventName === 'obsidian-tasks-plugin:request-cache-update') {
            callback({
              state: 'Warm',
              tasks: [
                {
                  path: 'Daily.md',
                  description: 'Planning (09:00-10:15)',
                  taskLocation: { lineNumber: 0 },
                  scheduledDate: { toDate: () => new Date('2026-05-02T00:00:00') },
                  originalMarkdown: '- [ ] Planning (09:00-10:15) ⏳ 2026-05-02',
                  isDone: false
                }
              ]
            });
          }
        }
      );

      const events = await provider.getEvents();

      expect(events[0][0]).toMatchObject({
        type: 'single',
        allDay: false,
        date: '2026-05-02',
        startTime: '09:00',
        endTime: '10:15'
      });
    });

    it('settles pending warm-up when the live cache event becomes warm after a cold request response', async () => {
      let liveCacheUpdate: ((data: unknown) => void) | null = null;
      mockPlugin.app.workspace.on.mockImplementation(
        (eventName: string, callback: (data: unknown) => void) => {
          if (eventName === 'obsidian-tasks-plugin:cache-update') {
            liveCacheUpdate = callback;
          }
          return {} as never;
        }
      );
      mockPlugin.app.workspace.trigger.mockImplementation(
        (eventName: string, callback: (data: unknown) => void) => {
          if (eventName === 'obsidian-tasks-plugin:request-cache-update') {
            callback({ state: 'Cold', tasks: [] });
          }
        }
      );

      provider.initialize();
      const eventsPromise = provider.getEvents();

      expect(liveCacheUpdate).toBeDefined();
      const emitLiveCacheUpdate = liveCacheUpdate as unknown as (data: unknown) => void;
      emitLiveCacheUpdate({
        state: 'Warm',
        tasks: [
          {
            path: 'Daily.md',
            description: 'Recovered task',
            taskLocation: { lineNumber: 0 },
            scheduledDate: { toDate: () => new Date('2026-05-02T00:00:00') },
            originalMarkdown: '- [ ] Recovered task ⏳ 2026-05-02',
            isDone: false
          }
        ]
      });

      await expect(eventsPromise).resolves.toHaveLength(1);
      expect(mockPlugin.providerRegistry.reloadProviderNow).toHaveBeenCalledWith('tasks_1');
    });

    it('registers the live cache listener through the plugin lifecycle', () => {
      provider.initialize();

      expect(mockPlugin.app.workspace.on).toHaveBeenCalledWith(
        'obsidian-tasks-plugin:cache-update',
        expect.any(Function)
      );
      expect(mockPlugin.registerEvent).toHaveBeenCalledTimes(1);
    });

    it('gives single-time tasks a visible duration for week/time-grid views', async () => {
      mockPlugin.app.workspace.trigger.mockImplementation(
        (eventName: string, callback: (data: unknown) => void) => {
          if (eventName === 'obsidian-tasks-plugin:request-cache-update') {
            callback({
              state: 'Warm',
              tasks: [
                {
                  path: 'Daily.md',
                  description: 'Standup (09:00)',
                  taskLocation: { lineNumber: 0 },
                  scheduledDate: { toDate: () => new Date('2026-05-02T00:00:00') },
                  originalMarkdown: '- [ ] Standup (09:00) ⏳ 2026-05-02',
                  isDone: false
                }
              ]
            });
          }
        }
      );

      const events = await provider.getEvents();

      expect(events[0][0]).toMatchObject({
        type: 'single',
        allDay: false,
        date: '2026-05-02',
        startTime: '09:00',
        endTime: '09:30'
      });
    });

    it('shows Tasks events only on the configured calendar display date field', async () => {
      mockPlugin.settings.tasksIntegration = {
        backlogDateTarget: 'scheduledDate',
        calendarDisplayDateTarget: 'dueDate',
        openEditModalAfterBacklogDrop: false,
        taskDisplayFormat: 'standard'
      };
      mockPlugin.app.workspace.trigger.mockImplementation(
        (eventName: string, callback: (data: unknown) => void) => {
          if (eventName === 'obsidian-tasks-plugin:request-cache-update') {
            callback({
              state: 'Warm',
              tasks: [
                {
                  path: 'Daily.md',
                  description: 'Scheduled only',
                  taskLocation: { lineNumber: 0 },
                  scheduledDate: { toDate: () => new Date('2026-05-02T00:00:00') },
                  originalMarkdown: '- [ ] Scheduled only ⏳ 2026-05-02',
                  isDone: false
                },
                {
                  path: 'Daily.md',
                  description: 'Due task',
                  taskLocation: { lineNumber: 1 },
                  scheduledDate: { toDate: () => new Date('2026-05-02T00:00:00') },
                  dueDate: { toDate: () => new Date('2026-05-04T00:00:00') },
                  originalMarkdown: '- [ ] Due task ⏳ 2026-05-02 📅 2026-05-04',
                  isDone: false
                }
              ]
            });
          }
        }
      );

      const events = await provider.getEvents();

      expect(events).toHaveLength(1);
      expect(events[0][0]).toMatchObject({
        title: 'Due task',
        date: '2026-05-04'
      });
    });

    it('should reject creating events directly', async () => {
      const event = { title: 'Test Event', type: 'single', date: '2024-01-01' } as OFCEvent;

      await expect(provider.createEvent(event)).rejects.toThrow(
        'Full Calendar cannot create tasks directly. Please use the Tasks plugin modal or commands.'
      );
    });

    it('should reject recurring events for update', async () => {
      const handle = { persistentId: 'test::1' };
      const oldEvent = { title: 'Old', type: 'single' } as OFCEvent;
      const newEvent = { title: 'New', type: 'recurring' } as OFCEvent;

      await expect(provider.updateEvent(handle, oldEvent, newEvent)).rejects.toThrow(
        'Tasks provider can only update single, dated events.'
      );
    });

    it('should reject invalid handle format for delete', async () => {
      const handle = { persistentId: 'invalid-format' };

      await expect(provider.deleteEvent(handle)).rejects.toThrow(
        'Invalid task handle format. Expected "filePath::lineNumber".'
      );
    });

    it('should still reject instance overrides', async () => {
      const masterEvent = { title: 'Master' } as OFCEvent;
      const instanceDate = '2024-01-15';
      const newEventData = { title: 'Override' } as OFCEvent;

      await expect(
        provider.createInstanceOverride(masterEvent, instanceDate, newEventData)
      ).rejects.toThrow('Tasks provider does not support recurring event overrides.');
    });

    it('schedules backlog drops using the configured calendar display date field', async () => {
      const file = { path: 'Daily.md' };
      mockApp.getFileByPath.mockReturnValue(file);
      mockApp.rewrite.mockImplementation((_file: unknown, update: (content: string) => string) => {
        const updated = update('- [ ] Backlog task');
        expect(updated).toBe(`- [ ] Backlog task ${String.fromCodePoint(0x1f4c5)} 2026-05-02`);
        return Promise.resolve();
      });
      mockPlugin.settings.tasksIntegration = {
        backlogDateTarget: 'dueDate',
        calendarDisplayDateTarget: 'dueDate',
        openEditModalAfterBacklogDrop: false
      };
      const editTaskLineModal = jest.fn();
      mockPlugin.app.plugins = {
        plugins: {
          'obsidian-tasks-plugin': {
            apiV1: { editTaskLineModal }
          }
        }
      };
      mockPlugin.app.workspace.trigger.mockImplementation(
        (eventName: string, callback: (data: unknown) => void) => {
          if (eventName === 'obsidian-tasks-plugin:request-cache-update') {
            callback({
              state: 'Warm',
              tasks: [
                {
                  path: 'Daily.md',
                  description: 'Backlog task',
                  taskLocation: { lineNumber: 0 },
                  originalMarkdown: '- [ ] Backlog task',
                  isDone: false
                }
              ]
            });
          }
        }
      );

      await provider.getUndatedTasks();
      await provider.scheduleTask('Daily.md::0', new Date('2026-05-02T00:00:00'));

      expect(editTaskLineModal).not.toHaveBeenCalled();
      await expect(provider.getUndatedTasks()).resolves.toEqual([]);
    });

    it('filters backlog tasks by the configured Tasks date field', async () => {
      mockPlugin.settings.tasksIntegration = {
        backlogDateTarget: 'dueDate',
        calendarDisplayDateTarget: 'scheduledDate',
        openEditModalAfterBacklogDrop: false
      };
      mockPlugin.app.workspace.trigger.mockImplementation(
        (eventName: string, callback: (data: unknown) => void) => {
          if (eventName === 'obsidian-tasks-plugin:request-cache-update') {
            callback({
              state: 'Warm',
              tasks: [
                {
                  path: 'Daily.md',
                  description: 'Scheduled only',
                  taskLocation: { lineNumber: 0 },
                  scheduledDate: { toDate: () => new Date('2026-05-02T00:00:00') },
                  originalMarkdown: '- [ ] Scheduled only ⏳ 2026-05-02',
                  isDone: false
                },
                {
                  path: 'Daily.md',
                  description: 'Has due date',
                  taskLocation: { lineNumber: 1 },
                  dueDate: { toDate: () => new Date('2026-05-03T00:00:00') },
                  originalMarkdown: '- [ ] Has due date 📅 2026-05-03',
                  isDone: false
                }
              ]
            });
          }
        }
      );

      await expect(provider.getUndatedTasks()).resolves.toEqual([
        expect.objectContaining({ title: 'Scheduled only' })
      ]);
    });

    it('opens the Tasks edit modal after backlog drops only when enabled', async () => {
      const file = { path: 'Daily.md' };
      mockApp.getFileByPath.mockReturnValue(file);
      mockApp.rewrite.mockImplementation((_file: unknown, update: (content: string) => string) => {
        update('- [ ] Backlog task');
        return Promise.resolve();
      });
      mockPlugin.settings.tasksIntegration = {
        backlogDateTarget: 'scheduledDate',
        calendarDisplayDateTarget: 'scheduledDate',
        openEditModalAfterBacklogDrop: true
      };
      const editTaskLineModal = jest.fn().mockResolvedValue('- [ ] Backlog task edited');
      mockPlugin.app.plugins = {
        plugins: {
          'obsidian-tasks-plugin': {
            apiV1: { editTaskLineModal }
          }
        }
      };
      mockPlugin.app.workspace.trigger.mockImplementation(
        (eventName: string, callback: (data: unknown) => void) => {
          if (eventName === 'obsidian-tasks-plugin:request-cache-update') {
            callback({
              state: 'Warm',
              tasks: [
                {
                  path: 'Daily.md',
                  description: 'Backlog task',
                  taskLocation: { lineNumber: 0 },
                  originalMarkdown: '- [ ] Backlog task',
                  isDone: false
                }
              ]
            });
          }
        }
      );

      await provider.getUndatedTasks();
      await provider.scheduleTask('Daily.md::0', new Date('2026-05-02T00:00:00'));

      expect(editTaskLineModal).toHaveBeenCalledWith('- [ ] Backlog task ⏳ 2026-05-02');
    });

    it('updates timed Tasks events against the configured calendar display date field', async () => {
      const file = { path: 'Daily.md' };
      mockApp.getFileByPath.mockReturnValue(file);
      mockApp.rewrite.mockImplementation((_file: unknown, update: (content: string) => string) => {
        const updated = update('- [ ] Due task 📅 2026-05-03');
        expect(updated).toBe('- [ ] Due task (9:00-10:00) 📅 2026-05-05');
        return Promise.resolve();
      });
      mockPlugin.settings.tasksIntegration = {
        backlogDateTarget: 'scheduledDate',
        calendarDisplayDateTarget: 'dueDate',
        openEditModalAfterBacklogDrop: false,
        taskDisplayFormat: 'standard'
      };
      mockPlugin.app.workspace.trigger.mockImplementation(
        (eventName: string, callback: (data: unknown) => void) => {
          if (eventName === 'obsidian-tasks-plugin:request-cache-update') {
            callback({
              state: 'Warm',
              tasks: [
                {
                  path: 'Daily.md',
                  description: 'Due task',
                  taskLocation: { lineNumber: 0 },
                  dueDate: { toDate: () => new Date('2026-05-03T00:00:00') },
                  originalMarkdown: '- [ ] Due task 📅 2026-05-03',
                  isDone: false
                }
              ]
            });
          }
        }
      );

      await provider.getEvents();
      await provider.updateEvent(
        { persistentId: 'Daily.md::0' },
        { type: 'single', title: 'Due task', date: '2026-05-03' } as OFCEvent,
        {
          type: 'single',
          title: 'Due task',
          allDay: false,
          date: '2026-05-05',
          startTime: '09:00',
          endTime: '10:00'
        } as OFCEvent
      );
    });

    it('writes day planner format when task display format is set to dayPlanner', async () => {
      const file = { path: 'Daily.md' };
      mockApp.getFileByPath.mockReturnValue(file);
      mockApp.rewrite.mockImplementation((_file: unknown, update: (content: string) => string) => {
        const updated = update('- [ ] Wellness - Task - edit 2 (5:00 AM-7:00 AM) ⏳ 2026-05-02');
        expect(updated).toBe('- [ ] 5:00 - 19:00 Wellness - Task - edit 2 ⏳ 2026-05-05');
        return Promise.resolve();
      });
      mockPlugin.settings.tasksIntegration = {
        backlogDateTarget: 'scheduledDate',
        calendarDisplayDateTarget: 'scheduledDate',
        openEditModalAfterBacklogDrop: false,
        taskDisplayFormat: 'dayPlanner'
      };
      mockPlugin.app.workspace.trigger.mockImplementation(
        (eventName: string, callback: (data: unknown) => void) => {
          if (eventName === 'obsidian-tasks-plugin:request-cache-update') {
            callback({
              state: 'Warm',
              tasks: [
                {
                  path: 'Daily.md',
                  description: 'Wellness - Task - edit 2 (5:00 AM-7:00 AM)',
                  taskLocation: { lineNumber: 0 },
                  scheduledDate: { toDate: () => new Date('2026-05-02T00:00:00') },
                  originalMarkdown:
                    '- [ ] Wellness - Task - edit 2 (5:00 AM-7:00 AM) ⏳ 2026-05-02',
                  isDone: false
                }
              ]
            });
          }
        }
      );

      await provider.getEvents();
      await provider.updateEvent(
        { persistentId: 'Daily.md::0' },
        {
          type: 'single',
          title: 'Wellness - Task - edit 2',
          date: '2026-05-02',
          allDay: false,
          startTime: '05:00',
          endTime: '07:00'
        } as OFCEvent,
        {
          type: 'single',
          title: 'Wellness - Task - edit 2',
          allDay: false,
          date: '2026-05-05',
          startTime: '05:00',
          endTime: '19:00'
        } as OFCEvent
      );
    });
  });

  describe('event handle generation', () => {
    it('should generate event handle from UID', () => {
      const event = {
        uid: 'test-file.md::5',
        title: 'Test Task'
      } as OFCEvent;

      const handle = provider.getEventHandle(event);

      expect(handle).not.toBeNull();
      expect(handle!.persistentId).toBe('test-file.md::5');
    });

    it('should return null for event without UID', () => {
      const event = {
        title: 'Test Task'
      } as OFCEvent;

      const handle = provider.getEventHandle(event);

      expect(handle).toBeNull();
    });
  });

  describe('constructor validation', () => {
    it('should throw error when ObsidianInterface is not provided', () => {
      const config: TasksProviderConfig = { id: 'tasks_1' };

      expect(() => {
        new TasksPluginProvider(config, mockPlugin as unknown as FullCalendarPlugin);
      }).toThrow('TasksPluginProvider requires an Obsidian app interface.');
    });
  });

  describe('global query filtering', () => {
    let tasksPluginSettings: { globalQuery: string };

    beforeEach(() => {
      const settingsObj = { globalQuery: '' };
      tasksPluginSettings = settingsObj;
      mockPlugin.app.plugins = {
        plugins: {
          'obsidian-tasks-plugin': {
            settings: settingsObj
          }
        }
      };
    });

    it('filters backlog tasks by path (positive and negative)', async () => {
      mockPlugin.settings.tasksIntegration.includeGlobalQueryInBacklog = true;
      tasksPluginSettings.globalQuery = 'path does not include Someday\npath includes Work';

      mockPlugin.app.workspace.trigger.mockImplementation(
        (eventName: string, callback: (data: unknown) => void) => {
          if (eventName === 'obsidian-tasks-plugin:request-cache-update') {
            callback({
              state: 'Warm',
              tasks: [
                {
                  path: 'Work/ProjectA.md',
                  description: 'Task 1',
                  taskLocation: { lineNumber: 0 },
                  originalMarkdown: '- [ ] Task 1',
                  isDone: false
                },
                {
                  path: 'Someday/ProjectB.md',
                  description: 'Task 2',
                  taskLocation: { lineNumber: 1 },
                  originalMarkdown: '- [ ] Task 2',
                  isDone: false
                },
                {
                  path: 'Archive/ProjectC.md',
                  description: 'Task 3',
                  taskLocation: { lineNumber: 2 },
                  originalMarkdown: '- [ ] Task 3',
                  isDone: false
                }
              ]
            });
          }
        }
      );

      const tasks = await provider.getUndatedTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].title).toBe('Task 1');
    });

    it('filters backlog tasks by folder', async () => {
      mockPlugin.settings.tasksIntegration.includeGlobalQueryInBacklog = true;
      tasksPluginSettings.globalQuery = 'folder includes Projects';

      mockPlugin.app.workspace.trigger.mockImplementation(
        (eventName: string, callback: (data: unknown) => void) => {
          if (eventName === 'obsidian-tasks-plugin:request-cache-update') {
            callback({
              state: 'Warm',
              tasks: [
                {
                  path: 'Projects/ProjectA/task1.md',
                  description: 'Task 1',
                  taskLocation: { lineNumber: 0 },
                  originalMarkdown: '- [ ] Task 1',
                  isDone: false
                },
                {
                  path: 'Archive/task2.md',
                  description: 'Task 2',
                  taskLocation: { lineNumber: 1 },
                  originalMarkdown: '- [ ] Task 2',
                  isDone: false
                }
              ]
            });
          }
        }
      );

      const tasks = await provider.getUndatedTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].title).toBe('Task 1');
    });

    it('filters backlog tasks by tags (with or without # prefix)', async () => {
      mockPlugin.settings.tasksIntegration.includeGlobalQueryInBacklog = true;
      tasksPluginSettings.globalQuery = 'tags include #wellness\ntags do not include #work';

      mockPlugin.app.workspace.trigger.mockImplementation(
        (eventName: string, callback: (data: unknown) => void) => {
          if (eventName === 'obsidian-tasks-plugin:request-cache-update') {
            callback({
              state: 'Warm',
              tasks: [
                {
                  path: 'Daily.md',
                  description: 'Task 1 #wellness',
                  taskLocation: { lineNumber: 0 },
                  originalMarkdown: '- [ ] Task 1 #wellness',
                  isDone: false
                },
                {
                  path: 'Daily.md',
                  description: 'Task 2 #wellness #work',
                  taskLocation: { lineNumber: 1 },
                  originalMarkdown: '- [ ] Task 2 #wellness #work',
                  isDone: false
                },
                {
                  path: 'Daily.md',
                  description: 'Task 3',
                  taskLocation: { lineNumber: 2 },
                  originalMarkdown: '- [ ] Task 3',
                  isDone: false
                }
              ]
            });
          }
        }
      );

      const tasks = await provider.getUndatedTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].title).toBe('Task 1 #wellness');
    });

    it('filters backlog tasks by priority matches', async () => {
      mockPlugin.settings.tasksIntegration.includeGlobalQueryInBacklog = true;
      tasksPluginSettings.globalQuery = 'priority is high';

      mockPlugin.app.workspace.trigger.mockImplementation(
        (eventName: string, callback: (data: unknown) => void) => {
          if (eventName === 'obsidian-tasks-plugin:request-cache-update') {
            callback({
              state: 'Warm',
              tasks: [
                {
                  path: 'Daily.md',
                  description: 'Task 1 ⏫',
                  taskLocation: { lineNumber: 0 },
                  originalMarkdown: '- [ ] Task 1 ⏫',
                  isDone: false
                },
                {
                  path: 'Daily.md',
                  description: 'Task 2 🔽',
                  taskLocation: { lineNumber: 1 },
                  originalMarkdown: '- [ ] Task 2 🔽',
                  isDone: false
                }
              ]
            });
          }
        }
      );

      const tasks = await provider.getUndatedTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].title).toBe('Task 1');
    });

    it('filters backlog tasks with regex matching', async () => {
      mockPlugin.settings.tasksIntegration.includeGlobalQueryInBacklog = true;
      tasksPluginSettings.globalQuery = 'description regex matches /wellness/i';

      mockPlugin.app.workspace.trigger.mockImplementation(
        (eventName: string, callback: (data: unknown) => void) => {
          if (eventName === 'obsidian-tasks-plugin:request-cache-update') {
            callback({
              state: 'Warm',
              tasks: [
                {
                  path: 'Daily.md',
                  description: 'Wellness - Task 1',
                  taskLocation: { lineNumber: 0 },
                  originalMarkdown: '- [ ] Wellness - Task 1',
                  isDone: false
                },
                {
                  path: 'Daily.md',
                  description: 'Regular Task 2',
                  taskLocation: { lineNumber: 1 },
                  originalMarkdown: '- [ ] Regular Task 2',
                  isDone: false
                }
              ]
            });
          }
        }
      );

      const tasks = await provider.getUndatedTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].title).toBe('Wellness - Task 1');
    });

    it('ignores display-only or comment rules and still returns tasks', async () => {
      mockPlugin.settings.tasksIntegration.includeGlobalQueryInBacklog = true;
      tasksPluginSettings.globalQuery = '# This is a comment\nlimit 5\nexplain';

      mockPlugin.app.workspace.trigger.mockImplementation(
        (eventName: string, callback: (data: unknown) => void) => {
          if (eventName === 'obsidian-tasks-plugin:request-cache-update') {
            callback({
              state: 'Warm',
              tasks: [
                {
                  path: 'Daily.md',
                  description: 'Task 1',
                  taskLocation: { lineNumber: 0 },
                  originalMarkdown: '- [ ] Task 1',
                  isDone: false
                }
              ]
            });
          }
        }
      );

      const tasks = await provider.getUndatedTasks();
      expect(tasks).toHaveLength(1);
    });

    it('returns all backlog tasks when includeGlobalQueryInBacklog is disabled', async () => {
      mockPlugin.settings.tasksIntegration.includeGlobalQueryInBacklog = false;
      tasksPluginSettings.globalQuery = 'path does not include Someday';

      mockPlugin.app.workspace.trigger.mockImplementation(
        (eventName: string, callback: (data: unknown) => void) => {
          if (eventName === 'obsidian-tasks-plugin:request-cache-update') {
            callback({
              state: 'Warm',
              tasks: [
                {
                  path: 'Someday/ProjectB.md',
                  description: 'Task 1',
                  taskLocation: { lineNumber: 0 },
                  originalMarkdown: '- [ ] Task 1',
                  isDone: false
                }
              ]
            });
          }
        }
      );

      const tasks = await provider.getUndatedTasks();
      expect(tasks).toHaveLength(1);
    });

    it('filters backlog tasks by the dedicated backlog query without enabling the global query', async () => {
      mockPlugin.settings.tasksIntegration.includeGlobalQueryInBacklog = false;
      mockPlugin.settings.tasksIntegration.backlogQuery = 'folder includes Projects\ntags do not include someday';
      tasksPluginSettings.globalQuery = 'path does not include Projects';

      mockPlugin.app.workspace.trigger.mockImplementation(
        (eventName: string, callback: (data: unknown) => void) => {
          if (eventName === 'obsidian-tasks-plugin:request-cache-update') {
            callback({
              state: 'Warm',
              tasks: [
                {
                  path: 'Projects/Active.md',
                  description: 'Task 1 #next',
                  taskLocation: { lineNumber: 0 },
                  originalMarkdown: '- [ ] Task 1 #next',
                  isDone: false
                },
                {
                  path: 'Projects/Someday.md',
                  description: 'Task 2 #someday',
                  taskLocation: { lineNumber: 1 },
                  originalMarkdown: '- [ ] Task 2 #someday',
                  isDone: false
                },
                {
                  path: 'Inbox.md',
                  description: 'Task 3 #next',
                  taskLocation: { lineNumber: 2 },
                  originalMarkdown: '- [ ] Task 3 #next',
                  isDone: false
                }
              ]
            });
          }
        }
      );

      const tasks = await provider.getUndatedTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].title).toBe('Task 1 #next');
    });

    it('combines the dedicated backlog query with the global query using AND semantics', async () => {
      mockPlugin.settings.tasksIntegration.includeGlobalQueryInBacklog = true;
      mockPlugin.settings.tasksIntegration.backlogQuery = 'folder includes Projects';
      tasksPluginSettings.globalQuery = 'tags include next';

      mockPlugin.app.workspace.trigger.mockImplementation(
        (eventName: string, callback: (data: unknown) => void) => {
          if (eventName === 'obsidian-tasks-plugin:request-cache-update') {
            callback({
              state: 'Warm',
              tasks: [
                {
                  path: 'Projects/Active.md',
                  description: 'Task 1 #next',
                  taskLocation: { lineNumber: 0 },
                  originalMarkdown: '- [ ] Task 1 #next',
                  isDone: false
                },
                {
                  path: 'Projects/Waiting.md',
                  description: 'Task 2 #waiting',
                  taskLocation: { lineNumber: 1 },
                  originalMarkdown: '- [ ] Task 2 #waiting',
                  isDone: false
                },
                {
                  path: 'Inbox.md',
                  description: 'Task 3 #next',
                  taskLocation: { lineNumber: 2 },
                  originalMarkdown: '- [ ] Task 3 #next',
                  isDone: false
                }
              ]
            });
          }
        }
      );

      const tasks = await provider.getUndatedTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].title).toBe('Task 1 #next');
    });
  });
});
