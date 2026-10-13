"use client";

import { useSignIn } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useState } from "react";
import toast from "react-hot-toast";
import AuthLayout from "./AuthLayout";

const ForgotPasswordForm = () => {
  const { signIn, isLoaded, setActive } = useSignIn();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const showError = (err: unknown) => {
    const message = err instanceof Error ? err.message : "Something went wrong";
    toast.error(message);
  };

  // Step 1: Clerk emails a reset code (create() with this strategy sends it).
  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signIn) return;

    setLoading(true);
    try {
      await signIn.create({
        strategy: "reset_password_email_code",
        identifier: email,
      });
      setSent(true);
      toast.success("Check your email for a reset code");
    } catch (err: unknown) {
      showError(err);
    } finally {
      setLoading(false);
    }
  };

  // Step 2: verify the code, set the new password, and sign the user in.
  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signIn) return;

    setLoading(true);
    try {
      const result = await signIn.attemptFirstFactor({
        strategy: "reset_password_email_code",
        code,
        password,
      });
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        toast.success("Password reset");
        router.push("/dashboard");
      } else {
        toast("Additional verification required to finish signing in", {
          icon: "📧",
        });
      }
    } catch (err: unknown) {
      showError(err);
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    "w-full bg-surface-container-lowest border border-surface-variant rounded-lg px-4 py-2.5 text-on-surface placeholder:text-outline-variant focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-container text-sm transition-shadow";
  const labelClass =
    "block text-xs text-on-surface mb-1.5 uppercase tracking-wider";
  const submitClass =
    "flex w-full justify-center rounded-lg bg-primary-container px-3 py-2.5 text-sm font-semibold text-on-primary shadow-sm hover:bg-primary transition-colors disabled:opacity-50";

  return (
    <AuthLayout variant="sign-in">
      {/* Logo */}
      <div className="mb-8">
        <span className="text-xl font-black text-primary-container tracking-tight">
          NeuraMeet
        </span>
      </div>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-on-surface mb-2">
          Reset password
        </h1>
        <p className="text-on-surface-variant text-base">
          {sent
            ? "Enter the code we emailed you and choose a new password."
            : "Enter your email and we’ll send you a reset code."}
        </p>
      </div>

      {sent ? (
        <form onSubmit={handleReset} className="space-y-4">
          <p className="text-on-surface-variant text-sm">
            We sent a code to{" "}
            <span className="font-semibold text-on-surface">{email}</span>.
          </p>

          {/* Code */}
          <div>
            <label htmlFor="code" className={labelClass}>
              Reset Code
            </label>
            <input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              className={inputClass}
            />
          </div>

          {/* New password */}
          <div>
            <label htmlFor="password" className={labelClass}>
              New Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className={inputClass}
            />
          </div>

          <div className="pt-1">
            <button
              type="submit"
              disabled={loading || !isLoaded}
              className={submitClass}
            >
              {loading ? "Resetting..." : "Reset password"}
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleSendCode} className="space-y-4">
          {/* Email */}
          <div>
            <label htmlFor="email" className={labelClass}>
              Email Address
            </label>
            <input
              id="email"
              type="email"
              placeholder="sarah@techflow.io"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className={inputClass}
            />
          </div>

          {/* Submit */}
          <div className="pt-1">
            <button
              type="submit"
              disabled={loading || !isLoaded}
              className={submitClass}
            >
              {loading ? "Sending..." : "Send reset code"}
            </button>
          </div>
        </form>
      )}

      {/* Footer */}
      <p className="mt-6 text-center text-sm text-on-surface-variant">
        Remember your password?{" "}
        <Link
          href="/sign-in"
          className="font-semibold text-primary-container hover:text-primary transition-colors"
        >
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
};

export default ForgotPasswordForm;
