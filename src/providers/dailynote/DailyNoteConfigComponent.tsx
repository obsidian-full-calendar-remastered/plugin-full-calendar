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
  getJournalsDayJournals,
  getJournalsPlugin,
  getJournalsTemplateHeadings
} from './DailyNoteSourceAdapter';

interface DailyNoteConfigComponentProps {
  plugin: FullCalendarPlugin;
  config: Partial<DailyNoteProviderConfig>;
  onConfigChange: (newConfig: Partial<DailyNoteProviderConfig>) => void;
  context: ProviderConfigContext;
  onSave: (finalConfig: DailyNoteProviderConfig) => void;
  onClose: () => void; // Required prop
}

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
  const journalsPlugin = getJournalsPlugin(plugin.app);
  const dayJournals = getJournalsDayJournals(plugin.app);
  const initialJournalId =
    config.journalId ||
    (provider === 'journals' && dayJournals.length === 1 ? dayJournals[0].name : '');
  const [journalId, setJournalId] = React.useState(initialJournalId);
  const availableHeadings =
    provider === 'journals' && journalId
      ? getJournalsTemplateHeadings(plugin.app, journalId)
      : context.headings;
  const [isSubmitting, setIsSubmitting] = React.useState(false);

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
            <div className="setting-item-description">
              {!journalsPlugin
                ? t('settings.calendars.dailyNote.journal.unavailable')
                : dayJournals.length === 0
                  ? t('settings.calendars.dailyNote.journal.none')
                  : t('settings.calendars.dailyNote.journal.description')}
            </div>
          </div>
          <div className="setting-item-control">
            <select
              className="dropdown"
              value={journalId}
              disabled={!journalsPlugin || dayJournals.length === 0}
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
            headings={availableHeadings}
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
            disabled={isSubmitting || !heading || (provider === 'journals' && !journalId)}
          >
            {t('ui.buttons.addCalendar')}
          </button>
        </div>
      </div>
    </form>
  );
};
