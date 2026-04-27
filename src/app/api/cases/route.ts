import { NextResponse } from "next/server";

import { createCase, listCases } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const accept = request.headers.get("accept") || "";
  if (accept.includes("text/html")) {
    return NextResponse.redirect("https://mooncheck.splui.com/");
  }

  return NextResponse.json({ cases: await listCases() });
}

export async function POST(request: Request) {
  try {
    const createdCase = await createCase(await request.json());
    return NextResponse.json({ case: createdCase }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "케이스를 생성하지 못했습니다." },
      { status: 400 }
    );
  }
}
