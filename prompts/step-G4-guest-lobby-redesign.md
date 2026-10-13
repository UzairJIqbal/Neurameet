# Step G4.1 — SUPERSEDED (2026-09-02)

> **This step is fully superseded** by the revision of `step-G1-guest-setup-page.md` (Guest Join Flow — Final Consolidated Fix).
>
> The new flow does NOT redesign the guest lobby visually. Instead, it **reuses the actual `MeetingSetup` component** (extracted into a shared `DeviceSetup` sub-component) for the guest flow. The decorative "Camera is off" placeholder, static toggle buttons, and `GuestLobbyContent`/`GuestCallView` in-call view have all been deleted.
>
> The `DeviceSetup` component already matches the signed-in `MeetingSetup` look and feel — no separate visual redesign is needed. The lobby layout is identical to what signed-in participants see in `MeetingSetup` (functional VideoPreview, real toggle buttons, real device dropdowns), just with the button labeled "Ask to join" instead of "Join Meeting."
>
> See `step-G1-guest-setup-page.md` (revised) for the implementation.
