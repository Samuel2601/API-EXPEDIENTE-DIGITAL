// src/module/exp-digital/models/contract-history.scheme.js
import mongoose from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";
import { setupBaseSchema, CommonValidators } from "../../core/base/models/base.scheme.js";
import { stripMetaFields } from "../../../../utils/meta-field.js";

const { Schema } = mongoose;

export const ContractHistoryJSON = {
  contract: {
    type: Schema.Types.ObjectId,
    ref: "Contract",
    required: true,
    index: true,
    meta: {
      validation: { isMongoId: true, required: true },
      messages: {
        required: "El contrato es obligatorio",
        isMongoId: "El ID del contrato no es válido"
      },
    },
  },
  
  // Información del evento/cambio
  eventType: {
    type: String,
    enum: {
      values: [
        "CREATION",           // CREACION
        "PHASE_CHANGE",       // CAMBIO_FASE
        "STATUS_CHANGE",      // CAMBIO_ESTADO
        "DOCUMENT_UPLOAD",    // SUBIDA_DOCUMENTO
        "DOCUMENT_APPROVAL",  // APROBACION_DOCUMENTO
        "DOCUMENT_REJECTION", // RECHAZO_DOCUMENTO
        "DATA_MODIFICATION",  // MODIFICACION_DATOS
        "BUDGET_CHANGE",      // CAMBIO_PRESUPUESTO
        "TIMELINE_CHANGE",    // CAMBIO_CRONOGRAMA
        "CONTRACTOR_CHANGE",  // CAMBIO_CONTRATISTA
        "AWARD",              // ADJUDICACION
        "CONTRACT_SIGNING",   // FIRMA_CONTRATO
        "PAYMENT_MADE",       // PAGO_REALIZADO
        "OBSERVATION_ADDED",  // OBSERVACION_AGREGADA
        "PHASE_COMPLETION",   // COMPLETAR_FASE
        "PROCESS_CANCELLATION", // CANCELACION_PROCESO
        "EXTENSION_REQUEST",  // SOLICITUD_PRORROGA
        "AMENDMENT",          // MODIFICACION_CONTRACTUAL
        "LIQUIDATION",        // LIQUIDACION
        "CLOSURE"             // CIERRE
      ],
      message: "Tipo de evento no válido"
    },
    required: true,
    uppercase: true,
    index: true,
    meta: {
      validation: { isIn: ["CREATION", "PHASE_CHANGE", "STATUS_CHANGE", "DOCUMENT_UPLOAD", "DOCUMENT_APPROVAL", "DOCUMENT_REJECTION", "DATA_MODIFICATION", "BUDGET_CHANGE", "TIMELINE_CHANGE", "CONTRACTOR_CHANGE", "AWARD", "CONTRACT_SIGNING", "PAYMENT_MADE", "OBSERVATION_ADDED", "PHASE_COMPLETION", "PROCESS_CANCELLATION", "EXTENSION_REQUEST", "AMENDMENT", "LIQUIDATION", "CLOSURE"], required: true },
      messages: {
        required: "El tipo de evento es obligatorio",
        isIn: "El tipo de evento debe ser uno de los valores válidos"
      },
    },
  },
  
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000,
    meta: {
      validation: { isString: true, required: true, notEmpty: true, isLength: { min: 5, max: 1000 } },
      messages: {
        required: "La descripción del evento es obligatoria",
        isString: "La descripción debe ser un texto válido",
        notEmpty: "La descripción no puede estar vacía",
        isLength: "La descripción debe tener entre 5 y 1000 caracteres"
      },
    },
  },
  
  // Detalles del cambio específicos por tipo de evento
  changeDetails: {
    // Para cambios de estado/fase
    previousStatus: {
      type: String,
      trim: true,
      maxlength: 50,
      meta: {
        validation: { isString: true, optional: true, isLength: { max: 50 } },
        messages: {
          isString: "El estado anterior debe ser un texto válido",
          isLength: "El estado anterior no puede exceder 50 caracteres"
        },
      },
    },
    
    newStatus: {
      type: String,
      trim: true,
      maxlength: 50,
      meta: {
        validation: { isString: true, optional: true, isLength: { max: 50 } },
        messages: {
          isString: "El nuevo estado debe ser un texto válido",
          isLength: "El nuevo estado no puede exceder 50 caracteres"
        },
      },
    },
    
    previousPhase: {
      type: Schema.Types.ObjectId,
      ref: "ContractPhase",
      meta: {
        validation: { isMongoId: true, optional: true },
        messages: {
          isMongoId: "El ID de la fase anterior no es válido"
        },
      },
    },
    
    newPhase: {
      type: Schema.Types.ObjectId,
      ref: "ContractPhase",
      meta: {
        validation: { isMongoId: true, optional: true },
        messages: {
          isMongoId: "El ID de la nueva fase no es válido"
        },
      },
    },
    
    // Para cambios presupuestarios
    previousBudget: {
      estimatedValue: Number,
      awardedValue: Number,
      paidValue: Number
    },
    
    newBudget: {
      estimatedValue: Number,
      awardedValue: Number,
      paidValue: Number
    },
    
    // Para documentos
    documentInfo: {
      documentId: {
        type: Schema.Types.ObjectId,
        ref: "File"
      },
      documentType: String,
      documentName: String,
      action: {
        type: String,
        enum: ["UPLOAD", "APPROVE", "REJECT", "DELETE", "UPDATE"]
      }
    },
    
    // Para cambios de contratista
    contractorChanges: {
      field: String,
      previousValue: Schema.Types.Mixed,
      newValue: Schema.Types.Mixed
    },
    
    // Para pagos realizados
    paymentInfo: {
      amount: {
        type: Number,
        min: 0
      },
      paymentMethod: String,
      reference: String,
      invoiceNumber: String
    },
    
    // Para prorrogas
    extensionInfo: {
      requestedDays: Number,
      approvedDays: Number,
      newEndDate: Date,
      justification: String
    }
  },
  
  // Valores modificados completos (para auditoría completa)
  changesData: {
    type: Schema.Types.Mixed,
    meta: {
      validation: { optional: true },
      messages: {
        invalid: "Los datos de cambios deben ser válidos"
      },
    },
  },
  
  // Usuario responsable del cambio
  user: {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      meta: {
        validation: { isMongoId: true, optional: true },
        messages: {
          isMongoId: "El ID de usuario no es válido"
        },
      },
    },
    
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
      meta: {
        validation: { isString: true, required: true, notEmpty: true, isLength: { min: 2, max: 150 } },
        messages: {
          required: "El nombre del usuario es obligatorio",
          isString: "El nombre del usuario debe ser un texto válido",
          notEmpty: "El nombre del usuario no puede estar vacío",
          isLength: "El nombre del usuario debe tener entre 2 y 150 caracteres"
        },
      },
    },
    
    email: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 100,
      validate: CommonValidators.email,
      meta: {
        validation: { isEmail: true, optional: true },
        messages: {
          isEmail: "El email del usuario no es válido"
        },
      },
    },
    
    role: {
      type: String,
      trim: true,
      maxlength: 50,
      meta: {
        validation: { isString: true, optional: true, isLength: { max: 50 } },
        messages: {
          isString: "El rol debe ser un texto válido",
          isLength: "El rol no puede exceder 50 caracteres"
        },
      },
    }
  },
  
  // Fecha y hora del evento
  eventDate: {
    type: Date,
    default: Date.now,
    required: true,
    index: true,
    meta: {
      validation: { isDate: true, required: true },
      messages: {
        required: "La fecha del evento es obligatoria",
        isDate: "La fecha del evento debe ser válida"
      },
    },
  },
  
  // Información adicional de auditoría
  auditInfo: {
    ipAddress: {
      type: String,
      trim: true,
      maxlength: 45, // IPv6
      validate: {
        validator: function(v) {
          if (!v) return true;
          // Validación básica para IPv4 e IPv6
          return /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(v) ||
                 /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/.test(v);
        },
        message: 'La dirección IP no tiene un formato válido'
      },
      meta: {
        validation: { optional: true },
        messages: {
          invalid: "La dirección IP debe tener un formato válido"
        },
      },
    },
    
    userAgent: {
      type: String,
      trim: true,
      maxlength: 500,
      meta: {
        validation: { isString: true, optional: true, isLength: { max: 500 } },
        messages: {
          isString: "El user agent debe ser un texto válido",
          isLength: "El user agent no puede exceder 500 caracteres"
        },
      },
    },
    
    sessionId: {
      type: String,
      trim: true,
      maxlength: 100,
      meta: {
        validation: { isString: true, optional: true, isLength: { max: 100 } },
        messages: {
          isString: "El ID de sesión debe ser un texto válido",
          isLength: "El ID de sesión no puede exceder 100 caracteres"
        },
      },
    },
    
    requestId: {
      type: String,
      trim: true,
      maxlength: 100,
      meta: {
        validation: { isString: true, optional: true, isLength: { max: 100 } },
        messages: {
          isString: "El ID de request debe ser un texto válido",
          isLength: "El ID de request no puede exceder 100 caracteres"
        },
      },
    }
  },
  
  // Clasificación del evento
  classification: {
    severity: {
      type: String,
      enum: ["LOW", "NORMAL", "HIGH", "CRITICAL"],
      default: "NORMAL",
      uppercase: true,
      meta: {
        validation: { isIn: ["LOW", "NORMAL", "HIGH", "CRITICAL"], optional: true },
        messages: {
          isIn: "La severidad debe ser una de las opciones válidas"
        },
      },
    },
    
    category: {
      type: String,
      enum: ["ADMINISTRATIVE", "TECHNICAL", "FINANCIAL", "LEGAL", "OPERATIONAL"],
      default: "ADMINISTRATIVE",
      uppercase: true,
      meta: {
        validation: { isIn: ["ADMINISTRATIVE", "TECHNICAL", "FINANCIAL", "LEGAL", "OPERATIONAL"], optional: true },
        messages: {
          isIn: "La categoría debe ser una de las opciones válidas"
        },
      },
    },
    
    isSystemGenerated: {
      type: Boolean,
      default: false,
      meta: {
        validation: { isBoolean: true, optional: true },
        messages: {
          isBoolean: "El campo de sistema debe ser verdadero o falso"
        },
      },
    }
  },
  
  // Observaciones adicionales
  observations: {
    type: String,
    trim: true,
    maxlength: 2000,
    meta: {
      validation: { isString: true, optional: true, isLength: { max: 2000 } },
      messages: {
        isString: "Las observaciones deben ser un texto válido",
        isLength: "Las observaciones no pueden exceder 2000 caracteres"
      },
    },
  },
  
  // Referencias externas
  externalReferences: {
    ticketId: String,
    workflowId: String,
    notificationId: String,
    integrationId: String
  }
};

// Crear el esquema con campos base
const ContractHistorySchema = new Schema(stripMetaFields(ContractHistoryJSON), {
  timestamps: true,
  collection: "contracthistory"
});

// Aplicar configuración base (sin algunos campos que no necesitamos)
setupBaseSchema(ContractHistorySchema, {
  addTimestamps: true,
  addIndexes: true,
  addVirtuals: true,
  addMethods: true,
  addStatics: true,
  addHelpers: true,
  addBaseFields: false, // No necesitamos soft delete para historiales
});

// === MIDDLEWARES PERSONALIZADOS ===

// Pre-save: validaciones y normalización
ContractHistorySchema.pre('save', function(next) {
  // Normalizar datos según el tipo de evento
  switch (this.eventType) {
    case 'PAYMENT_MADE':
      if (!this.changeDetails.paymentInfo || !this.changeDetails.paymentInfo.amount) {
        return next(new Error('La información de pago es requerida para eventos de pago'));
      }
      break;
      
    case 'PHASE_CHANGE':
      if (!this.changeDetails.previousPhase && !this.changeDetails.newPhase) {
        return next(new Error('Se debe especificar la fase anterior o nueva para cambios de fase'));
      }
      break;
      
    case 'DOCUMENT_UPLOAD':
    case 'DOCUMENT_APPROVAL':
    case 'DOCUMENT_REJECTION':
      if (!this.changeDetails.documentInfo) {
        return next(new Error('La información del documento es requerida para eventos de documentos'));
      }
      break;
  }
  
  next();
});

// === MÉTODOS DE INSTANCIA ===

ContractHistorySchema.methods.toJSON = function() {
  const obj = this.toObject();
  return stripMetaFields(obj);
};

ContractHistorySchema.methods.getFormattedDescription = function() {
  const date = this.eventDate.toLocaleDateString('es-EC');
  const time = this.eventDate.toLocaleTimeString('es-EC');
  
  return `[${date} ${time}] ${this.user.name}: ${this.description}`;
};

ContractHistorySchema.methods.isRecent = function(hours = 24) {
  const now = new Date();
  const diffHours = (now - this.eventDate) / (1000 * 60 * 60);
  return diffHours <= hours;
};

ContractHistorySchema.methods.isCritical = function() {
  return this.classification.severity === 'CRITICAL';
};

ContractHistorySchema.methods.getEventSummary = function() {
  const summary = {
    type: this.eventType,
    description: this.description,
    user: this.user.name,
    date: this.eventDate,
    severity: this.classification.severity
  };
  
  // Agregar información específica según el tipo
  switch (this.eventType) {
    case 'PHASE_CHANGE':
      summary.phaseInfo = {
        from: this.changeDetails.previousPhase,
        to: this.changeDetails.newPhase
      };
      break;
      
    case 'PAYMENT_MADE':
      summary.paymentInfo = this.changeDetails.paymentInfo;
      break;
      
    case 'BUDGET_CHANGE':
      summary.budgetInfo = {
        previous: this.changeDetails.previousBudget,
        new: this.changeDetails.newBudget
      };
      break;
  }
  
  return summary;
};

// === MÉTODOS ESTÁTICOS ===

ContractHistorySchema.statics.isProtected = function(method) {
  const protectedMethods = ["get", "put", "delete", "createBatch", "updateBatch"];
  return protectedMethods.includes(method);
};

ContractHistorySchema.statics.findByContract = function(contractId, options = {}) {
  const { page = 1, limit = 50, eventType, dateFrom, dateTo } = options;
  
  let query = { contract: contractId };
  
  if (eventType) {
    query.eventType = eventType.toUpperCase();
  }
  
  if (dateFrom || dateTo) {
    query.eventDate = {};
    if (dateFrom) query.eventDate.$gte = new Date(dateFrom);
    if (dateTo) query.eventDate.$lte = new Date(dateTo);
  }
  
  return this.paginate(query, {
    page,
    limit,
    sort: { eventDate: -1 },
    populate: [
      {
        path: 'contract',
        select: 'contractNumber contractualObject'
      },
      {
        path: 'changeDetails.previousPhase',
        select: 'name code'
      },
      {
        path: 'changeDetails.newPhase',
        select: 'name code'
      }
    ]
  });
};

ContractHistorySchema.statics.findByUser = function(userId, options = {}) {
  return this.find({ 'user.userId': userId })
    .sort({ eventDate: -1 })
    .limit(options.limit || 100);
};

ContractHistorySchema.statics.findByEventType = function(eventType, options = {}) {
  return this.find({ eventType: eventType.toUpperCase() })
    .sort({ eventDate: -1 })
    .limit(options.limit || 100);
};

ContractHistorySchema.statics.getRecentActivity = function(contractId, hours = 24) {
  const since = new Date();
  since.setHours(since.getHours() - hours);
  
  return this.find({
    contract: contractId,
    eventDate: { $gte: since }
  }).sort({ eventDate: -1 });
};

ContractHistorySchema.statics.getCriticalEvents = function(contractId) {
  return this.find({
    contract: contractId,
    'classification.severity': 'CRITICAL'
  }).sort({ eventDate: -1 });
};

ContractHistorySchema.statics.getEventStatistics = function(contractId) {
  return this.aggregate([
    { $match: { contract: mongoose.Types.ObjectId(contractId) } },
    {
      $group: {
        _id: '$eventType',
        count: { $sum: 1 },
        lastEvent: { $max: '$eventDate' },
        users: { $addToSet: '$user.name' }
      }
    },
    { $sort: { count: -1 } }
  ]);
};

// === VIRTUALES ===

ContractHistorySchema.virtual('timeAgo').get(function() {
  const now = new Date();
  const diffMs = now - this.eventDate;
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffDays > 0) return `Hace ${diffDays} día${diffDays > 1 ? 's' : ''}`;
  if (diffHours > 0) return `Hace ${diffHours} hora${diffHours > 1 ? 's' : ''}`;
  
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  if (diffMinutes > 0) return `Hace ${diffMinutes} minuto${diffMinutes > 1 ? 's' : ''}`;
  
  return 'Hace un momento';
});

ContractHistorySchema.virtual('eventTypeDisplay').get(function() {
  const displayNames = {
    'CREATION': 'Creación',
    'PHASE_CHANGE': 'Cambio de Fase',
    'STATUS_CHANGE': 'Cambio de Estado',
    'DOCUMENT_UPLOAD': 'Subida de Documento',
    'DOCUMENT_APPROVAL': 'Aprobación de Documento',
    'DOCUMENT_REJECTION': 'Rechazo de Documento',
    'DATA_MODIFICATION': 'Modificación de Datos',
    'BUDGET_CHANGE': 'Cambio Presupuestario',
    'TIMELINE_CHANGE': 'Cambio de Cronograma',
    'CONTRACTOR_CHANGE': 'Cambio de Contratista',
    'AWARD': 'Adjudicación',
    'CONTRACT_SIGNING': 'Firma de Contrato',
    'PAYMENT_MADE': 'Pago Realizado',
    'OBSERVATION_ADDED': 'Observación Agregada',
    'PHASE_COMPLETION': 'Completar Fase',
    'PROCESS_CANCELLATION': 'Cancelación del Proceso',
    'EXTENSION_REQUEST': 'Solicitud de Prórroga',
    'AMENDMENT': 'Modificación Contractual',
    'LIQUIDATION': 'Liquidación',
    'CLOSURE': 'Cierre'
  };
  
  return displayNames[this.eventType] || this.eventType;
});

// === QUERY HELPERS ===

ContractHistorySchema.query.byEventType = function(eventType) {
  return this.where({ eventType: eventType.toUpperCase() });
};

ContractHistorySchema.query.recent = function(hours = 24) {
  const since = new Date();
  since.setHours(since.getHours() - hours);
  return this.where({ eventDate: { $gte: since } });
};

ContractHistorySchema.query.critical = function() {
  return this.where({ 'classification.severity': 'CRITICAL' });
};

ContractHistorySchema.query.byUser = function(userId) {
  return this.where({ 'user.userId': userId });
};

ContractHistorySchema.query.systemGenerated = function() {
  return this.where({ 'classification.isSystemGenerated': true });
};

// === ÍNDICES ADICIONALES ===

ContractHistorySchema.index({ contract: 1, eventDate: -1 });
ContractHistorySchema.index({ eventType: 1, eventDate: -1 });
ContractHistorySchema.index({ 'user.userId': 1, eventDate: -1 });
ContractHistorySchema.index({ eventDate: -1 });
ContractHistorySchema.index({ 'classification.severity': 1 });
ContractHistorySchema.index({ 'classification.category': 1 });
ContractHistorySchema.index({ 'classification.isSystemGenerated': 1 });

// Índices compuestos para consultas frecuentes
ContractHistorySchema.index({ 
  contract: 1, 
  eventType: 1, 
  eventDate: -1 
});

ContractHistorySchema.index({ 
  eventType: 1, 
  'classification.severity': 1, 
  eventDate: -1 
});

// Índice de texto para búsqueda en descripciones
ContractHistorySchema.index({ 
  description: "text", 
  observations: "text",
  "user.name": "text"
});

// === HOOKS Y PLUGINS ===

// Plugin de paginación
ContractHistorySchema.plugin(mongoosePaginate);

export const ContractHistory = mongoose.model("ContractHistory", ContractHistorySchema);