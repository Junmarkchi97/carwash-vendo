export function getConfiguredApiKey(): string | undefined {
  const k = process.env.CARWASH_API_KEY;
  return k && k.length > 0 ? k : undefined;
}

/** Key sent as `Authorization: Bearer …` or `X-API-Key` (same as device APIs). */
export function getPresentedApiKeyFromRequest(req: Request): string | undefined {
  const auth = req.headers.get("authorization");
  const xKey = req.headers.get("x-api-key");
  if (auth?.startsWith("Bearer ")) {
    return auth.slice("Bearer ".length);
  }
  return xKey ?? undefined;
}

/**
 * Validates the admin/device key. Used by API routes (and `isSettingsSaveAllowed` when no key is configured).
 */
export function isCarwashKeyValid(presentedKey: string | undefined): boolean {
  const configured = getConfiguredApiKey();
  if (!configured) {
    return process.env.CARWASH_ALLOW_NO_KEY === "true";
  }
  const trimmed = presentedKey?.trim();
  return trimmed === configured;
}

export function isCarwashAuthorized(req: Request): boolean {
  return isCarwashKeyValid(getPresentedApiKeyFromRequest(req));
}

/**
 * Next.js server actions for `/settings` (no API key in the browser).
 * If `CARWASH_API_KEY` is set, also set `CARWASH_ALLOW_SETTINGS_WITHOUT_KEY=true` to allow saves from the UI.
 */
export function isSettingsSaveAllowed(): boolean {
  if (process.env.CARWASH_ALLOW_SETTINGS_WITHOUT_KEY === "true") {
    return true;
  }
  return isCarwashKeyValid(undefined);
}
