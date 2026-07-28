/**
 * @file CopyTextModal.test.ts
 * @brief Unit tests for CopyTextModal component.
 * @license See LICENSE.md
 */

import { App } from 'obsidian';
import { CopyTextModal } from './CopyTextModal';

// Augment HTMLElement prototype for tests
const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
if (!proto.empty) {
  proto.empty = function (this: HTMLElement) {
    this.innerHTML = '';
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
    options?: { text?: string; cls?: string }
  ) {
    const el = document.createElement(tag);
    if (options?.text) el.textContent = options.text;
    if (options?.cls) el.className = options.cls;
    this.appendChild(el);
    return el;
  };
}
if (!proto.createDiv) {
  proto.createDiv = function (this: HTMLElement, options?: { cls?: string }) {
    return (this as unknown as { createEl: (tag: string, opts?: unknown) => HTMLElement }).createEl(
      'div',
      options
    );
  };
}

jest.mock('obsidian', () => {
  class MockSetting {
    containerEl: HTMLElement;
    constructor(containerEl: HTMLElement) {
      this.containerEl = containerEl;
    }
    addButton(cb: (btn: MockButton) => void) {
      const btn = new MockButton(this.containerEl);
      cb(btn);
      return this;
    }
  }

  class MockButton {
    btnEl: HTMLButtonElement;
    constructor(containerEl: HTMLElement) {
      this.btnEl = document.createElement('button');
      containerEl.appendChild(this.btnEl);
    }
    setButtonText(text: string) {
      this.btnEl.textContent = text;
      return this;
    }
    setCta() {
      this.btnEl.classList.add('mod-cta');
      return this;
    }
    onClick(cb: () => void) {
      this.btnEl.onclick = cb;
      return this;
    }
  }

  class MockModal {
    app: App;
    contentEl: HTMLElement;
    constructor(app: App) {
      this.app = app;
      this.contentEl = document.createElement('div');
    }
    open() {
      (this as unknown as { onOpen: () => void }).onOpen();
    }
    close() {
      (this as unknown as { onClose: () => void }).onClose();
    }
  }

  return {
    App: jest.fn(),
    Modal: MockModal,
    Setting: MockSetting
  };
});

describe('CopyTextModal', () => {
  let mockApp: App;

  beforeEach(() => {
    mockApp = new App();
    document.body.innerHTML = '';
  });

  it('should render single-line input by default', () => {
    const modal = new CopyTextModal(mockApp, {
      titleText: 'Test title',
      valueToCopy: 'sample text'
    });

    modal.open();
    const input = modal.contentEl.querySelector('input');
    expect(input).not.toBeNull();
    expect(input?.value).toBe('sample text');
    expect(input?.getAttribute('readonly')).toBe('true');
  });

  it('should render textarea when multiline is true', () => {
    const modal = new CopyTextModal(mockApp, {
      titleText: 'Multiline title',
      valueToCopy: 'line 1\nline 2',
      multiline: true
    });

    modal.open();
    const textarea = modal.contentEl.querySelector('textarea');
    expect(textarea).not.toBeNull();
    expect(textarea?.value).toBe('line 1\nline 2');
  });

  it('should render secondary button when provided', () => {
    const onSecondary = jest.fn();
    const modal = new CopyTextModal(mockApp, {
      titleText: 'Modal with secondary',
      valueToCopy: 'val',
      secondaryButtonLabel: 'Re-run benchmark',
      onSecondaryClick: onSecondary
    });

    modal.open();
    const buttons = Array.from(modal.contentEl.querySelectorAll('button'));
    const secondaryBtn = buttons.find(b => b.textContent === 'Re-run benchmark');
    expect(secondaryBtn).toBeDefined();

    secondaryBtn?.click();
    expect(onSecondary).toHaveBeenCalledTimes(1);
  });
});
