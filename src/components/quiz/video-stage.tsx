'use client'

// ============================================================
// Video clip stage for video questions.
//
// Mimics the NHL weekly rule quiz: the clip is downloaded in full first (so it
// can't stall mid-play), the user taps "Start clip" (browsers won't play audio
// without a click), then it plays `plays` times back to back with no pause or
// scrub controls, and finally rests on its last frame while the question is
// answered. `onDone` fires once, when the last play finishes — the parent keeps
// the question and options hidden until then.
// ============================================================

import { useEffect, useRef, useState } from 'react'
import { Loader2, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { clampPlays } from '@/lib/video'

type Phase = 'loading' | 'ready' | 'playing' | 'blocked' | 'done' | 'error'

interface VideoStageProps {
  questionId: string
  plays?: number
  onDone: () => void
}

export function VideoStage({ questionId, plays, onDone }: VideoStageProps) {
  const totalPlays = clampPlays(plays)
  const videoRef = useRef<HTMLVideoElement>(null)
  const playsDoneRef = useRef(0)
  const doneFiredRef = useRef(false)
  const [phase, setPhase] = useState<Phase>('loading')
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  // Download the whole clip into memory before allowing playback. A 30-second
  // clip is a few MB, and playing from memory guarantees no buffering pauses
  // (and no extra download for the 2nd/3rd play).
  useEffect(() => {
    let cancelled = false
    let createdUrl: string | null = null

    async function load() {
      try {
        const urlRes = await fetch(`/api/video/${questionId}`)
        if (!urlRes.ok) throw new Error('url')
        const { url } = (await urlRes.json()) as { url: string }
        const fileRes = await fetch(url)
        if (!fileRes.ok) throw new Error('file')
        const blob = await fileRes.blob()
        if (cancelled) return
        createdUrl = URL.createObjectURL(blob)
        setObjectUrl(createdUrl)
        setPhase('ready')
      } catch {
        if (!cancelled) setPhase('error')
      }
    }
    load()

    return () => {
      cancelled = true
      if (createdUrl) URL.revokeObjectURL(createdUrl)
    }
  }, [questionId, attempt])

  function retry() {
    playsDoneRef.current = 0
    setObjectUrl(null)
    setPhase('loading')
    setAttempt((a) => a + 1)
  }

  async function playFromStart() {
    const video = videoRef.current
    if (!video) return
    video.currentTime = 0
    try {
      await video.play()
      setPhase('playing')
    } catch {
      // Autoplay policy refused (e.g. a later replay without a fresh gesture) —
      // let the user continue with one more click.
      setPhase('blocked')
    }
  }

  function handleEnded() {
    playsDoneRef.current += 1
    if (playsDoneRef.current < totalPlays) {
      playFromStart()
      return
    }
    setPhase('done')
    if (!doneFiredRef.current) {
      doneFiredRef.current = true
      onDone()
    }
  }

  const showOverlay = phase !== 'playing' && phase !== 'done'

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
      {objectUrl && (
        <video
          ref={videoRef}
          src={objectUrl}
          playsInline
          preload="auto"
          disablePictureInPicture
          disableRemotePlayback
          controlsList="nodownload noplaybackrate noremoteplayback"
          onContextMenu={(e) => e.preventDefault()}
          onEnded={handleEnded}
          className="h-full w-full object-contain"
        />
      )}

      {showOverlay && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black px-4 text-center text-white">
          {phase === 'loading' && (
            <>
              <Loader2 className="h-6 w-6 animate-spin" />
              <p className="text-sm">Loading clip…</p>
            </>
          )}
          {phase === 'ready' && (
            <>
              <Button size="lg" onClick={playFromStart} className="gap-2 bg-white text-slate-900 hover:bg-gray-200">
                <Play className="h-4 w-4" />
                Start clip
              </Button>
              <p className="text-xs text-gray-300">
                {totalPlays === 1 ? 'The clip plays once.' : `The clip plays ${totalPlays} times, then the question appears.`}
              </p>
            </>
          )}
          {phase === 'blocked' && (
            <>
              <p className="text-sm">Your browser paused the clip.</p>
              <Button size="lg" onClick={playFromStart} className="gap-2 bg-white text-slate-900 hover:bg-gray-200">
                <Play className="h-4 w-4" />
                Continue
              </Button>
            </>
          )}
          {phase === 'error' && (
            <>
              <p className="text-sm">Couldn&apos;t load the clip — check your connection and try again.</p>
              <Button size="lg" variant="secondary" onClick={retry}>
                Try again
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
