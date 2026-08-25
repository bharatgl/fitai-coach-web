"use client";

import type { ExerciseVideo } from "@fitai/contracts";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

const youtubeIdPattern = /^[A-Za-z0-9_-]{11}$/;

export function youtubeEmbedUrl(videoId: string) {
  if (!youtubeIdPattern.test(videoId)) {
    throw new Error("Invalid YouTube video ID");
  }
  return `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1`;
}

export function ExerciseVideoButton({
  exerciseName,
  video,
}: {
  exerciseName: string;
  video: ExerciseVideo;
}) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function close() {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  return (
    <>
      <button
        ref={triggerRef}
        className="video-demo-button"
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        <span aria-hidden="true">▶</span> Watch demo
      </button>
      {open && createPortal(
        <div className="video-dialog-backdrop">
          <button
            className="video-dialog-dismiss"
            type="button"
            tabIndex={-1}
            aria-label="Close video"
            onClick={close}
          />
          <section
            className="video-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
          >
            <header>
              <div>
                <span>Exercise demo</span>
                <h2 id={titleId}>{exerciseName}</h2>
              </div>
              <button
                ref={closeRef}
                className="video-dialog-close"
                type="button"
                onClick={close}
                aria-label="Close video"
              >
                ×
              </button>
            </header>
            <div className="video-frame">
              <iframe
                src={youtubeEmbedUrl(video.videoId)}
                title={`${exerciseName} demonstration: ${video.title}`}
                loading="lazy"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            </div>
            <footer>
              <p>
                {video.title} <span>by {video.channel}</span>
              </p>
              <a
                href={`https://www.youtube.com/watch?v=${video.videoId}`}
                target="_blank"
                rel="noreferrer"
              >
                Open on YouTube ↗
              </a>
            </footer>
            <small>Use the written coaching notes as the source of truth for your prescribed variation.</small>
          </section>
        </div>,
        document.body,
      )}
    </>
  );
}
