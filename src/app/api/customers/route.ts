import { NextResponse } from "next/server";
import { isCarwashAuthorized } from "@/lib/api-auth";
import { listCustomers } from "@/lib/customers";

export const runtime = "nodejs";

/**
 * GET — `jcard` + `balance` only (ESP32 sync). No name or timestamps.
 * Data source: MongoDB `MONGODB_CUSTOMERS_DB` / `MONGODB_CUSTOMERS_COLLECTION`
 * (default `carwash_vendo.customers`). Same auth as `/api/jcard/tap` and `/api/sales`:
 * `Authorization: Bearer <CARWASH_API_KEY>` or `X-API-Key`.
 */
export async function GET(req: Request) {
  if (!isCarwashAuthorized(req)) {
    return NextResponse.json(
      {
        error:
          "Unauthorized. Set CARWASH_API_KEY and send Bearer or X-API-Key.",
      },
      { status: 401 },
    );
  }

  const customers = await listCustomers();

  return NextResponse.json({
    ok: true,
    customers: customers.map((c) => ({
      jcard: c.jcard,
      balance: c.balancePhp,
    })),
  });
}
