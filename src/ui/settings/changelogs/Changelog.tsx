/**
 * @file Changelog.tsx
 * @brief React component for displaying the full, interactive changog.
 *
 * @description
 * This component renders a list of versions from the changelogData, each with a
 * collapsible section for its changes. It manages its own state for which
 * sections are expanded.
 *
 * @license See LICENSE.md
 */

import React, { useState, useRef, useEffect } from 'react';
import { changelogData } from './changelogData';
import { Version } from './changelogData';
import { parseMarkdownLinks } from '../linkTextFragments';
import { Setting, requestUrl } from 'obsidian';
import './changelog.css';
import { t } from '../../../features/i18n/i18n';

import { renderFooter } from '../sections/calendars/renderFooter';
import { createDocsLinksFragment } from '../docsLinks';

interface ChangelogProps {
  onBack: () => void;
}

interface VersionSectionProps {
  version: Version;
  isInitiallyOpen: boolean;
  embedded?: boolean;
}

const renderMarkdownLinks = (text: string): React.ReactNode[] =>
  parseMarkdownLinks(text).map((segment, idx) => {
    if (segment.kind === 'text') {
      return segment.text;
    }

    return (
      <a
        href={segment.href}
        target="_blank"
        rel="noopener noreferrer"
        key={`md-link-${idx}`}
        onClick={e => e.stopPropagation()}
      >
        {segment.text}
      </a>
    );
  });

export const VersionSection = ({
  version,
  isInitiallyOpen,
  embedded = false
}: VersionSectionProps) => {
  const [isOpen, setIsOpen] = useState(isInitiallyOpen);

  const toggleOpen = () => setIsOpen(!isOpen);

  return (
    <div className={`full-calendar-version-container ${embedded ? 'embedded' : ''}`}>
      <div
        className={`full-calendar-version-header ${isOpen ? 'is-open' : ''}`}
        onClick={toggleOpen}
      >
        <h3>{t('settings.changelog.versionWithNumber', { version: version.version })}</h3>
      </div>
      <div className={`full-calendar-version-content ${isOpen ? '' : 'is-collapsed'}`}>
        {version.changes.map((change, idx) => (
          <div
            className={`full-calendar-change-item full-calendar-change-type-${change.type}`}
            key={idx}
          >
            <div className="full-calendar-change-icon">
              {change.type === 'new' && '✨'}
              {change.type === 'improvement' && '🔧'}
              {change.type === 'fix' && '🐛'}
            </div>
            <div className="change-content">
              <div className="full-calendar-change-title">{renderMarkdownLinks(change.title)}</div>
              <div className="full-calendar-change-description">
                {renderMarkdownLinks(change.description)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const Changelog = ({ onBack }: ChangelogProps) => {
  const settingRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);

  const [versions, setVersions] = useState<Version[]>(changelogData);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoadedOlder, setHasLoadedOlder] = useState(false);
  const [errorLoading, setErrorLoading] = useState(false);

  useEffect(() => {
    if (settingRef.current) {
      settingRef.current.empty(); // Clear on re-render
      new Setting(settingRef.current)
        .setName(t('settings.changelog.title'))
        .setHeading()
        .setDesc(
          createDocsLinksFragment([
            { text: t('settings.changelog.whatsNewPageLink'), path: 'whats_new' },
            { text: t('settings.changelog.changelogPageLink'), path: 'changelog' }
          ])
        );
    }
    if (footerRef.current) {
      footerRef.current.empty();
      renderFooter(footerRef.current);
    }
  }, []); // Run only once on mount

  const loadOlderVersions = async () => {
    setIsLoading(true);
    setErrorLoading(false);
    try {
      const response = await requestUrl(
        'https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/changelogs.json'
      );
      if (response.status === 200) {
        const olderVersions = response.json as Version[];
        setVersions([...changelogData, ...olderVersions]);
        setHasLoadedOlder(true);
      } else {
        setErrorLoading(true);
      }
    } catch (e) {
      console.error('Failed to load older changelogs', e);
      setErrorLoading(true);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="full-calendar-changelog-wrapper">
      <div className="full-calendar-changelog-header">
        <button onClick={onBack}>{'<'}</button>
        {/* Using a Setting for consistent styling with the rest of the tab */}
        <div className="u-flex-grow-1" ref={settingRef}></div>
      </div>
      {versions.map((version, index) => (
        <VersionSection key={version.version} version={version} isInitiallyOpen={index === 0} />
      ))}

      {!hasLoadedOlder && (
        <div style={{ textAlign: 'center', margin: '20px 0' }}>
          {errorLoading && (
            <div style={{ color: 'var(--text-error)', marginBottom: '10px' }}>
              {t('settings.changelog.loadOlder.errorOffline')}
            </div>
          )}
          <button onClick={() => void loadOlderVersions()} disabled={isLoading}>
            {isLoading
              ? t('settings.changelog.loadOlder.loading')
              : t('settings.changelog.loadOlder.button')}
          </button>
        </div>
      )}

      <div ref={footerRef}></div>
    </div>
  );
};
