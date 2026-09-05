import { showNotice } from '../../../utils/showNotice';
import { PluginState } from '../../../core/PluginState';
import * as React from 'react';
import { useState } from 'react';

import FullCalendarPlugin from '../../../main';
import { t } from '../../i18n/i18n';
import { ContextProfile, TriggerRule } from '../../../types/settings';
import { createDatePicker } from '../../../ui/components/forms/DatePicker';
import { toDocsUrl } from '../../../ui/settings/docsLinks';

interface Props {
  plugin: FullCalendarPlugin;
  onClose: () => void;
}

export const ActivityWatchConfigComponent: React.FC<Props> = ({ plugin: _plugin, onClose }) => {
  const settings = PluginState.getSettings().activityWatch;
  const normalizedProfiles = (settings.profiles || []).map(profile => ({
    ...profile,
    supportingEvidenceRules: profile.supportingEvidenceRules || []
  }));

  const [apiUrl, setApiUrl] = useState(settings.apiUrl);
  const [targetCalendarId, setTargetCalendarId] = useState(settings.targetCalendarId);
  const [syncStrategy, setSyncStrategy] = useState<'auto' | 'custom'>(settings.syncStrategy);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(settings.autoSyncEnabled);
  const [autoSyncIntervalMins, setAutoSyncIntervalMins] = useState(
    Math.max(1, settings.autoSyncIntervalMins || 10)
  );
  const dateInputRef = React.useRef<HTMLInputElement>(null);
  const [dateRange, setDateRange] = useState<Date[]>(() => {
    if (settings.customDateStart && settings.customDateEnd) {
      return [new Date(settings.customDateStart), new Date(settings.customDateEnd)];
    }
    return [];
  });
  const [profiles, setProfiles] = useState<ContextProfile[]>(normalizedProfiles);

  React.useEffect(() => {
    if (syncStrategy === 'custom' && dateInputRef.current) {
      const picker = createDatePicker(dateInputRef.current, {
        mode: 'range',
        defaultDate: dateRange,
        onChange: dates => setDateRange(dates)
      });
      return () => picker.destroy();
    }
  }, [syncStrategy, dateRange]);

  const handleSave = async () => {
    PluginState.getSettings().activityWatch.apiUrl = apiUrl;
    PluginState.getSettings().activityWatch.targetCalendarId = targetCalendarId;
    PluginState.getSettings().activityWatch.syncStrategy = syncStrategy;
    PluginState.getSettings().activityWatch.autoSyncEnabled =
      syncStrategy === 'auto' ? autoSyncEnabled : false;
    PluginState.getSettings().activityWatch.autoSyncIntervalMins = Math.max(
      1,
      autoSyncIntervalMins || 10
    );
    PluginState.getSettings().activityWatch.customDateStart = dateRange[0]
      ? dateRange[0].toISOString()
      : '';
    PluginState.getSettings().activityWatch.customDateEnd = dateRange[1]
      ? dateRange[1].toISOString()
      : '';
    PluginState.getSettings().activityWatch.profiles = profiles;

    await PluginState.saveSettings();
    showNotice(t('modals.activityWatchSetup.saved'));
    onClose();
  };

  const addProfile = () => {
    setProfiles([
      ...profiles,
      {
        id: Math.random().toString(36).substring(2, 11),
        name: 'New Profile',
        activationThresholdMins: 5,
        softBreakLimitMins: 3,
        primaryEvidenceRules: [],
        supportingEvidenceRules: [],
        hardBreakRules: [],
        titleTemplate: '{app} - {title}',
        color: 'Work'
      }
    ]);
  };

  const updateProfile = (id: string, updates: Partial<ContextProfile>) => {
    setProfiles(profiles.map(p => (p.id === id ? { ...p, ...updates } : p)));
  };

  const deleteProfile = (id: string) => {
    setProfiles(profiles.filter(p => p.id !== id));
  };

  const createEmptyRule = (): TriggerRule => ({
    id: Math.random().toString(36).substring(2, 11),
    bucketType: 'window',
    matchField: 'app',
    matchPattern: '',
    useRegex: false
  });

  const availableProviders = PluginState.getProviderRegistry()
    .getAllSources()
    .map(s => {
      const instance = PluginState.getProviderRegistry().getInstance(s.id);
      return {
        id: s.id,
        name: s.name || s.type,
        canCreate: instance?.getCapabilities()?.canCreate
      };
    })
    .filter(p => p.canCreate);

  const lastSyncText = settings.lastSyncTime
    ? new Date(settings.lastSyncTime).toLocaleString()
    : t('modals.activityWatchSetup.strategy.neverSynced');

  const renderRuleList = (
    profile: ContextProfile,
    listType: 'primaryEvidenceRules' | 'supportingEvidenceRules' | 'hardBreakRules'
  ) => {
    const rules = profile[listType] || [];
    const setRules = (newRules: TriggerRule[]) =>
      updateProfile(profile.id, { [listType]: newRules });

    return (
      <div className="activitywatch-rule-list">
        {rules.map(rule => (
          <div key={rule.id} className="activitywatch-rule-row">
            <input
              list={`buckets-${rule.id}`}
              type="text"
              value={rule.bucketType}
              onChange={e =>
                setRules(
                  rules.map(r => (r.id === rule.id ? { ...r, bucketType: e.target.value } : r))
                )
              }
              placeholder={t('modals.activityWatchSetup.rules.bucketPlaceholder')}
            />
            <datalist id={`buckets-${rule.id}`}>
              <option value="web" />
              <option value="window" />
              <option value="afk" />
            </datalist>

            <input
              list={`fields-${rule.id}`}
              type="text"
              value={rule.matchField || ''}
              onChange={e =>
                setRules(
                  rules.map(r => (r.id === rule.id ? { ...r, matchField: e.target.value } : r))
                )
              }
              placeholder={t('modals.activityWatchSetup.rules.fieldPlaceholder')}
            />
            <datalist id={`fields-${rule.id}`}>
              {rule.bucketType === 'web' && (
                <>
                  <option value="url" />
                  <option value="title" />
                  <option value="audible" />
                  <option value="incognito" />
                  <option value="tabCount" />
                </>
              )}
              {rule.bucketType === 'window' && (
                <>
                  <option value="app" />
                  <option value="title" />
                </>
              )}
              {rule.bucketType === 'afk' && <option value="status" />}
            </datalist>

            <input
              type="text"
              value={rule.matchPattern}
              onChange={e =>
                setRules(
                  rules.map(r => (r.id === rule.id ? { ...r, matchPattern: e.target.value } : r))
                )
              }
              placeholder={t('modals.activityWatchSetup.rules.matchPatternPlaceholder')}
            />
            <label className="activitywatch-rule-checkbox">
              <input
                type="checkbox"
                checked={rule.useRegex}
                onChange={e =>
                  setRules(
                    rules.map(r => (r.id === rule.id ? { ...r, useRegex: e.target.checked } : r))
                  )
                }
              />{' '}
              {t('modals.activityWatchSetup.rules.regex')}
            </label>
            <button
              type="button"
              onClick={() => setRules(rules.filter(r => r.id !== rule.id))}
              className="mod-warning"
            >
              x
            </button>
          </div>
        ))}
        <button
          type="button"
          className="activitywatch-inline-button"
          onClick={() => setRules([...rules, createEmptyRule()])}
        >
          {t('modals.activityWatchSetup.rules.btnAdd')}
        </button>
      </div>
    );
  };

  return (
    <div className="ofc-settings-modal-shell activitywatch-settings-shell">
      <div className="ofc-settings-modal-body activitywatch-settings-body">
        <section className="activitywatch-settings-heading setting-item">
          <div className="setting-item-info">
            <div className="setting-item-name">{t('settings.activityWatch.title')}</div>
            <div className="setting-item-description">
              {t('settings.activityWatch.enable.description')} Learn more:{' '}
              <a
                href={toDocsUrl('user/calendars/activitywatch/')}
                className="ofc-doc-link external-link"
                target="_blank"
                rel="noopener noreferrer"
              >
                ActivityWatch integration
              </a>
              {' | '}
              <a
                href={toDocsUrl('user/guides/troubleshooting')}
                className="ofc-doc-link external-link"
                target="_blank"
                rel="noopener noreferrer"
              >
                Troubleshooting
              </a>
            </div>
          </div>
        </section>

        <section className="activitywatch-settings-section">
          <h3>{t('modals.activityWatchSetup.strategy.title')}</h3>
          <div className="activitywatch-segmented-row">
            <label>
              <input
                type="radio"
                name="syncStrategy"
                checked={syncStrategy === 'auto'}
                onChange={() => setSyncStrategy('auto')}
              />
              {t('modals.activityWatchSetup.strategy.auto')}
            </label>
            <label>
              <input
                type="radio"
                name="syncStrategy"
                checked={syncStrategy === 'custom'}
                onChange={() => setSyncStrategy('custom')}
              />
              {t('modals.activityWatchSetup.strategy.custom')}
            </label>
          </div>

          {syncStrategy === 'auto' && (
            <div className="activitywatch-muted-block">
              {t('modals.activityWatchSetup.strategy.lastSynced')}: {lastSyncText}
              <div>{t('modals.activityWatchSetup.strategy.autoDescription')}</div>
            </div>
          )}

          {syncStrategy === 'custom' && (
            <div className="activitywatch-custom-range">
              <input
                ref={dateInputRef}
                type="text"
                placeholder={t('modals.activityWatchSetup.strategy.datePlaceholder')}
              />
              <div className="activitywatch-muted-block">
                {t('modals.activityWatchSetup.strategy.customDescription')}
              </div>
            </div>
          )}

          {syncStrategy === 'auto' && (
            <div className="activitywatch-auto-sync-controls">
              <label className="activitywatch-checkbox-row">
                <input
                  type="checkbox"
                  checked={autoSyncEnabled}
                  onChange={e => setAutoSyncEnabled(e.target.checked)}
                />
                {t('modals.activityWatchSetup.strategy.autoSyncEnabled')}
              </label>

              <label className="activitywatch-field-stack">
                <span>{t('modals.activityWatchSetup.strategy.autoSyncIntervalMins')}</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={autoSyncIntervalMins}
                  onChange={e =>
                    setAutoSyncIntervalMins(Math.max(1, parseInt(e.target.value) || 1))
                  }
                  disabled={!autoSyncEnabled}
                />
              </label>
            </div>
          )}
        </section>

        <section className="setting-item">
          <div className="setting-item-info">
            <div className="setting-item-name">{t('modals.activityWatchSetup.apiUrl')}</div>
          </div>
          <div className="setting-item-control">
            <input
              type="text"
              value={apiUrl}
              onChange={e => setApiUrl(e.target.value)}
              spellCheck={false}
            />
          </div>
        </section>

        <section className="setting-item">
          <div className="setting-item-info">
            <div className="setting-item-name">{t('modals.activityWatchSetup.targetCalendar')}</div>
          </div>
          <div className="setting-item-control">
            <select value={targetCalendarId} onChange={e => setTargetCalendarId(e.target.value)}>
              <option value="">{t('modals.activityWatchSetup.unselected')}</option>
              {availableProviders.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="activitywatch-settings-section">
          <h3>{t('modals.activityWatchSetup.profiles.title')}</h3>
          <div className="activitywatch-profile-list">
            {profiles.map(profile => (
              <div key={profile.id} className="activitywatch-profile">
                <div className="activitywatch-profile-header">
                  <strong>{t('modals.activityWatchSetup.profiles.config')}</strong>
                  <button
                    type="button"
                    onClick={() => deleteProfile(profile.id)}
                    className="mod-warning"
                  >
                    {t('modals.activityWatchSetup.profiles.btnDelete')}
                  </button>
                </div>

                <div className="activitywatch-profile-grid">
                  <label>
                    {t('modals.activityWatchSetup.profiles.name')}
                    <input
                      type="text"
                      value={profile.name}
                      onChange={e => updateProfile(profile.id, { name: e.target.value })}
                    />
                  </label>
                  <label>
                    {t('modals.activityWatchSetup.profiles.category')}
                    <input
                      type="text"
                      value={profile.color}
                      onChange={e => updateProfile(profile.id, { color: e.target.value })}
                    />
                  </label>
                </div>

                <div className="activitywatch-profile-grid">
                  <label>
                    {t('modals.activityWatchSetup.profiles.activationThreshold')}
                    <input
                      type="number"
                      min="0"
                      value={profile.activationThresholdMins}
                      onChange={e =>
                        updateProfile(profile.id, {
                          activationThresholdMins: parseInt(e.target.value) || 0
                        })
                      }
                    />
                  </label>
                  <label>
                    {t('modals.activityWatchSetup.profiles.softBreakLimit')}
                    <input
                      type="number"
                      min="0"
                      value={profile.softBreakLimitMins}
                      onChange={e =>
                        updateProfile(profile.id, {
                          softBreakLimitMins: parseInt(e.target.value) || 0
                        })
                      }
                    />
                  </label>
                </div>

                <label className="activitywatch-field-stack">
                  <span>{t('modals.activityWatchSetup.profiles.titleTemplate')}</span>
                  <input
                    type="text"
                    value={profile.titleTemplate}
                    onChange={e => updateProfile(profile.id, { titleTemplate: e.target.value })}
                    placeholder={t('modals.activityWatchSetup.profiles.titleTemplatePlaceholder')}
                  />
                </label>

                <div>
                  <strong>{t('modals.activityWatchSetup.profiles.primaryEvidenceRules')}</strong>
                  {renderRuleList(profile, 'primaryEvidenceRules')}
                </div>

                <div>
                  <strong>{t('modals.activityWatchSetup.profiles.supportingEvidenceRules')}</strong>
                  {renderRuleList(profile, 'supportingEvidenceRules')}
                </div>

                <div>
                  <strong>{t('modals.activityWatchSetup.profiles.hardBreakRules')}</strong>
                  {renderRuleList(profile, 'hardBreakRules')}
                </div>
              </div>
            ))}
            <button type="button" className="activitywatch-inline-button" onClick={addProfile}>
              {t('modals.activityWatchSetup.profiles.btnAddProfile')}
            </button>
          </div>
        </section>
      </div>

      <footer className="ofc-settings-modal-footer activitywatch-settings-footer">
        <button type="button" onClick={onClose}>
          {t('modals.activityWatchSetup.buttons.cancel')}
        </button>
        <button type="button" className="mod-cta" onClick={() => void handleSave()}>
          {t('modals.activityWatchSetup.buttons.save')}
        </button>
      </footer>
    </div>
  );
};
