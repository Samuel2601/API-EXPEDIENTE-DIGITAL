// src/module/exp-digital/models/contract.scheme.js
import mongoose from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";
import {
  setupBaseSchema,
  CommonValidators,
} from "../../core/base/models/base.scheme.js";
import { stripMetaFields } from "../../../../utils/meta-field.js";

const { Schema } = mongoose;

// Sub-esquema para información del contratista
const ContractorJSON = {
  ruc: {
    type: String,
    trim: true,
    maxlength: 13,
    validate: {
      validator: function (v) {
        return !v || /^[0-9]{10,13}$/.test(v);
      },
      message: "El RUC debe tener entre 10 y 13 dígitos",
    },
    meta: {
      validation: { optional: true },
      messages: {
        invalid: "El RUC debe tener un formato válido",
      },
    },
  },

  businessName: {
    type: String,
    trim: true,
    maxlength: 300,
    meta: {
      validation: { isString: true, optional: true, isLength: { max: 300 } },
      messages: {
        isString: "La razón social debe ser un texto válido",
        isLength: "La razón social no puede exceder 300 caracteres",
      },
    },
  },

  tradeName: {
    type: String,
    trim: true,
    maxlength: 200,
    meta: {
      validation: { isString: true, optional: true, isLength: { max: 200 } },
      messages: {
        isString: "El nombre comercial debe ser un texto válido",
        isLength: "El nombre comercial no puede exceder 200 caracteres",
      },
    },
  },

  legalRepresentative: {
    type: String,
    trim: true,
    maxlength: 200,
    meta: {
      validation: { isString: true, optional: true, isLength: { max: 200 } },
      messages: {
        isString: "El representante legal debe ser un texto válido",
        isLength: "El representante legal no puede exceder 200 caracteres",
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
        isEmail: "El email del contratista no es válido",
      },
    },
  },

  phone: {
    type: String,
    trim: true,
    maxlength: 20,
    validate: {
      validator: function (v) {
        return !v || /^[\d\-\+\(\)\s]{7,20}$/.test(v);
      },
      message: "El teléfono debe tener un formato válido",
    },
    meta: {
      validation: { optional: true },
      messages: {
        invalid: "El teléfono debe tener un formato válido",
      },
    },
  },

  address: {
    type: String,
    trim: true,
    maxlength: 500,
    meta: {
      validation: { isString: true, optional: true, isLength: { max: 500 } },
      messages: {
        isString: "La dirección debe ser un texto válido",
        isLength: "La dirección no puede exceder 500 caracteres",
      },
    },
  },

  contactPerson: {
    name: {
      type: String,
      trim: true,
      maxlength: 150,
    },
    phone: {
      type: String,
      trim: true,
      maxlength: 20,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 100,
      validate: CommonValidators.email,
    },
  },
};

// Sub-esquema para control de fases
const PhaseControlJSON = {
  phase: {
    type: Schema.Types.ObjectId,
    ref: "ContractPhase",
    required: true,
    meta: {
      validation: { isMongoId: true, required: true },
      messages: {
        required: "La fase es obligatoria",
        isMongoId: "El ID de la fase no es válido",
      },
    },
  },

  status: {
    type: String,
    enum: {
      values: [
        "PENDING",
        "IN_PROGRESS",
        "COMPLETED",
        "NOT_APPLICABLE",
        "BLOCKED",
        "CANCELLED",
      ],
      message: "Estado de fase no válido",
    },
    default: "PENDING",
    uppercase: true,
    meta: {
      validation: {
        isIn: [
          "PENDING",
          "IN_PROGRESS",
          "COMPLETED",
          "NOT_APPLICABLE",
          "BLOCKED",
          "CANCELLED",
        ],
        optional: true,
      },
      messages: {
        isIn: "El estado debe ser uno de los valores válidos",
      },
    },
  },

  startDate: {
    type: Date,
    meta: {
      validation: { isDate: true, optional: true },
      messages: {
        isDate: "La fecha de inicio debe ser válida",
      },
    },
  },

  completionDate: {
    type: Date,
    meta: {
      validation: { isDate: true, optional: true },
      messages: {
        isDate: "La fecha de finalización debe ser válida",
      },
    },
  },

  estimatedCompletionDate: {
    type: Date,
    meta: {
      validation: { isDate: true, optional: true },
      messages: {
        isDate: "La fecha estimada debe ser válida",
      },
    },
  },

  observations: {
    type: String,
    trim: true,
    maxlength: 1000,
    meta: {
      validation: { isString: true, optional: true, isLength: { max: 1000 } },
      messages: {
        isString: "Las observaciones deben ser un texto válido",
        isLength: "Las observaciones no pueden exceder 1000 caracteres",
      },
    },
  },

  responsible: {
    name: {
      type: String,
      trim: true,
      maxlength: 150,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 100,
      validate: CommonValidators.email,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },

  documentsCompleted: {
    type: Number,
    min: 0,
    default: 0,
  },

  documentsTotal: {
    type: Number,
    min: 0,
    default: 0,
  },
};

export const ContractJSON = {
  contractNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    maxlength: 50,
    meta: {
      validation: {
        isString: true,
        required: true,
        notEmpty: true,
        isLength: { min: 3, max: 50 },
      },
      messages: {
        required: "El número de contrato es obligatorio",
        isString: "El número de contrato debe ser un texto válido",
        notEmpty: "El número de contrato no puede estar vacío",
        isLength: "El número de contrato debe tener entre 3 y 50 caracteres",
      },
    },
  },

  sercopCode: {
    type: String,
    trim: true,
    maxlength: 50,
    index: true,
    meta: {
      validation: { isString: true, optional: true, isLength: { max: 50 } },
      messages: {
        isString: "El código SERCOP debe ser un texto válido",
        isLength: "El código SERCOP no puede exceder 50 caracteres",
      },
    },
  },

  // Información básica del contrato
  contractType: {
    type: Schema.Types.ObjectId,
    ref: "ContractType",
    required: true,
    index: true,
    meta: {
      validation: { isMongoId: true, required: true },
      messages: {
        required: "El tipo de contratación es obligatorio",
        isMongoId: "El ID del tipo de contratación no es válido",
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

  // Detalles del objeto contractual
  contractualObject: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000,
    meta: {
      validation: {
        isString: true,
        required: true,
        notEmpty: true,
        isLength: { min: 10, max: 1000 },
      },
      messages: {
        required: "El objeto contractual es obligatorio",
        isString: "El objeto contractual debe ser un texto válido",
        notEmpty: "El objeto contractual no puede estar vacío",
        isLength: "El objeto contractual debe tener entre 10 y 1000 caracteres",
      },
    },
  },

  detailedDescription: {
    type: String,
    trim: true,
    maxlength: 5000,
    meta: {
      validation: { isString: true, optional: true, isLength: { max: 5000 } },
      messages: {
        isString: "La descripción detallada debe ser un texto válido",
        isLength: "La descripción detallada no puede exceder 5000 caracteres",
      },
    },
  },

  cpcClassifier: {
    type: String,
    trim: true,
    maxlength: 20,
    meta: {
      validation: { isString: true, optional: true, isLength: { max: 20 } },
      messages: {
        isString: "El clasificador CPC debe ser un texto válido",
        isLength: "El clasificador CPC no puede exceder 20 caracteres",
      },
    },
  },

  // Información presupuestaria
  budget: {
    estimatedValue: {
      type: Number,
      required: true,
      min: 0,
      meta: {
        validation: { isNumeric: true, required: true, min: 0 },
        messages: {
          required: "El valor estimado es obligatorio",
          isNumeric: "El valor estimado debe ser numérico",
          min: "El valor estimado no puede ser negativo",
        },
      },
    },

    awardedValue: {
      type: Number,
      min: 0,
      meta: {
        validation: { isNumeric: true, optional: true, min: 0 },
        messages: {
          isNumeric: "El valor adjudicado debe ser numérico",
          min: "El valor adjudicado no puede ser negativo",
        },
      },
    },

    paidValue: {
      type: Number,
      min: 0,
      default: 0,
      meta: {
        validation: { isNumeric: true, optional: true, min: 0 },
        messages: {
          isNumeric: "El valor pagado debe ser numérico",
          min: "El valor pagado no puede ser negativo",
        },
      },
    },

    currency: {
      type: String,
      enum: ["USD", "EUR", "COP"],
      default: "USD",
      uppercase: true,
      meta: {
        validation: { isIn: ["USD", "EUR", "COP"], optional: true },
        messages: {
          isIn: "La moneda debe ser una de las opciones válidas",
        },
      },
    },

    budgetSource: {
      type: String,
      trim: true,
      maxlength: 100,
    },

    budgetLine: {
      type: String,
      trim: true,
      maxlength: 50,
    },
  },

  // Fechas importantes del proceso
  timeline: {
    processStartDate: {
      type: Date,
      meta: {
        validation: { isDate: true, optional: true },
        messages: {
          isDate: "La fecha de inicio del proceso debe ser válida",
        },
      },
    },

    publicationDate: {
      type: Date,
      meta: {
        validation: { isDate: true, optional: true },
        messages: {
          isDate: "La fecha de publicación debe ser válida",
        },
      },
    },

    questionsDeadline: {
      type: Date,
      meta: {
        validation: { isDate: true, optional: true },
        messages: {
          isDate: "La fecha límite para preguntas debe ser válida",
        },
      },
    },

    submissionDeadline: {
      type: Date,
      meta: {
        validation: { isDate: true, optional: true },
        messages: {
          isDate: "La fecha límite de presentación debe ser válida",
        },
      },
    },

    openingDate: {
      type: Date,
      meta: {
        validation: { isDate: true, optional: true },
        messages: {
          isDate: "La fecha de apertura debe ser válida",
        },
      },
    },

    awardDate: {
      type: Date,
      meta: {
        validation: { isDate: true, optional: true },
        messages: {
          isDate: "La fecha de adjudicación debe ser válida",
        },
      },
    },

    contractSigningDate: {
      type: Date,
      meta: {
        validation: { isDate: true, optional: true },
        messages: {
          isDate: "La fecha de firma del contrato debe ser válida",
        },
      },
    },

    executionStartDate: {
      type: Date,
      meta: {
        validation: { isDate: true, optional: true },
        messages: {
          isDate: "La fecha de inicio de ejecución debe ser válida",
        },
      },
    },

    executionEndDate: {
      type: Date,
      meta: {
        validation: { isDate: true, optional: true },
        messages: {
          isDate: "La fecha de fin de ejecución debe ser válida",
        },
      },
    },

    executionPeriod: {
      type: Number,
      min: 1,
      max: 1825, // 5 años máximo
      meta: {
        validation: { isNumeric: true, optional: true, min: 1, max: 1825 },
        messages: {
          isNumeric: "El plazo de ejecución debe ser numérico",
          min: "El plazo mínimo es 1 día",
          max: "El plazo máximo es 1825 días (5 años)",
        },
      },
    },
  },

  // Información del contratista
  contractor: {
    type: ContractorJSON,
    default: {},
    meta: {
      validation: { optional: true },
      messages: {
        invalid: "Los datos del contratista deben ser válidos",
      },
    },
  },

  // Estado general del proceso
  generalStatus: {
    type: String,
    enum: {
      values: [
        "PREPARATION",
        "CALL",
        "EVALUATION",
        "AWARD",
        "CONTRACTING",
        "EXECUTION",
        "RECEPTION",
        "LIQUIDATED",
        "FINISHED",
        "DESERTED",
        "CANCELLED",
      ],
      message: "Estado general no válido",
    },
    default: "PREPARATION",
    uppercase: true,
    index: true,
    meta: {
      validation: {
        isIn: [
          "PREPARATION",
          "CALL",
          "EVALUATION",
          "AWARD",
          "CONTRACTING",
          "EXECUTION",
          "RECEPTION",
          "LIQUIDATED",
          "FINISHED",
          "DESERTED",
          "CANCELLED",
        ],
        optional: true,
      },
      messages: {
        isIn: "El estado general debe ser uno de los valores válidos",
      },
    },
  },

  // Fase actual del proceso
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

  // Control de fases del proceso
  phases: {
    type: [PhaseControlJSON],
    default: [],
    validate: {
      validator: function (v) {
        return v.length <= 20;
      },
      message: "No se pueden tener más de 20 fases",
    },
    meta: {
      validation: { isArray: true, optional: true },
      messages: {
        isArray: "Las fases deben ser una lista válida",
      },
    },
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

  // Control de estado
  isActive: {
    type: Boolean,
    default: true,
    index: true,
    meta: {
      validation: { isBoolean: true, optional: true },
      messages: {
        isBoolean: "El estado activo debe ser verdadero o falso",
      },
    },
  },
};

// Crear el esquema con campos base
const ContractSchema = new Schema(stripMetaFields(ContractJSON), {
  timestamps: true,
  collection: "contracts",
});

// Aplicar configuración base
setupBaseSchema(ContractSchema, {
  addTimestamps: true,
  addIndexes: true,
  addVirtuals: true,
  addMethods: true,
  addStatics: true,
  addHelpers: true,
  addBaseFields: true,
});

// === MIDDLEWARES PERSONALIZADOS ===

// Pre-save: validaciones personalizadas
ContractSchema.pre("save", async function (next) {
  // Validar fechas de cronograma
  const timeline = this.timeline;

  if (timeline.executionStartDate && timeline.executionEndDate) {
    if (timeline.executionStartDate >= timeline.executionEndDate) {
      return next(
        new Error(
          "La fecha de inicio de ejecución debe ser anterior a la fecha de fin"
        )
      );
    }
  }

  if (timeline.questionsDeadline && timeline.submissionDeadline) {
    if (timeline.questionsDeadline >= timeline.submissionDeadline) {
      return next(
        new Error(
          "La fecha límite de preguntas debe ser anterior a la de presentación"
        )
      );
    }
  }

  // Validar valores presupuestarios
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

  if (
    this.budget.paidValue >
    (this.budget.awardedValue || this.budget.estimatedValue)
  ) {
    return next(
      new Error(
        "El valor pagado no puede exceder el valor adjudicado o estimado"
      )
    );
  }

  next();
});

// === MÉTODOS DE INSTANCIA ===

ContractSchema.methods.toJSON = function () {
  const obj = this.toObject();
  return stripMetaFields(obj);
};

ContractSchema.methods.calculateProgress = function () {
  if (this.phases.length === 0) return 0;

  const completedPhases = this.phases.filter(
    (p) => p.status === "COMPLETED"
  ).length;
  return Math.round((completedPhases / this.phases.length) * 100);
};

ContractSchema.methods.getCurrentPhaseInfo = function () {
  if (!this.currentPhase) return null;

  return this.phases.find(
    (p) => p.phase.toString() === this.currentPhase.toString()
  );
};

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

ContractSchema.methods.canAdvanceToNextPhase = function () {
  const currentPhaseInfo = this.getCurrentPhaseInfo();
  return currentPhaseInfo && currentPhaseInfo.status === "COMPLETED";
};

ContractSchema.methods.getDaysRemaining = function () {
  if (!this.timeline.executionEndDate) return null;

  const today = new Date();
  const endDate = new Date(this.timeline.executionEndDate);
  const diffTime = endDate - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return diffDays;
};

ContractSchema.methods.isOverdue = function () {
  const daysRemaining = this.getDaysRemaining();
  return daysRemaining !== null && daysRemaining < 0;
};

ContractSchema.methods.getBudgetUtilization = function () {
  if (!this.budget.awardedValue && !this.budget.estimatedValue) return 0;

  const baseValue = this.budget.awardedValue || this.budget.estimatedValue;
  return Math.round((this.budget.paidValue / baseValue) * 100);
};

// === MÉTODOS ESTÁTICOS ===

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

ContractSchema.statics.findByStatus = function (status) {
  return this.findActive({ generalStatus: status.toUpperCase() });
};

ContractSchema.statics.findByContractType = function (contractTypeId) {
  return this.findActive({ contractType: contractTypeId });
};

ContractSchema.statics.findByDepartment = function (departmentId) {
  return this.findActive({ requestingDepartment: departmentId });
};

ContractSchema.statics.findOverdue = function () {
  const today = new Date();
  return this.findActive({
    "timeline.executionEndDate": { $lt: today },
    generalStatus: { $nin: ["FINISHED", "LIQUIDATED", "CANCELLED"] },
  });
};

ContractSchema.statics.findByValueRange = function (minValue, maxValue) {
  const query = { "budget.estimatedValue": {} };
  if (minValue !== undefined) query["budget.estimatedValue"].$gte = minValue;
  if (maxValue !== undefined) query["budget.estimatedValue"].$lte = maxValue;

  return this.findActive(query);
};

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

// === VIRTUALES ===

ContractSchema.virtual("progress").get(function () {
  return this.calculateProgress();
});

ContractSchema.virtual("daysRemaining").get(function () {
  return this.getDaysRemaining();
});

ContractSchema.virtual("budgetUtilization").get(function () {
  return this.getBudgetUtilization();
});

ContractSchema.virtual("displayName").get(function () {
  return `${this.contractNumber} - ${this.contractualObject.substring(0, 50)}${this.contractualObject.length > 50 ? "..." : ""}`;
});

// === QUERY HELPERS ===

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

// === ÍNDICES ADICIONALES ===

ContractSchema.index({ contractNumber: 1 }, { unique: true });
ContractSchema.index({ sercopCode: 1 });
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

// === HOOKS Y PLUGINS ===

// Plugin de paginación
ContractSchema.plugin(mongoosePaginate);

export const Contract = mongoose.model("Contract", ContractSchema);
