// =============================================================================
// src/module/core/base/models/base.scheme.js - Versión mejorada
// =============================================================================
import mongoose from "mongoose";
import { userContext } from "#utils/user-context.js";

/**
 * Campos base para todos los esquemas con auditoría y soft delete
 */
export const BaseSchemeFields = {
  // Soft delete
  isDeleted: {
    type: Boolean,
    default: false,
    index: true,
  },
  deletedAt: {
    type: Date,
    default: null,
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
  deletionReason: {
    type: String,
    maxlength: 500,
  },

  // Auditoría automática
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: function () {
      // No requerir createdBy para el primer usuario (bootstrap)
      return (
        this.constructor.modelName !== "User" ||
        mongoose.models.User?.countDocuments?.() > 0
      );
    },
    index: true,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },

  // Versionado
  version: {
    type: Number,
    default: 1,
    min: 1,
  },

  // Metadatos de auditoría
  lastChangeReason: {
    type: String,
    maxlength: 500,
  },
};

/**
 * Obtiene el ID del usuario actual desde el contexto
 * @returns {String|null} ID del usuario actual
 */
const getCurrentUserId = () => {
  const userId = userContext.getCurrentUserId();
  if (userId) {
    return new mongoose.Types.ObjectId(userId);
  }
  return null;
};

/**
 * Middleware mejorado para actualizar timestamps automáticamente
 * Usa AsyncLocalStorage para obtener el contexto de usuario
 */
export const addTimestampMiddleware = (schema) => {
  // Pre-save para documentos nuevos y actualizados
  schema.pre("save", function (next) {
    const now = new Date();
    const currentUserId = getCurrentUserId();

    if (this.isNew) {
      this.createdAt = now;
      this.version = 1;

      // Establecer createdBy si hay usuario en contexto y no se ha establecido manualmente
      if (!this.createdBy && currentUserId) {
        this.createdBy = currentUserId;
      }
    } else {
      // Incrementar versión en cada actualización
      this.version = (this.version || 1) + 1;
    }

    this.updatedAt = now;

    // Actualizar updatedBy si hay usuario en contexto
    if (currentUserId) {
      this.updatedBy = currentUserId;
    }

    next();
  });

  // Pre-middleware para operaciones de actualización
  schema.pre(["findOneAndUpdate", "updateOne", "updateMany"], function (next) {
    const update = this.getUpdate();
    const now = new Date();
    const currentUserId = getCurrentUserId();

    // Asegurar que existe el objeto $set
    if (!update.$set) {
      update.$set = {};
    }

    // Actualizar timestamp
    update.$set.updatedAt = now;

    // Actualizar updatedBy si hay usuario en contexto
    if (currentUserId) {
      update.$set.updatedBy = currentUserId;
    }

    // Incrementar versión
    if (!update.$inc) {
      update.$inc = {};
    }
    update.$inc.version = 1;

    next();
  });

  // Pre-middleware para soft delete
  schema.pre(["findOneAndDelete", "deleteOne", "deleteMany"], function (next) {
    const currentUserId = getCurrentUserId();
    const now = new Date();

    // Convertir delete a soft delete
    this.setQuery({ ...this.getQuery(), isDeleted: { $ne: true } });

    const update = {
      $set: {
        isDeleted: true,
        deletedAt: now,
        updatedAt: now,
      },
    };

    if (currentUserId) {
      update.$set.deletedBy = currentUserId;
      update.$set.updatedBy = currentUserId;
    }

    this.setUpdate(update);
    next();
  });
};

/**
 * Método estático mejorado para soft delete con auditoría
 */
export const addSoftDeleteMethods = (schema) => {
  // Método de instancia para soft delete
  schema.methods.softDelete = function (reason = null) {
    const currentUserId = getCurrentUserId();
    const now = new Date();

    this.isDeleted = true;
    this.deletedAt = now;
    this.updatedAt = now;
    this.deletionReason = reason;

    if (currentUserId) {
      this.deletedBy = currentUserId;
      this.updatedBy = currentUserId;
    }

    return this.save();
  };

  // Método estático para soft delete
  schema.statics.softDeleteById = function (id, reason = null) {
    const currentUserId = getCurrentUserId();
    const now = new Date();

    const update = {
      $set: {
        isDeleted: true,
        deletedAt: now,
        updatedAt: now,
        deletionReason: reason,
      },
    };

    if (currentUserId) {
      update.$set.deletedBy = currentUserId;
      update.$set.updatedBy = currentUserId;
    }

    return this.findByIdAndUpdate(id, update, { new: true });
  };

  // Método para restaurar
  schema.methods.restore = function () {
    const currentUserId = getCurrentUserId();
    const now = new Date();

    this.isDeleted = false;
    this.deletedAt = null;
    this.deletedBy = null;
    this.deletionReason = null;
    this.updatedAt = now;

    if (currentUserId) {
      this.updatedBy = currentUserId;
    }

    return this.save();
  };
};

/**
 * Agregar filtros automáticos para excluir documentos eliminados
 */
export const addSoftDeleteFilters = (schema) => {
  // Filtro automático para find
  schema.pre(/^find/, function () {
    if (!this.getQuery().isDeleted) {
      this.where({ isDeleted: { $ne: true } });
    }
  });

  // Método para incluir documentos eliminados
  schema.query.withDeleted = function () {
    return this.where({});
  };

  // Método para obtener solo documentos eliminados
  schema.query.onlyDeleted = function () {
    return this.where({ isDeleted: true });
  };
};

/**
 * Función principal mejorada para configurar un esquema
 */
export const setupBaseSchema = (schema, options = {}) => {
  const {
    addTimestamps = true,
    addIndexes = true,
    addVirtuals = true,
    addMethods = true,
    addStatics = true,
    addHelpers = true,
    addBaseFields = true,
    addSoftDelete = true,
  } = options;

  // Agregar campos base
  if (addBaseFields) {
    schema.add(BaseSchemeFields);
  }

  // Agregar funcionalidades
  if (addTimestamps) addTimestampMiddleware(schema);
  if (addSoftDelete) {
    addSoftDeleteMethods(schema);
    addSoftDeleteFilters(schema);
  }
  if (addIndexes) addCommonIndexes(schema);
  if (addVirtuals) addCommonVirtuals(schema);
  if (addMethods) addCommonMethods(schema);
  if (addStatics) addCommonStatics(schema);
  if (addHelpers) addQueryHelpers(schema);

  // Configurar opciones del esquema
  schema.set("toJSON", {
    virtuals: true,
    transform: function (doc, ret) {
      delete ret.__v;
      //delete ret._id;
      delete ret.deletedBy;
      delete ret.deletionReason;

      if (ret.isDeleted) {
        delete ret.updatedBy;
        delete ret.lastChangeReason;
      }

      return ret;
    },
  });

  schema.set("toObject", { virtuals: true });

  return schema;
};

// Resto de funciones auxiliares (índices, virtuales, métodos, etc.)
export const addCommonIndexes = (schema) => {
  schema.index({ isDeleted: 1, createdAt: -1 });
  schema.index({ createdBy: 1, createdAt: -1 });
  schema.index({ version: 1 });
  schema.index({ updatedAt: -1 });
};

export const addCommonVirtuals = (schema) => {
  schema.virtual("deleted").get(function () {
    return this.isDeleted;
  });

  schema.virtual("createdAgo").get(function () {
    if (!this.createdAt) return null;
    const now = new Date();
    const diffMs = now - this.createdAt;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Hoy";
    if (diffDays === 1) return "Ayer";
    if (diffDays < 7) return `${diffDays} días`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} semanas`;
    return `${Math.floor(diffDays / 30)} meses`;
  });
};

export const addCommonMethods = (schema) => {
  schema.methods.isOwnedBy = function (userId) {
    return this.createdBy && this.createdBy.toString() === userId.toString();
  };

  schema.methods.wasModifiedBy = function (userId) {
    return this.updatedBy && this.updatedBy.toString() === userId.toString();
  };
};

export const addCommonStatics = (schema) => {
  schema.statics.findByCreator = function (userId, options = {}) {
    return this.find({ createdBy: userId, ...options });
  };

  schema.statics.findRecent = function (days = 7) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return this.find({ createdAt: { $gte: date } });
  };
};

export const addQueryHelpers = (schema) => {
  schema.query.byDateRange = function (startDate, endDate) {
    const filter = {};
    if (startDate) filter.$gte = startDate;
    if (endDate) filter.$lte = endDate;
    return this.where({ createdAt: filter });
  };
};

/**
 * Validadores comunes
 */
export const CommonValidators = {
  // Validador para ObjectId
  objectId: {
    validator: function (v) {
      return mongoose.Types.ObjectId.isValid(v);
    },
    message: "ID no válido",
  },

  // Validador para email
  email: {
    validator: function (v) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
    },
    message: "Email no válido",
  },

  // Validador para URL
  url: {
    validator: function (v) {
      return !v || /^https?:\/\/.+/.test(v);
    },
    message: "URL no válida",
  },

  // Validador para teléfono (formato internacional)
  phone: {
    validator: function (v) {
      return !v || /^\+?[1-9]\d{1,14}$/.test(v.replace(/\s/g, ""));
    },
    message: "Número de teléfono no válido",
  },

  // Validador para coordenadas geográficas
  coordinates: {
    validator: function (coords) {
      return (
        coords &&
        coords.length === 2 &&
        coords[0] >= -180 &&
        coords[0] <= 180 && // Longitude
        coords[1] >= -90 &&
        coords[1] <= 90
      ); // Latitude
    },
    message: "Coordenadas geográficas no válidas",
  },
};

export default {
  BaseSchemeFields,
  addTimestampMiddleware,
  addSoftDeleteMethods,
  addSoftDeleteFilters,
  addCommonIndexes,
  addCommonVirtuals,
  addCommonMethods,
  addCommonStatics,
  addQueryHelpers,
  setupBaseSchema,
  CommonValidators,
};
