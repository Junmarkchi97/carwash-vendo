import { NextResponse } from "next/server";
import { isCarwashAuthorized } from "@/lib/api-auth";
import { CURRENCY_CODE } from "@/lib/currency";
import { getJcardTapChargePesos, setJcardTapChargePesos } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isCarwashAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const s = await getJcardTapChargePesos();
  return NextResponse.json({
    ok: true,
    jcardTapChargePesos: s.value,
    currency: CURRENCY_CODE,
    source: s.source,
    updatedAt: s.updatedAt ? s.updatedAt.toISOString() : null,
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
  const raw = body?.jcardTapChargePesos ?? body?.tapChargePesos ?? body?.charge;
  const n = typeof raw === "string" ? Number(raw) : typeof raw === "number" ? raw : NaN;

  if (!Number.isFinite(n) || n <= 0) {
    return NextResponse.json(
      { error: 'Expected positive number in "jcardTapChargePesos".' },
      { status: 400 },
    );
  }

  try {
    const saved = await setJcardTapChargePesos(n);
    return NextResponse.json({
      ok: true,
      jcardTapChargePesos: saved.value,
      currency: CURRENCY_CODE,
      updatedAt: saved.updatedAt.toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

