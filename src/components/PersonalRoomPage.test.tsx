// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

// jsdom has no layout engine, so these assert the responsive class tokens are
// present (a revert would drop them). Visual reflow at 375/768 is verified
// manually via /check verify. No component code change: P13.7 is a verification
// pass like P13.5 (audit already rated Personal Room responsive).

vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({
    user: {
      id: "user_test123",
      username: "uzair",
      primaryEmailAddress: { emailAddress: "uzair@example.com" },
    },
  }),
}));

vi.mock("@stream-io/video-react-sdk", () => ({
  useStreamVideoClient: () => null,
}));

vi.mock("@/hooks/useGetCallbyId", () => ({
  default: () => ({ call: undefined }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/actions/meetings", () => ({
  createScheduledMeetingRow: vi.fn().mockResolvedValue({ ok: true }),
}));

const BASE = "https://neurameet.test";
;(process as any).env.NEXT_PUBLIC_BASE_URL = BASE;

import PersonalRoomPage from "./PersonalRoomPage";

describe("Personal Room responsive (P13.7)", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it("stacks as a single column on mobile (section is flex-col, full width)", () => {
    const { container } = render(<PersonalRoomPage />);
    const section = container.querySelector("section") as HTMLElement;
    const tokens = section.className.split(" ");
    expect(tokens).toContain("flex");
    expect(tokens).toContain("flex-col");
    expect(tokens).toContain("w-full");
  });

  it("action buttons stack full width on mobile and go inline at sm+", () => {
    render(<PersonalRoomPage />);
    const start = screen.getByRole("button", { name: /Start Meeting/i });
    const copy = screen.getByRole("button", { name: /Copy Invitation/i });
    for (const btn of [start, copy]) {
      const tokens = btn.className.split(" ");
      expect(tokens).toContain("w-full");
      expect(tokens).toContain("sm:w-auto");
    }
  });

  it("wraps the long invite link instead of overflowing (break-all)", () => {
    render(<PersonalRoomPage />);
    const invite = screen.getByText(`${BASE}/meeting/user_test123`) as HTMLElement;
    expect(invite.className.split(" ")).toContain("break-all");
  });

  it("renders plain buttons (no shared framer layoutId) so the row never morphs on click", () => {
    render(<PersonalRoomPage />);
    for (const name of [/Start Meeting/i, /Copy Invitation/i]) {
      const btn = screen.getByRole("button", { name }) as HTMLElement;
      expect(btn.getAttribute("layoutid")).toBeNull();
      expect(btn.getAttribute("data-layout-id")).toBeNull();
    }
  });
});
