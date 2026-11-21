'use client'

import React, { useState, useEffect, useRef } from 'react'
import { motion } from 'motion/react'
import OpenAI from 'openai'

const openai = new OpenAI({
    apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY,
    dangerouslyAllowBrowser: true
})
const SYSTEM_PROMPT = `You are a helpful and friendly AI assistant. You can answer questions, provide information, and engage in conversation. Please respond in a clear and concise manner.`

type AgentStatus =
    | "READY"
    | "LISTENING"
    | "THINKING..."
    | "PROCESSING AUDIO"
    | "SPEAKING"
    | "ERROR"
    | "UNSUPPORTED"

type ChatMessage = {
    role: "system" | "user" | "assistant"
    content: string
}

function HomePage() {
    const [status, setStatus] = useState<AgentStatus>("READY")
    const [transcript, setTranscript] = useState("")
    const [assistantResponse, setAssistantResponse] = useState("")
    const [isActive, setIsActive] = useState(false)

    const recognitionRef = useRef<any>(null)
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const transcriptRef = useRef("")

    const audioRef = useRef<HTMLAudioElement | null>(null)
    const audioUrlRef = useRef<string | null>(null)

    const isSessionActiveRef = useRef(false)

    const statusRef = useRef<AgentStatus>("READY");

    const turnIdRef = useRef(0)

    // Conversation history taaki agent ko context yaad rahe
    const messagesRef = useRef<ChatMessage[]>([
        {
            role: "system",
            content: SYSTEM_PROMPT
        }
    ])

    const updateStatus = (newStatus: AgentStatus) => {
        statusRef.current = newStatus
        setStatus(newStatus)
    }

    const cleanupAudio = () => {
        if (audioRef.current) {
            audioRef.current.pause()
            audioRef.current.currentTime = 0
            audioRef.current = null
        }
        if (audioUrlRef.current) {
            URL.revokeObjectURL(audioUrlRef.current)
            audioUrlRef.current = null
        }
    }

    const safeStartRecognition = () => {
        if (!recognitionRef.current || !isSessionActiveRef.current) return

        try {
            recognitionRef.current.start()
        } catch {
            // Already started — ignore InvalidStateError
        }
    }

    const speak = async (text: string, currentTurn: number) => {
        console.log("Attempting to speak text:", text, "TurnId:", currentTurn);
        
        if (!isSessionActiveRef.current || currentTurn !== turnIdRef.current) {
            console.log("Session is not active or turn has changed, skipping speech synthesis.");
            return
        }

        updateStatus("PROCESSING AUDIO")

        try {
            const response = await openai.audio.speech.create({
                model: "tts-1",
                voice: "alloy",
                input: text
            })

            const audioBuffer = await response.arrayBuffer()
            const blob = new Blob([audioBuffer], { type: "audio/mpeg" })

            // Check again after async fetch
            if (!isSessionActiveRef.current || currentTurn !== turnIdRef.current) {
                console.log("Session is not active or turn has changed, skipping audio playback.");
                return
            }

            console.log("Cleanup previous audio and prepare to play new audio for TurnId:", currentTurn);
            cleanupAudio()
            
            const url = URL.createObjectURL(blob)
            audioUrlRef.current = url

            const audio = new Audio(url)
            audioRef.current = audio

            updateStatus("SPEAKING")
            await audio.play()

            // Mic wapas on karo taaki user beech me interrupt kar sake
            console.log("Now safe start recognition. Audio playback started. Setting up onended handler for TurnId:", currentTurn);
            safeStartRecognition()

            audio.onended = () => {
                console.log("Audio playback ended for TurnId:", currentTurn, "Cleaning up audio and updating status to LISTENING if session is still active.");
                cleanupAudio()
                if (!isSessionActiveRef.current || currentTurn !== turnIdRef.current) {
                    console.log("Inside audio.onended !, Session is not active or turn has changed after audio ended, skipping status update.");
                    return
                }
                updateStatus("LISTENING");
                setTranscript("")
                transcriptRef.current = ""
            }
        } catch (error) {
            console.error("TTS Error:", error)
            if (isSessionActiveRef.current && currentTurn === turnIdRef.current) {
                console.log("TTS Error occurred for TurnId:", currentTurn);
                updateStatus("ERROR")
            }
        }
    }

    const processWithLLM = async (userInput: string, currentTurn: number) => {
        if (!userInput.trim()) return

        updateStatus("THINKING...")
        setAssistantResponse("Thinking...")

        messagesRef.current.push({ role: "user", content: userInput })

        try {

            const completion = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: messagesRef.current,
            })

            if (!isSessionActiveRef.current || currentTurn !== turnIdRef.current) return

            const reply = completion.choices[0]?.message?.content

            if (reply) {
                messagesRef.current.push({ role: "assistant", content: reply })
                setAssistantResponse(reply)
                console.log("Final assistant response generated. TurnId:", currentTurn, "Response:", reply, "Now jumping to speak the response.");
                speak(reply, currentTurn);
            } else {
                updateStatus("LISTENING")
                safeStartRecognition()
            }
        } catch (error) {
            console.error("LLM Error:", error)
            setAssistantResponse("Failed to fetch response.")
            updateStatus("ERROR")
        }
    }

    useEffect(() => {
        console.log("Initializing speech recognition... with turn id:", turnIdRef.current);
        const SpeechRecognition =
            (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

        if (!SpeechRecognition) {
            console.error("Speech Recognition API is not supported.")
            updateStatus("UNSUPPORTED")
            return
        }

        const recognition = new SpeechRecognition()
        recognition.continuous = true
        recognition.interimResults = true

        recognition.onstart = () => {
            if (isSessionActiveRef.current && statusRef.current !== "SPEAKING") {
                console.log("current session active and status is not SPEAKING, updating status to LISTENING");
                updateStatus("LISTENING")
            }
        }

        recognition.onresult = (event: any) => {
            // basic check to ensure session is still active before processing results
            if (!isSessionActiveRef.current) {
                console.log("Session inactive, ignoring speech recognition result.");
                return;
            }

            console.log("session started Speech recognition result:", "turnId:", turnIdRef.current);

            // Interruption: naya input aate hi current turn cancel aur audio stop
            turnIdRef.current += 1
            if (audioRef.current && !audioRef.current.paused) {
                console.log("Interrupting current audio playback due to new speech input.: cleanupAudio and update status to LISTENING");
                cleanupAudio()
                updateStatus("LISTENING")
            }

            // i = 0 se loop taaki pura sentence capture ho, cut na ho
            let fullTranscript = ''
            for (let i = 0; i < event.results.length; i++) {
                fullTranscript += event.results[i][0].transcript
            }

            setTranscript(fullTranscript)
            transcriptRef.current = fullTranscript

            if (timerRef.current) clearTimeout(timerRef.current)

            timerRef.current = setTimeout(() => {
                const finalInput = transcriptRef.current.trim()
                if (finalInput && isSessionActiveRef.current) {
                    try { recognition.stop() } catch { }

                    const thisTurn = turnIdRef.current
                    console.log("Final transcript captured, processing with LLM. TurnId:", thisTurn, "Transcript:", finalInput);
                    processWithLLM(finalInput, thisTurn)
                }
            }, 1800)
        }

        recognition.onerror = (event: any) => {
            if (event.error !== 'aborted' && event.error !== 'no-speech') {
                console.error("Speech recognition error:", event.error)
                updateStatus("ERROR")
            }
        }

        recognition.onend = () => {
            // Agar session active hai aur sirf LISTENING/SPEAKING me tha, toh mic auto-restart karo
            if (
                isSessionActiveRef.current &&
                (statusRef.current === "LISTENING" || statusRef.current === "SPEAKING")
            ) {
                safeStartRecognition()
            }
        }

        recognitionRef.current = recognition

        // Cleanup on unmount
        return () => {
            isSessionActiveRef.current = false
            if (timerRef.current) clearTimeout(timerRef.current)
            cleanupAudio()
            try { recognition.stop() } catch { }
        }
    }, [])

    const startListening = () => {
        if (!recognitionRef.current) return
        console.log("Starting listening session...", turnIdRef.current);
        isSessionActiveRef.current = true
        setIsActive(true)
        turnIdRef.current += 1

        setTranscript("")
        transcriptRef.current = ""
        setAssistantResponse("")

        if (timerRef.current) clearTimeout(timerRef.current)

        cleanupAudio()

        safeStartRecognition()
    }

    const stopListening = () => {
        isSessionActiveRef.current = false
        setIsActive(false)
        turnIdRef.current += 1

        if (timerRef.current) clearTimeout(timerRef.current)
        cleanupAudio()

        if (recognitionRef.current) {
            try { recognitionRef.current.stop() } catch { }
        }

        updateStatus("READY")
    }

    return (
        <div className="min-h-screen bg-zinc-950 text-white">
            <div className="max-w-7xl mx-auto px-6 py-4">

                <main className="w-full mb-5 flex items-center justify-between">
                    <div className="flex flex-col items-center justify-center">
                        <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                            GORMO
                        </h1>
                        <p className="text-zinc-400 text-xs">AI Voice Agent</p>
                    </div>

                    <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 px-4 py-1.5 rounded-xl">
                        <span
                            className={`w-3 h-3 rounded-full ${status === 'LISTENING'
                                    ? 'bg-red-500 animate-pulse'
                                    : status === 'THINKING...' || status === 'PROCESSING AUDIO'
                                        ? 'bg-yellow-500 animate-bounce'
                                        : status === 'SPEAKING'
                                            ? 'bg-purple-500 animate-pulse'
                                            : status === 'ERROR'
                                                ? 'bg-orange-500'
                                                : 'bg-green-500'
                                }`}
                        />
                        <span className="text-sm text-zinc-300">{status}</span>
                    </div>
                </main>

                <section className="flex justify-center gap-5 mb-10">
                    <motion.button
                        whileHover={{ scale: isActive ? 1 : 1.05 }}
                        whileTap={{ scale: isActive ? 1 : 0.98 }}
                        onClick={startListening}
                        disabled={isActive}
                        className={`px-8 py-3 rounded-xl font-semibold shadow-lg transition-all ${isActive
                                ? 'bg-blue-900/50 text-zinc-400 cursor-not-allowed'
                                : 'bg-blue-600 hover:bg-blue-500 shadow-blue-900/40 cursor-pointer'
                            }`}
                    >
                        Start
                    </motion.button>

                    <motion.button
                        whileHover={{ scale: !isActive ? 1 : 1.05 }}
                        whileTap={{ scale: !isActive ? 1 : 0.98 }}
                        onClick={stopListening}
                        disabled={!isActive}
                        className={`px-8 py-3 rounded-xl font-semibold shadow-lg transition-all ${!isActive
                                ? 'bg-red-900/40 text-zinc-500 cursor-not-allowed'
                                : 'bg-red-600 hover:bg-red-500 shadow-red-900/40 cursor-pointer'
                            }`}
                    >
                        Stop
                    </motion.button>
                </section>

                <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-1">
                        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 h-full">
                            <h2 className="text-xl font-semibold mb-5">User Transcript</h2>
                            <div className="h-[550px] bg-zinc-950 rounded-xl p-4 overflow-y-auto border border-zinc-800">
                                <p className="text-zinc-300">
                                    {transcript || <span className="text-zinc-500">User transcript will appear here...</span>}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="lg:col-span-2">
                        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                            <h2 className="text-xl font-semibold mb-5">Assistant Response</h2>

                            <div className="border border-zinc-800 bg-zinc-950 rounded-xl h-32 flex items-center justify-center mb-5 overflow-hidden relative">
                                <div className="flex items-center justify-center">
                                    {status === "SPEAKING" ? (
                                        <div className="flex items-center gap-1.5 h-12">
                                            {[...Array(5)].map((_, i) => (
                                                <motion.div
                                                    key={i}
                                                    animate={{ height: ["20%", "100%", "20%"] }}
                                                    transition={{ repeat: Infinity, duration: 0.5 + i * 0.1, ease: "easeInOut" }}
                                                    className="w-2.5 bg-purple-500 rounded-full"
                                                />
                                            ))}
                                        </div>
                                    ) : status === "LISTENING" ? (
                                        <div className="relative flex items-center justify-center w-16 h-16">
                                            <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-30 animate-ping" />
                                            <span className="relative inline-flex rounded-full h-8 w-8 bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.7)]" />
                                        </div>
                                    ) : status === "THINKING..." || status === "PROCESSING AUDIO" ? (
                                        <div className="flex items-center gap-2">
                                            <span className="w-3.5 h-3.5 rounded-full bg-yellow-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                                            <span className="w-3.5 h-3.5 rounded-full bg-yellow-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                                            <span className="w-3.5 h-3.5 rounded-full bg-yellow-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center gap-2 text-zinc-500">
                                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                                                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                                                <line x1="12" x2="12" y1="19" y2="22" />
                                            </svg>
                                            <span className="text-sm">Agent Idle</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="h-[418px] bg-zinc-950 rounded-xl p-4 overflow-y-auto border border-zinc-800">
                                <p className="text-zinc-300">
                                    {assistantResponse || <span className="text-zinc-500">Live transcript will appear here...</span>}
                                </p>
                            </div>
                        </div>
                    </div>
                </section>

            </div>
        </div>
    )
}

export default HomePage