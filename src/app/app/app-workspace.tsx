"use client"

import { useState, type FormEvent } from "react"

import { ActionChip } from "@/app/_components/action-chip"
import { BottomNav } from "@/app/_components/bottom-nav"
import { ChatMessage } from "@/app/_components/chat-message"
import { isRecord, readString } from "@/app/_components/json-value"
import { MobileShell } from "@/app/_components/mobile-shell"

const appNavItems = [
  { id: "home", label: "홈" },
  { id: "post", label: "포스팅" },
  { id: "insights", label: "성과" },
] as const

type AppNavId = (typeof appNavItems)[number]["id"]

type DraftState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | {
      readonly draftId: string
      readonly kind: "ready"
      readonly koreanCopy: string
    }
  | { readonly kind: "error"; readonly message: string }

type PublishState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | { readonly kind: "published"; readonly message: string }
  | { readonly kind: "blocked"; readonly message: string }

type DashboardPeriod = "week" | "month" | "all"

const dashboardPeriods: ReadonlyArray<{
  readonly id: DashboardPeriod
  readonly label: string
}> = [
  { id: "week", label: "이번 주" },
  { id: "month", label: "지난 4주" },
  { id: "all", label: "전체" },
]

const dashboardData: Record<
  DashboardPeriod,
  {
    readonly change: string
    readonly impressions: string
    readonly values: ReadonlyArray<number>
  }
> = {
  all: {
    change: "누적 현지화 캠페인 기준",
    impressions: "138,600",
    values: [12000, 24000, 42000, 68000, 91000, 114000, 138600],
  },
  month: {
    change: "최근 4주 평균 대비 31%",
    impressions: "41,920",
    values: [3100, 5400, 7800, 9200, 11000, 12800, 14800],
  },
  week: {
    change: "전주 대비 38% 상승",
    impressions: "12,480",
    values: [820, 1150, 980, 1420, 1880, 2510, 3720],
  },
}

const dashboardKpis = [
  { change: "22% 상승", label: "프로필 조회", value: "1,920" },
  { change: "41% 상승", label: "웹/길찾기 클릭", value: "312" },
  { change: "5건 증가", label: "신규 리뷰", value: "17건" },
  { change: "60% 상승", label: "신규 팔로워", value: "+208" },
] as const

const countryExposure = [
  { label: "일본", value: "4,210", width: "85%" },
  { label: "한국", value: "3,460", width: "70%" },
  { label: "대만", value: "2,180", width: "45%" },
  { label: "미국", value: "1,490", width: "30%" },
] as const

const topPosts = [
  {
    channel: "인스타 릴스 · 노출 4,210 · 저장 89",
    label: "수플레 팬케이크 릴스",
  },
  {
    channel: "Google 비즈니스 프로필 · 노출 2,180 · 조회 320",
    label: "주말 브런치 신메뉴",
  },
  {
    channel: "인스타 스토리 · 노출 1,540 · 클릭 51",
    label: "핸드드립 스토리",
  },
] as const

function parseDraftState(payload: unknown): DraftState {
  if (!isRecord(payload)) {
    return { kind: "error", message: "초안 응답을 읽지 못했습니다." }
  }

  const preview = payload["preview"]
  if (!isRecord(preview)) {
    return { kind: "error", message: "초안 미리보기가 없습니다." }
  }

  return {
    draftId: readString(payload["draftId"]) ?? "draft-id-missing",
    kind: "ready",
    koreanCopy:
      readString(preview["koreanCopy"]) ?? "초안 문구를 다시 생성해주세요.",
  }
}

function parsePublishState(payload: unknown): PublishState {
  if (!isRecord(payload)) {
    return { kind: "blocked", message: "게시 응답을 읽지 못했습니다." }
  }

  const status = readString(payload["status"])
  if (status === "PUBLISHED") {
    return { kind: "published", message: "게시 완료" }
  }

  return {
    kind: "blocked",
    message:
      readString(payload["message"]) ??
      "Google 비즈니스 프로필 상태를 확인해주세요.",
  }
}

type AppWorkspaceProps = {
  readonly storeId: string
}

type TypingIndicatorProps = {
  readonly label: string
}

function TypingIndicator({ label }: TypingIndicatorProps) {
  return (
    <div
      aria-label={label}
      className="inline-flex max-w-[92%] items-center gap-3 rounded-[18px] bg-white px-4 py-3 text-sm font-bold text-[var(--muted)]"
      role="status"
    >
      <span>{label}</span>
      <span aria-hidden="true" className="inline-flex items-center gap-1">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)]" />
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)] [animation-delay:120ms]" />
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)] [animation-delay:240ms]" />
      </span>
    </div>
  )
}

type DraftPreviewProps = {
  readonly copy: string
  readonly disabled: boolean
  readonly onPublish: () => void
}

function DraftPreview({ copy, disabled, onPublish }: DraftPreviewProps) {
  return (
    <article className="grid max-w-[94%] gap-3 rounded-[22px] border border-[var(--line)] bg-white p-4 text-[var(--ink)] shadow-[0_18px_44px_-34px_rgba(25,23,32,0.7)]">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-black text-[var(--accent)]">
            초안 준비 완료
          </p>
          <h2 className="text-base font-black leading-6">
            Google 비즈니스 프로필 게시글
          </h2>
        </div>
        <span className="shrink-0 rounded-full bg-[var(--mint-soft)] px-2.5 py-1 text-[11px] font-black text-[var(--ink)]">
          GBP
        </span>
      </header>
      <p className="rounded-2xl bg-[var(--phone-bg)] p-3 text-sm font-bold leading-6">
        {copy}
      </p>
      <div className="flex flex-wrap items-center gap-2 text-[11px] font-black text-[var(--muted)]">
        <span className="rounded-full border border-[var(--line)] px-2.5 py-1">
          브런치모먼트 홍대점
        </span>
        <span className="rounded-full border border-[var(--line)] px-2.5 py-1">
          DRAFT_READY
        </span>
      </div>
      <ActionChip
        disabled={disabled}
        label="GBP 게시하기"
        onClick={onPublish}
      />
    </article>
  )
}

type FeedbackTone = "success" | "warning"

type ChatFeedbackProps = {
  readonly message: string
  readonly title: string
  readonly tone: FeedbackTone
}

function ChatFeedback({ message, title, tone }: ChatFeedbackProps) {
  const toneClasses =
    tone === "success"
      ? "border-[rgba(21,189,151,0.42)] bg-[var(--mint-soft)]"
      : "border-[rgba(255,106,61,0.38)] bg-[var(--accent-soft)]"

  return (
    <div
      className={`grid max-w-[94%] gap-1 rounded-[18px] border px-4 py-3 text-sm text-[var(--ink)] ${toneClasses}`}
      role="status"
    >
      <p className="text-xs font-black text-[var(--accent)]">{title}</p>
      <p className="font-bold leading-6">{message}</p>
    </div>
  )
}

type ChartPoint = readonly [number, number]

function buildChartPoints(
  values: ReadonlyArray<number>
): ReadonlyArray<ChartPoint> {
  const width = 288
  const height = 96
  const pad = 8
  const maxValue = Math.max(...values) * 1.12
  const step = (width - pad * 2) / (values.length - 1)

  return values.map((value, index) => [
    Number((pad + index * step).toFixed(1)),
    Number((height - pad - (value / maxValue) * (height - pad * 2)).toFixed(1)),
  ])
}

type HomeOverviewProps = {
  readonly onOpenInsights: () => void
  readonly onOpenPost: () => void
}

function HomeOverview({ onOpenInsights, onOpenPost }: HomeOverviewProps) {
  return (
    <section className="grid gap-4">
      <div className="grid gap-2">
        <p className="text-xs font-black text-[var(--accent)]">오늘의 매장</p>
        <h1 className="text-xl font-black leading-7 text-[var(--ink)]">
          브런치모먼트 홍대점
        </h1>
        <p className="text-sm font-bold leading-6 text-[var(--ink-soft)]">
          Google 비즈니스 프로필과 다채널 성과를 한 화면에서 확인합니다.
        </p>
      </div>

      <div className="gx-home-grid">
        <article className="gx-home-card gx-rise">
          <span>이번 주 총 노출</span>
          <strong>12,480</strong>
          <small>전주 대비 38% 상승</small>
        </article>
        <article className="gx-home-card gx-rise">
          <span>GBP 게시 상태</span>
          <strong>인증 대기</strong>
          <small>게시 전 위치 인증 필요</small>
        </article>
      </div>

      <article className="gx-home-action gx-rise">
        <div>
          <p>새 성과 대시보드가 준비됐어요.</p>
          <span>
            노출, 국가별 반응, 리뷰 응답률, 쿠폰 전환을 빠르게 볼 수 있습니다.
          </span>
        </div>
        <ActionChip label="성과 보기" onClick={onOpenInsights} />
      </article>

      <ActionChip
        label="포스팅 작업실로 이동"
        onClick={onOpenPost}
        tone="ghost"
      />
    </section>
  )
}

type DashboardViewProps = {
  readonly onPeriodChange: (period: DashboardPeriod) => void
  readonly period: DashboardPeriod
}

function DashboardView({ onPeriodChange, period }: DashboardViewProps) {
  const data = dashboardData[period]
  const points = buildChartPoints(data.values)
  const line = points.map((point) => point.join(",")).join(" ")
  const areaPath = `M 8,88 L ${points
    .map((point) => point.join(","))
    .join(" L ")} L 280,88 Z`
  const dayLabels = ["월", "화", "수", "목", "금", "토", "일"]

  return (
    <section aria-label="성과 대시보드" className="gx-dashboard gx-rise">
      <header className="gx-dashboard-header">
        <div>
          <p>성과 대시보드</p>
          <h1>이번 주 마케팅 성과</h1>
          <span>2026.05.26 ~ 06.01 · 브런치모먼트 홍대점</span>
        </div>
        <span className="gx-dashboard-badge">LIVE</span>
      </header>

      <div aria-label="대시보드 기간" className="gx-period-tabs">
        {dashboardPeriods.map((periodOption) => (
          <button
            aria-pressed={periodOption.id === period}
            className="gx-period-tab"
            data-active={periodOption.id === period ? "true" : undefined}
            key={periodOption.id}
            onClick={() => onPeriodChange(periodOption.id)}
            type="button"
          >
            {periodOption.label}
          </button>
        ))}
      </div>

      <article className="gx-dashboard-hero">
        <span>총 노출</span>
        <strong>{data.impressions}</strong>
        <small>{data.change}</small>
        <svg
          aria-label="요일별 노출 추이"
          className="gx-dashboard-chart"
          role="img"
          viewBox="0 0 288 112"
        >
          <defs>
            <linearGradient
              id="gx-dashboard-gradient"
              x1="0"
              x2="0"
              y1="0"
              y2="1"
            >
              <stop offset="0" stopColor="#ff6a3d" stopOpacity="0.52" />
              <stop offset="1" stopColor="#ff6a3d" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill="url(#gx-dashboard-gradient)" />
          <polyline
            fill="none"
            points={line}
            stroke="#ff8a5e"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.4"
          />
          {points.map(([x, y], index) => (
            <circle
              cx={x}
              cy={y}
              fill={index === points.length - 1 ? "#ffffff" : "#ffb59a"}
              key={`dot-${dayLabels[index]}`}
              r={index === points.length - 1 ? 4 : 2.6}
              stroke="#ff6a3d"
              strokeWidth={index === points.length - 1 ? 3 : 0}
            />
          ))}
          {points.map(([x], index) => (
            <text
              fill="#b1aabb"
              fontSize="8.5"
              fontWeight="700"
              key={`label-${dayLabels[index]}`}
              textAnchor="middle"
              x={x}
              y="106"
            >
              {dayLabels[index]}
            </text>
          ))}
        </svg>
      </article>

      <div className="gx-dashboard-kpis">
        {dashboardKpis.map((kpi) => (
          <article className="gx-dashboard-kpi" key={kpi.label}>
            <span>{kpi.label}</span>
            <strong>{kpi.value}</strong>
            <small>{kpi.change}</small>
          </article>
        ))}
      </div>

      <article className="gx-dashboard-panel">
        <h2>채널별 노출 비중</h2>
        <div className="gx-channel-row">
          <div className="gx-donut" aria-label="채널 노출 비중">
            <svg aria-hidden="true" viewBox="0 0 96 96">
              <circle
                cx="48"
                cy="48"
                fill="none"
                r="40"
                stroke="#efeaf0"
                strokeWidth="12"
              />
              <circle
                cx="48"
                cy="48"
                fill="none"
                r="40"
                stroke="#ff6a3d"
                strokeDasharray="155.82 251.33"
                strokeLinecap="round"
                strokeWidth="12"
                transform="rotate(-90 48 48)"
              />
              <circle
                cx="48"
                cy="48"
                fill="none"
                r="40"
                stroke="#15bd97"
                strokeDasharray="95.51 251.33"
                strokeDashoffset="-155.82"
                strokeLinecap="round"
                strokeWidth="12"
                transform="rotate(-90 48 48)"
              />
            </svg>
            <div>
              <strong>12.4K</strong>
              <span>총 노출</span>
            </div>
          </div>
          <div className="gx-dashboard-legend">
            <span>
              <i data-tone="accent" />
              인스타그램 <b>62% · 7,740</b>
            </span>
            <span>
              <i data-tone="mint" />
              Google 비즈니스 프로필 <b>38% · 4,740</b>
            </span>
            <small>릴스 1건이 전체 노출의 34%를 만들었어요.</small>
          </div>
        </div>
      </article>

      <article className="gx-dashboard-panel">
        <h2>국가별 노출</h2>
        <div className="gx-country-list">
          {countryExposure.map((country) => (
            <div className="gx-country-row" key={country.label}>
              <span>{country.label}</span>
              <div>
                <i style={{ width: country.width }} />
              </div>
              <strong>{country.value}</strong>
            </div>
          ))}
        </div>
      </article>

      <article className="gx-dashboard-panel">
        <h2>TOP 게시물</h2>
        <div className="gx-top-posts">
          {topPosts.map((post, index) => (
            <div className="gx-top-post" key={post.label}>
              <span>{index + 1}</span>
              <div>
                <b>{post.label}</b>
                <small>{post.channel}</small>
              </div>
            </div>
          ))}
        </div>
      </article>

      <article className="gx-dashboard-panel">
        <h2>리뷰 현황</h2>
        <div className="gx-review-stats">
          <span>
            <b>17건</b>
            신규 리뷰
          </span>
          <span>
            <b>4.8</b>
            평균 평점
          </span>
          <span>
            <b>100%</b>
            응답률
          </span>
        </div>
        <div aria-label="리뷰 감성 비율" className="gx-sentiment-bar">
          <i data-tone="positive" style={{ width: "88%" }} />
          <i data-tone="neutral" style={{ width: "8%" }} />
          <i data-tone="negative" style={{ width: "4%" }} />
        </div>
        <p className="gx-dashboard-note">긍정 88% · 중립 8% · 부정 4%</p>
      </article>

      <article className="gx-dashboard-panel">
        <h2>쿠폰 전환 퍼널</h2>
        <div className="gx-funnel">
          <span style={{ width: "100%" }}>
            <b>12,480</b> 노출
          </span>
          <span style={{ width: "46%" }}>
            <b>940</b> 쿠폰 클릭
          </span>
          <span style={{ width: "22%" }}>
            <b>34</b> 가게 방문
          </span>
        </div>
      </article>

      <article className="gx-dashboard-insight">
        <b>AI 인사이트</b>
        <p>
          일본 타겟 현지화가 적중했어요. 음식 클로즈업과 세로 영상 포맷이 노출을
          크게 끌어올렸습니다. 다음 주는 대만 타겟 콘텐츠를 같은 포맷으로 늘리는
          걸 추천드려요.
        </p>
      </article>
    </section>
  )
}

export function AppWorkspace({ storeId }: AppWorkspaceProps) {
  const [activeNavId, setActiveNavId] = useState<AppNavId>("post")
  const [dashboardPeriod, setDashboardPeriod] =
    useState<DashboardPeriod>("week")
  const [draft, setDraft] = useState<DraftState>({ kind: "idle" })
  const [intent, setIntent] = useState("주말 브런치 신메뉴 홍보")
  const [submittedIntent, setSubmittedIntent] = useState<string>()
  const [publish, setPublish] = useState<PublishState>({ kind: "idle" })

  function handleNavChange(navId: string) {
    if (navId === "home" || navId === "post" || navId === "insights") {
      setActiveNavId(navId)
    }
  }

  async function handleDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmittedIntent(intent)
    setDraft({ kind: "loading" })
    setPublish({ kind: "idle" })

    try {
      const response = await fetch("/api/posts/drafts", {
        body: JSON.stringify({
          ownerIntent: intent,
          storeId,
          targetChannel: "GBP",
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
      const payload: unknown = await response.json()
      setDraft(parseDraftState(payload))
    } catch (error) {
      setDraft({
        kind: "error",
        message:
          error instanceof Error ? error.message : "초안 생성에 실패했습니다.",
      })
    }
  }

  async function handlePublish() {
    if (draft.kind !== "ready") {
      return
    }

    setPublish({ kind: "loading" })
    try {
      const response = await fetch(`/api/posts/${draft.draftId}/publish`, {
        body: JSON.stringify({ storeId }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
      const payload: unknown = await response.json()
      setPublish(parsePublishState(payload))
    } catch (error) {
      setPublish({
        kind: "blocked",
        message:
          error instanceof Error
            ? error.message
            : "게시 상태를 확인하지 못했습니다.",
      })
    }
  }

  const content =
    activeNavId === "home" ? (
      <HomeOverview
        onOpenInsights={() => setActiveNavId("insights")}
        onOpenPost={() => setActiveNavId("post")}
      />
    ) : activeNavId === "insights" ? (
      <DashboardView
        onPeriodChange={setDashboardPeriod}
        period={dashboardPeriod}
      />
    ) : (
      <section className="flex min-h-full flex-col gap-4">
        <div className="grid gap-2">
          <p className="text-xs font-black text-[var(--accent)]">
            GBP 포스팅 채팅
          </p>
          <h1 className="text-xl font-black leading-7 text-[var(--ink)]">
            포스팅 작업실
          </h1>
          <p className="text-sm font-bold leading-6 text-[var(--ink-soft)]">
            오늘 올릴 매장 소식을 바로 작성합니다
          </p>
        </div>

        <div
          aria-label="AI 마케팅 채팅"
          className="grid flex-1 content-start gap-3"
        >
          <ChatMessage
            message="브런치모먼트 홍대점의 Google 비즈니스 프로필에 올릴 글을 준비할게요. 홍보 의도를 남기면 초안과 게시 상태를 여기서 바로 확인할 수 있습니다."
            speaker="assistant"
          />
          {submittedIntent ? (
            <ChatMessage message={submittedIntent} speaker="owner" />
          ) : null}
          {draft.kind === "loading" ? (
            <TypingIndicator label="초안을 작성하는 중" />
          ) : null}
          {draft.kind === "ready" ? (
            <DraftPreview
              copy={draft.koreanCopy}
              disabled={publish.kind === "loading"}
              onPublish={handlePublish}
            />
          ) : null}
          {draft.kind === "error" ? (
            <ChatFeedback
              message={draft.message}
              title="초안 생성 실패"
              tone="warning"
            />
          ) : null}
          {publish.kind === "loading" ? (
            <TypingIndicator label="GBP 게시 상태를 확인하는 중" />
          ) : null}
          {publish.kind === "published" ? (
            <ChatFeedback
              message={publish.message}
              title="게시 완료"
              tone="success"
            />
          ) : null}
          {publish.kind === "blocked" ? (
            <ChatFeedback
              message={publish.message}
              title="게시 확인 필요"
              tone="warning"
            />
          ) : null}
        </div>

        <form
          className="grid gap-3 rounded-[22px] border border-[var(--line)] bg-white p-3 shadow-[0_18px_42px_-36px_rgba(25,23,32,0.7)]"
          onSubmit={handleDraft}
        >
          <label className="grid gap-2 text-sm font-black text-[var(--ink)]">
            홍보 의도
            <textarea
              className="min-h-24 resize-none rounded-2xl border border-[var(--line)] bg-[var(--phone-bg)] px-4 py-3 text-sm font-bold leading-6 outline-none focus:border-[var(--accent)]"
              onChange={(event) => setIntent(event.currentTarget.value)}
              value={intent}
            />
          </label>
          <div className="grid grid-cols-[1fr_auto] items-center gap-3">
            <div className="min-w-0 text-[11px] font-bold leading-4 text-[var(--muted)]">
              <p className="truncate">채널 GBP · 매장 브런치모먼트 홍대점</p>
              <p className="truncate">AI 마케팅 매니저가 초안을 작성합니다</p>
            </div>
            <div className="w-36">
              <ActionChip
                buttonType="submit"
                disabled={
                  draft.kind === "loading" || publish.kind === "loading"
                }
                label="GBP 초안 만들기"
              />
            </div>
          </div>
        </form>
      </section>
    )

  return (
    <main className="gx-route-page">
      <MobileShell
        bottomNav={
          <BottomNav
            activeId={activeNavId}
            items={appNavItems}
            onSelect={handleNavChange}
          />
        }
        testId="app-stage"
        topBar={
          <>
            <div className="gx-app-identity">
              <div className="gx-app-avatar" aria-hidden="true">
                X
              </div>
              <div className="min-w-0">
                <b>GlocalX · 브런치모먼트 홍대점</b>
                <small>AI 마케팅 매니저 · 온라인</small>
              </div>
            </div>
            <div className="grid shrink-0 justify-items-end gap-1">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-white px-2.5 py-1 text-[11px] font-black text-[var(--ink)]">
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 rounded-full bg-[var(--mint)]"
                />
                GBP
              </span>
              <span className="rounded-full bg-[var(--mint-soft)] px-2.5 py-1 text-[11px] font-black text-[var(--ink)]">
                연결됨
              </span>
            </div>
          </>
        }
      >
        {content}
      </MobileShell>
    </main>
  )
}
