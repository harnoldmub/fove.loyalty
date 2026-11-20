"use client";

import { Check, ChevronDown, Loader2, Search } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SearchOption {
  value: string;
  label: string;
  /** Texte supplémentaire pris en compte par la recherche (code, symbole…). */
  keywords?: string;
  icon?: ReactNode;
  /** Information alignée en fin de ligne (indicatif, symbole…). */
  meta?: ReactNode;
  frequent?: boolean;
}

export const normalizeSearch = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

interface SearchSelectProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: SearchOption[];
  /** Contenu du bouton ; par défaut l'icône et le libellé de l'option choisie. */
  trigger?: ReactNode;
  placeholder?: string;
  searchPlaceholder: string;
  emptyText: string;
  listLabel: string;
  frequentLabel?: string;
  allLabel?: string;
  /** Recherche contrôlée (résultats distants) : les options ne sont alors pas filtrées ici. */
  query?: string;
  onQueryChange?: (query: string) => void;
  loading?: boolean;
  /** Option ajoutée en fin de liste à partir de la saisie (ex. ville libre). */
  customOption?: (query: string) => SearchOption | null;
  variant?: "field" | "compact";
  className?: string;
  disabled?: boolean;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  "aria-label"?: string;
}

/**
 * Liste déroulante avec recherche (pays, villes, devises, indicatifs) :
 * groupe « fréquents » en tête, navigation au clavier, ouverture vers le haut
 * quand la place manque sous le champ.
 */
export function SearchSelect({
  id,
  value,
  onChange,
  options,
  trigger,
  placeholder,
  searchPlaceholder,
  emptyText,
  listLabel,
  frequentLabel,
  allLabel,
  query: controlledQuery,
  onQueryChange,
  loading,
  customOption,
  variant = "field",
  className,
  disabled,
  ...aria
}: SearchSelectProps) {
  const fallbackId = useId();
  const baseId = id ?? fallbackId;
  const listId = `${baseId}-list`;
  const [open, setOpen] = useState(false);
  const [localQuery, setLocalQuery] = useState("");
  const query = controlledQuery ?? localQuery;
  const setQuery = (next: string) => (onQueryChange ? onQueryChange(next) : setLocalQuery(next));
  const [active, setActive] = useState(0);
  const [placement, setPlacement] = useState<{ up: boolean; max: number }>({ up: false, max: 320 });
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);

  const selected = options.find((o) => o.value === value);
  const q = normalizeSearch(query);
  const items = useMemo(() => {
    const base = !q || onQueryChange ? options : options.filter((o) => normalizeSearch(`${o.label} ${o.value} ${o.keywords ?? ""}`).includes(q));
    const custom = q ? customOption?.(query.trim()) : null;
    return custom ? [...base, custom] : base;
  }, [options, q, query, onQueryChange, customOption]);
  const grouped = !q && !!frequentLabel && items.some((o) => o.frequent);
  const firstOther = grouped ? items.findIndex((o) => !o.frequent) : -1;

  useLayoutEffect(() => {
    if (!open || !root.current) return;
    const rect = root.current.getBoundingClientRect();
    // Sur mobile, l'espace connecté a une barre de navigation fixe en bas (~5 rem).
    const bottomBar = window.innerWidth < 1024 ? 80 : 0;
    const below = window.innerHeight - rect.bottom - 12 - bottomBar;
    const above = rect.top - 12;
    const up = below < 280 && above > below;
    setPlacement({ up, max: Math.max(180, Math.min(360, up ? above : below)) });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => search.current?.focus());
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) close(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || !list.current) return;
    const item = list.current.querySelector<HTMLElement>(`[data-index="${active}"]`);
    if (!item) return;
    const container = list.current;
    if (item.offsetTop < container.scrollTop) container.scrollTop = item.offsetTop;
    else if (item.offsetTop + item.offsetHeight > container.scrollTop + container.clientHeight) {
      container.scrollTop = item.offsetTop + item.offsetHeight - container.clientHeight;
    }
  }, [active, open]);

  function openList() {
    setActive(Math.max(0, items.findIndex((o) => o.value === value)));
    setOpen(true);
  }

  function close(focusButton = true) {
    setOpen(false);
    setQuery("");
    if (focusButton) button.current?.focus();
  }

  function choose(option: SearchOption) {
    onChange(option.value);
    close();
  }

  function onSearchKey(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => Math.min(items.length - 1, i + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (event.key === "Home") {
      setActive(0);
    } else if (event.key === "End") {
      setActive(items.length - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const option = items[active];
      if (option) choose(option);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "Tab") {
      close(false);
    }
  }

  return (
    <div ref={root} className={cn("relative", variant === "compact" && "flex", className)}>
      <button
        ref={button}
        id={baseId}
        type="button"
        disabled={disabled}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        {...aria}
        onClick={() => (open ? close(false) : openList())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!open) openList();
          }
        }}
        className={cn(
          "flex items-center text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cobalt disabled:opacity-60",
          variant === "field"
            ? "h-11 w-full gap-2.5 rounded-md bg-surface px-3.5 text-start text-[0.95rem] shadow-1 aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-danger"
            : "h-full shrink-0 gap-1.5 rounded-s-md border-y border-s border-line bg-surface-2 px-3 text-sm font-medium hover:bg-surface-3",
        )}
      >
        {trigger ?? (
          <>
            {selected?.icon}
            <span className={cn("flex-1 truncate", !selected && "text-ink-3")}>{selected?.label ?? placeholder}</span>
          </>
        )}
        <ChevronDown className={cn("size-4 shrink-0 text-ink-3 transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>

      {open && (
        <div
          className={cn(
            "absolute z-[100] flex w-full min-w-[min(20rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-[var(--radius)] bg-surface shadow-2 ring-1 ring-line",
            variant === "field" ? "inset-x-0" : "start-0",
            placement.up ? "bottom-full mb-1.5" : "top-full mt-1.5",
          )}
          style={{ maxHeight: placement.max }}
        >
          <div className="flex shrink-0 items-center gap-2 border-b border-line px-3">
            {loading ? (
              <Loader2 className="size-4 shrink-0 animate-spin text-cobalt" aria-hidden="true" />
            ) : (
              <Search className="size-4 shrink-0 text-ink-3" aria-hidden="true" />
            )}
            <input
              ref={search}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onSearchKey}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              aria-controls={listId}
              aria-activedescendant={items[active] ? `${baseId}-opt-${active}` : undefined}
              autoComplete="off"
              className="h-11 w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-3 focus-visible:outline-none"
            />
          </div>
          <ul ref={list} id={listId} role="listbox" aria-label={listLabel} className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1">
            {items.length === 0 && !loading && <li className="px-3.5 py-3 text-sm text-ink-3">{emptyText}</li>}
            {items.map((option, index) => {
              const isSelected = option.value === value;
              return (
                <li key={`${option.value}-${index}`} role="presentation">
                  {grouped && index === 0 && <p className="px-3.5 pt-2 pb-1 text-xs font-semibold text-ink-3">{frequentLabel}</p>}
                  {grouped && index === firstOther && firstOther > 0 && allLabel && (
                    <p className="mt-1 border-t border-line px-3.5 pt-2.5 pb-1 text-xs font-semibold text-ink-3">{allLabel}</p>
                  )}
                  <div
                    id={`${baseId}-opt-${index}`}
                    role="option"
                    data-index={index}
                    aria-selected={isSelected}
                    onPointerMove={() => setActive(index)}
                    onClick={() => choose(option)}
                    className={cn(
                      "flex min-h-10 cursor-pointer items-center gap-2.5 px-3.5 py-2 text-sm text-ink",
                      index === active && "bg-surface-2",
                      isSelected && "font-semibold",
                    )}
                  >
                    {option.icon}
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    {option.meta && <span className="shrink-0 text-xs text-ink-3 tabular">{option.meta}</span>}
                    {isSelected && <Check className="size-4 shrink-0 text-cobalt" aria-hidden="true" />}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
