"use client";

import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Appelé quand les 6 chiffres sont saisis (validation automatique possible). */
  onComplete?: (value: string) => void;
  length?: number;
  autoFocus?: boolean;
  disabled?: boolean;
  /** Reçus du `Field` : l'étiquette vise la première case. */
  id?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  className?: string;
  /** Code secret (code caisse) : chiffres masqués, sans suggestion de code reçu. */
  secret?: boolean;
}

/**
 * Saisie d'un code à 6 chiffres, une case par chiffre : collage d'un code entier, passage automatique
 * à la case suivante, retour arrière et flèches. La première case porte `autocomplete="one-time-code"`
 * pour que le téléphone propose le code reçu.
 */
export function OtpInput({ value, onChange, onComplete, length = 6, autoFocus, disabled, id, className, secret, ...aria }: OtpInputProps) {
  const t = useTranslations("common.otp");
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? "");

  const focus = (index: number) => refs.current[Math.max(0, Math.min(length - 1, index))]?.focus();

  const set = (next: string) => {
    const clean = next.replace(/\D/g, "").slice(0, length);
    onChange(clean);
    if (clean.length === length) onComplete?.(clean);
  };

  const type = (index: number, raw: string) => {
    const typed = raw.replace(/\D/g, "");
    if (!typed) return;
    // Plusieurs chiffres d'un coup (remplissage automatique du téléphone) : à partir de cette case.
    const chars = digits.slice();
    typed.split("").forEach((c, k) => {
      if (index + k < length) chars[index + k] = c;
    });
    set(chars.join(""));
    focus(index + typed.length);
  };

  const onKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      const chars = digits.slice();
      if (chars[index]) {
        chars[index] = "";
        set(chars.join("").trimEnd());
      } else if (index > 0) {
        chars[index - 1] = "";
        set(chars.join(""));
        focus(index - 1);
      }
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      focus(index - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      focus(index + 1);
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!pasted) return;
    e.preventDefault();
    set(pasted);
    focus(pasted.length);
  };

  return (
    <div dir="ltr" role="group" className={cn("flex justify-center gap-2", className)}>
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => {
            refs.current[index] = el;
          }}
          id={index === 0 ? id : undefined}
          aria-label={t("digit", { index: index + 1, length })}
          aria-invalid={aria["aria-invalid"]}
          aria-describedby={index === 0 ? aria["aria-describedby"] : undefined}
          type={secret ? "password" : "text"}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={index === 0 && !secret ? "one-time-code" : "off"}
          maxLength={index === 0 ? length : 1}
          autoFocus={autoFocus && index === 0}
          disabled={disabled}
          value={digit}
          onChange={(e) => type(index, e.target.value)}
          onKeyDown={(e) => onKeyDown(index, e)}
          onPaste={onPaste}
          onFocus={(e) => e.target.select()}
          className={cn(
            "h-14 w-11 min-w-0 rounded-[var(--radius)] border border-line bg-surface text-center font-mono text-2xl font-semibold text-ink shadow-xs outline-none transition-colors sm:w-12",
            "focus:border-cobalt focus:ring-2 focus:ring-cobalt/30 disabled:opacity-60",
            aria["aria-invalid"] && "border-danger",
            digit && "border-ink-3",
          )}
        />
      ))}
    </div>
  );
}
