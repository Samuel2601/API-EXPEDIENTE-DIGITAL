// contract-amount-range.scheme.js
import mongoose from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";
import {
  setupBaseSchema,
  CommonValidators,
} from "../../core/base/models/base.scheme.js";
import { stripMetaFields } from "../../../../utils/meta-field.js";

const { Schema } = mongoose;

export const ContractAmountRangeJSON = {
  contractObject: {
    type: String,
    required: true,
    enum: ["bienes", "servicios", "obras", "consultoria"],
    meta: {
      validation: {
        isString: true,
        required: true,
        isIn: ["bienes", "servicios", "obras", "consultoria"],
      },
      messages: {
        required: "El objeto de contrato es obligatorio",
        isString: "El objeto de contrato debe ser un texto válido",
        isIn: "El objeto de contrato no es válido",
      },
    },
  },

  contractTypeCode: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
    maxlength: 20,
    meta: {
      validation: {
        isString: true,
        required: true,
        notEmpty: true,
        isLength: { min: 2, max: 20 },
      },
      messages: {
        required: "El código del tipo de contrato es obligatorio",
        isString: "El código debe ser un texto válido",
        notEmpty: "El código no puede estar vacío",
        isLength: "El código debe tener entre 2 y 20 caracteres",
      },
    },
  },

  minAmount: {
    type: Number,
    required: true,
    min: 0,
    meta: {
      validation: {
        isNumeric: true,
        required: true,
        min: 0,
      },
      messages: {
        required: "El monto mínimo es obligatorio",
        isNumeric: "El monto mínimo debe ser un número válido",
        min: "El monto mínimo no puede ser negativo",
      },
    },
  },

  maxAmount: {
    type: Number,
    required: false, // null significa sin límite superior
    validate: {
      validator: function (value) {
        return value === null || value === undefined || value > this.minAmount;
      },
      message: "El monto máximo debe ser mayor al monto mínimo",
    },
    meta: {
      validation: {
        isNumeric: true,
        optional: true,
      },
      messages: {
        isNumeric: "El monto máximo debe ser un número válido",
        invalid: "El monto máximo debe ser mayor al monto mínimo",
      },
    },
  },

  isActive: {
    type: Boolean,
    default: true,
    meta: {
      validation: {
        isBoolean: true,
      },
      messages: {
        isBoolean: "El campo debe ser verdadero o falso",
      },
    },
  },

  description: {
    type: String,
    trim: true,
    maxlength: 500,
    meta: {
      validation: {
        isString: true,
        optional: true,
        isLength: { max: 500 },
      },
      messages: {
        isString: "La descripción debe ser un texto válido",
        isLength: "La descripción no puede exceder 500 caracteres",
      },
    },
  },

  legalReference: {
    type: String,
    trim: true,
    maxlength: 100,
    meta: {
      validation: {
        isString: true,
        optional: true,
        isLength: { max: 100 },
      },
      messages: {
        isString: "La referencia legal debe ser un texto válido",
        isLength: "La referencia legal no puede exceder 100 caracteres",
      },
    },
  },

  priority: {
    type: Number,
    default: 1,
    min: 1,
    max: 100,
    meta: {
      validation: {
        isInt: true,
        min: 1,
        max: 100,
      },
      messages: {
        isInt: "La prioridad debe ser un número entero",
        min: "La prioridad no puede ser menor a 1",
        max: "La prioridad no puede ser mayor a 100",
      },
    },
  },

  createdBy: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    meta: {
      validation: {
        isMongoId: true,
        required: true,
      },
      messages: {
        required: "El creador es obligatorio",
        isMongoId: "El ID del creador no es válido",
      },
    },
  },

  updatedBy: {
    type: Schema.Types.ObjectId,
    ref: "User",
    meta: {
      validation: {
        isMongoId: true,
        optional: true,
      },
      messages: {
        isMongoId: "El ID del actualizador no es válido",
      },
    },
  },
};

// === CONFIGURACIÓN DEL ESQUEMA ===

const ContractAmountRangeSchema = setupBaseSchema(ContractAmountRangeJSON);

// === QUERY HELPERS ===

ContractAmountRangeSchema.query.byContractType = function (contractTypeCode) {
  return this.where({ contractTypeCode });
};

ContractAmountRangeSchema.query.byContractObject = function (contractObject) {
  return this.where({ contractObject });
};

ContractAmountRangeSchema.query.active = function () {
  return this.where({ isActive: true });
};

ContractAmountRangeSchema.query.byAmountRange = function (amount) {
  return this.where({
    minAmount: { $lte: amount },
    $or: [
      { maxAmount: { $gte: amount } },
      { maxAmount: null },
      { maxAmount: { $exists: false } },
    ],
  });
};

// === MÉTODOS DE INSTANCIA ===

ContractAmountRangeSchema.methods.toJSON = function () {
  const obj = this.toObject();
  return stripMetaFields(obj);
};

// Método para verificar si un monto está dentro del rango
ContractAmountRangeSchema.methods.isAmountInRange = function (amount) {
  if (amount < this.minAmount) return false;
  if (
    this.maxAmount !== null &&
    this.maxAmount !== undefined &&
    amount > this.maxAmount
  )
    return false;
  return true;
};

// Método para obtener la descripción del rango
ContractAmountRangeSchema.methods.getRangeDescription = function () {
  let description = `Desde ${this.minAmount.toLocaleString()}`;
  if (this.maxAmount) {
    description += ` hasta ${this.maxAmount.toLocaleString()}`;
  } else {
    description += ` en adelante`;
  }
  return description;
};

// === MIDDLEWARES ===

// Pre-save: Normalización de datos
ContractAmountRangeSchema.pre("save", function (next) {
  // Normalizar código a mayúsculas
  if (this.contractTypeCode) {
    this.contractTypeCode = this.contractTypeCode.toUpperCase().trim();
  }

  // Asegurar que maxAmount sea null si no está definido
  if (this.maxAmount === undefined) {
    this.maxAmount = null;
  }

  next();
});

// === ÍNDICES OPTIMIZADOS ===

ContractAmountRangeSchema.index({
  contractObject: 1,
  contractTypeCode: 1,
  isActive: 1,
});

ContractAmountRangeSchema.index({
  contractObject: 1,
  minAmount: 1,
  maxAmount: 1,
  isActive: 1,
});

ContractAmountRangeSchema.index({ priority: 1 });
ContractAmountRangeSchema.index({ isActive: 1 });

// Índice de texto para búsqueda
ContractAmountRangeSchema.index({
  contractTypeCode: "text",
  description: "text",
  legalReference: "text",
});

// === CONFIGURACIÓN FINAL ===

// Incluir virtuals en JSON y Object
ContractAmountRangeSchema.set("toJSON", { virtuals: true });
ContractAmountRangeSchema.set("toObject", { virtuals: true });

// Plugin de paginación
ContractAmountRangeSchema.plugin(mongoosePaginate);

// === EXPORTACIÓN ===

export const ContractAmountRange = mongoose.model(
  "ContractAmountRange",
  ContractAmountRangeSchema
);

export default ContractAmountRange;
