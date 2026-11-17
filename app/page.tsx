'use client'

import React, { useState, useEffect, useRef } from 'react'
import { motion } from 'motion/react'
import OpenAI from 'openai'

const openai = new OpenAI({
    apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY,
    dangerouslyAllowBrowser: true
})

function HomePage() {
    const [status, setStatus] = useState<"READY" | "LISTENING" | "THINKING..." | "ERROR" | "PROCESSING AUDIO" | "SPEAKING" | "UNSUPPORTED">("READY")
    const [transcript, setTranscript] = useState("")
    const [assistantResponse, setAssistantResponse] = useState<"" | string | null>("")
    const [audioUrl, setAudioUrl] = useState<string | null>(null);

    const recognitionRef = useRef(null)
    const timerRef = useRef<any>(null)
    const transcriptRef = useRef("");

    const speak = async (text: string) => {
        setStatus("PROCESSING AUDIO");
        try {
            const response = await openai.audio.speech.create({
                model: "tts-1",
                voice: "alloy",
                input: text
            })
            const audioBuffer = await response.arrayBuffer();
            const blob = new Blob([audioBuffer], { type: "audio/mpeg" });
            const url = URL.createObjectURL(blob);

            setAudioUrl(url);

            const audio = new Audio(url);

            setStatus("SPEAKING");
            audio.play();

            audio.onended = () => {
                setStatus("READY")
            }
        } catch {

        }
    }

    const processWithLLM = async (userInput: string) => {
        if (!userInput.trim()) return

        setStatus("THINKING...")
        setAssistantResponse("Thinking...")

        try {
            const completion = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [{ role: "user", content: userInput }],
            })

            const reply = completion.choices[0].message.content;

            if (reply) {
                setAssistantResponse(reply)
                speak(reply)
            } else {
                setStatus("READY")
            }

        } catch (error) {
            console.error("LLM Error:", error)
            setAssistantResponse("Failed to fetch response.")
            setStatus("ERROR")
        }
    }

    useEffect(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition

        if (SpeechRecognition) {
            const recognition = new SpeechRecognition()
            recognition.continuous = true
            recognition.interimResults = true

            recognition.onstart = () => setStatus("LISTENING")

            recognition.onresult = (event: any) => {
                let currentTranscript = ''
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    currentTranscript += event.results[i][0].transcript
                }

                setTranscript(currentTranscript)
                transcriptRef.current = currentTranscript 

                if (timerRef.current) {
                    clearTimeout(timerRef.current)
                }

                timerRef.current = setTimeout(() => {
                    if (transcriptRef.current.trim()) {
                        recognition.stop() 
                        processWithLLM(transcriptRef.current) 
                    }
                }, 2000) 
            }

            recognition.onerror = (event: any) => {
                console.error("Speech recognition error:", event.error)
                setStatus("ERROR")
            }

            recognition.onend = () => {
                if (status === "LISTENING") setStatus("READY")
            }

            recognitionRef.current = recognition
        } else {
            console.error("Speech Recognition API is not supported.")
            setStatus("UNSUPPORTED")
        }
    }, [status])

    const startListening = () => {
        if (recognitionRef.current) {
            setTranscript("")
            transcriptRef.current = ""
            setAssistantResponse("")

            if (timerRef.current) clearTimeout(timerRef.current)

            recognitionRef.current.start()
        }
    }

    const stopListening = () => {
        if (recognitionRef.current) {
            if (timerRef.current) clearTimeout(timerRef.current)
            recognitionRef.current.stop()
            processWithLLM(transcriptRef.current)
        }
    }

    return (
        <div className="min-h-screen bg-zinc-950 text-white">
            <div className="max-w-7xl mx-auto px-6 py-4">
                {/* HEADER */}
                <header className="w-full mb-5 flex items-center justify-between ">
                    <div className="flex flex-col items-center justify-center">
                        <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                            GORMO
                        </h1>
                        <p className="text-zinc-400 text-xs">AI Voice Agent</p>
                    </div>

                    <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 px-4 py-1.5 rounded-xl">
                        <span className={`w-3 h-3 rounded-full ${status === 'LISTENING' ? 'bg-red-500 animate-pulse' : status === 'THINKING...' || status === 'PROCESSING AUDIO' ? 'bg-yellow-500 animate-bounce' : status === 'SPEAKING' ? 'bg-purple-500 animate-pulse' : 'bg-green-500'}`}></span>
                        <span className="text-sm text-zinc-300">{status}</span>
                    </div>
                </header>

                {/* ACTION BTNS */}
                <section className="flex justify-center gap-5 mb-10">
                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={startListening}
                        className="px-8 py-3 rounded-xl font-semibold bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-900/40 transition-all cursor-pointer"
                    >
                        Start
                    </motion.button>

                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={stopListening}
                        className="px-8 py-3 rounded-xl font-semibold bg-red-600 hover:bg-red-500 shadow-lg shadow-red-900/40 transition-all cursor-pointer"
                    >
                        Stop
                    </motion.button>
                </section>

                <main className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* left: user transcript */}
                    <section className="lg:col-span-1">
                        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 h-full">
                            <h2 className="text-xl font-semibold mb-5">User Transcript</h2>
                            <div className="h-[550px] bg-zinc-950 rounded-xl p-4 overflow-y-auto border border-zinc-800">
                                <p className="text-zinc-300">
                                    {transcript || <span className="text-zinc-500">User transcript will appear here...</span>}
                                </p>
                            </div>
                        </div>
                    </section>
                    {/* right: assistant response */}
                    <section className="lg:col-span-2">
                        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                            <h2 className="text-xl font-semibold mb-5">Assistant Response</h2>

                            {/* AUDIO PLAYER VISUALIZATION */}
                            <div className="border border-zinc-800 bg-zinc-950 rounded-xl h-32 flex items-center justify-center mb-5 overflow-hidden relative">
                                
                                {/* Hidden Audio Tag for playback */}
                                {audioUrl && <audio src={audioUrl} autoPlay className="hidden" />}

                                {/* Visual Agent Component */}
                                <div className="flex items-center justify-center">
                                    {status === "SPEAKING" ? (
                                        <div className="flex items-center gap-1.5 h-12">
                                            {[...Array(5)].map((_, i) => (
                                                <motion.div 
                                                    key={i}
                                                    animate={{ height: ["20%", "100%", "20%"] }} 
                                                    transition={{ repeat: Infinity, duration: 0.5 + (i * 0.1), ease: "easeInOut" }} 
                                                    className="w-2.5 bg-purple-500 rounded-full" 
                                                />
                                            ))}
                                        </div>
                                    ) : status === "LISTENING" ? (
                                        <div className="relative flex items-center justify-center w-16 h-16">
                                            <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-30 animate-ping"></span>
                                            <span className="relative inline-flex rounded-full h-8 w-8 bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.7)]"></span>
                                        </div>
                                    ) : status === "THINKING..." || status === "PROCESSING AUDIO" ? (
                                        <div className="flex items-center gap-2">
                                            <span className="w-3.5 h-3.5 rounded-full bg-yellow-500 animate-bounce" style={{ animationDelay: '0ms' }}></span>
                                            <span className="w-3.5 h-3.5 rounded-full bg-yellow-500 animate-bounce" style={{ animationDelay: '150ms' }}></span>
                                            <span className="w-3.5 h-3.5 rounded-full bg-yellow-500 animate-bounce" style={{ animationDelay: '300ms' }}></span>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center gap-2 text-zinc-500">
                                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                                                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                                                <line x1="12" x2="12" y1="19" y2="22"/>
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
                    </section>
                </main>

            </div>
        </div>
    )
}

export default HomePage