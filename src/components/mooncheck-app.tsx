"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Lane = "탑" | "정글" | "미드" | "원딜" | "서폿";

type VerdictComment = {
  id: string;
  body: string;
  authorName: string;
  createdAt: string;
};

type VerdictCase = {
  id: string;
  title: string;
  category: string;
  tier: string;
  patch: string;
  clipUrl: string;
  timecode: string;
  issue: string;
  positions: Record<Lane, number>;
  comments: VerdictComment[];
  status: "판정중" | "종결" | "핫케이스";
  createdAt: string;
  voteCount: number;
};

const lanes: Lane[] = ["탑", "정글", "미드", "원딜", "서폿"];

function normalizeVote(positions: Record<Lane, number>, target: Lane, value: number) {
  const next = { ...positions, [target]: value };
  const others = lanes.filter((lane) => lane !== target);
  const remaining = Math.max(0, 100 - value);
  const otherTotal = others.reduce((sum, lane) => sum + positions[lane], 0);

  if (otherTotal === 0) {
    const share = Math.floor(remaining / others.length);
    others.forEach((lane, index) => {
      next[lane] = index === others.length - 1 ? remaining - share * (others.length - 1) : share;
    });
    return next;
  }

  let used = 0;
  others.forEach((lane, index) => {
    if (index === others.length - 1) {
      next[lane] = remaining - used;
      return;
    }

    const adjusted = Math.round((positions[lane] / otherTotal) * remaining);
    next[lane] = adjusted;
    used += adjusted;
  });

  return next;
}

function getEmbedUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtube.com")) {
      const id = parsed.searchParams.get("v");
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : "";
    }

    if (parsed.hostname.includes("youtu.be")) {
      return `https://www.youtube-nocookie.com/embed/${parsed.pathname.replace("/", "")}`;
    }
  } catch {
    return "";
  }

  return "";
}

function getTopLane(positions: Record<Lane, number>) {
  return lanes.reduce((winner, lane) => (positions[lane] > positions[winner] ? lane : winner), lanes[0]);
}

function statusClass(status: VerdictCase["status"]) {
  if (status === "종결") return "badge closed";
  if (status === "판정중") return "badge pending";
  return "badge";
}

function replaceCase(cases: VerdictCase[], updatedCase: VerdictCase) {
  return cases.map((item) => (item.id === updatedCase.id ? updatedCase : item));
}

async function parseApiResponse(response: Response) {
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "요청을 처리하지 못했습니다.");
  return payload;
}

export function MooncheckApp() {
  const [cases, setCases] = useState<VerdictCase[]>([]);
  const [activeId, setActiveId] = useState("");
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState({
    title: "",
    clipUrl: "",
    timecode: "",
    tier: "Gold",
    issue: ""
  });

  useEffect(() => {
    let ignore = false;

    async function loadCases() {
      try {
        setLoading(true);
        const response = await fetch("/api/cases", { cache: "no-store" });
        const payload = (await parseApiResponse(response)) as { cases: VerdictCase[] };
        if (ignore) return;
        setCases(payload.cases);
        setActiveId((current) => current || payload.cases[0]?.id || "");
      } catch (error) {
        if (!ignore) setMessage(error instanceof Error ? error.message : "케이스를 불러오지 못했습니다.");
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    loadCases();
    return () => {
      ignore = true;
    };
  }, []);

  const activeCase = cases.find((item) => item.id === activeId) ?? cases[0];
  const sortedCases = useMemo(
    () =>
      [...cases].sort((a, b) => {
        if (a.status === "핫케이스" && b.status !== "핫케이스") return -1;
        if (a.status !== "핫케이스" && b.status === "핫케이스") return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }),
    [cases]
  );

  const topLane = activeCase ? getTopLane(activeCase.positions) : "정글";
  const embedUrl = activeCase ? getEmbedUrl(activeCase.clipUrl) : "";
  const submitCard = (
    <section className="card" id="submit">
      <h2 className="section-title">문철 제보</h2>
      <form className="form" onSubmit={submitCase}>
        <input
          className="input"
          value={draft.title}
          onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
          placeholder="사건 제목"
        />
        <input
          className="input"
          value={draft.clipUrl}
          onChange={(event) => setDraft((current) => ({ ...current, clipUrl: event.target.value }))}
          placeholder="YouTube 링크"
        />
        <div className="form-row">
          <input
            className="input"
            value={draft.timecode}
            onChange={(event) => setDraft((current) => ({ ...current, timecode: event.target.value }))}
            placeholder="12:30-13:10"
          />
          <select
            className="select"
            value={draft.tier}
            onChange={(event) => setDraft((current) => ({ ...current, tier: event.target.value }))}
          >
            {["Iron", "Bronze", "Silver", "Gold", "Platinum", "Emerald", "Diamond", "Master+"].map((tier) => (
              <option key={tier}>{tier}</option>
            ))}
          </select>
        </div>
        <textarea
          className="textarea"
          value={draft.issue}
          onChange={(event) => setDraft((current) => ({ ...current, issue: event.target.value }))}
          placeholder="무엇을 판정받고 싶은지"
        />
        <button className="primary-button" disabled={saving}>제보 올리기</button>
      </form>
    </section>
  );

  function updateVote(lane: Lane, value: number) {
    if (!activeCase) return;
    setCases((current) =>
      replaceCase(current, {
        ...activeCase,
        positions: normalizeVote(activeCase.positions, lane, value)
      })
    );
  }

  async function saveVote() {
    if (!activeCase || saving) return;

    try {
      setSaving(true);
      setMessage("");
      const response = await fetch(`/api/cases/${activeCase.id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(activeCase.positions)
      });
      const payload = (await parseApiResponse(response)) as { case: VerdictCase };
      setCases((current) => replaceCase(current, payload.case));
      setMessage("투표가 반영됐습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "투표를 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function submitCase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    try {
      setSaving(true);
      setMessage("");
      const response = await fetch("/api/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft)
      });
      const payload = (await parseApiResponse(response)) as { case: VerdictCase };
      setCases((current) => [payload.case, ...current]);
      setActiveId(payload.case.id);
      setDraft({ title: "", clipUrl: "", timecode: "", tier: "Gold", issue: "" });
      setMessage("문철 제보가 등록됐습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "문철 제보를 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = comment.trim();
    if (!activeCase || !value || saving) return;

    try {
      setSaving(true);
      setMessage("");
      const response = await fetch(`/api/cases/${activeCase.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: value })
      });
      const payload = (await parseApiResponse(response)) as { case: VerdictCase };
      setCases((current) => replaceCase(current, payload.case));
      setComment("");
      setMessage("판정 근거가 등록됐습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "댓글을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/">
          <p className="brand-title">협곡 문철</p>
          <p className="brand-subtitle">롤 장면 과실비율 커뮤니티</p>
        </a>
        <nav className="nav">
          <a className="nav-link" href="#live">실시간</a>
          <a className="primary-button" href="#submit">제보</a>
        </nav>
      </header>

      <main className="container" id="cases">
        {message ? <p className="status-message">{message}</p> : null}

        {loading ? (
          <section className="card rules">
            <strong>협곡 문철을 불러오는 중입니다.</strong>
          </section>
        ) : !activeCase ? (
          <div className="grid empty-grid">
            <section className="card empty-state">
              <p className="eyebrow">MOONCHECK.GG</p>
              <h1 className="case-title">첫 문철을 기다리는 중입니다.</h1>
              <p className="issue">유튜브에 올린 롤 장면 링크와 쟁점을 남기면 바로 과실비율 투표가 열립니다.</p>
              <a className="primary-button empty-cta" href="#submit">문철 제보하기</a>
            </section>
            <aside className="stack">{submitCard}</aside>
          </div>
        ) : (
          <div className="grid">
            <div className="stack">
              <article className="card">
                <div className="case-header">
                  <div className="case-title-block">
                    <p className="eyebrow">MOONCHECK.GG</p>
                    <div className="meta">
                      <span className={statusClass(activeCase.status)}>{activeCase.status}</span>
                      <span>{activeCase.tier}</span>
                      <span>{activeCase.timecode}</span>
                      <span>{activeCase.voteCount} votes</span>
                    </div>
                    <h1 className="case-title">{activeCase.title}</h1>
                    <p className="issue">{activeCase.issue}</p>
                  </div>

                  <div className="verdict-card">
                    <span>현재 결론</span>
                    <strong>{topLane}</strong>
                    <em>{activeCase.positions[topLane]}%</em>
                  </div>
                </div>

                <div className="video-wrap">
                  <div className="video">
                    {embedUrl ? (
                      <iframe
                        src={embedUrl}
                        title={activeCase.title}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    ) : (
                      <div className="video-empty">
                        <div>
                          <strong>영상</strong>
                          <p>영상 링크, Replayit 링크, 리플레이 변환 링크를 붙여 장면을 공유합니다.</p>
                          <a href={activeCase.clipUrl} target="_blank" rel="noreferrer">원본 링크 열기</a>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="vote-panel">
                  <div className="lane-list">
                    {lanes.map((lane) => (
                      <label key={lane} className="lane-row">
                        <span>{lane}</span>
                        <span className="lane-bar">
                          <span className="lane-fill" style={{ width: `${activeCase.positions[lane]}%` }} />
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={activeCase.positions[lane]}
                            onChange={(event) => updateVote(lane, Number(event.target.value))}
                          />
                        </span>
                        <span className="lane-percent">{activeCase.positions[lane]}%</span>
                      </label>
                    ))}
                  </div>

                  <button className="primary-button vote-submit" disabled={saving} onClick={saveVote}>투표 반영</button>
                </div>
              </article>

              <section className="card">
                <h3 className="section-title">판정 근거</h3>
                <form className="form comment-form" onSubmit={submitComment}>
                  <textarea
                    className="textarea"
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                    placeholder="예: 14:22에 미드가 먼저 움직일 수 없어서 정글 책임이 줄어듦"
                  />
                  <button className="primary-button" disabled={saving}>근거 남기기</button>
                </form>
                <div className="comments">
                  {activeCase.comments.length ? (
                    activeCase.comments.map((item) => (
                      <p key={item.id} className="comment">
                        <strong>{item.authorName}</strong>
                        {item.body}
                      </p>
                    ))
                  ) : (
                    <p className="empty-comment">아직 판정 근거가 없습니다.</p>
                  )}
                </div>
              </section>
            </div>

            <aside className="stack">
              <section className="card" id="live">
                <h2 className="section-title">실시간 판정</h2>
                <div className="case-list">
                  {sortedCases.map((item) => {
                    const itemTopLane = getTopLane(item.positions);
                    return (
                      <button
                        key={item.id}
                        className={`case-list-button ${item.id === activeCase.id ? "active" : ""}`}
                        onClick={() => setActiveId(item.id)}
                      >
                        <span className={statusClass(item.status)}>{item.status}</span>
                        <span className="meta"> {item.tier}</span>
                        <p className="case-list-title">{item.title}</p>
                        <p className="case-list-meta">
                          {item.category} · {itemTopLane} {item.positions[itemTopLane]}% · {item.voteCount} votes
                        </p>
                      </button>
                    );
                  })}
                </div>
              </section>

              {submitCard}
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
