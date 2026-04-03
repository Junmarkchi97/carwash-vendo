import { NextResponse } from "next/server";
import { isCarwashAuthorized } from "@/lib/api-auth";
import { recordSale } from "@/lib/sales";

export const runtime = "nodejs";

function parseQuantity(body: unknown): number | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const raw = o.count ?? o.quantity ?? o.sales;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const n = Math.floor(raw);
    return n > 0 ? n : null;
  }
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Math.floor(Number(raw));
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

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
 * POST JSON:
 * - JCard: { "jcard": "<uid>", "count": 1 } (aliases: rfid, uid, cardId)
 * - Coin slot: { "count": 1 } or { "count": 1, "source": "coin" }
 * Headers: Authorization: Bearer <CARWASH_API_KEY> or X-API-Key.
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

  const quantity = parseQuantity(json);
  if (quantity === null) {
    return NextResponse.json(
      {
        error:
          'Expected a positive integer in "count", "quantity", or "sales".',
      },
      { status: 400 },
    );
  }

  const jcard = parseJcard(json);
  const { id, createdAt, source } = await recordSale(quantity, jcard);

  if (source === "jcard") {
    return NextResponse.json({
      ok: true,
      id,
      quantity,
      source: "jcard",
      jcard,
      time: createdAt.toISOString(),
    });
  }

  return NextResponse.json({
    ok: true,
    id,
    quantity,
    source: "coin",
    time: createdAt.toISOString(),
  });
}
