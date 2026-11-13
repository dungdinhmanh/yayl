import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  /** Accessible name; the trigger has no visible label of its own. */
  label: string;
  id?: string;
}

interface Placement {
  left: number;
  width: number;
  maxHeight: number;
  top?: number;
  bottom?: number;
}

/**
 * Native selects render their text differently per platform and DPI, so the
 * launcher uses one listbox implementation for every dropdown. The popup is
 * portalled to the body and flips up when there is no room below.
 */
export default function Select<T extends string>({
  value,
  options,
  onChange,
  label,
  id,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value)
  );
  const selected = options[selectedIndex] ?? options[0];

  const place = useCallback(() => {
    const el = buttonRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const spaceAbove = rect.top - 12;
    const openUp = spaceBelow < 140 && spaceAbove > spaceBelow;
    setPlacement({
      left: rect.left,
      width: rect.width,
      maxHeight: Math.min(280, Math.max(80, openUp ? spaceAbove : spaceBelow)),
      top: openUp ? undefined : rect.bottom + 6,
      bottom: openUp ? window.innerHeight - rect.top + 6 : undefined,
    });
  }, []);

  const close = useCallback(
    (focus: boolean) => {
      setOpen(false);
      if (focus) buttonRef.current?.focus();
    },
    []
  );

  const openAt = useCallback(
    (index: number) => {
      setActive(index);
      place();
      setOpen(true);
    },
    [place]
  );

  // Close on outside press, scroll, or resize; the fixed popup would drift.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || listRef.current?.contains(target)) return;
      close(false);
    };
    const onScroll = () => close(false);
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, close]);

  // Keep the active row visible while moving with the keyboard.
  useEffect(() => {
    if (!open) return;
    const row = listRef.current?.children[active] as HTMLElement | undefined;
    row?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const commit = (index: number) => {
    const option = options[index];
    if (!option) return;
    if (option.value !== value) onChange(option.value);
    close(true);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const last = options.length - 1;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!open) openAt(selectedIndex);
        else setActive((current) => Math.min(last, current + 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        if (!open) openAt(selectedIndex);
        else setActive((current) => Math.max(0, current - 1));
        break;
      case "Home":
        if (!open) return;
        event.preventDefault();
        setActive(0);
        break;
      case "End":
        if (!open) return;
        event.preventDefault();
        setActive(last);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (open) commit(active);
        else openAt(selectedIndex);
        break;
      case "Escape":
        if (!open) return;
        event.preventDefault();
        close(true);
        break;
      case "Tab":
        if (open) close(false);
        break;
    }
  };

  const listStyle: CSSProperties | undefined = placement
    ? {
        left: placement.left,
        width: placement.width,
        maxHeight: placement.maxHeight,
        top: placement.top,
        bottom: placement.bottom,
      }
    : undefined;

  return (
    <>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        className="ui-select-trigger"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        onClick={() => (open ? close(true) : openAt(selectedIndex))}
        onKeyDown={onKeyDown}
      >
        <span className="ui-select-label">{selected?.label ?? ""}</span>
        <svg
          className="ui-select-caret"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open &&
        placement &&
        createPortal(
          <ul
            ref={listRef}
            id={listId}
            className="ui-select-list"
            role="listbox"
            aria-label={label}
            style={listStyle}
          >
            {options.map((option, index) => (
              <li
                key={option.value}
                id={`${listId}-${index}`}
                className={`ui-select-option${index === active ? " is-active" : ""}`}
                role="option"
                aria-selected={option.value === value}
                onPointerMove={() => setActive(index)}
                onClick={() => commit(index)}
              >
                {option.label}
              </li>
            ))}
          </ul>,
          document.body
        )}
    </>
  );
}
