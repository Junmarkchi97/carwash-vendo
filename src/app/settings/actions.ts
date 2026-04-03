"use server";

import { isSettingsSaveAllowed } from "@/lib/api-auth";
import { CURRENCY_CODE } from "@/lib/currency";
import { updateJcardPricingSettings } from "@/lib/settings";

export async function saveJcardPricingAction(input: {
  jcardTapChargePesos: number;
  jcardTapDurationSeconds: number;
}) {
  if (!isSettingsSaveAllowed()) {
    return { ok: false as const, error: "Unauthorized" };
  }
  const charge = Math.floor(Number(input.jcardTapChargePesos));
  const durationSeconds = Math.floor(Number(input.jcardTapDurationSeconds));
  if (!Number.isFinite(charge) || charge <= 0) {
    return { ok: false as const, error: "Expected a positive integer for tap charge (PHP)." };
  }
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return { ok: false as const, error: "Expected a positive integer for duration (total seconds)." };
  }
  try {
    const saved = await updateJcardPricingSettings({
      jcardTapChargePesos: charge,
      jcardTapDurationSeconds: durationSeconds,
    });
    return {
      ok: true as const,
      jcardTapChargePesos: saved.jcardTapChargePesos,
      jcardTapDurationSeconds: saved.jcardTapDurationSeconds,
      currency: CURRENCY_CODE,
      updatedAt: saved.updatedAt.toISOString(),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false as const, error: message };
  }
}
