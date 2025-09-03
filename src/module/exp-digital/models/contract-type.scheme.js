// src/module/exp-digital/models/contract-type.scheme.js
import mongoose, { Error } from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";
import {
  setupBaseSchema,
  CommonValidators,
} from "../../core/base/models/base.scheme.js";
import { stripMetaFields } from "../../../../utils/meta-field.js";

const { Schema } = mongoose;

// Sub-esquema para límites monetarios por objeto
const AmountLimitJSON = {
  objectType: {
    type: String,
    required: true,
    enum: {
      values: ["bienes", "servicios", "obras", "consultorias"],
      message:
        "Tipo de objeto no válido. Debe ser: bienes, servicios, obras o consultorias",
    },
    uppercase: false, // Mantenemos en minúsculas para consistencia
    meta: {
      validation: {
        isString: true,
        required: true,
        isIn: ["bienes", "servicios", "obras", "consultorias"],
      },
      messages: {
        required: "El tipo de objeto es obligatorio",
        isString: "El tipo de objeto debe ser un texto válido",
        isIn: "El tipo de objeto debe ser: bienes, servicios, obras o consultorias",
      },
    },
  },
  min: {
    type: Number,
    required: true,
    min: 0,
    default: 0,
    meta: {
      validation: { isNumeric: true, min: 0 },
      messages: {
        isNumeric: "El límite mínimo debe ser numérico",
        min: "El límite mínimo no puede ser negativo",
      },
    },
  },
  max: {
    type: Number,
    required: true,
    min: 0,
    meta: {
      validation: { isNumeric: true, min: 0 },
      messages: {
        isNumeric: "El límite máximo debe ser numérico",
        min: "El límite máximo no puede ser negativo",
      },
    },
  },
};

export const ContractTypeJSON = {
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    maxlength: 10,
    validate: {
      validator: function (v) {
        return /^[A-Z]{2,10}$/.test(v);
      },
      message:
        "El código debe contener solo letras mayúsculas (2-10 caracteres)",
    },
    meta: {
      validation: {
        isString: true,
        required: true,
        notEmpty: true,
        isLength: { min: 2, max: 10 },
      },
      messages: {
        required: "El código del tipo de contratación es obligatorio",
        isString: "El código debe ser un texto válido",
        notEmpty: "El código no puede estar vacío",
        isLength: "El código debe tener entre 2 y 10 caracteres",
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
        isLength: { min: 5, max: 200 },
      },
      messages: {
        required: "El nombre del tipo de contratación es obligatorio",
        isString: "El nombre debe ser un texto válido",
        notEmpty: "El nombre no puede estar vacío",
        isLength: "El nombre debe tener entre 5 y 200 caracteres",
      },
    },
  },

  category: {
    type: String,
    enum: {
      values: [
        "CONCURSO",
        "LICITACION",
        "COTIZACION",
        "CONTRATACION_DIRECTA",
        "ENCARGO_DE_CONFIANZA",
        "COMPRA_MINORISTA",
      ],
      message: "Procedimiento de contratación no válido según LOSNCP",
    },
    required: true,
    uppercase: true,
  },

  regime: {
    type: String,
    enum: {
      values: ["COMUN", "ESPECIAL"],
      message: "Régimen de contratación no válido",
    },
    required: true,
    uppercase: true,
  },

  description: {
    type: String,
    trim: true,
    maxlength: 1000,
  },

  applicableObjects: {
    type: [String],
    enum: {
      values: ["bienes", "servicios", "obras", "consultorias"],
      message: "Objeto de contratación no válido",
    },
    default: ["bienes", "servicios"],
    validate: {
      validator: function (v) {
        return v && v.length > 0 && v.length <= 4;
      },
      message: "Debe especificar al menos un objeto de contratación",
    },
  },

  // Límites monetarios como array - MUCHO MEJOR
  amountLimits: {
    type: [AmountLimitJSON],
    required: true,
    validate: {
      validator: function (v) {
        // Validar que no haya tipos de objeto duplicados
        const objectTypes = v.map((item) => item.objectType);
        const uniqueTypes = [...new Set(objectTypes)];
        return objectTypes.length === uniqueTypes.length;
      },
      message: "No puede haber límites duplicados para el mismo tipo de objeto",
    },
  },

  procedureConfig: {
    requiresPublication: { type: Boolean, default: true },
    publicationDays: { type: Number, min: 0, max: 30, default: 15 },
    questionsDeadlineDays: { type: Number, min: 0, max: 15, default: 5 },
    evaluationDays: { type: Number, min: 1, max: 30, default: 10 },
    requiresInsurance: { type: Boolean, default: true },
    insurancePercentage: { type: Number, min: 0, max: 100, default: 5 },
    estimatedDuration: { type: Number, min: 1, max: 365, default: 30 },
  },

  legalReference: {
    type: String,
    trim: true,
    maxlength: 100,
  },

  isActive: {
    type: Boolean,
    default: true,
    index: true,
  },

  displayOrder: {
    type: Number,
    min: 0,
    default: 0,
    index: true,
  },
};

// Crear el esquema
const ContractTypeSchema = new Schema(stripMetaFields(ContractTypeJSON), {
  timestamps: true,
  collection: "contracttypes",
});

// Aplicar configuración base
setupBaseSchema(ContractTypeSchema, {
  addTimestamps: true,
  addIndexes: true,
  addVirtuals: true,
  addMethods: true,
  addStatics: true,
  addHelpers: true,
  addBaseFields: true,
});

// === MIDDLEWARES PERSONALIZADOS ===

ContractTypeSchema.pre("save", function (next) {
  // Validar que los límites sean consistentes con los objetos aplicables
  const applicableObjectsSet = new Set(this.applicableObjects);

  for (const limit of this.amountLimits) {
    // Validar min <= max
    if (limit.min > limit.max) {
      const err = new Error.ValidationError(this);
      err.errors.amountLimits = new Error.ValidatorError({
        message: `Para ${limit.objectType}, el límite mínimo (${limit.min}) no puede ser mayor al máximo (${limit.max})`,
        path: "amountLimits",
        value: this.amountLimits,
      });
      return next(err);
    }

    // Validar que el objeto del límite esté en applicableObjects
    if (!applicableObjectsSet.has(limit.objectType)) {
      const err = new Error.ValidationError(this);
      err.errors.amountLimits = new Error.ValidatorError({
        message: `El objeto "${limit.objectType}" en amountLimits no está en applicableObjects`,
        path: "amountLimits",
        value: this.amountLimits,
      });
      return next(err);
    }
  }

  // Validar que todos los objetos aplicables tengan límites definidos
  for (const obj of this.applicableObjects) {
    const hasLimit = this.amountLimits.some(
      (limit) => limit.objectType === obj
    );
    if (!hasLimit) {
      const err = new Error.ValidationError(this);
      err.errors.amountLimits = new Error.ValidatorError({
        message: `Falta definir límites para el objeto "${obj}" que está en applicableObjects`,
        path: "amountLimits",
        value: this.amountLimits,
      });
      return next(err);
    }
  }

  next();
});

// === MÉTODOS DE INSTANCIA ===

ContractTypeSchema.methods.isApplicableForAmount = function (
  amount,
  contractObject = "bienes"
) {
  if (typeof amount !== "number") return false;
  if (!this.applicableObjects.includes(contractObject)) return false;

  const limit = this.amountLimits.find((l) => l.objectType === contractObject);
  if (!limit) return false;

  return amount >= (limit.min || 0) && amount <= limit.max;
};

ContractTypeSchema.methods.getLimitForObject = function (contractObject) {
  return this.amountLimits.find((l) => l.objectType === contractObject);
};

ContractTypeSchema.methods.getRequiredInsuranceAmount = function (
  contractValue
) {
  if (!this.procedureConfig.requiresInsurance) return 0;
  return (contractValue * this.procedureConfig.insurancePercentage) / 100;
};

ContractTypeSchema.methods.getEstimatedDuration = function () {
  return this.procedureConfig.estimatedDuration;
};

// === MÉTODOS ESTÁTICOS ===

ContractTypeSchema.statics.findForAmount = function (
  amount,
  contractObject = "bienes"
) {
  return this.find({ isActive: true }).then((types) => {
    return types.filter((type) =>
      type.isApplicableForAmount(amount, contractObject)
    );
  });
};

ContractTypeSchema.statics.findByCategory = function (category) {
  return this.findActive({ category: category.toUpperCase() });
};

ContractTypeSchema.statics.findByRegimen = function (regimen) {
  return this.findActive({ regimen: regimen.toUpperCase() });
};

ContractTypeSchema.statics.getActiveOrderedList = function () {
  return this.findActive({}, { sort: { displayOrder: 1, name: 1 } });
};

ContractTypeSchema.statics.findForAmountPaginated = async function (
  amount,
  contractObject = "bienes",
  options = {}
) {
  const { page = 1, limit = 10, lean = true } = options;

  const query = { isActive: true };
  const types = await this.paginate(query, {
    page,
    limit,
    lean,
    sort: { displayOrder: 1, name: 1 },
  });

  const filteredDocs = types.docs.filter((type) =>
    type.isApplicableForAmount(amount, contractObject)
  );

  return {
    docs: filteredDocs,
    totalDocs: filteredDocs.length,
    limit,
    totalPages: Math.ceil(filteredDocs.length / limit),
    page,
    pagingCounter: (page - 1) * limit + 1,
    hasPrevPage: page > 1,
    hasNextPage: page * limit < filteredDocs.length,
    prevPage: page > 1 ? page - 1 : null,
    nextPage: page * limit < filteredDocs.length ? page + 1 : null,
  };
};

// === VIRTUALES ===
ContractTypeSchema.virtual("displayInfo").get(function () {
  return `${this.code} - ${this.name} (${this.category})`;
});

// === ÍNDICES ADICIONALES ===
ContractTypeSchema.index({ code: 1 }, { unique: true });
ContractTypeSchema.index({ category: 1, isActive: 1 });
ContractTypeSchema.index({ displayOrder: 1, name: 1 });
ContractTypeSchema.index({ applicableObjects: 1 });
ContractTypeSchema.index({ "amountLimits.objectType": 1 });

// Índice compuesto para búsquedas por objeto y monto
ContractTypeSchema.index({
  "amountLimits.objectType": 1,
  "amountLimits.min": 1,
  "amountLimits.max": 1,
});

// Plugin de paginación
ContractTypeSchema.plugin(mongoosePaginate);

export const ContractType = mongoose.model("ContractType", ContractTypeSchema);
