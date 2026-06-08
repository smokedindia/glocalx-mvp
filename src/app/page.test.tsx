import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import Home from "./page"

describe("login landing page", () => {
  it("renders the Korean login choices with form actions", async () => {
    const page = await Home()
    const html = renderToStaticMarkup(page)

    expect(html).toContain("GlocalX")
    expect(html).toContain("내 가게, 세계로")
    expect(html).toContain('action="/api/auth/kakao/start"')
    expect(html).toContain("Kakao로 계속하기")
    expect(html).toContain('action="/api/auth/google/start"')
    expect(html).toContain("Google로 계속하기")
    expect(html).toContain("또는")
    expect(html).toContain('name="email"')
    expect(html).toContain('placeholder="owner@store.com"')
    expect(html).toContain('required=""')
    expect(html).toContain('action="/api/auth/email/start"')
    expect(html).toContain("이메일로 계속하기")
    expect(html).toContain("서비스 이용약관 및 개인정보처리방침")
  })

  it("renders auth provider error feedback from search params", async () => {
    const page = await Home({
      searchParams: Promise.resolve({ auth_error: "kakao" })
    })
    const html = renderToStaticMarkup(page)

    expect(html).toContain("Kakao 로그인을 완료하지 못했습니다.")
  })
})
