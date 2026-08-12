"use client";

import { useAuth, useSignUp } from "@clerk/nextjs";
import { IconEye, IconEyeOff } from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";
import toast from "react-hot-toast";
import AuthLayout from "./AuthLayout";

const SignUpForm = () => {
  const { signUp, isLoaded } = useSignUp();
  const { isSignedIn } = useAuth();
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isSignedIn) {
      router.push("/dashboard");
    }
  }, [isSignedIn, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signUp) return;

    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    if (!agreedToTerms) {
      toast.error("Please agree to the terms and conditions");
      return;
    }

    setLoading(true);
    try {
      const result = await signUp.create({
        emailAddress: email,
        password,
      });
      await signUp.update({ firstName: fullName });

      if (result.status === "complete") {
        router.push("/dashboard");
        toast.success("Account created successfully");
      } else if (result.status === "missing_requirements") {
        // Email verification needed — prepare it and send user to the verification page
        try {
          await signUp.prepareEmailAddressVerification({
            strategy: "email_code",
          });
          toast.success("Check your email for a verification code");
        } catch {
          toast(
            "Account created. Please check your email to verify your account.",
            { icon: "📧" },
          );
        }
        router.push("/verify-email");
      } else {
        toast.error("Sign-up could not be completed — please try again");
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
    if (!isLoaded || !signUp) return;

    setLoading(true);
    try {
      await signUp.authenticateWithRedirect({
        strategy: `oauth_${provider}`,
        redirectUrl: "/sso-callback",
        redirectUrlComplete: "/dashboard",
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Social sign-up failed";
      toast.error(message);
      setLoading(false);
    }
  };

  return (
    <AuthLayout variant="sign-up">
      {/* Logo */}
      <div className="mb-8">
        <span className="text-xl font-black text-primary-container tracking-tight">
          NeuraMeet
        </span>
      </div>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-on-surface mb-2">Get Started</h1>
        <p className="text-on-surface-variant text-base">
          Create your account to start optimizing meetings.
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
        {/* Full Name */}
        <div>
          <label
            htmlFor="fullName"
            className="block text-xs text-on-surface mb-1.5 uppercase tracking-wider"
          >
            Full Name
          </label>
          <input
            id="fullName"
            type="text"
            placeholder="Jane Doe"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            className="w-full bg-surface-container-lowest border border-surface-variant rounded-lg px-4 py-2.5 text-on-surface placeholder:text-outline-variant focus:outline-none focus:border-primary-container focus:ring-2 focus:ring-primary-container/20 text-sm transition-all duration-200"
          />
        </div>

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
            placeholder="jane@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full bg-surface-container-lowest border border-surface-variant rounded-lg px-4 py-2.5 text-on-surface placeholder:text-outline-variant focus:outline-none focus:border-primary-container focus:ring-2 focus:ring-primary-container/20 text-sm transition-all duration-200"
          />
        </div>

        {/* Password */}
        <div>
          <label
            htmlFor="password"
            className="block text-xs text-on-surface mb-1.5 uppercase tracking-wider"
          >
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full bg-surface-container-lowest border border-surface-variant rounded-lg px-4 py-2.5 pr-10 text-on-surface placeholder:text-outline-variant focus:outline-none focus:border-primary-container focus:ring-2 focus:ring-primary-container/20 text-sm transition-all duration-200"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-outline hover:text-primary transition-colors"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <IconEyeOff size={20} /> : <IconEye size={20} />}
            </button>
          </div>
        </div>

        {/* Confirm Password */}
        <div>
          <label
            htmlFor="confirmPassword"
            className="block text-xs text-on-surface mb-1.5 uppercase tracking-wider"
          >
            Confirm Password
          </label>
          <div className="relative">
            <input
              id="confirmPassword"
              type={showConfirmPassword ? "text" : "password"}
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              className="w-full bg-surface-container-lowest border border-surface-variant rounded-lg px-4 py-2.5 pr-10 text-on-surface placeholder:text-outline-variant focus:outline-none focus:border-primary-container focus:ring-2 focus:ring-primary-container/20 text-sm transition-all duration-200"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-outline hover:text-primary transition-colors"
              aria-label={
                showConfirmPassword ? "Hide password" : "Show password"
              }
            >
              {showConfirmPassword ? (
                <IconEyeOff size={20} />
              ) : (
                <IconEye size={20} />
              )}
            </button>
          </div>
        </div>

        {/* Terms checkbox */}
        <div className="flex items-start gap-2">
          <input
            id="terms"
            type="checkbox"
            checked={agreedToTerms}
            onChange={(e) => setAgreedToTerms(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-surface-variant text-primary-container focus:ring-primary-container"
          />
          <label
            htmlFor="terms"
            className="text-sm text-on-surface-variant leading-snug"
          >
            I agree to the{" "}
            <span className="text-primary-container hover:underline cursor-pointer">
              Terms of Service
            </span>{" "}
            and{" "}
            <span className="text-primary-container hover:underline cursor-pointer">
              Privacy Policy
            </span>
          </label>
        </div>

        {/* Clerk CAPTCHA — required for bot protection */}
        <div id="clerk-captcha" />

        {/* Submit */}
        <div className="pt-1">
          <button
            type="submit"
            disabled={loading || !isLoaded}
            className="w-full bg-primary-container text-on-primary rounded-lg py-2.5 text-base font-semibold mt-2 flex justify-center items-center gap-2 hover:bg-primary hover:shadow-[0_4px_14px_rgba(131,14,249,0.25)] transition-all duration-200 transform hover:scale-[1.01] active:scale-95 disabled:opacity-50"
          >
            {loading ? "Please wait..." : "Create Account"}
            {!loading && (
              <svg
                aria-hidden="true"
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            )}
          </button>
        </div>
      </form>

      {/* Footer */}
      <p className="mt-6 text-center text-sm text-on-surface-variant">
        Already have an account?{" "}
        <Link
          href="/sign-in"
          className="font-semibold text-primary-container hover:underline underline-offset-4 transition-all"
        >
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
};

export default SignUpForm;
