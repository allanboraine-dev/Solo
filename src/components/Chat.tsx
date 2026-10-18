"use client"

import { useState, useEffect, useRef } from 'react';
import { Send } from 'lucide-react';
import { getMessages, fetchTripMessages, saveMessage, subscribeToEvents, deduplicateMessages, type MockMessage } from '@/lib/mockBackend';
import { audioAlert } from '@/utils/audioAlert';

interface ChatProps {
  tripId: string;
  role: 'rider' | 'driver';
}

const DRIVER_QUICK_REPLIES = [
  "On my way 🚗",
  "Arrived outside 📍",
  "Waiting at gate",
  "Please share PIN 🔐",
];

const RIDER_QUICK_REPLIES = [
  "Coming out now 👋",
  "At the main gate 📍",
  "I see your vehicle",
  "Be there in 2 mins",
];

export default function Chat({ tripId, role }: ChatProps) {
  const [messages, setMessages] = useState<MockMessage[]>([]);
  const [input, setInput] = useState('');
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const quickReplies = role === 'driver' ? DRIVER_QUICK_REPLIES : RIDER_QUICK_REPLIES;

  useEffect(() => {
    // Prime audio context on chat component mount
    audioAlert.unlockMobileAudio(false);

    // Load initial messages from local cache first
    setMessages(deduplicateMessages(getMessages(tripId)));

    // Fetch from Postgres database
    fetchTripMessages(tripId).then(dbMessages => {
      if (dbMessages && dbMessages.length > 0) {
        setMessages(prev => deduplicateMessages([...prev, ...dbMessages]));
      }
    });

    // Subscribe to new messages with strict deduplication & sound notification
    const unsubscribe = subscribeToEvents((type, payload) => {
      if (type === 'new_message') {
        const msg = payload as MockMessage;
        if (msg.trip_id === tripId) {
          setMessages(prev => deduplicateMessages([...prev, msg]));
          if (msg.sender !== role) {
            audioAlert.alertOfNewMessage(msg, role);
          }
        }
      }
    });

    return () => unsubscribe();
  }, [tripId, role]);

  // Scroll ONLY the internal chat container, never hijacking the parent mobile sheet scroll!
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const sendText = (rawText: string) => {
    const trimmed = rawText.trim();
    if (!trimmed) return;

    const msgId = typeof crypto !== 'undefined' && crypto.randomUUID 
      ? crypto.randomUUID() 
      : `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    const msg: MockMessage = {
      id: msgId,
      trip_id: tripId,
      sender: role,
      text: trimmed,
      timestamp: Date.now()
    };

    saveMessage(msg);
    setInput('');
  };

  const handleSend = () => {
    sendText(input);
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-zinc-950 rounded-2xl overflow-hidden">
      {/* Scrollable Message History (isolated scroll container) */}
      <div
        ref={scrollContainerRef}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain custom-scrollbar p-3 space-y-2"
      >
        {messages.length === 0 && (
          <p className="text-center text-xs text-gray-400 dark:text-gray-500 py-4">
            No messages yet. Tap a quick reply below or type a message to the {role === 'rider' ? 'driver' : 'rider'}.
          </p>
        )}
        {messages.map(m => {
          const isMe = m.sender === role;
          return (
            <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[84%] px-3 py-2 rounded-2xl text-xs sm:text-sm leading-snug shadow-2xs ${
                  isMe
                    ? 'bg-blue-600 text-white rounded-br-xs font-medium'
                    : 'bg-gray-100 dark:bg-zinc-800 text-gray-900 dark:text-gray-100 rounded-bl-xs'
                }`}
              >
                {m.text}
              </div>
            </div>
          );
        })}
      </div>

      {/* 1-Tap Mobile Quick-Reply Chips (Zero typing needed while moving) */}
      <div className="px-2.5 py-1.5 bg-gray-50/90 dark:bg-zinc-900/90 border-t border-gray-200/70 dark:border-zinc-800 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
        {quickReplies.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => sendText(chip)}
            className="shrink-0 px-2.5 py-1 rounded-full bg-white dark:bg-zinc-800 hover:bg-blue-50 dark:hover:bg-blue-950/50 border border-gray-200 dark:border-zinc-700 text-[11px] font-semibold text-gray-700 dark:text-gray-200 active:scale-95 transition whitespace-nowrap"
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Keyboard-Friendly Input Bar (Always fully displayed & pinned) */}
      <div className="p-2 sm:p-2.5 border-t border-gray-200 dark:border-zinc-800 bg-gray-50/95 dark:bg-zinc-900/95 backdrop-blur-md flex items-center gap-2 shrink-0 z-20">
        <input 
          ref={inputRef}
          type="text" 
          value={input}
          onChange={e => setInput(e.target.value)}
          onFocus={() => {
            setTimeout(() => {
              inputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 150);
          }}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder={`Message ${role === 'rider' ? 'driver' : 'rider'}...`}
          className="flex-1 min-w-0 px-3 py-2.5 text-base sm:text-sm border border-gray-300 dark:border-zinc-700 rounded-xl bg-white dark:bg-black outline-none focus:border-blue-500 text-gray-900 dark:text-white"
        />
        <button 
          type="button"
          onClick={handleSend}
          disabled={!input.trim()}
          className="px-3.5 sm:px-4 py-2.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-bold disabled:opacity-40 shrink-0 flex items-center justify-center gap-1.5 active:scale-95 transition min-w-[76px] h-10 shadow-sm whitespace-nowrap cursor-pointer touch-manipulation"
          title="Send message"
        >
          <Send size={15} className="shrink-0" />
          <span className="shrink-0 font-bold">Send</span>
        </button>
      </div>
    </div>
  );
}
