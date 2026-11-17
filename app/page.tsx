'use client'

import React, { useState, useEffect, useRef } from 'react'
import { motion } from 'motion/react'
import OpenAI from 'openai'

const openai = new OpenAI({
    apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY,
    dangerouslyAllowBrowser: true
})

function HomePage() {
    const [status, setStatus] = useState<"READY" | "LISTENING" | "THINKING..." | "ERROR" | "UNSUPPORTED">("READY")
    const [transcript, setTranscript] = useState("")
    const [assistantResponse, setAssistantResponse] = useState<"" | string | null>("")

    const recognitionRef = useRef(null)
    const timerRef = useRef<any>(null) // Naya ref silence timer ke liye
    const transcriptRef = useRef("") // Naya ref latest transcript ko timer me bhejne ke liye

    const processWithLLM = async (userInput: string) => {
        if (!userInput.trim()) return

        setStatus("THINKING...")
        setAssistantResponse("Thinking...")

        try {
            const completion = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [{ role: "user", content: userInput }],
            })

            const reply = completion.choices[0].message.content
            setAssistantResponse(reply)
            setStatus("READY")

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
                transcriptRef.current = currentTranscript // Har word par ref update karo

                // Purana timer clear karo agar user aur bol raha hai
                if (timerRef.current) {
                    clearTimeout(timerRef.current)
                }

                // Naya 2-second ka timer lagao
                timerRef.current = setTimeout(() => {
                    if (transcriptRef.current.trim()) {
                        recognition.stop() // Mic band karo
                        processWithLLM(transcriptRef.current) // LLM ko call karo
                    }
                }, 2000) // 2000 milliseconds = 2 seconds ki silence
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

            // Start karne se pehle purane timers hata do
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

                <main className="w-full mb-5 flex items-center justify-between ">
                    <div className="flex flex-col items-center justify-center">
                        <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                            GORMO
                        </h1>
                        <p className="text-zinc-400 text-xs">AI Voice Agent</p>
                    </div>

                    <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 px-4 py-1.5 rounded-xl">
                        <span className={`w-3 h-3 rounded-full ${status === 'LISTENING' ? 'bg-red-500 animate-pulse' : status === 'THINKING...' ? 'bg-yellow-500 animate-bounce' : 'bg-green-500'}`}></span>
                        <span className="text-sm text-zinc-300">{status}</span>
                    </div>
                </main>

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

                            <div className="border border-zinc-800 bg-zinc-950 rounded-xl h-24 flex items-center justify-center mb-5">
                                <p className="text-zinc-500">Audio Player Component</p>
                            </div>

                            <div className="h-[450px] bg-zinc-950 rounded-xl p-4 overflow-y-auto border border-zinc-800">
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