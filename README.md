# GlocalX MVP

GlocalX is a mobile-first owner assistant for Naver business extraction and Google Business Profile operations. This scaffold starts with a credential-free stub mode and leaves production integrations behind explicit adapter boundaries.

## Commands

```bash
npm run dev
npm run typecheck
npm run lint
npm run test
npm run build
npm run e2e
npm run format:check
```

## Local App

Run the app at `http://127.0.0.1:3000`.

```bash
npm run dev -- --hostname 127.0.0.1 --port 3000
```

## Environment

Copy `.env.example` to `.env.local` and keep real credentials out of git. Stub mode is the default until Naver Developers and Google Business Profile credentials are available.

Landing-page login supports Kakao, Google, and in-house email:

- Kakao uses `KAKAO_CLIENT_ID`, optional `KAKAO_CLIENT_SECRET`, and `KAKAO_REDIRECT_URI`.
- Google login uses `GOOGLE_LOGIN_CLIENT_ID`, `GOOGLE_LOGIN_CLIENT_SECRET`, and `GOOGLE_LOGIN_REDIRECT_URI`.
- Google Business Profile keeps its separate `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI` values.
- Email login is currently an MVP email-only owner session. Choose password, magic link, or one-time code before using it as production authentication.
