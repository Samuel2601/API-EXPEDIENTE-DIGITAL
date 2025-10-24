// =============================================================================
// src/module/exp-digital/models/contract.scheme.js - OPTIMIZADO
// Esquema optimizado para evitar duplicaciones con el repositorio
// =============================================================================

import mongoose from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";
import {
  setupBaseSchema,
  CommonValidators,
} from "../../core/base/models/base.scheme.js";
import { stripMetaFields } from "../../../../utils/meta-field.js";

const { Schema } = mongoose;

export const ContractJSON = {
  // Identificadores únicos
  contractNumber: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    maxlength: 50,
    validate: {
      validator: function (v) {
        return /^[A-Z0-9-]{5,50}$/.test(v);
      },
      message: "El número de contrato debe tener un formato válido",
    },
    meta: {
      validation: {
        isString: true,
        required: true,
        notEmpty: true,
        isLength: { min: 5, max: 50 },
      },
      messages: {
        required: "El número de contrato es obligatorio",
        isString: "El número debe ser un texto válido",
        notEmpty: "El número no puede estar vacío",
        isLength: "El número debe tener entre 5 y 50 caracteres",
      },
    },
  },

  sercopCode: {
    type: String,
    uppercase: true,
    trim: true,
    maxlength: 30,
    sparse: true, // Permite nulls únicos
    index: true,
    meta: {
      validation: { isString: true, optional: true, isLength: { max: 30 } },
      messages: {
        isString: "El código SERCOP debe ser un texto válido",
        isLength: "El código SERCOP no puede exceder 30 caracteres",
      },
    },
  },

  // Información básica del contrato
  contractualObject: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500,
    meta: {
      validation: {
        isString: true,
        required: true,
        notEmpty: true,
        isLength: { min: 10, max: 500 },
      },
      messages: {
        required: "El objeto contractual es obligatorio",
        isString: "El objeto contractual debe ser un texto válido",
        notEmpty: "El objeto contractual no puede estar vacío",
        isLength: "El objeto contractual debe tener entre 10 y 500 caracteres",
      },
    },
  },

  detailedDescription: {
    type: String,
    trim: true,
    maxlength: 2000,
    meta: {
      validation: { isString: true, optional: true, isLength: { max: 2000 } },
      messages: {
        isString: "La descripción debe ser un texto válido",
        isLength: "La descripción no puede exceder 2000 caracteres",
      },
    },
  },

  // Referencias organizacionales
  contractType: {
    type: Schema.Types.ObjectId,
    ref: "ContractType",
    required: true,
    index: true,
    meta: {
      validation: { isMongoId: true, required: true },
      messages: {
        required: "El tipo de contrato es obligatorio",
        isMongoId: "El ID del tipo de contrato no es válido",
      },
    },
  },

  requestingDepartment: {
    type: Schema.Types.ObjectId,
    ref: "Department",
    required: true,
    index: true,
    meta: {
      validation: { isMongoId: true, required: true },
      messages: {
        required: "El departamento solicitante es obligatorio",
        isMongoId: "El ID del departamento no es válido",
      },
    },
  },

  // Control de fases
  currentPhase: {
    type: Schema.Types.ObjectId,
    ref: "ContractPhase",
    index: true,
    meta: {
      validation: { isMongoId: true, optional: true },
      messages: {
        isMongoId: "El ID de la fase actual no es válido",
      },
    },
  },

  // Estado general del contrato
  generalStatus: {
    type: String,
    enum: {
      values: [
        "DRAFT", // BORRADOR
        "PREPARATION", // PREPARACION
        "CALL", // CONVOCATORIA
        "EVALUATION", // EVALUACION
        "AWARD", // ADJUDICACION
        "CONTRACTING", // CONTRATACION
        "EXECUTION", // EJECUCION
        "FINISHED", // TERMINADO
        "LIQUIDATED", // LIQUIDADO
        "CANCELLED", // CANCELADO
        "SUSPENDED", // SUSPENDIDO
      ],
      message: "Estado general no válido",
    },
    default: "DRAFT",
    uppercase: true,
    index: true,
    meta: {
      validation: {
        isIn: [
          "DRAFT",
          "PREPARATION",
          "CALL",
          "EVALUATION",
          "AWARD",
          "CONTRACTING",
          "EXECUTION",
          "FINISHED",
          "LIQUIDATED",
          "CANCELLED",
          "SUSPENDED",
        ],
      },
      messages: {
        isIn: "El estado debe ser uno de los valores permitidos",
      },
    },
  },

  // Información del contratista
  contractor: {
    ruc: {
      type: String,
      trim: true,
      maxlength: 13,
      validate: {
        validator: function (v) {
          if (!v) return true; // Campo opcional
          return /^\d{10,13}$/.test(v);
        },
        message: "El RUC debe tener un formato válido",
      },
      index: true,
      meta: {
        validation: { optional: true },
        messages: {
          invalid:
            "El RUC debe contener solo números y tener entre 10-13 dígitos",
        },
      },
    },
    businessName: {
      type: String,
      trim: true,
      maxlength: 200,
      meta: {
        validation: {
          isString: true,
          optional: true,
          isLength: { max: 200 },
        },
        messages: {
          isString: "La razón social debe ser un texto válido",
          isLength: "La razón social no puede exceder 200 caracteres",
        },
      },
    },
    tradeName: {
      type: String,
      trim: true,
      maxlength: 200,
      meta: {
        validation: {
          isString: true,
          optional: true,
          isLength: { max: 200 },
        },
        messages: {
          isString: "El nombre comercial debe ser un texto válido",
          isLength: "El nombre comercial no puede exceder 200 caracteres",
        },
      },
    },
    legalRepresentative: {
      type: String,
      trim: true,
      maxlength: 150,
      meta: {
        validation: {
          isString: true,
          optional: true,
          isLength: { max: 150 },
        },
        messages: {
          isString: "El representante legal debe ser un texto válido",
          isLength: "El representante legal no puede exceder 150 caracteres",
        },
      },
    },
  },

  // Información presupuestaria
  budget: {
    estimatedValue: {
      type: Number,
      required: true,
      min: 0,
      index: true,
      meta: {
        validation: {
          isNumeric: true,
          required: true,
          min: 0,
        },
        messages: {
          required: "El valor estimado es obligatorio",
          isNumeric: "El valor estimado debe ser un número",
          min: "El valor estimado no puede ser negativo",
        },
      },
    },
    awardedValue: {
      type: Number,
      min: 0,
      meta: {
        validation: {
          isNumeric: true,
          optional: true,
          min: 0,
        },
        messages: {
          isNumeric: "El valor adjudicado debe ser un número",
          min: "El valor adjudicado no puede ser negativo",
        },
      },
    },
    paidValue: {
      type: Number,
      default: 0,
      min: 0,
      meta: {
        validation: {
          isNumeric: true,
          optional: true,
          min: 0,
        },
        messages: {
          isNumeric: "El valor pagado debe ser un número",
          min: "El valor pagado no puede ser negativo",
        },
      },
    },
  },

  // Cronograma del contrato
  timeline: {
    plannedStartDate: Date,
    plannedEndDate: Date,
    executionStartDate: Date,
    executionEndDate: {
      type: Date,
      index: true, // Para consultas de vencimiento
    },
    questionsDeadline: Date,
    submissionDeadline: Date,
  },

  // Fases del contrato
  // ✅ CORRECCIÓN: Solo información dinámica del contrato
  phases: {
    type: [
      {
        phase: {
          type: Schema.Types.ObjectId,
          ref: "ContractPhase",
          required: true,
        },
        status: {
          type: String,
          enum: ["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"],
          default: "PENDING",
          uppercase: true,
        },
        startDate: Date,
        endDate: Date,

        // ✅ OPCIONAL: Información específica de esta instancia
        actualStartDate: Date, // Fecha real de inicio (vs estimada)
        actualEndDate: Date, // Fecha real de fin (vs estimada)
        assignedTo: {
          // Usuario asignado a esta fase
          type: Schema.Types.ObjectId,
          ref: "User",
        },
        documents: {
          type: [
            {
              file: {
                type: Schema.Types.ObjectId,
                ref: "File",
                required: true,
              },
              documentType: {
                type: String,
                required: true,
              },
              uploadedBy: {
                type: Schema.Types.ObjectId,
                ref: "User",
                required: true,
              },
              uploadedAt: Date,
              observations: String,
              version: Number,
              status: {
                type: String,
                enum: ["active", "deleted"],
                default: "active",
              },
              isRequired: {
                type: Boolean,
                default: false,
              },
            },
          ],
          default: [],
        },
        notes: String, // Notas específicas de esta fase en este contrato
        completionPercentage: {
          // Progreso granular de la fase
          type: Number,
          min: 0,
          max: 100,
          default: 0,
        },
      },
    ],
    default: [],
  },

  // Metadatos adicionales
  metadata: {
    priority: {
      type: String,
      enum: ["LOW", "NORMAL", "HIGH", "URGENT"],
      default: "NORMAL",
      uppercase: true,
    },

    tags: {
      type: [String],
      default: [],
      validate: {
        validator: function (v) {
          return v.length <= 20;
        },
        message: "No se pueden tener más de 20 tags",
      },
    },

    externalReferences: {
      mamCode: String,
      sercaiCode: String,
      oldSystemId: String,
      otherReferences: Schema.Types.Mixed,
    },

    publicAccess: {
      type: Boolean,
      default: true,
    },
  },

  // Observaciones generales
  observations: {
    type: String,
    trim: true,
    maxlength: 2000,
    meta: {
      validation: { isString: true, optional: true, isLength: { max: 2000 } },
      messages: {
        isString: "Las observaciones deben ser un texto válido",
        isLength: "Las observaciones no pueden exceder 2000 caracteres",
      },
    },
  },
};

// === CONFIGURACIÓN DEL ESQUEMA ===

const ContractSchema = new Schema(stripMetaFields(ContractJSON), {
  timestamps: true,
  collection: "contracts",
});

setupBaseSchema(ContractSchema);

// === QUERY HELPERS ===
// ✅ MANTENIDOS: Para que el repositorio los utilice

ContractSchema.query.byStatus = function (status) {
  return this.where({ generalStatus: status.toUpperCase() });
};

ContractSchema.query.byDepartment = function (departmentId) {
  return this.where({ requestingDepartment: departmentId });
};

ContractSchema.query.byContractType = function (contractTypeId) {
  return this.where({ contractType: contractTypeId });
};

ContractSchema.query.overdue = function () {
  const today = new Date();
  return this.where({
    "timeline.executionEndDate": { $lt: today },
    generalStatus: { $nin: ["FINISHED", "LIQUIDATED", "CANCELLED"] },
  });
};

ContractSchema.query.inProgress = function () {
  return this.where({
    generalStatus: {
      $in: ["PREPARATION", "CALL", "EVALUATION", "CONTRACTING", "EXECUTION"],
    },
  });
};

ContractSchema.query.byValueRange = function (minValue, maxValue) {
  const query = {};
  if (minValue !== undefined) query.$gte = minValue;
  if (maxValue !== undefined) query.$lte = maxValue;
  return this.where({ "budget.estimatedValue": query });
};

ContractSchema.query.active = function () {
  return this.where({ isActive: true });
};

// === MÉTODOS DE INSTANCIA ===
// ✅ SOLO MÉTODOS SIMPLES DE CÁLCULO

ContractSchema.methods.toJSON = function () {
  const obj = this.toObject();
  return stripMetaFields(obj);
};

// ✅ MÉTODO SIMPLE: Calcular progreso basado en fases completadas
// ✅ MÉTODO MEJORADO
ContractSchema.methods.calculateProgress = function () {
  if (this.phases.length === 0) return 0;

  // Opción 1: Por fases completadas (actual)
  const completedPhases = this.phases.filter(
    (p) => p.status === "COMPLETED"
  ).length;
  const basicProgress = Math.round(
    (completedPhases / this.phases.length) * 100
  );

  // Opción 2: Considerar progreso granular de fases
  const totalProgress = this.phases.reduce((sum, phase) => {
    if (phase.status === "COMPLETED") return sum + 100;
    if (phase.status === "IN_PROGRESS")
      return sum + (phase.completionPercentage || 0);
    return sum;
  }, 0);

  const granularProgress = Math.round(totalProgress / this.phases.length);

  return granularProgress; // o basicProgress, según prefieras
};

ContractSchema.methods.getOrderedPhases = async function () {
  await this.populate({
    path: "phases.phase",
    select: "code name category order",
    options: { sort: { order: 1 } },
  });

  return this.phases.sort((a, b) => a.phase.order - b.phase.order);
};

// ✅ MÉTODO SIMPLE: Obtener información de la fase actual
ContractSchema.methods.getCurrentPhaseInfo = function () {
  if (!this.currentPhase) return null;

  return this.phases.find(
    (p) => p.phase.toString() === this.currentPhase.toString()
  );
};

// ✅ MÉTODO SIMPLE: Obtener siguiente fase
ContractSchema.methods.getNextPhase = function () {
  const currentPhaseIndex = this.phases.findIndex(
    (p) => p.phase.toString() === this.currentPhase?.toString()
  );

  if (
    currentPhaseIndex === -1 ||
    currentPhaseIndex === this.phases.length - 1
  ) {
    return null;
  }

  return this.phases[currentPhaseIndex + 1];
};

// ✅ MÉTODO SIMPLE: Verificar si puede avanzar a la siguiente fase
ContractSchema.methods.canAdvanceToNextPhase = function () {
  const currentPhaseInfo = this.getCurrentPhaseInfo();
  return currentPhaseInfo && currentPhaseInfo.status === "COMPLETED";
};

// ✅ MÉTODO SIMPLE: Calcular días restantes
ContractSchema.methods.getDaysRemaining = function () {
  if (!this.timeline.executionEndDate) return null;

  const today = new Date();
  const endDate = new Date(this.timeline.executionEndDate);
  const diffTime = endDate - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return diffDays;
};

// ✅ MÉTODO SIMPLE: Verificar si está vencido
ContractSchema.methods.isOverdue = function () {
  const daysRemaining = this.getDaysRemaining();
  return daysRemaining !== null && daysRemaining < 0;
};

// ✅ MÉTODO SIMPLE: Calcular utilización del presupuesto
ContractSchema.methods.getBudgetUtilization = function () {
  if (!this.budget.awardedValue && !this.budget.estimatedValue) return 0;

  const baseValue = this.budget.awardedValue || this.budget.estimatedValue;
  return Math.round((this.budget.paidValue / baseValue) * 100);
};

// === MÉTODOS ESTÁTICOS ===
// ✅ MÉTODOS ÚTILES PARA EL REPOSITORIO

ContractSchema.statics.isProtected = function (method) {
  const protectedMethods = [
    "get",
    "put",
    "delete",
    "createBatch",
    "updateBatch",
  ];
  return protectedMethods.includes(method);
};

// ✅ MÉTODO ESTÁTICO: Buscar por rango de valores
ContractSchema.statics.findByValueRange = function (minValue, maxValue) {
  const query = { "budget.estimatedValue": {} };
  if (minValue !== undefined) query["budget.estimatedValue"].$gte = minValue;
  if (maxValue !== undefined) query["budget.estimatedValue"].$lte = maxValue;

  return this.findActive(query);
};

// ✅ MÉTODO ESTÁTICO: Obtener estadísticas por departamento
ContractSchema.statics.getStatsByDepartment = function () {
  return this.aggregate([
    { $match: { isActive: true } },
    {
      $group: {
        _id: "$requestingDepartment",
        count: { $sum: 1 },
        totalValue: { $sum: "$budget.estimatedValue" },
        avgValue: { $avg: "$budget.estimatedValue" },
      },
    },
    { $sort: { count: -1 } },
  ]);
};

// ✅ MÉTODO ESTÁTICO: Obtener estadísticas por estado
ContractSchema.statics.getStatsByStatus = function () {
  return this.aggregate([
    { $match: { isActive: true } },
    {
      $group: {
        _id: "$generalStatus",
        count: { $sum: 1 },
        totalValue: { $sum: "$budget.estimatedValue" },
        avgValue: { $avg: "$budget.estimatedValue" },
      },
    },
    { $sort: { count: -1 } },
  ]);
};

// === VIRTUALES ===

ContractSchema.virtual("progress").get(function () {
  try {
    return this.calculateProgress();
  } catch (error) {
    return 0;
  }
});

ContractSchema.virtual("daysRemaining").get(function () {
  try {
    return this.getDaysRemaining();
  } catch (error) {
    return null;
  }
});

ContractSchema.virtual("budgetUtilization").get(function () {
  try {
    return this.getBudgetUtilization();
  } catch (error) {
    return 0;
  }
});

ContractSchema.virtual("displayName").get(function () {
  try {
    if (!this.contractNumber || !this.contractualObject) {
      return this.contractNumber || "Sin número";
    }
    return `${this.contractNumber} - ${this.contractualObject.substring(0, 50)}${
      this.contractualObject.length > 50 ? "..." : ""
    }`;
  } catch (error) {
    return "Error en displayName";
  }
});

// === MIDDLEWARES MEJORADOS ===

// Pre-save: Validaciones básicas y normalización
ContractSchema.pre("save", function (next) {
  // Normalizar números de contrato y códigos
  if (this.contractNumber) {
    this.contractNumber = this.contractNumber.toUpperCase().trim();
  }

  if (this.sercopCode) {
    this.sercopCode = this.sercopCode.toUpperCase().trim();
  }

  // Normalizar tags
  if (this.metadata.tags && this.metadata.tags.length > 0) {
    this.metadata.tags = this.metadata.tags
      .map((tag) => tag.trim().toLowerCase())
      .filter((tag) => tag);
  }

  // Validaciones de fechas básicas
  if (this.timeline.executionStartDate && this.timeline.executionEndDate) {
    if (this.timeline.executionStartDate >= this.timeline.executionEndDate) {
      return next(
        new Error(
          "La fecha de inicio de ejecución debe ser anterior a la fecha de fin"
        )
      );
    }
  }

  if (this.timeline.questionsDeadline && this.timeline.submissionDeadline) {
    if (this.timeline.questionsDeadline >= this.timeline.submissionDeadline) {
      return next(
        new Error(
          "La fecha límite de preguntas debe ser anterior a la de presentación"
        )
      );
    }
  }

  next();
});

// Pre-save: Validación presupuestaria básica
ContractSchema.pre("save", function (next) {
  // Advertencia si el valor adjudicado excede significativamente el estimado
  if (this.budget.awardedValue && this.budget.estimatedValue) {
    const variation =
      (this.budget.awardedValue / this.budget.estimatedValue) * 100;
    if (variation > 150) {
      // 50% más que el estimado
      console.warn(
        `Contrato ${this.contractNumber}: Valor adjudicado excede significativamente el estimado`
      );
    }
  }

  // Error si el pagado excede el adjudicado/estimado
  const maxAllowed = this.budget.awardedValue || this.budget.estimatedValue;
  if (this.budget.paidValue > maxAllowed) {
    return next(
      new Error(
        "El valor pagado no puede exceder el valor adjudicado o estimado"
      )
    );
  }

  next();
});

// === ÍNDICES OPTIMIZADOS ===

ContractSchema.index({ contractNumber: 1 }, { unique: true });
ContractSchema.index({ sercopCode: 1 }, { sparse: true });
ContractSchema.index({ contractType: 1, generalStatus: 1 });
ContractSchema.index({ requestingDepartment: 1, generalStatus: 1 });
ContractSchema.index({ generalStatus: 1, createdAt: -1 });
ContractSchema.index({ currentPhase: 1 });
ContractSchema.index({ "contractor.ruc": 1 });
ContractSchema.index({ "budget.estimatedValue": -1 });
ContractSchema.index({ "timeline.executionEndDate": 1 });
ContractSchema.index({ "metadata.tags": 1 });

// Índice de texto para búsqueda completa
ContractSchema.index({
  contractNumber: "text",
  contractualObject: "text",
  detailedDescription: "text",
  "contractor.businessName": "text",
  "contractor.tradeName": "text",
  observations: "text",
});

// Índices compuestos para consultas frecuentes
ContractSchema.index({
  generalStatus: 1,
  requestingDepartment: 1,
  createdAt: -1,
});

ContractSchema.index({
  contractType: 1,
  "budget.estimatedValue": -1,
});

// === CONFIGURACIÓN FINAL ===

// Incluir virtuals en JSON y Object
ContractSchema.set("toJSON", { virtuals: true });
ContractSchema.set("toObject", { virtuals: true });

// Plugin de paginación
ContractSchema.plugin(mongoosePaginate);

// === EXPORTACIÓN ===

export const Contract = mongoose.model("Contract", ContractSchema);
