import React, { useState, useEffect, useRef } from 'react';
import { postMessage, getMessages, Message } from '../api/trips';
import { useAuth } from '../context/AuthContext';

interface TripChatProps {
  tripId: number;
}

const TripChat: React.FC<TripChatProps> = ({ tripId }) => {
  const { token } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (token && tripId) {
      fetchMessages();
    }
  }, [tripId, token]);

  const fetchMessages = async () => {
    if (!token) return;
    
    try {
      const data = await getMessages(token, tripId);
      setMessages(data.messages);
      scrollToBottom();
    } catch (error: any) {
      console.error('Failed to fetch messages:', error);
      setError('Failed to load messages');
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newMessage.trim() || !token) return;

    setLoading(true);
    setError(null);
    
    try {
      const sentMessage = await postMessage(token, tripId, newMessage);
      setMessages(prev => [...prev, sentMessage]);
      setNewMessage('');
      scrollToBottom();
    } catch (error: any) {
      console.error('Failed to send message:', error);
      if (error.response?.status === 429) {
        setError('Rate limit exceeded. Please wait a moment before sending more messages.');
      } else {
        setError('Failed to send message. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    if (diff < 86400000) {
      return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit'
      });
    } else if (diff < 604800000) {
      return date.toLocaleString('en-US', {
        weekday: 'short',
        hour: 'numeric',
        minute: '2-digit'
      });
    } else {
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(e as any);
    }
  };

  return (
    <div className="trip-chat">
      <div className="chat-header">
        <h3>💬 Trip Messages</h3>
      </div>

      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="no-messages">
            No messages yet. Start a conversation!
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`message ${msg.is_mine ? 'message-mine' : 'message-other'}`}
          >
            <div className="message-header">
              <span className="sender-name">
                {msg.sender.name}
              </span>
              <span className="sender-role">
                ({msg.sender.role})
              </span>
              <span className="message-time">
                {formatTime(msg.sent_at)}
              </span>
            </div>
            <div className="message-bubble">
              {msg.message}
            </div>
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      {error && (
        <div className="chat-error">
          {error}
        </div>
      )}

      <form className="chat-input" onSubmit={sendMessage}>
        <textarea
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Type a message..."
          rows={2}
          disabled={loading}
          onKeyPress={handleKeyPress}
        />
        <button type="submit" disabled={loading || !newMessage.trim()}>
          {loading ? 'Sending...' : 'Send'}
        </button>
      </form>
    </div>
  );
};

export default TripChat;
