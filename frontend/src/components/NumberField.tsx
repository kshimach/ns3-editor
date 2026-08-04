import { useEffect, useState } from "react";

/**
 * A `<input type="number">` that does not fight the user while they are
 * typing.
 *
 * The naive controlled pattern -- `value={n}` bound straight to a number,
 * `onChange={(e) => onCommit(Number(e.target.value) || fallback)}` -- looks
 * fine until someone tries to replace a value with a different one: select
 * all, delete, and the field is briefly empty. `Number("")` is `0`, which
 * the `|| fallback` turns into the fallback *immediately*, so React puts
 * that back into the field before the next keystroke lands. Typing "250"
 * over an existing "100" becomes impossible to do by deleting and retyping;
 * every attempt gets prefixed by whatever the fallback was.
 *
 * This keeps what the user is typing as its own local state (`text`), shown
 * verbatim -- including empty, "-", or a trailing "." -- while the field has
 * focus, so nothing snaps back mid-edit. A value that parses commits to
 * `onCommit` on every keystroke, same as before, so anything else deriving
 * from the field (e.g. the canvas's LR-WPAN range circles reading `scale`)
 * still updates live. Only on blur does an empty or unparseable field fall
 * back to `fallback`, clamped to `min`/`max` the same way a valid entry is.
 */
export function NumberField({
  value,
  onCommit,
  fallback,
  min,
  max,
  step,
  className,
  title,
}: {
  value: number;
  onCommit: (value: number) => void;
  /** Used when the field is left empty or unparseable on blur. */
  fallback: number;
  min?: number;
  max?: number;
  step?: number | string;
  className?: string;
  title?: string;
}) {
  const [text, setText] = useState(() => String(value));
  const [focused, setFocused] = useState(false);

  // An external change (loading a different scenario, switching to a
  // different app/node's field) has to be picked up -- but not by resyncing
  // on every commit this same field just made itself, which is what synced
  // while focused would amount to.
  useEffect(() => {
    if (!focused) {
      setText(String(value));
    }
  }, [value, focused]);

  const clamp = (n: number) => {
    let clamped = n;
    if (min !== undefined) {
      clamped = Math.max(min, clamped);
    }
    if (max !== undefined) {
      clamped = Math.min(max, clamped);
    }
    return clamped;
  };

  return (
    <input
      type="number"
      className={className}
      title={title}
      min={min}
      max={max}
      step={step}
      value={text}
      onFocus={() => setFocused(true)}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        const parsed = Number(raw);
        if (raw.trim() !== "" && Number.isFinite(parsed)) {
          onCommit(clamp(parsed));
        }
      }}
      onBlur={() => {
        setFocused(false);
        const parsed = Number(text);
        const valid = text.trim() !== "" && Number.isFinite(parsed);
        const committed = clamp(valid ? parsed : fallback);
        setText(String(committed));
        onCommit(committed);
      }}
    />
  );
}
