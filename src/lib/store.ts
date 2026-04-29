import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type Lane = "탑" | "정글" | "미드" | "원딜" | "서폿";

export type MooncheckComment = {
  id: string;
  body: string;
  authorName: string;
  createdAt: string;
};

export type MooncheckCase = {
  id: string;
  title: string;
  category: string;
  tier: string;
  patch: string;
  clipUrl: string;
  timecode: string;
  issue: string;
  positions: Record<Lane, number>;
  voteTotals?: Record<Lane, number>;
  comments: MooncheckComment[];
  status: "판정중" | "종결" | "핫케이스";
  createdAt: string;
  voteCount: number;
};

type CreateCaseInput = {
  title: string;
  clipUrl: string;
  timecode?: string;
  tier: string;
  issue: string;
};

type VoteInput = Record<Lane, number>;

const lanes: Lane[] = ["탑", "정글", "미드", "원딜", "서폿"];

const dataDir = path.join(process.cwd(), ".mooncheck-data");
const casesPath = path.join(dataDir, "cases.json");
let mutationQueue = Promise.resolve();

async function writeCases(cases: MooncheckCase[]) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(casesPath, `${JSON.stringify(cases, null, 2)}\n`, "utf-8");
}

async function readCases() {
  try {
    return JSON.parse(await readFile(casesPath, "utf-8")) as MooncheckCase[];
  } catch (error) {
    const code = error instanceof Error && "code" in error ? String(error.code) : "";
    if (code !== "ENOENT") throw error;
    await writeCases([]);
    return [];
  }
}

async function mutateCases<T>(
  updater: (cases: MooncheckCase[]) => Promise<{ cases: MooncheckCase[]; result: T }> | { cases: MooncheckCase[]; result: T }
) {
  const operation = mutationQueue.then(async () => {
    const currentCases = await readCases();
    const { cases, result } = await updater(currentCases);
    await writeCases(cases);
    return result;
  });

  mutationQueue = operation.then(
    () => undefined,
    () => undefined
  );

  return operation;
}

function validateCreateInput(input: Partial<CreateCaseInput>) {
  const title = input.title?.trim();
  const clipUrl = input.clipUrl?.trim();
  const issue = input.issue?.trim();

  if (!title || title.length < 4) throw new Error("사건 제목은 4자 이상이어야 합니다.");
  if (!clipUrl) throw new Error("YouTube 링크가 필요합니다.");
  if (!issue || issue.length < 5) throw new Error("판정 쟁점은 5자 이상이어야 합니다.");

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(clipUrl);
  } catch {
    throw new Error("올바른 YouTube URL을 입력해주세요.");
  }

  const hostname = parsedUrl.hostname.replace(/^www\./, "");
  if (hostname !== "youtube.com" && hostname !== "youtu.be") {
    throw new Error("YouTube 링크만 등록할 수 있습니다.");
  }

  return {
    title,
    clipUrl,
    issue,
    tier: input.tier?.trim() || "Gold",
    timecode: input.timecode?.trim() || "타임스탬프 미지정"
  };
}

function normalizePositions(input: Partial<VoteInput>) {
  const values = lanes.map((lane) => {
    const value = Number(input[lane]);
    return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0;
  });
  const total = values.reduce((sum, value) => sum + value, 0);

  if (total <= 0) return { 탑: 20, 정글: 20, 미드: 20, 원딜: 20, 서폿: 20 };

  let used = 0;
  const normalized = {} as Record<Lane, number>;
  lanes.forEach((lane, index) => {
    if (index === lanes.length - 1) {
      normalized[lane] = 100 - used;
      return;
    }

    const adjusted = Math.round((values[index] / total) * 100);
    normalized[lane] = adjusted;
    used += adjusted;
  });
  return normalized;
}

function getEmptyPositions() {
  return { 탑: 20, 정글: 20, 미드: 20, 원딜: 20, 서폿: 20 } satisfies Record<Lane, number>;
}

function getZeroVoteTotals() {
  return { 탑: 0, 정글: 0, 미드: 0, 원딜: 0, 서폿: 0 } satisfies Record<Lane, number>;
}

function getVoteTotals(item: MooncheckCase) {
  const existingTotals = item.voteTotals;
  if (existingTotals) {
    return lanes.reduce((totals, lane) => {
      const value = Number(existingTotals[lane]);
      totals[lane] = Number.isFinite(value) && value > 0 ? value : 0;
      return totals;
    }, getZeroVoteTotals());
  }

  if (item.voteCount <= 0) return getZeroVoteTotals();

  const positions = normalizePositions(item.positions);
  return lanes.reduce((totals, lane) => {
    totals[lane] = positions[lane] * item.voteCount;
    return totals;
  }, getZeroVoteTotals());
}

function getPositionsFromTotals(totals: Record<Lane, number>) {
  return normalizePositions(totals);
}

function normalizeCase(item: MooncheckCase) {
  const voteTotals = getVoteTotals(item);
  return {
    ...item,
    positions: item.voteCount > 0 ? getPositionsFromTotals(voteTotals) : getEmptyPositions(),
    voteTotals
  };
}

export async function listCases() {
  const cases = (await readCases()).map(normalizeCase);
  return [...cases].sort((a, b) => {
    if (a.status === "핫케이스" && b.status !== "핫케이스") return -1;
    if (a.status !== "핫케이스" && b.status === "핫케이스") return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export async function createCase(input: Partial<CreateCaseInput>) {
  const value = validateCreateInput(input);
  return mutateCases((cases) => {
    const createdCase: MooncheckCase = {
      id: `case-${Date.now()}`,
      ...value,
      category: "신규 제보",
      patch: "16.8",
      positions: getEmptyPositions(),
      voteTotals: getZeroVoteTotals(),
      comments: [],
      status: "판정중",
      createdAt: new Date().toISOString(),
      voteCount: 0
    };

    return { cases: [createdCase, ...cases], result: createdCase };
  });
}

export async function addVote(caseId: string, vote: Partial<VoteInput>) {
  return mutateCases((cases) => {
    const index = cases.findIndex((item) => item.id === caseId);
    if (index === -1) throw new Error("케이스를 찾을 수 없습니다.");

    const currentCase = normalizeCase(cases[index]);
    const submittedVote = normalizePositions(vote);
    const voteTotals = lanes.reduce((totals, lane) => {
      totals[lane] = currentCase.voteTotals![lane] + submittedVote[lane];
      return totals;
    }, getZeroVoteTotals());
    const voteCount = currentCase.voteCount + 1;
    const updatedCase = {
      ...currentCase,
      positions: getPositionsFromTotals(voteTotals),
      voteTotals,
      voteCount
    };

    cases[index] = updatedCase;
    return { cases, result: updatedCase };
  });
}

export async function addComment(caseId: string, body: unknown) {
  const commentBody = typeof body === "string" ? body.trim() : "";
  if (commentBody.length < 2) throw new Error("댓글은 2자 이상이어야 합니다.");

  return mutateCases((cases) => {
    const index = cases.findIndex((item) => item.id === caseId);
    if (index === -1) throw new Error("케이스를 찾을 수 없습니다.");

    const currentCase = normalizeCase(cases[index]);
    const comment: MooncheckComment = {
      id: `comment-${Date.now()}`,
      body: commentBody,
      authorName: `판정단${currentCase.comments.length + 1}`,
      createdAt: new Date().toISOString()
    };
    const updatedCase = {
      ...currentCase,
      comments: [comment, ...currentCase.comments]
    };

    cases[index] = updatedCase;
    return { cases, result: updatedCase };
  });
}
