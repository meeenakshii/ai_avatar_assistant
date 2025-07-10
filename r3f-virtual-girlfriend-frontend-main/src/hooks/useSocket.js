// hooks/useSocket.js
import { io } from "socket.io-client";

// Connect directly to Python backend
export const socket = io("http://localhost:8001"); // Not 3000 anymore!
