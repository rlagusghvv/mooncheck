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

const seedCases: MooncheckCase[] = [
  {
    id: "case-1",
    title: "바텀 3웨이브 박히는데 정글은 유충을 쳤다",
    category: "오브젝트 교환",
    tier: "Emerald",
    patch: "16.8",
    clipUrl: "https://replayit.gg/",
    timecode: "08:14-09:03",
    issue: "상대 정글 위치가 보인 상태에서 바텀 다이브 각을 방치한 게 맞는지",
    positions: { 탑: 4, 정글: 48, 미드: 12, 원딜: 21, 서폿: 15 },
    comments: [
      {
        id: "comment-1",
        authorName: "판정단1",
        body: "08:27 미드가 먼저 라인 권한을 잃어서 정글 혼자 내려가긴 애매함.",
        createdAt: "2026-04-27T00:00:00.000Z"
      },
      {
        id: "comment-2",
        authorName: "판정단2",
        body: "원딜이 빅웨이브 앞에서 체력 관리를 못 한 지분도 큼.",
        createdAt: "2026-04-27T00:01:00.000Z"
      }
    ],
    status: "핫케이스",
    createdAt: "2026-04-27T00:00:00.000Z",
    voteCount: 128
  },
  {
    id: "case-2",
    title: "용 30초 전 귀환 타이밍을 놓친 서폿",
    category: "용 한타",
    tier: "Diamond",
    patch: "16.8",
    clipUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    timecode: "17:42-18:36",
    issue: "시야를 먼저 잡아야 하는 조합에서 늦은 귀환이 패배 원인인지",
    positions: { 탑: 10, 정글: 18, 미드: 7, 원딜: 19, 서폿: 46 },
    comments: [
      {
        id: "comment-3",
        authorName: "판정단1",
        body: "17:55 제어와드가 없는데 강가로 먼저 들어간 판단이 가장 큼.",
        createdAt: "2026-04-27T00:02:00.000Z"
      }
    ],
    status: "판정중",
    createdAt: "2026-04-27T00:02:00.000Z",
    voteCount: 73
  },
  {
    id: "case-3",
    title: "사이드 돌던 탑이 한타 합류 안 한 장면",
    category: "운영",
    tier: "Platinum",
    patch: "16.7",
    clipUrl: "https://replayit.gg/",
    timecode: "24:10-25:02",
    issue: "텔이 없는 탑에게 합류 책임을 물을 수 있는지",
    positions: { 탑: 33, 정글: 11, 미드: 24, 원딜: 20, 서폿: 12 },
    comments: [
      {
        id: "comment-4",
        authorName: "판정단1",
        body: "팀이 먼저 미드 2차 앞까지 나간 게 시작점.",
        createdAt: "2026-04-27T00:04:00.000Z"
      }
    ],
    status: "종결",
    createdAt: "2026-04-27T00:04:00.000Z",
    voteCount: 45
  }
];

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
    await writeCases(seedCases);
    return seedCases;
  }
}

function validateCreateInput(input: Partial<CreateCaseInput>) {
  const title = input.title?.trim();
  const clipUrl = input.clipUrl?.trim();
  const issue = input.issue?.trim();

  if (!title || title.length < 4) throw new Error("사건 제목은 4자 이상이어야 합니다.");
  if (!clipUrl) throw new Error("YouTube 링크가 필요합니다.");
  if (!issue || issue.length < 5) throw new Error("판정 쟁점은 5자 이상이어야 합니다.");

  try {
    new URL(clipUrl);
  } catch {
    throw new Error("올바른 URL을 입력해주세요.");
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

export async function listCases() {
  const cases = await readCases();
  return [...cases].sort((a, b) => {
    if (a.status === "핫케이스" && b.status !== "핫케이스") return -1;
    if (a.status !== "핫케이스" && b.status === "핫케이스") return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export async function createCase(input: Partial<CreateCaseInput>) {
  const value = validateCreateInput(input);
  const cases = await readCases();
  const createdCase: MooncheckCase = {
    id: `case-${Date.now()}`,
    ...value,
    category: "신규 제보",
    patch: "16.8",
    positions: { 탑: 20, 정글: 20, 미드: 20, 원딜: 20, 서폿: 20 },
    comments: [],
    status: "판정중",
    createdAt: new Date().toISOString(),
    voteCount: 0
  };

  await writeCases([createdCase, ...cases]);
  return createdCase;
}

export async function addVote(caseId: string, vote: Partial<VoteInput>) {
  const cases = await readCases();
  const index = cases.findIndex((item) => item.id === caseId);
  if (index === -1) throw new Error("케이스를 찾을 수 없습니다.");

  cases[index] = {
    ...cases[index],
    positions: normalizePositions(vote),
    voteCount: cases[index].voteCount + 1
  };

  await writeCases(cases);
  return cases[index];
}

export async function addComment(caseId: string, body: unknown) {
  const commentBody = typeof body === "string" ? body.trim() : "";
  if (commentBody.length < 2) throw new Error("댓글은 2자 이상이어야 합니다.");

  const cases = await readCases();
  const index = cases.findIndex((item) => item.id === caseId);
  if (index === -1) throw new Error("케이스를 찾을 수 없습니다.");

  const comment: MooncheckComment = {
    id: `comment-${Date.now()}`,
    body: commentBody,
    authorName: `판정단${cases[index].comments.length + 1}`,
    createdAt: new Date().toISOString()
  };

  cases[index] = {
    ...cases[index],
    comments: [comment, ...cases[index].comments]
  };

  await writeCases(cases);
  return cases[index];
}
