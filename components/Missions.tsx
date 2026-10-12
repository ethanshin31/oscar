"use client";

import { useState } from "react";

export type Mission = { id: string; title: string; done: boolean; byOscar?: boolean };

export default function Missions({
  missions,
  onAdd,
  onToggle,
  onClearDone,
}: {
  missions: Mission[];
  onAdd: (title: string) => void;
  onToggle: (id: string) => void;
  onClearDone: () => void;
}) {
  const [draft, setDraft] = useState("");
  const open = missions.filter((m) => !m.done).length;
  const anyDone = missions.some((m) => m.done);

  return (
    <section className="glass card missions">
      <div className="comms-head">
        <p className="eyebrow">Missions</p>
        <span className="mono muted mission-count">{open} open</span>
      </div>
      {missions.length === 0 ? (
        <p className="muted mission-empty">Nothing on the board. Add one below, or tell Oscar to remind you.</p>
      ) : (
        <ul className="mission-list">
          {missions.map((m) => (
            <li key={m.id} className={m.done ? "done" : ""}>
              <button
                className="mission-check"
                role="checkbox"
                aria-checked={m.done}
                aria-label={m.done ? `Mark "${m.title}" not done` : `Mark "${m.title}" done`}
                onClick={() => onToggle(m.id)}
              />
              <span className="mission-title">{m.title}</span>
              {m.byOscar && <span className="mission-by mono">Oscar</span>}
            </li>
          ))}
        </ul>
      )}
      <form
        className="mission-add"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim()) onAdd(draft.trim());
          setDraft("");
        }}
      >
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a mission" aria-label="Add a mission" />
        {anyDone && (
          <button type="button" className="mission-clear" onClick={onClearDone}>
            Clear done
          </button>
        )}
      </form>
    </section>
  );
}
