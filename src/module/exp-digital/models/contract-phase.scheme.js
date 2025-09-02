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
        isLength: { min: 2, max: 20 },
      },
      messages: {
        required: "El código del documento es obligatorio",
        isString: "El código debe ser un texto válido",
        notEmpty: "El código no puede estar vacío",
        isLength: "El código debe tener entre 2 y 20 caracteres",
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
    validate: {
      validator: function (v) {
        return v && v.length > 0 && v.length <= 10;
      },
      message: "Debe especificar al menos un tipo de archivo y máximo 10",
    },
    meta: {
      validation: { isArray: true },
      messages: {
        isArray: "Los tipos de archivo deben ser una lista",
      },
    },
  },

  maxFileSize: {
    type: Number,
    min: 1024, // 1KB mínimo
    max: 52428800, // 50MB máximo
    default: 10485760, // 10MB por defecto
    meta: {
      validation: { isNumeric: true, min: 1024, max: 52428800 },
      messages: {
        isNumeric: "El tamaño máximo debe ser numérico",
        min: "El tamaño mínimo es 1KB",
        max: "El tamaño máximo es 50MB",
      },
    },
  },

  applicableTypes: {
    type: [
      {
        type: Schema.Types.ObjectId,
        ref: "ContractType",
        required: true,
      },
    ],
    default: [],
    validate: {
      validator: function (v) {
        return v.length <= 20;
      },
      message: "No se pueden especificar más de 20 tipos aplicables",
    },
    meta: {
      validation: {
        isArray: true,
        optional: true,
        eachValidator: { isMongoId: true },
      },
      messages: {
        isArray: "Los tipos aplicables deben ser una lista",
        isMongoId: "Cada tipo debe ser un ID válido de MongoDB",
      },
    },
  },

  template: {
    fileName: {
      type: String,
      trim: true,
      maxlength: 200,
    },
    filePath: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    isRequired: {
      type: Boolean,
      default: false,
    },
  },

  validationRules: {
    requiresSignature: {
      type: Boolean,
      default: false,
    },
    requiresStamp: {
      type: Boolean,
      default: false,
    },
    expirationDays: {
      type: Number,
      min: 0,
      max: 365,
      default: 0,
    },
    customValidation: {
      type: String,
      maxlength: 500,
    },
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
    meta: {
      validation: {
        isString: true,
        required: true,
        notEmpty: true,
        isLength: { min: 2, max: 15 },
      },
      messages: {
        required: "El código de la fase es obligatorio",
        isString: "El código debe ser un texto válido",
        notEmpty: "El código no puede estar vacío",
        isLength: "El código debe tener entre 2 y 15 caracteres",
      },
    },
  },

  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 150,
    meta: {
      validation: {
        isString: true,
        required: true,
        notEmpty: true,
        isLength: { min: 3, max: 150 },
      },
      messages: {
        required: "El nombre de la fase es obligatorio",
        isString: "El nombre debe ser un texto válido",
        notEmpty: "El nombre no puede estar vacío",
        isLength: "El nombre debe tener entre 3 y 150 caracteres",
      },
    },
  },

  shortName: {
    type: String,
    trim: true,
    maxlength: 30,
    meta: {
      validation: { isString: true, optional: true, isLength: { max: 30 } },
      messages: {
        isString: "El nombre corto debe ser un texto válido",
        isLength: "El nombre corto no puede exceder 30 caracteres",
      },
    },
  },

  description: {
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

  // Orden secuencial de la fase (1, 2, 3...)
  order: {
    type: Number,
    required: true,
    min: 1,
    max: 100,
    index: true,
    meta: {
      validation: { isNumeric: true, required: true, min: 1, max: 100 },
      messages: {
        required: "El orden de la fase es obligatorio",
        isNumeric: "El orden debe ser numérico",
        min: "El orden mínimo es 1",
        max: "El orden máximo es 100",
      },
    },
  },

  // Categoría de la fase
  category: {
    type: String,
    enum: {
      values: [
        "PREPARATORY",
        "PRECONTRACTUAL",
        "CONTRACTUAL",
        "EXECUTION",
        "CLOSURE",
        "PAYMENT",
        "RECEIPT",
      ],
      message: "Categoría no válida",
    },
    required: true,
    uppercase: true,
    meta: {
      validation: {
        isIn: [
          "PREPARATORY",
          "PRECONTRACTUAL",
          "CONTRACTUAL",
          "EXECUTION",
          "CLOSURE",
          "PAYMENT",
          "RECEIPT",
        ],
        required: true,
      },
      messages: {
        required: "La categoría es obligatoria",
        isIn: "La categoría debe ser una de las opciones válidas",
      },
    },
  },

  // Documentos requeridos en esta fase
  requiredDocuments: {
    type: [RequiredDocumentJSON],
    default: [],
    validate: {
      validator: function (v) {
        return v.length <= 50;
      },
      message: "No se pueden especificar más de 50 documentos por fase",
    },
    meta: {
      validation: { isArray: true, optional: true },
      messages: {
        isArray: "Los documentos requeridos deben ser una lista",
      },
    },
  },

  // Configuración de la fase
  phaseConfig: {
    isOptional: {
      type: Boolean,
      default: false,
    },
    allowParallel: {
      type: Boolean,
      default: false,
    },
    estimatedDays: {
      type: Number,
      min: 0,
      max: 365,
      default: 5,
    },
    requiresApproval: {
      type: Boolean,
      default: true,
    },
    autoAdvance: {
      type: Boolean,
      default: false,
    },
    notificationDays: {
      type: Number,
      min: 0,
      max: 30,
      default: 3,
    },
  },

  // Dependencias de otras fases
  dependencies: {
    requiredPhases: [
      {
        phase: {
          type: Schema.Types.ObjectId,
          ref: "ContractPhase",
        },
        status: {
          type: String,
          enum: ["COMPLETED", "IN_PROGRESS"],
          default: "COMPLETED",
        },
      },
    ],
    blockedBy: [
      {
        type: Schema.Types.ObjectId,
        ref: "ContractPhase",
      },
    ],
  },

  // Roles que pueden trabajar en esta fase
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

  // Aplicable a qué tipos de contratación
  // Campo modificado para usar referencias
  applicableToTypes: {
    type: [
      {
        type: Schema.Types.ObjectId,
        ref: "ContractType",
        required: true,
      },
    ],
    default: [],
    validate: {
      validator: function (v) {
        return v.length <= 20;
      },
      message: "No se pueden especificar más de 20 tipos de contratación",
    },
    meta: {
      validation: {
        isArray: true,
        optional: true,
        eachValidator: { isMongoId: true },
      },
      messages: {
        isArray: "Los tipos aplicables deben ser una lista",
        isMongoId: "Cada tipo debe ser un ID válido de MongoDB",
      },
    },
  },
};

// Crear el esquema con campos base
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

// Pre-save: validar orden único por categoría
ContractPhaseSchema.pre("save", async function (next) {
  if (this.isModified("order") || this.isModified("category")) {
    const existing = await this.constructor.findOne({
      _id: { $ne: this._id },
      order: this.order,
      category: this.category,
      isActive: true,
    });

    if (existing) {
      return next(
        new Error(
          `Ya existe una fase con orden ${this.order} en la categoría ${this.category}`
        )
      );
    }
  }

  // Validar códigos únicos en documentos requeridos
  if (this.requiredDocuments && this.requiredDocuments.length > 0) {
    const codes = this.requiredDocuments.map((doc) => doc.code);
    const uniqueCodes = [...new Set(codes)];

    if (codes.length !== uniqueCodes.length) {
      return next(
        new Error("Los códigos de documentos requeridos deben ser únicos")
      );
    }
  }

  next();
});

// === MÉTODOS DE INSTANCIA ===

ContractPhaseSchema.methods.toJSON = function () {
  const obj = this.toObject();
  return stripMetaFields(obj);
};

ContractPhaseSchema.methods.getMandatoryDocuments = function () {
  return this.requiredDocuments.filter((doc) => doc.isMandatory);
};

ContractPhaseSchema.methods.getOptionalDocuments = function () {
  return this.requiredDocuments.filter((doc) => !doc.isMandatory);
};

ContractPhaseSchema.methods.isApplicableToContractType = function (
  contractTypeId
) {
  return (
    this.applicableToTypes.length === 0 ||
    this.applicableToTypes.some((typeId) => typeId.equals(contractTypeId))
  );
};

ContractPhaseSchema.methods.getDocumentByCode = function (code) {
  return this.requiredDocuments.find((doc) => doc.code === code.toUpperCase());
};

ContractPhaseSchema.methods.canUserWork = function (userRole) {
  return this.allowedRoles.length === 0 || this.allowedRoles.includes(userRole);
};

ContractPhaseSchema.methods.validateFileType = function (
  documentCode,
  fileType
) {
  const document = this.getDocumentByCode(documentCode);
  return document && document.allowedFileTypes.includes(fileType.toLowerCase());
};

// === MÉTODOS ESTÁTICOS ===

ContractPhaseSchema.statics.isProtected = function (method) {
  const protectedMethods = [
    "get",
    "put",
    "delete",
    "createBatch",
    "updateBatch",
  ];
  return protectedMethods.includes(method);
};

ContractPhaseSchema.statics.findByCategory = function (category) {
  return this.findActive({ category: category.toUpperCase() }).sort({
    order: 1,
  });
};

ContractPhaseSchema.statics.findForContractType = function (contractTypeId) {
  return this.findActive({
    $or: [
      { applicableToTypes: { $size: 0 } },
      { applicableToTypes: contractTypeId },
    ],
  })
    .populate("applicableToTypes", "code name category")
    .sort({ order: 1 });
};

// Agregar tipo aplicable
ContractPhaseSchema.methods.addApplicableType = function (contractTypeId) {
  if (!this.applicableToTypes.some((id) => id.equals(contractTypeId))) {
    this.applicableToTypes.push(contractTypeId);
  }
  return this.save();
};

// Remover tipo aplicable
ContractPhaseSchema.methods.removeApplicableType = function (contractTypeId) {
  this.applicableToTypes = this.applicableToTypes.filter(
    (id) => !id.equals(contractTypeId)
  );
  return this.save();
};

// Obtener tipos aplicables con populate
ContractPhaseSchema.methods.getApplicableTypes = function () {
  return this.populate("applicableToTypes", "code name category");
};

ContractPhaseSchema.statics.getPhaseSequence = function (contractTypeCode) {
  return this.findForContractType(contractTypeCode).populate(
    "dependencies.requiredPhases.phase"
  );
};

ContractPhaseSchema.statics.findWithDocumentCode = function (documentCode) {
  return this.findActive({
    "requiredDocuments.code": documentCode.toUpperCase(),
  });
};

// === VIRTUALES ===

ContractPhaseSchema.virtual("displayName").get(function () {
  return this.shortName ? `${this.shortName} - ${this.name}` : this.name;
});

ContractPhaseSchema.virtual("documentCount").get(function () {
  return this.requiredDocuments ? this.requiredDocuments.length : 0;
});

ContractPhaseSchema.virtual("mandatoryDocumentCount").get(function () {
  return this.requiredDocuments
    ? this.requiredDocuments.filter((doc) => doc.isMandatory).length
    : 0;
});

// === QUERY HELPERS ===

ContractPhaseSchema.query.byCategory = function (category) {
  return this.where({ category: category.toUpperCase() });
};

ContractPhaseSchema.query.forContractType = function (contractTypeCode) {
  return this.where({
    $or: [
      { applicableToTypes: { $size: 0 } }, // Fases que aplican a todos
      { applicableToTypes: contractTypeCode }, // Fases específicas para este tipo
    ],
  });
};

ContractPhaseSchema.query.withOrder = function (order) {
  return this.where({ order });
};

ContractPhaseSchema.query.sequential = function () {
  return this.sort({ order: 1 });
};

// === ÍNDICES ADICIONALES ===

ContractPhaseSchema.index({ code: 1 }, { unique: true });
ContractPhaseSchema.index({ category: 1, order: 1 });
ContractPhaseSchema.index({ order: 1, isActive: 1 });
ContractPhaseSchema.index({ applicableToTypes: 1 });
ContractPhaseSchema.index({ "requiredDocuments.code": 1 });
ContractPhaseSchema.index({ allowedRoles: 1 });

// Índice de texto para búsqueda
ContractPhaseSchema.index({
  name: "text",
  shortName: "text",
  description: "text",
  code: "text",
  "requiredDocuments.name": "text",
});

// Índice compuesto para validación de orden único
ContractPhaseSchema.index(
  {
    category: 1,
    order: 1,
    isActive: 1,
  },
  { unique: true, partialFilterExpression: { isActive: true } }
);

// === HOOKS Y PLUGINS ===

// Plugin de paginación
ContractPhaseSchema.plugin(mongoosePaginate);

export const ContractPhase = mongoose.model(
  "ContractPhase",
  ContractPhaseSchema
);
