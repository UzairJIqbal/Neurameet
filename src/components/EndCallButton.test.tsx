// @vitest-environment jsdom
//
// Revert-guard for the P13.6 /debug control-bar fixes.
//
// Fix 1 (responsive): EndCallButton was a wide pill with the full "End call for
// everyone" label at EVERY width + a fixed min-w-[120px], so on phones it sat
// next to icon-only Stream/custom controls and broke the control bar's
// flex-wrap. The fix makes it icon-only below sm (PhoneOff only) and shows the
// full label at sm+ (matching the others).
//
// Fix 2 (morph on click): EndCallButton was the only control-bar button routed
// through the stateful-loader `Button`, whose motion.button carries `layout`
// and a hard-coded `layoutId="button"`. On click the spinner/success animation
// (shared layoutId) morphed the EndCall button and shoved its neighbours. The
// fix swaps it for a plain <button> (like the rest of the bar) — no spinner,
// no check, no layout/layoutId — so nothing animates or moves on click.
//
// jsdom can't measure layout, so we assert the exact tokens that enforce this.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

// Owner context: currentUser.userId === call.state.createdBy.id so the button
// renders (it returns null for non-owners).
vi.mock("@stream-io/video-react-sdk", () => ({
  useCallStateHooks: () => ({
    useLocalParticipant: () => ({ userId: "me" }),
  }),
  useCall: () => ({
    id: "call-1",
    state: { createdBy: { id: "me" }, recording: false },
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

import EndCallButton from "./EndCallButton";

describe("EndCallButton (P13.6 /debug)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(cleanup);

  it("is icon-only on mobile: label is hidden below sm and the PhoneOff icon renders", () => {
    render(<EndCallButton />);

    const label = screen.getByText("End call for everyone");
    // hidden => no label on phones; sm:inline => label appears at sm+. These two
    // tokens are the revert guard for the mobile fix.
    expect(label.className).toContain("hidden");
    expect(label.className).toContain("sm:inline");

    // The control must still carry a recognizable icon (PhoneOff) so the
    // icon-only mobile button reads as "end call", not a bare empty circle.
    const btn = screen.getByRole("button");
    expect(btn.querySelector("svg")).not.toBeNull();
  });

  it("drops the fixed 120px min-width on mobile so it doesn't stretch the pill", () => {
    render(<EndCallButton />);

    const btn = screen.getByRole("button");
    // min-w-[44px] on mobile (icon-only), sm:min-w-[120px] restored at sm+. The
    // base stateful-button's min-w-[120px] must be overridden on mobile.
    expect(btn.className).toContain("min-w-[44px]");
    expect(btn.className).toContain("sm:min-w-[120px]");
  });

  it("renders a plain button (no framer-motion layoutId) so neighbours don't morph on click", () => {
    render(<EndCallButton />);

    const btn = screen.getByRole("button") as HTMLElement;
    // A plain <button> has no React/framer-motion layoutId attribute. The old
    // stateful-button set layoutId="button" on every instance, which is what
    // morphed this control and its neighbours on click.
    expect(btn.getAttribute("layoutid")).toBeNull();
    expect(btn.getAttribute("data-layout-id")).toBeNull();
  });
});
