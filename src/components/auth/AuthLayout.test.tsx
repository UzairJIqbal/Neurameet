// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import AuthLayout from "./AuthLayout";

afterEach(cleanup);

describe("AuthLayout (AC-70y)", () => {
  it("wraps the form and shows the Proof Chain side panel", () => {
    render(
      <AuthLayout variant="sign-in">
        <form aria-label="sign in form" />
      </AuthLayout>,
    );
    expect(screen.getByLabelText("sign in form")).toBeTruthy();
    expect(
      screen.getByText("Connect what your team discusses with what it ships."),
    ).toBeTruthy();
    for (const kind of ["Meeting", "Task", "Pull request", "Evidence"]) {
      expect(screen.getByText(kind)).toBeTruthy();
    }
  });

  it("has its own heading for sign up and no Remember me", () => {
    render(
      <AuthLayout variant="sign-up">
        <p>child</p>
      </AuthLayout>,
    );
    expect(
      screen.getByText("Start with a meeting. End with merged code."),
    ).toBeTruthy();
    expect(screen.queryByText(/remember me/i)).toBeNull();
  });
});
