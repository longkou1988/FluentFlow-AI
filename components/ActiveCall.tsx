import React, { useEffect, useRef, useState, useCallback } from 'react';
import { EnglishLevel, ChatMessage } from '../types';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { createAudioBlob, decode, decodeAudioData, blobToBase64 } from '../utils/mediaUtils';
import { Mic, MicOff, PhoneOff, Video, VideoOff, MessageSquare } from 'lucide-react';

interface ActiveCallProps {
  level: EnglishLevel;
  onEndCall: () => void;
}

const ActiveCall: React.FC<ActiveCallProps> = ({ level, onEndCall }) => {
  const [isConnecting, setIsConnecting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [transcripts, setTranscripts] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  // Refs for media management
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionRef = useRef<Promise<any> | null>(null); // Store promise to handle cleanup
  const cleanupRef = useRef<(() => void) | null>(null);

  // Helper to scroll transcript
  const transcriptContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (transcriptContainerRef.current) {
      transcriptContainerRef.current.scrollTop = transcriptContainerRef.current.scrollHeight;
    }
  }, [transcripts]);

  // Cleanup function
  const disconnect = useCallback(() => {
    if (cleanupRef.current) cleanupRef.current();
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (inputContextRef.current) {
      inputContextRef.current.close();
      inputContextRef.current = null;
    }

    if (sessionRef.current) {
      sessionRef.current.then(session => {
        try {
            session.close();
        } catch (e) {
            console.error("Error closing session", e);
        }
      });
      sessionRef.current = null;
    }
    
    setIsConnected(false);
  }, []);

  const startSession = async () => {
    try {
      setIsConnecting(true);
      setError(null);

      // 1. Get User Media
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true
      });
      streamRef.current = stream;

      // Update Video Element
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      // 2. Initialize Audio Contexts
      // Input: 16kHz for Gemini
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      inputContextRef.current = inputCtx;
      
      // Output: 24kHz for Gemini output
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      audioContextRef.current = outputCtx;

      // 3. Initialize Gemini Client
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      // Determine System Instruction based on Level
      const systemInstruction = `You are a helpful and friendly English language tutor. 
      The user's proficiency level is ${level}. 
      Engage in a natural, spoken conversation. 
      If the user makes a significant mistake, gently correct them, but prioritize flow. 
      Be encouraging. Keep your responses relatively concise suitable for voice conversation.`;

      // 4. Connect to Live API
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
          },
          systemInstruction: systemInstruction,
          // Correct configuration: empty objects to enable transcription
          inputAudioTranscription: {}, 
          outputAudioTranscription: {}, 
        },
        callbacks: {
          onopen: () => {
            console.log("Gemini Live Session Opened");
            setIsConnecting(false);
            setIsConnected(true);

            // --- Audio Input Setup ---
            const source = inputCtx.createMediaStreamSource(stream);
            const processor = inputCtx.createScriptProcessor(4096, 1, 1);
            
            processor.onaudioprocess = (e) => {
              if (isMuted) return; 
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createAudioBlob(inputData);
              
              sessionPromise.then(session => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };

            source.connect(processor);
            processor.connect(inputCtx.destination);

            // --- Video Input Setup ---
            const intervalId = window.setInterval(() => {
              if (!isVideoEnabled || !videoRef.current || !canvasRef.current) return;
              
              const canvas = canvasRef.current;
              const video = videoRef.current;
              const ctx = canvas.getContext('2d');
              
              if (ctx && video.videoWidth > 0) {
                canvas.width = video.videoWidth * 0.25; 
                canvas.height = video.videoHeight * 0.25;
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                
                canvas.toBlob(async (blob) => {
                  if (blob) {
                    const base64Data = await blobToBase64(blob);
                    sessionPromise.then(session => {
                      session.sendRealtimeInput({
                        media: {
                          mimeType: 'image/jpeg',
                          data: base64Data
                        }
                      });
                    });
                  }
                }, 'image/jpeg', 0.6);
              }
            }, 1000); 

            cleanupRef.current = () => {
              clearInterval(intervalId);
              source.disconnect();
              processor.disconnect();
            };
          },
          onmessage: async (message: LiveServerMessage) => {
            const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioData && audioContextRef.current) {
              const ctx = audioContextRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              
              const audioBuffer = await decodeAudioData(
                decode(audioData),
                ctx,
                24000,
                1
              );
              
              const source = ctx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(ctx.destination);
              
              source.onended = () => {
                sourcesRef.current.delete(source);
              };
              
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              sourcesRef.current.add(source);
            }

            if (message.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => s.stop());
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }

            const inputTx = message.serverContent?.inputTranscription?.text;
            const outputTx = message.serverContent?.outputTranscription?.text;
            const turnComplete = message.serverContent?.turnComplete;

            if (inputTx || outputTx) {
               setTranscripts(prev => {
                 const newTranscripts = [...prev];
                 
                 if (inputTx) {
                   const lastMsg = newTranscripts.length > 0 ? newTranscripts[newTranscripts.length - 1] : null;
                   if (lastMsg && lastMsg.role === 'user' && lastMsg.isPartial) {
                     lastMsg.text += inputTx;
                   } else {
                     newTranscripts.push({
                       id: Date.now().toString() + '-user',
                       role: 'user',
                       text: inputTx,
                       isPartial: true
                     });
                   }
                 }

                 if (outputTx) {
                    const lastMsg = newTranscripts.length > 0 ? newTranscripts[newTranscripts.length - 1] : null;
                    if (lastMsg && lastMsg.role === 'model' && lastMsg.isPartial) {
                      lastMsg.text += outputTx;
                    } else {
                      newTranscripts.push({
                        id: Date.now().toString() + '-ai',
                        role: 'model',
                        text: outputTx,
                        isPartial: true
                      });
                    }
                 }
                 
                 if (turnComplete && newTranscripts.length > 0) {
                   newTranscripts[newTranscripts.length - 1].isPartial = false;
                 }
                 
                 return newTranscripts;
               });
            }
          },
          onclose: () => {
            console.log("Session closed");
            setIsConnected(false);
          },
          onerror: (err) => {
            console.error("Session error", err);
            setError("Connection error occurred. Please try again.");
            setIsConnecting(false);
          }
        }
      });
      
      sessionRef.current = sessionPromise;

    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to start session");
      setIsConnecting(false);
    }
  };

  useEffect(() => {
    startSession();
    return () => {
      disconnect();
    };
  }, []); 

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  const toggleVideo = () => {
    setIsVideoEnabled(!isVideoEnabled);
    if (streamRef.current) {
      streamRef.current.getVideoTracks().forEach(track => {
        track.enabled = !isVideoEnabled;
      });
    }
  };

  const handleHangup = () => {
    disconnect();
    onEndCall();
  };

  return (
    <div className="flex flex-col h-screen bg-slate-900 relative">
      <canvas ref={canvasRef} className="hidden" />

      <div className="flex-1 flex flex-col md:flex-row h-full overflow-hidden p-4 gap-4">
        
        <div className="flex-1 flex flex-col items-center justify-center relative bg-black rounded-3xl overflow-hidden shadow-2xl border border-slate-800">
          <video 
            ref={videoRef} 
            className={`w-full h-full object-cover transform scale-x-[-1] ${!isVideoEnabled ? 'opacity-0' : 'opacity-100'}`} 
            muted 
            playsInline 
          />
          
          {!isVideoEnabled && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-24 h-24 rounded-full bg-slate-800 flex items-center justify-center">
                <VideoOff className="w-10 h-10 text-slate-500" />
              </div>
            </div>
          )}

          {isConnecting && (
            <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-10">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500 mx-auto mb-4"></div>
                <p className="text-indigo-400 font-medium">Connecting to Gemini Live...</p>
              </div>
            </div>
          )}
          
          {error && (
             <div className="absolute inset-0 bg-black/90 flex items-center justify-center z-20 px-6">
              <div className="text-center">
                <p className="text-red-500 mb-4">{error}</p>
                <button 
                  onClick={onEndCall}
                  className="px-6 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-white transition-colors"
                >
                  Return Home
                </button>
              </div>
            </div>
          )}

          {isConnected && (
            <div className="absolute top-6 left-6 flex items-center gap-2 bg-black/50 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
              <span className="text-xs font-medium text-white tracking-wide uppercase">Live</span>
            </div>
          )}
          
           <div className="absolute top-6 right-6 flex items-center gap-2 bg-black/50 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
              <span className="text-xs font-medium text-slate-300">{level} Level</span>
            </div>
        </div>

        <div className="w-full md:w-96 flex flex-col bg-slate-800/50 rounded-3xl border border-slate-700/50 overflow-hidden backdrop-blur-sm">
          <div className="p-4 border-b border-slate-700/50 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-indigo-400" />
            <h2 className="text-sm font-semibold text-slate-200">Transcript</h2>
          </div>
          
          <div ref={transcriptContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
            {transcripts.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 text-sm">
                <p>Say "Hello" to start practicing!</p>
              </div>
            ) : (
              transcripts.map((msg, idx) => (
                <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div 
                    className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                      msg.role === 'user' 
                        ? 'bg-indigo-600 text-white rounded-br-none' 
                        : 'bg-slate-700 text-slate-200 rounded-bl-none'
                    }`}
                  >
                    {msg.text}
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 px-1 capitalize">
                    {msg.role === 'model' ? 'Tutor' : 'You'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="h-24 flex items-center justify-center gap-6 px-6">
        <button
          onClick={toggleVideo}
          className={`p-4 rounded-full transition-all duration-200 ${
            isVideoEnabled ? 'bg-slate-800 hover:bg-slate-700 text-white' : 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
          }`}
          title={isVideoEnabled ? "Turn camera off" : "Turn camera on"}
        >
          {isVideoEnabled ? <Video className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
        </button>

        <button
          onClick={handleHangup}
          className="p-5 rounded-full bg-red-500 hover:bg-red-600 text-white shadow-lg hover:shadow-red-500/25 transition-all duration-200 transform hover:scale-105"
          title="End Call"
        >
          <PhoneOff className="w-8 h-8" />
        </button>

        <button
          onClick={toggleMute}
          className={`p-4 rounded-full transition-all duration-200 ${
            !isMuted ? 'bg-slate-800 hover:bg-slate-700 text-white' : 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
          }`}
          title={isMuted ? "Unmute" : "Mute"}
        >
          {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
        </button>
      </div>
    </div>
  );
};

export default ActiveCall;