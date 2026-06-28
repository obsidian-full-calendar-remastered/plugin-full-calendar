import { showNotice } from '../../utils/showNotice';
/**
 * @file SettingsTab.tsx
 * @brief Implements the Full Calendar plugin's settings tab UI for Obsidian.
 *
 * @description
 * This file defines the `FullCalendarSettingTab` class, which extends Obsidian's
 * `PluginSettingTab`. It acts as an orchestrator, calling dedicated rendering
 * modules for each section of the settings UI and managing the top-level view
 * state (e.g., switching between main settings and the full changelog).
 *
 * @exports FullCalendarSettingTab
 * @exports ensureCalendarIds
 *
 * @license See LICENSE.md
 */

import { PluginState } from '../../core/PluginState';
import FullCalendarPlugin from '../../main';
import {
  App,
  DropdownComponent,
  PluginSettingTab,
  setIcon,
  Setting,
  TFile,
  TFolder,
  activeDocument
} from 'obsidian';

import ReactModal from '../ReactModal';
import * as ReactDOM from 'react-dom/client';
import React, { createElement, createRef } from 'react';

import { CalendarSettingsRef } from './sections/calendars/CalendarSetting';
import { getDailyNoteSettings } from 'obsidian-daily-notes-interface';
import { CalendarInfo } from '../../types/calendar_settings';
import { ProviderRegistry } from '../../providers/ProviderRegistry';
import { makeDefaultPartialCalendarSource } from '../../types/calendar_settings';

import { generateCalendarId } from '../../types/calendar_settings';
import { t } from '../../features/i18n/i18n';
import { createDescWithDocs, createDocsLinksFragment } from './docsLinks';
import { getMilestoneCards } from '../../features/milestones/milestones';

// Import the new React components
import './changelogs/changelog.css';

type SettingsCategoryId = 'general' | 'appearance' | 'calendars' | 'organization' | 'integrations';

interface SettingsCategory {
  id: SettingsCategoryId;
}

const SETTINGS_CATEGORIES: SettingsCategory[] = [
  {
    id: 'general'
  },
  {
    id: 'appearance'
  },
  {
    id: 'calendars'
  },
  {
    id: 'organization'
  },
  {
    id: 'integrations'
  }
];

function getCategoryLabel(id: SettingsCategoryId): string {
  switch (id) {
    case 'general':
      return t('settings.categories.general.label');
    case 'appearance':
      return t('settings.categories.appearance.label');
    case 'calendars':
      return t('settings.categories.calendars.label');
    case 'organization':
      return t('settings.categories.organization.label');
    case 'integrations':
      return t('settings.categories.integrations.label');
  }
}

function getCategoryDescription(id: SettingsCategoryId): string {
  switch (id) {
    case 'general':
      return t('settings.categories.general.description');
    case 'appearance':
      return t('settings.categories.appearance.description');
    case 'calendars':
      return t('settings.categories.calendars.description');
    case 'organization':
      return t('settings.categories.organization.description');
    case 'integrations':
      return t('settings.categories.integrations.description');
  }
}

const UNLOCKED_MILESTONE_ICONS = ['🏆', '✨', '🚀', '🌟', '🎉', '🥇'];
const LOCKED_MILESTONE_ICONS = ['🎯', '🧩', '📌', '📈', '🛠️', '🗓️'];

function selectMilestoneIcon(id: string, unlocked: boolean): string {
  const source = unlocked ? UNLOCKED_MILESTONE_ICONS : LOCKED_MILESTONE_ICONS;
  const hash = Array.from(id).reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return source[hash % source.length];
}

export function addCalendarButton(
  plugin: FullCalendarPlugin,
  containerEl: HTMLElement,
  submitCallback: (setting: CalendarInfo) => void,
  listUsedDirectories?: () => string[]
) {
  let dropdown: DropdownComponent;

  return new Setting(containerEl)
    .setName(t('settings.calendars.title'))
    .setDesc(t('settings.calendars.addCalendar'))
    .addDropdown(
      d =>
        (dropdown = d.addOptions({
          local: t('settings.calendars.types.local'),
          dailynote: t('settings.calendars.types.dailynote'),
          icloud: t('settings.calendars.types.icloud'),
          caldav: t('settings.calendars.types.caldav'),
          ical: t('settings.calendars.types.ical'),
          google: t('settings.calendars.types.google'),
          googletasks: 'Google Tasks',
          outlook: t('settings.calendars.types.outlook'),
          tasks: t('settings.calendars.types.tasks'),
          tasknotes: t('settings.calendars.types.tasknotes'),
          bases: t('settings.calendars.types.bases'),
          holidays: t('settings.calendars.types.holidays')
        }))
    )
    .addExtraButton(button => {
      button.setTooltip(t('settings.calendars.addCalendarTooltip'));
      button.setIcon('plus-with-circle');
      button.onClick(async () => {
        const sourceType = dropdown.getValue();

        if (sourceType === 'bases') {
          const app = plugin.app as unknown as {
            internalPlugins?: { getPluginById: (id: string) => unknown };
            plugins?: { getPlugin: (id: string) => unknown };
          };
          const basesPlugin =
            app.internalPlugins?.getPluginById('bases') || app.plugins?.getPlugin('bases');
          if (!basesPlugin) {
            showNotice(t('modals.workspace.fields.notices.enableBases'));
            return;
          }
        }

        const providerType = sourceType === 'icloud' ? 'caldav' : sourceType;

        const providerClass =
          await PluginState.getProviderRegistry().getProviderForType(providerType);
        if (!providerClass) {
          showNotice(t('notices.providerNotRegistered', { providerType }));
          return;
        }
        // Provider classes expose a static getConfigurationComponent; keep a loose unknown cast locally.
        const ConfigComponent = (
          providerClass as unknown as {
            // Providers expose a static method returning a React component.
            getConfigurationComponent(): React.ComponentType<Record<string, unknown>>;
          }
        ).getConfigurationComponent();

        const modal = new ReactModal(plugin.app, async () => {
          await PluginState.loadSettings();

          const usedDirectories = listUsedDirectories ? listUsedDirectories() : [];
          const directories = plugin.app.vault
            .getAllLoadedFiles()
            .filter((f): f is TFolder => f instanceof TFolder)
            .map(f => f.path);

          let headings: string[] = [];
          let { template } = getDailyNoteSettings();
          if (template) {
            if (!template.endsWith('.md')) template += '.md';
            const file = plugin.app.vault.getAbstractFileByPath(template);
            if (file instanceof TFile) {
              headings =
                plugin.app.metadataCache.getFileCache(file)?.headings?.map(h => h.heading) || [];
            }
          }

          const existingCalendarColors = PluginState.getSettings().calendarSources.map(
            s => s.color
          );

          const initialConfig = sourceType === 'icloud' ? { url: 'https://caldav.icloud.com' } : {};

          // Base props for all provider components
          // Minimal shared config component props; provider-specific components can accept additional fields.
          interface BaseConfigProps {
            plugin: FullCalendarPlugin;
            config: Record<string, unknown>;
            context: {
              allDirectories: string[];
              usedDirectories: string[];
              headings: string[];
            };
            onClose: () => void;
            onConfigChange: (c: Record<string, unknown>) => void;
            onSave: (
              finalConfigs: Record<string, unknown> | Record<string, unknown>[],
              accountId?: string
            ) => void;
          }
          const componentProps: BaseConfigProps = {
            plugin: plugin, // Pass plugin for GoogleConfigComponent
            config: initialConfig,
            context: {
              allDirectories: directories.filter(dir => usedDirectories.indexOf(dir) === -1),
              usedDirectories: usedDirectories,
              headings: headings
            },
            onClose: () => modal.close(),
            onConfigChange: (): void => {
              /* no-op */
            },
            onSave: (
              finalConfigs: Record<string, unknown> | Record<string, unknown>[],
              accountId?: string
            ): void => {
              void (async () => {
                const configs = Array.isArray(finalConfigs) ? finalConfigs : [finalConfigs];

                // Validate: only one dailynote source allowed
                if (providerType === 'dailynote') {
                  const existingDailyNotes = PluginState.getSettings().calendarSources.filter(
                    s => s.type === 'dailynote'
                  );
                  if (existingDailyNotes.length >= 1) {
                    showNotice(t('settings.warnings.oneDailyNote'));
                    modal.close();
                    return;
                  }
                }
                // Collect IDs from both settings and ProviderRegistry to prevent race conditions
                const settingsIds = PluginState.getSettings().calendarSources.map(s => s.id);
                const registryIds = PluginState.getProviderRegistry()
                  .getAllSources()
                  .map(s => s.id);
                const existingIds = Array.from(new Set([...settingsIds, ...registryIds]));

                for (const finalConfig of configs) {
                  const newSettingsId = generateCalendarId(
                    providerType as CalendarInfo['type'],
                    existingIds
                  );
                  existingIds.push(newSettingsId);

                  const partialSource = makeDefaultPartialCalendarSource(
                    providerType as CalendarInfo['type'],
                    existingCalendarColors
                  );

                  // Create the full, valid CalendarInfo object first.
                  const finalSource = {
                    ...partialSource,
                    ...finalConfig,
                    id: newSettingsId,
                    ...(providerType === 'google' && accountId && { googleAccountId: accountId }),
                    ...(providerType === 'googletasks' &&
                      accountId && { googleAccountId: accountId }),
                    ...(providerType === 'outlook' &&
                      accountId && { microsoftAccountId: accountId }),
                    // For Google, the config's 'id' is the calendarId for the API.
                    ...((providerType === 'google' || providerType === 'outlook') && {
                      calendarId: finalConfig.id as string
                    }),
                    ...(providerType === 'googletasks' && {
                      listId: finalConfig.id as string
                    })
                  } as CalendarInfo;

                  // Add the provider instance to the registry BEFORE updating the UI.
                  await PluginState.getProviderRegistry().addInstance(finalSource);

                  // Now, submit the complete source to the React component.
                  submitCallback(finalSource);
                  existingCalendarColors.push(finalSource.color);
                }
                modal.close();
              })();
            }
          };

          return createElement(
            ConfigComponent,
            componentProps as unknown as Record<string, unknown>
          );
        });
        modal.open();
      });
    });
}

export class FullCalendarSettingTab extends PluginSettingTab {
  plugin: FullCalendarPlugin;
  private showFullChangelog = false;
  private showMilestonesPage = false;
  private activeCategory: SettingsCategoryId = 'general';
  private searchQuery = '';
  private searchExpanded = false;
  private searchDebounceId: number | null = null;
  private calendarSettingsRef: React.RefObject<CalendarSettingsRef | null> =
    createRef<CalendarSettingsRef>();
  registry: ProviderRegistry;
  private reactRoots: ReactDOM.Root[] = [];

  constructor(app: App, plugin: FullCalendarPlugin, registry: ProviderRegistry) {
    super(app, plugin);
    this.plugin = plugin;
    this.registry = registry;
  }

  public registerReactRoot(root: ReactDOM.Root): void {
    this.reactRoots.push(root);
  }

  public unmountReactRoots(): void {
    this.reactRoots.forEach(root => {
      try {
        root.unmount();
      } catch (e) {
        console.warn('Full Calendar: Failed to unmount React root', e);
      }
    });
    this.reactRoots = [];
  }

  hide(): void {
    void PluginState.flushDebouncedSave();
    this.unmountReactRoots();
    super.hide();
  }

  display(): void {
    this.renderSettings();
  }

  renderSettings(): void {
    this.unmountReactRoots();
    void (async () => {
      this.containerEl.empty();
      if (this.showFullChangelog) {
        await this._renderFullChangelog();
      } else if (this.showMilestonesPage) {
        await this._renderMilestonesPage();
      } else {
        await this._renderMainSettings();
      }
    })();
  }

  public showChangelog(): void {
    this.showFullChangelog = true;
    this.showMilestonesPage = false;
    this.renderSettings();
  }

  public showMilestones(): void {
    this.showMilestonesPage = true;
    this.showFullChangelog = false;
    this.renderSettings();
  }

  private async _renderFullChangelog(): Promise<void> {
    const root = ReactDOM.createRoot(this.containerEl);
    this.registerReactRoot(root);
    const { Changelog } = await import('./changelogs/Changelog');
    root.render(
      createElement(Changelog, {
        onBack: () => {
          this.showFullChangelog = false;
          this.renderSettings();
        }
      })
    );
  }

  private async _renderMainSettings(): Promise<void> {
    const shellEl = this.containerEl.createDiv('full-calendar-settings-shell');
    const headerEl = shellEl.createDiv('full-calendar-settings-header');
    headerEl.createEl('p', {
      text: t('global.settingsHeader')
    });

    const tabsRowEl = shellEl.createDiv('full-calendar-settings-tabs-row');
    tabsRowEl.addClass('full-calendar-settings-tabs-row');

    const tabsEl = tabsRowEl.createDiv('full-calendar-settings-tabs');
    SETTINGS_CATEGORIES.forEach(category => {
      const isActive = category.id === this.activeCategory;
      const button = tabsEl.createEl('button', {
        cls: `full-calendar-settings-tab${isActive ? ' is-active' : ''}`,
        text: getCategoryLabel(category.id)
      });
      button.type = 'button';
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      button.addEventListener('click', () => {
        if (this.activeCategory === category.id) {
          return;
        }
        this.activeCategory = category.id;
        this.renderSettings();
      });
    });

    const contentEl = shellEl.createDiv('full-calendar-settings-content');

    const searchWrapEl = tabsRowEl.createDiv('full-calendar-settings-search-wrap');
    searchWrapEl.addClass('full-calendar-settings-search-wrap-style');

    const searchButtonEl = searchWrapEl.createEl('button', {
      cls: 'clickable-icon full-calendar-settings-search-trigger'
    });
    searchButtonEl.type = 'button';
    searchButtonEl.ariaLabel = 'Search settings';
    searchButtonEl.addClass('full-calendar-settings-search-button-style');
    setIcon(searchButtonEl, 'search');

    const inputWrapEl = searchWrapEl.createDiv('full-calendar-settings-search-input-wrap');
    inputWrapEl.setCssProps({
      position: 'relative',
      width: this.searchExpanded || this.searchQuery ? '170px' : '0px',
      overflow: 'hidden',
      transition: 'width 140ms ease'
    });

    const searchInputEl = inputWrapEl.createEl('input', {
      cls: 'full-calendar-settings-search-input'
    });
    searchInputEl.type = 'text';
    searchInputEl.placeholder = 'Search settings...';
    searchInputEl.value = this.searchQuery;
    searchInputEl.addClass('full-calendar-settings-search-input-style');

    const clearButtonEl = inputWrapEl.createEl('button', {
      cls: 'clickable-icon full-calendar-settings-search-clear'
    });
    clearButtonEl.type = 'button';
    clearButtonEl.ariaLabel = 'Clear search';
    clearButtonEl.setCssProps({
      position: 'absolute',
      right: '6px',
      top: '50%',
      transform: 'translateY(-50%)',
      display: this.searchQuery ? 'inline-flex' : 'none'
    });
    setIcon(clearButtonEl, 'x');

    const renderSearchResults = () => {
      void this._renderSettingsContent(contentEl);
      clearButtonEl.setCssProps({ display: this.searchQuery ? 'inline-flex' : 'none' });
      searchButtonEl.setCssProps({
        display: this.searchExpanded || !!this.searchQuery ? 'none' : 'inline-flex'
      });
      searchButtonEl.toggleClass('is-active', this.searchExpanded || !!this.searchQuery);
      inputWrapEl.toggleClass('is-active-query', !!this.searchQuery);
    };

    searchButtonEl.addEventListener('click', () => {
      this.searchExpanded = true;
      inputWrapEl.setCssProps({ width: '170px' });
      searchButtonEl.setCssProps({ display: 'none' });
      searchInputEl.focus();
      searchButtonEl.toggleClass('is-active', true);
    });

    searchInputEl.addEventListener('blur', () => {
      if (this.searchQuery) return;
      this.searchExpanded = false;
      inputWrapEl.setCssProps({ width: '0px' });
      searchButtonEl.setCssProps({ display: 'inline-flex' });
      searchButtonEl.toggleClass('is-active', false);
    });

    searchInputEl.addEventListener('input', () => {
      this.searchQuery = searchInputEl.value;
      if (this.searchDebounceId !== null) {
        window.clearTimeout(this.searchDebounceId);
      }
      this.searchDebounceId = window.setTimeout(renderSearchResults, 80);
    });

    clearButtonEl.addEventListener('mousedown', evt => {
      evt.preventDefault();
      this.searchQuery = '';
      searchInputEl.value = '';
      renderSearchResults();
      searchInputEl.focus();
    });

    await this._renderSettingsContent(contentEl);

    const { renderFooter } = await import('./sections/calendars/renderFooter');
    renderFooter(shellEl);
  }

  private async _renderMilestonesPage(): Promise<void> {
    const wrapper = this.containerEl.createDiv('full-calendar-changelog-wrapper');
    const header = wrapper.createDiv('full-calendar-changelog-header');

    const backButton = header.createEl('button', { text: '<' });
    backButton.type = 'button';
    backButton.addEventListener('click', () => {
      this.showMilestonesPage = false;
      this.renderSettings();
    });

    new Setting(header)
      .setName(t('settings.appearance.milestones.modal.title'))
      .setHeading()
      .setDesc(
        createDescWithDocs(t('settings.appearance.milestones.modal.description'), [
          { text: 'Milestones guide', path: 'user/features/milestones/' }
        ])
      );

    const cards = getMilestoneCards();
    const content = wrapper.createDiv({ cls: 'full-calendar-version-content' });

    for (const card of cards) {
      const cardEl = content.createDiv({
        cls: `full-calendar-change-item ${card.unlocked ? 'full-calendar-change-type-new' : 'full-calendar-change-type-improvement'} ofc-milestone-card ${card.unlocked ? 'is-unlocked' : 'is-locked'}`
      });

      cardEl.createDiv({
        text: selectMilestoneIcon(card.id, card.unlocked),
        cls: 'full-calendar-change-icon'
      });
      const cardContent = cardEl.createDiv({ cls: 'change-content u-flex-grow-1' });

      const topRow = cardContent.createDiv({ cls: 'full-calendar-whats-new-header' });
      topRow.createDiv({ text: card.title, cls: 'setting-item-name' });
      topRow.createSpan({
        text: card.unlocked
          ? t('settings.appearance.milestones.modal.completed')
          : t('settings.appearance.milestones.modal.inProgress'),
        cls: `ofc-milestone-badge ${card.unlocked ? 'is-unlocked' : 'is-locked'}`
      });

      cardContent.createDiv({
        text: `${card.targetLabel} • ${card.description}`,
        cls: 'full-calendar-change-description'
      });

      const progressTrack = cardContent.createDiv({ cls: 'ofc-milestone-progress-track' });
      progressTrack.createDiv({
        cls: 'ofc-milestone-progress-fill',
        attr: { style: `width: ${card.percent.toFixed(1)}%` }
      });

      cardContent.createDiv({
        text: t('settings.appearance.milestones.modal.progress', { current: card.current }),
        cls: 'ofc-milestone-progress-label'
      });
    }

    const { renderFooter } = await import('./sections/calendars/renderFooter');
    renderFooter(wrapper);
  }

  private async _renderSettingsContent(containerEl: HTMLElement): Promise<void> {
    containerEl.empty();
    const query = this.searchQuery.trim();

    if (!query) {
      const activeCategory = SETTINGS_CATEGORIES.find(
        category => category.id === this.activeCategory
      );
      const introEl = containerEl.createDiv('full-calendar-settings-category-intro');
      if (activeCategory) {
        introEl.createEl('p', { text: getCategoryDescription(activeCategory.id) });
      }
      const panelEl = containerEl.createDiv('full-calendar-settings-panel');
      await this._renderActiveCategory(panelEl, this.activeCategory);
      return;
    }

    let hasAnyMatches = false;
    for (const category of SETTINGS_CATEGORIES) {
      const sectionEl = containerEl.createDiv('full-calendar-settings-search-section');
      const introEl = sectionEl.createDiv('full-calendar-settings-category-intro');
      new Setting(introEl).setName(getCategoryLabel(category.id)).setHeading();
      introEl.createEl('p', { text: getCategoryDescription(category.id) });

      const panelEl = sectionEl.createDiv('full-calendar-settings-panel');
      await this._renderActiveCategory(panelEl, category.id);

      const sectionHasMatches = this._applySearchFilter(panelEl, query);
      if (!sectionHasMatches) {
        sectionEl.remove();
      } else {
        hasAnyMatches = true;
      }
    }

    if (!hasAnyMatches) {
      const emptyEl = containerEl.createDiv('full-calendar-settings-search-empty');
      emptyEl.createEl('p', {
        text: `No settings match "${query}".`
      });
    }
  }

  private _applySearchFilter(containerEl: HTMLElement, query: string): boolean {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    const settingEls = Array.from(containerEl.querySelectorAll<HTMLElement>('.setting-item'));

    let visibleCount = 0;
    settingEls.forEach(settingEl => {
      const titleEl = settingEl.querySelector<HTMLElement>('.setting-item-name');
      const descriptionEl = settingEl.querySelector<HTMLElement>('.setting-item-description');
      const title = titleEl?.textContent ?? '';
      const description = descriptionEl?.textContent ?? '';
      const haystack = `${title} ${description}`.toLowerCase();

      // Strict search: every token must appear in visible title/description text.
      const isMatch = tokens.every(token => haystack.includes(token));
      settingEl.setCssProps({ display: isMatch ? '' : 'none' });
      if (isMatch) {
        this._highlightSearchTokens(titleEl, tokens);
        this._highlightSearchTokens(descriptionEl, tokens);
        visibleCount += 1;
      }
    });

    return visibleCount > 0;
  }

  private _highlightSearchTokens(el: HTMLElement | null, tokens: string[]): void {
    if (!el) {
      return;
    }
    const rawText = el.textContent ?? '';
    if (!rawText || tokens.length === 0) {
      return;
    }

    const escapedTokens = tokens
      .filter(Boolean)
      .map(token => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (escapedTokens.length === 0) {
      return;
    }

    const regex = new RegExp(`(${escapedTokens.join('|')})`, 'gi');
    const doc: Document = activeDocument;
    const fragment = doc.createDocumentFragment();
    let lastIndex = 0;

    for (const match of rawText.matchAll(regex)) {
      const matchText = match[0];
      const matchIndex = match.index ?? -1;
      if (matchIndex < 0) {
        continue;
      }

      if (matchIndex > lastIndex) {
        fragment.append(rawText.slice(lastIndex, matchIndex));
      }

      const markEl = doc.createElement('mark');
      markEl.textContent = matchText;
      fragment.append(markEl);
      lastIndex = matchIndex + matchText.length;
    }

    if (lastIndex < rawText.length) {
      fragment.append(rawText.slice(lastIndex));
    }

    el.empty();
    el.append(fragment);
  }

  private async _renderActiveCategory(
    containerEl: HTMLElement,
    categoryId: SettingsCategoryId
  ): Promise<void> {
    switch (categoryId) {
      case 'general': {
        const [
          { renderGeneralSettings },
          { renderRemindersSettings },
          { renderWhatsNew },
          { renderBreakTimerSettings }
        ] = await Promise.all([
          import('./sections/renderGeneral'),
          import('../../features/notifications/ui/renderReminders'),
          import('./changelogs/renderWhatsNew'),
          import('../../features/break_timer/ui/renderBreakTimerSettings')
        ]);

        this._renderInitialSetupNotice(containerEl);
        renderGeneralSettings(containerEl, this.plugin, () => {
          this.renderSettings();
        });
        renderRemindersSettings(containerEl, this.plugin, () => {
          this.renderSettings();
        });
        renderBreakTimerSettings(containerEl, this.plugin, () => {
          this.renderSettings();
        });
        renderWhatsNew(containerEl, this, () => {
          this.showFullChangelog = true;
          this.renderSettings();
        });
        break;
      }
      case 'appearance': {
        const [{ renderAppearanceSettings }] = await Promise.all([
          import('./sections/renderAppearance')
        ]);
        renderAppearanceSettings(containerEl, this.plugin, () => {
          this.renderSettings();
        });
        break;
      }
      case 'calendars': {
        const [{ renderCalendarManagement }] = await Promise.all([
          import('./sections/renderCalendars')
        ]);
        renderCalendarManagement(
          containerEl,
          this,
          this.calendarSettingsRef as unknown as React.RefObject<CalendarSettingsRef>
        );
        break;
      }
      case 'organization': {
        const [{ renderWorkspaceSettings }, { renderCategorizationSettings }] = await Promise.all([
          import('../../features/workspaces/ui/renderWorkspaces'),
          import('../../features/category/ui/renderCategorization')
        ]);

        renderWorkspaceSettings(containerEl, this.plugin, () => {
          this.renderSettings();
        });
        renderCategorizationSettings(containerEl, this, () => {
          this.renderSettings();
        });
        break;
      }
      case 'integrations': {
        const [
          { renderActivityWatchSettings },
          { renderGoogleSettings },
          { renderOutlookSettings },
          { renderTasksIntegrationSettings },
          { renderTaskNotesIntegrationSettings },
          { renderApiAccessSettings },
          { renderFcrReminderSettings },
          { renderCredentialsSettings },
          { renderAvailabilitySettings },
          { renderExportSettings }
        ] = await Promise.all([
          import('../../features/activitywatch/ui/renderActivityWatch'),
          import('../../providers/google/ui/renderGoogle'),
          import('../../providers/outlook/ui/renderOutlook'),
          import('../../providers/tasks/renderTasksIntegration'),
          import('../../providers/tasknotes/renderTaskNotesIntegration'),
          import('./sections/renderApiAccess'),
          import('../../features/fcr_reminder/ui/renderFcrReminder'),
          import('../../features/credentials/ui/renderCredentialsSettings'),
          import('../../features/availability/ui/AvailabilitySettings'),
          import('../../features/export/ui/renderExportSettings')
        ]);

        renderCredentialsSettings(containerEl, () => {
          this.renderSettings();
        });

        renderAvailabilitySettings(containerEl, this.plugin, () => {
          this.renderSettings();
        });

        renderExportSettings(containerEl, this.plugin, () => {
          this.renderSettings();
        });

        renderActivityWatchSettings(containerEl, this.plugin, () => {
          this.renderSettings();
        });
        renderTasksIntegrationSettings(containerEl, this.plugin, () => {
          this.renderSettings();
        });
        renderTaskNotesIntegrationSettings(containerEl, this.plugin, () => {
          this.renderSettings();
        });
        renderFcrReminderSettings(containerEl, this.plugin, () => {
          this.renderSettings();
        });
        renderGoogleSettings(containerEl, this.plugin, () => {
          this.renderSettings();
        });
        renderOutlookSettings(containerEl, this.plugin, () => {
          this.renderSettings();
        });
        renderApiAccessSettings(containerEl, this.plugin, () => {
          this.renderSettings();
        });
        break;
      }
    }
  }

  private _renderInitialSetupNotice(containerEl: HTMLElement): void {
    if (PluginState.getSettings().calendarSources.length === 0) {
      const notice = containerEl.createDiv('full-calendar-initial-setup-notice');
      new Setting(notice).setName('').setHeading();
      notice.createEl('p', {
        text: t('settings.quickStart.description')
      });
      const docsPara = notice.createEl('p');
      docsPara.append(
        createDocsLinksFragment([
          { text: 'Onboarding and daily use', path: 'user/guides/' },
          { text: 'Calendar types', path: 'user/calendars/' },
          { text: 'Troubleshooting', path: 'user/guides/troubleshooting' }
        ])
      );
    }
  }
}

// These functions remain pure and outside the class.

// ensureCalendarIds and sanitizeInitialView moved to ./utils to avoid loading this heavy
// settings module (and React) during plugin startup. Keep imports above.
// settings module (and React) during plugin startup. Keep imports above.
// These functions remain pure and outside the class.

// ensureCalendarIds and sanitizeInitialView moved to ./utils to avoid loading this heavy
// settings module (and React) during plugin startup. Keep imports above.
// settings module (and React) during plugin startup. Keep imports above.
