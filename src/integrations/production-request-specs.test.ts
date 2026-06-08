import { describe, expect, it } from "vitest"

import { createIntegrationAdapters } from "./index"

const productionEnv = {
  APP_INTEGRATION_MODE: "production",
  NAVER_CLIENT_ID: "test-naver-client",
  NAVER_CLIENT_SECRET: "test-naver-secret",
  GOOGLE_CLIENT_ID: "test-google-client",
  GOOGLE_CLIENT_SECRET: "test-google-secret",
} as const

describe("production request specs", () => {
  it("executes and parses the exact Naver local search request", async () => {
    const requests: { input: string; init: RequestInit | undefined }[] = []
    const adapters = createIntegrationAdapters({
      env: productionEnv,
      fetchImpl: async (input, init) => {
        requests.push({ input, init })
        return new Response(
          JSON.stringify({
            items: [
              {
                title: "<b>브런치모먼트 홍대점</b>",
                category: "음식점&gt;카페",
                roadAddress: "서울 마포구 와우산로 123",
                mapx: "1269234567",
                mapy: "375512345",
              },
            ],
          }),
          {
            headers: { "Content-Type": "application/json" },
            status: 200,
          }
        )
      },
    })

    const result = await adapters.naverSearch.searchLocal({
      query: "브런치모먼트",
      display: 5,
    })

    expect(result).toEqual({
      kind: "ok",
      value: {
        candidates: [
          {
            source: "NAVER_LOCAL",
            name: "브런치모먼트 홍대점",
            address: "서울 마포구 와우산로 123",
            category: "음식점>카페",
            longitude: 126.9234567,
            latitude: 37.5512345,
            missingFields: ["phone", "hours"],
          },
        ],
      },
    })
    expect(requests[0]?.input).toBe(
      "https://openapi.naver.com/v1/search/local.json?query=%EB%B8%8C%EB%9F%B0%EC%B9%98%EB%AA%A8%EB%A8%BC%ED%8A%B8&display=5&start=1&sort=random"
    )
    expect(requests[0]?.init).toMatchObject({
      headers: {
        "X-Naver-Client-Id": "test-naver-client",
        "X-Naver-Client-Secret": "test-naver-secret",
      },
      method: "GET",
    })
  })

  it("builds exact Google GBP request specs", () => {
    const adapters = createIntegrationAdapters({ env: productionEnv })

    expect(
      adapters.gbpAccountManagement.listAccounts({
        accessToken: "test-access-token",
        pageSize: 20,
        pageToken: "next-account-page",
      })
    ).toEqual({
      kind: "ok",
      value: {
        method: "GET",
        url: "https://mybusinessaccountmanagement.googleapis.com/v1/accounts?pageSize=20&pageToken=next-account-page",
        headers: { Authorization: "Bearer test-access-token" },
        requiredScopes: ["https://www.googleapis.com/auth/business.manage"],
      },
    })

    expect(
      adapters.gbpBusinessInformation.listCategories({
        accessToken: "test-access-token",
        filter: "brunch",
        languageCode: "ko",
        pageSize: 10,
        regionCode: "KR",
        view: "FULL",
      })
    ).toEqual({
      kind: "ok",
      value: {
        method: "GET",
        url: "https://mybusinessbusinessinformation.googleapis.com/v1/categories?regionCode=KR&languageCode=ko&filter=brunch&pageSize=10&view=FULL",
        headers: { Authorization: "Bearer test-access-token" },
        requiredScopes: ["https://www.googleapis.com/auth/business.manage"],
      },
    })

    expect(
      adapters.gbpBusinessInformation.searchGoogleLocations({
        accessToken: "test-access-token",
        query: "브런치모먼트 홍대점 서울 마포구 와우산로 123",
        resultCount: 5,
      })
    ).toEqual({
      kind: "ok",
      value: {
        method: "POST",
        url: "https://mybusinessbusinessinformation.googleapis.com/v1/googleLocations:search",
        headers: { Authorization: "Bearer test-access-token" },
        requiredScopes: ["https://www.googleapis.com/auth/business.manage"],
        body: {
          query: "브런치모먼트 홍대점 서울 마포구 와우산로 123",
          pageSize: 5,
        },
      },
    })

    expect(
      adapters.gbpBusinessInformation.createLocation({
        accessToken: "test-access-token",
        accountName: "accounts/123",
        requestId: "request-123",
        validateOnly: true,
        location: { title: "브런치모먼트 홍대점" },
      })
    ).toEqual({
      kind: "ok",
      value: {
        method: "POST",
        url: "https://mybusinessbusinessinformation.googleapis.com/v1/accounts/123/locations?requestId=request-123&validateOnly=true",
        headers: { Authorization: "Bearer test-access-token" },
        requiredScopes: ["https://www.googleapis.com/auth/business.manage"],
        body: { title: "브런치모먼트 홍대점" },
      },
    })

    expect(
      adapters.gbpLocalPosts.createLocalPost({
        accessToken: "test-access-token",
        parent: "accounts/123/locations/456",
        summary: "주말 브런치 신메뉴",
      })
    ).toEqual({
      kind: "ok",
      value: {
        method: "POST",
        url: "https://mybusiness.googleapis.com/v4/accounts/123/locations/456/localPosts",
        headers: { Authorization: "Bearer test-access-token" },
        requiredScopes: ["https://www.googleapis.com/auth/business.manage"],
        body: { summary: "주말 브런치 신메뉴" },
      },
    })

    expect(
      adapters.gbpReviews.listReviews({
        accessToken: "test-access-token",
        parent: "accounts/123/locations/456",
        pageSize: 50,
        pageToken: "next-page",
      })
    ).toEqual({
      kind: "ok",
      value: {
        method: "GET",
        url: "https://mybusiness.googleapis.com/v4/accounts/123/locations/456/reviews?pageSize=50&pageToken=next-page&orderBy=updateTime+desc",
        headers: { Authorization: "Bearer test-access-token" },
        requiredScopes: ["https://www.googleapis.com/auth/business.manage"],
      },
    })

    expect(
      adapters.gbpReviews.updateReply({
        accessToken: "test-access-token",
        reviewName: "accounts/123/locations/456/reviews/789",
        comment: "감사합니다.",
      })
    ).toEqual({
      kind: "ok",
      value: {
        method: "PUT",
        url: "https://mybusiness.googleapis.com/v4/accounts/123/locations/456/reviews/789/reply",
        headers: { Authorization: "Bearer test-access-token" },
        requiredScopes: ["https://www.googleapis.com/auth/business.manage"],
        body: { comment: "감사합니다." },
      },
    })

    expect(
      adapters.gbpVerifications.fetchVerificationOptions({
        accessToken: "test-access-token",
        languageCode: "ko",
        locationName: "locations/456",
      })
    ).toEqual({
      kind: "ok",
      value: {
        method: "POST",
        url: "https://mybusinessverifications.googleapis.com/v1/locations/456:fetchVerificationOptions",
        headers: { Authorization: "Bearer test-access-token" },
        requiredScopes: ["https://www.googleapis.com/auth/business.manage"],
        body: { languageCode: "ko" },
      },
    })

    expect(
      adapters.gbpVerifications.getVoiceOfMerchantState({
        accessToken: "test-access-token",
        locationName: "locations/456",
      })
    ).toEqual({
      kind: "ok",
      value: {
        method: "GET",
        url: "https://mybusinessverifications.googleapis.com/v1/locations/456/VoiceOfMerchantState",
        headers: { Authorization: "Bearer test-access-token" },
        requiredScopes: ["https://www.googleapis.com/auth/business.manage"],
      },
    })
  })
})
