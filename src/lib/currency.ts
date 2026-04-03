/** ISO 4217 — all vendo money amounts are Philippine peso (PHP). */
export const CURRENCY_CODE = "PHP" as const;

/** Word form (settings copy, APIs). */
export function formatPhp(amount: number): string {
  return `PHP ${amount}`;
}

/** Philippine peso sign (₱) for dashboards and lists. */
export function formatPeso(amount: number): string {
  const n = Math.round(amount);
  return `₱${n.toLocaleString("en-PH")}`;
}
