"use client";

import { useAuth, useSignIn } from "@clerk/nextjs";
import { IconEye, IconEyeOff, IconLock } from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";
import toast from "react-hot-toast";
import AuthLayout from "./AuthLayout";

const SignInForm = () => {
  const { signIn, isLoaded } = useSignIn();
  const { isSignedIn } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isSignedIn) {
      router.push("/dashboard");
    }
  }, [isSignedIn, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signIn) return;

    setLoading(true);
    try {
      const result = await signIn.create({
        strategy: "password",
        identifier: email,
        password,
      });
      if (result.status === "complete") {
        router.push("/dashboard");
        toast.success("Signed in successfully");
      } else {
        // Factor needed, email verification pending, etc.
        toast("Additional verification required — please check your email", {
          icon: "📧",
        });
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Something went wrong";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleSocialLogin = async (provider: "google" | "github") => {
    if (!isLoaded || !signIn) return;

    setLoading(true);
    try {
      await signIn.authenticateWithRedirect({
        strategy: `oauth_${provider}`,
        redirectUrl: "/sso-callback",
        redirectUrlComplete: "/dashboard",
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Social sign-in failed";
      toast.error(message);
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
          Welcome back
        </h1>
        <p className="text-on-surface-variant text-base">
          Sign in to your account
        </p>
      </div>

      {/* OAuth Buttons */}
      <div className="space-y-3 mb-6">
        <button
          type="button"
          onClick={() => handleSocialLogin("google")}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 bg-surface-container-lowest border border-surface-variant rounded-lg py-2.5 px-4 hover:bg-surface-container-low transition-colors group disabled:opacity-50"
        >
          <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24">
            <path
              d="M12.0003 4.75C13.7703 4.75 15.3553 5.36002 16.6053 6.54998L20.0303 3.125C17.9502 1.19 15.2353 0 12.0003 0C7.31028 0 3.25527 2.69 1.28027 6.60998L5.27028 9.70498C6.21525 6.86002 8.87028 4.75 12.0003 4.75Z"
              fill="#EA4335"
            />
            <path
              d="M23.49 12.275C23.49 11.49 23.415 10.73 23.3 10H12V14.51H18.47C18.18 15.99 17.34 17.25 16.08 18.1L19.945 21.1C22.2 19.01 23.49 15.92 23.49 12.275Z"
              fill="#4285F4"
            />
            <path
              d="M5.26498 14.2949C5.02498 13.5699 4.88501 12.7999 4.88501 11.9999C4.88501 11.1999 5.01998 10.4299 5.26498 9.7049L1.275 6.60986C0.46 8.22986 0 10.0599 0 11.9999C0 13.9399 0.46 15.7699 1.28 17.3899L5.26498 14.2949Z"
              fill="#FBBC05"
            />
            <path
              d="M12.0004 24.0001C15.2404 24.0001 17.9654 22.935 19.9454 21.095L16.0804 18.095C15.0054 18.82 13.6204 19.245 12.0004 19.245C8.8704 19.245 6.21537 17.135 5.2654 14.29L1.27539 17.385C3.25539 21.31 7.3104 24.0001 12.0004 24.0001Z"
              fill="#34A853"
            />
          </svg>
          <span className="text-sm font-semibold text-on-surface group-hover:text-primary transition-colors">
            Continue with Google
          </span>
        </button>
        <button
          type="button"
          onClick={() => handleSocialLogin("github")}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 bg-surface-container-lowest border border-surface-variant rounded-lg py-2.5 px-4 hover:bg-surface-container-low transition-colors group disabled:opacity-50"
        >
          <svg
            aria-hidden="true"
            className="h-5 w-5 fill-on-surface"
            viewBox="0 0 24 24"
          >
            <path
              clipRule="evenodd"
              d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
              fillRule="evenodd"
            />
          </svg>
          <span className="text-sm font-semibold text-on-surface group-hover:text-primary transition-colors">
            Continue with GitHub
          </span>
        </button>
      </div>

      {/* Divider */}
      <div className="relative mb-6">
        <div aria-hidden="true" className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-surface-variant" />
        </div>
        <div className="relative flex justify-center text-sm font-medium leading-6">
          <span className="bg-surface-container-lowest px-2 text-xs text-outline uppercase tracking-wider">
            or
          </span>
        </div>
      </div>

      {/* Form */}
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

        {/* Password */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label
              htmlFor="password"
              className="block text-xs text-on-surface uppercase tracking-wider"
            >
              Password
            </label>
            <Link
              href="/forgot-password"
              className="text-xs text-primary-container hover:text-primary transition-colors"
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative group">
            <IconLock
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-outline"
            />
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-surface-container-lowest border border-surface-variant rounded-lg pl-10 pr-10 py-2.5 text-on-surface placeholder:text-outline-variant focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-container text-sm transition-shadow"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-outline hover:text-primary transition-colors focus:outline-none"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <IconEyeOff size={20} /> : <IconEye size={20} />}
            </button>
          </div>
        </div>

        {/* Clerk CAPTCHA — required for bot protection */}
        <div id="clerk-captcha" />

        {/* Submit */}
        <div className="pt-1">
          <button
            type="submit"
            disabled={loading || !isLoaded}
            className="flex w-full justify-center rounded-lg bg-primary-container px-3 py-2.5 text-sm font-semibold text-on-primary shadow-sm hover:bg-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-container transition-colors disabled:opacity-50"
          >
            {loading ? "Please wait..." : "Sign in"}
          </button>
        </div>
      </form>

      {/* Footer */}
      <p className="mt-6 text-center text-sm text-on-surface-variant">
        Don&apos;t have an account?{" "}
        <Link
          href="/sign-up"
          className="font-semibold text-primary-container hover:text-primary transition-colors"
        >
          Sign up
        </Link>
      </p>
    </AuthLayout>
  );
};

export default SignInForm;
