/**
 * @file BreakTimerOverlay.ts
 * @brief Handles creation, animation, and destruction of the break timer fullscreen overlay.
 * @license See LICENSE.md
 */

import { normalizePath } from 'obsidian';
import FullCalendarPlugin from '../../main';

export function showBreakTimerOverlay(
  plugin: FullCalendarPlugin,
  durationSecs: number,
  onClose: () => void
): () => void {
  const doc = activeDocument;
  const app = plugin.app;

  // Create overlay container attached to document body
  const overlay = doc.body.createDiv({ cls: 'ofc-break-timer-overlay' });

  // Video element
  const video = overlay.createEl('video', { cls: 'ofc-break-timer-video' });
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;

  const pluginId = 'full-calendar-remastered';
  const path1 = normalizePath(
    `${app.vault.configDir}/plugins/${pluginId}/assets/assets_neko1.webm`
  );
  const path2 = normalizePath(
    `${app.vault.configDir}/plugins/${pluginId}/assets/assets_neko2.webm`
  );

  const loadVideos = async () => {
    try {
      const exists1 = await app.vault.adapter.exists(path1);
      const exists2 = await app.vault.adapter.exists(path2);

      if (exists1 && exists2) {
        const src1 = app.vault.adapter.getResourcePath(path1);
        const src2 = app.vault.adapter.getResourcePath(path2);

        video.src = src1;
        video.loop = false;
        video.addEventListener('ended', () => {
          video.src = src2;
          video.loop = true;
          video.play().catch(e => console.error('Error playing video 2:', e));
        });

        video.addEventListener('canplay', () => {
          video.classList.add('ofc-break-timer-video-loaded');
        });

        video.play().catch(e => console.error('Error playing video 1:', e));
      } else {
        console.warn(
          'Break timer video assets are missing locally. Fallback gradient will display.'
        );
      }
    } catch (err) {
      console.error('Error setting up break timer videos:', err);
    }
  };

  void loadVideos();

  // Bottom controls container
  const controls = overlay.createDiv({ cls: 'ofc-break-timer-controls' });

  // Countdown text
  const countdown = controls.createDiv({ cls: 'ofc-break-timer-countdown' });

  let secondsLeft = durationSecs;
  const updateCountdown = () => {
    countdown.innerText = `Resuming in ${secondsLeft} second${secondsLeft === 1 ? '' : 's'}...`;

    // Dynamic background opacity fading from 0.75 down to 0.15
    const minAlpha = 0.15;
    const maxAlpha = 0.75;
    const ratio = secondsLeft / durationSecs;
    const currentAlpha = minAlpha + (maxAlpha - minAlpha) * ratio;

    overlay.setCssProps({
      backgroundColor: `rgba(0, 0, 0, ${currentAlpha})`
    });
  };
  updateCountdown();

  // Timer interval for countdown
  const countdownInterval = window.setInterval(() => {
    secondsLeft--;
    if (secondsLeft <= 0) {
      cleanup();
      onClose();
    } else {
      updateCountdown();
    }
  }, 1000);

  // Close / Skip Button
  const button = controls.createEl('button', {
    cls: 'ofc-break-timer-close-btn',
    text: 'Shoo cat'
  });

  const cleanup = () => {
    window.clearInterval(countdownInterval);
    try {
      video.pause();
      video.src = '';
      video.load();
    } catch {
      // Ignore
    }
    if (overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
  };

  button.addEventListener('click', () => {
    cleanup();
    onClose();
  });

  return cleanup;
}
