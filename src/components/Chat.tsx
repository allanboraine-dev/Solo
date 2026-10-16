"use client"

import { useState, useEffect, useRef } from 'react';
import { getMessages, fetchTripMessages, saveMessage, subscribeToEvents, deduplicateMessages, type MockMessage } from '@/lib/mockBackend';

interface ChatProps {
  tripId: string;
  role: 'rider' | 'driver';
}

export default function Chat({ tripId, role }: ChatProps) {
  const [messages, setMessages] = useState<MockMessage[]>([]);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Load initial messages from local cache first
    setMessages(deduplicateMessages(getMessages(tripId)));

    // Fetch from Postgres database
    fetchTripMessages(tripId).then(dbMessages => {
      if (dbMessages && dbMessages.length > 0) {
        setMessages(prev => deduplicateMessages([...prev, ...dbMessages]));
      }
    });

    // Subscribe to new messages with strict deduplication
    const unsubscribe = subscribeToEvents((type, payload) => {
      if (type === 'new_message') {
        const msg = payload as MockMessage;
        if (msg.trip_id === tripId) {
          setMessages(prev => deduplicateMessages([...prev, msg]));
        }
      }
    });

    return () => unsubscribe();
  }, [tripId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;

    const msgId = typeof crypto !== 'undefined' && crypto.randomUUID 
      ? crypto.randomUUID() 
      : `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    const msg: MockMessage = {
      id: msgId,
      trip_id: tripId,
      sender: role,
      text: input.trim(),
      timestamp: Date.now()
    };

    saveMessage(msg);
    setInput('');
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-black rounded-lg">
      <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-2.5 md:space-y-3 min-h-[110px] md:min-h-[150px]">
        {messages.length === 0 && (
          <p className="text-center text-xs md:text-sm text-gray-500 mt-2 md:mt-4">No messages yet. Send a message to the {role === 'rider' ? 'driver' : 'rider'}.</p>
        )}
        {messages.map(m => {
          const isMe = m.sender === role;
          return (
            <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[82%] p-2 rounded-lg text-xs md:text-sm ${isMe ? 'bg-blue-600 text-white rounded-br-none' : 'bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-none'}`}>
                {m.text}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>
      <div className="p-2 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-zinc-900 flex gap-2">
        <input 
          type="text" 
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder="Type a message..."
          className="flex-1 p-2 text-base sm:text-sm border border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-black outline-none focus:border-blue-500"
        />
        <button 
          onClick={handleSend}
          disabled={!input.trim()}
          className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs md:text-sm font-bold disabled:opacity-50 shrink-0"
        >
          Send
        </button>
      </div>
    </div>
  );
}
