import { Modal, Setting } from 'obsidian';
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

export function renderApiAccessSettings(
  containerEl: HTMLElement,
  plugin: FullCalendarPlugin,
  onChange: () => void
): void {
  new Setting(containerEl).setName(t('api.settings.title')).setHeading();

  const tokenStore = PluginState.getSettings().apiTokens || {};
  const tokenEntries = Object.entries(tokenStore) as TokenEntry[];

  if (tokenEntries.length === 0) {
    containerEl.createEl('p', {
      text: t('api.settings.noAuthorizedPlugins')
    });
    return;
  }

  const grouped = groupTokensByPlugin(tokenEntries);

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
          .setWarning()
          .onClick(async () => {
            entries.forEach(([token]) => {
              delete tokenStore[token];
            });
            PluginState.getSettings().apiTokens = tokenStore;
            await PluginState.saveSettings();
            onChange();
          });
      });
  });
}
