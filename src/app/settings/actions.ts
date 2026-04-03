"use server";

import { isCarwashKeyValid } from "@/lib/api-auth";
import { CURRENCY_CODE } from "@/lib/currency";
import { setJcardTapChargePesos } from "@/lib/settings";

export async function saveJcardTapChargePesosAction(
  apiKey: string | undefined,
  jcardTapChargePesos: number,
) {
  if (!isCarwashKeyValid(apiKey)) {
    return { ok: false as const, error: "Unauthorized" };
  }
  const n = Math.floor(Number(jcardTapChargePesos));
  if (!Number.isFinite(n) || n <= 0) {
    return { ok: false as const, error: "Expected a positive integer for tap charge (PHP)." };
  }
  try {
    const saved = await setJcardTapChargePesos(n);
    return {
      ok: true as const,
      jcardTapChargePesos: saved.value,
      currency: CURRENCY_CODE,
      updatedAt: saved.updatedAt.toISOString(),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false as const, error: message };
  }
}
