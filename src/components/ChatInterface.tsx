import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';

interface ChatMessage {
  id: number;
  text: string;
  sender: 'user' | 'bot';
}

const ChatInterface: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const messageEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Scroll to the bottom every time messages update
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async () => {
    if (inputMessage.trim() === '') return;

    const newUserMessage: ChatMessage = {
      id: messages.length + 1,
      text: inputMessage,
      sender: 'user',
    };
    setMessages((prevMessages) => [...prevMessages, newUserMessage]);
    const currentInput = inputMessage;
    setInputMessage('');
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("query-datasheet", {
        body: { query: currentInput },
      });

      if (error) {
        throw new Error(`Function invocation failed: ${error.message}`);
      }

      const botResponse: ChatMessage = {
        id: messages.length + 2,
        text: data.answer || "Sorry, I couldn't get a response.",
        sender: 'bot',
      };
      setMessages((prevMessages) => [...prevMessages, botResponse]);

    } catch (error) {
      console.error(error);
      const errorResponse: ChatMessage = {
        id: messages.length + 2,
        text: "Sorry, something went wrong. Please check the function logs.",
        sender: 'bot',
      };
      setMessages((prevMessages) => [...prevMessages, errorResponse]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="chat-container">
      <div className="message-area">
        {messages.map((message) => (
          <div key={message.id} className={`message ${message.sender}`}>
            <div className="message-bubble">
              {message.text}
            </div>
          </div>
        ))}
        <div ref={messageEndRef} />
      </div>
      <div className="chat-input-area">
        <input
          type="text"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyPress={(e) => {
            if (e.key === 'Enter' && !loading) {
              handleSendMessage();
            }
          }}
          placeholder="Ask a question about the datasheets..."
          disabled={loading}
        />
        <button onClick={handleSendMessage} disabled={loading || inputMessage.trim() === ''}>
          {loading ? 'Thinking...' : 'Send'}
        </button>
      </div>
    </div>
  );
};

export default ChatInterface;
