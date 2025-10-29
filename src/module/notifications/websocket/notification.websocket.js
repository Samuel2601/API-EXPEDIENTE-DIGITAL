// src/module/notifications/websocket/notification.websocket.js

import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import NotificationEvents from "../events/notification.events.js";

let io;

/**
 * Inicializar servidor WebSocket
 */
export function initializeWebSocket(server) {
  io = new Server(server, {
    cors: {
      origin: process.env.ALLOWED_ORIGINS?.split(",") || "*",
      credentials: true,
    },
    path: "/notifications",
  });

  // Middleware de autenticación
  io.use((socket, next) => {
    const token =
      socket.handshake.auth.token ||
      socket.handshake.headers.authorization?.split(" ")[1];
    //console.log("🔐 Autenticando usuario...", socket.handshake.headers);
    if (!token) {
      return next(new Error("Token de autenticación requerido"));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      //console.log("Token de autenticación válido:", decoded);
      socket.userId = decoded.sub;
      next();
    } catch (error) {
      next(new Error("Token inválido"));
    }
  });

  // Manejo de conexiones
  io.on("connection", (socket) => {
    console.log(`✅ Usuario conectado: ${socket.userId}`);

    // Unir al usuario a su sala personal
    socket.join(`user:${socket.userId}`);

    // Confirmar conexión
    socket.emit("connected", {
      message: "Conectado al sistema de notificaciones",
      userId: socket.userId,
    });

    // Desconexión
    socket.on("disconnect", () => {
      console.log(`❌ Usuario desconectado: ${socket.userId}`);
    });
  });

  // Escuchar eventos de notificaciones y emitir por WebSocket
  setupNotificationListeners();

  console.log("🔌 WebSocket Server inicializado");
  return io;
}

/**
 * Configurar listeners de eventos
 */
function setupNotificationListeners() {
  // Nueva notificación creada
  NotificationEvents.on("notification:created", (data) => {
    const { recipientId, notification } = data;

    io.to(`user:${recipientId}`).emit("notification:new", notification);
    console.log(`📨 Notificación enviada a usuario ${recipientId}`);
  });

  // Notificación leída
  NotificationEvents.on("notification:read", (data) => {
    const { recipientId, notificationId } = data;

    io.to(`user:${recipientId}`).emit("notification:read", { notificationId });
  });

  // Múltiples notificaciones leídas
  NotificationEvents.on("notifications:bulkRead", (data) => {
    const { recipientId, notificationIds } = data;

    io.to(`user:${recipientId}`).emit("notifications:bulkRead", {
      notificationIds,
    });
  });

  // Todas las notificaciones leídas
  NotificationEvents.on("notifications:allRead", (data) => {
    const { recipientId } = data;

    io.to(`user:${recipientId}`).emit("notifications:allRead");
  });

  // Envío de email (puede ser manejado por otro servicio)
  NotificationEvents.on("notification:sendEmail", async (data) => {
    // Aquí puedes integrar con tu servicio de email
    console.log(`📧 Enviar email a usuario ${data.recipientId}`);
    // await emailService.send(...)
  });
}

/**
 * Emitir notificación a un usuario específico
 */
export function emitToUser(userId, event, data) {
  if (!io) {
    console.error("WebSocket no inicializado");
    return;
  }

  io.to(`user:${userId}`).emit(event, data);
}

/**
 * Emitir a múltiples usuarios
 */
export function emitToUsers(userIds, event, data) {
  if (!io) {
    console.error("WebSocket no inicializado");
    return;
  }

  userIds.forEach((userId) => {
    io.to(`user:${userId}`).emit(event, data);
  });
}

export { io };
