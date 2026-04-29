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
  voteTotals?: Record<Lane, number>;
  comments: VerdictComment[];
  status: "판정중" | "종결" | "핫케이스";
  createdAt: string;
  voteCount: number;
};

const lanes: Lane[] = ["탑", "정글", "미드", "원딜", "서폿"];
const defaultVote: Record<Lane, number> = { 탑: 20, 정글: 20, 미드: 20, 원딜: 20, 서폿: 20 };

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
  const [voteDraft, setVoteDraft] = useState<Record<Lane, number>>(defaultVote);
  const [draft, setDraft] = useState({
    title: "",
    clipUrl: "",
    timecode: "",
    tier: "Gold",
    issue: ""
  });

  useEffect(() => {
    async function clearStaleAppCache() {
      try {
        const registrations = await navigator.serviceWorker?.getRegistrations?.();
        await Promise.all(registrations?.map((registration) => registration.unregister()) ?? []);
      } catch {
        // Older browsers or blocked storage can fail here. The app should still render.
      }

      try {
        const cacheNames = await window.caches?.keys?.();
        await Promise.all(cacheNames?.map((cacheName) => window.caches.delete(cacheName)) ?? []);
      } catch {
        // Cache cleanup is best-effort only.
      }
    }

    clearStaleAppCache();
  }, []);

  useEffect(() => {
    let ignore = false;

    async function loadCases() {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 4000);

      try {
        setLoading(true);
        const response = await fetch("/api/cases", { cache: "no-store", signal: controller.signal });
        const payload = (await parseApiResponse(response)) as { cases: VerdictCase[] };
        if (ignore) return;
        setCases(payload.cases);
        const caseId = new URLSearchParams(window.location.search).get("case");
        const requestedCase = payload.cases.find((item) => item.id === caseId);
        setActiveId((current) => current || requestedCase?.id || payload.cases[0]?.id || "");
      } catch (error) {
        if (!ignore) {
          setCases([]);
          setActiveId("");
          setMessage(error instanceof Error && error.name !== "AbortError" ? error.message : "케이스 목록 응답이 늦어 새 투표판부터 열 수 있습니다.");
        }
      } finally {
        window.clearTimeout(timeoutId);
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

  useEffect(() => {
    setVoteDraft(activeCase?.positions ?? defaultVote);
  }, [activeCase?.id]);

  function getCaseUrl(caseId: string) {
    return `${window.location.origin}${window.location.pathname}?case=${caseId}`;
  }

  function selectCase(caseId: string) {
    setActiveId(caseId);
    window.history.replaceState(null, "", `?case=${caseId}#cases`);
  }

  async function copyCaseLink() {
    if (!activeCase) return;

    try {
      await navigator.clipboard.writeText(getCaseUrl(activeCase.id));
      setMessage("사건 링크를 복사했습니다.");
    } catch {
      setMessage("링크 복사에 실패했습니다. 주소창 URL을 복사해주세요.");
    }
  }

  const submitCard = (
    <section className="card" id="submit">
      <div className="section-head">
        <h2 className="section-title">장면 올리기</h2>
        <p>YouTube 링크, 싸운 지점, 한 줄 쟁점만 있으면 됩니다.</p>
      </div>
      <form className="form" onSubmit={submitCase}>
        <input
          className="input"
          value={draft.title}
          onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
          placeholder="예: 22분 용 한타 이거 정글 잘못임?"
        />
        <input
          className="input"
          value={draft.clipUrl}
          onChange={(event) => setDraft((current) => ({ ...current, clipUrl: event.target.value }))}
          placeholder="YouTube URL"
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
          placeholder="예: 말파 궁 진입이 맞았는지, 원딜 포지션이 문제였는지"
        />
        <p className="form-note">개인정보, 계정 연동, 파일 업로드 없이 장면 링크와 쟁점만 저장됩니다.</p>
        <button className="primary-button" disabled={saving}>투표판 만들기</button>
      </form>
    </section>
  );

  function updateVote(lane: Lane, value: number) {
    if (!activeCase) return;
    setVoteDraft((current) => normalizeVote(current, lane, value));
  }

  async function saveVote() {
    if (!activeCase || saving) return;

    try {
      setSaving(true);
      setMessage("");
      const response = await fetch(`/api/cases/${activeCase.id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(voteDraft)
      });
      const payload = (await parseApiResponse(response)) as { case: VerdictCase };
      setCases((current) => replaceCase(current, payload.case));
      setVoteDraft(payload.case.positions);
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
      window.history.replaceState(null, "", `?case=${payload.case.id}#cases`);
      setDraft({ title: "", clipUrl: "", timecode: "", tier: "Gold", issue: "" });
      setMessage("투표판이 열렸습니다. 사건 링크를 커뮤니티에 공유하면 됩니다.");
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
          <a className="nav-link" href="#cases">투표판</a>
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
              <p className="eyebrow">SOLOQ VERDICT</p>
              <h1 className="case-title">“이 장면 누구 잘못임?”을 투표로 끝냅니다.</h1>
              <p className="issue">
                유튜브 링크를 올리면 탑, 정글, 미드, 원딜, 서폿 과실비율 투표판이 바로 열립니다. 링크를 커뮤니티에 던지고 판정만 받으면 됩니다.
              </p>
              <div className="steps">
                <span>1. 장면 링크</span>
                <span>2. 쟁점 한 줄</span>
                <span>3. 과실비율 투표</span>
              </div>
              <div className="trust-list">
                <span>로그인 없음</span>
                <span>YouTube 링크만</span>
                <span>바로 공유</span>
              </div>
              <a className="primary-button empty-cta" href="#submit">첫 투표판 만들기</a>
            </section>
            <aside className="stack">
              <section className="card queue-card">
                <h2 className="section-title">열린 투표판</h2>
                <p>아직 올라온 장면이 없습니다. 첫 링크를 올리면 이곳에 바로 쌓입니다.</p>
              </section>
              {submitCard}
            </aside>
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
                    <div className="case-actions">
                      <button className="secondary-button" onClick={copyCaseLink}>링크 복사</button>
                      <a className="secondary-button" href={activeCase.clipUrl} target="_blank" rel="noreferrer">원본 보기</a>
                    </div>
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
                  <div className="vote-panel-head">
                    <strong>내 과실비율</strong>
                    <span>저장하면 전체 판정에 누적됩니다.</span>
                  </div>
                  <div className="lane-list">
                    {lanes.map((lane) => (
                      <label key={lane} className="lane-row">
                        <span>{lane}</span>
                        <span className="lane-bar">
                          <span className="lane-fill" style={{ width: `${voteDraft[lane]}%` }} />
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={voteDraft[lane]}
                            onChange={(event) => updateVote(lane, Number(event.target.value))}
                          />
                        </span>
                        <span className="lane-percent">{voteDraft[lane]}%</span>
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
                <h2 className="section-title">열린 투표판</h2>
                <div className="case-list">
                  {sortedCases.map((item) => {
                    const itemTopLane = getTopLane(item.positions);
                    return (
                      <button
                        key={item.id}
                        className={`case-list-button ${item.id === activeCase.id ? "active" : ""}`}
                        onClick={() => selectCase(item.id)}
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
