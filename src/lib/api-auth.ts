export function getConfiguredApiKey(): string | undefined {
  const k = process.env.CARWASH_API_KEY;
  return k && k.length > 0 ? k : undefined;
}

export function isCarwashAuthorized(req: Request): boolean {
  const key = getConfiguredApiKey();
  if (!key) {
    return process.env.CARWASH_ALLOW_NO_KEY === "true";
  }
  const auth = req.headers.get("authorization");
  const xKey = req.headers.get("x-api-key");
  if (auth?.startsWith("Bearer ")) {
    return auth.slice("Bearer ".length) === key;
  }
  return xKey === key;
}
