import { NextResponse } from "next/server";
import { createHash } from "node:crypto";

import { addVote, getVoteStatus } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function getVoterHash(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || forwardedFor || "unknown";
  const userAgent = request.headers.get("user-agent") || "unknown";
  const salt = process.env.MOONCHECK_VOTE_SALT || "mooncheck-local-vote-salt";
  return createHash("sha256").update(`${salt}:${ip}:${userAgent}`).digest("hex");
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const voteStatus = await getVoteStatus(id, getVoterHash(request));
    return NextResponse.json(voteStatus);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "투표 상태를 확인하지 못했습니다." },
      { status: 400 }
    );
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const updatedCase = await addVote(id, await request.json(), getVoterHash(request));
    return NextResponse.json({ case: updatedCase });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "투표를 저장하지 못했습니다." },
      { status: 400 }
    );
  }
}
