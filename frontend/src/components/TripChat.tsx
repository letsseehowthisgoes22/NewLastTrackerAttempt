import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { getMessages, Message, getTrip, takeoverChat, releaseChat } from '../api/trips';
import { useAuth } from '../context/AuthContext';

interface TripChatProps {
  tripId: number;
}

const TripChat: React.FC<TripChatProps> = ({ tripId }) => {
  const { token, user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<Array<{user_id: number, name: string}>>([]);
  const [connected, setConnected] = useState(false);
  const [chatTakenOver, setChatTakenOver] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentUserRole = user?.role || '';
  const WS_URL = import.meta.env.VITE_WS_URL || 'http://10.201.82.252:8000';

  useEffect(() => {
    if (!token || !tripId) return;

    const socket = io(WS_URL, {
      transports: ['websocket', 'polling']
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('WebSocket connected');
      setConnected(true);
      
      socket.emit('subscribe_trip', {
        trip_id: tripId,
        token: token
      });
    });

    socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
      setConnected(false);
    });

    socket.on('subscribed', (data) => {
      console.log('Subscribed to trip:', data.trip_id);
    });

    socket.on('new_message', (message: any) => {
      console.log('New message received:', message);
      const formattedMessage: Message = {
        id: message.id,
        sender: message.sender,
        message: message.message,
        sent_at: message.sent_at,
        read: message.read,
        is_mine: message.sender.id === parseInt(localStorage.getItem('user_id') || '0')
      };
      setMessages(prev => [...prev, formattedMessage]);
      scrollToBottom();
      
      if (!formattedMessage.is_mine) {
        socket.emit('mark_messages_read', {
          trip_id: tripId,
          token: token
        });
      }
    });

    socket.on('typing_status', (data: { trip_id: number, typing_users: Array<{user_id: number, name: string}> }) => {
      const currentUserId = parseInt(localStorage.getItem('user_id') || '0');
      const filteredTypingUsers = data.typing_users.filter(u => u.user_id !== currentUserId);
      setTypingUsers(filteredTypingUsers);
    });

    socket.on('messages_read', () => {
      setMessages(prev => prev.map(msg => ({
        ...msg,
        read: true
      })));
    });

    socket.on('error', (data: { message: string }) => {
      console.error('WebSocket error:', data.message);
      setError(data.message);
    });

    socket.on('chat_takeover', (data: { trip_id: number, taken_over: boolean, admin_name?: string }) => {
      console.log('Chat takeover event:', data);
      setChatTakenOver(data.taken_over);
    });

    fetchInitialMessages();

    return () => {
      if (socketRef.current) {
        socketRef.current.emit('unsubscribe_trip', { trip_id: tripId });
        socketRef.current.disconnect();
      }
    };
  }, [tripId, token]);

  const fetchInitialMessages = async () => {
    if (!token) return;
    
    try {
      const data = await getMessages(token, tripId);
      setMessages(data.messages);
      scrollToBottom();
      
      if (socketRef.current && data.messages.length > 0) {
        socketRef.current.emit('mark_messages_read', {
          trip_id: tripId,
          token: token
        });
      }

      const trip = await getTrip(token, tripId);
      setChatTakenOver(trip.chat_admin_takeover || false);
    } catch (error: any) {
      console.error('Failed to fetch messages:', error);
      setError('Failed to load messages');
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newMessage.trim() || !token || !socketRef.current) return;

    setLoading(true);
    setError(null);
    
    try {
      socketRef.current.emit('send_message', {
        trip_id: tripId,
        message: newMessage,
        token: token
      });
      
      setNewMessage('');
      
      if (socketRef.current) {
        socketRef.current.emit('user_stopped_typing', {
          trip_id: tripId,
          token: token
        });
      }
    } catch (error: any) {
      console.error('Failed to send message:', error);
      setError('Failed to send message. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleTyping = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNewMessage(e.target.value);
    
    if (!socketRef.current || !token) return;
    
    socketRef.current.emit('user_typing', {
      trip_id: tripId,
      token: token
    });
    
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    typingTimeoutRef.current = setTimeout(() => {
      if (socketRef.current) {
        socketRef.current.emit('user_stopped_typing', {
          trip_id: tripId,
          token: token
        });
      }
    }, 3000);
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

  const handleTakeover = async () => {
    if (!token) return;
    
    try {
      await takeoverChat(token, tripId);
    } catch (error: any) {
      console.error('Failed to takeover chat:', error);
      setError('Failed to takeover chat. Please try again.');
    }
  };

  const handleRelease = async () => {
    if (!token) return;
    
    try {
      await releaseChat(token, tripId);
    } catch (error: any) {
      console.error('Failed to release chat:', error);
      setError('Failed to release chat. Please try again.');
    }
  };

  return (
    <div className="trip-chat">
      <div className="chat-header">
        <h3>💬 Trip Messages</h3>
        <span className={`chat-status ${connected ? 'connected' : 'disconnected'}`}>
          {connected ? '🟢 Connected' : '🔴 Disconnected'}
        </span>
      </div>

      {currentUserRole === 'admin' && (
        <div className="admin-chat-controls">
          {!chatTakenOver ? (
            <button onClick={handleTakeover} className="btn-takeover">
              Take Over Chat
            </button>
          ) : (
            <button onClick={handleRelease} className="btn-release">
              Release Chat
            </button>
          )}
        </div>
      )}

      {chatTakenOver && !['admin', 'agent'].includes(currentUserRole) && (
        <div className="chat-takeover-notice">
          ⚠️ An administrator is currently managing this conversation.
          Your messages are temporarily disabled.
        </div>
      )}

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
              {msg.read && msg.is_mine && (
                <span className="read-indicator">✓✓</span>
              )}
            </div>
          </div>
        ))}

        {typingUsers.length > 0 && (
          <div className="typing-indicator">
            {typingUsers.map(u => u.name).join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing
            <span className="typing-dots">
              <span>.</span><span>.</span><span>.</span>
            </span>
          </div>
        )}

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
          onChange={handleTyping}
          placeholder={
            chatTakenOver && !['admin', 'agent'].includes(currentUserRole)
              ? "Chat is under admin control..."
              : "Type a message..."
          }
          rows={2}
          disabled={loading || !connected || (chatTakenOver && !['admin', 'agent'].includes(currentUserRole))}
          onKeyPress={handleKeyPress}
        />
        <button type="submit" disabled={loading || !newMessage.trim() || !connected || (chatTakenOver && !['admin', 'agent'].includes(currentUserRole))}>
          {loading ? 'Sending...' : 'Send'}
        </button>
      </form>
    </div>
  );
};

export default TripChat;
