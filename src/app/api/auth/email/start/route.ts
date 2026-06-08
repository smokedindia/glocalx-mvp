import type { NextRequest } from "next/server"

import {
  createLoginErrorRedirect,
  createLoginRedirect,
  isValidEmail,
  recordAuthenticatedProfile
} from "@/auth/login"

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const rawEmail = formData.get("email")
  const email = typeof rawEmail === "string" ? rawEmail.trim() : ""

  if (!isValidEmail(email)) {
    return createLoginErrorRedirect("email")
  }

  recordAuthenticatedProfile({
    displayName: email.split("@")[0] ?? email,
    email,
    provider: "email",
    subjectId: email.toLowerCase()
  })

  return createLoginRedirect(request)
}
