// src/module/exp-digital/models/contract-phase.scheme.js
import mongoose from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";
import {
  setupBaseSchema,
  CommonValidators,
} from "../../core/base/models/base.scheme.js";
import { stripMetaFields } from "../../../../utils/meta-field.js";

const { Schema } = mongoose;

// Sub-esquema para documentos requeridos
const RequiredDocumentJSON = {
  code: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
    maxlength: 150,
    meta: {
      validation: {
        isString: true,
        required: true,
        notEmpty: true,
        isLength: { min: 2, max: 150 },
      },
      messages: {
        required: "El código del documento es obligatorio",
        isString: "El código debe ser un texto válido",
        notEmpty: "El código no puede estar vacío",
        isLength: "El código debe tener entre 2 y 150 caracteres",
      },
    },
  },

  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200,
    meta: {
      validation: {
        isString: true,
        required: true,
        notEmpty: true,
        isLength: { min: 3, max: 200 },
      },
      messages: {
        required: "El nombre del documento es obligatorio",
        isString: "El nombre debe ser un texto válido",
        notEmpty: "El nombre no puede estar vacío",
        isLength: "El nombre debe tener entre 3 y 200 caracteres",
      },
    },
  },

  description: {
    type: String,
    trim: true,
    maxlength: 1000,
    meta: {
      validation: { isString: true, optional: true, isLength: { max: 1000 } },
      messages: {
        isString: "La descripción debe ser un texto válido",
        isLength: "La descripción no puede exceder 1000 caracteres",
      },
    },
  },

  isMandatory: {
    type: Boolean,
    default: true,
    meta: {
      validation: { isBoolean: true, optional: true },
      messages: {
        isBoolean: "El campo obligatorio debe ser verdadero o falso",
      },
    },
  },

  allowedFileTypes: {
    type: [String],
    default: ["pdf"],
    enum: {
      values: [
        "pdf",
        "doc",
        "docx",
        "xls",
        "xlsx",
        "jpg",
        "jpeg",
        "png",
        "zip",
        "rar",
      ],
      message: "Tipo de archivo no permitido",
    },
  },

  maxFileSize: {
    type: Number,
    min: 1024,
    max: 52428800,
    default: 10485760,
    meta: {
      validation: { isNumeric: true, min: 1024, max: 52428800 },
      messages: {
        isNumeric: "El tamaño máximo de archivo debe ser numérico",
        min: "El tamaño máximo de archivo no puede ser menor a 1024",
        max: "El tamaño máximo de archivo no puede ser mayor a 52428800",
      },
    },
  },

  template: {
    fileName: { type: String, trim: true, maxlength: 200 },
    filePath: { type: String, trim: true, maxlength: 500 },
    isRequired: { type: Boolean, default: false },
  },

  validationRules: {
    requiresSignature: { type: Boolean, default: false },
    requiresStamp: { type: Boolean, default: false },
    expirationDays: { type: Number, min: 0, max: 365, default: 0 },
    customValidation: { type: String, maxlength: 500 },
  },
};

// Configuración específica por tipo de contrato (ÚNICA fuente de verdad)
const TypeSpecificConfigJSON = {
  contractType: {
    type: Schema.Types.ObjectId,
    ref: "ContractType",
    required: true,
    index: true,
  },
  excludedDocuments: [
    {
      type: String,
      uppercase: true,
      trim: true,
    },
  ],
  customDuration: {
    type: Number,
    min: 1,
    max: 365,
  },
  additionalDocuments: [RequiredDocumentJSON],
  overridePhaseConfig: {
    isOptional: { type: Boolean },
    allowParallel: { type: Boolean },
    requiresApproval: { type: Boolean },
    autoAdvance: { type: Boolean },
    notificationDays: { type: Number, min: 0, max: 30 },
  },
};

export const ContractPhaseJSON = {
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    maxlength: 15,
    validate: {
      validator: function (v) {
        return /^[A-Z_]{2,15}$/.test(v);
      },
      message: "El código debe contener solo letras mayúsculas y guiones bajos",
    },
  },

  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 150,
  },

  shortName: {
    type: String,
    trim: true,
    maxlength: 30,
  },

  description: {
    type: String,
    trim: true,
    maxlength: 2000,
  },

  order: {
    type: Number,
    required: true,
    min: 1,
    max: 100,
    index: true,
  },

  // Categorías alineadas con LOSNCP/SERCOP
  category: {
    type: String,
    enum: {
      values: [
        "PLANIFICACION",
        "PREPARACION",
        "EVALUACION",
        "ADJUDICACION",
        "EJECUCION",
        "LIQUIDACION",
        "ARCHIVO",
      ],
      message: "Categoría no válida según LOSNCP",
    },
    required: true,
    uppercase: true,
  },

  requiredDocuments: {
    type: [RequiredDocumentJSON],
    default: [],
    validate: {
      validator: function (v) {
        return v.length <= 50;
      },
      message: "No se pueden especificar más de 50 documentos por fase",
    },
  },

  // ÚNICA fuente de verdad para relación con tipos de contrato
  typeSpecificConfig: {
    type: [TypeSpecificConfigJSON],
    default: [],
    validate: {
      validator: function (v) {
        return v.length <= 20;
      },
      message: "No se pueden configurar más de 20 tipos específicos",
    },
  },

  phaseConfig: {
    isOptional: { type: Boolean, default: false },
    allowParallel: { type: Boolean, default: false },
    estimatedDays: { type: Number, min: 0, max: 365, default: 5 },
    requiresApproval: { type: Boolean, default: true },
    autoAdvance: { type: Boolean, default: false },
    notificationDays: { type: Number, min: 0, max: 30, default: 3 },
  },

  dependencies: {
    requiredPhases: [
      {
        phase: { type: Schema.Types.ObjectId, ref: "ContractPhase" },
        status: {
          type: String,
          enum: ["COMPLETED", "IN_PROGRESS"],
          default: "COMPLETED",
        },
      },
    ],
    blockedBy: [{ type: Schema.Types.ObjectId, ref: "ContractPhase" }],
  },

  allowedRoles: {
    type: [String],
    default: [],
    validate: {
      validator: function (v) {
        return v.length <= 10;
      },
      message: "No se pueden especificar más de 10 roles",
    },
  },

  isActive: {
    type: Boolean,
    default: true,
    index: true,
  },
};

// Crear el esquema
const ContractPhaseSchema = new Schema(stripMetaFields(ContractPhaseJSON), {
  timestamps: true,
  collection: "contractphases",
});

// Aplicar configuración base
setupBaseSchema(ContractPhaseSchema, {
  addTimestamps: true,
  addIndexes: true,
  addVirtuals: true,
  addMethods: true,
  addStatics: true,
  addHelpers: true,
  addBaseFields: true,
});

// === MIDDLEWARES PERSONALIZADOS ===

ContractPhaseSchema.pre("save", async function (next) {
  // Validar orden único por categoría
  if (this.isModified("order") || this.isModified("category")) {
    const existing = await this.constructor.findOne({
      _id: { $ne: this._id },
      order: this.order,
      category: this.category,
      isActive: true,
    });

    if (existing) {
      const err = new Error.ValidationError(this);
      err.errors.order = new Error.ValidatorError({
        message: `Ya existe una fase con orden ${this.order} en la categoría ${this.category}`,
        path: "order",
        value: this.order,
      });
      return next(err);
    }
  }

  // Validar códigos únicos en documentos
  if (this.requiredDocuments && this.requiredDocuments.length > 0) {
    const codes = this.requiredDocuments.map((doc) => doc.code);
    const uniqueCodes = [...new Set(codes)];

    if (codes.length !== uniqueCodes.length) {
      const err = new Error.ValidationError(this);
      err.errors.requiredDocuments = new Error.ValidatorError({
        message: "Los códigos de documentos requeridos deben ser únicos",
        path: "requiredDocuments",
        value: this.requiredDocuments,
      });
      return next(err);
    }
  }

  // Validar que no haya duplicados en typeSpecificConfig.contractType
  if (this.typeSpecificConfig && this.typeSpecificConfig.length > 0) {
    const contractTypeIds = this.typeSpecificConfig.map((config) =>
      config.contractType.toString()
    );
    const uniqueIds = [...new Set(contractTypeIds)];

    if (contractTypeIds.length !== uniqueIds.length) {
      const err = new Error.ValidationError(this);
      err.errors.typeSpecificConfig = new Error.ValidatorError({
        message:
          "No puede haber configuraciones duplicadas para el mismo tipo de contrato",
        path: "typeSpecificConfig",
        value: this.typeSpecificConfig,
      });
      return next(err);
    }
  }

  next();
});

// === MÉTODOS DE INSTANCIA ===

ContractPhaseSchema.methods.getEffectiveDocuments = function (contractTypeId) {
  if (!contractTypeId) return this.requiredDocuments;

  const specificConfig = this.typeSpecificConfig.find(
    (config) => config.contractType.toString() === contractTypeId.toString()
  );

  if (!specificConfig) return this.requiredDocuments;

  const excluded = specificConfig.excludedDocuments || [];
  const additional = specificConfig.additionalDocuments || [];

  // Filtrar documentos base excluidos y agregar documentos adicionales
  const baseDocuments = this.requiredDocuments.filter(
    (doc) => !excluded.includes(doc.code)
  );
  return [...baseDocuments, ...additional];
};

ContractPhaseSchema.methods.getEffectiveDuration = function (contractTypeId) {
  if (!contractTypeId) return this.phaseConfig.estimatedDays;

  const specificConfig = this.typeSpecificConfig.find(
    (config) => config.contractType.toString() === contractTypeId.toString()
  );

  return specificConfig?.customDuration || this.phaseConfig.estimatedDays;
};

ContractPhaseSchema.methods.isApplicableToContractType = function (
  contractTypeId
) {
  return this.typeSpecificConfig.some(
    (config) => config.contractType.toString() === contractTypeId.toString()
  );
};

ContractPhaseSchema.methods.getMandatoryDocuments = function (
  contractTypeId = null
) {
  const effectiveDocuments = this.getEffectiveDocuments(contractTypeId);
  return effectiveDocuments.filter((doc) => doc.isMandatory);
};

ContractPhaseSchema.methods.getOptionalDocuments = function (
  contractTypeId = null
) {
  const effectiveDocuments = this.getEffectiveDocuments(contractTypeId);
  return effectiveDocuments.filter((doc) => !doc.isMandatory);
};

// === MÉTODOS ESTÁTICOS ===

ContractPhaseSchema.statics.findForContractType = function (contractTypeId) {
  return this.findActive({
    "typeSpecificConfig.contractType": contractTypeId,
  })
    .populate("typeSpecificConfig.contractType", "code name category")
    .populate("dependencies.requiredPhases.phase", "code name category order")
    .populate("dependencies.blockedBy", "code name category order")
    .sort({ order: 1 });
};

ContractPhaseSchema.statics.findByCategory = function (category) {
  return this.findActive({ category: category.toUpperCase() }).sort({
    order: 1,
  });
};

ContractPhaseSchema.statics.getPhaseSequenceForType = function (
  contractTypeId
) {
  return this.findForContractType(contractTypeId);
};

// === VIRTUALES ===
ContractPhaseSchema.virtual("displayName").get(function () {
  return this.shortName ? `${this.shortName} - ${this.name}` : this.name;
});

ContractPhaseSchema.virtual("documentCount").get(function () {
  return this.requiredDocuments ? this.requiredDocuments.length : 0;
});

// === QUERY HELPERS ===
ContractPhaseSchema.query.byCategory = function (category) {
  return this.where({ category: category.toUpperCase() });
};

ContractPhaseSchema.query.sequential = function () {
  return this.sort({ order: 1 });
};

ContractPhaseSchema.query.forContractType = function (contractTypeId) {
  return this.where({
    "typeSpecificConfig.contractType": contractTypeId,
  });
};

// === ÍNDICES ADICIONALES ===
ContractPhaseSchema.index({ code: 1 }, { unique: true });
ContractPhaseSchema.index({ category: 1, order: 1 });
ContractPhaseSchema.index({ order: 1, isActive: 1 });
ContractPhaseSchema.index({ "typeSpecificConfig.contractType": 1 });
ContractPhaseSchema.index({ "requiredDocuments.code": 1 });

// Índice de texto para búsqueda
ContractPhaseSchema.index({
  name: "text",
  shortName: "text",
  description: "text",
  code: "text",
  "requiredDocuments.name": "text",
});

// Plugin de paginación
ContractPhaseSchema.plugin(mongoosePaginate);

export const ContractPhase = mongoose.model(
  "ContractPhase",
  ContractPhaseSchema
);
