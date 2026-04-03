import { NextResponse } from "next/server";
import { isCarwashAuthorized } from "@/lib/api-auth";
import { tapJcardAndCharge } from "@/lib/customers";

export const runtime = "nodejs";

/**
 * POST JSON { "jcard": "<card uid>" } — aliases: rfid, uid, cardId, id
 * Same auth as /api/sales: Authorization: Bearer <CARWASH_API_KEY> or X-API-Key.
 *
 * Deducts JCARD_TAP_CHARGE_PESOS (default 4) from `balance` for the matching id
 * in MONGODB_CUSTOMERS_DB / MONGODB_CUSTOMERS_COLLECTION (default carwash.customers).
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

  if (!jcard.trim()) {
    return NextResponse.json(
      { error: 'Missing "jcard" (or rfid / uid / cardId) string in JSON body.' },
      { status: 400 },
    );
  }

  const outcome = await tapJcardAndCharge(jcard);

  if (!outcome.ok && outcome.error === "not_found") {
    return NextResponse.json(
      { ok: false, error: "Card not registered", jcard: jcard.trim() },
      { status: 404 },
    );
  }

  if (!outcome.ok && outcome.error === "insufficient") {
    return NextResponse.json(
      {
        ok: false,
        error: "Insufficient balance",
        jcard: jcard.trim(),
        balance: outcome.balance,
      },
      { status: 402 },
    );
  }

  if (outcome.ok) {
    return NextResponse.json({
      ok: true,
      jcard: outcome.jcard,
      charged: outcome.charged,
      balanceBefore: outcome.balanceBefore,
      balanceAfter: outcome.balanceAfter,
    });
  }

  return NextResponse.json({ error: "Unexpected" }, { status: 500 });
}
