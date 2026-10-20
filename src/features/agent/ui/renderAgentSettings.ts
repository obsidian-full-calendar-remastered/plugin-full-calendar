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
import { createDescWithDocs } from '../../../ui/settings/docsLinks';
import { SettingsModal } from '../../../ui/modals/SettingsModal';

const ENDPOINT_PRESETS: Record<string, { endpoint: string; defaultModel: string }> = {
  OpenAI: { endpoint: 'https://api.openai.com/v1', defaultModel: 'gpt-4o-mini' },
  OpenRouter: { endpoint: 'https://openrouter.ai/api/v1', defaultModel: 'openai/gpt-4o-mini' },
  Groq: { endpoint: 'https://api.groq.com/openai/v1', defaultModel: 'llama-3.3-70b-versatile' },
  DeepSeek: { endpoint: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-chat' },
  'Ollama (Local)': { endpoint: 'http://localhost:11434/v1', defaultModel: 'llama3.1' },
  'LM Studio (Local)': { endpoint: 'http://localhost:1234/v1', defaultModel: 'default' }
};

/**
 * Renders the internal Agent settings controls (used inside the common SettingsModal).
 */
export function renderAgentSettingsContent(
  containerEl: HTMLElement,
  plugin: FullCalendarPlugin,
  storage: AgentStorage,
  logger: AgentAuditLogger,
  bridge: AgentCalendarBridge
): void {
  const getAgentSettings = () => {
    const s = PluginState.getSettings();
    if (!s.agent) {
      s.agent = {
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
    return s.agent;
  };

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
      const current = getAgentSettings();
      const matched = findMatchingPreset(current.endpointUrl, current.model);
      presetDropdownComponent.setValue(matched);
    }
  };

  // 1. Enable Agent
  new Setting(containerEl)
    .setName(t('agent.settings.enableName'))
    .setDesc(t('agent.settings.enableDesc'))
    .addToggle(toggle => {
      toggle.setValue(getAgentSettings().enabled).onChange(async val => {
        getAgentSettings().enabled = val;
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
      dropdown.setValue(
        findMatchingPreset(getAgentSettings().endpointUrl, getAgentSettings().model)
      );
      dropdown.onChange(async val => {
        if (val !== 'custom' && ENDPOINT_PRESETS[val]) {
          const preset = ENDPOINT_PRESETS[val];
          getAgentSettings().endpointUrl = preset.endpoint;
          getAgentSettings().model = preset.defaultModel;
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
        .setValue(getAgentSettings().endpointUrl)
        .onChange(async val => {
          getAgentSettings().endpointUrl = val.trim();
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
        .setValue(getAgentSettings().model)
        .onChange(async val => {
          getAgentSettings().model = val.trim();
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

        const currentAgent = getAgentSettings();
        const client = new AgentClient(
          {
            endpointUrl: currentAgent.endpointUrl,
            apiKey: CredentialStore.getAgentApiKey() || currentAgent.apiKey || '',
            model: currentAgent.model,
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
        .setValue(getAgentSettings().specUrl)
        .onChange(async val => {
          getAgentSettings().specUrl = val.trim();
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

/**
 * Renders the consolidated Agent integration setting row with gear button.
 */
export function renderAgentSettings(
  containerEl: HTMLElement,
  plugin: FullCalendarPlugin,
  storage: AgentStorage,
  logger: AgentAuditLogger,
  bridge: AgentCalendarBridge
): void {
  const getAgentSettings = () => {
    const s = PluginState.getSettings();
    if (!s.agent) {
      s.agent = {
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
    return s.agent;
  };

  const agentSettings = getAgentSettings();

  new Setting(containerEl)
    .setName(t('agent.settings.title'))
    .setDesc(
      createDescWithDocs(t('agent.settings.description'), [
        { text: 'Full Calendar Agent guide', path: 'user/features/agent' },
        { text: 'Agent architecture spec', path: 'architecture/api/agent-spec' },
        { text: 'Troubleshooting', path: 'user/guides/troubleshooting' }
      ])
    )
    .addToggle(toggle => {
      toggle.setValue(agentSettings.enabled).onChange(async val => {
        agentSettings.enabled = val;
        await PluginState.saveSettings();
        plugin.agentManager?.updateSettings();
      });
    })
    .addExtraButton(button => {
      button
        .setIcon('gear')
        .setTooltip('Configure agent settings')
        .onClick(() => {
          SettingsModal.open(
            plugin.app,
            {
              title: t('agent.settings.title') || 'Agentic automations (byok)',
              docsLinks: [
                { text: 'Full Calendar Agent guide', path: 'user/features/agent' },
                { text: 'Agent architecture spec', path: 'architecture/api/agent-spec' },
                { text: 'Troubleshooting', path: 'user/guides/troubleshooting' }
              ]
            },
            contentEl => {
              renderAgentSettingsContent(contentEl, plugin, storage, logger, bridge);
            }
          );
        });
    });
}
