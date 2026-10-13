# NeuraMeet

An AI-integrated meeting platform. Host or join real-time video meetings, then turn each meeting into searchable intelligence: a summary, action items, a category, and a chat that answers questions grounded in that meeting's transcript.

## Features

- **Video meetings:** instant, scheduled, and personal-room calls with device preview, screen sharing, reactions, and recording (Stream Video).
- **Guest join:** people without an account can join from a lobby, with optional owner approval.
- **Transcripts:** upload a transcript, or generate a speaker-labeled `.txt` from per-participant recordings (Groq Whisper, English and Urdu).
- **AI processing:** summary, action items, and category extraction (Gemini, with Groq as fallback).
- **Meeting chat (RAG):** ask questions about any meeting; answers come from its embedded transcript chunks (pgvector).
- **Cross-meeting search and prep:** semantic search across all your meetings, and prep suggestions from related past meetings.
- **Follow-ups:** action items become trackable follow-ups with status.
- **Attendance reports:** join/leave and mic/camera events, downloadable as a PDF.
- **Dashboard, recordings library, and settings,** including email notifications through Resend.

## Tech stack

| Area | Tools |
| --- | --- |
| Framework | Next.js 15 (App Router), React 19, TypeScript |
| Auth | Clerk |
| Video | Stream Video React SDK and Node SDK |
| Data | Supabase (Postgres, pgvector) |
| AI | Vercel AI SDK, Google Gemini, Groq |
| UI | Tailwind CSS, Radix UI, Motion |
| Testing | Vitest, Playwright |

Every external service runs on its free tier.

## Getting started

### Prerequisites

- Node.js 20 or later
- Free accounts on Clerk, Stream, Supabase, Google AI Studio, and Groq (Resend is optional)

### Setup

```bash
git clone https://github.com/UzairJIqbal/Neurameet.git
cd Neurameet
npm ci
cp .env.example .env.local   # then fill in the values
```

Create the database: open the Supabase SQL editor and run [`supabase/schema.sql`](supabase/schema.sql). It enables `pgvector` and creates the tables and match functions.

```bash
npm run dev
```

Open http://localhost:3000.

## Environment variables

All variables are listed in [`.env.example`](.env.example).

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_APP_URL` | Base URL for invite and meeting links |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Clerk auth |
| `NEXT_PUBLIC_STREAM_API_KEY`, `STREAM_SECRET_KEY` | Stream Video |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini (primary model) |
| `GROQ_API_KEY` | Groq (fallback model and Whisper transcription) |
| `RESEND_API_KEY`, `RESEND_FROM` | Email notifications (optional) |

Secret keys are used only on the server and never reach the browser.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run test:unit` | Unit tests (Vitest) |
| `npm test` | End-to-end tests (Playwright) |
| `npm run check:providers` | Check that the AI provider keys work |

## Project structure

```
src/
  app/          routes, pages, and API routes (app/api/**)
  components/   UI components
  actions/      server actions (meetings, Stream tokens)
  agent/        AI models, embeddings, RAG
  lib/          server helpers (Supabase, email, PDF, recap)
  hooks/        client hooks
supabase/       database schema
context/        architecture and design docs
```
