"use client";

import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

export function ProgressBar({ step, total }: { step: number; total: number }) {
  const pct = Math.round((step / total) * 100);
  return (
    <div className="h-1.5 w-full bg-cream-200 rounded-full overflow-hidden" role="progressbar" aria-valuenow={step} aria-valuemin={1} aria-valuemax={total}>
      <div
        className="h-full bg-forest-600 rounded-full transition-all duration-300 ease-out motion-reduce:transition-none"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 py-2 -ml-1 pl-1 pr-2 rounded-lg min-h-[44px]"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
      </svg>
      Back
    </button>
  );
}

export function SkipLink({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="text-sm text-forest-600 hover:text-forest-700 font-medium underline underline-offset-2">
      Skip
    </button>
  );
}

export function OptionalLabel() {
  return <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Optional</span>;
}

export function BottomCTA({ children, disabled, loading, onClick, label = "Continue" }: {
  children?: React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
  onClick: () => void;
  label?: string;
}) {
  return (
    <div className="pt-4 pb-[max(16px,env(safe-area-inset-bottom))]">
      {children}
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || loading}
        className="w-full min-h-[48px] h-12 rounded-2xl bg-forest-600 text-white font-semibold text-[15px] shadow-sm hover:bg-forest-700 active:scale-[0.99] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
      >
        {loading ? "Saving…" : label}
      </button>
    </div>
  );
}

export function Tile({ label, icon, selected, onClick, multi = true }: {
  label: string;
  icon: React.ReactNode;
  selected: boolean;
  onClick: () => void;
  multi?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "relative flex flex-col items-start gap-2.5 min-h-[92px] p-4 rounded-2xl border text-left transition-all active:scale-[0.98]",
        selected
          ? "border-forest-500 bg-forest-50 ring-1 ring-forest-500"
          : "border-gray-200 bg-white hover:border-gray-300"
      )}
    >
      {multi && selected && (
        <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-forest-600 text-white flex items-center justify-center">
          <Check className="w-3 h-3" strokeWidth={3} />
        </span>
      )}
      <span className={cn("w-9 h-9 rounded-xl flex items-center justify-center", selected ? "bg-forest-100 text-forest-700" : "bg-gray-50 text-gray-500")}>
        {icon}
      </span>
      <span className="text-sm font-semibold text-gray-900 leading-snug">{label}</span>
    </button>
  );
}

export function Chip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "min-h-[48px] px-4 rounded-full border text-sm font-medium transition-all active:scale-[0.98]",
        selected
          ? "border-forest-500 bg-forest-600 text-white"
          : "border-gray-300 text-gray-600 hover:border-gray-400"
      )}
    >
      {label}
    </button>
  );
}

export function ChoiceCard({ title, description, selected, onClick }: {
  title: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "w-full flex items-start gap-3 min-h-[64px] p-4 rounded-2xl border text-left transition-all active:scale-[0.99]",
        selected ? "border-forest-500 bg-forest-50 ring-1 ring-forest-500" : "border-gray-200 bg-white hover:border-gray-300"
      )}
    >
      <span className={cn(
        "mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0",
        selected ? "border-forest-600 bg-forest-600" : "border-gray-300"
      )}>
        {selected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
      </span>
      <span>
        <span className="block text-sm font-semibold text-gray-900">{title}</span>
        <span className="block text-xs text-gray-500 mt-0.5">{description}</span>
      </span>
    </button>
  );
}

export function NumberStepper({ label, value, onChange, min = 0, step = 1, format }: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  step?: number;
  format?: (v: number) => string;
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, Math.round((value - step) * 10) / 10))}
          disabled={value <= min}
          aria-label={`Decrease ${label}`}
          className="w-11 h-11 rounded-full border border-gray-300 flex items-center justify-center text-gray-600 hover:border-forest-400 disabled:opacity-30 disabled:hover:border-gray-300 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20 12H4" /></svg>
        </button>
        <span className="w-8 text-center text-base font-bold text-gray-900 tabular-nums">{format ? format(value) : value}</span>
        <button
          type="button"
          onClick={() => onChange(Math.round((value + step) * 10) / 10)}
          aria-label={`Increase ${label}`}
          className="w-11 h-11 rounded-full border border-gray-300 flex items-center justify-center text-gray-600 hover:border-forest-400 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
        </button>
      </div>
    </div>
  );
}
