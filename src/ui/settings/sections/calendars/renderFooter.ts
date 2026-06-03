import { t } from '../../../../features/i18n/i18n';

export function renderFooter(containerEl: HTMLElement): void {
  const footerEl = containerEl.createDiv({ cls: 'full-calendar-settings-footer' });

  footerEl.createEl('p', {
    text: t('settings.footer.message'),
    cls: 'full-calendar-settings-footer-text'
  });

  const linksContainer = footerEl.createDiv({ cls: 'full-calendar-settings-footer-links' });

  linksContainer.createEl('a', {
    text: t('settings.footer.buyMeACoffee'),
    attr: { href: 'https://ko-fi.com/youfoundjk' },
    cls: 'full-calendar-settings-footer-link'
  });
  linksContainer.createEl('a', {
    text: t('settings.footer.suggestFeature'),
    attr: {
      href: 'https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/discussions/'
    },
    cls: 'full-calendar-settings-footer-link'
  });
  linksContainer.createEl('a', {
    text: t('settings.footer.raiseIssue'),
    attr: {
      href: 'https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/new?template=bug_report.yaml'
    },
    cls: 'full-calendar-settings-footer-link'
  });
}
