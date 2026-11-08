import { io } from 'socket.io-client';

// Use same-origin proxy in development/production or fallback to port 5000
const SOCKET_URL = window.location.origin.includes(':3000') 
  ? 'http://localhost:5000' 
  : window.location.origin;

export const socket = io(SOCKET_URL, {
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  transports: ['websocket', 'polling']
});

export default socket;

