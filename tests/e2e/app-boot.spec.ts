import { expect, test } from "@playwright/test"

test("App boots locally and shows the GlocalX shell", async ({ page }) => {
  await page.goto("/")

  await expect(page.getByTestId("entry-device")).toBeVisible()
  await expect(page.getByRole("heading", { name: "GlocalX" })).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Kakao로 계속하기" })
  ).toBeEnabled()
  await expect(
    page.getByRole("button", { name: "Google로 계속하기" })
  ).toBeEnabled()
  await expect(
    page.getByRole("button", { name: "이메일로 계속하기" })
  ).toBeEnabled()
  await expect(page.getByRole("heading", { name: /혼자서도/ })).toHaveCount(0)
})
