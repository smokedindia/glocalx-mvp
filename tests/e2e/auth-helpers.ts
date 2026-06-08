import type { Page } from "@playwright/test"

export async function loginWithEmail(page: Page): Promise<void> {
  await page.getByLabel("이메일").fill("owner@store.com")
  await page.getByRole("button", { name: "이메일로 계속하기" }).click()
}
