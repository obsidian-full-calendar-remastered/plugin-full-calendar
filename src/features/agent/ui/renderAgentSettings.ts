/**
 * @file renderAgentSettings.ts
 * @brief Settings UI component for Bring-Your-Own-Key (BYOK) agent configuration.
 *
 * @license See LICENSE.md
 */

import { Setting, type DropdownComponent, type TextComponent } from 'obsidian';
import type FullCalendarPlugin from '../../../main';
import { PluginState } from '../../../core/PluginState';
import { CredentialStore } from '../../credentials/CredentialStore';
import { AgentClient } from '../core/AgentClient';
import { SpecLoader } from '../core/SpecLoader';
import { AgentAuditModal } from './AgentAuditModal';
import { showNotice } from '../../../utils/showNotice';
import type { AgentStorage } from '../core/AgentStorage';
import type { AgentAuditLogger } from '../core/AgentAuditLogger';
import type { AgentCalendarBridge } from '../tools/AgentCalendarBridge';
import { t } from '../../i18n/i18n';

const ENDPOINT_PRESETS: Record<string, { endpoint: string; defaultModel: string }> = {
  OpenAI: { endpoint: 'https://api.openai.com/v1', defaultModel: 'gpt-4o-mini' },
  OpenRouter: { endpoint: 'https://openrouter.ai/api/v1', defaultModel: 'openai/gpt-4o-mini' },
  Groq: { endpoint: 'https://api.groq.com/openai/v1', defaultModel: 'llama-3.3-70b-versatile' },
  DeepSeek: { endpoint: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-chat' },
  'Ollama (Local)': { endpoint: 'http://localhost:11434/v1', defaultModel: 'llama3.1' },
  'LM Studio (Local)': { endpoint: 'http://localhost:1234/v1', defaultModel: 'default' }
};

export function renderAgentSettings(
  containerEl: HTMLElement,
  plugin: FullCalendarPlugin,
  storage: AgentStorage,
  logger: AgentAuditLogger,
  bridge: AgentCalendarBridge
): void {
  const settings = PluginState.getSettings();
  if (!settings.agent) {
    settings.agent = {
      enabled: true,
      endpointUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      temperature: 0.2,
      specUrl:
        'https://raw.githubusercontent.com/obsidian-full-calendar-remastered/plugin-full-calendar/main/docs/architecture/api/agent-spec.md',
      maxRetries: 3,
      timeoutMs: 60000
    };
  }

  containerEl.createEl('h3', { text: t('agent.settings.title') });
  containerEl.createEl('p', {
    text: t('agent.settings.description'),
    cls: 'ofc-agent-settings-desc'
  });

  let endpointTextComponent: TextComponent | null = null;
  let modelTextComponent: TextComponent | null = null;
  let presetDropdownComponent: DropdownComponent | null = null;

  const findMatchingPreset = (endpoint: string, model: string): string => {
    for (const [name, preset] of Object.entries(ENDPOINT_PRESETS)) {
      if (preset.endpoint === endpoint && preset.defaultModel === model) {
        return name;
      }
    }
    return 'custom';
  };

  const syncPresetDropdown = () => {
    if (presetDropdownComponent) {
      const matched = findMatchingPreset(settings.agent.endpointUrl, settings.agent.model);
      presetDropdownComponent.setValue(matched);
    }
  };

  // 1. Enable Agent
  new Setting(containerEl)
    .setName(t('agent.settings.enableName'))
    .setDesc(t('agent.settings.enableDesc'))
    .addToggle(toggle => {
      toggle.setValue(settings.agent.enabled).onChange(async val => {
        settings.agent.enabled = val;
        await PluginState.saveSettings();
        plugin.agentManager?.updateSettings();
      });
    });

  // 2. Preset Selector
  new Setting(containerEl)
    .setName(t('agent.settings.presetName'))
    .setDesc(t('agent.settings.presetDesc'))
    .addDropdown(dropdown => {
      presetDropdownComponent = dropdown;
      dropdown.addOption('custom', t('agent.settings.customEndpoint'));
      for (const name of Object.keys(ENDPOINT_PRESETS)) {
        dropdown.addOption(name, name);
      }
      dropdown.setValue(findMatchingPreset(settings.agent.endpointUrl, settings.agent.model));
      dropdown.onChange(async val => {
        if (val !== 'custom' && ENDPOINT_PRESETS[val]) {
          const preset = ENDPOINT_PRESETS[val];
          settings.agent.endpointUrl = preset.endpoint;
          settings.agent.model = preset.defaultModel;
          endpointTextComponent?.setValue(preset.endpoint);
          modelTextComponent?.setValue(preset.defaultModel);
          await PluginState.saveSettings();
          plugin.agentManager?.updateSettings();
        }
      });
    });

  // 3. Endpoint URL
  new Setting(containerEl)
    .setName(t('agent.settings.endpointName'))
    .setDesc(t('agent.settings.endpointDesc'))
    .addText(text => {
      endpointTextComponent = text;
      text
        .setPlaceholder(t('agent.settings.endpointPlaceholder'))
        .setValue(settings.agent.endpointUrl)
        .onChange(async val => {
          settings.agent.endpointUrl = val.trim();
          await PluginState.saveSettings();
          plugin.agentManager?.updateSettings();
          syncPresetDropdown();
        });
    });

  // 4. Model Name
  new Setting(containerEl)
    .setName(t('agent.settings.modelName'))
    .setDesc(t('agent.settings.modelDesc'))
    .addText(text => {
      modelTextComponent = text;
      text
        .setPlaceholder(t('agent.settings.modelPlaceholder'))
        .setValue(settings.agent.model)
        .onChange(async val => {
          settings.agent.model = val.trim();
          await PluginState.saveSettings();
          plugin.agentManager?.updateSettings();
          syncPresetDropdown();
        });
    });

  // 5. API Key (Keychain)
  const currentKey = CredentialStore.getAgentApiKey() || '';
  new Setting(containerEl)
    .setName(t('agent.settings.apiKeyName'))
    .setDesc(
      CredentialStore.isSecretStorageSupported()
        ? t('agent.settings.apiKeySecretDesc')
        : t('agent.settings.apiKeyPlainDesc')
    )
    .addText(text => {
      text.inputEl.type = 'password';
      text
        .setPlaceholder(currentKey ? '••••••••••••••••' : t('agent.settings.apiKeyPlaceholder'))
        .setValue(currentKey)
        .onChange(async val => {
          CredentialStore.setAgentApiKey(val.trim());
          await PluginState.saveSettings();
          plugin.agentManager?.updateSettings();
        });
    });

  // 6. Test Connection Button
  new Setting(containerEl)
    .setName(t('agent.settings.testBtn'))
    .setDesc(t('agent.settings.testDesc'))
    .addButton(btn => {
      btn.setButtonText(t('agent.settings.testBtn'));
      btn.onClick(async () => {
        btn.setButtonText(t('agent.settings.testingBtn'));
        btn.setDisabled(true);

        const client = new AgentClient(
          {
            endpointUrl: settings.agent.endpointUrl,
            apiKey: CredentialStore.getAgentApiKey() || '',
            model: settings.agent.model,
            timeoutMs: 15000
          },
          logger
        );

        const res = await client.testConnection();
        btn.setDisabled(false);
        btn.setButtonText(t('agent.settings.testBtn'));

        if (res.success) {
          showNotice(t('agent.settings.testSuccess', { model: res.model || '' }));
        } else {
          showNotice(t('agent.settings.testFail', { message: res.message }));
        }
      });
    });

  // 7. Remote Spec URL & Refresh
  new Setting(containerEl)
    .setName(t('agent.settings.specName'))
    .setDesc(t('agent.settings.specDesc'))
    .addText(text => {
      text
        .setPlaceholder(t('agent.settings.specPlaceholder'))
        .setValue(settings.agent.specUrl)
        .onChange(async val => {
          settings.agent.specUrl = val.trim();
          await PluginState.saveSettings();
          plugin.agentManager?.updateSettings();
        });
    })
    .addButton(btn => {
      btn.setButtonText(t('agent.settings.refreshSpecBtn'));
      btn.setTooltip(t('agent.settings.refreshSpecTooltip'));
      btn.onClick(async () => {
        btn.setButtonText(t('agent.settings.refreshingSpecBtn'));
        btn.setDisabled(true);
        const loader = new SpecLoader(storage, bridge, logger);
        try {
          await loader.loadSpec(true);
          showNotice(t('agent.settings.refreshSpecSuccess'));
        } catch (err) {
          showNotice(t('agent.settings.refreshSpecFail', { error: String(err) }));
        } finally {
          btn.setButtonText(t('agent.settings.refreshSpecBtn'));
          btn.setDisabled(false);
        }
      });
    });

  // 8. Audit Trail & Clear History
  new Setting(containerEl)
    .setName(t('agent.settings.diagnosticsName'))
    .setDesc(t('agent.settings.diagnosticsDesc'))
    .addButton(btn => {
      btn.setButtonText(t('agent.settings.viewAuditTrailBtn'));
      btn.onClick(() => {
        new AgentAuditModal(plugin.app, logger).open();
      });
    })
    .addButton(btn => {
      btn.setButtonText(t('agent.settings.clearHistoryBtn'));
      btn.setClass('mod-warning');
      btn.onClick(async () => {
        await storage.clearHistory();
        showNotice(t('agent.settings.historyClearedNotice'));
      });
    });
}
