import { ProviderFailureError, RateLimitError, TimeoutError, UnavailableServiceError } from "../../errors/app-error";

export class ProviderHttpClient {
  constructor(private readonly options: { timeoutMs: number; maxRetries: number }, private readonly fetcher: typeof fetch = fetch) {}

  async getJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
    return this.json(url, { headers });
  }
  async postJson(url: string, body: unknown, headers: Record<string, string> = {}): Promise<unknown> {
    return this.json(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
  }
  private async json(url: string, init: RequestInit): Promise<unknown> {
    for (let attempt = 0; attempt <= this.options.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);
      try {
        const response = await this.fetcher(url, { ...init, signal: controller.signal });
        if (response.status === 429) {
          if (attempt < this.options.maxRetries) { await delay(backoff(attempt)); continue; }
          throw new RateLimitError("Provider rate limit reached.");
        }
        if (response.status >= 500) {
          if (attempt < this.options.maxRetries) { await delay(backoff(attempt)); continue; }
          throw new UnavailableServiceError("Provider is temporarily unavailable.");
        }
        if (!response.ok) throw new ProviderFailureError(`Provider returned HTTP ${response.status}.`);
        try { return await response.json(); } catch { throw new ProviderFailureError("Provider returned malformed JSON."); }
      } catch (error) {
        if (error instanceof RateLimitError || error instanceof ProviderFailureError || error instanceof UnavailableServiceError) throw error;
        if (error instanceof Error && error.name === "AbortError") throw new TimeoutError();
        if (attempt >= this.options.maxRetries) throw new UnavailableServiceError("Provider network request failed.");
        await delay(backoff(attempt));
      } finally { clearTimeout(timer); }
    }
    throw new UnavailableServiceError();
  }
}
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const backoff = (attempt: number) => Math.min(1_000 * 2 ** attempt, 4_000);
