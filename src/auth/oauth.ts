export type OAuthTokenResponse = {
  readonly accessToken: string
}

export type GoogleUserInfo = {
  readonly displayName: string
  readonly email: string
  readonly subjectId: string
}

export type KakaoUserInfo = {
  readonly displayName: string
  readonly email: string
  readonly subjectId: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function readNumberOrString(value: unknown): string | undefined {
  if (typeof value === "number") {
    return String(value)
  }

  return readString(value)
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return undefined
  }
}

export async function exchangeGoogleCode(options: {
  readonly clientId: string
  readonly clientSecret: string
  readonly code: string
  readonly redirectUri: string
}): Promise<OAuthTokenResponse | undefined> {
  const body = new URLSearchParams({
    client_id: options.clientId,
    client_secret: options.clientSecret,
    code: options.code,
    grant_type: "authorization_code",
    redirect_uri: options.redirectUri
  })

  const response = await fetch("https://oauth2.googleapis.com/token", {
    body,
    method: "POST"
  })
  const payload = await readJson(response)
  if (!response.ok || !isRecord(payload)) {
    return undefined
  }

  const accessToken = readString(payload["access_token"])
  return accessToken === undefined ? undefined : { accessToken }
}

export async function fetchGoogleUserInfo(
  accessToken: string
): Promise<GoogleUserInfo | undefined> {
  const response = await fetch(
    "https://openidconnect.googleapis.com/v1/userinfo",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  )
  const payload = await readJson(response)
  if (!response.ok || !isRecord(payload)) {
    return undefined
  }

  const email = readString(payload["email"])
  const subjectId = readString(payload["sub"])
  if (email === undefined || subjectId === undefined) {
    return undefined
  }

  return {
    displayName: readString(payload["name"]) ?? email,
    email,
    subjectId
  }
}

export async function exchangeKakaoCode(options: {
  readonly clientId: string
  readonly clientSecret?: string
  readonly code: string
  readonly redirectUri: string
}): Promise<OAuthTokenResponse | undefined> {
  const body = new URLSearchParams({
    client_id: options.clientId,
    code: options.code,
    grant_type: "authorization_code",
    redirect_uri: options.redirectUri
  })

  if (options.clientSecret !== undefined) {
    body.set("client_secret", options.clientSecret)
  }

  const response = await fetch("https://kauth.kakao.com/oauth/token", {
    body,
    method: "POST"
  })
  const payload = await readJson(response)
  if (!response.ok || !isRecord(payload)) {
    return undefined
  }

  const accessToken = readString(payload["access_token"])
  return accessToken === undefined ? undefined : { accessToken }
}

export async function fetchKakaoUserInfo(
  accessToken: string
): Promise<KakaoUserInfo | undefined> {
  const response = await fetch("https://kapi.kakao.com/v2/user/me", {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  })
  const payload = await readJson(response)
  if (!response.ok || !isRecord(payload)) {
    return undefined
  }

  const subjectId = readNumberOrString(payload["id"])
  const account = payload["kakao_account"]
  const profile = isRecord(account) ? account["profile"] : undefined
  const email = isRecord(account) ? readString(account["email"]) : undefined
  const nickname = isRecord(profile)
    ? readString(profile["nickname"])
    : undefined

  if (subjectId === undefined) {
    return undefined
  }

  return {
    displayName: nickname ?? email ?? `Kakao ${subjectId}`,
    email: email ?? `kakao-${subjectId}@users.glocalx.local`,
    subjectId
  }
}
