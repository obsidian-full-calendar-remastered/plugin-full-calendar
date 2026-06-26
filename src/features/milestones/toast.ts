import { setIcon } from 'obsidian';
import { NewlyUnlockedMilestone } from './types';
import { t } from '../i18n/i18n';
import { PluginState } from '../../core/PluginState';

export function queueMilestoneToast(milestone: NewlyUnlockedMilestone, index: number): void {
  const delay = index * 220;
  window.setTimeout(() => {
    // Resolve activeDocument robustly: check global scope (since it is a window global in Obsidian) or fallback to window.document
    const doc =
      (typeof activeDocument !== 'undefined' ? activeDocument : undefined) ??
      (typeof window !== 'undefined' ? window.document : undefined);
    if (!doc) {
      console.warn('Full Calendar: activeDocument / window.document is undefined!');
      return;
    }

    const existingRoot = doc.getElementById('ofc-milestone-toast-root');
    const root = existingRoot ?? doc.createElement('div');
    if (!existingRoot) {
      root.id = 'ofc-milestone-toast-root';
      doc.body.appendChild(root);
    }

    const toast = doc.createElement('div');
    toast.className = 'ofc-milestone-toast';

    const closeBtn = doc.createElement('button');
    closeBtn.className = 'ofc-milestone-toast-close';
    closeBtn.setAttribute('aria-label', 'Close notification');
    setIcon(closeBtn, 'x');

    const titleEl = doc.createElement('div');
    titleEl.className = 'ofc-milestone-toast-title';
    titleEl.textContent = milestone.title;

    const bodyEl = doc.createElement('div');
    bodyEl.className = 'ofc-milestone-toast-body';
    bodyEl.textContent = milestone.description;

    toast.appendChild(closeBtn);
    toast.appendChild(titleEl);
    toast.appendChild(bodyEl);

    // Create Sponsorship/Ethics Support Footer
    const footerEl = doc.createElement('div');
    footerEl.className = 'ofc-milestone-toast-footer';

    const footerDesc = doc.createElement('div');
    footerDesc.className = 'ofc-milestone-toast-footer-desc';
    footerDesc.textContent = t('notices.milestones.sponsorDesc');

    const buttonsWrap = doc.createElement('div');
    buttonsWrap.className = 'ofc-milestone-toast-footer-buttons';

    const sponsorBtn = doc.createElement('a');
    sponsorBtn.className = 'ofc-milestone-toast-btn btn-primary';
    sponsorBtn.textContent = t('notices.milestones.sponsorBtn');
    sponsorBtn.setAttribute(
      'href',
      'https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/donation/ko-fi'
    );
    sponsorBtn.setAttribute('target', '_blank');
    sponsorBtn.setAttribute('rel', 'noopener noreferrer');

    const goalBtn = doc.createElement('a');
    goalBtn.className = 'ofc-milestone-toast-btn btn-secondary';
    goalBtn.textContent = t('notices.milestones.goalBtn');
    goalBtn.setAttribute(
      'href',
      'https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/SustainabilityEthics/'
    );
    goalBtn.setAttribute('target', '_blank');
    goalBtn.setAttribute('rel', 'noopener noreferrer');

    buttonsWrap.appendChild(sponsorBtn);
    buttonsWrap.appendChild(goalBtn);
    footerEl.appendChild(footerDesc);
    footerEl.appendChild(buttonsWrap);
    toast.appendChild(footerEl);

    root.appendChild(toast);

    const duration = PluginState.getSettings().milestoneNotifierDuration ?? 8000;

    let closeTimeout: number | null = null;
    let removeTimeout: number | null = null;
    let isClosing = false;

    const closeToast = () => {
      if (isClosing) return;
      isClosing = true;
      stopTimer();
      toast.classList.add('ofc-milestone-toast-hide');
      removeTimeout = window.setTimeout(() => {
        toast.remove();
        if (!root.hasChildNodes()) {
          root.remove();
        }
      }, 280);
    };

    const startTimer = () => {
      if (isClosing) return;
      closeTimeout = window.setTimeout(() => {
        closeToast();
      }, duration);
    };

    const stopTimer = () => {
      if (closeTimeout !== null) {
        window.clearTimeout(closeTimeout);
        closeTimeout = null;
      }
      if (removeTimeout !== null && !isClosing) {
        window.clearTimeout(removeTimeout);
        removeTimeout = null;
      }
      // Safely ensure the hide class is removed if mouse enters during the fade-out phase
      if (!isClosing) {
        toast.classList.remove('ofc-milestone-toast-hide');
      }
    };

    // Start initial close timer
    startTimer();

    // Register hover pause listeners
    toast.addEventListener('mouseenter', () => {
      if (isClosing) return;
      stopTimer();
    });

    toast.addEventListener('mouseleave', () => {
      if (isClosing) return;
      startTimer();
    });

    // Close button event listener
    closeBtn.addEventListener('click', e => {
      e.stopPropagation();
      closeToast();
    });
  }, delay);
}
