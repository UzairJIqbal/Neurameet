"use client";

import { useSignIn } from "@clerk/nextjs";
import Link from "next/link";
import React, { useState } from "react";
import toast from "react-hot-toast";
import AuthLayout from "./AuthLayout";

const ForgotPasswordForm = () => {
  const { signIn, isLoaded } = useSignIn();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signIn) return;

    setLoading(true);
    try {
      const result = await signIn.create({
        strategy: "reset_password_email_code",
        identifier: email,
      });
      const emailFactor = result.supportedFirstFactors?.find(
        (f) => f.strategy === "reset_password_email_code",
      );
      if (emailFactor && "emailAddressId" in emailFactor) {
        await signIn.prepareFirstFactor({
          strategy: "reset_password_email_code",
          emailAddressId: emailFactor.emailAddressId as string,
        });
      }
      setSent(true);
      toast.success("Check your email for a password reset link");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Something went wrong";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

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
          Enter your email and we&apos;ll send you a reset link.
        </p>
      </div>

      {sent ? (
        <div className="space-y-6">
          <p className="text-on-surface-variant text-sm">
            A password reset link has been sent to{" "}
            <span className="font-semibold text-on-surface">{email}</span>.
            Check your inbox and follow the instructions.
          </p>
          <Link
            href="/sign-in"
            className="block w-full text-center rounded-lg bg-primary-container px-3 py-2.5 text-sm font-semibold text-on-primary shadow-sm hover:bg-primary transition-colors"
          >
            Back to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email */}
          <div>
            <label
              htmlFor="email"
              className="block text-xs text-on-surface mb-1.5 uppercase tracking-wider"
            >
              Email Address
            </label>
            <input
              id="email"
              type="email"
              placeholder="sarah@techflow.io"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-surface-container-lowest border border-surface-variant rounded-lg px-4 py-2.5 text-on-surface placeholder:text-outline-variant focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-container text-sm transition-shadow"
            />
          </div>

          {/* Submit */}
          <div className="pt-1">
            <button
              type="submit"
              disabled={loading || !isLoaded}
              className="flex w-full justify-center rounded-lg bg-primary-container px-3 py-2.5 text-sm font-semibold text-on-primary shadow-sm hover:bg-primary transition-colors disabled:opacity-50"
            >
              {loading ? "Sending..." : "Send reset link"}
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
