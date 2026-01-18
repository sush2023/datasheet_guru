import React, { useState, useEffect, useRef } from 'react';

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
    // just return if input is empty
    if (inputMessage.trim() === '') return;

    const newUserMessage: ChatMessage = {
      id: Date.now(),
      text: inputMessage,
      sender: 'user',
    };

    // update the messages component's ChatMessage array
    setMessages((prevMessages) => [...prevMessages, newUserMessage]);

    // clear input field
    setInputMessage('');
    setLoading(true);

    // Rag pipeline call
    try {
      const response = await fetch('/api/query-datasheet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: inputMessage })
      });
      if (!response.ok) {
        throw new Error('Failed to get answer from da guru.');
      }
      const data = await response.json();

      // bot's message
      const botResponse: ChatMessage = {
        id: Date.now() + 1,
        text: data.answer,
        sender: 'bot',
      }
      setMessages((prevMessages) => [...prevMessages, botResponse])
    } catch (error) {
      console.error("Chat Error, ", error);
      const errorMessage: ChatMessage = {
        id: Date.now() + 1,
        text: `Sorry I can't seem to generate a proper answer with proper boonk gang knowledge right now: error: ${error}`,
        sender: 'bot',
      }
      setMessages((prevMessages) => [...prevMessages, errorMessage]);

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
