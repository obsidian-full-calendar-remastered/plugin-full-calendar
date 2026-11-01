/**
 * @file DateAnchorSetting.ts
 * @brief Reusable Obsidian Setting component for relative date anchors and interactive date selection.
 *
 * Adheres to Interface Segregation and Single Responsibility Principles.
 */

import { Setting, TextComponent } from 'obsidian';
import { DateTime } from 'luxon';
import { DATE_ANCHOR_PRESETS } from './DateAnchorResolver';

let datalistCounter = 0;

export interface DateAnchorSettingOptions {
  label: string;
  description: string;
  placeholder?: string;
  resetTooltip?: string;
  pickerTooltip?: string;
  value?: string;
  onChange: (value: string | undefined) => void;
}

/**
 * Creates a dual-mode date setting supporting both relative keyword anchors
 * (e.g. today, tomorrow, yesterday) and absolute dates selected via an
 * interactive calendar picker or manual entry.
 */
export function createDateAnchorSetting(
  containerEl: HTMLElement,
  options: DateAnchorSettingOptions
): Setting {
  let textInput: TextComponent;
  const datalistId = `ofc-date-anchor-presets-${++datalistCounter}`;

  const setting = new Setting(containerEl)
    .setName(options.label)
    .setDesc(options.description)
    .addText(text => {
      textInput = text;
      text
        .setPlaceholder(options.placeholder || 'Today')
        .setValue(options.value || '')
        .onChange(val => {
          const trimmed = val.trim();
          options.onChange(trimmed ? trimmed : undefined);
        });

      text.inputEl.setAttribute('list', datalistId);
    });

  // Attach datalist for preset suggestions
  const datalist = setting.controlEl.createEl('datalist', {
    attr: { id: datalistId }
  });
  for (const preset of DATE_ANCHOR_PRESETS) {
    datalist.createEl('option', { attr: { value: preset } });
  }

  // Hidden date input used strictly to invoke the native interactive date picker popover
  const pickerInput = setting.controlEl.createEl('input', {
    attr: {
      type: 'date',
      tabindex: '-1',
      'aria-hidden': 'true',
      style:
        'position: absolute; opacity: 0; width: 0; height: 0; pointer-events: none; border: none; padding: 0;'
    }
  });

  pickerInput.addEventListener('change', () => {
    const selectedDate = pickerInput.value;
    if (selectedDate) {
      textInput.setValue(selectedDate);
      options.onChange(selectedDate);
    }
  });

  // 1. Interactive calendar picker button
  setting.addExtraButton(btn => {
    btn
      .setIcon('calendar')
      .setTooltip(options.pickerTooltip || 'Pick a date...')
      .onClick(() => {
        const currentVal = textInput.getValue().trim();
        const parsed = DateTime.fromISO(currentVal);
        pickerInput.value = parsed.isValid
          ? (parsed.toISODate() ?? '')
          : (DateTime.now().toISODate() ?? '');

        if (typeof pickerInput.showPicker === 'function') {
          pickerInput.showPicker();
        } else {
          pickerInput.click();
        }
      });
  });

  // 2. Reset to Today button
  setting.addExtraButton(btn => {
    btn
      .setIcon('cross')
      .setTooltip(options.resetTooltip || 'Reset to Today')
      .onClick(() => {
        textInput.setValue('');
        pickerInput.value = '';
        options.onChange(undefined);
      });
  });

  return setting;
}
