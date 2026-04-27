import { NextResponse } from "next/server";

import { addVote } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const updatedCase = await addVote(id, await request.json());
    return NextResponse.json({ case: updatedCase });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "투표를 저장하지 못했습니다." },
      { status: 400 }
    );
  }
}
