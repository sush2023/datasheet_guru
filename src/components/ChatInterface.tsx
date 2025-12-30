import React, { useState } from 'react';
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

  const handleSendMessage = async () => {
    if (inputMessage.trim() === '') return;

    const newUserMessage: ChatMessage = {
      id: messages.length + 1,
      text: inputMessage,
      sender: 'user',
    };
    setMessages((prevMessages) => [...prevMessages, newUserMessage]);
    setInputMessage('');
    setLoading(true);

    try {
      // Use the Supabase client to invoke the Edge Function
      const { data, error } = await supabase.functions.invoke("query-datasheet", {
        body: { query: inputMessage },
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
        text: "Sorry, something went wrong. Please check the logs.",
        sender: 'bot',
      };
      setMessages((prevMessages) => [...prevMessages, errorResponse]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ border: '1px solid #ccc', padding: '10px', marginTop: '20px', height: '400px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flexGrow: 1, overflowY: 'auto', marginBottom: '10px' }}>
        {messages.map((message) => (
          <div key={message.id} style={{ textAlign: message.sender === 'user' ? 'right' : 'left', margin: '5px 0' }}>
            <span style={{ backgroundColor: message.sender === 'user' ? '#dcf8c6' : '#e0e0e0', padding: '8px', borderRadius: '10px', display: 'inline-block' }}>
              {message.text}
            </span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex' }}>
        <input
          type="text"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyPress={(e) => {
            if (e.key === 'Enter') {
              handleSendMessage();
            }
          }}
          placeholder="Ask a question..."
          style={{ flexGrow: 1, padding: '8px', marginRight: '10px' }}
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
