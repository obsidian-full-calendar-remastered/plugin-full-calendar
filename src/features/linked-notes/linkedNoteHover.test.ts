import { PluginState } from '../../core/PluginState';
import { OFCEvent, PLUGIN_SLUG } from '../../types';
import { buildLinkedNoteHoverPayload } from './linkedNoteHover';

jest.mock('../../core/PluginState');

describe('linked-note hover payload', () => {
  const event = (uid: string, title: string): OFCEvent => ({
    type: 'single',
    uid,
    title,
    date: '2026-08-21',
    endDate: null,
    allDay: true
  });

  it('uses separate hover boundaries when moving from unlinked event A to linked event B', () => {
    PluginState.getSettings = jest.fn().mockReturnValue({
      linkedNoteLinkStrategy: 'name',
      linkedNotesDirectory: 'Calendar/Notes'
    });
    const linkedFile = { path: 'Calendar/Notes/Linked Event.md' };
    const app = {
      vault: {
        getFileByPath: jest.fn((path: string) => (path === linkedFile.path ? linkedFile : null))
      }
    } as never;
    const eventAElement = document.createElement('a');
    const eventBElement = document.createElement('a');
    const mouseEvent = new MouseEvent('mouseover');

    const unlinkedPayload = buildLinkedNoteHoverPayload({
      app,
      event: event('a', 'Unlinked Event'),
      mouseEvent,
      eventEl: eventAElement
    });
    const linkedPayload = buildLinkedNoteHoverPayload({
      app,
      event: event('b', 'Linked Event'),
      mouseEvent,
      eventEl: eventBElement
    });

    expect(unlinkedPayload).toBeNull();
    expect(linkedPayload).toEqual({
      event: mouseEvent,
      source: PLUGIN_SLUG,
      hoverParent: eventBElement,
      targetEl: eventBElement,
      linktext: linkedFile.path,
      sourcePath: linkedFile.path
    });
    expect(linkedPayload?.hoverParent).not.toBe(eventAElement);
    expect(linkedPayload?.event.type).toBe('mouseover');
  });
});
