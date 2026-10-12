"use client";

import { useState } from "react";

type Call = { name: string; kind: "incoming" | "outgoing" | "missed"; minutesAgo: number; duration?: string };
type Text = { name: string; preview: string; minutesAgo: number; unread?: boolean };

// Sample data until Oscar is connected to a real phone line or message source.
const SAMPLE_CALLS: Call[] = [
  { name: "Mom", kind: "missed", minutesAgo: 12 },
  { name: "Jordan", kind: "incoming", minutesAgo: 95, duration: "8 min" },
  { name: "Coach Davis", kind: "outgoing", minutesAgo: 240, duration: "3 min" },
  { name: "(601) 555-0142", kind: "missed", minutesAgo: 1440 },
];

const SAMPLE_TEXTS: Text[] = [
  { name: "Jordan", preview: "You still down for tomorrow?", minutesAgo: 6, unread: true },
  { name: "Mom", preview: "Call me when you get a chance", minutesAgo: 14, unread: true },
  { name: "Alex", preview: "Sent you the notes from class", minutesAgo: 180 },
  { name: "Pharmacy", preview: "Your order is ready for pickup", minutesAgo: 1500 },
];

const KIND_LABEL: Record<Call["kind"], string> = { incoming: "Incoming", outgoing: "Outgoing", missed: "Missed" };

function ago(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / 1440)}d`;
}

export default function Comms() {
  const [tab, setTab] = useState<"calls" | "texts">("calls");
  const unread = SAMPLE_TEXTS.filter((t) => t.unread).length;
  const missed = SAMPLE_CALLS.filter((c) => c.kind === "missed").length;

  return (
    <section className="glass card comms">
      <div className="comms-head">
        <p className="eyebrow">Communications</p>
        <span className="sample-tag mono">Sample</span>
      </div>
      <div className="segmented" role="tablist">
        <button role="tab" aria-selected={tab === "calls"} onClick={() => setTab("calls")}>
          Calls {missed > 0 && <span className="badge">{missed}</span>}
        </button>
        <button role="tab" aria-selected={tab === "texts"} onClick={() => setTab("texts")}>
          Texts {unread > 0 && <span className="badge">{unread}</span>}
        </button>
      </div>
      <ul className="comms-list" role="tabpanel">
        {tab === "calls"
          ? SAMPLE_CALLS.map((c, i) => (
              <li key={i}>
                <span className={`comms-icon ${c.kind}`} aria-hidden="true">
                  {c.kind === "outgoing" ? "↗" : c.kind === "missed" ? "✕" : "↙"}
                </span>
                <span className="comms-body">
                  <span className={c.kind === "missed" ? "comms-name missed-text" : "comms-name"}>{c.name}</span>
                  <span className="comms-sub muted">
                    {KIND_LABEL[c.kind]}
                    {c.duration ? ` · ${c.duration}` : ""}
                  </span>
                </span>
                <span className="comms-time mono muted">{ago(c.minutesAgo)}</span>
              </li>
            ))
          : SAMPLE_TEXTS.map((t, i) => (
              <li key={i}>
                <span className={`comms-dot ${t.unread ? "unread" : ""}`} aria-label={t.unread ? "Unread" : undefined} />
                <span className="comms-body">
                  <span className="comms-name">{t.name}</span>
                  <span className="comms-sub muted">{t.preview}</span>
                </span>
                <span className="comms-time mono muted">{ago(t.minutesAgo)}</span>
              </li>
            ))}
      </ul>
    </section>
  );
}
