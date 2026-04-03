import { after, NextResponse } from "next/server";
import { isCarwashAuthorized } from "@/lib/api-auth";
import { tapJcardAndCharge } from "@/lib/customers";
import { CURRENCY_CODE } from "@/lib/currency";
import { recordRfidTapEvent } from "@/lib/sales";
import { getJcardTapDurationSeconds } from "@/lib/settings";

export const runtime = "nodejs";

/**
 * POST JSON { "jcard": "<card uid>" } — aliases: rfid, uid, cardId, id
 * Same auth as /api/sales: Authorization: Bearer <CARWASH_API_KEY> or X-API-Key.
 *
 * Deducts the configured tap charge (PHP, default from env or DB) from `balance`
 * for the matching id in MONGODB_CUSTOMERS_DB / MONGODB_CUSTOMERS_COLLECTION
 * (default carwash_vendo.customers). Monetary fields use currency PHP (ISO 4217).
 * On success, appends `sales_events`: `source: "jcard"`, `jcard`, `price` (+ `createdAt`, `_id`).
 * Response includes `jcardTapDurationSeconds` and `jcardTapDuration` { minutes, seconds } for wash timers.
 */
export async function POST(req: Request) {
  if (!isCarwashAuthorized(req)) {
    return NextResponse.json(
      {
        error:
          "Unauthorized. Set CARWASH_API_KEY and send Bearer or X-API-Key.",
      },
      { status: 401 },
    );
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const body = json && typeof json === "object" ? (json as Record<string, unknown>) : null;
  const raw = body?.jcard ?? body?.rfid ?? body?.uid ?? body?.cardId ?? body?.id;
  const jcard = typeof raw === "string" ? raw : typeof raw === "number" ? String(raw) : "";
  const normalizedJcard = jcard.trim();

  if (!normalizedJcard) {
    return NextResponse.json(
      { error: 'Missing "jcard" (or rfid / uid / cardId) string in JSON body.' },
      { status: 400 },
    );
  }

  const outcome = await tapJcardAndCharge(normalizedJcard);

  if (!outcome.ok && outcome.error === "not_found") {
    return NextResponse.json(
      { ok: false, error: "Card not registered", jcard: normalizedJcard },
      { status: 404 },
    );
  }

  if (!outcome.ok && outcome.error === "insufficient") {
    return NextResponse.json(
      {
        ok: false,
        error: "Insufficient balance",
        jcard: normalizedJcard,
        balance: outcome.balance,
        currency: CURRENCY_CODE,
      },
      { status: 402 },
    );
  }

  if (outcome.ok) {
    const { value: jcardTapDurationSeconds } = await getJcardTapDurationSeconds();
    const jcardTapDuration = {
      minutes: Math.floor(jcardTapDurationSeconds / 60),
      seconds: jcardTapDurationSeconds % 60,
    };

    // Respond immediately for device UX; sales logging continues after response.
    after(async () => {
      try {
        await recordRfidTapEvent(outcome.jcard, outcome.charged);
      } catch (err) {
        console.error("jcard/tap: failed to write sales_events", err);
      }
    });

    return NextResponse.json({
      ok: true,
      jcard: outcome.jcard,
      charged: outcome.charged,
      price: outcome.charged,
      balanceBefore: outcome.balanceBefore,
      balanceAfter: outcome.balanceAfter,
      currency: CURRENCY_CODE,
      jcardTapDurationSeconds,
      jcardTapDuration,
      startWash: true,
      approved: true,
      washCreditPhp: outcome.charged,
      salesEventLogged: "queued",
    });
  }

  return NextResponse.json({ error: "Unexpected" }, { status: 500 });
}
