import { NextResponse } from "next/server";
import { isCarwashAuthorized } from "@/lib/api-auth";
import { listCustomers } from "@/lib/customers";
import { getJcardTapChargePesos, getJcardTapDurationSeconds } from "@/lib/settings";

export const runtime = "nodejs";

/**
 * GET — customers plus `chargePerTap` (PHP) and `timePerTap` (seconds) from admin settings.
 * Per-row: `jcard`, `balance`, `name`.
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

  const [customers, tapCharge, tapDuration] = await Promise.all([
    listCustomers(),
    getJcardTapChargePesos(),
    getJcardTapDurationSeconds(),
  ]);

  return NextResponse.json({
    ok: true,
    chargePerTap: tapCharge.value,
    timePerTap: tapDuration.value,
    customers: customers.map((c) => ({
      jcard: c.jcard,
      balance: c.balancePhp,
      name: c.name,
    })),
  });
}
