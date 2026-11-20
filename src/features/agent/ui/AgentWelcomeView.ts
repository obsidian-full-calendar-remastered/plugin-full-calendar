/**
 * @file AgentWelcomeView.ts
 * @brief Copilot-style empty-state welcome screen and starter prompt cards.
 *
 * @license See LICENSE.md
 */

import { setIcon } from 'obsidian';
import { t } from '../../i18n/i18n';

interface StarterItem {
  label: string;
  placeholder?: string;
  prompt: string;
  autoSend: boolean;
}

export interface AgentWelcomeViewOptions {
  compact: boolean;
  onSendPrompt: (prompt: string) => void;
  onFillPrompt: (prompt: string) => void;
}

export class AgentWelcomeView {
  private rootEl: HTMLElement;

  constructor(containerEl: HTMLElement, options: AgentWelcomeViewOptions) {
    if (options.compact) {
      this.rootEl = containerEl.createDiv({ cls: 'ofc-agent-welcome ofc-agent-welcome-compact' });
      this.renderCompact(options);
    } else {
      this.rootEl = containerEl.createDiv({ cls: 'ofc-agent-welcome' });
      this.renderFull(options);
    }
  }

  public remove(): void {
    this.rootEl.remove();
  }

  private getFullStarters(): StarterItem[] {
    return [
      {
        label: t('agent.suggestions.today'),
        prompt: t('agent.suggestions.todayPrompt'),
        autoSend: true
      },
      {
        label: t('agent.suggestions.thisWeekPrompt'),
        prompt: t('agent.suggestions.thisWeekPrompt'),
        autoSend: true
      },
      {
        label: t('agent.welcome.addEventPrefix'),
        placeholder: t('agent.welcome.addEventPlaceholder'),
        prompt: t('agent.suggestions.addEventPrompt'),
        autoSend: false
      },
      {
        label: t('agent.welcome.importUrlPrefix'),
        placeholder: t('agent.welcome.importUrlPlaceholder'),
        prompt: t('agent.suggestions.importUrlPrompt'),
        autoSend: false
      },
      {
        label: t('agent.welcome.cleanupPrefix'),
        placeholder: t('agent.welcome.cleanupPlaceholder'),
        prompt: t('agent.welcome.starterCleanupPrompt'),
        autoSend: false
      }
    ];
  }

  private getCompactStarters(): StarterItem[] {
    return [
      {
        label: t('agent.suggestions.today'),
        prompt: t('agent.suggestions.todayPrompt'),
        autoSend: true
      },
      {
        label: t('agent.suggestions.thisWeek'),
        prompt: t('agent.suggestions.thisWeekPrompt'),
        autoSend: true
      },
      {
        label: t('agent.suggestions.addEvent'),
        prompt: t('agent.suggestions.addEventPrompt'),
        autoSend: false
      },
      {
        label: t('agent.suggestions.importUrl'),
        prompt: t('agent.suggestions.importUrlPrompt'),
        autoSend: false
      }
    ];
  }

  private bindStarterClick(
    el: HTMLElement,
    item: StarterItem,
    options: AgentWelcomeViewOptions
  ): void {
    el.addEventListener('click', () => {
      if (item.autoSend) {
        options.onSendPrompt(item.prompt);
      } else {
        options.onFillPrompt(item.prompt);
      }
    });
  }

  private renderFull(options: AgentWelcomeViewOptions): void {
    const headerRow = this.rootEl.createDiv({ cls: 'ofc-agent-welcome-header' });
    const iconBadge = headerRow.createSpan({ cls: 'ofc-agent-welcome-icon' });
    setIcon(iconBadge, 'sparkles');
    headerRow.createEl('h3', {
      cls: 'ofc-agent-welcome-title',
      text: t('agent.welcome.greeting')
    });

    this.rootEl.createEl('p', {
      cls: 'ofc-agent-welcome-subtitle',
      text: t('agent.welcome.subtitle')
    });

    const listEl = this.rootEl.createDiv({ cls: 'ofc-agent-welcome-list' });
    for (const item of this.getFullStarters()) {
      const cardBtn = listEl.createEl('button', {
        cls: 'ofc-agent-welcome-card',
        attr: {
          type: 'button',
          'data-autosend': item.autoSend ? 'true' : 'false'
        }
      });
      cardBtn.createSpan({ text: item.label });
      if (item.placeholder) {
        cardBtn.createSpan({
          cls: 'ofc-agent-welcome-placeholder',
          text: item.placeholder
        });
      }
      this.bindStarterClick(cardBtn, item, options);
    }
  }

  private renderCompact(options: AgentWelcomeViewOptions): void {
    this.rootEl.createDiv({
      cls: 'ofc-agent-welcome-compact-title',
      text: t('agent.welcome.greeting')
    });

    const row = this.rootEl.createDiv({ cls: 'ofc-agent-welcome-compact-row' });
    for (const item of this.getCompactStarters()) {
      const pillBtn = row.createEl('button', {
        cls: 'ofc-agent-pill',
        text: item.label,
        attr: {
          type: 'button',
          'data-autosend': item.autoSend ? 'true' : 'false'
        }
      });
      this.bindStarterClick(pillBtn, item, options);
    }
  }
}
