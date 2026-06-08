import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"
import { z } from "zod"

import type { AdapterBusinessProfileCandidate } from "@/domain/schemas"
import type {
  AdapterResult,
  NaverSearchAdapter,
  NaverSearchResult,
} from "@/integrations/contracts"
import { createIntegrationAdapters } from "@/integrations"
import { applyMigrations, openDatabase, seedDemoData } from "@/server/db/sqlite"

import {
  NaverSearchTimeoutError,
  confirmBusinessProfile,
  extractBusinessProfile,
} from "./extraction"

const countRowSchema = z.object({
  count: z.number(),
})

const confirmedRowSchema = z.object({
  candidate_json: z.string(),
  status: z.literal("CONFIRMED"),
})

const storeProfileRowSchema = z.object({
  address: z.string(),
  category: z.string(),
  hours: z.string().nullable(),
  name: z.string(),
  onboarding_status: z.string(),
  phone: z.string().nullable(),
})

const ambiguousCandidates = [
  {
    source: "NAVER_LOCAL",
    name: "브런치모먼트 홍대점",
    address: "서울 마포구 와우산로 123",
    category: "브런치 카페",
    missingFields: ["phone", "hours"],
  },
  {
    source: "NAVER_LOCAL",
    name: "브런치모먼트 연남점",
    address: "서울 마포구 연남로 45",
    category: "브런치 카페",
    missingFields: ["phone", "hours"],
  },
] satisfies readonly AdapterBusinessProfileCandidate[]

function fakeNaverSearch(
  result: AdapterResult<NaverSearchResult>
): NaverSearchAdapter {
  return {
    async searchLocal(): Promise<AdapterResult<NaverSearchResult>> {
      return result
    },
  }
}

function timeoutNaverSearch(): NaverSearchAdapter {
  return {
    async searchLocal(): Promise<AdapterResult<NaverSearchResult>> {
      throw new NaverSearchTimeoutError("브런치모먼트")
    },
  }
}

describe("extractBusinessProfile", () => {
  const tempPaths: string[] = []

  afterEach(async () => {
    for (const tempPath of tempPaths) {
      await rm(tempPath, { force: true, recursive: true })
    }
    tempPaths.length = 0
  })

  it("returns normalized stub candidates when a Naver short link is provided", async () => {
    // Given
    const tempPath = await mkdtemp(join(tmpdir(), "glocalx-naver-link-"))
    tempPaths.push(tempPath)
    const database = openDatabase(join(tempPath, "naver.db"))
    applyMigrations(database)
    seedDemoData(database)
    const adapters = createIntegrationAdapters({ database, env: {} })

    // When
    const result = await extractBusinessProfile({
      adapters,
      database,
      input: "https://naver.me/mybrunchcafe",
      storeId: "demo-store",
    })

    // Then
    expect(result.status).toBe("CANDIDATES_FOUND")
    if (result.status === "CANDIDATES_FOUND") {
      expect(result.normalizedQuery).toBe("mybrunchcafe")
      expect(result.candidates[0]?.name).toBe("브런치모먼트 홍대점")
      expect(result.candidates[0]?.missingFields).toEqual(["hours"])
      expect(result.requiresSelection).toBe(false)
    }

    const countRow = countRowSchema.parse(
      database
        .prepare("SELECT COUNT(*) AS count FROM business_profile_extractions")
        .get()
    )
    expect(countRow.count).toBe(2)
    database.close()
  })

  it("returns manual recovery copy when Naver has no result", async () => {
    // Given
    const adapters = createIntegrationAdapters({ env: {} })

    // When
    const result = await extractBusinessProfile({
      adapters,
      input: "없는가게zzzz",
      storeId: "demo-store",
    })

    // Then
    expect(result).toEqual({
      status: "MANUAL_INPUT_REQUIRED",
      normalizedQuery: "없는가게zzzz",
      candidates: [],
      manualForm: {
        requiredFields: ["name", "address", "category"],
        promptedFields: ["phone", "hours"],
      },
      message:
        "네이버에서 매장을 찾지 못했습니다. 직접 입력으로 계속할 수 있습니다.",
    })
  })

  it("requires explicit owner selection when Naver returns ambiguous matches", async () => {
    // Given
    const adapters = {
      ...createIntegrationAdapters({ env: {} }),
      naverSearch: fakeNaverSearch({
        kind: "ok",
        value: { candidates: ambiguousCandidates },
      }),
    }

    // When
    const result = await extractBusinessProfile({
      adapters,
      input: "브런치모먼트",
      storeId: "demo-store",
    })

    // Then
    expect(result.status).toBe("CANDIDATES_FOUND")
    if (result.status === "CANDIDATES_FOUND") {
      expect(result.requiresSelection).toBe(true)
      expect(result.message).toBe(
        "여러 매장이 검색되었습니다. 소유한 매장을 선택해주세요."
      )
    }
  })

  it("returns manual recovery copy when the Naver search times out", async () => {
    // Given
    const adapters = {
      ...createIntegrationAdapters({ env: {} }),
      naverSearch: timeoutNaverSearch(),
    }

    // When
    const result = await extractBusinessProfile({
      adapters,
      input: "브런치모먼트",
      storeId: "demo-store",
    })

    // Then
    expect(result.status).toBe("MANUAL_INPUT_REQUIRED")
    if (result.status === "MANUAL_INPUT_REQUIRED") {
      expect(result.message).toBe(
        "네이버 검색 응답이 지연되고 있습니다. 직접 입력으로 계속할 수 있습니다."
      )
      expect(result.manualForm.requiredFields).toEqual([
        "name",
        "address",
        "category",
      ])
    }
  })

  it("executes production Naver search with server-side credentials", async () => {
    // Given
    const requests: { input: string; init: RequestInit | undefined }[] = []
    const adapters = createIntegrationAdapters({
      env: {
        APP_INTEGRATION_MODE: "production",
        NAVER_CLIENT_ID: "test-naver-client",
        NAVER_CLIENT_SECRET: "test-naver-secret",
      },
      fetchImpl: async (input, init) => {
        requests.push({ input, init })
        return new Response(
          JSON.stringify({
            items: [
              {
                title: "<b>브런치모먼트 홍대점</b>",
                category: "음식점&gt;카페",
                roadAddress: "서울 마포구 와우산로 123",
              },
            ],
          }),
          { status: 200 }
        )
      },
    })

    // When
    const result = await extractBusinessProfile({
      adapters,
      input: "브런치모먼트",
      storeId: "demo-store",
    })

    // Then
    expect(result.status).toBe("CANDIDATES_FOUND")
    if (result.status === "CANDIDATES_FOUND") {
      expect(result.candidates[0]?.name).toBe("브런치모먼트 홍대점")
    }
    expect(requests[0]).toMatchObject({
      input:
        "https://openapi.naver.com/v1/search/local.json?query=%EB%B8%8C%EB%9F%B0%EC%B9%98%EB%AA%A8%EB%A8%BC%ED%8A%B8&display=5&start=1&sort=random",
      init: {
        headers: {
          "X-Naver-Client-Id": "test-naver-client",
          "X-Naver-Client-Secret": "test-naver-secret",
        },
        method: "GET",
      },
    })
  })

  it("confirms manual profile input and updates the store profile", async () => {
    // Given
    const tempPath = await mkdtemp(join(tmpdir(), "glocalx-confirm-profile-"))
    tempPaths.push(tempPath)
    const database = openDatabase(join(tempPath, "confirm.db"))
    applyMigrations(database)
    seedDemoData(database)

    // When
    const result = confirmBusinessProfile({
      database,
      input: {
        source: "MANUAL",
        input: "수동입력",
        profile: {
          name: "테스트 카페",
          address: "서울 중구 세종대로 1",
          phone: "02-000-0000",
          hours: "09:00 ~ 18:00",
          category: "카페",
        },
      },
      now: new Date("2026-06-04T00:00:00.000Z"),
      storeId: "demo-store",
    })

    // Then
    expect(result.status).toBe("CONFIRMED")
    const extractionRow = confirmedRowSchema.parse(
      database
        .prepare(
          "SELECT status, candidate_json FROM business_profile_extractions WHERE id = ?"
        )
        .get(result.extractionId)
    )
    expect(JSON.parse(extractionRow.candidate_json)).toMatchObject({
      source: "MANUAL",
      name: "테스트 카페",
      address: "서울 중구 세종대로 1",
      category: "카페",
    })

    const storeRow = storeProfileRowSchema.parse(
      database
        .prepare(
          "SELECT name, address, phone, category, hours, onboarding_status FROM stores WHERE id = ?"
        )
        .get("demo-store")
    )
    expect(storeRow).toEqual({
      name: "테스트 카페",
      address: "서울 중구 세종대로 1",
      phone: "02-000-0000",
      category: "카페",
      hours: "09:00 ~ 18:00",
      onboarding_status: "IN_PROGRESS",
    })

    database.close()
  })
})
