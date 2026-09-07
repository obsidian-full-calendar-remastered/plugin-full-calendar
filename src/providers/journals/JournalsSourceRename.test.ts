import { parseCalendarInfo, type CalendarInfo } from '../../types/calendar_settings';
import { migrateJournalsSourceRename } from './JournalsSourceIdentity';

const source = (id: string, journalId: string, name: string): CalendarInfo =>
  parseCalendarInfo({
    type: 'journals',
    id,
    journalId,
    name,
    heading: 'Calendar',
    color: '#123456'
  });

describe('Journals source rename migration', () => {
  it('updates every matching persisted journal name while preserving custom calendar names', () => {
    const sources = [
      source('journals_1', 'Work', 'Journals: Work'),
      source('journals_2', 'Work', 'Office schedule'),
      source('journals_3', 'Personal', 'Journals: Personal')
    ];

    expect(migrateJournalsSourceRename(sources, 'Work', 'Office')).toBe(true);
    expect(sources).toEqual([
      expect.objectContaining({ journalId: 'Office', name: 'Journals: Office' }),
      expect.objectContaining({ journalId: 'Office', name: 'Office schedule' }),
      expect.objectContaining({ journalId: 'Personal', name: 'Journals: Personal' })
    ]);
  });

  it('is idempotent after the rename has been applied', () => {
    const sources = [source('journals_1', 'Office', 'Journals: Office')];
    expect(migrateJournalsSourceRename(sources, 'Work', 'Office')).toBe(false);
    expect(sources[0]).toEqual(
      expect.objectContaining({ journalId: 'Office', name: 'Journals: Office' })
    );
  });
});
