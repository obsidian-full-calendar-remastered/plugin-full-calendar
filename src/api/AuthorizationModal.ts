import { App, Modal } from 'obsidian';
import { ApiScope } from '../types/settings';
import { getScopeDefinition } from './apiScopes';
import { t } from '../features/i18n/i18n';

export class AuthorizationModal extends Modal {
  private pluginId: string;
  private reason: string;
  private requestedScopes: ApiScope[];
  private grantedScopes: Set<ApiScope>;
  private onResolve: (result: { approved: boolean; grantedScopes: ApiScope[] }) => void;

  constructor(
    app: App,
    pluginId: string,
    reason: string,
    requestedScopes: ApiScope[],
    onResolve: (result: { approved: boolean; grantedScopes: ApiScope[] }) => void
  ) {
    super(app);
    this.pluginId = pluginId;
    this.reason = reason;
    this.requestedScopes = requestedScopes;
    this.grantedScopes = new Set(requestedScopes);
    this.onResolve = onResolve;
  }

  onOpen() {
    const { contentEl, titleEl } = this;
    titleEl.setText(t('api.authorization.title'));

    contentEl.createEl('p', {
      text: t('api.authorization.requestingPluginMessage', { pluginId: this.pluginId })
    });

    contentEl.createEl('p', {
      text: t('api.authorization.reasonLabel', { reason: this.reason }),
      cls: 'ofc-auth-reason'
    });

    contentEl.createEl('p', {
      text: t('api.authorization.permissionsLabel')
    });

    const scopesContainer = contentEl.createDiv({ cls: 'ofc-auth-scopes' });
    const availableScopes: ApiScope[] =
      this.requestedScopes.length > 0 ? this.requestedScopes : ['events:read'];
    let approveBtn: HTMLButtonElement | null = null;
    const updateApproveState = () => {
      if (approveBtn) {
        approveBtn.disabled = this.grantedScopes.size === 0;
      }
    };

    availableScopes.forEach((scope: ApiScope) => {
      const definition = getScopeDefinition(scope);
      const row = scopesContainer.createDiv({ cls: 'ofc-auth-scope-row' });
      const label = definition?.label || scope;
      const description = definition?.description || '';

      if (definition?.risky) {
        row.addClass('is-risky');
      }

      const checkboxLabel = row.createEl('label', { cls: 'ofc-auth-scope-label' });
      const checkbox = checkboxLabel.createEl('input');
      checkbox.setAttribute('type', 'checkbox');
      checkbox.checked = this.grantedScopes.has(scope);
      checkbox.onchange = () => {
        if (checkbox.checked) {
          this.grantedScopes.add(scope);
        } else {
          this.grantedScopes.delete(scope);
        }
        updateApproveState();
      };

      checkboxLabel.createSpan({ text: label });
      if (description) {
        row.createDiv({ cls: 'ofc-auth-scope-desc', text: description });
      }
    });

    const buttonContainer = contentEl.createDiv({ cls: 'ofc-auth-buttons' });

    const denyBtn = buttonContainer.createEl('button', {
      text: t('api.authorization.deny')
    });
    denyBtn.onclick = () => {
      this.onResolve({ approved: false, grantedScopes: [] });
      this.close();
    };

    approveBtn = buttonContainer.createEl('button', {
      text: t('api.authorization.approve'),
      cls: 'mod-cta'
    });

    updateApproveState();

    approveBtn.onclick = () => {
      this.onResolve({
        approved: true,
        grantedScopes: Array.from(this.grantedScopes)
      });
      this.close();
    };
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
