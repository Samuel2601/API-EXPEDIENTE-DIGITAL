// src/module/notifications/models/notification.model.js

import { Schema, model } from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";

const notificationSchema = new Schema(
  {
    // Usuario destinatario
    recipient: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Usuario que generó la acción (opcional)
    sender: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },

    // Tipo de notificación
    type: {
      type: String,
      required: true,
      enum: [
        // Fases de contratación
        "DOCUMENTO_SUBIDO",
        "DOCUMENTO_APROBADO",
        "DOCUMENTO_RECHAZADO",
        "FASE_COMPLETADA",
        "FASE_INICIADA",

        // Revisiones y aprobaciones
        "PENDIENTE_REVISION",
        "PENDIENTE_APROBACION",
        "SOLICITUD_CORRECCION",

        // Fechas límite
        "FECHA_LIMITE_PROXIMA",
        "FECHA_LIMITE_VENCIDA",

        // Asignaciones
        "ASIGNACION_NUEVA",
        "REASIGNACION",

        // Sistema
        "MENSAJE_SISTEMA",
        "ALERTA",
        "RECORDATORIO",
      ],
      index: true,
    },

    // Prioridad
    priority: {
      type: String,
      enum: ["baja", "media", "alta", "urgente"],
      default: "media",
    },

    // Título y contenido
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },

    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },

    // Referencia al expediente/contrato
    contract: {
      type: Schema.Types.ObjectId,
      ref: "Contract",
      index: true,
    },

    // Referencia a la fase específica
    phase: {
      type: Schema.Types.ObjectId,
      ref: "ContractPhase",
    },

    // Referencia al documento
    document: {
      type: Schema.Types.ObjectId,
      ref: "DocumentMetadata",
    },

    // Datos adicionales contextuales
    metadata: {
      actionRequired: {
        type: Boolean,
        default: false,
      },
      actionType: String, // 'revisar', 'aprobar', 'subir_documento', etc.
      actionUrl: String, // URL para redirigir al usuario
      contractNumber: String,
      phaseName: String,
      documentName: String,
      dueDate: Date,
    },

    // Estado de la notificación
    status: {
      read: {
        type: Boolean,
        default: false,
        index: true,
      },
      readAt: Date,
      archived: {
        type: Boolean,
        default: false,
      },
      archivedAt: Date,
    },

    // Canal de entrega
    channels: {
      inApp: {
        type: Boolean,
        default: true,
      },
      email: {
        type: Boolean,
        default: false,
      },
      emailSentAt: Date,
    },

    // Soft delete
    deletedAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Índices compuestos
notificationSchema.index({ recipient: 1, "status.read": 1, deletedAt: 1 });
notificationSchema.index({ recipient: 1, type: 1, deletedAt: 1 });
notificationSchema.index({ contract: 1, deletedAt: 1 });
notificationSchema.index({ createdAt: -1 });

// Query helpers
notificationSchema.query.unread = function () {
  return this.where({ "status.read": false, deletedAt: null });
};

notificationSchema.query.byRecipient = function (userId) {
  return this.where({ recipient: userId, deletedAt: null });
};

notificationSchema.query.byContract = function (contractId) {
  return this.where({ contract: contractId, deletedAt: null });
};

notificationSchema.query.actionRequired = function () {
  return this.where({
    "metadata.actionRequired": true,
    "status.read": false,
    deletedAt: null,
  });
};

// Métodos de instancia
notificationSchema.methods.markAsRead = function () {
  this.status.read = true;
  this.status.readAt = new Date();
  return this.save();
};

notificationSchema.methods.archive = function () {
  this.status.archived = true;
  this.status.archivedAt = new Date();
  return this.save();
};

// Métodos estáticos
notificationSchema.statics.markMultipleAsRead = async function (
  notificationIds,
  userId
) {
  return this.updateMany(
    { _id: { $in: notificationIds }, recipient: userId },
    {
      $set: {
        "status.read": true,
        "status.readAt": new Date(),
      },
    }
  );
};

notificationSchema.statics.getUnreadCount = async function (userId) {
  return this.countDocuments({
    recipient: userId,
    "status.read": false,
    deletedAt: null,
  });
};

// Plugin de paginación
notificationSchema.plugin(mongoosePaginate);

export default model("Notification", notificationSchema);
