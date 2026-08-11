import { getEventCalendarOptions } from './EditEvent';

describe('event calendar selector options', () => {
  it('uses configured calendar names and stable IDs for multiple Journals calendars', () => {
    expect(
      getEventCalendarOptions([
        { id: 'journals_1', type: 'journals', name: 'Journals: Music' },
        { id: 'journals_2', type: 'journals', name: 'Journals: PHD' }
      ])
    ).toEqual([
      { value: 'journals_1', label: 'Journals: Music' },
      { value: 'journals_2', label: 'Journals: PHD' }
    ]);
  });

  it('preserves configured names for other provider types', () => {
    expect(
      getEventCalendarOptions([
        { id: 'daily_1', type: 'dailynote', name: 'Daily Note' },
        { id: 'local_1', type: 'local', name: 'Project notes' },
        { id: 'ics_1', type: 'ical', name: 'Team holidays' },
        { id: 'caldav_1', type: 'caldav', name: 'Personal CalDAV' },
        { id: 'google_1', type: 'google', name: 'Work Google' },
        { id: 'outlook_1', type: 'outlook', name: 'PHD Outlook' },
        { id: 'tasks_1', type: 'tasks', name: 'Vault tasks' }
      ])
    ).toEqual([
      { value: 'daily_1', label: 'Daily Note' },
      { value: 'local_1', label: 'Project notes' },
      { value: 'ics_1', label: 'Team holidays' },
      { value: 'caldav_1', label: 'Personal CalDAV' },
      { value: 'google_1', label: 'Work Google' },
      { value: 'outlook_1', label: 'PHD Outlook' },
      { value: 'tasks_1', label: 'Vault tasks' }
    ]);
  });
});
