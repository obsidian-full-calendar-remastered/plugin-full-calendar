/**
 * @jest-environment jsdom
 */
// Mock CSS import before importing SettingsTab
jest.mock('./changelogs/changelog.css', () => ({}));
jest.mock('obsidian-daily-notes-interface', () => ({
  getDailyNoteSettings: jest
    .fn()
    .mockReturnValue({ folder: 'Daily', format: 'YYYY-MM-DD', template: '' })
}));

// Type for the captured test helpers injected into the obsidian mock
interface CapturedMock {
  onClickCb: (() => Promise<void>) | null;
  dropdownValue: string;
}

interface MockSettingInstance {
  setName: jest.Mock;
  setDesc: jest.Mock;
  addDropdown: jest.Mock;
  addExtraButton: jest.Mock;
}

// Mock Setting and other Obsidian UI elements
jest.mock('obsidian', () => {
  const captured: CapturedMock = {
    onClickCb: null,
    dropdownValue: 'google'
  };

  const settingInstance: MockSettingInstance = {
    setName: jest.fn().mockReturnValue(null),
    setDesc: jest.fn().mockReturnValue(null),
    addDropdown: jest.fn().mockReturnValue(null),
    addExtraButton: jest.fn().mockReturnValue(null)
  };
  // Wire up returnThis after construction to avoid circular implicit any
  settingInstance.setName.mockReturnValue(settingInstance);
  settingInstance.setDesc.mockReturnValue(settingInstance);
  settingInstance.addDropdown.mockImplementation((cb: (d: Record<string, jest.Mock>) => void) => {
    cb({
      addOptions: jest.fn().mockReturnThis(),
      getValue: jest.fn().mockImplementation(() => captured.dropdownValue)
    });
    return settingInstance;
  });
  settingInstance.addExtraButton.mockImplementation(
    (cb: (b: Record<string, jest.Mock>) => void) => {
      const button: Record<string, jest.Mock> = {
        setTooltip: jest.fn().mockReturnValue(null),
        setIcon: jest.fn().mockReturnValue(null),
        onClick: jest.fn()
      };
      button.setTooltip.mockReturnValue(button);
      button.setIcon.mockReturnValue(button);
      button.onClick.mockImplementation((onClickCb: () => Promise<void>) => {
        captured.onClickCb = onClickCb;
        return button;
      });
      cb(button);
      return settingInstance;
    }
  );

  return {
    TAbstractFile: class {},
    TFile: class {},
    TFolder: class {},
    PluginSettingTab: class {},
    parseYaml: jest.fn(),
    Notice: class {},
    normalizePath: jest.fn((p: string) => p),
    requestUrl: jest.fn(),
    getLanguage: jest.fn().mockReturnValue('en'),
    Setting: jest.fn().mockImplementation(() => settingInstance),
    DropdownComponent: jest.fn(),
    __captured: captured,
    __mockSettingInstance: settingInstance
  };
});

import { addCalendarButton } from './SettingsTab';
import { PluginState } from '../../core/PluginState';
import { ProviderRegistry } from '../../providers/ProviderRegistry';
import FullCalendarPlugin from '../../main';
import { CalendarInfo } from '../../types/calendar_settings';
import ReactModal from '../ReactModal';

// Access mock helpers via requireMock to avoid TS2305 (no exported member)
const obsidianMock: {
  Setting: jest.Mock;
  __captured: CapturedMock;
  __mockSettingInstance: MockSettingInstance;
} = jest.requireMock('obsidian');

// Mock ReactModal
jest.mock('../ReactModal', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(function (
      this: { open: jest.Mock; close: jest.Mock; onOpenCallback: () => Promise<unknown> },
      _app: unknown,
      onOpenCallback: () => Promise<unknown>
    ) {
      this.open = jest.fn();
      this.close = jest.fn();
      this.onOpenCallback = onOpenCallback;
    })
  };
});

describe('SettingsTab Integration - Calendar Sources', () => {
  let mockPlugin: FullCalendarPlugin;
  let mockRegistry: {
    getProviderForType: jest.Mock;
    getAllSources: jest.Mock;
    addInstance: jest.Mock;
  };

  beforeEach(() => {
    // Reset PluginState
    PluginState.clear();

    // Reset captured values
    obsidianMock.__captured.onClickCb = null;
    obsidianMock.__captured.dropdownValue = 'google';

    // Reset mocks
    obsidianMock.Setting.mockClear();
    obsidianMock.__mockSettingInstance.setName.mockClear();
    obsidianMock.__mockSettingInstance.setDesc.mockClear();
    obsidianMock.__mockSettingInstance.addDropdown.mockClear();
    obsidianMock.__mockSettingInstance.addExtraButton.mockClear();

    mockRegistry = {
      getProviderForType: jest.fn().mockResolvedValue({
        getConfigurationComponent: () => () => null
      }),
      getAllSources: jest.fn().mockReturnValue([]),
      addInstance: jest.fn().mockResolvedValue(undefined)
    };

    mockPlugin = {
      app: {
        vault: {
          getAllLoadedFiles: jest.fn().mockReturnValue([]),
          getAbstractFileByPath: jest.fn().mockReturnValue(null)
        },
        metadataCache: {
          getFileCache: jest.fn().mockReturnValue(null)
        }
      }
    } as unknown as FullCalendarPlugin;

    PluginState.setPlugin(mockPlugin);
    PluginState.setSettings({
      calendarSources: [],
      googleAccounts: [],
      microsoftAccounts: []
    } as unknown as Parameters<typeof PluginState.setSettings>[0]);
    PluginState.setLoadSettings(() => Promise.resolve());
    PluginState.setProviderRegistry(mockRegistry as unknown as ProviderRegistry);
  });

  it('should correctly populate and persist googleAccountId when a Google calendar is saved', async () => {
    obsidianMock.__captured.dropdownValue = 'google';
    const container = document.createElement('div');
    const submitCallback = jest.fn();

    // 1. Render add calendar button
    addCalendarButton(mockPlugin, container, submitCallback);

    expect(obsidianMock.__captured.onClickCb).toBeDefined();

    // 2. Trigger Add click
    await obsidianMock.__captured.onClickCb!();

    // Verify ReactModal was constructed
    expect(ReactModal).toHaveBeenCalled();
    const modalInstance = (ReactModal as jest.Mock).mock.instances[0] as {
      onOpenCallback: () => Promise<unknown>;
    };
    expect(modalInstance).toBeDefined();

    // 3. Execute the modal open callback (which sets up base props)
    const elements = (await modalInstance.onOpenCallback()) as {
      props: { onSave: (configs: unknown[], accountId: string) => void };
    };

    // We can extract componentProps from the element's props
    const componentProps = elements.props;
    expect(componentProps.onSave).toBeDefined();

    // 4. Trigger onSave
    const selectedConfigs = [
      { id: 'google-calendar-xyz@gmail.com', name: 'Work', color: '#ff0000' }
    ];
    const googleAccountId = 'gcal_12345';

    componentProps.onSave(selectedConfigs, googleAccountId);

    // Wait for the async task queue to flush since onSave is async internally
    await new Promise(resolve => window.setTimeout(resolve, 10));

    // Verify submitCallback was called with correct googleAccountId
    expect(submitCallback).toHaveBeenCalled();
    const savedSource = (submitCallback.mock.calls as unknown[][])[0][0] as CalendarInfo;

    expect(savedSource.type).toBe('google');
    // Use type narrowing to access provider-specific fields
    if (savedSource.type === 'google') {
      expect(savedSource.googleAccountId).toBe(googleAccountId);
      expect(savedSource.calendarId).toBe('google-calendar-xyz@gmail.com');
    }
  });

  it('should correctly populate and persist microsoftAccountId when an Outlook calendar is saved', async () => {
    obsidianMock.__captured.dropdownValue = 'outlook';
    const container = document.createElement('div');
    const submitCallback = jest.fn();

    // 1. Render add calendar button
    addCalendarButton(mockPlugin, container, submitCallback);

    expect(obsidianMock.__captured.onClickCb).toBeDefined();

    // 2. Trigger Add click
    await obsidianMock.__captured.onClickCb!();

    // 3. Execute the modal open callback
    const modalInstance = (ReactModal as jest.Mock).mock.instances[
      (ReactModal as jest.Mock).mock.instances.length - 1
    ] as { onOpenCallback: () => Promise<unknown> };
    const elements = (await modalInstance.onOpenCallback()) as {
      props: { onSave: (configs: unknown[], accountId: string) => void };
    };

    // We can extract componentProps from the element's props
    const componentProps = elements.props;

    // 4. Trigger onSave
    const selectedConfigs = [{ id: 'outlook-calendar-abc', name: 'Personal', color: '#00ff00' }];
    const microsoftAccountId = 'ms_67890';

    componentProps.onSave(selectedConfigs, microsoftAccountId);

    await new Promise(resolve => window.setTimeout(resolve, 10));

    // Verify submitCallback was called with correct microsoftAccountId
    expect(submitCallback).toHaveBeenCalled();
    const savedSource = (submitCallback.mock.calls as unknown[][])[0][0] as CalendarInfo;

    expect(savedSource.type).toBe('outlook');
    // Use type narrowing to access provider-specific fields
    if (savedSource.type === 'outlook') {
      expect(savedSource.microsoftAccountId).toBe(microsoftAccountId);
      expect(savedSource.calendarId).toBe('outlook-calendar-abc');
    }
  });
});
