import * as React from 'react';
import { App, setIcon } from 'obsidian';
import ReactModal from '../../ui/ReactModal';
import { t } from '../i18n/i18n';

interface Props {
  presets: string[];
  onSelect: (preset: string | null) => void;
  onClose: () => void;
}

const Icon = ({ name }: { name: string }) => {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (ref.current) {
      setIcon(ref.current, name);
    }
  }, [name]);
  return <div ref={ref} className="event-details-icon" />;
};

export const TemplatePresetSelectModal: React.FC<Props> = ({ presets, onSelect, onClose }) => {
  return (
    <div className="ofc-template-select-modal">
      <div className="modal-header">
        <h2 className="modal-title">{t('modals.linkedNotePreset.title')}</h2>
      </div>

      <div className="modal-content" style={{ marginTop: '16px' }}>
        <p className="ofc-u-muted" style={{ marginBottom: '16px' }}>
          {t('modals.linkedNotePreset.description')}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {/* Preset Options */}
          {presets.map(presetPath => {
            const filename = presetPath.split('/').pop()?.replace(/\.md$/, '') || presetPath;
            return (
              <div
                key={presetPath}
                className="ofc-preset-item suggestion-item"
                onClick={() => onSelect(presetPath)}
              >
                <Icon name="file" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <strong>{filename}</strong>
                  <span className="ofc-u-muted" style={{ fontSize: 'var(--font-smaller)' }}>
                    {presetPath}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <hr className="modal-hr" />

      <div className="modal-footer">
        <div className="footer-actions-right" style={{ marginLeft: 'auto' }}>
          <button type="button" className="mod-subtle" onClick={onClose}>
            {t('modals.linkedNotePreset.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
};

export function chooseTemplatePreset(app: App, presets: string[]): Promise<string | null> {
  return new Promise(resolve => {
    let resolved = false;
    const modal = new ReactModal(app, async closeModal => {
      const handleSelect = (preset: string | null) => {
        resolved = true;
        resolve(preset);
        closeModal();
      };

      return React.createElement(TemplatePresetSelectModal, {
        presets,
        onSelect: handleSelect,
        onClose: () => {
          if (!resolved) {
            resolve(null);
          }
          closeModal();
        }
      });
    });

    const originalOnClose = modal.onClose.bind(modal);
    modal.onClose = () => {
      originalOnClose();
      if (!resolved) {
        resolve(null);
      }
    };

    modal.open();
  });
}
