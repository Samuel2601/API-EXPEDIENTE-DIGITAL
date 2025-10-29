// src/module/notifications/services/notification.service.js

import notificationRepository from "../repositories/notification.repository.js";
import NotificationEvents from "../events/notification.events.js";
import { createError, ERROR_CODES } from "../../../utils/error.util.js";

class NotificationService {
  /**
   * Crear una nueva notificación
   */
  async createNotification(data) {
    try {
      // Validar datos requeridos
      if (!data.recipient || !data.type || !data.title || !data.message) {
        throw createError(
          "Datos de notificación incompletos",
          400,
          ERROR_CODES.VALIDATION_ERROR
        );
      }

      // Crear notificación en BD
      const notification = await notificationRepository.create(data);

      // Emitir evento para WebSocket
      NotificationEvents.emit("notification:created", {
        recipientId: notification.recipient.toString(),
        notification: notification.toObject(),
      });

      // Si requiere email, emitir evento
      if (data.channels?.email) {
        NotificationEvents.emit("notification:sendEmail", {
          recipientId: notification.recipient.toString(),
          notification: notification.toObject(),
        });
      }

      return notification;
    } catch (error) {
      throw createError(
        `Error creando notificación: ${error.message}`,
        error.statusCode || 500,
        ERROR_CODES.DATABASE_ERROR
      );
    }
  }

  /**
   * Crear notificaciones en lote
   */
  async createBulkNotifications(notifications) {
    try {
      const created = await notificationRepository.createMany(notifications);

      // Emitir eventos para cada notificación
      created.forEach((notification) => {
        NotificationEvents.emit("notification:created", {
          recipientId: notification.recipient.toString(),
          notification: notification.toObject(),
        });
      });

      return created;
    } catch (error) {
      throw createError(
        `Error creando notificaciones en lote: ${error.message}`,
        500,
        ERROR_CODES.DATABASE_ERROR
      );
    }
  }

  /**
   * Obtener notificaciones de un usuario
   */
  async getUserNotifications(userId, options = {}) {
    try {
      return await notificationRepository.findByRecipient(userId, options);
    } catch (error) {
      throw createError(
        `Error obteniendo notificaciones: ${error.message}`,
        500,
        ERROR_CODES.DATABASE_ERROR
      );
    }
  }

  /**
   * Obtener notificaciones que requieren acción
   */
  async getActionRequiredNotifications(userId, options = {}) {
    try {
      return await notificationRepository.findActionRequired(userId, options);
    } catch (error) {
      throw createError(
        `Error obteniendo notificaciones de acción: ${error.message}`,
        500,
        ERROR_CODES.DATABASE_ERROR
      );
    }
  }

  /**
   * Contar notificaciones no leídas
   */
  async getUnreadCount(userId) {
    try {
      return await notificationRepository.countUnread(userId);
    } catch (error) {
      throw createError(
        `Error contando notificaciones: ${error.message}`,
        500,
        ERROR_CODES.DATABASE_ERROR
      );
    }
  }

  /**
   * Marcar notificación como leída
   */
  async markAsRead(notificationId, userId) {
    try {
      const notification = await notificationRepository.markAsRead(
        notificationId,
        userId
      );

      // Emitir evento de actualización
      NotificationEvents.emit("notification:read", {
        recipientId: userId.toString(),
        notificationId: notificationId.toString(),
      });

      return notification;
    } catch (error) {
      throw createError(
        `Error marcando como leída: ${error.message}`,
        error.statusCode || 500,
        ERROR_CODES.DATABASE_ERROR
      );
    }
  }

  /**
   * Marcar múltiples como leídas
   */
  async markMultipleAsRead(notificationIds, userId) {
    try {
      const result = await notificationRepository.markMultipleAsRead(
        notificationIds,
        userId
      );

      // Emitir evento
      NotificationEvents.emit("notifications:bulkRead", {
        recipientId: userId.toString(),
        notificationIds,
      });

      return result;
    } catch (error) {
      throw createError(
        `Error marcando múltiples como leídas: ${error.message}`,
        500,
        ERROR_CODES.DATABASE_ERROR
      );
    }
  }

  /**
   * Marcar todas como leídas
   */
  async markAllAsRead(userId) {
    try {
      const result = await notificationRepository.markAllAsRead(userId);

      NotificationEvents.emit("notifications:allRead", {
        recipientId: userId.toString(),
      });

      return result;
    } catch (error) {
      throw createError(
        `Error marcando todas como leídas: ${error.message}`,
        500,
        ERROR_CODES.DATABASE_ERROR
      );
    }
  }

  /**
   * MÉTODOS ESPECÍFICOS PARA EXPEDIENTE DIGITAL
   */

  /**
   * Notificar subida de documento
   */
  async notifyDocumentUploaded(data) {
    const { contractId, phaseId, documentId, uploadedBy, nextReviewer } = data;

    if (!nextReviewer) {
      return null; // No hay siguiente revisor
    }

    return await this.createNotification({
      recipient: nextReviewer,
      sender: uploadedBy,
      type: "DOCUMENTO_SUBIDO",
      priority: "alta",
      title: "Nuevo documento requiere revisión",
      message: `Se ha subido un documento en la fase ${data.phaseName} del contrato ${data.contractNumber}`,
      contract: contractId,
      phase: phaseId,
      document: documentId,
      metadata: {
        actionRequired: true,
        actionType: "revisar",
        actionUrl: `/expedientes/${contractId}/fases/${phaseId}/documentos/${documentId}`,
        contractNumber: data.contractNumber,
        phaseName: data.phaseName,
        documentName: data.documentName,
      },
      channels: {
        inApp: true,
        email: data.sendEmail || false,
      },
    });
  }

  /**
   * Notificar aprobación de documento
   */
  async notifyDocumentApproved(data) {
    const {
      contractId,
      phaseId,
      documentId,
      approvedBy,
      uploader,
      nextResponsible,
    } = data;

    // Notificar al que subió
    await this.createNotification({
      recipient: uploader,
      sender: approvedBy,
      type: "DOCUMENTO_APROBADO",
      priority: "media",
      title: "Documento aprobado",
      message: `Tu documento ha sido aprobado en ${data.phaseName}`,
      contract: contractId,
      phase: phaseId,
      document: documentId,
      metadata: {
        contractNumber: data.contractNumber,
        phaseName: data.phaseName,
        documentName: data.documentName,
      },
    });

    // Si hay siguiente responsable, notificar
    if (nextResponsible) {
      return await this.createNotification({
        recipient: nextResponsible,
        sender: approvedBy,
        type: "PENDIENTE_REVISION",
        priority: "alta",
        title: "Siguiente documento pendiente",
        message: `Es tu turno para subir/revisar el siguiente documento en ${data.phaseName}`,
        contract: contractId,
        phase: phaseId,
        metadata: {
          actionRequired: true,
          actionType: "subir_documento",
          actionUrl: `/expedientes/${contractId}/fases/${phaseId}`,
          contractNumber: data.contractNumber,
          phaseName: data.phaseName,
        },
      });
    }
  }

  /**
   * Notificar rechazo de documento
   */
  async notifyDocumentRejected(data) {
    const { contractId, phaseId, documentId, rejectedBy, uploader, reason } =
      data;

    return await this.createNotification({
      recipient: uploader,
      sender: rejectedBy,
      type: "DOCUMENTO_RECHAZADO",
      priority: "urgente",
      title: "Documento rechazado - Corrección requerida",
      message: `Tu documento fue rechazado. Motivo: ${reason}`,
      contract: contractId,
      phase: phaseId,
      document: documentId,
      metadata: {
        actionRequired: true,
        actionType: "corregir",
        actionUrl: `/expedientes/${contractId}/fases/${phaseId}/documentos/${documentId}`,
        contractNumber: data.contractNumber,
        phaseName: data.phaseName,
        documentName: data.documentName,
      },
      channels: {
        inApp: true,
        email: true, // Siempre enviar email en rechazos
      },
    });
  }

  /**
   * Notificar fase completada
   */
  async notifyPhaseCompleted(data) {
    const { contractId, phaseId, completedBy, nextPhaseResponsibles } = data;

    // Notificar a los responsables de la siguiente fase
    if (nextPhaseResponsibles && nextPhaseResponsibles.length > 0) {
      const notifications = nextPhaseResponsibles.map((userId) => ({
        recipient: userId,
        sender: completedBy,
        type: "FASE_INICIADA",
        priority: "alta",
        title: "Nueva fase iniciada",
        message: `Se ha iniciado la fase ${data.nextPhaseName} del contrato ${data.contractNumber}`,
        contract: contractId,
        phase: phaseId,
        metadata: {
          actionRequired: true,
          actionType: "iniciar_fase",
          actionUrl: `/expedientes/${contractId}/fases/${phaseId}`,
          contractNumber: data.contractNumber,
          phaseName: data.nextPhaseName,
        },
      }));

      return await this.createBulkNotifications(notifications);
    }
  }

  /**
   * Notificar fecha límite próxima
   */
  async notifyDeadlineApproaching(data) {
    const { contractId, phaseId, responsibles, dueDate, daysRemaining } = data;

    const notifications = responsibles.map((userId) => ({
      recipient: userId,
      type: "FECHA_LIMITE_PROXIMA",
      priority: daysRemaining <= 2 ? "urgente" : "alta",
      title: `Fecha límite en ${daysRemaining} días`,
      message: `La fase ${data.phaseName} vence el ${new Date(dueDate).toLocaleDateString()}`,
      contract: contractId,
      phase: phaseId,
      metadata: {
        actionRequired: true,
        contractNumber: data.contractNumber,
        phaseName: data.phaseName,
        dueDate,
        actionUrl: `/expedientes/${contractId}/fases/${phaseId}`,
      },
      channels: {
        inApp: true,
        email: daysRemaining <= 2, // Email solo si quedan 2 días o menos
      },
    }));

    return await this.createBulkNotifications(notifications);
  }
}

export default new NotificationService();
