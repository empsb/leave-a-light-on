import { createHmac } from "node:crypto"
import { NextResponse } from "next/server"
import { supabaseServer } from "../../../lib/supabase-server"

export const runtime = "nodejs"

type LeaveNoteRequest = {
    windowId?: unknown
    note?: unknown
    mode?: unknown
    expectedNoteId?: unknown
    turnstileToken?: unknown
}

type TurnstileResponse = {
    success?: boolean
    hostname?: string
    action?: string
    "error-codes"?: string[]
}

const RATE_LIMIT_MAX_ATTEMPTS = 5
const RATE_LIMIT_WINDOW_SECONDS = 600

const BLOCKED_WORDS = [
    "fuck",
    "fucking",
    "fucked",
    "fucker",
    "shit",
    "shitty",
    "bullshit",
    "bitch",
    "bitches",
    "bastard",
    "asshole",
    "motherfucker",
    "dick",
    "cock",
    "cunt",
    "pussy",
    "slut",
    "whore",
    "damn",
    "wtf",
    "stfu",
]

const BLOCKED_SEXUAL_WORDS = [
    "nude",
    "nudes",
    "naked",
    "sext",
    "sexting",
    "horny",
    "porn",
    "porno",
    "pornography",
    "sexual",
    "sex",
    "sexy",
    "blowjob",
    "handjob",
    "orgasm",
    "orgasms",
    "masturbate",
    "masturbation",
    "boob",
    "boobs",
    "tits",
    "penis",
    "vagina",
    "onlyfans",
]

const BLOCKED_SEXUAL_PHRASES = [
    "sendnude",
    "sendnudes",
    "sendpics",
    "nudepic",
    "nudepics",
    "nudephoto",
    "nudephotos",
    "nakedpic",
    "nakedpics",
    "nakedphoto",
    "nakedphotos",
    "sexpic",
    "sexpics",
    "sexphoto",
    "sexphotos",
    "sexypic",
    "sexypics",
    "sexyphoto",
    "sexyphotos",
    "onlyfans",
]

function normalizeForFiltering(value: string) {
    return value
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/@/g, "a")
        .replace(/0/g, "o")
        .replace(/1/g, "i")
        .replace(/3/g, "e")
        .replace(/\$/g, "s")
        .replace(/5/g, "s")
        .replace(/7/g, "t")
}

function getNormalizedWords(value: string) {
    return normalizeForFiltering(value)
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
        .split(/\s+/)
        .filter(Boolean)
}

function getCompactTokens(value: string) {
    return normalizeForFiltering(value)
        .split(/\s+/)
        .map((token) => token.replace(/[^a-z0-9]/g, ""))
        .filter(Boolean)
}

function containsBlockedWord(value: string) {
    const words = getNormalizedWords(value)
    const compactTokens = getCompactTokens(value)

    if (
        words.some((word) =>
            BLOCKED_WORDS.some((blocked) => word === blocked)
        )
    ) {
        return true
    }

    return compactTokens.some((token) =>
        BLOCKED_WORDS.some((blocked) => token === blocked)
    )
}

function containsSexualContent(value: string) {
    const normalized = normalizeForFiltering(value)
    const words = getNormalizedWords(value)
    const compactTokens = getCompactTokens(value)

    if (
        words.some((word) =>
            BLOCKED_SEXUAL_WORDS.some((blocked) => word === blocked)
        )
    ) {
        return true
    }

    if (
        compactTokens.some((token) =>
            BLOCKED_SEXUAL_WORDS.some((blocked) => token === blocked)
        )
    ) {
        return true
    }

    const compact = normalized.replace(/[^a-z0-9]/g, "")

    if (
        BLOCKED_SEXUAL_PHRASES.some((phrase) =>
            compact.includes(phrase)
        )
    ) {
        return true
    }

    const sexualPatterns = [
        /\b(?:send|show|share|trade|post|give|want|need|asking for|looking for)\b.{0,30}\b(?:nudes?|naked|sexy|explicit)\b/i,
        /\b(?:hook\s*up|hookup)\b/i,
        /\bsleep\s+with\s+me\b/i,
        /\bhave\s+sex\b/i,
        /\bwant\s+sex\b/i,
        /\bwanna\s+have\s+sex\b/i,
        /\bexplicit\s+(?:pic|pics|photo|photos|image|images)\b/i,
    ]

    return sexualPatterns.some((pattern) => pattern.test(normalized))
}

function looksLikeSpam(value: string) {
    const normalized = value.trim()

    const containsUrl =
        /(https?:\/\/|www\.|[a-z0-9-]+\.(com|net|org|io|co|xyz|app|dev|ai)\b)/i.test(
            normalized
        )

    const repeatedCharacter = /(.)\1{7,}/i.test(normalized)

    const repeatedWord = /\b([a-z0-9]+)(?:\s+\1){4,}\b/i.test(
        normalized
    )

    return containsUrl || repeatedCharacter || repeatedWord
}

function getClientIp(request: Request) {
    const cloudflareIp =
        request.headers.get("cf-connecting-ip")?.trim()

    if (cloudflareIp) {
        return cloudflareIp
    }

    const realIp = request.headers.get("x-real-ip")?.trim()

    if (realIp) {
        return realIp
    }

    const forwardedFor = request.headers.get("x-forwarded-for")

    if (forwardedFor) {
        const firstIp = forwardedFor.split(",")[0]?.trim()

        if (firstIp) {
            return firstIp
        }
    }

    return "unknown"
}

function createRateLimitKey(request: Request) {
    const secret = process.env.SUPABASE_SECRET_KEY

    if (!secret) {
        throw new Error("Missing SUPABASE_SECRET_KEY")
    }

    const clientIp = getClientIp(request)

    const identity =
        clientIp === "unknown"
            ? `unknown:${request.headers.get("user-agent") ?? "unknown"}`
            : clientIp

    return createHmac("sha256", secret)
        .update(`leave-a-light-on:${identity}`)
        .digest("hex")
}

async function consumeRateLimit(request: Request) {
    const keyHash = createRateLimitKey(request)

    const { data, error } = await supabaseServer.rpc(
        "consume_note_rate_limit",
        {
            p_key_hash: keyHash,
            p_limit: RATE_LIMIT_MAX_ATTEMPTS,
            p_window_seconds: RATE_LIMIT_WINDOW_SECONDS,
        }
    )

    if (error) {
        console.error("Could not check note rate limit:", error)

        throw new Error("Rate limit unavailable")
    }

    return data === true
}

function getAllowedTurnstileHostnames() {
    const configured =
        process.env.TURNSTILE_ALLOWED_HOSTNAMES
            ?.split(",")
            .map((hostname) => hostname.trim().toLowerCase())
            .filter(Boolean) ?? []

    if (process.env.NODE_ENV !== "production") {
        return Array.from(
            new Set([
                ...configured,
                "localhost",
                "127.0.0.1",
            ])
        )
    }

    return configured
}

async function verifyTurnstile(
    token: string,
    request: Request
) {
    const secretKey = process.env.TURNSTILE_SECRET_KEY

    if (!secretKey) {
        throw new Error("Missing TURNSTILE_SECRET_KEY")
    }

    if (!token || token.length > 2048) {
        return false
    }

    const clientIp = getClientIp(request)

    const body: {
        secret: string
        response: string
        remoteip?: string
    } = {
        secret: secretKey,
        response: token,
    }

    if (clientIp !== "unknown") {
        body.remoteip = clientIp
    }

    const controller = new AbortController()

    const timeout = setTimeout(() => {
        controller.abort()
    }, 8000)

    try {
        const response = await fetch(
            "https://challenges.cloudflare.com/turnstile/v0/siteverify",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(body),
                signal: controller.signal,
            }
        )

        if (!response.ok) {
            console.error(
                "Turnstile verification request failed:",
                response.status
            )

            throw new Error("Turnstile verification unavailable")
        }

        const result =
            (await response.json()) as TurnstileResponse

        if (result.success !== true) {
            console.warn(
                "Turnstile rejected submission:",
                result["error-codes"] ?? []
            )

            return false
        }

        if (result.action !== "leave_note") {
            console.warn(
                "Turnstile action mismatch:",
                result.action
            )

            return false
        }

        const allowedHostnames =
            getAllowedTurnstileHostnames()

        if (allowedHostnames.length === 0) {
            throw new Error(
                "Missing TURNSTILE_ALLOWED_HOSTNAMES in production"
            )
        }

        const verifiedHostname =
            result.hostname?.trim().toLowerCase()

        if (
            !verifiedHostname ||
            !allowedHostnames.includes(verifiedHostname)
        ) {
            console.warn(
                "Turnstile hostname mismatch:",
                verifiedHostname
            )

            return false
        }

        return true
    } catch (error) {
        if (
            error instanceof Error &&
            error.name === "AbortError"
        ) {
            console.error(
                "Turnstile verification timed out"
            )
        } else {
            console.error(
                "Turnstile verification error:",
                error
            )
        }

        throw new Error("Turnstile verification unavailable")
    } finally {
        clearTimeout(timeout)
    }
}

async function passesOpenAIModeration(note: string) {
    const apiKey = process.env.OPENAI_API_KEY

    if (!apiKey) {
        throw new Error("Missing OPENAI_API_KEY")
    }

    const response = await fetch(
        "https://api.openai.com/v1/moderations",
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: "omni-moderation-latest",
                input: note,
            }),
        }
    )

    if (!response.ok) {
        const errorText = await response.text()

        console.error(
            "OpenAI moderation request failed:",
            response.status,
            errorText
        )

        throw new Error("Moderation request failed")
    }

    const data = (await response.json()) as {
        results?: Array<{
            flagged?: boolean
            categories?: {
                sexual?: boolean
                "sexual/minors"?: boolean
            }
        }>
    }

    const result = data.results?.[0]

    if (!result) {
        throw new Error("Missing moderation result")
    }

    if (result.flagged === true) {
        return false
    }

    if (result.categories?.sexual === true) {
        return false
    }

    if (result.categories?.["sexual/minors"] === true) {
        return false
    }

    return true
}

export async function POST(request: Request) {
    try {
        let body: LeaveNoteRequest

        try {
            body =
                (await request.json()) as LeaveNoteRequest
        } catch {
            return NextResponse.json(
                {
                    ok: false,
                    error: "INVALID_REQUEST",
                },
                {
                    status: 400,
                }
            )
        }

        const windowId = body.windowId
        const note = body.note
        const mode = body.mode
        const expectedNoteId = body.expectedNoteId
        const turnstileToken = body.turnstileToken

        if (
            typeof windowId !== "number" ||
            !Number.isInteger(windowId) ||
            windowId < 1 ||
            windowId > 20
        ) {
            return NextResponse.json(
                {
                    ok: false,
                    error: "INVALID_WINDOW",
                },
                {
                    status: 400,
                }
            )
        }

        if (typeof note !== "string") {
            return NextResponse.json(
                {
                    ok: false,
                    error: "INVALID_NOTE",
                },
                {
                    status: 400,
                }
            )
        }

        const cleanNote = note.trim()

        if (
            cleanNote.length < 1 ||
            cleanNote.length > 180
        ) {
            return NextResponse.json(
                {
                    ok: false,
                    error: "INVALID_NOTE",
                },
                {
                    status: 400,
                }
            )
        }

        if (
            mode !== "new" &&
            mode !== "replace"
        ) {
            return NextResponse.json(
                {
                    ok: false,
                    error: "INVALID_MODE",
                },
                {
                    status: 400,
                }
            )
        }

        if (
            mode === "replace" &&
            (
                typeof expectedNoteId !== "string" ||
                expectedNoteId.length < 1
            )
        ) {
            return NextResponse.json(
                {
                    ok: false,
                    error: "INVALID_REPLACEMENT",
                },
                {
                    status: 400,
                }
            )
        }

        if (
            typeof turnstileToken !== "string" ||
            turnstileToken.length < 1 ||
            turnstileToken.length > 2048
        ) {
            return NextResponse.json(
                {
                    ok: false,
                    error: "TURNSTILE_FAILED",
                },
                {
                    status: 403,
                }
            )
        }

        /*
         * RATE LIMIT
         *
         * This happens before external verification/moderation
         * so repeated requests cannot hammer those services.
         */
        let withinRateLimit = false

        try {
            withinRateLimit =
                await consumeRateLimit(request)
        } catch (error) {
            console.error(
                "Rate limiting unavailable:",
                error
            )

            return NextResponse.json(
                {
                    ok: false,
                    error: "RATE_LIMIT_UNAVAILABLE",
                },
                {
                    status: 503,
                }
            )
        }

        if (!withinRateLimit) {
            return NextResponse.json(
                {
                    ok: false,
                    error: "RATE_LIMITED",
                },
                {
                    status: 429,
                    headers: {
                        "Retry-After": String(
                            RATE_LIMIT_WINDOW_SECONDS
                        ),
                    },
                }
            )
        }

        /*
         * TURNSTILE
         *
         * The browser token is never trusted on its own.
         * Cloudflare validates it server-side here.
         */
        let turnstilePassed = false

        try {
            turnstilePassed =
                await verifyTurnstile(
                    turnstileToken,
                    request
                )
        } catch (error) {
            console.error(
                "Turnstile unavailable:",
                error
            )

            return NextResponse.json(
                {
                    ok: false,
                    error: "TURNSTILE_UNAVAILABLE",
                },
                {
                    status: 503,
                }
            )
        }

        if (!turnstilePassed) {
            return NextResponse.json(
                {
                    ok: false,
                    error: "TURNSTILE_FAILED",
                },
                {
                    status: 403,
                }
            )
        }

        /*
         * LAYER 1:
         * Explicit profanity / curse-word blocking.
         */
        if (containsBlockedWord(cleanNote)) {
            return NextResponse.json(
                {
                    ok: false,
                    error: "CONTENT_NOT_ALLOWED",
                },
                {
                    status: 422,
                }
            )
        }

        /*
         * LAYER 2:
         * Strict sexual-content blocking.
         */
        if (containsSexualContent(cleanNote)) {
            return NextResponse.json(
                {
                    ok: false,
                    error: "CONTENT_NOT_ALLOWED",
                },
                {
                    status: 422,
                }
            )
        }

        /*
         * LAYER 3:
         * Basic URL / spam blocking.
         */
        if (looksLikeSpam(cleanNote)) {
            return NextResponse.json(
                {
                    ok: false,
                    error: "CONTENT_NOT_ALLOWED",
                },
                {
                    status: 422,
                }
            )
        }

        /*
         * LAYER 4:
         * OpenAI moderation.
         *
         * Fail closed if moderation is unavailable.
         */
        let moderationPassed = false

        try {
            moderationPassed =
                await passesOpenAIModeration(cleanNote)
        } catch (error) {
            console.error(
                "Moderation unavailable:",
                error
            )

            return NextResponse.json(
                {
                    ok: false,
                    error: "MODERATION_UNAVAILABLE",
                },
                {
                    status: 503,
                }
            )
        }

        if (!moderationPassed) {
            return NextResponse.json(
                {
                    ok: false,
                    error: "CONTENT_NOT_ALLOWED",
                },
                {
                    status: 422,
                }
            )
        }

        /*
         * WRITE TO SUPABASE
         */

        if (mode === "replace") {
            const { data, error } =
                await supabaseServer.rpc(
                    "replace_window_note",
                    {
                        p_window_id: windowId,
                        p_expected_note_id:
                            expectedNoteId,
                        p_note: cleanNote,
                    }
                )

            if (error) {
                console.error(
                    "Could not replace window note:",
                    error
                )

                return NextResponse.json(
                    {
                        ok: false,
                        error: "DATABASE_ERROR",
                    },
                    {
                        status: 500,
                    }
                )
            }

            if (data !== true) {
                return NextResponse.json(
                    {
                        ok: false,
                        error: "STALE_WINDOW",
                    },
                    {
                        status: 409,
                    }
                )
            }

            return NextResponse.json({
                ok: true,
            })
        }

        const { data, error } =
            await supabaseServer.rpc(
                "leave_window_note",
                {
                    p_window_id: windowId,
                    p_note: cleanNote,
                }
            )

        if (error) {
            console.error(
                "Could not leave window note:",
                error
            )

            return NextResponse.json(
                {
                    ok: false,
                    error: "DATABASE_ERROR",
                },
                {
                    status: 500,
                }
            )
        }

        if (data !== true) {
            return NextResponse.json(
                {
                    ok: false,
                    error: "WINDOW_TAKEN",
                },
                {
                    status: 409,
                }
            )
        }

        return NextResponse.json({
            ok: true,
        })
    } catch (error) {
        console.error(
            "Unexpected leave-note error:",
            error
        )

        return NextResponse.json(
            {
                ok: false,
                error: "SERVER_ERROR",
            },
            {
                status: 500,
            }
        )
    }
}
