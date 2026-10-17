"use client";

import React, { useState } from "react";
import {
  Users,
  Copy,
  Check,
  Globe,
  Coins,
  LogIn,
  LogOut,
  Mail,
  Sparkles,
  Cloud,
  Database,
  UserPlus,
} from "lucide-react";
import { Household, HouseholdMember, Locale } from "@/lib/types";
import { translations } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/client";

interface HouseholdViewProps {
  household: Household;
  members: HouseholdMember[];
  userEmail: string | null;
  dbReady: boolean;
  locale: Locale;
  currency: string;
  onChangeLocale: (loc: Locale) => void;
  onChangeCurrency: (cur: string) => void;
  onUpdateHouseholdName: (name: string) => Promise<void>;
  onJoinHouseholdByCode: (code: string) => Promise<void>;
  onSignOut: () => Promise<void>;
}

const CURRENCIES = ["SEK", "EUR", "NOK", "DKK", "USD"];

export function HouseholdView({
  household,
  members,
  userEmail,
  dbReady,
  locale,
  currency,
  onChangeLocale,
  onChangeCurrency,
  onUpdateHouseholdName,
  onJoinHouseholdByCode,
  onSignOut,
}: HouseholdViewProps) {
  const t = translations[locale];
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authMessage, setAuthMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const [copiedCode, setCopiedCode] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [householdNameInput, setHouseholdNameInput] = useState(household.name);
  const [joinStatus, setJoinStatus] = useState<string | null>(null);

  const handleCopyInvite = () => {
    navigator.clipboard.writeText(household.invite_code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setAuthLoading(true);
    setAuthMessage(null);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setAuthLoading(false);
    if (error) {
      setAuthMessage({ type: "error", text: error.message });
    }
  };

  const handleEmailSignUp = async () => {
    if (!email || !password) {
      setAuthMessage({
        type: "error",
        text:
          locale === "sv"
            ? "Fyll i både e-post och lösenord (minst 6 tecken)."
            : "Please enter both email and password (min 6 chars).",
      });
      return;
    }
    setAuthLoading(true);
    setAuthMessage(null);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setAuthLoading(false);
    if (error) {
      setAuthMessage({ type: "error", text: error.message });
    } else {
      setAuthMessage({
        type: "success",
        text:
          locale === "sv"
            ? "Konto skapat! Kolla din e-post om bekräftelse krävs, eller logga in direkt."
            : "Account created! Check your email if confirmation is enabled.",
      });
    }
  };

  const handleMagicLink = async () => {
    if (!email) {
      setAuthMessage({
        type: "error",
        text:
          locale === "sv"
            ? "Ange din e-postadress först."
            : "Please enter your email address first.",
      });
      return;
    }
    setAuthLoading(true);
    setAuthMessage(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setAuthLoading(false);
    if (error) {
      setAuthMessage({ type: "error", text: error.message });
    } else {
      setAuthMessage({
        type: "success",
        text:
          locale === "sv"
            ? "Magisk inloggningslänk skickad till din e-post!"
            : "Magic login link sent to your email!",
      });
    }
  };

  const handleGoogleLogin = async () => {
    setAuthLoading(true);
    setAuthMessage(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setAuthLoading(false);
      setAuthMessage({ type: "error", text: error.message });
    }
  };

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCodeInput.trim()) return;
    try {
      await onJoinHouseholdByCode(joinCodeInput.trim());
      setJoinCodeInput("");
      setJoinStatus(
        locale === "sv"
          ? "Du har gått med i hushållet!"
          : "Successfully joined household!"
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error";
      setJoinStatus(msg);
    }
  };

  return (
    <div className="space-y-5 pb-28">
      <div>
        <h2 className="text-xl font-bold text-white">{t.household.title}</h2>
        <p className="text-xs text-slate-400 mt-0.5">
          {t.household.sharedDesc}
        </p>
      </div>

      {/* Authentication & Cloud Sync Card */}
      <div className="rounded-3xl border border-slate-800/90 bg-[#111726] p-4.5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <Cloud className="h-4 w-4 text-emerald-400" />
            <span>{t.household.authStatus}</span>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
              userEmail
                ? "bg-emerald-500/15 text-emerald-400"
                : "bg-amber-500/15 text-amber-300"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                userEmail ? "bg-emerald-400" : "bg-amber-400"
              }`}
            />
            {userEmail
              ? locale === "sv"
                ? "Inloggad (Supabase)"
                : "Signed in (Supabase)"
              : locale === "sv"
              ? "Lokalt läge"
              : "Local mode"}
          </span>
        </div>

        {userEmail ? (
          <div className="flex items-center justify-between rounded-2xl bg-slate-900/90 px-3.5 py-3 border border-slate-800">
            <div>
              <div className="text-xs text-slate-400">
                {locale === "sv" ? "Inloggad som" : "Signed in as"}
              </div>
              <div className="text-sm font-semibold text-white">
                {userEmail}
              </div>
            </div>
            <button
              type="button"
              onClick={onSignOut}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700"
            >
              <LogOut className="h-3.5 w-3.5" />
              {t.household.signOutBtn}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-slate-400">
              {t.household.signInSubtitle}
            </p>

            {/* Google SSO Button */}
            <button
              type="button"
              disabled={authLoading}
              onClick={handleGoogleLogin}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-700 bg-slate-900 py-2.5 px-4 text-xs font-bold text-white hover:bg-slate-800 transition"
            >
              <Sparkles className="h-4 w-4 text-emerald-400" />
              {t.household.googleBtn}
            </button>

            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-slate-800" />
              <span className="shrink mx-3 text-[11px] text-slate-500">
                {locale === "sv" ? "eller med e-post" : "or with email"}
              </span>
              <div className="flex-grow border-t border-slate-800" />
            </div>

            <form onSubmit={handleEmailSignIn} className="space-y-2.5">
              <input
                type="email"
                required
                placeholder={t.household.emailPlaceholder}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
              />
              <input
                type="password"
                placeholder={t.household.passwordPlaceholder}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
              />

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="submit"
                  disabled={authLoading}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500 py-2.5 px-3 text-xs font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
                >
                  <LogIn className="h-3.5 w-3.5" />
                  {t.household.signInBtn}
                </button>
                <button
                  type="button"
                  disabled={authLoading}
                  onClick={handleEmailSignUp}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-800 py-2.5 px-3 text-xs font-bold text-white hover:bg-slate-700 disabled:opacity-50"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  {t.household.signUpBtn}
                </button>
              </div>

              <button
                type="button"
                disabled={authLoading}
                onClick={handleMagicLink}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-800 bg-slate-950/80 py-2 text-xs font-medium text-slate-300 hover:bg-slate-900"
              >
                <Mail className="h-3.5 w-3.5 text-emerald-400" />
                {t.household.magicLinkBtn}
              </button>
            </form>

            {authMessage && (
              <div
                className={`rounded-xl p-3 text-xs ${
                  authMessage.type === "error"
                    ? "bg-rose-500/15 text-rose-300 border border-rose-500/30"
                    : "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                }`}
              >
                {authMessage.text}
              </div>
            )}
          </div>
        )}

        {/* Database Table Readiness Indicator */}
        <div className="flex items-center justify-between rounded-2xl bg-slate-950/70 px-3.5 py-2.5 text-xs border border-slate-800/80">
          <div className="flex items-center gap-2 text-slate-300">
            <Database className="h-3.5 w-3.5 text-emerald-400" />
            <span>Supabase: ziopeltcopzvyyxsmvap</span>
          </div>
          <span
            className={`font-semibold ${
              dbReady ? "text-emerald-400" : "text-amber-400"
            }`}
          >
            {dbReady
              ? locale === "sv"
                ? "Tabeller redo"
                : "Tables ready"
              : locale === "sv"
              ? "Väntar på SQL-migrering"
              : "Awaiting SQL migration"}
          </span>
        </div>
      </div>

      {/* Shared Household & Invite Code */}
      <div className="rounded-3xl border border-slate-800/90 bg-[#111726] p-4.5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-bold text-white">
          <Users className="h-4 w-4 text-emerald-400" />
          <span>{household.name}</span>
        </div>

        {/* Rename household */}
        <div className="flex gap-2">
          <input
            type="text"
            value={householdNameInput}
            onChange={(e) => setHouseholdNameInput(e.target.value)}
            className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
          />
          <button
            type="button"
            onClick={() => onUpdateHouseholdName(householdNameInput)}
            className="rounded-xl bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700"
          >
            {t.actions.save}
          </button>
        </div>

        {/* Invite code box */}
        <div className="flex items-center justify-between rounded-2xl bg-slate-900 p-3.5 border border-slate-800">
          <div>
            <div className="text-[11px] text-slate-400">
              {t.household.inviteCode}
            </div>
            <div className="mt-0.5 font-mono text-base font-extrabold tracking-widest text-emerald-400">
              {household.invite_code}
            </div>
          </div>
          <button
            type="button"
            onClick={handleCopyInvite}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500/15 px-3.5 py-2 text-xs font-bold text-emerald-300 hover:bg-emerald-500/25"
          >
            {copiedCode ? (
              <>
                <Check className="h-3.5 w-3.5" />
                {t.household.copied}
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                {t.household.copyCode}
              </>
            )}
          </button>
        </div>

        {/* Join another household */}
        <form onSubmit={handleJoinSubmit} className="space-y-2 pt-1">
          <label className="block text-xs font-medium text-slate-400">
            {t.household.joinHousehold}
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder={t.household.enterInviteCode}
              value={joinCodeInput}
              onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
              className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono uppercase text-white placeholder:font-sans placeholder:normal-case"
            />
            <button
              type="submit"
              className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-bold text-white hover:bg-slate-700"
            >
              {t.household.joinBtn}
            </button>
          </div>
          {joinStatus && (
            <p className="text-xs text-emerald-400">{joinStatus}</p>
          )}
        </form>

        {/* Members list */}
        {members.length > 0 && (
          <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
            <div className="text-xs font-medium text-slate-400">
              {t.household.members} ({members.length})
            </div>
            {members.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between rounded-xl bg-slate-950/60 px-3 py-2 text-xs"
              >
                <span className="text-slate-200">
                  {m.member_email || m.user_id.slice(0, 8)}
                </span>
                <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] uppercase text-slate-400">
                  {m.role}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Language & Currency Preferences */}
      <div className="rounded-3xl border border-slate-800/90 bg-[#111726] p-4.5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
            <Globe className="h-4 w-4 text-emerald-400" />
            <span>{t.household.language}</span>
          </div>
          <div className="inline-flex rounded-xl bg-slate-900 p-1 border border-slate-800">
            <button
              type="button"
              onClick={() => onChangeLocale("sv")}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                locale === "sv"
                  ? "bg-emerald-500 text-slate-950"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Svenska
            </button>
            <button
              type="button"
              onClick={() => onChangeLocale("en")}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                locale === "en"
                  ? "bg-emerald-500 text-slate-950"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              English
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
            <Coins className="h-4 w-4 text-emerald-400" />
            <span>{t.household.currency}</span>
          </div>
          <div className="flex gap-1.5">
            {CURRENCIES.map((cur) => (
              <button
                key={cur}
                type="button"
                onClick={() => onChangeCurrency(cur)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${
                  currency === cur
                    ? "bg-emerald-500 text-slate-950"
                    : "bg-slate-900 text-slate-400 border border-slate-800"
                }`}
              >
                {cur}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
