/**
 * @file HolidayConfigComponent.tsx
 * @brief Add-calendar configuration modal for the Holiday provider.
 *
 * @description
 * All user-configurable fields are surfaced here with rich inline documentation
 * links so users can identify the right codes without leaving Obsidian.
 * - Country / state / region codes → date-holidays supported countries list
 * - Holiday type tiers → date-holidays type documentation
 * - Display style → plugin docs
 *
 * Timezone is intentionally absent: the plugin's EventEnhancer already applies
 * the global display timezone to every provider's events uniformly. Adding a
 * per-provider timezone override here would cause double-correction.
 *
 * @license See LICENSE.md
 */

import * as React from 'react';
import { HolidayProviderConfig, HolidayTypeFilter } from '../typesHoliday';
import { t } from '../../../features/i18n/i18n';
import { ProviderConfigContext } from '../../typesProvider';
import FullCalendarPlugin from '../../../main';

// ─── External reference URLs ──────────────────────────────────────────────────

const DOCS_ROOT = 'https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/';
/** date-holidays supported countries/states/regions — lives on their GitHub wiki */
const DH_COUNTRIES_URL =
  'https://www.npmjs.com/package/date-holidays#supported-countries-states-regions';
/** date-holidays holiday type documentation */
const DH_TYPES_URL = 'https://www.npmjs.com/package/date-holidays';
/** FCR provider guide for the Holiday calendar */
const FCR_HOLIDAYS_DOCS_URL = `${DOCS_ROOT}user/calendars/holidays/`;

// ─── Types ────────────────────────────────────────────────────────────────────

interface HolidayConfigComponentProps {
  plugin: FullCalendarPlugin;
  config: Partial<HolidayProviderConfig>;
  onConfigChange: (newConfig: Partial<HolidayProviderConfig>) => void;
  context: ProviderConfigContext;
  onSave: (finalConfig: HolidayProviderConfig) => void;
  onClose: () => void;
}

// ─── Option lists ─────────────────────────────────────────────────────────────

const HOLIDAY_TYPE_OPTIONS: { value: HolidayTypeFilter; i18nKey: string }[] = [
  { value: 'public', i18nKey: 'settings.calendars.holidays.holidayTypes.options.public' },
  {
    value: 'public_bank',
    i18nKey: 'settings.calendars.holidays.holidayTypes.options.public_bank'
  },
  {
    value: 'public_bank_observance',
    i18nKey: 'settings.calendars.holidays.holidayTypes.options.public_bank_observance'
  },
  {
    value: 'all_except_optional',
    i18nKey: 'settings.calendars.holidays.holidayTypes.options.all_except_optional'
  },
  { value: 'all', i18nKey: 'settings.calendars.holidays.holidayTypes.options.all' }
];

const DISPLAY_OPTIONS: {
  value: HolidayProviderConfig['display'];
  i18nKey: string;
}[] = [
  { value: 'block', i18nKey: 'settings.calendars.holidays.display.options.block' },
  { value: 'background', i18nKey: 'settings.calendars.holidays.display.options.background' },
  {
    value: 'inverse-background',
    i18nKey: 'settings.calendars.holidays.display.options.inverseBackground'
  },
  { value: 'auto', i18nKey: 'settings.calendars.holidays.display.options.auto' },
  { value: 'none', i18nKey: 'settings.calendars.holidays.display.options.none' }
];

// ─── Small helpers ────────────────────────────────────────────────────────────

/** Inline external link that opens in a new tab. */
function externalLink(href: string, label: string): React.ReactElement {
  return React.createElement(
    'a',
    { href, target: '_blank', rel: 'noreferrer noopener', className: 'ofc-holiday-doc-link' },
    label
  );
}

/** A single settings row: label + description (with optional React children) + control */
function SettingRow({
  label,
  description,
  control,
  required = false
}: {
  label: string;
  description: React.ReactNode;
  control: React.ReactNode;
  required?: boolean;
}): React.ReactElement {
  return React.createElement(
    'div',
    { className: 'setting-item' },
    React.createElement(
      'div',
      { className: 'setting-item-info' },
      React.createElement(
        'div',
        { className: 'setting-item-name' },
        label,
        required
          ? React.createElement(
              'span',
              { className: 'ofc-required-star', 'aria-hidden': 'true' },
              ' *'
            )
          : null
      ),
      React.createElement('div', { className: 'setting-item-description' }, description)
    ),
    React.createElement('div', { className: 'setting-item-control' }, control)
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export const HolidayConfigComponent: React.FC<HolidayConfigComponentProps> = ({
  config,
  onSave
}) => {
  const [name, setName] = React.useState(config.name ?? 'Holidays');
  const [country, setCountry] = React.useState(config.country ?? 'US');
  const [state, setState] = React.useState(config.state ?? '');
  const [region, setRegion] = React.useState(config.region ?? '');
  const [holidayTypes, setHolidayTypes] = React.useState<HolidayTypeFilter>(
    config.holidayTypes ?? 'public'
  );
  const [display, setDisplay] = React.useState<HolidayProviderConfig['display']>(
    config.display ?? 'block'
  );
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const canSubmit = country.trim().length >= 2;

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit) return;
    setIsSubmitting(true);

    const finalConfig: HolidayProviderConfig = {
      id: config.id ?? '',
      name: name.trim() || 'Holidays',
      country: country.trim().toUpperCase(),
      holidayTypes,
      display: display ?? 'block'
    };

    if (state.trim()) finalConfig.state = state.trim().toLowerCase();
    if (region.trim()) finalConfig.region = region.trim().toLowerCase();

    onSave(finalConfig);
  };

  return React.createElement(
    'form',
    { onSubmit: handleSubmit, className: 'ofc-holiday-config-form' },

    // ── Calendar Name ──────────────────────────────────────────────────────────
    React.createElement(SettingRow, {
      label: t('settings.calendars.holidays.calendarName.label'),
      description: t('settings.calendars.holidays.calendarName.description'),
      control: React.createElement('input', {
        className: 'ofc-setting-input',
        type: 'text',
        value: name,
        placeholder: 'Holidays',
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)
      })
    }),

    // ── Country ────────────────────────────────────────────────────────────────
    React.createElement(SettingRow, {
      required: true,
      label: t('settings.calendars.holidays.country.label'),
      description: React.createElement(
        React.Fragment,
        null,
        t('settings.calendars.holidays.country.description'),
        ' ',
        externalLink(DH_COUNTRIES_URL, t('global.learnMoreLink'))
      ),
      control: React.createElement('input', {
        className: 'ofc-setting-input',
        type: 'text',
        value: country,
        placeholder: 'US',
        maxLength: 3,
        style: { textTransform: 'uppercase', width: '72px' },
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => setCountry(e.target.value)
      })
    }),

    // ── State / Province ──────────────────────────────────────────────────────
    React.createElement(SettingRow, {
      label: t('settings.calendars.holidays.state.label'),
      description: React.createElement(
        React.Fragment,
        null,
        t('settings.calendars.holidays.state.description'),
        ' ',
        externalLink(DH_COUNTRIES_URL, t('global.learnMoreLink'))
      ),
      control: React.createElement('input', {
        className: 'ofc-setting-input',
        type: 'text',
        value: state,
        placeholder: 'ca',
        style: { width: '72px' },
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => setState(e.target.value)
      })
    }),

    // ── Region ────────────────────────────────────────────────────────────────
    React.createElement(SettingRow, {
      label: t('settings.calendars.holidays.region.label'),
      description: React.createElement(
        React.Fragment,
        null,
        t('settings.calendars.holidays.region.description'),
        ' ',
        externalLink(DH_COUNTRIES_URL, t('global.learnMoreLink'))
      ),
      control: React.createElement('input', {
        className: 'ofc-setting-input',
        type: 'text',
        value: region,
        placeholder: 'no',
        style: { width: '72px' },
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => setRegion(e.target.value)
      })
    }),

    // ── Holiday Types ─────────────────────────────────────────────────────────
    React.createElement(SettingRow, {
      label: t('settings.calendars.holidays.holidayTypes.label'),
      description: React.createElement(
        React.Fragment,
        null,
        t('settings.calendars.holidays.holidayTypes.description'),
        ' ',
        externalLink(DH_TYPES_URL, t('global.learnMoreLink'))
      ),
      control: React.createElement(
        'select',
        {
          className: 'dropdown',
          value: holidayTypes,
          onChange: (e: React.ChangeEvent<HTMLSelectElement>) =>
            setHolidayTypes(e.target.value as HolidayTypeFilter)
        },
        ...HOLIDAY_TYPE_OPTIONS.map(opt =>
          React.createElement('option', { key: opt.value, value: opt.value }, t(opt.i18nKey))
        )
      )
    }),

    // ── Display Style ─────────────────────────────────────────────────────────
    React.createElement(SettingRow, {
      label: t('settings.calendars.holidays.display.label'),
      description: React.createElement(
        React.Fragment,
        null,
        t('settings.calendars.holidays.display.description'),
        ' ',
        externalLink(FCR_HOLIDAYS_DOCS_URL, t('global.learnMoreLink'))
      ),
      control: React.createElement(
        'select',
        {
          className: 'dropdown',
          value: display ?? 'block',
          onChange: (e: React.ChangeEvent<HTMLSelectElement>) =>
            setDisplay(e.target.value as HolidayProviderConfig['display'])
        },
        ...DISPLAY_OPTIONS.map(opt =>
          React.createElement('option', { key: opt.value, value: opt.value }, t(opt.i18nKey))
        )
      )
    }),

    // ── Submit ────────────────────────────────────────────────────────────────
    React.createElement(SettingRow, {
      label: '',
      description: null,
      control: React.createElement(
        'button',
        {
          className: 'mod-cta',
          type: 'submit',
          disabled: isSubmitting || !canSubmit
        },
        isSubmitting ? t('settings.calendars.holidays.adding') : t('ui.buttons.addCalendar')
      )
    })
  );
};
