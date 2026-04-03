import { NextResponse } from "next/server";
import { isCarwashAuthorized } from "@/lib/api-auth";
import { CURRENCY_CODE } from "@/lib/currency";
import { JcardBalanceDeductionError, recordSale } from "@/lib/sales";

export const runtime = "nodejs";

/** Primary key `jcard`; legacy aliases `rfid`, `uid`, `cardId`. */
function parseJcard(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const raw = o.jcard ?? o.rfid ?? o.uid ?? o.cardId;
  if (typeof raw === "string" && raw.trim() !== "") return raw.trim();
  if (typeof raw === "number" && Number.isFinite(raw)) return String(Math.trunc(raw));
  return null;
}

/**
 * POST JSON (one event per request):
 * - JCard: { "jcard": "<uid>" } (optional legacy keys ignored: count, quantity, sales)
 *   — deducts the configured tap charge from `customers.balance` for that UID, then logs `sales_events`.
 *   If a duplicate event exists within `JCARD_SALES_DEDUPE_MS` (e.g. after `POST /api/jcard/tap`), the
 *   existing row is returned and balance is not deducted again.
 * - Coin: `{}` or any body without `jcard` / rfid aliases
 * Mongo `sales_events`: `createdAt`, `source`, `price`, optional `jcard` (+ `_id`).
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

  const jcard = parseJcard(json);

  let sale: Awaited<ReturnType<typeof recordSale>>;
  try {
    sale = await recordSale(jcard, { deductJcardBalance: Boolean(jcard) });
  } catch (e) {
    if (e instanceof JcardBalanceDeductionError) {
      if (e.code === "not_found") {
        return NextResponse.json(
          { ok: false, error: "Card not registered", jcard },
          { status: 404 },
        );
      }
      return NextResponse.json(
        {
          ok: false,
          error: "Insufficient balance",
          jcard,
          balance: e.balance,
          currency: CURRENCY_CODE,
        },
        { status: 402 },
      );
    }
    throw e;
  }

  const { id, createdAt, source, price, balanceBefore, balanceAfter } = sale;

  if (source === "jcard") {
    return NextResponse.json({
      ok: true,
      id,
      source: "jcard",
      jcard,
      price,
      currency: CURRENCY_CODE,
      time: createdAt.toISOString(),
      ...(balanceBefore != null && balanceAfter != null
        ? { balanceBefore, balanceAfter }
        : {}),
    });
  }

  return NextResponse.json({
    ok: true,
    id,
    source: "coin",
    price,
    currency: CURRENCY_CODE,
    time: createdAt.toISOString(),
  });
}
