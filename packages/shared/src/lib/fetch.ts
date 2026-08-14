/**
 * The Vercel Node builder can provide an incomplete ambient Fetch API type.
 * Keep the runtime contract explicit at this boundary; Node 24 and Vercel
 * both provide the full Fetch implementation used here.
 */
export interface ExternalFetchInit {
  method: string;
  headers: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}

export interface ExternalFetchResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
}

export function fetchExternal(
  input: string,
  init: ExternalFetchInit,
): Promise<ExternalFetchResponse> {
  return fetch(input, init as never) as unknown as Promise<ExternalFetchResponse>;
}
