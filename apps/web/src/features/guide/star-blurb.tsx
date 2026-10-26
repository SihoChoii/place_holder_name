"use client";
import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { fetchStarSummary, type StarSummaryResponse } from "@/lib/api/agent";
import { RequestError } from "@/lib/api/client";
import Link from "next/link";
import { useSession } from "@/features/auth/session";

interface StarBlurbProps {
  hygId: number;
}

export function StarBlurb({ hygId }: StarBlurbProps) {
  const { user } = useSession();
  const [summary, setSummary] = useState<StarSummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const loadSummary = async (withAudio = false) => {
    if (!user) return;

    setLoading(true);
    setError(null);
    setAudioError(false);

    try {
      const result = await fetchStarSummary({
        hyg_id: hygId,
        audio: withAudio,
      });
      setSummary(result);
    } catch (err) {
      if (err instanceof RequestError) {
        if (err.status === 401) {
          setError("Please log in to view this content.");
        } else if (err.status === 404) {
          setError("No article found for this star.");
        } else if (err.status === 503 || err.status === 504) {
          setError("The summary service is currently unavailable.");
        } else {
          setError(err.message);
        }
      } else {
        setError("Failed to load the summary.");
      }
    } finally {
      setLoading(false);
    }
  };

  const playAudio = async () => {
    if (summary?.audio) {
      try {
        const audio = new Audio(
          `data:${summary.audio.mime_type};base64,${summary.audio.base64}`,
        );
        audioRef.current = audio;
        await audio.play();
      } catch {
        setAudioError(true);
      }
    } else {
      setAudioLoading(true);
      setAudioError(false);
      try {
        const result = await fetchStarSummary({
          hyg_id: hygId,
          audio: true,
        });
        setSummary(result);
        if (result.audio) {
          const audio = new Audio(
            `data:${result.audio.mime_type};base64,${result.audio.base64}`,
          );
          audioRef.current = audio;
          await audio.play();
        } else {
          setAudioError(true);
        }
      } catch {
        setAudioError(true);
      } finally {
        setAudioLoading(false);
      }
    }
  };

  if (!user) {
    return (
      <section aria-labelledby="blurb-heading" className="star-blurb">
        <h2 id="blurb-heading">About this star</h2>
        <p className="muted-text">
          Sign in to read a summary from Wikipedia.
        </p>
        <Link href="/login" className="text-link">
          Go to login
        </Link>
      </section>
    );
  }

  if (!summary && !loading && !error) {
    return (
      <section aria-labelledby="blurb-heading" className="star-blurb">
        <h2 id="blurb-heading">About this star</h2>
        <Button variant="outline" onClick={() => loadSummary(false)}>
          Load summary
        </Button>
      </section>
    );
  }

  return (
    <section aria-labelledby="blurb-heading" className="star-blurb">
      <h2 id="blurb-heading">About this star</h2>

      {loading && <p role="status">Loading summary…</p>}

      {error && (
        <div className="inline-error" role="alert">
          <p>{error}</p>
          <Button variant="outline" onClick={() => loadSummary(false)}>
            Retry
          </Button>
        </div>
      )}

      {summary && (
        <>
          <h3 className="blurb-title">{summary.title}</h3>
          <p className="blurb-text">{summary.blurb}</p>
          <p className="blurb-source">
            Source:{" "}
            <a
              href={summary.source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-link"
            >
              {summary.source.title}
            </a>
          </p>

          <div className="blurb-audio-controls">
            {summary.audio ? (
              <Button
                variant="outline"
                onClick={playAudio}
                disabled={audioLoading}
              >
                Listen
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={playAudio}
                disabled={audioLoading}
              >
                {audioLoading ? "Loading audio…" : "Listen"}
              </Button>
            )}
            {audioError && (
              <span className="muted-text" role="status">
                Audio unavailable
              </span>
            )}
          </div>
        </>
      )}
    </section>
  );
}
