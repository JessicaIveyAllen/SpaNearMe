
import React, { useRef, useEffect } from 'react';
import { TranscriptMessage } from '../types';
import { MicrophoneIcon } from './icons';

interface TranscriptDisplayProps {
  transcript: TranscriptMessage[];
}

export const TranscriptDisplay: React.FC<TranscriptDisplayProps> = ({ transcript }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript]);

  if (transcript.length === 0) {
    return (
        <div className="flex-grow flex flex-col items-center justify-center text-center p-4">
            <MicrophoneIcon className="w-16 h-16 text-gray-300 dark:text-gray-600 mb-4" />
            <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-300">Call Transcript</h2>
            <p className="text-gray-500 dark:text-gray-400">Your conversation will appear here.</p>
        </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex-grow p-4 md:p-6 space-y-4 overflow-y-auto">
      {transcript.map((msg, index) => (
        <div key={index} className={`flex items-end gap-3 ${msg.speaker === 'user' ? 'justify-end' : 'justify-start'}`}>
          {msg.speaker === 'bot' && (
            <div className="w-8 h-8 rounded-full bg-rose-200 dark:bg-rose-800 flex items-center justify-center text-rose-700 dark:text-rose-200 font-bold text-sm flex-shrink-0">
                SN
            </div>
          )}
          <div
            className={`max-w-xs md:max-w-md lg:max-w-lg px-4 py-2 rounded-2xl ${
              msg.speaker === 'user'
                ? 'bg-blue-500 text-white rounded-br-none'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-bl-none'
            } ${!msg.isFinal ? 'opacity-70' : ''}`}
          >
            <p className="text-sm">{msg.text}</p>
          </div>
        </div>
      ))}
    </div>
  );
};
