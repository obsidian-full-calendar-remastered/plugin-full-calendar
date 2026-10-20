/**
 * @jest-environment jsdom
 */

// Polyfill Obsidian globals for JSDOM
const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
if (!proto.empty) {
  proto.empty = function (this: HTMLElement) {
    this.innerHTML = '';
  };
}
if (!proto.setText) {
  proto.setText = function (this: HTMLElement, text: string) {
    this.textContent = text;
  };
}
if (!proto.addClass) {
  proto.addClass = function (this: HTMLElement, cls: string) {
    this.classList.add(cls);
  };
}
if (!proto.createEl) {
  proto.createEl = function (
    this: HTMLElement,
    tag: string,
    options?: { text?: string; cls?: string; href?: string; attr?: Record<string, unknown> }
  ) {
    const el = document.createElement(tag);
    if (options?.text) el.textContent = options.text;
    if (options?.cls) el.className = options.cls;
    if (options?.href) el.setAttribute('href', options.href);
    if (options?.attr) {
      for (const [k, v] of Object.entries(options.attr)) {
        el.setAttribute(k, String(v));
      }
    }
    this.appendChild(el);
    return el;
  };
}
if (!proto.createDiv) {
  proto.createDiv = function (this: HTMLElement, options?: { cls?: string; text?: string }) {
    return (this as unknown as { createEl: (tag: string, opts?: unknown) => HTMLElement }).createEl(
      'div',
      options
    );
  };
}
if (!proto.createSpan) {
  proto.createSpan = function (this: HTMLElement, options?: { cls?: string; text?: string }) {
    return (this as unknown as { createEl: (tag: string, opts?: unknown) => HTMLElement }).createEl(
      'span',
      options
    );
  };
}
if (!proto.setCssProps) {
  proto.setCssProps = function (this: HTMLElement, props: Record<string, string>) {
    Object.assign(this.style, props);
  };
}

const targetWindow = window as unknown as Record<string, unknown>;
if (!targetWindow.createFragment) {
  targetWindow.createFragment = () => document.createDocumentFragment();
}
if (!targetWindow.createDiv) {
  targetWindow.createDiv = (options?: { cls?: string; text?: string }) => {
    const div = document.createElement('div');
    if (options?.cls) div.className = options.cls;
    if (options?.text) div.textContent = options.text;
    return div;
  };
}
if (!targetWindow.createEl) {
  targetWindow.createEl = (
    tag: string,
    options?: { cls?: string; text?: string; href?: string; attr?: Record<string, unknown> }
  ) => {
    const el = document.createElement(tag);
    if (options?.cls) el.className = options.cls;
    if (options?.text) el.textContent = options.text;
    if (options?.href) el.setAttribute('href', options.href);
    if (options?.attr) {
      for (const [k, v] of Object.entries(options.attr)) {
        el.setAttribute(k, String(v));
      }
    }
    return el;
  };
}

jest.mock('obsidian', () => {
  class MockModal {
    contentEl: HTMLElement;
    titleEl: HTMLElement;
    modalEl: HTMLElement;
    constructor(public app: unknown) {
      this.modalEl = document.createElement('div');
      this.contentEl = document.createElement('div');
      this.titleEl = document.createElement('div');
      this.modalEl.appendChild(this.titleEl);
      this.modalEl.appendChild(this.contentEl);
    }
    open() {
      this.onOpen();
    }
    close() {
      this.onClose();
    }
    onOpen() {}
    onClose() {}
  }

  class MockSetting {
    settingEl: HTMLElement;
    descEl: HTMLElement;
    nameEl: HTMLElement;
    controlEl: HTMLElement;

    constructor(public containerEl: HTMLElement) {
      this.settingEl = document.createElement('div');
      this.settingEl.className = 'setting-item';
      this.containerEl.appendChild(this.settingEl);

      this.nameEl = document.createElement('div');
      this.nameEl.className = 'setting-item-name';
      this.settingEl.appendChild(this.nameEl);

      this.descEl = document.createElement('div');
      this.descEl.className = 'setting-item-description';
      this.settingEl.appendChild(this.descEl);

      this.controlEl = document.createElement('div');
      this.controlEl.className = 'setting-item-control';
      this.settingEl.appendChild(this.controlEl);
    }

    setName(name: string) {
      this.nameEl.textContent = name;
      return this;
    }

    setDesc(desc: unknown) {
      if (typeof desc === 'string') {
        this.descEl.textContent = desc;
      } else if (desc instanceof Node) {
        this.descEl.appendChild(desc);
      }
      return this;
    }

    setHeading() {
      this.settingEl.classList.add('setting-item-heading');
      return this;
    }

    addToggle(cb: (t: unknown) => unknown) {
      const toggleEl = document.createElement('div');
      toggleEl.className = 'checkbox-container';
      this.controlEl.appendChild(toggleEl);
      const toggle = {
        setValue: () => toggle,
        onChange: () => toggle
      };
      cb(toggle);
      return this;
    }

    addText(cb: (t: unknown) => unknown) {
      const inputEl = document.createElement('input');
      inputEl.type = 'text';
      this.controlEl.appendChild(inputEl);
      const text = {
        inputEl,
        setValue: (val: string) => {
          inputEl.value = val;
          return text;
        },
        setPlaceholder: (val: string) => {
          inputEl.placeholder = val;
          return text;
        },
        onChange: () => text
      };
      cb(text);
      return this;
    }

    addButton(cb: (b: unknown) => unknown) {
      const btn = document.createElement('button');
      this.controlEl.appendChild(btn);
      const button = {
        buttonEl: btn,
        setButtonText: (t: string) => {
          btn.textContent = t;
          return button;
        },
        setClass: (cls: string) => {
          btn.classList.add(cls);
          return button;
        },
        setCta: () => {
          btn.classList.add('mod-cta');
          return button;
        },
        setDisabled: (d: boolean) => {
          btn.disabled = d;
          return button;
        },
        setTooltip: (t: string) => {
          btn.title = t;
          return button;
        },
        onClick: (fn: (e: MouseEvent) => unknown) => {
          btn.onclick = (e: MouseEvent) => {
            fn(e);
          };
          return button;
        }
      };
      cb(button);
      return this;
    }

    addTextArea(cb: (t: unknown) => unknown) {
      const area = document.createElement('textarea');
      this.controlEl.appendChild(area);
      const text = {
        inputEl: area,
        setPlaceholder: () => text,
        setValue: () => text,
        onChange: () => text
      };
      cb(text);
      return this;
    }

    addDropdown(cb: (d: unknown) => unknown) {
      const select = document.createElement('select');
      this.controlEl.appendChild(select);
      const dropdown = {
        addOption: (val: string, label: string) => {
          const opt = document.createElement('option');
          opt.value = val;
          opt.textContent = label;
          select.appendChild(opt);
          return dropdown;
        },
        setValue: () => dropdown,
        onChange: () => dropdown
      };
      cb(dropdown);
      return this;
    }

    addExtraButton(cb: (b: unknown) => unknown) {
      const btnEl = document.createElement('div');
      btnEl.className = 'clickable-icon extra-setting-button';
      this.controlEl.appendChild(btnEl);
      const button = {
        setTooltip: (t: string) => {
          btnEl.title = t;
          return button;
        },
        setIcon: (icon: string) => {
          btnEl.dataset.icon = icon;
          return button;
        },
        onClick: (fn: (e: MouseEvent) => unknown) => {
          btnEl.onclick = (e: MouseEvent) => {
            fn(e);
          };
          return button;
        }
      };
      cb(button);
      return this;
    }
  }

  return {
    Modal: MockModal,
    Setting: MockSetting,
    App: class {},
    Notice: class {},
    PluginSettingTab: class {
      constructor(
        public app: unknown,
        public plugin: unknown
      ) {}
    },
    TFolder: class {},
    TFile: class {},
    normalizePath: (p: string) => p,
    getLanguage: () => 'en',
    requestUrl: jest.fn()
  };
});

import {
  renderGoogleSettings,
  renderGoogleSettingsContent
} from '../../providers/google/ui/renderGoogle';
import {
  renderOutlookSettings,
  renderOutlookSettingsContent
} from '../../providers/outlook/ui/renderOutlook';
import {
  renderFcrReminderSettings,
  renderFcrReminderSettingsContent
} from '../../features/fcr_reminder/ui/renderFcrReminder';
import {
  renderApiAccessSettings,
  renderApiAccessSettingsContent
} from './sections/renderApiAccess';
import { renderCredentialsSettings } from '../../features/credentials/ui/renderCredentialsSettings';
import {
  renderAgentSettings,
  renderAgentSettingsContent
} from '../../features/agent/ui/renderAgentSettings';
import { renderLinkedNotesSettingsContent } from './sections/renderCalendars';
import { SettingsModal } from '../modals/SettingsModal';
import { PluginState } from '../../core/PluginState';
import FullCalendarPlugin from '../../main';

describe('Settings Integrations Section - Common SettingsModal & DRY Principles', () => {
  let mockPlugin: FullCalendarPlugin;
  let containerEl: HTMLElement;

  beforeEach(() => {
    containerEl = document.createElement('div');

    mockPlugin = {
      app: {
        workspace: {
          on: jest.fn(),
          offref: jest.fn()
        },
        vault: {
          getAllLoadedFiles: jest.fn().mockReturnValue([]),
          getMarkdownFiles: jest.fn().mockReturnValue([])
        }
      },
      agentManager: {
        updateSettings: jest.fn()
      },
      fcrReminderManager: {
        getCompanionSettings: jest.fn().mockReturnValue({
          enabled: true,
          apiUrl: 'http://127.0.0.1:45677'
        }),
        checkDaemonStatus: jest.fn().mockResolvedValue(true)
      }
    } as unknown as FullCalendarPlugin;

    PluginState.setSettings({
      googleUseCopyPasteAuth: false,
      useCustomGoogleClient: false,
      googleClientId: '',
      googleClientSecret: '',
      googleAccounts: [{ id: 'acc_1', email: 'test@gmail.com' }],
      useCustomMicrosoftClient: false,
      microsoftClientId: '',
      microsoftProxyBaseUrl: '',
      microsoftAccounts: [{ id: 'ms_1', email: 'test@outlook.com' }],
      fcrReminderCompanion: {
        enabled: true,
        apiUrl: 'http://127.0.0.1:45677'
      },
      enableLocalServer: true,
      localServerPort: 8540,
      apiTokens: {
        ofc_pat_123: {
          pluginId: 'personal',
          reason: 'TestToken',
          requestedScopes: ['events:read'],
          grantedScopes: ['events:read'],
          grantedAt: Date.now()
        }
      },
      useLegacyPlaintextCredentials: false,
      agent: {
        enabled: true,
        endpointUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o-mini',
        temperature: 0.2,
        specUrl: 'https://example.com/spec.md',
        maxRetries: 3,
        timeoutMs: 60000
      }
    } as unknown as Parameters<typeof PluginState.setSettings>[0]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Common SettingsModal reusable component', () => {
    it('manages title, documentation links, lifecycle, and modular content rendering', () => {
      const renderFn = jest.fn((contentEl: HTMLElement) => {
        contentEl.createDiv({ text: 'Inner Content' });
      });

      const modal = SettingsModal.open(
        mockPlugin.app,
        {
          title: 'Test Integration Modal',
          docsLinks: [{ text: 'Docs Link', path: 'user/features/api' }]
        },
        renderFn
      );

      expect(modal.titleEl.textContent).toBe('Test Integration Modal');
      expect(renderFn).toHaveBeenCalled();
      expect(modal.contentEl.textContent).toContain('Inner Content');
      expect(modal.contentEl.querySelector('a.ofc-doc-link')).not.toBeNull();

      modal.close();
      expect(modal.contentEl.innerHTML).toBe('');
    });
  });

  describe('Google Accounts row & reusable modal', () => {
    it('renders a consolidated row with documentation and gear button that opens common SettingsModal', () => {
      const openSpy = jest.spyOn(SettingsModal, 'open');
      const rerender = jest.fn();

      renderGoogleSettings(containerEl, mockPlugin, rerender);

      const settingItem = containerEl.querySelector('.setting-item');
      expect(settingItem).not.toBeNull();

      // Check documentation links exist
      const links = containerEl.querySelectorAll('a.ofc-doc-link');
      expect(links.length).toBeGreaterThan(0);
      const linkHrefs = Array.from(links).map(l => l.getAttribute('href'));
      expect(linkHrefs.some(href => href?.includes('user/calendars/gcal'))).toBe(true);

      // Check gear extra button
      const gearBtn = containerEl.querySelector('.clickable-icon');
      expect(gearBtn).not.toBeNull();

      // Clicking gear opens common SettingsModal
      (gearBtn as HTMLElement)?.click();
      expect(openSpy).toHaveBeenCalled();
      expect(openSpy.mock.calls[0][1].title).toBeDefined();
    });

    it('renders Google content cleanly with accounts and toggles', () => {
      const modalContent = document.createElement('div');
      renderGoogleSettingsContent(modalContent, mockPlugin, jest.fn());

      expect(modalContent.textContent).toContain('test@gmail.com');
      expect(modalContent.querySelector('.checkbox-container')).not.toBeNull();
    });
  });

  describe('Outlook Accounts row & reusable modal', () => {
    it('renders a consolidated row with documentation and gear button that opens common SettingsModal', () => {
      const openSpy = jest.spyOn(SettingsModal, 'open');
      const rerender = jest.fn();

      renderOutlookSettings(containerEl, mockPlugin, rerender);

      const settingItem = containerEl.querySelector('.setting-item');
      expect(settingItem).not.toBeNull();

      const links = containerEl.querySelectorAll('a.ofc-doc-link');
      expect(links.length).toBeGreaterThan(0);
      const linkHrefs = Array.from(links).map(l => l.getAttribute('href'));
      expect(linkHrefs.some(href => href?.includes('user/calendars/outlook'))).toBe(true);

      const gearBtn = containerEl.querySelector('.clickable-icon');
      expect(gearBtn).not.toBeNull();

      (gearBtn as HTMLElement)?.click();
      expect(openSpy).toHaveBeenCalled();
    });

    it('renders Outlook content cleanly with accounts and toggles', () => {
      const modalContent = document.createElement('div');
      renderOutlookSettingsContent(modalContent, mockPlugin, jest.fn());

      expect(modalContent.textContent).toContain('test@outlook.com');
    });
  });

  describe('FCR Reminder row & reusable modal', () => {
    it('renders a consolidated row with documentation, toggle, and gear button that opens common SettingsModal', () => {
      const openSpy = jest.spyOn(SettingsModal, 'open');
      const rerender = jest.fn();

      renderFcrReminderSettings(containerEl, mockPlugin, rerender);

      const settingItem = containerEl.querySelector('.setting-item');
      expect(settingItem).not.toBeNull();

      const links = containerEl.querySelectorAll('a.ofc-doc-link');
      expect(links.length).toBeGreaterThan(0);
      const linkHrefs = Array.from(links).map(l => l.getAttribute('href'));
      expect(linkHrefs.some(href => href?.includes('user/features/fcr-reminder'))).toBe(true);

      // Check toggle exists
      const toggle = containerEl.querySelector('.checkbox-container');
      expect(toggle).not.toBeNull();

      // Check gear extra button
      const gearBtn = containerEl.querySelector('.clickable-icon');
      expect(gearBtn).not.toBeNull();

      (gearBtn as HTMLElement)?.click();
      expect(openSpy).toHaveBeenCalled();
    });

    it('renders FCR Reminder content cleanly with inputs and warning banner', () => {
      const modalContent = document.createElement('div');
      renderFcrReminderSettingsContent(modalContent, mockPlugin, jest.fn());

      expect(modalContent.querySelector('input[type="text"]')).not.toBeNull();
    });
  });

  describe('API Access / Local Server & PAT row & reusable modal', () => {
    it('renders a consolidated row with documentation, toggle, and gear button that opens common SettingsModal', () => {
      const openSpy = jest.spyOn(SettingsModal, 'open');
      const onChange = jest.fn();

      renderApiAccessSettings(containerEl, mockPlugin, onChange);

      const settingItem = containerEl.querySelector('.setting-item');
      expect(settingItem).not.toBeNull();

      // Documentation links must be present
      const links = containerEl.querySelectorAll('a.ofc-doc-link');
      expect(links.length).toBeGreaterThan(0);
      const linkHrefs = Array.from(links).map(l => l.getAttribute('href'));
      expect(linkHrefs.some(href => href?.includes('user/features/api'))).toBe(true);
      expect(linkHrefs.some(href => href?.includes('user/settings/api'))).toBe(true);

      // Check quick toggle
      const toggle = containerEl.querySelector('.checkbox-container');
      expect(toggle).not.toBeNull();

      // Check gear extra button
      const gearBtn = containerEl.querySelector('.clickable-icon');
      expect(gearBtn).not.toBeNull();

      (gearBtn as HTMLElement)?.click();
      expect(openSpy).toHaveBeenCalled();
    });

    it('renders API Access content cleanly with Local Server and PAT documentation links', () => {
      const modalContent = document.createElement('div');
      renderApiAccessSettingsContent(modalContent, mockPlugin, jest.fn());

      const docsInModal = modalContent.querySelectorAll('a.ofc-doc-link');
      expect(docsInModal.length).toBeGreaterThan(0);
      const linkHrefs = Array.from(docsInModal).map(l => l.getAttribute('href'));
      expect(linkHrefs.some(href => href?.includes('user/features/api'))).toBe(true);
      expect(linkHrefs.some(href => href?.includes('architecture/api/rest-server'))).toBe(true);

      // Check PAT is rendered
      expect(modalContent.textContent).toContain('TestToken');
    });
  });

  describe('Credentials setting documentation', () => {
    it('renders legacy credentials toggle with documentation links', () => {
      const onChange = jest.fn();
      renderCredentialsSettings(containerEl, onChange);

      const links = containerEl.querySelectorAll('a.ofc-doc-link');
      expect(links.length).toBeGreaterThan(0);
      const linkHrefs = Array.from(links).map(l => l.getAttribute('href'));
      expect(linkHrefs.some(href => href?.includes('user/settings/api'))).toBe(true);
    });
  });

  describe('Agent Automations row & reusable modal', () => {
    it('renders a consolidated row with documentation, toggle, and gear button that opens common SettingsModal', () => {
      const openSpy = jest.spyOn(SettingsModal, 'open');
      const storage = {
        clearHistory: jest.fn()
      } as unknown as import('../../features/agent/core/AgentStorage').AgentStorage;
      const logger =
        {} as unknown as import('../../features/agent/core/AgentAuditLogger').AgentAuditLogger;
      const bridge =
        {} as unknown as import('../../features/agent/tools/AgentCalendarBridge').AgentCalendarBridge;

      renderAgentSettings(containerEl, mockPlugin, storage, logger, bridge);

      const settingItem = containerEl.querySelector('.setting-item');
      expect(settingItem).not.toBeNull();

      const links = containerEl.querySelectorAll('a.ofc-doc-link');
      expect(links.length).toBeGreaterThan(0);
      const linkHrefs = Array.from(links).map(l => l.getAttribute('href'));
      expect(linkHrefs.some(href => href?.includes('user/features/agent'))).toBe(true);

      const gearBtn = containerEl.querySelector('.clickable-icon');
      expect(gearBtn).not.toBeNull();

      (gearBtn as HTMLElement)?.click();
      expect(openSpy).toHaveBeenCalled();
    });

    it('renders Agent content cleanly with preset and controls', () => {
      const modalContent = document.createElement('div');
      const storage = {
        clearHistory: jest.fn()
      } as unknown as import('../../features/agent/core/AgentStorage').AgentStorage;
      const logger =
        {} as unknown as import('../../features/agent/core/AgentAuditLogger').AgentAuditLogger;
      const bridge =
        {} as unknown as import('../../features/agent/tools/AgentCalendarBridge').AgentCalendarBridge;

      renderAgentSettingsContent(modalContent, mockPlugin, storage, logger, bridge);

      expect(modalContent.querySelector('.checkbox-container')).not.toBeNull();
      expect(modalContent.querySelectorAll('input').length).toBeGreaterThan(0);
    });
  });

  describe('Linked Note Settings row & reusable modal', () => {
    it('renders Linked Notes content cleanly with directory, link strategy, template textarea, and presets', () => {
      const modalContent = document.createElement('div');
      const rerenderModal = jest.fn();

      renderLinkedNotesSettingsContent(modalContent, mockPlugin, rerenderModal);

      // Verify dropdowns and text area exist
      expect(modalContent.querySelectorAll('select').length).toBeGreaterThanOrEqual(2);
      expect(modalContent.querySelector('textarea')).not.toBeNull();
      expect(modalContent.querySelector('.checkbox-container')).not.toBeNull();
    });
  });
});
