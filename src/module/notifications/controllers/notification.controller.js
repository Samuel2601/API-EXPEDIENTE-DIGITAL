// src/module/notifications/controllers/notification.controller.js

import notificationService from "../services/notification.service.js";
import { asyncHandler } from "../../../utils/error.util.js";

class NotificationController {
  /**
   * GET /api/notifications
   * Obtener notificaciones del usuario actual
   */
  getMyNotifications = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const options = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 20,
      unreadOnly: req.query.unreadOnly === "true",
      type: req.query.type,
      priority: req.query.priority,
      contractId: req.query.contractId,
    };

    const result = await notificationService.getUserNotifications(
      userId,
      options
    );

    res.json({
      success: true,
      data: result.docs,
      meta: {
        total: result.totalDocs,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
        hasNextPage: result.hasNextPage,
        hasPrevPage: result.hasPrevPage,
      },
    });
  });

  /**
   * GET /api/notifications/action-required
   * Obtener notificaciones que requieren acción
   */
  getActionRequired = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const options = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 20,
    };

    const result = await notificationService.getActionRequiredNotifications(
      userId,
      options
    );

    res.json({
      success: true,
      data: result.docs,
      meta: {
        total: result.totalDocs,
        page: result.page,
        totalPages: result.totalPages,
      },
    });
  });

  /**
   * GET /api/notifications/unread-count
   * Contar notificaciones no leídas
   */
  getUnreadCount = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const count = await notificationService.getUnreadCount(userId);

    res.json({
      success: true,
      data: { count },
    });
  });

  /**
   * PATCH /api/notifications/:id/read
   * Marcar como leída
   */
  markAsRead = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user._id;

    const notification = await notificationService.markAsRead(id, userId);

    res.json({
      success: true,
      message: "Notificación marcada como leída",
      data: notification,
    });
  });

  /**
   * PATCH /api/notifications/bulk-read
   * Marcar múltiples como leídas
   */
  markMultipleAsRead = asyncHandler(async (req, res) => {
    const { notificationIds } = req.body;
    const userId = req.user._id;

    if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Se requiere un array de IDs de notificaciones",
      });
    }

    await notificationService.markMultipleAsRead(notificationIds, userId);

    res.json({
      success: true,
      message: `${notificationIds.length} notificaciones marcadas como leídas`,
    });
  });

  /**
   * PATCH /api/notifications/mark-all-read
   * Marcar todas como leídas
   */
  markAllAsRead = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const result = await notificationService.markAllAsRead(userId);

    res.json({
      success: true,
      message: "Todas las notificaciones marcadas como leídas",
      data: { modifiedCount: result.modifiedCount },
    });
  });
}

export default new NotificationController();
