import React, { useEffect, useRef, useState } from 'react';
import {
  Play, Pause, RotateCcw, RotateCw, Volume2, VolumeX,
  Gauge, Loader2, AlertCircle,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';

interface AudioPlayerProps {
  /** Internal call id used to resolve a private S3 recording through the API. */
  callId?: string;
  /** Existing playable URL can be used directly; callId takes precedence when supplied. */
  src?: string | null;
  className?: string;
  compact?: boolean;
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return '0:00';
  const total = Math.floor(value);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export default function AudioPlayer({
  callId,
  src,
  className = '',
  compact = false,
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [source, setSource] = useState<string | null>(src || null);
  const [loading, setLoading] = useState(Boolean(callId && !src));
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(() => {\n    const saved = Number(localStorage.getItem('chiefvoice_audio_speed'));\n    return SPEEDS.includes(saved) ? saved : 1;\n  });
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(() => {\n    const saved = Number(localStorage.getItem('chiefvoice_audio_volume'));\n    return Number.isFinite(saved) && saved >= 0 && saved <= 1 ? saved : 1;\n  });

  useEffect(() => {
    let cancelled = false;

    if (!callId && src) {
      setSource(src);
      setLoading(false);
      setError(null);
      return () => { cancelled = true; };
    }

    if (!callId) {
      setSource(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setSource(null);

    apiFetch(`/api/recordings/${encodeURIComponent(callId)}/url`)
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !body?.url) {
          throw new Error(body?.error || 'Recording is not available');
        }
        if (!cancelled) setSource(body.url);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load recording');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [callId, src]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = speed;
    audio.volume = volume;
    audio.muted = muted;
  }, [speed, volume, muted, source]);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio || !source) return;
    try {
      if (audio.paused) await audio.play();
      else audio.pause();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Playback was blocked');
    }
  };

  const seekBy = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, Math.min(audio.duration || duration || 0, audio.currentTime + seconds));
  };

  const seekTo = (value: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = value;
    setCurrentTime(value);
  };

  if (loading) {
    return (
      <div className={`flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 ${className}`}>
        <Loader2 className="h-4 w-4 animate-spin text-[var(--text-muted)]" />
        <span className="text-xs text-[var(--text-muted)]">Loading recording…</span>
      </div>
    );
  }

  if (error || !source) {
    return (
      <div className={`flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 ${className}`}>
        <AlertCircle className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
        <span className="text-xs text-[var(--text-muted)]">{error || 'Recording unavailable'}</span>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-3 ${className}`}>
      <audio
        ref={audioRef}
        src={source}
        preload="metadata"
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          setDuration(Number.isFinite(d) ? d : 0);
          e.currentTarget.playbackRate = speed;
          e.currentTarget.volume = volume;
          e.currentTarget.muted = muted;
        }}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => setError('Unable to play this recording')}
        className="hidden"
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={togglePlay}
          aria-label={playing ? 'Pause recording' : 'Play recording'}
          className="h-9 w-9 shrink-0 rounded-full bg-[var(--accent)] text-white flex items-center justify-center hover:opacity-90 transition-opacity"
        >
          {playing ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current ml-0.5" />}
        </button>

        <button type="button" onClick={() => seekBy(-10)} title="Back 10 seconds" className="p-1.5 rounded-md hover:bg-[var(--bg-muted)] text-[var(--text-secondary)]">
          <RotateCcw className="h-4 w-4" />
        </button>

        <button type="button" onClick={() => seekBy(10)} title="Forward 10 seconds" className="p-1.5 rounded-md hover:bg-[var(--bg-muted)] text-[var(--text-secondary)]">
          <RotateCw className="h-4 w-4" />
        </button>

        <span className="text-[11px] font-mono text-[var(--text-muted)] whitespace-nowrap">
          {formatTime(currentTime)}
        </span>

        <input
          aria-label="Recording position"
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={Math.min(currentTime, duration || 0)}
          onChange={(e) => seekTo(Number(e.target.value))}
          className="flex-1 min-w-0 accent-[var(--accent)] cursor-pointer"
        />

        <span className="text-[11px] font-mono text-[var(--text-muted)] whitespace-nowrap">
          {formatTime(duration)}
        </span>

        {!compact && (
          <>
            <button
              type="button"
              onClick={() => setMuted((v) => !v)}
              aria-label={muted ? 'Unmute' : 'Mute'}
              className="p-1.5 rounded-md hover:bg-[var(--bg-muted)] text-[var(--text-secondary)]"
            >
              {muted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>

            <input
              aria-label="Volume"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(e) => {
                const next = Number(e.target.value);
                setVolume(next);
                setMuted(next === 0);
              }}
              className="w-16 accent-[var(--accent)] cursor-pointer"
            />
          </>
        )}

        <div className="relative group">
          <button
            type="button"
            aria-label="Playback speed"
            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-muted)]"
          >
            <Gauge className="h-3.5 w-3.5" />
            {speed}×
          </button>
          <div className="hidden group-hover:flex absolute right-0 bottom-full mb-1 z-20 flex-col min-w-[78px] rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] shadow-lg p-1">
            {SPEEDS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setSpeed(value)}
                className={`px-2 py-1.5 rounded text-xs text-left hover:bg-[var(--bg-muted)] ${speed === value ? 'font-bold text-[var(--accent)]' : 'text-[var(--text-secondary)]'}`}
              >
                {value}×
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
