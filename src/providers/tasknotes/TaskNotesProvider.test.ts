/**
 * @jest-environment jsdom
 */
import { TaskNotesProvider } from './TaskNotesProvider';
import { TaskNotesProviderConfig } from './typesTaskNotes';
import FullCalendarPlugin from '../../main';
import { OFCEvent } from '../../types';
import { modifyFrontmatterString } from '../fullnote/frontmatter';

describe('TaskNotesProvider', () => {
  const config: TaskNotesProviderConfig = {
    id: 'tasknotes_1',
    name: 'TaskNotes'
  };

  it('updates managed date link properties in the task file when rescheduling', async () => {
    const file = { path: 'Tasks/Task.md' };
    let fileContents =
      '---\n' +
      'custom: keep-me\n' +
      'scheduled: 2026-04-20\n' +
      'scheduled-link: [[2026-04-20]]\n' +
      'due: 2026-04-20\n' +
      'due-link: [[2026-04-20]]\n' +
      'deadline: 2026-04-20\n' +
      'deadline-link: [[2026-04-20]]\n' +
      '---\n' +
      'Body must remain unchanged.';
    const task = {
      path: 'Tasks/Task.md',
      title: 'Task',
      status: 'TODO',
      scheduled: '2026-04-20',
      timeEstimate: 60
    };
    const updateProperty = jest.fn(
      async (
        inputTask: typeof task,
        property: 'scheduled' | 'due' | 'timeEstimate',
        value: unknown
      ): Promise<typeof task> => {
        fileContents = modifyFrontmatterString(fileContents, { [property]: value });
        return { ...inputTask, [property]: value };
      }
    );
    const taskNotes = {
      cacheManager: {
        getAllTasks: jest.fn(),
        getTaskInfo: jest.fn().mockResolvedValue(task),
        on: jest.fn()
      },
      taskService: {
        updateProperty
      }
    };
    const plugin = {
      app: {
        plugins: { plugins: { tasknotes: taskNotes } },
        vault: {
          getFileByPath: jest.fn().mockReturnValue(file),
          read: jest.fn().mockImplementation(() => Promise.resolve(fileContents)),
          modify: jest.fn().mockImplementation((_file: typeof file, updatedContents: string) => {
            fileContents = updatedContents;
            return Promise.resolve();
          })
        }
      }
    } as unknown as FullCalendarPlugin;
    const provider = new TaskNotesProvider(config, plugin);
    const oldEvent: OFCEvent = {
      type: 'single',
      uid: 'Tasks/Task.md',
      title: 'Task',
      allDay: true,
      date: '2026-04-20',
      endDate: null,
      completed: false
    };
    const newEvent: OFCEvent = {
      ...oldEvent,
      date: '2026-04-23'
    };

    await provider.updateEvent({ persistentId: 'Tasks/Task.md' }, oldEvent, newEvent);

    expect(taskNotes.taskService.updateProperty).toHaveBeenCalledWith(
      task,
      'scheduled',
      '2026-04-23'
    );
    expect(taskNotes.taskService.updateProperty).toHaveBeenCalledWith(
      expect.objectContaining({ scheduled: '2026-04-23' }),
      'due',
      '2026-04-23'
    );
    expect(fileContents).toContain('custom: keep-me');
    expect(fileContents).toContain('scheduled: 2026-04-23');
    expect(fileContents).toContain('scheduled-link: "[[2026-04-23]]"');
    expect(fileContents).toContain('due: 2026-04-23');
    expect(fileContents).toContain('due-link: "[[2026-04-23]]"');
    expect(fileContents).toContain('deadline: 2026-04-23');
    expect(fileContents).toContain('deadline-link: "[[2026-04-23]]"');
    expect(fileContents).not.toContain('[["2026-04-23"]]');
    expect(fileContents.endsWith('Body must remain unchanged.')).toBe(true);
  });

  it('preserves due and deadline properties that do not match the previous scheduled date', async () => {
    const file = { path: 'Tasks/Task.md' };
    let fileContents =
      '---\n' +
      'scheduled: 2026-04-20\n' +
      'scheduled-link: [[2026-04-20]]\n' +
      'due: 2026-04-25\n' +
      'due-link: [[2026-04-25]]\n' +
      'deadline: 2026-04-30\n' +
      'deadline-link: [[2026-04-30]]\n' +
      '---\n';
    const task = {
      path: 'Tasks/Task.md',
      title: 'Task',
      status: 'TODO',
      scheduled: '2026-04-20',
      timeEstimate: 60
    };
    const taskNotes = {
      cacheManager: {
        getAllTasks: jest.fn(),
        getTaskInfo: jest.fn().mockResolvedValue(task),
        on: jest.fn()
      },
      taskService: {
        updateProperty: jest.fn(
          async (
            inputTask: typeof task,
            property: 'scheduled' | 'due' | 'timeEstimate',
            value: unknown
          ): Promise<typeof task> => {
            fileContents = modifyFrontmatterString(fileContents, { [property]: value });
            return { ...inputTask, [property]: value };
          }
        )
      }
    };
    const plugin = {
      app: {
        plugins: { plugins: { tasknotes: taskNotes } },
        vault: {
          getFileByPath: jest.fn().mockReturnValue(file),
          read: jest.fn().mockImplementation(() => Promise.resolve(fileContents)),
          modify: jest.fn().mockImplementation((_file: typeof file, updatedContents: string) => {
            fileContents = updatedContents;
            return Promise.resolve();
          })
        }
      }
    } as unknown as FullCalendarPlugin;
    const provider = new TaskNotesProvider(config, plugin);
    const oldEvent: OFCEvent = {
      type: 'single',
      uid: 'Tasks/Task.md',
      title: 'Task',
      allDay: true,
      date: '2026-04-20',
      endDate: null,
      completed: false
    };
    const newEvent: OFCEvent = {
      ...oldEvent,
      date: '2026-04-23'
    };

    await provider.updateEvent({ persistentId: 'Tasks/Task.md' }, oldEvent, newEvent);

    expect(fileContents).toContain('scheduled: 2026-04-23');
    expect(fileContents).toContain('scheduled-link: "[[2026-04-23]]"');
    expect(taskNotes.taskService.updateProperty).not.toHaveBeenCalledWith(
      expect.anything(),
      'due',
      expect.anything()
    );
    expect(fileContents).toContain('due: 2026-04-25');
    expect(fileContents).toContain('due-link: [[2026-04-25]]');
    expect(fileContents).toContain('deadline: 2026-04-30');
    expect(fileContents).toContain('deadline-link: [[2026-04-30]]');
  });
});
