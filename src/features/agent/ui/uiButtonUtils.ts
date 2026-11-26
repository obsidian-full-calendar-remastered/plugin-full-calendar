/**
 * @file uiButtonUtils.ts
 * @brief Shared async button-loading and error-notice wrapper for Agent settings UI.
 *
 * @license See LICENSE.md
 */

import type { ButtonComponent } from 'obsidian';
import { showNotice } from '../../../utils/showNotice';

export interface AsyncButtonActionOptions {
  idleText: string;
  busyText?: string;
  fallbackError: string;
}

/**
 * Eliminates repeated disable -> busy label -> try/catch showNotice -> restore boilerplate.
 */
export function bindAsyncButtonAction(
  btn: ButtonComponent,
  opts: AsyncButtonActionOptions,
  action: () => Promise<void>
): void {
  btn.setButtonText(opts.idleText);
  btn.onClick(async () => {
    btn.setDisabled(true);
    if (opts.busyText) {
      btn.setButtonText(opts.busyText);
    }
    try {
      await action();
    } catch (err) {
      showNotice(err instanceof Error ? err.message : opts.fallbackError);
    } finally {
      btn.setDisabled(false);
      btn.setButtonText(opts.idleText);
    }
  });
}
