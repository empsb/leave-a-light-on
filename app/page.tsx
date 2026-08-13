"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
    Turnstile,
    type TurnstileInstance,
} from "@marsidev/react-turnstile"
import { supabase } from "../lib/supabase"

type WindowPosition = {
    id: number
    left: number
    top: number
    width: number
    height: number
}

type MeteorEvent = {
    id: number
    side: "left" | "right"
    top: number
    delay: number
    cycle: number
    length: number
}

type ModalMode = "read" | "write" | null
type WriteMode = "new" | "replace" | null
type PetType = "dog" | "cat"
type TouchHintType = "leave" | "read"

type TouchHint = {
    type: TouchHintType
    windowId: number
} | null

type IntroPhase = "checking" | "visible" | "revealing" | "done"

type WindowNoteRow = {
    window_id: number
    id: string
    note: string
    created_at: string
}

type DisplayNote = {
    id: string
    note: string
    isFake: boolean
}

type ReadSnapshot = {
    windowId: number
    id: string
    note: string
    isFake: boolean
}

type ProtectedStarterNote = {
    windowId: number
    id: string
    note: string
}

const READ_STATE_KEY = "leave-a-light-on-read-state"
const VISITOR_STATE_KEY = "leave-a-light-on-visitor-counted-v1"
const INTRO_SEEN_KEY = "leave-a-light-on-intro-seen-v2"
const TURNSTILE_SITE_KEY =
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ""

const windows: WindowPosition[] = [
    { id: 1, left: 20.49, top: 37.6, width: 3.78, height: 11.2 },
    { id: 2, left: 29.51, top: 37.6, width: 3.78, height: 11.2 },
    { id: 3, left: 38.59, top: 37.6, width: 3.78, height: 11.2 },
    { id: 4, left: 48.74, top: 37.6, width: 3.78, height: 11.2 },
    { id: 5, left: 59.02, top: 37.6, width: 3.78, height: 11.2 },
    { id: 6, left: 68.1, top: 37.6, width: 3.78, height: 11.2 },
    { id: 7, left: 77.05, top: 37.6, width: 3.78, height: 11.2 },

    { id: 8, left: 20.49, top: 54.84, width: 3.78, height: 10.6 },
    { id: 9, left: 29.51, top: 54.84, width: 3.78, height: 10.6 },
    { id: 10, left: 38.59, top: 54.84, width: 3.78, height: 10.6 },
    { id: 11, left: 48.74, top: 54.84, width: 3.78, height: 10.6 },
    { id: 12, left: 59.02, top: 54.84, width: 3.78, height: 10.6 },
    { id: 13, left: 68.1, top: 54.84, width: 3.78, height: 10.6 },
    { id: 14, left: 77.05, top: 54.84, width: 3.78, height: 10.6 },

    { id: 15, left: 20.49, top: 73.19, width: 3.78, height: 11.2 },
    { id: 16, left: 29.51, top: 73.19, width: 3.78, height: 11.2 },
    { id: 17, left: 38.59, top: 73.19, width: 3.78, height: 11.2 },

    { id: 18, left: 59.02, top: 73.19, width: 3.78, height: 11.2 },
    { id: 19, left: 68.1, top: 73.19, width: 3.78, height: 11.2 },
    { id: 20, left: 77.05, top: 73.19, width: 3.78, height: 11.2 },
]

const meteorEvents: MeteorEvent[] = [
    {
        id: 1,
        side: "left",
        top: 20,
        delay: 1.8,
        cycle: 10,
        length: 76,
    },
    {
        id: 2,
        side: "right",
        top: 48,
        delay: 6.4,
        cycle: 13,
        length: 70,
    },
]

const dogFrames = [
    "/dog-1.png",
    "/dog-2.png",
    "/dog-3.png",
    "/dog-2.png",
]

const catFrames = [
    "/cat-1.png",
    "/cat-2.png",
    "/cat-3.png",
    "/cat-2.png",
]

const starterMessages = [
    "You don't need to have everything figured out yet.",
    "Someone is quietly rooting for you.",
    "Be kinder to yourself today.",
]

const starterWindowOrder = [2, 10, 19, 7, 14, 4, 16, 12, 6, 18]

function getPetForWindow(windowId: number): PetType {
    return windowId % 2 === 0 ? "cat" : "dog"
}

function buildDisplayNotes(
    realNotes: WindowNoteRow[],
    hasLoadedNotes: boolean,
    protectedStarterNote: ProtectedStarterNote | null
): Record<number, DisplayNote> {
    const display: Record<number, DisplayNote> = {}

    for (const row of realNotes) {
        display[row.window_id] = {
            id: row.id,
            note: row.note,
            isFake: false,
        }
    }

    if (!hasLoadedNotes) {
        return display
    }

    const fakeCount = Math.max(0, 3 - realNotes.length)

    if (fakeCount === 0) {
        return display
    }

    let remainingFakeCount = fakeCount

    if (
        protectedStarterNote &&
        !display[protectedStarterNote.windowId] &&
        remainingFakeCount > 0
    ) {
        display[protectedStarterNote.windowId] = {
            id: protectedStarterNote.id,
            note: protectedStarterNote.note,
            isFake: true,
        }

        remainingFakeCount -= 1
    }

    const availableStarterWindows = starterWindowOrder.filter(
        (windowId) => !display[windowId]
    )

    for (let index = 0; index < remainingFakeCount; index++) {
        const windowId = availableStarterWindows[index]

        if (!windowId) break

        display[windowId] = {
            id: `starter-${windowId}`,
            note: starterMessages[index % starterMessages.length],
            isFake: true,
        }
    }

    return display
}

function CustomCursor() {
    const dotRef = useRef<HTMLDivElement>(null)
    const ringRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const dot = dotRef.current
        const ring = ringRef.current

        if (!dot || !ring) return

        const finePointer = window.matchMedia("(pointer: fine)")

        if (!finePointer.matches || window.innerWidth < 768) {
            return
        }

        document.documentElement.classList.add("custom-cursor-active")

        let mouseX = window.innerWidth / 2
        let mouseY = window.innerHeight / 2

        let ringX = mouseX
        let ringY = mouseY

        let animationFrame = 0

        const handleMouseMove = (event: MouseEvent) => {
            mouseX = event.clientX
            mouseY = event.clientY

            dot.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0)`
        }

        const handleMouseOver = (event: MouseEvent) => {
            const target = event.target as HTMLElement

            const interactive = target.closest(
                "button, a, textarea, input, [data-cursor='interactive']"
            )

            if (interactive) {
                ring.classList.add("cursor-hover")
                dot.classList.add("cursor-dot-hover")
            } else {
                ring.classList.remove("cursor-hover")
                dot.classList.remove("cursor-dot-hover")
            }
        }

        const animate = () => {
            const isTablet =
                window.innerWidth >= 768 && window.innerWidth <= 1023

            const followSpeed = isTablet ? 0.28 : 0.16

            ringX += (mouseX - ringX) * followSpeed
            ringY += (mouseY - ringY) * followSpeed

            ring.style.transform = `translate3d(${ringX}px, ${ringY}px, 0)`

            animationFrame = requestAnimationFrame(animate)
        }

        window.addEventListener("mousemove", handleMouseMove)
        document.addEventListener("mouseover", handleMouseOver)

        animationFrame = requestAnimationFrame(animate)

        return () => {
            document.documentElement.classList.remove("custom-cursor-active")

            window.removeEventListener("mousemove", handleMouseMove)
            document.removeEventListener("mouseover", handleMouseOver)

            cancelAnimationFrame(animationFrame)
        }
    }, [])

    return (
        <>
            <div ref={ringRef} className="custom-cursor-ring" />
            <div ref={dotRef} className="custom-cursor-dot" />
        </>
    )
}

export default function Home() {
    const [realNotes, setRealNotes] = useState<WindowNoteRow[]>([])
    const [hasLoadedNotes, setHasLoadedNotes] = useState(false)

    const [visitorCount, setVisitorCount] = useState(0)

    const [introPhase, setIntroPhase] = useState<IntroPhase>("checking")
    const [introRevealedWindowIds, setIntroRevealedWindowIds] = useState<
        number[]
    >([])

    const [activeWindow, setActiveWindow] = useState<number | null>(null)
    const [mode, setMode] = useState<ModalMode>(null)
    const [writeMode, setWriteMode] = useState<WriteMode>(null)

    const [draft, setDraft] = useState("")

    const [readSnapshot, setReadSnapshot] = useState<ReadSnapshot | null>(null)

    const [protectedStarterNote, setProtectedStarterNote] =
        useState<ProtectedStarterNote | null>(null)

    const [readStateReady, setReadStateReady] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)

    const [toastMessage, setToastMessage] = useState<string | null>(null)

    const [flickerWindowId, setFlickerWindowId] = useState<number | null>(null)

    const [hoveredWindowId, setHoveredWindowId] = useState<number | null>(null)

    const [petFrame, setPetFrame] = useState(0)

    const [touchHint, setTouchHint] = useState<TouchHint>(null)
    const [touchPetFrame, setTouchPetFrame] = useState(0)

    const [turnstileToken, setTurnstileToken] = useState<string | null>(null)

    const turnstileRef = useRef<TurnstileInstance>(null)
    const audioContextRef = useRef<AudioContext | null>(null)

    const toastTimeoutRef = useRef<number | null>(null)

    const introTimeoutsRef = useRef<number[]>([])

    const activeProtectedStarterNote = useMemo<ProtectedStarterNote | null>(
        () => {
            if (readSnapshot?.isFake) {
                return {
                    windowId: readSnapshot.windowId,
                    id: readSnapshot.id,
                    note: readSnapshot.note,
                }
            }

            return protectedStarterNote
        },
        [readSnapshot, protectedStarterNote]
    )

    const displayNotes = useMemo(
        () =>
            buildDisplayNotes(
                realNotes,
                hasLoadedNotes,
                activeProtectedStarterNote
            ),
        [realNotes, hasLoadedNotes, activeProtectedStarterNote]
    )

    const litWindowIdKey = useMemo(
        () =>
            windows
                .filter((windowItem) => Boolean(displayNotes[windowItem.id]))
                .map((windowItem) => windowItem.id)
                .join(","),
        [displayNotes]
    )

    const buildingIsFull = realNotes.length >= 20

    const loadNotes = useCallback(async () => {
        const { data, error } = await supabase
            .from("window_notes")
            .select("window_id, id, note, created_at")
            .order("window_id", {
                ascending: true,
            })

        if (error) {
            console.error("Could not load window notes:", error)

            setHasLoadedNotes(true)

            return false
        }

        setRealNotes((data ?? []) as WindowNoteRow[])
        setHasLoadedNotes(true)

        return true
    }, [])

    const loadVisitorCount = useCallback(async () => {
        const { data, error } = await supabase
            .from("site_stats")
            .select("visitor_count")
            .eq("id", "main")
            .single()

        if (error) {
            console.error("Could not load visitor count:", error)
            return false
        }

        const nextVisitorCount = Number(data?.visitor_count ?? 0)

        if (Number.isFinite(nextVisitorCount)) {
            setVisitorCount(nextVisitorCount)
        }

        return true
    }, [])

    const registerVisit = useCallback(async () => {
        const alreadyCounted = window.localStorage.getItem(VISITOR_STATE_KEY)

        if (alreadyCounted) {
            await loadVisitorCount()
            return
        }

        window.localStorage.setItem(VISITOR_STATE_KEY, "1")

        const { data, error } = await supabase.rpc("increment_visitor_count")

        if (error) {
            console.error("Could not increment visitor count:", error)

            window.localStorage.removeItem(VISITOR_STATE_KEY)

            await loadVisitorCount()

            return
        }

        const nextVisitorCount = Number(data ?? 0)

        if (Number.isFinite(nextVisitorCount)) {
            setVisitorCount(nextVisitorCount)
        }
    }, [loadVisitorCount])

    useEffect(() => {
        try {
            const hasSeenIntro = window.localStorage.getItem(INTRO_SEEN_KEY)

            setIntroPhase(hasSeenIntro ? "done" : "visible")
        } catch {
            setIntroPhase("visible")
        }
    }, [])

    useEffect(() => {
        void loadNotes()

        const interval = window.setInterval(() => {
            void loadNotes()
        }, 5000)

        return () => {
            window.clearInterval(interval)
        }
    }, [loadNotes])

    useEffect(() => {
        void registerVisit()

        const interval = window.setInterval(() => {
            void loadVisitorCount()
        }, 5000)

        return () => {
            window.clearInterval(interval)
        }
    }, [registerVisit, loadVisitorCount])

    useEffect(() => {
        try {
            const stored = window.localStorage.getItem(READ_STATE_KEY)

            if (!stored) {
                setReadStateReady(true)
                return
            }

            const parsed = JSON.parse(stored) as Partial<ReadSnapshot>

            if (
                typeof parsed.windowId === "number" &&
                typeof parsed.id === "string" &&
                typeof parsed.note === "string" &&
                typeof parsed.isFake === "boolean"
            ) {
                setReadSnapshot(parsed as ReadSnapshot)
            } else {
                window.localStorage.removeItem(READ_STATE_KEY)
            }
        } catch {
            window.localStorage.removeItem(READ_STATE_KEY)
        } finally {
            setReadStateReady(true)
        }
    }, [])

    useEffect(() => {
        if (realNotes.length >= 3) {
            setProtectedStarterNote(null)
        }
    }, [realNotes.length])

    useEffect(() => {
        return () => {
            const audioContext = audioContextRef.current

            if (audioContext && audioContext.state !== "closed") {
                void audioContext.close()
            }

            if (toastTimeoutRef.current !== null) {
                window.clearTimeout(toastTimeoutRef.current)
            }

            for (const timeout of introTimeoutsRef.current) {
                window.clearTimeout(timeout)
            }
        }
    }, [])

    useEffect(() => {
        if (hoveredWindowId === null) {
            setPetFrame(0)
            return
        }

        if (displayNotes[hoveredWindowId]) {
            setPetFrame(0)
            return
        }

        let frame = 0

        const interval = window.setInterval(() => {
            frame = (frame + 1) % 4
            setPetFrame(frame)
        }, 180)

        return () => {
            window.clearInterval(interval)
        }
    }, [hoveredWindowId, displayNotes])

    useEffect(() => {
        if (
            introPhase !== "done" ||
            mode !== null ||
            !hasLoadedNotes ||
            !readStateReady
        ) {
            setTouchHint(null)
            setTouchPetFrame(0)
            return
        }

        const touchScreenQuery = window.matchMedia("(max-width: 1023px)")
        const reducedMotionQuery = window.matchMedia(
            "(prefers-reduced-motion: reduce)"
        )

        if (!touchScreenQuery.matches || reducedMotionQuery.matches) {
            setTouchHint(null)
            setTouchPetFrame(0)
            return
        }

        const litWindowIds = litWindowIdKey
            ? litWindowIdKey.split(",").map(Number)
            : []

        const litWindowIdSet = new Set(litWindowIds)

        let startTimeout: number | null = null
        let hideTimeout: number | null = null
        let frameInterval: number | null = null
        let cancelled = false

        const clearAnimationTimers = () => {
            if (hideTimeout !== null) {
                window.clearTimeout(hideTimeout)
                hideTimeout = null
            }

            if (frameInterval !== null) {
                window.clearInterval(frameInterval)
                frameInterval = null
            }
        }

        const scheduleHint = () => {
            if (cancelled) {
                return
            }

            const delay = 2500 + Math.random() * 3000

            startTimeout = window.setTimeout(() => {
                if (cancelled) {
                    return
                }

                const darkWindows = windows.filter(
                    (windowItem) => !litWindowIdSet.has(windowItem.id)
                )

                const litWindows = windows.filter((windowItem) =>
                    litWindowIdSet.has(windowItem.id)
                )

                const canShowLeaveHint = darkWindows.length > 0

                const canShowReadHint =
                    readSnapshot === null && litWindows.length > 0

                if (!canShowLeaveHint && !canShowReadHint) {
                    setTouchHint(null)
                    setTouchPetFrame(0)
                    return
                }

                let hintType: TouchHintType

                if (canShowLeaveHint && canShowReadHint) {
                    hintType = Math.random() < 0.5 ? "leave" : "read"
                } else {
                    hintType = canShowLeaveHint ? "leave" : "read"
                }

                const availableWindows =
                    hintType === "leave" ? darkWindows : litWindows

                const pickedWindow =
                    availableWindows[
                        Math.floor(Math.random() * availableWindows.length)
                    ]

                setTouchHint({
                    type: hintType,
                    windowId: pickedWindow.id,
                })

                if (hintType === "leave") {
                    let frame = 0

                    setTouchPetFrame(0)

                    frameInterval = window.setInterval(() => {
                        frame = (frame + 1) % 4
                        setTouchPetFrame(frame)
                    }, 180)
                }

                hideTimeout = window.setTimeout(() => {
                    clearAnimationTimers()

                    setTouchHint(null)
                    setTouchPetFrame(0)

                    scheduleHint()
                }, 1500)
            }, delay)
        }

        scheduleHint()

        return () => {
            cancelled = true

            if (startTimeout !== null) {
                window.clearTimeout(startTimeout)
            }

            clearAnimationTimers()

            setTouchHint(null)
            setTouchPetFrame(0)
        }
    }, [
        introPhase,
        mode,
        hasLoadedNotes,
        readStateReady,
        readSnapshot,
        litWindowIdKey,
    ])

    function saveReadSnapshot(snapshot: ReadSnapshot) {
        setReadSnapshot(snapshot)

        window.localStorage.setItem(READ_STATE_KEY, JSON.stringify(snapshot))
    }

    function clearReadSnapshot() {
        setReadSnapshot(null)
        window.localStorage.removeItem(READ_STATE_KEY)
    }

    async function getAudioContext() {
        if (!audioContextRef.current) {
            audioContextRef.current = new AudioContext()
        }

        const audioContext = audioContextRef.current

        if (audioContext.state === "suspended") {
            await audioContext.resume()
        }

        return audioContext
    }

    function createSoftTone(
        audioContext: AudioContext,
        frequency: number,
        startTime: number,
        duration: number,
        volume: number
    ) {
        const oscillator = audioContext.createOscillator()
        const gain = audioContext.createGain()

        oscillator.type = "triangle"

        oscillator.frequency.setValueAtTime(frequency, startTime)

        gain.gain.setValueAtTime(0.0001, startTime)

        gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.02)

        gain.gain.exponentialRampToValueAtTime(
            0.0001,
            startTime + duration
        )

        oscillator.connect(gain)
        gain.connect(audioContext.destination)

        oscillator.start(startTime)
        oscillator.stop(startTime + duration + 0.03)
    }

    async function playMessageOpenSound() {
        const audioContext = await getAudioContext()

        const now = audioContext.currentTime

        createSoftTone(audioContext, 659.25, now, 0.18, 0.035)
        createSoftTone(audioContext, 783.99, now + 0.08, 0.22, 0.025)
    }

    async function playNotificationSound(delayMs = 0) {
        const audioContext = await getAudioContext()

        const now = audioContext.currentTime + delayMs / 1000

        createSoftTone(audioContext, 880, now, 0.1, 0.018)
        createSoftTone(audioContext, 1174.66, now + 0.055, 0.14, 0.013)
    }

    function createSwitchSnap(
        audioContext: AudioContext,
        startTime: number,
        duration: number,
        volume: number,
        frequency: number
    ) {
        const sampleCount = Math.max(
            1,
            Math.floor(audioContext.sampleRate * duration)
        )

        const buffer = audioContext.createBuffer(
            1,
            sampleCount,
            audioContext.sampleRate
        )

        const data = buffer.getChannelData(0)

        for (let index = 0; index < sampleCount; index++) {
            const fade = 1 - index / sampleCount

            data[index] = (Math.random() * 2 - 1) * fade * fade
        }

        const source = audioContext.createBufferSource()
        const filter = audioContext.createBiquadFilter()
        const gain = audioContext.createGain()

        source.buffer = buffer

        filter.type = "bandpass"
        filter.frequency.setValueAtTime(frequency, startTime)
        filter.Q.setValueAtTime(0.8, startTime)

        gain.gain.setValueAtTime(volume, startTime)

        gain.gain.exponentialRampToValueAtTime(
            0.0001,
            startTime + duration
        )

        source.connect(filter)
        filter.connect(gain)
        gain.connect(audioContext.destination)

        source.start(startTime)
        source.stop(startTime + duration)
    }

    async function playLightOnSound() {
        const audioContext = await getAudioContext()

        const now = audioContext.currentTime

        createSwitchSnap(audioContext, now, 0.018, 0.12, 1900)
        createSwitchSnap(audioContext, now + 0.038, 0.025, 0.1, 850)

        const thump = audioContext.createOscillator()
        const thumpGain = audioContext.createGain()

        thump.type = "triangle"

        thump.frequency.setValueAtTime(120, now + 0.035)

        thump.frequency.exponentialRampToValueAtTime(75, now + 0.075)

        thumpGain.gain.setValueAtTime(0.025, now + 0.035)

        thumpGain.gain.exponentialRampToValueAtTime(
            0.0001,
            now + 0.08
        )

        thump.connect(thumpGain)
        thumpGain.connect(audioContext.destination)

        thump.start(now + 0.035)
        thump.stop(now + 0.085)
    }

    function showToast(message: string, soundDelay = 0) {
        if (toastTimeoutRef.current !== null) {
            window.clearTimeout(toastTimeoutRef.current)
        }

        setToastMessage(message)

        void playNotificationSound(soundDelay)

        toastTimeoutRef.current = window.setTimeout(() => {
            setToastMessage(null)
            toastTimeoutRef.current = null
        }, 3200)
    }

    function startIntroExperience() {
        if (introPhase !== "visible" || !hasLoadedNotes) {
            return
        }

        try {
            window.localStorage.setItem(INTRO_SEEN_KEY, "1")
        } catch {
            // The intro still works even if storage is unavailable.
        }

        for (const timeout of introTimeoutsRef.current) {
            window.clearTimeout(timeout)
        }

        introTimeoutsRef.current = []

        setIntroRevealedWindowIds([])
        setIntroPhase("revealing")

        const litWindowIds = windows
            .map((windowItem) => windowItem.id)
            .filter((windowId) => Boolean(displayNotes[windowId]))

        const revealStartDelay = 260
        const revealGap = 150

        litWindowIds.forEach((windowId, index) => {
            const timeout = window.setTimeout(() => {
                setIntroRevealedWindowIds((current) =>
                    current.includes(windowId)
                        ? current
                        : [...current, windowId]
                )

                if (index < 3) {
                    void playLightOnSound()
                }
            }, revealStartDelay + index * revealGap)

            introTimeoutsRef.current.push(timeout)
        })

        const finalRevealDelay =
            litWindowIds.length > 0
                ? revealStartDelay + (litWindowIds.length - 1) * revealGap
                : revealStartDelay

        const finishTimeout = window.setTimeout(() => {
            setIntroPhase("done")
            setIntroRevealedWindowIds([])
        }, finalRevealDelay + 900)

        introTimeoutsRef.current.push(finishTimeout)
    }

    function handleWindowClick(id: number) {
        if (
            introPhase !== "done" ||
            !readStateReady ||
            !hasLoadedNotes
        ) {
            return
        }

        const note = displayNotes[id]

        if (note) {
            if (readSnapshot) {
                if (readSnapshot.windowId === id) {
                    setActiveWindow(id)
                    setWriteMode(null)
                    setMode("read")

                    return
                }

                showToast(
                    "You've already read a note. Leave a light before reading another."
                )

                return
            }

            const snapshot: ReadSnapshot = {
                windowId: id,
                id: note.id,
                note: note.note,
                isFake: note.isFake,
            }

            if (note.isFake) {
                setProtectedStarterNote({
                    windowId: id,
                    id: note.id,
                    note: note.note,
                })
            } else {
                setProtectedStarterNote(null)
            }

            saveReadSnapshot(snapshot)

            void playMessageOpenSound()

            setActiveWindow(id)
            setWriteMode(null)
            setMode("read")

            return
        }

        if (!readSnapshot) {
            showToast("Read a note first. Click a lit window to open one.")

            return
        }

        setActiveWindow(id)
        setDraft("")
        setWriteMode("new")
        setMode("write")
    }

    function chooseLeaveALight() {
        if (!readSnapshot) {
            return
        }

        if (buildingIsFull) {
            if (readSnapshot.isFake) {
                clearReadSnapshot()

                setActiveWindow(null)
                setWriteMode(null)
                setMode(null)

                showToast(
                    "The building changed since your last visit. Read a current light first."
                )

                return
            }

            setActiveWindow(readSnapshot.windowId)
            setDraft("")
            setWriteMode("replace")
            setMode("write")

            return
        }

        setActiveWindow(null)
        setDraft("")
        setWriteMode(null)
        setMode(null)

        showToast("Pick a dark window and leave a light for the next person.")
    }

    function maybeLater() {
        setActiveWindow(null)
        setDraft("")
        setWriteMode(null)
        setMode(null)
    }

    function resetTurnstile() {
        setTurnstileToken(null)
        turnstileRef.current?.reset()
    }

    async function leaveNote() {
        if (activeWindow === null || writeMode === null || isSubmitting) {
            return
        }

        const cleanNote = draft.trim().slice(0, 180)

        if (!cleanNote) {
            return
        }

        if (
            writeMode === "replace" &&
            (!readSnapshot || readSnapshot.isFake)
        ) {
            return
        }

        if (!TURNSTILE_SITE_KEY || !turnstileToken) {
            showToast("One sec — checking that you're human.")
            return
        }

        setIsSubmitting(true)

        let response: Response

        let result: {
            ok?: boolean
            error?: string
        }

        try {
            response = await fetch("/api/leave-note", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    windowId: activeWindow,
                    note: cleanNote,
                    mode: writeMode,
                    turnstileToken,
                    expectedNoteId:
                        writeMode === "replace"
                            ? readSnapshot?.id
                            : undefined,
                }),
            })

            result = (await response.json()) as {
                ok?: boolean
                error?: string
            }
        } catch (error) {
            console.error("Could not reach note moderation route:", error)

            resetTurnstile()
            setIsSubmitting(false)

            showToast("Couldn't leave your light. Try again.")

            return
        }

        if (!response.ok || result.ok !== true) {
            resetTurnstile()

            if (result.error === "CONTENT_NOT_ALLOWED") {
                setIsSubmitting(false)

                showToast(
                    "That note can't be posted. Keep it kind and appropriate for everyone."
                )

                return
            }

            if (result.error === "RATE_LIMITED") {
                setIsSubmitting(false)

                showToast(
                    "A few too many tries. Give it 10 minutes and come back."
                )

                return
            }

            if (result.error === "RATE_LIMIT_UNAVAILABLE") {
                setIsSubmitting(false)

                showToast(
                    "Couldn't check submissions right now. Try again in a moment."
                )

                return
            }

            if (result.error === "MODERATION_UNAVAILABLE") {
                setIsSubmitting(false)

                showToast(
                    "Couldn't check your note right now. Try again in a moment."
                )

                return
            }

            if (result.error === "TURNSTILE_FAILED") {
                setIsSubmitting(false)

                showToast(
                    "Couldn't verify this submission. Try again."
                )

                return
            }

            if (result.error === "TURNSTILE_UNAVAILABLE") {
                setIsSubmitting(false)

                showToast(
                    "Verification is unavailable right now. Try again in a moment."
                )

                return
            }

            if (result.error === "WINDOW_TAKEN") {
                await loadNotes()

                setActiveWindow(null)
                setDraft("")
                setWriteMode(null)
                setMode(null)
                setIsSubmitting(false)

                showToast("That window just lit up. Pick another dark window.")

                return
            }

            if (result.error === "STALE_WINDOW") {
                await loadNotes()

                clearReadSnapshot()
                setProtectedStarterNote(null)

                setActiveWindow(null)
                setDraft("")
                setWriteMode(null)
                setMode(null)
                setIsSubmitting(false)

                showToast(
                    "That light changed while you were writing. Read a current note and try again."
                )

                return
            }

            console.error(
                "Could not leave window note:",
                result.error ?? response.status
            )

            setIsSubmitting(false)

            showToast("Couldn't leave your light. Try again.")

            return
        }

        const windowId = activeWindow

        setTurnstileToken(null)

        if (readSnapshot?.isFake) {
            setProtectedStarterNote({
                windowId: readSnapshot.windowId,
                id: readSnapshot.id,
                note: readSnapshot.note,
            })
        }

        await loadNotes()

        clearReadSnapshot()

        setDraft("")
        setActiveWindow(null)
        setWriteMode(null)
        setMode(null)
        setIsSubmitting(false)

        window.setTimeout(() => {
            startWindowFlicker(windowId)

            showToast(
                "Your light is on. Your note is waiting for the next person.",
                180
            )
        }, 120)
    }

    function startWindowFlicker(windowId: number) {
        void playLightOnSound()

        setFlickerWindowId(windowId)

        window.setTimeout(() => {
            setFlickerWindowId((current) =>
                current === windowId ? null : current
            )
        }, 850)
    }

    function closeModal() {
        setActiveWindow(null)
        setMode(null)
        setWriteMode(null)
        setDraft("")
        setTurnstileToken(null)
        setIsSubmitting(false)
    }

    return (
        <main
            className={`page ${
                introPhase !== "done" ? "intro-active" : ""
            }`}
        >
            <CustomCursor />

            <section className="scene">
                <img
                    className="scene-image"
                    src="/leave-a-light-on.png"
                    alt="Apartment building at night beneath a starry sky"
                />

                <div
                    className="meteor-area meteor-area-left"
                    aria-hidden="true"
                >
                    {meteorEvents
                        .filter((event) => event.side === "left")
                        .map((event) => (
                            <div
                                key={event.id}
                                className="meteor-event meteor-event-left"
                                style={{
                                    top: `${event.top}%`,
                                    animationDelay: `${event.delay}s`,
                                    animationDuration: `${event.cycle}s`,
                                }}
                            >
                                <span className="meteor-twinkle" />

                                <span
                                    className="meteor"
                                    style={{
                                        width: `${event.length}px`,
                                    }}
                                />
                            </div>
                        ))}
                </div>

                <div
                    className="meteor-area meteor-area-right"
                    aria-hidden="true"
                >
                    {meteorEvents
                        .filter((event) => event.side === "right")
                        .map((event) => (
                            <div
                                key={event.id}
                                className="meteor-event meteor-event-right"
                                style={{
                                    top: `${event.top}%`,
                                    animationDelay: `${event.delay}s`,
                                    animationDuration: `${event.cycle}s`,
                                }}
                            >
                                <span className="meteor-twinkle" />

                                <span
                                    className="meteor"
                                    style={{
                                        width: `${event.length}px`,
                                    }}
                                />
                            </div>
                        ))}
                </div>

                <header className="hero">
                    <h1>Leave a Light On</h1>

                    <p>
                        Click a lit window to read a note, then leave one in a
                        dark window.
                    </p>
                </header>

                <div className="window-layer">
                    {windows.map((windowItem) => {
                        const note = displayNotes[windowItem.id]

                        const isLit = Boolean(note)

                        const isFlickering =
                            flickerWindowId === windowItem.id

                        const isTouchLeaveHint =
                            touchHint?.type === "leave" &&
                            touchHint.windowId === windowItem.id &&
                            !isLit

                        const isTouchReadHint =
                            touchHint?.type === "read" &&
                            touchHint.windowId === windowItem.id &&
                            isLit

                        const petType = getPetForWindow(windowItem.id)

                        const petFrames =
                            petType === "cat" ? catFrames : dogFrames

                        const currentPetFrame = isTouchLeaveHint
                            ? touchPetFrame
                            : petFrame

                        const isIntroRevealed =
                            introRevealedWindowIds.includes(windowItem.id)

                        const hideForIntro =
                            isLit &&
                            introPhase !== "done" &&
                            !(
                                introPhase === "revealing" &&
                                isIntroRevealed
                            )

                        const showIntroReveal =
                            isLit &&
                            introPhase === "revealing" &&
                            isIntroRevealed

                        return (
                            <button
                                key={windowItem.id}
                                type="button"
                                className={`window-button ${
                                    isLit ? "lit" : "dark"
                                } ${isFlickering ? "flicker" : ""} ${
                                    hideForIntro ? "intro-light-hidden" : ""
                                } ${
                                    showIntroReveal ? "intro-light-reveal" : ""
                                } ${
                                    isTouchLeaveHint
                                        ? "touch-leave-hint"
                                        : ""
                                } ${
                                    isTouchReadHint ? "touch-read-hint" : ""
                                }`}
                                style={{
                                    left: `${windowItem.left}%`,
                                    top: `${windowItem.top}%`,
                                    width: `${windowItem.width}%`,
                                    height: `${windowItem.height}%`,
                                }}
                                onMouseEnter={() =>
                                    setHoveredWindowId(windowItem.id)
                                }
                                onMouseLeave={() =>
                                    setHoveredWindowId(null)
                                }
                                onClick={() =>
                                    handleWindowClick(windowItem.id)
                                }
                                aria-label={
                                    isLit
                                        ? "Read the note in this lit window"
                                        : "Leave a note in this dark window"
                                }
                            >
                                <span
                                    className="dark-window-fill"
                                    aria-hidden="true"
                                />

                                <span
                                    className="light"
                                    aria-hidden="true"
                                />

                                {isLit ? (
                                    <span
                                        className={`window-bubble read-bubble ${
                                            isTouchReadHint
                                                ? "touch-hint-bubble"
                                                : ""
                                        }`}
                                        aria-hidden="true"
                                    >
                                        <span className="bubble-shell">
                                            READ ME
                                        </span>

                                        <span className="bubble-tail" />
                                    </span>
                                ) : (
                                    <>
                                        <span
                                            className={`pet-window-clip ${petType}-window-clip`}
                                            aria-hidden="true"
                                        >
                                            <img
                                                className={`pet-sprite ${petType}-sprite`}
                                                src={
                                                    petFrames[currentPetFrame]
                                                }
                                                alt=""
                                                draggable={false}
                                            />
                                        </span>

                                        <span
                                            className={`window-bubble leave-bubble ${
                                                isTouchLeaveHint
                                                    ? "touch-hint-bubble"
                                                    : ""
                                            }`}
                                            aria-hidden="true"
                                        >
                                            <span className="bubble-shell">
                                                LEAVE A NOTE
                                            </span>

                                            <span className="bubble-tail" />
                                        </span>
                                    </>
                                )}
                            </button>
                        )
                    })}
                </div>

                <div
                    className="door-counter"
                    tabIndex={0}
                    role="note"
                    aria-label={`${visitorCount.toLocaleString()} strangers have stopped by`}
                    data-cursor="interactive"
                >
                    <span
                        className="door-counter-hover"
                        aria-hidden="true"
                    >
                        <span className="door-counter-bubble-shell">
                            {visitorCount.toLocaleString()} STRANGERS STOPPED BY
                        </span>

                        <span className="door-counter-bubble-tail" />
                    </span>

                    <span className="door-counter-plaque">
                        <span className="door-counter-screw screw-top-left" />
                        <span className="door-counter-screw screw-top-right" />
                        <span className="door-counter-screw screw-bottom-left" />
                        <span className="door-counter-screw screw-bottom-right" />

                        <span className="door-counter-number">
                            {visitorCount.toLocaleString()}
                        </span>
                    </span>
                </div>

                <div
                    style={{
                        position: "absolute",
                        zIndex: 30,
                        right: "16px",
                        bottom: "14px",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        color: "rgba(243, 231, 220, 0.5)",
                        fontFamily:
                            "var(--font-geist-mono), monospace",
                        fontSize: "8px",
                        fontWeight: 400,
                        lineHeight: 1,
                        letterSpacing: "0.04em",
                        textTransform: "lowercase",
                    }}
                >
                    <span>made by</span>

                    <a
                        href="https://www.linkedin.com/in/ej-pesebre/"
                        target="_blank"
                        rel="noreferrer"
                        style={{
                            color: "inherit",
                            textDecoration: "none",
                        }}
                    >
                        emma
                    </a>

                    <span
                        aria-hidden="true"
                        style={{
                            display: "inline-block",
                            width: "6px",
                            height: "6px",
                            marginLeft: "1px",
                            background: "#a9586d",
                            clipPath:
                                "polygon(14% 14%, 29% 14%, 29% 0, 43% 0, 50% 14%, 57% 0, 71% 0, 71% 14%, 86% 14%, 86% 29%, 100% 29%, 100% 57%, 86% 57%, 86% 71%, 71% 71%, 71% 86%, 57% 86%, 57% 100%, 43% 100%, 43% 86%, 29% 86%, 29% 71%, 14% 71%, 14% 57%, 0 57%, 0 29%, 14% 29%)",
                            opacity: 0.8,
                        }}
                    />
                </div>
            </section>

            {toastMessage && introPhase === "done" && (
                <div
                    className="pixel-toast"
                    role="status"
                    aria-live="polite"
                >
                    <span
                        className="toast-app-icon"
                        aria-hidden="true"
                    >
                        <span className="toast-app-window" />
                    </span>

                    <div className="toast-content">
                        <p>{toastMessage}</p>
                    </div>
                </div>
            )}

            {mode !== null && (
                <div
                    className="modal-backdrop"
                    onMouseDown={closeModal}
                >
                    <div
                        className="pixel-window"
                        data-cursor="interactive"
                        onMouseDown={(event) =>
                            event.stopPropagation()
                        }
                    >
                        <div className="pixel-window-bar">
                            <span className="pixel-window-title">
                                MESSAGE
                            </span>

                            <button
                                type="button"
                                className="pixel-control pixel-close-control"
                                onClick={closeModal}
                                aria-label="Close"
                            >
                                <span className="pixel-icon pixel-icon-close" />
                            </button>
                        </div>

                        <div className="pixel-window-body">
                            {mode === "read" &&
                                readSnapshot !== null && (
                                    <>
                                        <div
                                            className="pixel-sparkles"
                                            aria-hidden="true"
                                        >
                                            <span />
                                            <span />
                                        </div>

                                        <p className="modal-label">
                                            A STRANGER LEFT THIS FOR YOU
                                        </p>

                                        <p className="note-text">
                                            “{readSnapshot.note}”
                                        </p>

                                        <div
                                            className="modal-actions"
                                            style={{
                                                gap: "12px",
                                                flexWrap: "wrap",
                                            }}
                                        >
                                            <button
                                                type="button"
                                                className="pixel-button"
                                                onClick={
                                                    chooseLeaveALight
                                                }
                                            >
                                                LEAVE A LIGHT
                                            </button>

                                            <button
                                                type="button"
                                                className="pixel-button"
                                                onClick={maybeLater}
                                                style={{
                                                    background:
                                                        "#c9aaa3",
                                                    borderColor:
                                                        "#6e5972",
                                                    boxShadow:
                                                        "inset 4px 4px 0 #e4c8bd, inset -4px -4px 0 #987a80, 4px 4px 0 #594052",
                                                }}
                                            >
                                                MAYBE LATER
                                            </button>
                                        </div>
                                    </>
                                )}

                            {mode === "write" &&
                                activeWindow !== null && (
                                    <>
                                        <p className="modal-label">
                                            LEAVE SOMETHING FOR THE NEXT PERSON
                                        </p>

                                        <textarea
                                            value={draft}
                                            onChange={(event) =>
                                                setDraft(
                                                    event.target.value
                                                )
                                            }
                                            maxLength={180}
                                            autoFocus
                                            placeholder="Write a short note..."
                                        />

                                        {TURNSTILE_SITE_KEY && (
                                            <Turnstile
                                                ref={turnstileRef}
                                                siteKey={
                                                    TURNSTILE_SITE_KEY
                                                }
                                                onSuccess={(token) =>
                                                    setTurnstileToken(
                                                        token
                                                    )
                                                }
                                                onExpire={() =>
                                                    setTurnstileToken(
                                                        null
                                                    )
                                                }
                                                onError={() => {
                                                    setTurnstileToken(
                                                        null
                                                    )

                                                    showToast(
                                                        "Couldn't verify this submission. Try again."
                                                    )
                                                }}
                                                options={{
                                                    theme: "dark",
                                                    appearance:
                                                        "interaction-only",
                                                    action: "leave_note",
                                                }}
                                                style={{
                                                    width: "100%",
                                                }}
                                            />
                                        )}

                                        <div className="write-footer">
                                            <span>
                                                {draft.length}/180
                                            </span>

                                            <button
                                                type="button"
                                                className="pixel-button"
                                                onClick={() =>
                                                    void leaveNote()
                                                }
                                                disabled={
                                                    !draft.trim() ||
                                                    isSubmitting ||
                                                    !turnstileToken
                                                }
                                            >
                                                LEAVE LIGHT
                                            </button>
                                        </div>
                                    </>
                                )}
                        </div>
                    </div>
                </div>
            )}

            {introPhase !== "done" && (
                <div
                    className={`intro-backdrop ${
                        introPhase === "revealing"
                            ? "intro-backdrop-exit"
                            : ""
                    }`}
                >
                    {introPhase !== "checking" && (
                        <div
                            className="intro-splash"
                            data-cursor="interactive"
                        >
                            <div
                                className="intro-night-scene"
                                aria-hidden="true"
                            >
                                <span className="intro-moon" />

                                <span className="intro-star intro-star-1" />
                                <span className="intro-star intro-star-2" />
                                <span className="intro-star intro-star-3" />
                                <span className="intro-star intro-star-4" />
                                <span className="intro-star intro-star-5" />

                                <span className="intro-cloud intro-cloud-1" />
                                <span className="intro-cloud intro-cloud-2" />

                                <div className="intro-mini-building">
                                    <span className="intro-mini-roof" />

                                    <span className="intro-mini-window intro-mini-window-1" />
                                    <span className="intro-mini-window intro-mini-window-2" />
                                    <span className="intro-mini-window intro-mini-window-3" />
                                    <span className="intro-mini-window intro-mini-window-4" />
                                    <span className="intro-mini-window intro-mini-window-5" />
                                    <span className="intro-mini-window intro-mini-window-6" />

                                    <span className="intro-mini-door" />
                                </div>

                                <img
                                    className="intro-pet intro-cat"
                                    src="/cat-1.png"
                                    alt=""
                                    draggable={false}
                                />

                                <img
                                    className="intro-pet intro-dog"
                                    src="/dog-1.png"
                                    alt=""
                                    draggable={false}
                                />
                            </div>

                            <div className="intro-content">
                                <div className="intro-heading-row">
                                    <h2 className="intro-heading">
                                        HEY, STRANGER
                                    </h2>

                                    <span
                                        className="intro-pixel-heart"
                                        aria-hidden="true"
                                    />
                                </div>

                                <p className="intro-copy">
                                    This is a little place for notes from people
                                    you&apos;ll probably never meet.
                                </p>

                                <p className="intro-copy intro-copy-small">
                                    Read a light. Leave one for the next person.
                                </p>

                                <div className="intro-actions">
                                    <button
                                        type="button"
                                        className="pixel-button intro-button"
                                        onClick={startIntroExperience}
                                        disabled={!hasLoadedNotes}
                                    >
                                        TURN ON THE LIGHTS
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </main>
    )
}