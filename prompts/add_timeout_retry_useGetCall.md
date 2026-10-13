# Add timeout and WS‑1006 retry to useGetCall hook

## Goal
Prevent the UI from hanging indefinitely when `client.queryCalls` exceeds the default 5 s Axios timeout and automatically retry transient WebSocket failures (error code 1006) during the initial call.

## Implementation Details
- **Timeout**: Wrap the `client.queryCalls` call in a `Promise.race` with a timeout promise that rejects after 5 seconds.
- **Retry Logic**: Implement a retry loop (max 3 attempts, 500 ms delay) that retries only when the caught error has `code === 1006` or `isWSFailure === true`.
- **Hook Update**: Replace the existing `try { const { calls } = await client.queryCalls(...); } catch ...` block in `src/hooks/useGetCall.ts` with the new logic while preserving loading and error state handling.
- **Tests**: Add new unit tests covering:
  1. Successful retry after an initial WS 1006 error.
  2. Timeout handling when the request takes longer than 5 seconds.

## Files to Modify
- **[MODIFY]** `src/hooks/useGetCall.ts` – integrate timeout and retry.
- **[NEW]** `src/hooks/useGetCall.retry.test.tsx` – test retry and timeout scenarios.

## Verification
- Run full test suite (`npx vitest run`). All existing tests must pass.
- Ensure new tests pass and cover the added behavior.
- Manual UI test: simulate delayed network response; UI should show error after 5 seconds.

