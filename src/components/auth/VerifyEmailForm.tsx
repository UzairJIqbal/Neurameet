"use client";

import { useSignUp } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";
import toast from "react-hot-toast";
import AuthLayout from "./AuthLayout";

const VerifyEmailForm = () => {
  const { isLoaded, signUp, setActive } = useSignUp();
  const router = useRouter();

  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  // If sign-up isn't in progress, redirect to sign-up
  useEffect(() => {
    if (isLoaded && !signUp) {
      router.push("/sign-up");
    }
  }, [isLoaded, signUp, router]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signUp) return;

    setLoading(true);
    try {
      const result = await signUp.attemptEmailAddressVerification({ code });

      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        toast.success("Email verified successfully");
        router.push("/dashboard");
      } else {
        toast.error("Invalid verification code — please try again");
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Verification failed";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!isLoaded || !signUp) return;

    setResending(true);
    try {
      await signUp.prepareEmailAddressVerification({
        strategy: "email_code",
      });
      toast.success("New verification code sent to your email");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Could not resend code";
      toast.error(message);
    } finally {
      setResending(false);
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
          Verify your email
        </h1>
        <p className="text-on-surface-variant text-base">
          Enter the verification code we sent to your email address.
        </p>
      </div>

      {/* Clerk CAPTCHA */}
      <div id="clerk-captcha" />

      <form onSubmit={handleVerify} className="space-y-4">
        {/* Verification Code */}
        <div>
          <label
            htmlFor="code"
            className="block text-xs text-on-surface mb-1.5 uppercase tracking-wider"
          >
            Verification Code
          </label>
          <input
            id="code"
            type="text"
            placeholder="Enter 6-digit code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
            autoComplete="one-time-code"
            className="w-full bg-surface-container-lowest border border-surface-variant rounded-lg px-4 py-2.5 text-on-surface placeholder:text-outline-variant focus:outline-none focus:border-primary-container focus:ring-2 focus:ring-primary-container/20 text-sm transition-all duration-200 text-center tracking-[0.3em] font-mono"
          />
        </div>

        {/* Submit */}
        <div className="pt-1">
          <button
            type="submit"
            disabled={loading || !isLoaded || code.length < 6}
            className="flex w-full justify-center rounded-lg bg-primary-container px-3 py-2.5 text-sm font-semibold text-on-primary shadow-sm hover:bg-primary transition-colors disabled:opacity-50"
          >
            {loading ? "Verifying..." : "Verify Email"}
          </button>
        </div>
      </form>

      {/* Resend */}
      <p className="mt-4 text-center text-sm text-on-surface-variant">
        Didn&apos;t receive a code?{" "}
        <button
          type="button"
          onClick={handleResend}
          disabled={resending}
          className="font-semibold text-primary-container hover:text-primary transition-colors disabled:opacity-50"
        >
          {resending ? "Sending..." : "Resend code"}
        </button>
      </p>

      {/* Back to sign-in */}
      <p className="mt-6 text-center text-sm text-on-surface-variant">
        Already verified?{" "}
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

export default VerifyEmailForm;
