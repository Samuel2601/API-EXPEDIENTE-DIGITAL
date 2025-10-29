// src/module/notifications/repositories/notification.repository.js

import Notification from "../models/notification.model.js";
import BaseRepository from "../../../shared/repositories/base.repository.js";

class NotificationRepository extends BaseRepository {
  constructor() {
    super(Notification);
  }

  /**
   * Obtener notificaciones de un usuario con paginación
   */
  async findByRecipient(userId, options = {}) {
    const {
      page = 1,
      limit = 20,
      unreadOnly = false,
      type,
      priority,
      contractId,
    } = options;

    let query = this.model.find().byRecipient(userId);

    if (unreadOnly) {
      query = query.unread();
    }

    if (type) {
      query = query.where({ type });
    }

    if (priority) {
      query = query.where({ priority });
    }

    if (contractId) {
      query = query.byContract(contractId);
    }

    query = query
      .sort({ "metadata.actionRequired": -1, priority: -1, createdAt: -1 })
      .populate([
        { path: "sender", select: "fullName email avatar" },
        { path: "contract", select: "contractNumber contractualObject" },
        { path: "phase", select: "name code order" },
      ]);

    return await this.model.paginate(query, { page, limit });
  }

  /**
   * Obtener notificaciones que requieren acción
   */
  async findActionRequired(userId, options = {}) {
    const { page = 1, limit = 20 } = options;

    const query = this.model
      .find()
      .byRecipient(userId)
      .actionRequired()
      .sort({ priority: -1, createdAt: -1 })
      .populate([
        {
          path: "contract",
          select: "contractNumber contractualObject generalStatus",
        },
        { path: "phase", select: "name code" },
      ]);

    return await this.model.paginate(query, { page, limit });
  }

  /**
   * Contar notificaciones no leídas
   */
  async countUnread(userId) {
    return await this.model.getUnreadCount(userId);
  }

  /**
   * Marcar como leída
   */
  async markAsRead(notificationId, userId) {
    const notification = await this.findOne({
      _id: notificationId,
      recipient: userId,
    });

    if (!notification) {
      throw new Error("Notificación no encontrada");
    }

    return await notification.markAsRead();
  }

  /**
   * Marcar múltiples como leídas
   */
  async markMultipleAsRead(notificationIds, userId) {
    return await this.model.markMultipleAsRead(notificationIds, userId);
  }

  /**
   * Marcar todas como leídas
   */
  async markAllAsRead(userId) {
    return await this.model.updateMany(
      { recipient: userId, "status.read": false, deletedAt: null },
      {
        $set: {
          "status.read": true,
          "status.readAt": new Date(),
        },
      }
    );
  }

  /**
   * Eliminar notificaciones antiguas (limpieza)
   */
  async deleteOldNotifications(daysOld = 90) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    return await this.model.updateMany(
      {
        createdAt: { $lt: cutoffDate },
        "status.read": true,
        deletedAt: null,
      },
      { $set: { deletedAt: new Date() } }
    );
  }
}

export default new NotificationRepository();
