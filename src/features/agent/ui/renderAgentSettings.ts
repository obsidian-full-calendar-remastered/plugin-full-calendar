/**
 * @file renderAgentSettings.ts
 * @brief Settings UI component for Calendar Agent (Managed AI & BYOK) configuration.
 *
 * @license See LICENSE.md
 */

import { Setting, type DropdownComponent, type TextComponent } from 'obsidian';
import type FullCalendarPlugin from '../../../main';
import { PluginState } from '../../../core/PluginState';
import type { AgentMode } from '../../../types/settings';
import { CredentialStore } from '../../credentials/CredentialStore';
import { AgentClient } from '../core/AgentClient';
import {
  AGENT_DOCS_LINKS,
  buildByokClientOptions,
  ensureAgentSettings,
  ensureManagedAgentSettings,
  persistManagedSession
} from '../core/agentSettings';
import { SpecLoader } from '../core/SpecLoader';
import { AgentAuditModal } from './AgentAuditModal';
import { bindAsyncButtonAction } from './uiButtonUtils';
import { showNotice } from '../../../utils/showNotice';
import type { AgentStorage } from '../core/AgentStorage';
import type { AgentAuditLogger } from '../core/AgentAuditLogger';
import type { AgentCalendarBridge } from '../tools/AgentCalendarBridge';
import {
  createManagedAgentSubsystem,
  renderManagedSettingsSection
} from '../infrastructure/managed';
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

function findMatchingPreset(endpoint: string, model: string): string {
  for (const [name, preset] of Object.entries(ENDPOINT_PRESETS)) {
    if (preset.endpoint === endpoint && preset.defaultModel === model) {
      return name;
    }
  }
  return 'custom';
}

function renderByokSettingsSection(
  targetEl: HTMLElement,
  plugin: FullCalendarPlugin,
  logger: AgentAuditLogger
): void {
  targetEl.empty();

  let endpointTextComponent: TextComponent | null = null;
  let modelTextComponent: TextComponent | null = null;
  let presetDropdownComponent: DropdownComponent | null = null;

  const syncPresetDropdown = () => {
    if (presetDropdownComponent) {
      const current = ensureAgentSettings();
      presetDropdownComponent.setValue(findMatchingPreset(current.endpointUrl, current.model));
    }
  };

  // Preset selector
  new Setting(targetEl)
    .setName(t('agent.settings.presetName'))
    .setDesc(t('agent.settings.presetDesc'))
    .addDropdown(dropdown => {
      presetDropdownComponent = dropdown;
      dropdown.addOption('custom', t('agent.settings.customEndpoint'));
      for (const name of Object.keys(ENDPOINT_PRESETS)) {
        dropdown.addOption(name, name);
      }
      dropdown.setValue(
        findMatchingPreset(ensureAgentSettings().endpointUrl, ensureAgentSettings().model)
      );
      dropdown.onChange(async val => {
        if (val !== 'custom' && ENDPOINT_PRESETS[val]) {
          const preset = ENDPOINT_PRESETS[val];
          ensureAgentSettings().endpointUrl = preset.endpoint;
          ensureAgentSettings().model = preset.defaultModel;
          endpointTextComponent?.setValue(preset.endpoint);
          modelTextComponent?.setValue(preset.defaultModel);
          await PluginState.saveSettings();
          plugin.agentManager?.updateSettings();
        }
      });
    });

  // Endpoint URL
  new Setting(targetEl)
    .setName(t('agent.settings.endpointName'))
    .setDesc(t('agent.settings.endpointDesc'))
    .addText(text => {
      endpointTextComponent = text;
      text
        .setPlaceholder(t('agent.settings.endpointPlaceholder'))
        .setValue(ensureAgentSettings().endpointUrl)
        .onChange(async val => {
          ensureAgentSettings().endpointUrl = val.trim();
          await PluginState.saveSettings();
          plugin.agentManager?.updateSettings();
          syncPresetDropdown();
        });
    });

  // Model name
  new Setting(targetEl)
    .setName(t('agent.settings.modelName'))
    .setDesc(t('agent.settings.modelDesc'))
    .addText(text => {
      modelTextComponent = text;
      text
        .setPlaceholder(t('agent.settings.modelPlaceholder'))
        .setValue(ensureAgentSettings().model)
        .onChange(async val => {
          ensureAgentSettings().model = val.trim();
          await PluginState.saveSettings();
          plugin.agentManager?.updateSettings();
          syncPresetDropdown();
        });
    });

  // Optional temperature
  new Setting(targetEl)
    .setName(t('agent.settings.temperatureName'))
    .setDesc(t('agent.settings.temperatureDesc'))
    .addText(text => {
      const currentTemp = ensureAgentSettings().temperature;
      text
        .setPlaceholder(t('agent.settings.temperaturePlaceholder'))
        .setValue(typeof currentTemp === 'number' ? String(currentTemp) : '')
        .onChange(async val => {
          const trimmed = val.trim();
          const parsed = trimmed === '' ? NaN : parseFloat(trimmed);
          if (!Number.isNaN(parsed)) {
            ensureAgentSettings().temperature = parsed;
          } else {
            delete ensureAgentSettings().temperature;
          }
          await PluginState.saveSettings();
          plugin.agentManager?.updateSettings();
        });
    });

  // API key (OS Keychain)
  const currentKey = CredentialStore.getAgentApiKey() || '';
  new Setting(targetEl)
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

  // Test connection
  new Setting(targetEl)
    .setName(t('agent.settings.testBtn'))
    .setDesc(t('agent.settings.testDesc'))
    .addButton(btn => {
      bindAsyncButtonAction(
        btn,
        {
          idleText: t('agent.settings.testBtn'),
          busyText: t('agent.settings.testingBtn'),
          fallbackError: 'Connection test failed.'
        },
        async () => {
          const client = new AgentClient(buildByokClientOptions({ timeoutMs: 15000 }), logger);
          const res = await client.testConnection();
          if (res.success) {
            showNotice(t('agent.settings.testSuccess', { model: res.model || '' }));
          } else {
            showNotice(t('agent.settings.testFail', { message: res.message }));
          }
        }
      );
    });
}

function renderManagedModeSection(targetEl: HTMLElement, plugin: FullCalendarPlugin): void {
  const subsystem =
    plugin.agentManager?.getManagedSubsystem?.() ??
    createManagedAgentSubsystem({
      app: plugin.app,
      getGatewayUrl: () => ensureManagedAgentSettings().gatewayUrl,
      onSessionUpdated: persistManagedSession
    });

  renderManagedSettingsSection(targetEl, {
    app: plugin.app,
    accountService: subsystem.accountService,
    activationService: subsystem.activationService,
    usageService: subsystem.usageService,
    getManagedSettings: ensureManagedAgentSettings,
    saveSettings: async () => {
      await PluginState.saveSettings();
      plugin.agentManager?.updateSettings();
    },
    onStateChanged: () => {
      plugin.agentManager?.updateSettings();
    }
  });
}

function renderSharedDiagnosticsSection(
  containerEl: HTMLElement,
  plugin: FullCalendarPlugin,
  storage: AgentStorage,
  logger: AgentAuditLogger,
  bridge: AgentCalendarBridge
): void {
  // Remote Spec URL & Refresh
  new Setting(containerEl)
    .setName(t('agent.settings.specName'))
    .setDesc(t('agent.settings.specDesc'))
    .addText(text => {
      text
        .setPlaceholder(t('agent.settings.specPlaceholder'))
        .setValue(ensureAgentSettings().specUrl)
        .onChange(async val => {
          ensureAgentSettings().specUrl = val.trim();
          await PluginState.saveSettings();
          plugin.agentManager?.updateSettings();
        });
    })
    .addButton(btn => {
      btn.setTooltip(t('agent.settings.refreshSpecTooltip'));
      bindAsyncButtonAction(
        btn,
        {
          idleText: t('agent.settings.refreshSpecBtn'),
          busyText: t('agent.settings.refreshingSpecBtn'),
          fallbackError: 'Failed to refresh specification.'
        },
        async () => {
          const loader = new SpecLoader(storage, bridge, logger);
          try {
            await loader.loadSpec(true);
            showNotice(t('agent.settings.refreshSpecSuccess'));
          } catch (err) {
            showNotice(t('agent.settings.refreshSpecFail', { error: String(err) }));
          }
        }
      );
    });

  // Audit Trail & Clear History
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
 * Renders the internal Agent settings controls (used inside the common SettingsModal).
 */
export function renderAgentSettingsContent(
  containerEl: HTMLElement,
  plugin: FullCalendarPlugin,
  storage: AgentStorage,
  logger: AgentAuditLogger,
  bridge: AgentCalendarBridge
): void {
  const modeContainerEl = containerEl.createDiv({ cls: 'ofc-agent-mode-settings' });

  const renderSelectedMode = () => {
    const mode: AgentMode = ensureAgentSettings().mode ?? 'managed';
    if (mode === 'managed') {
      renderManagedModeSection(modeContainerEl, plugin);
    } else {
      renderByokSettingsSection(modeContainerEl, plugin, logger);
    }
  };

  new Setting(containerEl)
    .setName('Provider mode')
    .setDesc('Choose between the free trial and managed plans or bring your own key (byok).')
    .addDropdown(dropdown => {
      dropdown.addOption('managed', 'Free trial and managed plans');
      dropdown.addOption('byok', 'Bring your own key (byok)');
      dropdown.setValue(ensureAgentSettings().mode ?? 'managed');
      dropdown.onChange(async val => {
        ensureAgentSettings().mode = val === 'byok' ? 'byok' : 'managed';
        await PluginState.saveSettings();
        plugin.agentManager?.updateSettings();
        renderSelectedMode();
      });
    });

  containerEl.appendChild(modeContainerEl);
  renderSelectedMode();
  renderSharedDiagnosticsSection(containerEl, plugin, storage, logger, bridge);
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
  ensureAgentSettings();

  new Setting(containerEl)
    .setName(t('agent.settings.title'))
    .setDesc(createDescWithDocs(t('agent.settings.description'), AGENT_DOCS_LINKS))
    .addExtraButton(button => {
      button
        .setIcon('gear')
        .setTooltip('Configure agent settings')
        .onClick(() => {
          SettingsModal.open(
            plugin.app,
            {
              title: t('agent.settings.title') || 'Agentic automations',
              docsLinks: AGENT_DOCS_LINKS
            },
            contentEl => {
              renderAgentSettingsContent(contentEl, plugin, storage, logger, bridge);
            }
          );
        });
    });
}
