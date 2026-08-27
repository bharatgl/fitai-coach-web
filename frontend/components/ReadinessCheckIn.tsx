"use client";

import type {
  ReadinessCheckIn as ReadinessCheckInData,
  ReadinessCheckInResponse,
  SaveReadinessCheckInRequest,
} from "@fitai/contracts";
import { Button, Card, Eyebrow, Field, StatusBadge } from "@fitai/ui";
import { FormEvent, useState } from "react";
import { apiRequest } from "@/lib/api";

type RatingField = "sleepQuality" | "energy" | "soreness" | "stress" | "motivation";

const ratingFields: Array<{
  field: RatingField;
  label: string;
  low: string;
  high: string;
}> = [
  { field: "sleepQuality", label: "Sleep quality", low: "Poor", high: "Excellent" },
  { field: "energy", label: "Energy", low: "Drained", high: "High" },
  { field: "soreness", label: "Soreness", low: "None", high: "Very sore" },
  { field: "stress", label: "Stress", low: "Low", high: "High" },
  { field: "motivation", label: "Motivation", low: "Low", high: "High" },
];

function localDate() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
}

function statusCopy(status: ReadinessCheckInData["status"]) {
  if (status === "ready") return "Your self-reported recovery supports the planned session.";
  if (status === "steady") return "Train as planned, but use the first working sets to confirm today’s load.";
  return "Consider a lower-stress session and discuss symptoms with a professional when needed.";
}

function editableValues(
  checkIn: ReadinessCheckInData | null,
  date: string,
): SaveReadinessCheckInRequest {
  return {
    date,
    sleepHours: checkIn?.sleepHours ?? 7.5,
    sleepQuality: checkIn?.sleepQuality ?? 3,
    energy: checkIn?.energy ?? 3,
    soreness: checkIn?.soreness ?? 3,
    stress: checkIn?.stress ?? 3,
    motivation: checkIn?.motivation ?? 3,
    bodyWeightKg: checkIn?.bodyWeightKg ?? null,
    notes: checkIn?.notes ?? "",
  };
}

function RatingInput({
  field,
  label,
  low,
  high,
  value,
  onChange,
}: {
  field: RatingField;
  label: string;
  low: string;
  high: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label
      className="readiness-rating"
      htmlFor={`readiness-${field}`}
      aria-label={`${label}, ${value} out of 5`}
    >
      <span><strong>{label}</strong><b>{value}/5</b></span>
      <input
        id={`readiness-${field}`}
        type="range"
        min="1"
        max="5"
        step="1"
        value={value}
        aria-valuetext={`${value} out of 5`}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <small><span>{low}</span><span>{high}</span></small>
    </label>
  );
}

export function ReadinessCheckIn({
  latest,
  onSaved,
}: {
  latest: ReadinessCheckInData | null;
  onSaved: (checkIn: ReadinessCheckInData) => void;
}) {
  const today = localDate();
  const todaysCheckIn = latest?.date === today ? latest : null;
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [values, setValues] = useState<SaveReadinessCheckInRequest>(() =>
    editableValues(todaysCheckIn, today),
  );

  function setRating(field: RatingField, value: number) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await apiRequest<ReadinessCheckInResponse>("/v1/readiness", {
        method: "PUT",
        body: JSON.stringify(values),
      });
      if (!response.checkIn) throw new Error("Readiness check-in could not be saved");
      onSaved(response.checkIn);
      setValues(editableValues(response.checkIn, response.checkIn.date));
      setExpanded(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save readiness");
    } finally {
      setSaving(false);
    }
  }

  if (!expanded) {
    return (
      <Card className="readiness-summary" padding="md">
        <div className="readiness-summary-copy">
          <Eyebrow>Daily readiness · self-reported</Eyebrow>
          <h2>{todaysCheckIn ? "Today’s signal is recorded." : "How ready are you today?"}</h2>
          <p>{todaysCheckIn ? statusCopy(todaysCheckIn.status) : "A short check-in helps your coach adjust today’s load using your real recovery context."}</p>
        </div>
        {todaysCheckIn && (
          <div className="readiness-score" aria-label={`Readiness score ${todaysCheckIn.score} out of 100`}>
            <strong>{todaysCheckIn.score}</strong>
            <StatusBadge tone={todaysCheckIn.status === "ready" ? "success" : todaysCheckIn.status === "steady" ? "warning" : "danger"}>
              {todaysCheckIn.status}
            </StatusBadge>
          </div>
        )}
        <Button variant={todaysCheckIn ? "secondary" : "primary"} onClick={() => setExpanded(true)}>
          {todaysCheckIn ? "Update check-in" : "Check in now"}
        </Button>
      </Card>
    );
  }

  return (
    <Card className="readiness-form-card" padding="md">
      <header>
        <div>
          <Eyebrow>Daily readiness · about 1 minute</Eyebrow>
          <h2>Give your coach today’s context.</h2>
          <p>Use how you feel right now. This score guides training choices; it is not a medical assessment.</p>
        </div>
        <Button variant="ghost" size="sm" disabled={saving} onClick={() => setExpanded(false)}>Close</Button>
      </header>
      <form onSubmit={save}>
        <div className="readiness-basics">
          <Field label="Sleep last night (hours)">
            <input
              type="number"
              min="0"
              max="16"
              step="0.25"
              required
              value={values.sleepHours}
              onChange={(event) => setValues((current) => ({ ...current, sleepHours: Number(event.target.value) }))}
            />
          </Field>
          <Field label="Body weight (kg)" hint="Optional; useful for long-term trends and show prep.">
            <input
              type="number"
              min="30"
              max="350"
              step="0.1"
              value={values.bodyWeightKg ?? ""}
              onChange={(event) => setValues((current) => ({
                ...current,
                bodyWeightKg: event.target.value ? Number(event.target.value) : null,
              }))}
            />
          </Field>
        </div>
        <div className="readiness-ratings">
          {ratingFields.map((rating) => (
            <RatingInput
              {...rating}
              key={rating.field}
              value={values[rating.field]}
              onChange={(value) => setRating(rating.field, value)}
            />
          ))}
        </div>
        <Field label="Anything affecting today’s training?" hint="Optional. Do not use this for emergencies.">
          <textarea
            rows={2}
            maxLength={1_000}
            value={values.notes}
            placeholder="Late shift, poor sleep, travel, unusual soreness…"
            onChange={(event) => setValues((current) => ({ ...current, notes: event.target.value }))}
          />
        </Field>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="readiness-actions">
          <small>Saved to your account and shared only with your ForgeFit coach context.</small>
          <Button type="submit" busy={saving}>{saving ? "Saving…" : "Save readiness"}</Button>
        </div>
      </form>
    </Card>
  );
}
