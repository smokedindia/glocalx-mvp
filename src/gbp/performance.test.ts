import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import { applyMigrations, openDatabase, seedDemoData } from "@/server/db/sqlite"

import { getGbpPerformanceSummary } from "./performance"

describe("getGbpPerformanceSummary", () => {
  const tempPaths: string[] = []

  afterEach(async () => {
    for (const tempPath of tempPaths) {
      await rm(tempPath, { force: true, recursive: true })
    }
    tempPaths.length = 0
  })

  async function createDatabase() {
    const tempPath = await mkdtemp(join(tmpdir(), "glocalx-gbp-performance-"))
    tempPaths.push(tempPath)
    const database = openDatabase(join(tempPath, "performance.db"))
    applyMigrations(database)
    seedDemoData(database)
    return database
  }

  it("builds owner-scoped GBP performance metrics from stored onboarding data", async () => {
    const database = await createDatabase()

    const summary = getGbpPerformanceSummary(database, "demo-store")

    expect(summary.status).toBe("READY")
    expect(summary.storeName).toBe("브런치모먼트 홍대점")
    expect(summary.locationStatus).toBe("VERIFIED")
    expect(summary.metrics.map((metric) => metric.label)).toEqual([
      "프로필 조회",
      "전화 클릭",
      "길찾기 요청",
      "게시 반응",
    ])
    expect(summary.followUps).toContain(
      "GBP 인증이 완료되어 라이브 게시와 리뷰 작업을 계속 진행할 수 있습니다."
    )
    database.close()
  })

  it("surfaces verification follow-up when setup is still pending", async () => {
    const database = await createDatabase()
    database
      .prepare("UPDATE gbp_locations SET status = ? WHERE store_id = ?")
      .run("VERIFICATION_PENDING", "demo-store")

    const summary = getGbpPerformanceSummary(database, "demo-store")

    expect(summary.locationStatus).toBe("VERIFICATION_PENDING")
    expect(summary.followUps).toContain(
      "GBP 인증이 완료되면 Google 실시간 성과 지표를 연결합니다."
    )
    database.close()
  })
})
