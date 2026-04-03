import { NextResponse } from "next/server";
import { isCarwashAuthorized } from "@/lib/api-auth";
import { CURRENCY_CODE } from "@/lib/currency";
import {
  getJcardTapChargePesos,
  getJcardTapDurationSeconds,
  updateJcardPricingSettings,
} from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isCarwashAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const [charge, duration] = await Promise.all([
    getJcardTapChargePesos(),
    getJcardTapDurationSeconds(),
  ]);
  const dates = [charge.updatedAt, duration.updatedAt].filter((d): d is Date => d != null);
  const updatedAt =
    dates.length > 0
      ? new Date(Math.max(...dates.map((d) => d.getTime()))).toISOString()
      : null;
  return NextResponse.json({
    ok: true,
    jcardTapChargePesos: charge.value,
    jcardTapDurationSeconds: duration.value,
    currency: CURRENCY_CODE,
    jcardTapChargeSource: charge.source,
    jcardTapDurationSource: duration.source,
    updatedAt,
  });
}

export async function POST(req: Request) {
  if (!isCarwashAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const body = json && typeof json === "object" ? (json as Record<string, unknown>) : null;

  const rawCharge =
    body?.jcardTapChargePesos ?? body?.tapChargePesos ?? body?.charge;
  const rawDurationSec = body?.jcardTapDurationSeconds ?? body?.durationSeconds ?? body?.tapDurationSeconds;
  const rawLegacyMinutes =
    body?.jcardTapMinutesPerTap ?? body?.jcardTapMinutes ?? body?.minutesPerTap ?? body?.washMinutes;

  const hasCharge = rawCharge !== undefined && rawCharge !== null && rawCharge !== "";
  const hasDurationSec = rawDurationSec !== undefined && rawDurationSec !== null && rawDurationSec !== "";
  const hasLegacyMinutes =
    rawLegacyMinutes !== undefined && rawLegacyMinutes !== null && rawLegacyMinutes !== "";

  if (!hasCharge && !hasDurationSec && !hasLegacyMinutes) {
    return NextResponse.json(
      {
        error:
          'Provide "jcardTapChargePesos" and/or duration ("jcardTapDurationSeconds" or legacy whole minutes as "jcardTapMinutesPerTap").',
      },
      { status: 400 },
    );
  }

  const chargeNum =
    typeof rawCharge === "string"
      ? Number(rawCharge)
      : typeof rawCharge === "number"
        ? rawCharge
        : NaN;
  const durationSecNum =
    typeof rawDurationSec === "string"
      ? Number(rawDurationSec)
      : typeof rawDurationSec === "number"
        ? rawDurationSec
        : NaN;
  const legacyMinNum =
    typeof rawLegacyMinutes === "string"
      ? Number(rawLegacyMinutes)
      : typeof rawLegacyMinutes === "number"
        ? rawLegacyMinutes
        : NaN;

  let resolvedDurationSeconds: number | undefined;
  if (hasDurationSec) {
    if (!Number.isFinite(durationSecNum) || durationSecNum <= 0) {
      return NextResponse.json(
        { error: 'Expected positive number in "jcardTapDurationSeconds".' },
        { status: 400 },
      );
    }
    resolvedDurationSeconds = Math.floor(durationSecNum);
  } else if (hasLegacyMinutes) {
    if (!Number.isFinite(legacyMinNum) || legacyMinNum <= 0) {
      return NextResponse.json(
        { error: 'Expected positive number in "jcardTapMinutesPerTap" (whole minutes; prefer "jcardTapDurationSeconds").' },
        { status: 400 },
      );
    }
    resolvedDurationSeconds = Math.floor(legacyMinNum) * 60;
  }

  if (hasCharge && (!Number.isFinite(chargeNum) || chargeNum <= 0)) {
    return NextResponse.json(
      { error: 'Expected positive number in "jcardTapChargePesos".' },
      { status: 400 },
    );
  }

  try {
    const saved = await updateJcardPricingSettings({
      ...(hasCharge ? { jcardTapChargePesos: chargeNum } : {}),
      ...(resolvedDurationSeconds !== undefined
        ? { jcardTapDurationSeconds: resolvedDurationSeconds }
        : {}),
    });
    return NextResponse.json({
      ok: true,
      jcardTapChargePesos: saved.jcardTapChargePesos,
      jcardTapDurationSeconds: saved.jcardTapDurationSeconds,
      currency: CURRENCY_CODE,
      updatedAt: saved.updatedAt.toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
