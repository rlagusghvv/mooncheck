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
  voterHashes?: Record<string, Record<Lane, number>>;
  comments: MooncheckComment[];
  status: "판정중" | "종결" | "핫케이스";
  createdAt: string;
  voteCount: number;
};

export type PublicMooncheckCase = Omit<MooncheckCase, "voterHashes">;

type CreateCaseInput = {
  title: string;
  clipUrl: string;
  timecode?: string;
  tier: string;
  issue: string;
};

type VoteInput = Partial<Record<Lane, number>>;

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

function distributeToPercentages(values: number[]) {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return getZeroVoteTotals();

  const raw = values.map((value) => (value / total) * 100);
  const floors = raw.map(Math.floor);
  let remainder = 100 - floors.reduce((sum, value) => sum + value, 0);
  const order = raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction);

  order.forEach(({ index }) => {
    if (remainder <= 0) return;
    floors[index] += 1;
    remainder -= 1;
  });

  return lanes.reduce((normalized, lane, index) => {
    normalized[lane] = floors[index];
    return normalized;
  }, getZeroVoteTotals());
}

function normalizeVoteInput(input: Partial<VoteInput>) {
  const values = lanes.map((lane) => {
    const value = Number(input[lane]);
    return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0;
  });
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0) throw new Error("과실비율을 먼저 입력해주세요.");
  return distributeToPercentages(values);
}

function normalizeLegacyPositions(input: Partial<VoteInput>) {
  const values = lanes.map((lane) => {
    const value = Number(input[lane]);
    return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  });
  return distributeToPercentages(values);
}

function getEmptyPositions() {
  return { 탑: 0, 정글: 0, 미드: 0, 원딜: 0, 서폿: 0 } satisfies Record<Lane, number>;
}

function getZeroVoteTotals() {
  return { 탑: 0, 정글: 0, 미드: 0, 원딜: 0, 서폿: 0 } satisfies Record<Lane, number>;
}

function getVoteTotals(item: MooncheckCase) {
  const existingTotals = item.voteTotals;
  if (existingTotals) {
    return lanes.reduce((normalizedTotals, lane) => {
      const value = Number(existingTotals[lane]);
      normalizedTotals[lane] = Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
      return normalizedTotals;
    }, getZeroVoteTotals());
  }

  if (item.voteCount <= 0) return getZeroVoteTotals();

  const positions = normalizeLegacyPositions(item.positions);
  return lanes.reduce((totals, lane) => {
    totals[lane] = positions[lane] * item.voteCount;
    return totals;
  }, getZeroVoteTotals());
}

function getPositionsFromTotals(totals: Record<Lane, number>) {
  const values = lanes.map((lane) => {
    const value = Number(totals[lane]);
    return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  });
  return distributeToPercentages(values);
}

function normalizeCase(item: MooncheckCase) {
  const voteTotals = getVoteTotals(item);
  return {
    ...item,
    positions: item.voteCount > 0 ? getPositionsFromTotals(voteTotals) : getEmptyPositions(),
    voteTotals,
    voterHashes: item.voterHashes ?? {}
  };
}

function toPublicCase(item: MooncheckCase): PublicMooncheckCase {
  const { voterHashes: _voterHashes, ...publicCase } = normalizeCase(item);
  return publicCase;
}

export async function listCases() {
  const cases = (await readCases()).map(toPublicCase);
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
      voterHashes: {},
      comments: [],
      status: "판정중",
      createdAt: new Date().toISOString(),
      voteCount: 0
    };

    return { cases: [createdCase, ...cases], result: toPublicCase(createdCase) };
  });
}

export async function getVoteStatus(caseId: string, voterHash: string) {
  const cases = await readCases();
  const targetCase = cases.find((item) => item.id === caseId);
  if (!targetCase) throw new Error("케이스를 찾을 수 없습니다.");

  const normalizedCase = normalizeCase(targetCase);
  const vote = normalizedCase.voterHashes?.[voterHash];
  return {
    hasVoted: Boolean(vote),
    vote,
    case: toPublicCase(normalizedCase)
  };
}

export async function addVote(caseId: string, vote: VoteInput, voterHash: string) {
  return mutateCases((cases) => {
    const index = cases.findIndex((item) => item.id === caseId);
    if (index === -1) throw new Error("케이스를 찾을 수 없습니다.");

    const currentCase = normalizeCase(cases[index]);
    if (currentCase.voterHashes?.[voterHash]) throw new Error("이미 투표한 사건입니다.");

    const submittedVote = normalizeVoteInput(vote);
    const voteTotals = lanes.reduce((totals, lane) => {
      totals[lane] = currentCase.voteTotals![lane] + submittedVote[lane];
      return totals;
    }, getZeroVoteTotals());
    const voteCount = currentCase.voteCount + 1;
    const updatedCase = {
      ...currentCase,
      positions: getPositionsFromTotals(voteTotals),
      voteTotals,
      voterHashes: {
        ...(currentCase.voterHashes ?? {}),
        [voterHash]: submittedVote
      },
      voteCount
    };

    cases[index] = updatedCase;
    return { cases, result: toPublicCase(updatedCase) };
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
    return { cases, result: toPublicCase(updatedCase) };
  });
}
