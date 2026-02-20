import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { supabase } from '../supabaseClient';

interface ChatMessage {
  id: number;
  text: string;
  sender: 'user' | 'bot';
}

interface ChatInterfaceProps {
  selectedFiles: string[];
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ selectedFiles }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationSummary, setConversationSummary] = useState<string>('');
  const [inputMessage, setInputMessage] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const messageEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Scroll to the bottom every time messages update
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async () => {
    // just return if input is empty
    if (inputMessage.trim() === '') return;

    const newUserMessage: ChatMessage = {
      id: Date.now(),
      text: inputMessage,
      sender: 'user',
    };

    // update the messages component's ChatMessage array
    setMessages((prevMessages) => [...prevMessages, newUserMessage]);

    // Prepare history (last 6 messages for short-term context)
    const chatHistory = messages.slice(-6).map(m => ({
      role: m.sender === 'user' ? 'user' : 'model',
      parts: [{ text: m.text }]
    }));

    // clear input field
    setInputMessage('');
    setLoading(true);

    // Create a placeholder message for the bot
    const botMessageId = Date.now() + 1;
    const botResponse: ChatMessage = {
      id: botMessageId,
      text: '', // Start empty
      sender: 'bot',
    };
    setMessages((prevMessages) => [...prevMessages, botResponse]);

    // Rag pipeline call
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/query-datasheet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ 
          query: inputMessage,
          history: chatHistory,
          conversationSummary: conversationSummary,
          selectedFiles: selectedFiles 
        })
      });

      if (!response.ok) {
        throw new Error('Failed to get answer from da guru.');
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      // Stream handling
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;
        
        // Process SSE messages
        const lines = buffer.split('\n');
        // Keep the last partial line in the buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim() === '') continue;
          
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6); // Remove "data: " prefix
            try {
              const data = JSON.parse(jsonStr);
              
              // Check for error sent from backend
              if (data.error) {
                throw new Error(data.error);
              }

              // Check for summary update sent from backend
              if (data.summary) {
                setConversationSummary(data.summary);
                continue;
              }

              // Extract text from Gemini response structure
              const newText = data.candidates?.[0]?.content?.parts?.[0]?.text;
              if (newText) {
                setMessages((prevMessages) => 
                  prevMessages.map(msg => 
                    msg.id === botMessageId 
                      ? { ...msg, text: msg.text + newText }
                      : msg
                  )
                );
              }
            } catch (e) {
              console.error('Error parsing SSE json', e);
            }
          }
        }
      }

    } catch (error: any) {
      console.error("Chat Error, ", error);
      // Update the bot message to show the error
      setMessages((prevMessages) => 
        prevMessages.map(msg => 
          msg.id === botMessageId
            ? { ...msg, text: `Sorry, I encountered an error: ${error.message}` }
            : msg
        )
      );
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
              {message.sender === 'bot' && loading && message.text === '' ? (
                <div className="typing-indicator">
                  <div className="typing-dot"></div>
                  <div className="typing-dot"></div>
                  <div className="typing-dot"></div>
                </div>
              ) : (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {message.text}
                </ReactMarkdown>
              )}
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
