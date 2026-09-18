"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Copy, MessageSquare, Send, AlertTriangle } from "lucide-react";
import type { Locale } from "@/i18n/config";
import type { FeedbackDictionary } from "@/i18n/dictionaries";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";

type FeedbackPageProps = {
  controlsDictionary: {
    language: string;
    theme: string;
    lightTheme: string;
    darkTheme: string;
  };
  dictionary: FeedbackDictionary;
  locale: Locale;
};

export function FeedbackPage({
  controlsDictionary,
  dictionary,
  locale
}: FeedbackPageProps) {
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const charCount = message.length;
  const maxChars = 5000;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      setErrorMessage(dictionary.errorEmpty);
      return;
    }

    if (trimmedMessage.length > maxChars) {
      setErrorMessage(dictionary.errorTooLong);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: trimmedMessage,
          email: email.trim() || undefined,
          locale
        })
      });

      if (response.status === 429) {
        setErrorMessage(dictionary.rateLimited);
        return;
      }

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setErrorMessage(data?.error || dictionary.errorGeneric);
        return;
      }

      const result = await response.json();
      setSubmittedId(result.feedbackId);
    } catch {
      setErrorMessage(dictionary.errorGeneric);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCopyId() {
    if (!submittedId) return;

    try {
      await navigator.clipboard.writeText(submittedId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback if clipboard API is restricted
      const textarea = document.createElement("textarea");
      textarea.value = submittedId;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <main className="feedback-page-shell">
      <header className="feedback-page-header">
        <Link className="mode-pill feedback-back-link" href={`/${locale}`}>
          <ArrowLeft className="feedback-back-icon" aria-hidden="true" focusable={false} />
          {dictionary.backToGame}
        </Link>
        <div className="top-actions">
          <LocaleSwitcher currentLocale={locale} label={controlsDictionary.language} />
          <ThemeToggle
            labels={{
              theme: controlsDictionary.theme,
              lightTheme: controlsDictionary.lightTheme,
              darkTheme: controlsDictionary.darkTheme
            }}
          />
        </div>
      </header>

      <section className="feedback-card" aria-labelledby="feedback-heading">
        <div className="feedback-card-header">
          <div className="feedback-icon-wrapper" aria-hidden="true">
            <MessageSquare size={28} />
          </div>
          <h1 id="feedback-heading">{dictionary.title}</h1>
          <p className="feedback-subtitle">{dictionary.subtitle}</p>
        </div>

        {submittedId ? (
          <div className="feedback-success-view" aria-live="polite">
            <div className="feedback-success-badge" aria-hidden="true">
              <Check size={32} />
            </div>
            <h2>{dictionary.successTitle}</h2>
            <p className="feedback-success-desc">
              {dictionary.successDesc.replace("{feedbackId}", submittedId)}
            </p>

            <div className="feedback-id-box">
              <span className="feedback-id-label">ID:</span>
              <code className="feedback-id-value">{submittedId}</code>
              <button
                type="button"
                className="control-btn feedback-copy-btn"
                onClick={handleCopyId}
                title={copied ? dictionary.copiedFeedbackId : dictionary.copyFeedbackId}
              >
                {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
                <span>{copied ? dictionary.copiedFeedbackId : dictionary.copyFeedbackId}</span>
              </button>
            </div>

            <div className="feedback-actions">
              <Link className="mode-pill active" href={`/${locale}`}>
                {dictionary.backToGame}
              </Link>
              <button
                type="button"
                className="mode-pill"
                onClick={() => {
                  setSubmittedId(null);
                  setMessage("");
                  setEmail("");
                  setErrorMessage(null);
                }}
              >
                + {dictionary.submitAction}
              </button>
            </div>
          </div>
        ) : (
          <form className="feedback-form" onSubmit={handleSubmit} noValidate>
            {errorMessage ? (
              <div className="feedback-error-banner" role="alert" aria-live="polite">
                <AlertTriangle size={18} aria-hidden="true" />
                <span>{errorMessage}</span>
              </div>
            ) : null}

            <div className="feedback-field">
              <label htmlFor="feedback-message" className="feedback-label">
                {dictionary.messageLabel}
              </label>
              <textarea
                id="feedback-message"
                name="message"
                className="feedback-textarea"
                rows={6}
                maxLength={maxChars}
                placeholder={dictionary.messagePlaceholder}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                disabled={isSubmitting}
                required
                aria-describedby="feedback-char-count"
              />
              <div
                id="feedback-char-count"
                className={`feedback-char-count ${charCount > maxChars ? "exceeded" : ""}`}
                aria-live="polite"
              >
                {dictionary.charCount
                  .replace("{current}", String(charCount))
                  .replace("{max}", String(maxChars))}
              </div>
            </div>

            <div className="feedback-field">
              <label htmlFor="feedback-email" className="feedback-label">
                {dictionary.emailLabel}
              </label>
              <input
                id="feedback-email"
                name="email"
                type="email"
                className="feedback-input"
                maxLength={254}
                placeholder={dictionary.emailPlaceholder}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSubmitting}
              />
            </div>

            <div className="feedback-submit-row">
              <button
                type="submit"
                className="control-btn primary feedback-submit-btn"
                disabled={isSubmitting || !message.trim() || charCount > maxChars}
                aria-busy={isSubmitting}
              >
                {isSubmitting ? (
                  dictionary.submitting
                ) : (
                  <>
                    <Send size={16} aria-hidden="true" />
                    <span>{dictionary.submitAction}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}
