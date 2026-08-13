import type FullCalendarPlugin from '../../main';
import type { ObsidianInterface } from '../../ObsidianAdapter';
import { DailyNoteProvider } from '../dailynote/DailyNoteProvider';
import type { DailyNoteProviderConfig } from '../dailynote/typesDaily';

export class JournalsProvider extends DailyNoteProvider {
  static readonly type = 'journals';
  static readonly displayName = 'Journals';

  readonly type = 'journals';
  readonly displayName = 'Journals';

  constructor(
    source: DailyNoteProviderConfig,
    plugin: FullCalendarPlugin,
    app?: ObsidianInterface
  ) {
    super({ ...source, type: 'journals', provider: 'journals' }, plugin, app);
  }
}
