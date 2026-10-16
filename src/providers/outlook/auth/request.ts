import { requestUrl } from 'obsidian';

export class OutlookApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public body?: unknown
  ) {
    super(message);
    this.name = 'OutlookApiError';
  }
}

export async function makeAuthenticatedRequest<T = unknown>(
  token: string,
  url: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
  body?: object,
  extraHeaders?: Record<string, string>
): Promise<T> {
  try {
    const response = await requestUrl({
      url,
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...extraHeaders
      },
      body: body ? JSON.stringify(body) : undefined
    });

    if (response.status === 204) {
      return true as unknown as T;
    }

    return response.json as T;
  } catch (e: unknown) {
    const err = e as { status?: number; body?: unknown };
    console.error('Outlook API Request Failed:', {
      url,
      status: err.status,
      response: err.body
    });

    let message = 'Outlook API request failed.';
    if (err.status) {
      message += ` Status: ${err.status}`;
    }

    throw new OutlookApiError(message, err.status, err.body);
  }
}
