import * as React from 'react';
import { HeadingInput } from '../../ui/components/forms/HeadingInput';
import {
  DailyNoteProviderConfig,
  DailyNoteEventFormat,
  DailyNoteSourceProvider,
  getDailyNoteEventFormat,
  getDailyNoteSourceProvider
} from './typesDaily';
import { ProviderConfigContext } from '../typesProvider';
import { t } from '../../features/i18n/i18n';
import type FullCalendarPlugin from '../../main';
import {
  loadJournalsCatalog,
  type JournalsBridge,
  type JournalsJournalDescriptor
} from '../journals/JournalsBridge';

interface DailyNoteConfigComponentProps {
  plugin: FullCalendarPlugin;
  config: Partial<DailyNoteProviderConfig>;
  onConfigChange: (newConfig: Partial<DailyNoteProviderConfig>) => void;
  context: ProviderConfigContext;
  onSave: (finalConfig: DailyNoteProviderConfig) => void;
  onClose: () => void; // Required prop
}

type JournalsCatalogState =
  | { state: 'loading'; journals: readonly JournalsJournalDescriptor[] }
  | { state: 'missing' | 'unsupported' | 'error'; journals: readonly [] }
  | {
      state: 'ready';
      journals: readonly JournalsJournalDescriptor[];
      bridge: JournalsBridge;
    };

export const DailyNoteConfigComponent: React.FC<DailyNoteConfigComponentProps> = ({
  plugin,
  config,
  onConfigChange,
  context,
  onSave,
  onClose: _onClose // Destructure prop
}) => {
  const [heading, setHeading] = React.useState(config.heading || '');
  const [format, setFormat] = React.useState<DailyNoteEventFormat>(getDailyNoteEventFormat(config));
  const provider: DailyNoteSourceProvider = getDailyNoteSourceProvider(config);
  const [journalId, setJournalId] = React.useState(config.journalId || '');
  const [catalog, setCatalog] = React.useState<JournalsCatalogState>({
    state: 'loading',
    journals: []
  });
  const [journalHeadings, setJournalHeadings] = React.useState<readonly string[]>([]);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (provider !== 'journals') return;
    let cancelled = false;
    setCatalog({ state: 'loading', journals: [] });
    void loadJournalsCatalog(plugin.app).then(result => {
      if (cancelled) return;
      if (result.state === 'error') {
        console.warn('Full Calendar: Failed to list Journals Day journals.', result.error);
        setCatalog({ state: 'error', journals: [] });
        return;
      }
      if (result.state !== 'ready') {
        setCatalog({ state: result.state, journals: [] });
        return;
      }
      const { bridge, journals } = result;
      setCatalog({ state: 'ready', journals, bridge });
      const [onlyJournal] = journals;
      if (journals.length === 1 && onlyJournal) {
        setJournalId(current => current || onlyJournal.name);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [plugin.app, provider]);

  React.useEffect(() => {
    if (provider !== 'journals' || catalog.state !== 'ready' || !journalId) {
      setJournalHeadings([]);
      return;
    }
    let cancelled = false;
    void Promise.resolve(catalog.bridge.getSuggestedHeadings(journalId)).then(
      headings => {
        if (!cancelled) setJournalHeadings(headings);
      },
      error => {
        if (cancelled) return;
        console.warn('Full Calendar: Failed to load Journals heading suggestions.', error);
        setJournalHeadings([]);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [catalog, journalId, provider]);

  const dayJournals = catalog.journals;
  const availableHeadings = provider === 'journals' ? journalHeadings : context.headings;

  const journalDescription = (() => {
    switch (catalog.state) {
      case 'loading':
        return t('settings.calendars.dailyNote.journal.loading');
      case 'missing':
        return t('settings.calendars.dailyNote.journal.unavailable');
      case 'unsupported':
        return t('settings.calendars.dailyNote.journal.unsupported');
      case 'error':
        return t('settings.calendars.dailyNote.journal.error');
      case 'ready':
        return dayJournals.length === 0
          ? t('settings.calendars.dailyNote.journal.none')
          : t('settings.calendars.dailyNote.journal.description');
    }
  })();

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!heading || (provider === 'journals' && !journalId)) return;

    setIsSubmitting(true);
    const configWithoutLegacyProvider = { ...config };
    delete configWithoutLegacyProvider.provider;
    onSave({
      ...configWithoutLegacyProvider,
      id: config.id || '',
      heading,
      format,
      provider,
      journalId: journalId || undefined
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      {provider === 'journals' && (
        <div className="setting-item">
          <div className="setting-item-info">
            <div className="setting-item-name">
              {t('settings.calendars.dailyNote.journal.label')}
            </div>
            <div className="setting-item-description">{journalDescription}</div>
          </div>
          <div className="setting-item-control">
            <select
              className="dropdown"
              value={journalId}
              disabled={catalog.state !== 'ready' || dayJournals.length === 0}
              onChange={e => {
                setJournalId(e.target.value);
                onConfigChange({ ...config, heading, format, provider, journalId: e.target.value });
              }}
            >
              <option value="">{t('settings.calendars.dailyNote.journal.select')}</option>
              {dayJournals.map(journal => (
                <option key={journal.name} value={journal.name}>
                  {journal.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">{t('settings.calendars.dailyNote.heading.label')}</div>
          <div className="setting-item-description">
            {t('settings.calendars.dailyNote.heading.description')}
          </div>
        </div>
        <div className="setting-item-control">
          <HeadingInput
            value={heading}
            onChange={newValue => {
              setHeading(newValue);
              onConfigChange({ ...config, heading: newValue });
            }}
            headings={[...availableHeadings]}
          />
        </div>
      </div>
      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">{t('settings.calendars.dailyNote.format.label')}</div>
          <div className="setting-item-description">
            {t('settings.calendars.dailyNote.format.description')}
          </div>
        </div>
        <div className="setting-item-control">
          <select
            className="dropdown"
            value={format}
            onChange={e => {
              const newFormat = e.target.value as DailyNoteEventFormat;
              setFormat(newFormat);
              onConfigChange({ ...config, heading, format: newFormat });
            }}
          >
            <option value="default">
              {t('settings.calendars.dailyNote.format.options.default')}
            </option>
            <option value="dayPlanner">
              {t('settings.calendars.dailyNote.format.options.dayPlanner')}
            </option>
          </select>
        </div>
      </div>
      <div className="setting-item">
        <div className="setting-item-info" />
        <div className="setting-item-control">
          <button
            className="mod-cta"
            type="submit"
            disabled={
              isSubmitting ||
              !heading ||
              (provider === 'journals' && (catalog.state !== 'ready' || !journalId))
            }
          >
            {t('ui.buttons.addCalendar')}
          </button>
        </div>
      </div>
    </form>
  );
};
