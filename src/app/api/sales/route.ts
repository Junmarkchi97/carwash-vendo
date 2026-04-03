import { NextResponse } from "next/server";
import { isCarwashAuthorized } from "@/lib/api-auth";
import { CURRENCY_CODE } from "@/lib/currency";
import { recordSale } from "@/lib/sales";

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
 * - Coin: `{}` or any body without `jcard` / rfid aliases
 * Mongo `sales_events`: `createdAt`, `source`, `price` (+ `_id`).
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
  const { id, createdAt, source, price } = await recordSale(jcard);

  if (source === "jcard") {
    return NextResponse.json({
      ok: true,
      id,
      source: "jcard",
      jcard,
      price,
      currency: CURRENCY_CODE,
      time: createdAt.toISOString(),
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
