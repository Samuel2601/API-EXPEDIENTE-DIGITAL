import mongoose, { Types } from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";
import { Audit } from "../../models/AuditSchema.js";

Audit.schema.plugin(mongoosePaginate);

// Helper para detectar cambios entre documentos
function detectChanges(
  originalDoc,
  updatedDoc,
  ignoredFields = ["updatedAt", "_id", "__v"]
) {
  const changes = [];

  // Campos en el documento actualizado
  for (const field in updatedDoc) {
    if (ignoredFields.includes(field)) continue;

    const oldValue = originalDoc[field];
    const newValue = updatedDoc[field];

    // Comparación profunda para objetos y arrays
    if (!isEqual(oldValue, newValue)) {
      changes.push({
        field,
        oldValue: oldValue,
      });
    }
  }

  // Campos eliminados (existían en original pero no en actualizado)
  for (const field in originalDoc) {
    if (ignoredFields.includes(field)) continue;

    if (!(field in updatedDoc)) {
      changes.push({
        field,
        oldValue: originalDoc[field],
      });
    }
  }

  return changes;
}

// Comparación profunda de valores
function isEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, index) => isEqual(item, b[index]));
  }

  if (typeof a === "object" && typeof b === "object") {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((key) => isEqual(a[key], b[key]));
  }

  return false;
}

export const AuditRepository = {
  /**
   * Detecta y guarda cambios automáticamente comparando documentos
   * @param {Object} params
   * @param {string} params.schema - Nombre del modelo
   * @param {string} params.documentId - ID del documento
   * @param {Object} params.originalDoc - Documento original (antes del cambio)
   * @param {Object} params.updatedDoc - Documento actualizado
   * @param {string} params.userId - ID del usuario
   * @param {Object} params.metadata - Metadatos adicionales
   * @param {Array} params.ignoredFields - Campos a ignorar en la comparación
   */
  async saveUpdateWithDetection(
    {
      schema,
      documentId,
      originalDoc,
      updatedDoc,
      userData,
      ignoredFields = ["updatedAt", "_id", "__v", "updatedBy"],
    },
    options = {}
  ) {
    const changes = detectChanges(originalDoc, updatedDoc, ignoredFields);

    // Si no hay cambios, no guardar auditoría
    if (changes.length === 0) {
      return null;
    }

    return await this.saveAudit(
      {
        schema,
        documentId,
        method: "update",
        changes,
        userData,
      },
      options
    );
  },

  /**
   * Método helper para obtener solo los cambios sin guardar
   * @param {Object} originalDoc - Documento original
   * @param {Object} updatedDoc - Documento actualizado
   * @param {Array} ignoredFields - Campos a ignorar
   */
  detectChanges(
    originalDoc,
    updatedDoc,
    ignoredFields = ["updatedAt", "_id", "__v", "updatedBy"]
  ) {
    return detectChanges(originalDoc, updatedDoc, ignoredFields);
  },
  /* @param {Object} params
   * @param {string} params.schema - Nombre del modelo
   * @param {string} params.documentId - ID del documento
   * @param {Array} params.changedFields - Campos modificados: [{field, oldValue}]
   * @param {string} params.userId - ID del usuario
   * @param {Object} params.metadata - Metadatos adicionales
   */
  async saveAudit({ schema, documentId, method, changes, userData }, options) {
    if (!Types.ObjectId.isValid(documentId)) {
      throw new Error("ID del documento no válido");
    }

    const audit = new Audit({
      schema,
      documentId: new Types.ObjectId(documentId),
      method,
      changes: Array.isArray(changes) ? changes : [changes],
      userData: {
        userId: userData.userId ? new Types.ObjectId(userData.userId) : null,
        ip: userData.ip,
        userAgent: userData.userAgent,
        location: userData.location,
      },
    });

    return await audit.save(options);
  },

  /**
   * Guarda el documento completo antes de una eliminación forzada
   * @param {Object} params
   * @param {string} params.schema - Nombre del modelo
   * @param {string} params.documentId - ID del documento
   * @param {Object} params.documentToDelete - Documento completo a eliminar
   * @param {string} params.userId - ID del usuario
   * @param {Object} params.metadata - Metadatos adicionales
   */
  async saveDeleteBackup({ schema, documentId, documentToDelete, userData }) {
    if (!Types.ObjectId.isValid(documentId)) {
      throw new Error("ID del documento no válido");
    }

    return await this.saveAudit({
      schema,
      documentId,
      method: "forceDelete",
      changes: documentToDelete,
      userData,
    });
  },

  /**
   * Obtiene el historial de respaldos de un documento
   * @param {string} documentId - ID del documento
   * @param {string} schema - Nombre del modelo
   * @param {Object} options - Opciones de paginación
   */
  async getDocumentHistory(documentId, schema, options = {}) {
    const { page = 1, limit = 10, sort = "-createdAt" } = options;

    return await Audit.paginate(
      {
        documentId: new Types.ObjectId(documentId),
        schema,
      },
      {
        page,
        limit,
        sort,
        populate: {
          path: "userData.userId",
          select: "name email",
        },
        lean: true,
      }
    );
  },

  /**
   * Obtiene un respaldo específico por ID
   * @param {string} auditId - ID del registro de auditoría
   */
  async getBackup(auditId) {
    if (!Types.ObjectId.isValid(auditId)) {
      throw new Error("ID de auditoría no válido");
    }

    return await Audit.findById(auditId)
      .populate("userData.userId", "name email")
      .lean();
  },

  /**
   * Obtiene todos los documentos eliminados (respaldos de force_delete)
   * @param {Object} options - Opciones de filtrado y paginación
   */
  async getDeletedDocuments(options = {}) {
    const {
      page = 1,
      limit = 10,
      sort = "-createdAt",
      schema,
      userId,
      dateFrom,
      dateTo,
    } = options;

    const query = { action: "force_delete" };

    if (schema) query.schema = schema;
    if (userId) query.userId = new Types.ObjectId(userId);

    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) query.createdAt.$lte = new Date(dateTo);
    }

    return await Audit.paginate(query, {
      page,
      limit,
      sort,
      populate: {
        path: "userId",
        select: "nombre email",
      },
      lean: true,
    });
  },

  /**
   * Obtiene estadísticas de auditoría por usuario
   * @param {string} userId - ID del usuario
   * @param {Object} filters - Filtros adicionales
   */
  async getUserAuditStats(userId, filters = {}) {
    const query = { userId: new Types.ObjectId(userId) };

    if (filters.schema) query.schema = filters.schema;
    if (filters.dateFrom || filters.dateTo) {
      query.createdAt = {};
      if (filters.dateFrom) query.createdAt.$gte = new Date(filters.dateFrom);
      if (filters.dateTo) query.createdAt.$lte = new Date(filters.dateTo);
    }

    const pipeline = [
      { $match: query },
      {
        $group: {
          _id: "$action",
          count: { $sum: 1 },
          schemas: { $addToSet: "$schema" },
          firstAction: { $min: "$createdAt" },
          lastAction: { $max: "$createdAt" },
        },
      },
    ];

    const stats = await Audit.aggregate(pipeline);

    const totalActions = await Audit.countDocuments(query);

    return {
      totalActions,
      actionBreakdown: stats,
      affectedSchemas: [...new Set(stats.flatMap((s) => s.schemas))],
    };
  },

  /**
   * Restaura un documento desde un respaldo (solo para force_delete)
   * @param {string} auditId - ID del registro de auditoría
   * @param {Function} restoreCallback - Función para restaurar en la colección original
   */
  async restoreFromBackup(auditId, restoreCallback) {
    const backup = await this.getBackup(auditId);

    if (!backup || backup.action !== "force_delete") {
      throw new Error("Respaldo no encontrado o no es una eliminación");
    }

    // Ejecutar la función de restauración proporcionada
    const restored = await restoreCallback(backup.backup, backup.schema);

    return {
      restoredDocument: restored,
      originalBackup: backup,
    };
  },

  /**
   * Limpia auditorías antiguas
   * @param {number} daysOld - Días de antigüedad
   * @param {boolean} keepDeletes - Mantener respaldos de eliminaciones
   */
  async cleanOldAudits(daysOld = 365, keepDeletes = true) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const query = {
      createdAt: { $lt: cutoffDate },
    };

    if (keepDeletes) {
      query.method = "update"; // Solo eliminar respaldos de actualizaciones
    }

    const result = await Audit.deleteMany(query);

    return {
      deletedCount: result.deletedCount,
      cutoffDate,
      keptDeletes: keepDeletes,
    };
  },
};
