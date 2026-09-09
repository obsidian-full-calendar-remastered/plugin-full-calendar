/**
 * @file renderAgentSettings.ts
 * @brief Settings UI component for Bring-Your-Own-Key (BYOK) agent configuration.
 *
 * @license See LICENSE.md
 */

import { Setting } from 'obsidian';
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

  containerEl.createEl('h3', { text: 'Agentic automations (byok)' });
  containerEl.createEl('p', {
    text: 'Configure your bring-your-own-key (byok) agent for calendar automations. Works with any OpenAI-compatible api endpoint. All write access is strictly gated behind user approval.',
    cls: 'ofc-agent-settings-desc'
  });

  // 1. Enable Agent
  new Setting(containerEl)
    .setName('Enable agent write bar')
    .setDesc('Show the agent automation write bar in the calendar view and enable agent commands.')
    .addToggle(toggle => {
      toggle.setValue(settings.agent.enabled).onChange(async val => {
        settings.agent.enabled = val;
        await PluginState.saveSettings();
      });
    });

  // 2. Preset Selector
  new Setting(containerEl)
    .setName('Api endpoint preset')
    .setDesc('Select a provider preset to populate standard endpoint and model defaults.')
    .addDropdown(dropdown => {
      dropdown.addOption('custom', 'Custom endpoint');
      for (const name of Object.keys(ENDPOINT_PRESETS)) {
        dropdown.addOption(name, name);
      }
      dropdown.setValue('custom');
      dropdown.onChange(async val => {
        if (val !== 'custom' && ENDPOINT_PRESETS[val]) {
          const preset = ENDPOINT_PRESETS[val];
          settings.agent.endpointUrl = preset.endpoint;
          settings.agent.model = preset.defaultModel;
          await PluginState.saveSettings();
          renderAgentSettings(containerEl, plugin, storage, logger, bridge);
        }
      });
    });

  // 3. Endpoint URL
  new Setting(containerEl)
    .setName('Endpoint url')
    .setDesc(
      'OpenAI-compatible base url (e.g. Https://api.OpenAI.com/v1 or http://localhost:11434/v1).'
    )
    .addText(text => {
      text
        .setPlaceholder('Enter endpoint url...')
        .setValue(settings.agent.endpointUrl)
        .onChange(async val => {
          settings.agent.endpointUrl = val.trim();
          await PluginState.saveSettings();
        });
    });

  // 4. Model Name
  new Setting(containerEl)
    .setName('Model name')
    .setDesc('Name of the model to query (e.g. GPT-4o-mini, llama3.1, deepseek-chat).')
    .addText(text => {
      text
        .setPlaceholder('Enter model name...')
        .setValue(settings.agent.model)
        .onChange(async val => {
          settings.agent.model = val.trim();
          await PluginState.saveSettings();
        });
    });

  // 5. API Key (Keychain)
  const currentKey = CredentialStore.getAgentApiKey() || '';
  new Setting(containerEl)
    .setName('Api key')
    .setDesc(
      CredentialStore.isSecretStorageSupported()
        ? 'Stored securely in Obsidian SecretStorage (OS Keychain). Leave blank for local offline LLMs.'
        : 'API Key for the provider. Leave blank for local offline LLMs.'
    )
    .addText(text => {
      text.inputEl.type = 'password';
      text
        .setPlaceholder(currentKey ? '••••••••••••••••' : 'Enter api key...')
        .setValue(currentKey)
        .onChange(val => {
          CredentialStore.setAgentApiKey(val.trim());
        });
    });

  // 6. Test Connection Button
  new Setting(containerEl)
    .setName('Test connection')
    .setDesc('Verify your endpoint and api key with a test ping.')
    .addButton(btn => {
      btn.setButtonText('Test connection');
      btn.onClick(async () => {
        btn.setButtonText('Testing...');
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
        btn.setButtonText('Test connection');

        if (res.success) {
          showNotice(`Connection successful with model: ${res.model}!`);
        } else {
          showNotice(`Connection failed: ${res.message}`);
        }
      });
    });

  // 7. Remote Spec URL & Refresh
  new Setting(containerEl)
    .setName('Agent specification url')
    .setDesc('Raw GitHub Markdown url for the agent prompt and tool schemas.')
    .addText(text => {
      text
        .setPlaceholder('Enter specification url...')
        .setValue(settings.agent.specUrl)
        .onChange(async val => {
          settings.agent.specUrl = val.trim();
          await PluginState.saveSettings();
        });
    })
    .addButton(btn => {
      btn.setButtonText('Refresh spec');
      btn.setTooltip('Re-download the latest agent specification from GitHub docs');
      btn.onClick(async () => {
        btn.setButtonText('Refreshing...');
        btn.setDisabled(true);
        const loader = new SpecLoader(storage, bridge, logger);
        try {
          await loader.loadSpec(true);
          showNotice('Agent specification refreshed and cached!');
        } catch (err) {
          showNotice(`Failed to refresh spec: ${String(err)}`);
        } finally {
          btn.setButtonText('Refresh spec');
          btn.setDisabled(false);
        }
      });
    });

  // 8. Audit Trail & Clear History
  new Setting(containerEl)
    .setName('Diagnostics & privacy')
    .setDesc(
      'Inspect the structured audit trail of all agent interactions, or clear stored chat history.'
    )
    .addButton(btn => {
      btn.setButtonText('View audit trail');
      btn.onClick(() => {
        new AgentAuditModal(plugin.app, logger).open();
      });
    })
    .addButton(btn => {
      btn.setButtonText('Clear history');
      btn.setClass('mod-warning');
      btn.onClick(async () => {
        await storage.clearHistory();
        showNotice('Agent chat history cleared.');
      });
    });
}
