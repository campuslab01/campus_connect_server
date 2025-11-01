const { Server } = require('socket.io');

let io;

const initializeSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || '*',
      methods: ['GET', 'POST'],
      credentials: true
    },
    transports: ['websocket', 'polling']
  });

  // Authentication middleware for Socket.io
  io.use((socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return next(new Error('Authentication error: No token provided'));
    }

    // Verify token (you'll need to import jwt here)
    const jwt = require('jsonwebtoken');
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId || decoded.id;
      socket.username = decoded.name || decoded.username;
      next();
    } catch (err) {
      next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`✅ User connected: ${socket.userId} (${socket.id})`);

    // Join user's personal room for notifications
    socket.join(`user:${socket.userId}`);

    // Handle joining a chat room
    socket.on('join:chat', (chatId) => {
      socket.join(`chat:${chatId}`);
      console.log(`User ${socket.userId} joined chat ${chatId}`);
      
      // Notify others in the chat
      socket.to(`chat:${chatId}`).emit('user:joined', {
        userId: socket.userId,
        username: socket.username,
        chatId
      });
    });

    // Handle leaving a chat room
    socket.on('leave:chat', (chatId) => {
      socket.leave(`chat:${chatId}`);
      console.log(`User ${socket.userId} left chat ${chatId}`);
    });

    // Handle new message
    socket.on('message:send', async (data) => {
      const { chatId, content, messageId } = data;
      
      // Emit to all users in the chat room (including sender for confirmation)
      io.to(`chat:${chatId}`).emit('message:new', {
        id: messageId || Date.now(),
        chatId,
        content,
        sender: {
          id: socket.userId,
          name: socket.username
        },
        createdAt: new Date().toISOString(),
        isOwn: false // Will be set on client side based on userId
      });

      // Update last message for chat list
      io.to(`user:${socket.userId}`).emit('chat:updated', {
        chatId,
        lastMessage: content,
        lastMessageAt: new Date().toISOString()
      });
    });

    // Handle typing indicators
    socket.on('typing:start', (data) => {
      const { chatId } = data;
      socket.to(`chat:${chatId}`).emit('typing:start', {
        userId: socket.userId,
        username: socket.username,
        chatId
      });
    });

    socket.on('typing:stop', (data) => {
      const { chatId } = data;
      socket.to(`chat:${chatId}`).emit('typing:stop', {
        userId: socket.userId,
        chatId
      });
    });

    // Handle read receipts
    socket.on('message:read', (data) => {
      const { chatId, messageIds } = data;
      socket.to(`chat:${chatId}`).emit('message:read', {
        userId: socket.userId,
        chatId,
        messageIds
      });
    });

    // Handle new match notification
    socket.on('match:new', (data) => {
      const { matchedUserId } = data;
      // Notify both users about the match
      io.to(`user:${socket.userId}`).emit('match:new', data);
      io.to(`user:${matchedUserId}`).emit('match:new', data);
    });

    // Handle new like notification
    socket.on('like:new', (data) => {
      const { likedUserId } = data;
      io.to(`user:${likedUserId}`).emit('like:new', {
        userId: socket.userId,
        username: socket.username,
        ...data
      });
    });

    // Handle new confession notification
    socket.on('confession:new', (data) => {
      // Broadcast to all connected users (or filter by college/interests)
      io.emit('confession:new', data);
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`❌ User disconnected: ${socket.userId} (${socket.id})`);
    });
  });

  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized. Call initializeSocket first.');
  }
  return io;
};

module.exports = {
  initializeSocket,
  getIO
};

