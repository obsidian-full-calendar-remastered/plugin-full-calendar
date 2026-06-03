import * as React from 'react';
import ReactModal from '../../../ui/ReactModal';
import FullCalendarPlugin from '../../../main';
import { ActivityWatchConfigComponent } from './ActivityWatchConfigComponent';

export class ActivityWatchSettingsModal extends ReactModal {
  plugin: FullCalendarPlugin;
  onChange: () => void;

  constructor(plugin: FullCalendarPlugin, onChange: () => void) {
    // ReactModal handles standard async render callback
    super(plugin.app, closeModal => {
      return Promise.resolve(
        React.createElement(ActivityWatchConfigComponent, {
          plugin,
          onClose: () => {
            closeModal();
            onChange();
          }
        })
      );
    });
    this.plugin = plugin;
    this.onChange = onChange;
  }

  onOpen(): void {
    this.contentEl.parentElement?.addClass('ofc-settings-modal-wide');
    this.contentEl.parentElement?.addClass('activitywatch-settings-modal');
    super.onOpen();
  }

  onClose(): void {
    this.contentEl.parentElement?.removeClass('ofc-settings-modal-wide');
    this.contentEl.parentElement?.removeClass('activitywatch-settings-modal');
    super.onClose();
  }
}
