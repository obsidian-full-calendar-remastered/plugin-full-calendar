import { PluginState } from '../../core/PluginState';
import { OFCEvent } from '../../types';
import { getNameBasedLinkedNoteFile } from './linkedNoteResolution';

jest.mock('../../core/PluginState');

describe('name-based linked-note resolution', () => {
  const event = (uid: string): OFCEvent => ({
    type: 'single',
    uid,
    title: 'Weekly / Planning',
    date: '2026-08-21',
    endDate: null,
    allDay: true
  });

  it('resolves the same title file for events with different identities', () => {
    PluginState.getSettings = jest.fn().mockReturnValue({
      linkedNoteLinkStrategy: 'name',
      linkedNotesDirectory: 'Calendar/Notes'
    });
    const linkedFile = { path: 'Calendar/Notes/Weekly Planning.md' };
    const getFileByPath = jest.fn().mockReturnValue(linkedFile);
    const app = { vault: { getFileByPath } } as never;

    expect(getNameBasedLinkedNoteFile(app, event('first-scheduling'))).toBe(linkedFile);
    expect(getNameBasedLinkedNoteFile(app, event('later-scheduling'))).toBe(linkedFile);
    expect(getFileByPath).toHaveBeenNthCalledWith(1, 'Calendar/Notes/Weekly Planning.md');
    expect(getFileByPath).toHaveBeenNthCalledWith(2, 'Calendar/Notes/Weekly Planning.md');
  });

  it('does not apply title lookup in deadline-based mode', () => {
    PluginState.getSettings = jest.fn().mockReturnValue({
      linkedNoteLinkStrategy: 'deadline',
      linkedNotesDirectory: 'Calendar/Notes'
    });
    const getFileByPath = jest.fn();
    const app = { vault: { getFileByPath } } as never;

    expect(getNameBasedLinkedNoteFile(app, event('deadline-event'))).toBeNull();
    expect(getFileByPath).not.toHaveBeenCalled();
  });
});
