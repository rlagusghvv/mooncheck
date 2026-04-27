import { NextResponse } from "next/server";

import { addComment } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const updatedCase = await addComment(id, body.body);
    return NextResponse.json({ case: updatedCase });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "댓글을 저장하지 못했습니다." },
      { status: 400 }
    );
  }
}
