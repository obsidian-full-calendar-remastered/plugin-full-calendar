import { fetchOutlookCalendarList } from './api';
import { makeAuthenticatedRequest } from './request';
import { MicrosoftAccount } from '../../../types/settings';

jest.mock('./request', () => ({
  makeAuthenticatedRequest: jest.fn(),
  OutlookApiError: class OutlookApiError extends Error {
    constructor(
      message: string,
      public status?: number,
      public body?: unknown
    ) {
      super(message);
      this.name = 'OutlookApiError';
    }
  }
}));

describe('fetchOutlookCalendarList', () => {
  const mockAccount: MicrosoftAccount = {
    id: 'acc-1',
    email: 'user@example.com',
    accessToken: 'valid-token',
    refreshToken: 'refresh-token',
    expiryDate: Date.now() + 3600000
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws an error if access token is missing', async () => {
    const invalidAccount = { ...mockAccount, accessToken: undefined };
    await expect(
      fetchOutlookCalendarList(invalidAccount as unknown as MicrosoftAccount)
    ).rejects.toThrow('Account is missing an access token.');
  });

  it('returns calendars for a single-page response', async () => {
    (makeAuthenticatedRequest as jest.Mock).mockResolvedValueOnce({
      value: [
        { id: 'cal-1', name: 'Calendar 1' },
        { id: 'cal-2', name: 'Calendar 2' }
      ]
    });

    const result = await fetchOutlookCalendarList(mockAccount);

    expect(result).toHaveLength(2);
    expect(result).toEqual([
      { id: 'cal-1', name: 'Calendar 1' },
      { id: 'cal-2', name: 'Calendar 2' }
    ]);
    expect(makeAuthenticatedRequest).toHaveBeenCalledTimes(1);
    expect(makeAuthenticatedRequest).toHaveBeenCalledWith(
      'valid-token',
      'https://graph.microsoft.com/v1.0/me/calendars?$top=100'
    );
  });

  it('fetches multiple pages when @odata.nextLink is present', async () => {
    (makeAuthenticatedRequest as jest.Mock)
      .mockResolvedValueOnce({
        value: Array.from({ length: 10 }, (_, i) => ({
          id: `cal-${i + 1}`,
          name: `Calendar ${i + 1}`
        })),
        '@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/calendars?$top=100&$skip=10'
      })
      .mockResolvedValueOnce({
        value: Array.from({ length: 5 }, (_, i) => ({
          id: `cal-${i + 11}`,
          name: `Calendar ${i + 11}`
        }))
      });

    const result = await fetchOutlookCalendarList(mockAccount);

    expect(result).toHaveLength(15);
    expect(result[0].name).toBe('Calendar 1');
    expect(result[14].name).toBe('Calendar 15');

    expect(makeAuthenticatedRequest).toHaveBeenCalledTimes(2);
    expect(makeAuthenticatedRequest).toHaveBeenNthCalledWith(
      1,
      'valid-token',
      'https://graph.microsoft.com/v1.0/me/calendars?$top=100'
    );
    expect(makeAuthenticatedRequest).toHaveBeenNthCalledWith(
      2,
      'valid-token',
      'https://graph.microsoft.com/v1.0/me/calendars?$top=100&$skip=10'
    );
  });
});
