// obsidian-fetch_caldav.ts
import { requestUrl, RequestUrlParam, request, Platform } from 'obsidian';

function isInvalidStatus(status: number): boolean {
  return !Number.isFinite(status) || status <= 0;
}

function toResponse(r: {
  status: number;
  headers: Record<string, string>;
  text: string;
  arrayBuffer?: ArrayBuffer;
}): Response {
  const text = typeof r.text === 'string' ? r.text : '';
  const isNullBodyStatus = r.status === 204 || r.status === 205 || r.status === 304;
  const resp = new Response(isNullBodyStatus ? null : text, {
    status: r.status,
    headers: r.headers as HeadersInit
  });
  (resp as unknown as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer = () =>
    Promise.resolve(r.arrayBuffer ? r.arrayBuffer : new TextEncoder().encode(text).buffer);
  return resp;
}

async function fallbackMobileRequest(req: RequestUrlParam, rootCause: string): Promise<Response> {
  try {
    const bodyText = await request({
      url: req.url,
      method: req.method,
      headers: req.headers,
      body: req.body
    });

    return new Response(bodyText, { status: 200 });
  } catch (fallbackError) {
    const fallbackMessage =
      fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
    throw new Error(
      `CalDAV request failed on mobile transport. requestUrl error: ${rootCause}; fallback request error: ${fallbackMessage}`,
      { cause: fallbackError }
    );
  }
}

export async function obsidianFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const url =
    typeof input === 'string'
      ? input
      : ((input as unknown as { url?: string }).url ?? (input as unknown as string));
  const method = init?.method ?? 'GET';

  const headers: Record<string, string> = {};
  if (init?.headers) new Headers(init.headers).forEach((v, k) => (headers[k] = v));

  const req: RequestUrlParam = {
    url,
    method,
    headers: Object.keys(headers).length ? headers : undefined,
    body:
      typeof init?.body === 'string'
        ? init.body
        : init?.body !== undefined && init.body !== null
          ? await new Response(init.body as BodyInit).text()
          : undefined,
    throw: false // never throw; let callers inspect status/body
  };

  try {
    const r = await requestUrl(req);

    if (Platform?.isMobile && isInvalidStatus(r.status)) {
      return fallbackMobileRequest(req, `requestUrl returned invalid status ${String(r.status)}`);
    }

    return toResponse({
      status: r.status,
      headers: r.headers,
      text: typeof r.text === 'string' ? r.text : '',
      arrayBuffer: r.arrayBuffer
    });
  } catch (error) {
    if (!Platform?.isMobile) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    return fallbackMobileRequest(req, message);
  }
}
