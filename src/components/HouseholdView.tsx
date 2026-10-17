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
        <h2 className="font-serif text-3xl text-[#282825]">
          {t.household.title}
        </h2>
        <p className="text-xs font-medium text-[#64645e] mt-0.5">
          {t.household.sharedDesc}
        </p>
      </div>

      {/* Authentication & Cloud Sync Card */}
      <div className="rounded-3xl border border-[#282825] bg-white p-5 space-y-4 shadow-editorial">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-serif text-xl text-[#282825]">
            <Cloud className="h-4 w-4 text-[#057b40]" />
            <span>{t.household.authStatus}</span>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-[11px] font-bold border ${
              userEmail
                ? "bg-[#e7f4eb] text-[#057b40] border-[#b5e3c4]"
                : "bg-[#fdeee0] text-[#b85d10] border-[#faca9e]"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                userEmail ? "bg-[#057b40]" : "bg-[#f09236]"
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
          <div className="flex items-center justify-between rounded-2xl bg-[#f8f8f7] px-4 py-3 border border-[#c5c5ba]">
            <div>
              <div className="text-xs text-[#64645e]">
                {locale === "sv" ? "Inloggad som" : "Signed in as"}
              </div>
              <div className="font-mono text-xs font-bold text-[#282825]">
                {userEmail}
              </div>
            </div>
            <button
              type="button"
              onClick={onSignOut}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#282825] bg-white px-4 py-2 text-xs font-semibold text-[#282825] hover:bg-[#ecece9]"
            >
              <LogOut className="h-3.5 w-3.5" />
              {t.household.signOutBtn}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-[#64645e]">
              {t.household.signInSubtitle}
            </p>

            {/* Google SSO Button */}
            <button
              type="button"
              disabled={authLoading}
              onClick={handleGoogleLogin}
              className="flex w-full items-center justify-center gap-2 rounded-full border border-[#282825] bg-[#e1edfe] py-2.5 px-4 text-xs font-bold text-[#282825] hover:bg-[#b8d5ff] transition"
            >
              <Sparkles className="h-4 w-4 text-[#2173be]" />
              {t.household.googleBtn}
            </button>

            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-[#ecece9]" />
              <span className="shrink mx-3 text-[11px] text-[#8f8f89]">
                {locale === "sv" ? "eller med e-post" : "or with email"}
              </span>
              <div className="flex-grow border-t border-[#ecece9]" />
            </div>

            <form onSubmit={handleEmailSignIn} className="space-y-2.5">
              <input
                type="email"
                required
                placeholder={t.household.emailPlaceholder}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-full border border-[#c5c5ba] bg-[#f8f8f7] px-4 py-2.5 text-sm text-[#282825] placeholder:text-[#8f8f89] focus:border-[#282825] focus:outline-none"
              />
              <input
                type="password"
                placeholder={t.household.passwordPlaceholder}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-full border border-[#c5c5ba] bg-[#f8f8f7] px-4 py-2.5 text-sm text-[#282825] placeholder:text-[#8f8f89] focus:border-[#282825] focus:outline-none"
              />

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="submit"
                  disabled={authLoading}
                  className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[#0c0d0d] py-2.5 px-3 text-xs font-semibold text-white hover:bg-[#282825] disabled:opacity-50"
                >
                  <LogIn className="h-3.5 w-3.5" />
                  {t.household.signInBtn}
                </button>
                <button
                  type="button"
                  disabled={authLoading}
                  onClick={handleEmailSignUp}
                  className="inline-flex items-center justify-center gap-1.5 rounded-full border border-[#282825] bg-white py-2.5 px-3 text-xs font-semibold text-[#282825] hover:bg-[#ecece9] disabled:opacity-50"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  {t.household.signUpBtn}
                </button>
              </div>

              <button
                type="button"
                disabled={authLoading}
                onClick={handleMagicLink}
                className="flex w-full items-center justify-center gap-1.5 rounded-full border border-[#c5c5ba] bg-[#f8f8f7] py-2 text-xs font-semibold text-[#282825] hover:border-[#282825]"
              >
                <Mail className="h-3.5 w-3.5 text-[#057b40]" />
                {t.household.magicLinkBtn}
              </button>
            </form>

            {authMessage && (
              <div
                className={`rounded-2xl p-3 text-xs font-medium border ${
                  authMessage.type === "error"
                    ? "bg-[#fdeeed] text-[#b81a14] border-[#eb5b55]"
                    : "bg-[#e7f4eb] text-[#057b40] border-[#529a6a]"
                }`}
              >
                {authMessage.text}
              </div>
            )}
          </div>
        )}

        {/* Database Table Readiness Indicator */}
        <div className="flex items-center justify-between rounded-2xl bg-[#f8f8f7] px-3.5 py-2.5 text-xs border border-[#ecece9]">
          <div className="flex items-center gap-2 font-mono text-[#64645e]">
            <Database className="h-3.5 w-3.5 text-[#057b40]" />
            <span>Supabase: ziopeltcopzvyyxsmvap</span>
          </div>
          <span
            className={`font-semibold ${
              dbReady ? "text-[#057b40]" : "text-[#b85d10]"
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
      <div className="rounded-3xl border border-[#c5c5ba] bg-white p-5 space-y-4 shadow-editorial">
        <div className="flex items-center gap-2 font-serif text-xl text-[#282825]">
          <Users className="h-4 w-4 text-[#2173be]" />
          <span>{household.name}</span>
        </div>

        {/* Rename household */}
        <div className="flex gap-2">
          <input
            type="text"
            value={householdNameInput}
            onChange={(e) => setHouseholdNameInput(e.target.value)}
            className="flex-1 rounded-full border border-[#c5c5ba] bg-[#f8f8f7] px-4 py-2 text-xs text-[#282825]"
          />
          <button
            type="button"
            onClick={() => onUpdateHouseholdName(householdNameInput)}
            className="rounded-full bg-[#0c0d0d] px-4 py-2 text-xs font-semibold text-white hover:bg-[#282825]"
          >
            {t.actions.save}
          </button>
        </div>

        {/* Invite code box */}
        <div className="flex items-center justify-between rounded-2xl bg-[#e7f4eb] p-3.5 border border-[#b5e3c4]">
          <div>
            <div className="text-[11px] font-semibold text-[#057b40]">
              {t.household.inviteCode}
            </div>
            <div className="mt-0.5 font-mono text-base font-bold tracking-widest text-[#282825]">
              {household.invite_code}
            </div>
          </div>
          <button
            type="button"
            onClick={handleCopyInvite}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#282825] bg-white px-3.5 py-2 text-xs font-semibold text-[#282825] hover:bg-[#b5e3c4]"
          >
            {copiedCode ? (
              <>
                <Check className="h-3.5 w-3.5 text-[#057b40]" />
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
          <label className="block text-xs font-semibold text-[#64645e]">
            {t.household.joinHousehold}
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder={t.household.enterInviteCode}
              value={joinCodeInput}
              onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
              className="flex-1 rounded-full border border-[#c5c5ba] bg-[#f8f8f7] px-4 py-2 text-xs font-mono uppercase text-[#282825] placeholder:font-sans placeholder:normal-case"
            />
            <button
              type="submit"
              className="rounded-full border border-[#282825] bg-white px-5 py-2 text-xs font-semibold text-[#282825] hover:bg-[#ecece9]"
            >
              {t.household.joinBtn}
            </button>
          </div>
          {joinStatus && (
            <p className="text-xs font-medium text-[#057b40]">{joinStatus}</p>
          )}
        </form>

        {/* Members list */}
        {members.length > 0 && (
          <div className="pt-2 border-t border-[#ecece9] space-y-1.5">
            <div className="text-xs font-semibold text-[#64645e]">
              {t.household.members} ({members.length})
            </div>
            {members.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between rounded-xl bg-[#f8f8f7] px-3 py-2 text-xs border border-[#ecece9]"
              >
                <span className="font-mono text-[#282825]">
                  {m.member_email || m.user_id.slice(0, 8)}
                </span>
                <span className="rounded-full bg-[#e1edfe] px-2.5 py-0.5 text-[10px] font-bold uppercase text-[#2173be]">
                  {m.role}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Language & Currency Preferences */}
      <div className="rounded-3xl border border-[#c5c5ba] bg-white p-5 space-y-4 shadow-editorial">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#282825]">
            <Globe className="h-4 w-4 text-[#057b40]" />
            <span>{t.household.language}</span>
          </div>
          <div className="inline-flex rounded-full bg-[#ecece9] p-1 border border-[#c5c5ba]">
            <button
              type="button"
              onClick={() => onChangeLocale("sv")}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                locale === "sv"
                  ? "bg-[#0c0d0d] text-white"
                  : "text-[#64645e] hover:text-[#282825]"
              }`}
            >
              Svenska
            </button>
            <button
              type="button"
              onClick={() => onChangeLocale("en")}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                locale === "en"
                  ? "bg-[#0c0d0d] text-white"
                  : "text-[#64645e] hover:text-[#282825]"
              }`}
            >
              English
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-[#ecece9]">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#282825]">
            <Coins className="h-4 w-4 text-[#f09236]" />
            <span>{t.household.currency}</span>
          </div>
          <div className="flex gap-1.5">
            {CURRENCIES.map((cur) => (
              <button
                key={cur}
                type="button"
                onClick={() => onChangeCurrency(cur)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  currency === cur
                    ? "bg-[#0c0d0d] text-white"
                    : "bg-[#f8f8f7] text-[#64645e] border border-[#c5c5ba]"
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
