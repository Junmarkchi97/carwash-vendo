import { NextResponse } from "next/server";
import { recordSale } from "@/lib/sales";

export const runtime = "nodejs";

function getConfiguredApiKey(): string | undefined {
  const k = process.env.CARWASH_API_KEY;
  return k && k.length > 0 ? k : undefined;
}

function isAuthorized(req: Request): boolean {
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

/**
 * ESP32: POST JSON { "count": 1 } (or quantity / sales). Headers: Authorization: Bearer <CARWASH_API_KEY> or X-API-Key.
 */
export async function POST(req: Request) {
  if (!isAuthorized(req)) {
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

  const { id } = await recordSale(quantity);
  return NextResponse.json({ ok: true, id, quantity });
}
