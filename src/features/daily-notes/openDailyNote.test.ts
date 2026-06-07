/**
 * @jest-environment jsdom
 */
import { TFile } from 'obsidian';
import {
  appHasDailyNotesPluginLoaded,
  createDailyNote,
  getAllDailyNotes,
  getDailyNote
} from 'obsidian-daily-notes-interface';
import { openDailyNoteForDate } from './openDailyNote';

jest.mock('obsidian', () => {
  const obsidianMock: typeof import('obsidian') = jest.requireActual('../../../__mocks__/obsidian');
  return {
    ...obsidianMock,
    moment: (date: Date) => ({ toDate: () => date })
  };
});

jest.mock('obsidian-daily-notes-interface', () => ({
  appHasDailyNotesPluginLoaded: jest.fn(),
  createDailyNote: jest.fn(),
  getAllDailyNotes: jest.fn(),
  getDailyNote: jest.fn()
}));

const hasDailyNotes = appHasDailyNotesPluginLoaded as jest.MockedFunction<
  typeof appHasDailyNotesPluginLoaded
>;
const createDailyNoteMock = createDailyNote as jest.MockedFunction<typeof createDailyNote>;
const getAllDailyNotesMock = getAllDailyNotes as jest.MockedFunction<typeof getAllDailyNotes>;
const getDailyNoteMock = getDailyNote as jest.MockedFunction<typeof getDailyNote>;

describe('openDailyNoteForDate', () => {
  const openFile = jest.fn();
  const app = {
    workspace: {
      getLeaf: jest.fn().mockReturnValue({ openFile })
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    hasDailyNotes.mockReturnValue(true);
    getAllDailyNotesMock.mockReturnValue({});
  });

  it('opens an existing daily note', async () => {
    const file = new TFile();
    file.name = '2026-03-21.md';
    getDailyNoteMock.mockReturnValue(file);

    await openDailyNoteForDate(app as never, new Date(2026, 2, 21));

    expect(createDailyNoteMock).not.toHaveBeenCalled();
    expect(openFile).toHaveBeenCalledWith(file);
  });

  it('creates and opens a missing daily note', async () => {
    const file = new TFile();
    file.name = '2026-03-21.md';
    getDailyNoteMock.mockImplementation(() => null!);
    createDailyNoteMock.mockResolvedValue(file);

    await openDailyNoteForDate(app as never, new Date(2026, 2, 21));

    expect(createDailyNoteMock).toHaveBeenCalled();
    expect(openFile).toHaveBeenCalledWith(file);
  });

  it('does nothing when Daily Notes is unavailable', async () => {
    hasDailyNotes.mockReturnValue(false);

    await openDailyNoteForDate(app as never, new Date(2026, 2, 21));

    expect(getDailyNoteMock).not.toHaveBeenCalled();
    expect(openFile).not.toHaveBeenCalled();
  });
});
