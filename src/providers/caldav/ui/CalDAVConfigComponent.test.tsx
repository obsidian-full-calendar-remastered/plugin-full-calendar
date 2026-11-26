/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import * as ReactDOMClient from 'react-dom/client';
import { CalDAVConfigComponent } from './CalDAVConfigComponent';
import * as importCaldavModule from '../client/import_caldav';

jest.mock('../../../features/i18n/i18n', () => ({
  t: (key: string, params?: Record<string, unknown>) => {
    if (params && (typeof params.count === 'number' || typeof params.count === 'string')) {
      return `${key}:${params.count}`;
    }
    return key;
  }
}));

jest.mock('../../../features/credentials/CredentialStore', () => ({
  CredentialStore: {
    getCalDAVPassword: jest.fn(() => '')
  }
}));

describe('CalDAVConfigComponent', () => {
  let container: HTMLDivElement;
  let root: ReactDOMClient.Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = ReactDOMClient.createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    jest.restoreAllMocks();
  });

  it('renders initial credential form with discover button', () => {
    act(() => {
      root.render(
        <CalDAVConfigComponent config={{}} onSave={jest.fn()} onClose={jest.fn()} mode="tasks" />
      );
    });

    const inputs = container.querySelectorAll('input');
    // Inputs: Server URL, Username, Password, Advanced Toggle Checkbox
    expect(inputs.length).toBeGreaterThanOrEqual(3);

    const submitBtn = container.querySelector('button[type="submit"]');
    expect(submitBtn).toBeDefined();
    expect(submitBtn?.textContent).toBe('settings.calendars.caldav.discoverButton');
  });

  it('transitions to selection view when discovery succeeds', async () => {
    const discoverSpy = jest
      .spyOn(importCaldavModule, 'discoverCalDAVAccount')
      .mockResolvedValueOnce([
        {
          href: 'https://caldav.fastmail.com/dav/calendars/user/alice/default/',
          displayName: 'Personal Events',
          color: '#3A86FF',
          supportedComponents: ['VEVENT'],
          type: 'caldav',
          serverUrl: 'https://caldav.fastmail.com/'
        },
        {
          href: 'https://caldav.fastmail.com/dav/calendars/user/alice/habits/',
          displayName: 'Habits List',
          color: '#4CAF50',
          supportedComponents: ['VTODO'],
          type: 'caldavtasks',
          serverUrl: 'https://caldav.fastmail.com/'
        }
      ]);

    const onSaveMock = jest.fn();
    const onCloseMock = jest.fn();

    act(() => {
      root.render(
        <CalDAVConfigComponent
          config={{
            url: 'caldav.fastmail.com',
            username: 'alice@fastmail.com',
            password: 'secret-password'
          }}
          onSave={onSaveMock}
          onClose={onCloseMock}
          mode="tasks"
        />
      );
    });

    const form = container.querySelector('form');
    await act(async () => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(discoverSpy).toHaveBeenCalledWith({
      url: 'caldav.fastmail.com',
      username: 'alice@fastmail.com',
      password: 'secret-password'
    });

    // Check that we transitioned to select view
    const selectView = container.querySelector('.caldav-discovery-select');
    expect(selectView).not.toBeNull();

    // Check that both collections are displayed
    expect(container.textContent).toContain('Personal Events');
    expect(container.textContent).toContain('Habits List');

    // In tasks mode, Habits List (VTODO) is selected by default
    const importBtn = container.querySelector('button.mod-cta') as HTMLButtonElement;
    expect(importBtn).not.toBeNull();
    expect(importBtn.disabled).toBe(false);

    // Click Import Selected
    await act(async () => {
      importBtn.click();
    });

    expect(onSaveMock).toHaveBeenCalledWith([
      expect.objectContaining({
        name: 'Habits List',
        homeUrl: 'https://caldav.fastmail.com/dav/calendars/user/alice/habits/',
        type: 'caldavtasks',
        username: 'alice@fastmail.com',
        password: 'secret-password',
        color: '#4CAF50'
      })
    ]);
    expect(onCloseMock).toHaveBeenCalled();
  });
});
