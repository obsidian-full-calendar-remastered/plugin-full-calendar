import { parseCalendarInfo, type CalendarInfo } from '../../types/calendar_settings';
import { migrateAndSanitizeSettings } from '../../ui/settings/utilsSettings';
import { canAddCalendarOfType } from '../../ui/settings/calendarSourceValidation';

jest.mock('obsidian-daily-notes-interface', () => ({
  getDailyNoteSettings: jest.fn().mockReturnValue({ template: '' })
}));

const dailyNote = (id = 'dailynote_1'): CalendarInfo =>
  parseCalendarInfo({
    type: 'dailynote',
    id,
    name: 'Daily Note',
    heading: 'Schedule',
    color: '#111111'
  });

const journals = (id: string, journalId: string): CalendarInfo =>
  parseCalendarInfo({
    type: 'journals',
    id,
    name: `Journals: ${journalId}`,
    journalId,
    heading: 'Schedule',
    color: '#222222'
  });

describe('Journals source identity and uniqueness', () => {
  it('allows one Daily Note calendar and rejects a second Daily Note calendar', () => {
    expect(canAddCalendarOfType('dailynote', [])).toBe(true);
    expect(canAddCalendarOfType('dailynote', [dailyNote()])).toBe(false);
  });

  it('allows Journals when a Daily Note calendar already exists', () => {
    expect(canAddCalendarOfType('journals', [dailyNote()])).toBe(true);
  });

  it('allows a Daily Note calendar when Journals already exists', () => {
    expect(canAddCalendarOfType('dailynote', [journals('journals_1', 'Music')])).toBe(true);
  });

  it('allows multiple Journals calendars with independent journal IDs', () => {
    const music = journals('journals_1', 'Music');
    const work = journals('journals_2', 'Work');

    expect(canAddCalendarOfType('journals', [music])).toBe(true);
    expect(
      [music, work].map(source => (source.type === 'journals' ? source.journalId : null))
    ).toEqual(['Music', 'Work']);
  });

  it('deserializes Journals and Daily Note as distinct source types', () => {
    expect(journals('journals_1', 'Music').type).toBe('journals');
    expect(dailyNote().type).toBe('dailynote');
  });

  it('migrates generic Journals names to distinct configured calendar names', () => {
    const migrated = migrateAndSanitizeSettings({
      calendarSources: [
        {
          type: 'journals',
          id: 'journals_1',
          name: 'Journals',
          journalId: 'Music',
          heading: 'Schedule',
          color: '#222222'
        },
        {
          type: 'journals',
          id: 'journals_2',
          name: 'Journals',
          journalId: 'PHD',
          heading: 'Schedule',
          color: '#333333'
        }
      ]
    });

    expect(migrated.needsSave).toBe(true);
    expect(migrated.settings.calendarSources).toEqual([
      expect.objectContaining({ id: 'journals_1', name: 'Journals: Music' }),
      expect.objectContaining({ id: 'journals_2', name: 'Journals: PHD' })
    ]);
    expect(migrated.settings.calendarSources.map(source => source.id)).toEqual([
      'journals_1',
      'journals_2'
    ]);
    expect(migrateAndSanitizeSettings(migrated.settings).needsSave).toBe(false);
  });

  it('preserves user-defined Journals calendar names', () => {
    const migrated = migrateAndSanitizeSettings({
      calendarSources: [
        {
          type: 'journals',
          id: 'journals_1',
          name: 'My music calendar',
          journalId: 'Music',
          heading: 'Schedule',
          color: '#222222'
        }
      ]
    });

    expect(migrated.settings.calendarSources[0]).toEqual(
      expect.objectContaining({ id: 'journals_1', name: 'My music calendar' })
    );
  });

  it('migrates legacy Journals sources stored with the Daily Note discriminator', () => {
    const migrated = migrateAndSanitizeSettings({
      calendarSources: [
        {
          type: 'dailynote',
          id: 'dailynote_1',
          name: 'Journals',
          heading: 'Schedule',
          format: 'default',
          provider: 'journals',
          journalId: 'Music',
          color: '#222222'
        }
      ]
    });

    expect(migrated.needsSave).toBe(true);
    expect(migrated.settings.calendarSources[0]).toEqual(
      expect.objectContaining({
        type: 'journals',
        journalId: 'Music',
        heading: 'Schedule'
      })
    );
    expect(migrated.settings.calendarSources[0]).not.toHaveProperty('provider');
  });
});
