import { Modal, Setting, App } from 'obsidian';
import { PluginState } from '../../../core/PluginState';
import type FullCalendarPlugin from '../../../main';
import type { ApiScope, ApiTokenRecord } from '../../../types/settings';
import { API_SCOPES, FULL_ACCESS_SCOPE } from '../../../api/apiScopes';
import { t } from '../../../features/i18n/i18n';

type TokenEntry = [string, ApiTokenRecord];

function summarizeScopes(scopes: ApiScope[]): string {
  if (scopes.includes(FULL_ACCESS_SCOPE)) {
    return 'Full control';
  }
  if (scopes.length === 0) {
    return 'No permissions';
  }
  return scopes.join(', ');
}

function groupTokensByPlugin(tokens: TokenEntry[]): Map<string, TokenEntry[]> {
  const grouped = new Map<string, TokenEntry[]>();
  tokens.forEach(entry => {
    const pluginId = entry[1].pluginId;
    if (!grouped.has(pluginId)) {
      grouped.set(pluginId, []);
    }
    grouped.get(pluginId)?.push(entry);
  });
  return grouped;
}

function sanitizeScopes(scopes: ApiScope[]): ApiScope[] {
  if (scopes.includes(FULL_ACCESS_SCOPE)) {
    return [FULL_ACCESS_SCOPE];
  }
  return Array.from(new Set(scopes));
}

class ApiAccessModal extends Modal {
  private pluginId: string;
  private grantedScopes: Set<ApiScope>;
  private onSave: (scopes: ApiScope[]) => void;

  constructor(
    app: FullCalendarPlugin['app'],
    pluginId: string,
    currentScopes: ApiScope[],
    onSave: (scopes: ApiScope[]) => void
  ) {
    super(app);
    this.pluginId = pluginId;
    this.grantedScopes = new Set(currentScopes);
    this.onSave = onSave;
  }

  onOpen() {
    const { contentEl, titleEl } = this;
    titleEl.setText(t('api.settings.title'));

    contentEl.createEl('p', {
      text: t('api.settings.managePermissions', { pluginId: this.pluginId })
    });

    const scopesContainer = contentEl.createDiv({ cls: 'ofc-auth-scopes' });

    API_SCOPES.forEach(scope => {
      const row = scopesContainer.createDiv({ cls: 'ofc-auth-scope-row' });
      if (scope.risky) {
        row.addClass('is-risky');
      }

      const label = row.createEl('label', { cls: 'ofc-auth-scope-label' });
      const checkbox = label.createEl('input');
      checkbox.setAttribute('type', 'checkbox');
      checkbox.checked = this.grantedScopes.has(scope.id);
      checkbox.onchange = () => {
        if (checkbox.checked) {
          this.grantedScopes.add(scope.id);
        } else {
          this.grantedScopes.delete(scope.id);
        }
        updateSaveState();
      };
      label.createSpan({ text: scope.label });
      row.createDiv({ cls: 'ofc-auth-scope-desc', text: scope.description });
    });

    const buttonContainer = contentEl.createDiv({ cls: 'ofc-auth-buttons' });
    const cancelBtn = buttonContainer.createEl('button', { text: t('api.settings.cancel') });
    cancelBtn.onclick = () => this.close();

    const saveBtn = buttonContainer.createEl('button', {
      text: t('api.settings.save'),
      cls: 'mod-cta'
    });
    const updateSaveState = () => {
      saveBtn.disabled = this.grantedScopes.size === 0;
    };
    updateSaveState();

    saveBtn.onclick = () => {
      const nextScopes = sanitizeScopes(Array.from(this.grantedScopes));
      if (nextScopes.length === 0) {
        return;
      }
      this.onSave(nextScopes);
      this.close();
    };
  }

  onClose() {
    this.contentEl.empty();
  }
}

class GeneratePatModal extends Modal {
  private tokenName: string = '';
  private selectedScopes: Set<ApiScope> = new Set();
  private onGenerate: (name: string, scopes: ApiScope[]) => void;

  constructor(app: App, onGenerate: (name: string, scopes: ApiScope[]) => void) {
    super(app);
    this.onGenerate = onGenerate;
  }

  onOpen() {
    const { contentEl, titleEl } = this;
    titleEl.setText(t('api.settings.patModalTitle'));

    contentEl.createEl('p', {
      text: t('api.settings.patModalDesc')
    });

    new Setting(contentEl)
      .setName(t('api.settings.patModalName'))
      .setDesc(t('api.settings.patModalNameDesc'))
      .addText(text => {
        text.onChange(value => {
          this.tokenName = value;
          updateGenerateButton();
        });
      });

    contentEl.createEl('h3', { text: t('api.settings.patModalPermissions') });
    const scopesContainer = contentEl.createDiv({ cls: 'ofc-auth-scopes' });

    API_SCOPES.forEach(scope => {
      const row = scopesContainer.createDiv({ cls: 'ofc-auth-scope-row' });
      if (scope.risky) {
        row.addClass('is-risky');
      }

      const label = row.createEl('label', { cls: 'ofc-auth-scope-label' });
      const checkbox = label.createEl('input');
      checkbox.setAttribute('type', 'checkbox');
      checkbox.checked = false;
      checkbox.onchange = () => {
        if (checkbox.checked) {
          this.selectedScopes.add(scope.id);
        } else {
          this.selectedScopes.delete(scope.id);
        }
        updateGenerateButton();
      };
      label.createSpan({ text: scope.label });
      row.createDiv({ cls: 'ofc-auth-scope-desc', text: scope.description });
    });

    const buttonContainer = contentEl.createDiv({ cls: 'ofc-auth-buttons' });
    const cancelBtn = buttonContainer.createEl('button', {
      text: t('api.settings.patModalCancel')
    });
    cancelBtn.onclick = () => this.close();

    const generateBtn = buttonContainer.createEl('button', {
      text: t('api.settings.patModalGenerate'),
      cls: 'mod-cta'
    });
    generateBtn.disabled = true;

    const updateGenerateButton = () => {
      generateBtn.disabled = !this.tokenName.trim() || this.selectedScopes.size === 0;
    };

    generateBtn.onclick = () => {
      const name = this.tokenName.trim();
      const scopes = Array.from(this.selectedScopes);
      this.close();
      this.onGenerate(name, scopes);
    };
  }

  onClose() {
    this.contentEl.empty();
  }
}

class ShowTokenModal extends Modal {
  private token: string;
  private name: string;

  constructor(app: App, name: string, token: string) {
    super(app);
    this.name = name;
    this.token = token;
  }

  onOpen() {
    const { contentEl, titleEl } = this;
    titleEl.setText(t('api.settings.patSuccessTitle'));

    contentEl.createEl('p', {
      text: t('api.settings.patSuccessDesc', { name: this.name }),
      cls: 'mod-warning'
    });

    const tokenContainer = contentEl.createDiv({ cls: 'ofc-generated-token-container' });

    const tokenInput = tokenContainer.createEl('input', {
      cls: 'ofc-token-display-input'
    });
    tokenInput.value = this.token;
    tokenInput.setAttribute('readonly', 'true');

    const copyBtn = tokenContainer.createEl('button', { text: t('api.settings.patSuccessCopy') });
    copyBtn.onclick = () => {
      void (async () => {
        await navigator.clipboard.writeText(this.token);
        copyBtn.setText(t('api.settings.patSuccessCopied'));
        window.setTimeout(() => copyBtn.setText(t('api.settings.patSuccessCopy')), 2000);
      })();
    };

    const closeBtn = contentEl.createEl('button', {
      text: t('api.settings.patSuccessClose'),
      cls: 'mod-cta'
    });
    closeBtn.onclick = () => this.close();
  }

  onClose() {
    this.contentEl.empty();
  }
}

export function renderApiAccessSettings(
  containerEl: HTMLElement,
  plugin: FullCalendarPlugin,
  onChange: () => void
): void {
  const settings = PluginState.getSettings();

  // --- 1. LOCAL REST SERVER CONFIGURATION ---
  new Setting(containerEl).setName(t('api.settings.serverTitle')).setHeading();

  new Setting(containerEl)
    .setName(t('api.settings.serverEnable'))
    .setDesc(t('api.settings.serverEnableDesc'))
    .addToggle(toggle => {
      toggle.setValue(settings.enableLocalServer).onChange(value => {
        void (async () => {
          PluginState.getSettings().enableLocalServer = value;
          await PluginState.saveSettings();
          onChange();
        })();
      });
    });

  new Setting(containerEl)
    .setName(t('api.settings.serverPort'))
    .setDesc(t('api.settings.serverPortDesc'))
    .addText(text => {
      text
        .setValue(String(settings.localServerPort))
        .setPlaceholder('8540')
        .onChange(value => {
          void (async () => {
            const port = parseInt(value, 10);
            if (!isNaN(port) && port >= 1024 && port <= 65535) {
              PluginState.getSettings().localServerPort = port;
              await PluginState.saveSettings(false);
            }
          })();
        });
    });

  // --- 2. PERSONAL ACCESS TOKENS (PATs) ---
  const patSetting = new Setting(containerEl).setName(t('api.settings.patTitle')).setHeading();

  const tokenStore = settings.apiTokens || {};
  const tokenEntries = Object.entries(tokenStore) as TokenEntry[];

  const pluginTokens = tokenEntries.filter(entry => entry[1].pluginId !== 'personal');
  const personalTokens = tokenEntries.filter(entry => entry[1].pluginId === 'personal');

  patSetting.addButton(btn => {
    btn
      .setButtonText(t('api.settings.patGenerate'))
      .setCta()
      .onClick(() => {
        const modal = new GeneratePatModal(plugin.app, (name, scopes) => {
          void (async () => {
            const token = `ofc_pat_${crypto.randomUUID()}`;
            tokenStore[token] = {
              pluginId: 'personal',
              reason: name,
              requestedScopes: scopes,
              grantedScopes: scopes,
              grantedAt: Date.now()
            };
            settings.apiTokens = tokenStore;
            await PluginState.saveSettings();
            onChange();

            const showModal = new ShowTokenModal(plugin.app, name, token);
            showModal.open();
          })();
        });
        modal.open();
      });
  });

  if (personalTokens.length === 0) {
    containerEl.createEl('p', {
      text: t('api.settings.patNone'),
      cls: 'setting-item-description'
    });
  } else {
    personalTokens.forEach(([token, record]) => {
      const scopeSummary = summarizeScopes(record.grantedScopes);
      const createdStr = new Date(record.grantedAt).toLocaleDateString();
      const lastUsedStr = record.lastUsedAt
        ? new Date(record.lastUsedAt).toLocaleString()
        : t('api.settings.patNeverUsed');

      const desc = [
        t('api.settings.patScopes', { scopes: scopeSummary }),
        t('api.settings.patCreated', { date: createdStr }),
        t('api.settings.patLastUsed', { date: lastUsedStr })
      ].join(' · ');

      new Setting(containerEl)
        .setName(record.reason)
        .setDesc(desc)
        .addButton(btn => {
          btn
            .setButtonText(t('api.settings.revoke'))
            .setClass('mod-warning')
            .onClick(() => {
              void (async () => {
                delete tokenStore[token];
                PluginState.getSettings().apiTokens = tokenStore;
                await PluginState.saveSettings();
                onChange();
              })();
            });
        });
    });
  }

  // --- 3. AUTHORIZED PLUGINS ---
  new Setting(containerEl).setName(t('api.settings.title')).setHeading();

  if (pluginTokens.length === 0) {
    containerEl.createEl('p', {
      text: t('api.settings.noAuthorizedPlugins')
    });
    return;
  }

  const grouped = groupTokensByPlugin(pluginTokens);

  grouped.forEach((entries, pluginId) => {
    const grantedScopes = sanitizeScopes(entries.flatMap(entry => entry[1].grantedScopes || []));
    const reasons = Array.from(new Set(entries.map(entry => entry[1].reason).filter(Boolean)));
    const reasonSummary = reasons.length > 0 ? `Reason: ${reasons.join('; ')}` : '';
    const scopeSummary = summarizeScopes(grantedScopes);

    new Setting(containerEl)
      .setName(pluginId)
      .setDesc([scopeSummary, reasonSummary].filter(Boolean).join(' · '))
      .addButton(btn => {
        btn.setButtonText(t('api.settings.editAccess')).onClick(() => {
          const modal = new ApiAccessModal(plugin.app, pluginId, grantedScopes, scopes => {
            entries.forEach(([token, record]) => {
              tokenStore[token] = {
                ...record,
                grantedScopes: scopes
              };
            });
            PluginState.getSettings().apiTokens = tokenStore;
            void PluginState.saveSettings();
            onChange();
          });
          modal.open();
        });
      })
      .addButton(btn => {
        btn
          .setButtonText(t('api.settings.revoke'))
          .setClass('mod-warning')
          .onClick(() => {
            void (async () => {
              entries.forEach(([token]) => {
                delete tokenStore[token];
              });
              PluginState.getSettings().apiTokens = tokenStore;
              await PluginState.saveSettings();
              onChange();
            })();
          });
      });
  });
}
