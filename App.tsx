import React, { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, LiveSession, LiveServerMessage, Modality, Blob } from '@google/genai';
import { CallState, TranscriptMessage, CrmLead } from './types';
import { MODEL_NAME, SYSTEM_INSTRUCTION, CREATE_CRM_LEAD_FUNCTION } from './constants';
import { StatusIndicator } from './components/StatusIndicator';
import { TranscriptDisplay } from './components/TranscriptDisplay';
import { CrmLog } from './components/CrmLog';
import { PhoneIcon, StopIcon } from './components/icons';

// --- Mock CRM Service ---
// In a real app, this would be an API call to Salesforce, HubSpot, etc.
async function createCrmLeadInCrm(lead: { fullName: string; phoneNumber: string; email: string }): Promise<{ success: boolean; leadId: string }> {
    console.log(`[CRM] Creating lead for "SpaNearMe | USA | @SpaNearMe"`);
    console.log(`[CRM] Lead details:`, lead);
    await new Promise(resolve => setTimeout(resolve, 500)); // Simulate network delay
    const leadId = `lead_${Date.now()}`;
    console.log(`[CRM] Successfully created lead with ID: ${leadId}`);
    return { success: true, leadId };
}

// --- Audio Encoding/Decoding utilities ---
function encode(bytes: Uint8Array): string {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function decode(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

async function decodeAudioData(
    data: Uint8Array,
    ctx: AudioContext,
    sampleRate: number,
    numChannels: number,
): Promise<AudioBuffer> {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

    for (let channel = 0; channel < numChannels; channel++) {
        const channelData = buffer.getChannelData(channel);
        for (let i = 0; i < frameCount; i++) {
            channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
        }
    }
    return buffer;
}


export default function App() {
    const [callState, setCallState] = useState<CallState>(CallState.IDLE);
    const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
    const [crmLeads, setCrmLeads] = useState<CrmLead[]>([]);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const sessionPromiseRef = useRef<Promise<LiveSession> | null>(null);
    const audioInfrastructureRef = useRef<{
        stream: MediaStream;
        inputAudioContext: AudioContext;
        outputAudioContext: AudioContext;
        processor: ScriptProcessorNode;
        inputSource: MediaStreamAudioSourceNode;
        outputSources: Set<AudioBufferSourceNode>;
        nextStartTime: number;
    } | null>(null);

    const updateTranscript = useCallback((speaker: 'user' | 'bot', text: string, isFinal: boolean) => {
        setTranscript(prev => {
            const newTranscript = [...prev];
            const lastMessage = newTranscript[newTranscript.length - 1];

            if (lastMessage && lastMessage.speaker === speaker && !lastMessage.isFinal) {
                lastMessage.text = text;
                lastMessage.isFinal = isFinal;
            } else {
                newTranscript.push({ speaker, text, isFinal });
            }
            return newTranscript;
        });
    }, []);

    const handleCallEnd = useCallback(() => {
        if (sessionPromiseRef.current) {
            sessionPromiseRef.current.then(session => {
                session.close();
            }).catch(console.error);
        }

        if (audioInfrastructureRef.current) {
            audioInfrastructureRef.current.stream.getTracks().forEach(track => track.stop());
            audioInfrastructureRef.current.processor.disconnect();
            audioInfrastructureRef.current.inputSource.disconnect();
            audioInfrastructureRef.current.inputAudioContext.close().catch(console.error);
            audioInfrastructureRef.current.outputAudioContext.close().catch(console.error);
            audioInfrastructureRef.current.outputSources.forEach(s => s.stop());
        }
        
        sessionPromiseRef.current = null;
        audioInfrastructureRef.current = null;
        setCallState(CallState.ENDED);
    }, []);

    const handleMessage = useCallback(async (message: LiveServerMessage) => {
        // Handle Server Content (transcripts, audio, interruptions)
        if (message.serverContent) {
            if (message.serverContent.inputTranscription) {
                const { text, isFinal } = message.serverContent.inputTranscription;
                updateTranscript('user', text, isFinal);
            }
            if (message.serverContent.outputTranscription) {
                const { text, isFinal } = message.serverContent.outputTranscription;
                updateTranscript('bot', text, isFinal);
            }

            const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audioData && audioInfrastructureRef.current) {
                const infra = audioInfrastructureRef.current;
                infra.nextStartTime = Math.max(infra.nextStartTime, infra.outputAudioContext.currentTime);
                const audioBuffer = await decodeAudioData(decode(audioData), infra.outputAudioContext, 24000, 1);
                const source = infra.outputAudioContext.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(infra.outputAudioContext.destination);
                source.addEventListener('ended', () => { infra.outputSources.delete(source); });
                source.start(infra.nextStartTime);
                infra.nextStartTime += audioBuffer.duration;
                infra.outputSources.add(source);
            }

            if (message.serverContent.interrupted && audioInfrastructureRef.current) {
                 audioInfrastructureRef.current.outputSources.forEach(s => s.stop());
                 audioInfrastructureRef.current.outputSources.clear();
                 audioInfrastructureRef.current.nextStartTime = 0;
            }
        }

        // Handle Tool Calls (Function Calling)
        if (message.toolCall) {
            for (const fc of message.toolCall.functionCalls) {
                if (fc.name === 'createCrmLead' && fc.args) {
                    const { fullName, phoneNumber, email } = fc.args;
                    if (typeof fullName === 'string' && typeof phoneNumber === 'string' && typeof email === 'string') {
                        createCrmLeadInCrm({ fullName, phoneNumber, email }).then(() => {
                            setCrmLeads(prev => [...prev, { fullName, phoneNumber, email, timestamp: new Date().toLocaleTimeString() }]);
                            if (sessionPromiseRef.current) {
                                sessionPromiseRef.current.then(session => {
                                    session.sendToolResponse({
                                        functionResponses: { id : fc.id, name: fc.name, response: { result: "Lead created successfully." } }
                                    });
                                });
                            }
                        });
                    }
                }
            }
        }
    }, [updateTranscript]);


    const handleStartCall = useCallback(async () => {
        setTranscript([]);
        setCrmLeads([]);
        setErrorMessage(null);
        setCallState(CallState.CONNECTING);

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            const inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
            const outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            
            const inputSource = inputAudioContext.createMediaStreamSource(stream);
            const processor = inputAudioContext.createScriptProcessor(4096, 1, 1);

            audioInfrastructureRef.current = {
                stream, inputAudioContext, outputAudioContext, processor, inputSource,
                outputSources: new Set(),
                nextStartTime: 0,
            };

            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

            sessionPromiseRef.current = ai.live.connect({
                model: MODEL_NAME,
                config: {
                    responseModalities: [Modality.AUDIO],
                    inputAudioTranscription: {},
                    outputAudioTranscription: {},
                    systemInstruction: SYSTEM_INSTRUCTION,
                    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
                    tools: [{ functionDeclarations: [CREATE_CRM_LEAD_FUNCTION] }],
                },
                callbacks: {
                    onopen: () => {
                        setCallState(CallState.ACTIVE);
                        processor.onaudioprocess = (e) => {
                            const inputData = e.inputBuffer.getChannelData(0);
                            const l = inputData.length;
                            const int16 = new Int16Array(l);
                            for (let i = 0; i < l; i++) { int16[i] = inputData[i] * 32768; }
                            const pcmBlob: Blob = {
                                data: encode(new Uint8Array(int16.buffer)),
                                mimeType: 'audio/pcm;rate=16000',
                            };
                            if (sessionPromiseRef.current) {
                                sessionPromiseRef.current.then(session => {
                                    session.sendRealtimeInput({ media: pcmBlob });
                                });
                            }
                        };
                        inputSource.connect(processor);
                        processor.connect(inputAudioContext.destination);
                    },
                    onmessage: handleMessage,
                    onclose: () => handleCallEnd(),
                    onerror: (e) => {
                        console.error('Session error:', e);
                        setErrorMessage("An error occurred during the call. Please try again.");
                        setCallState(CallState.ERROR);
                        handleCallEnd();
                    },
                },
            });

        } catch (error) {
            console.error('Failed to start call:', error);
            setErrorMessage('Could not access microphone. Please check permissions and try again.');
            setCallState(CallState.ERROR);
        }
    }, [handleCallEnd, handleMessage]);

    useEffect(() => {
        // Cleanup on component unmount
        return () => { handleCallEnd(); };
    }, [handleCallEnd]);

    const CallButton = () => {
        const isCalling = callState === CallState.ACTIVE || callState === CallState.CONNECTING;
        const isDisabled = callState === CallState.CONNECTING;
        return (
            <button
                onClick={isCalling ? handleCallEnd : handleStartCall}
                disabled={isDisabled}
                className={`flex items-center justify-center space-x-3 px-8 py-4 rounded-full font-semibold text-white transition-all duration-300 ease-in-out shadow-lg hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-900 ${
                    isCalling 
                        ? 'bg-red-500 hover:bg-red-600 focus:ring-red-500' 
                        : 'bg-green-500 hover:bg-green-600 focus:ring-green-500'
                } ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
                {isCalling ? <StopIcon className="w-6 h-6"/> : <PhoneIcon className="w-6 h-6"/>}
                <span className="text-lg">{isCalling ? 'End Call' : 'Start Call'}</span>
            </button>
        );
    };


    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 flex flex-col font-sans">
            <header className="p-4 border-b border-gray-200 dark:border-gray-700">
                <div className="container mx-auto flex justify-between items-center">
                    <h1 className="text-xl font-bold tracking-tight text-rose-800 dark:text-rose-300">
                        Spa Near Me
                        <span className="font-light text-gray-500 dark:text-gray-400"> | Virtual Receptionist</span>
                    </h1>
                </div>
            </header>

            <main className="flex-grow container mx-auto p-4 flex flex-col max-w-4xl w-full">
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md flex flex-col flex-grow">
                    <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                        <StatusIndicator state={errorMessage ? CallState.ERROR : callState} />
                    </div>
                    
                    <TranscriptDisplay transcript={transcript} />
                    
                    <CrmLog leads={crmLeads} />

                    {errorMessage && (
                        <div className="p-4 text-center text-red-500 bg-red-50 dark:bg-red-900/20 border-t border-gray-200 dark:border-gray-700">
                           {errorMessage}
                        </div>
                    )}
                </div>

                <footer className="py-6 flex justify-center items-center">
                    <CallButton />
                </footer>
            </main>
        </div>
    );
}