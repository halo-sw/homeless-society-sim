// Sonner-style toasts (13, Part 3/11) without the dependency: the
// API shape follows docs/emil-skills/skills/ask-sonner/API.md
// (message + description + duration, stacked bottom-centre). CSS
// transitions (interruptible), ease-out, reduced-motion aware.
import { useEffect, useState } from "react";

let seq = 0;
const listeners = new Set();

function emit(list) {
  for (const fn of listeners) fn(list);
}

let active = [];

export const toast = {
  show(message, opts = {}) {
    const id = `t${++seq}`;
    const entry = {
      id,
      message: String(message || ""),
      description: opts.description || "",
      duration: opts.duration ?? 4000,
    };
    active = [...active.slice(-2), entry];
    emit(active);
    if (entry.duration !== Infinity) {
      setTimeout(() => toast.dismiss(id), entry.duration);
    }
    return id;
  },
  success(message, opts = {}) {
    return toast.show(message, { ...opts });
  },
  dismiss(id) {
    active = id ? active.filter((t) => t.id !== id) : [];
    emit(active);
  },
};

export function Toaster() {
  const [toasts, setToasts] = useState(active);
  useEffect(() => {
    listeners.add(setToasts);
    return () => { listeners.delete(setToasts); };
  }, []);
  if (toasts.length === 0) return null;
  return (
    <div className="ui-toastwrap" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="ui-toast">
          <div>{t.message}</div>
          {t.description && (
            <div style={{ opacity: 0.75, marginTop: 2 }}>{t.description}</div>
          )}
        </div>
      ))}
    </div>
  );
}
