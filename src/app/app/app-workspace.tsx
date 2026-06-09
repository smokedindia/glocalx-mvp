"use client"

import { useState } from "react"

import { BottomNav } from "@/app/_components/bottom-nav"
import { MobileShell } from "@/app/_components/mobile-shell"

import { PerformanceDashboard } from "./performance-dashboard"
import { PostWorkspace } from "./post-workspace"

const appNavItems = [
  { id: "home", label: "홈" },
  { id: "post", label: "포스팅" },
  { id: "insights", label: "성과" },
] as const

type AppNavId = (typeof appNavItems)[number]["id"]

type AppWorkspaceProps = {
  readonly storeId: string
}

export function AppWorkspace({ storeId }: AppWorkspaceProps) {
  const [activeNavId, setActiveNavId] = useState<AppNavId>("home")

  function handleNavChange(navId: string) {
    if (navId === "home" || navId === "post" || navId === "insights") {
      setActiveNavId(navId)
    }
  }

  function renderWorkspace() {
    if (activeNavId === "post") {
      return <PostWorkspace storeId={storeId} />
    }
    if (activeNavId === "insights") {
      return <PerformanceDashboard variant="details" />
    }
    return <PerformanceDashboard variant="summary" />
  }

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
        {renderWorkspace()}
      </MobileShell>
    </main>
  )
}
