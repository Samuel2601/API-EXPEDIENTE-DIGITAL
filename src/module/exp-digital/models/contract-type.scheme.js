// src/module/exp-digital/models/contract-type.scheme.js
import mongoose from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";
import { setupBaseSchema, CommonValidators, stripMetaFields } from "../../../core/base/models/base.scheme.js";

const { Schema } = mongoose;

export const ContractTypeJSON = {
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    maxlength: 10,
    validate: {
      validator: function(v) {
        return /^[A-Z]{2,10}$/.test(v);
      },
      message: 'El código debe contener solo letras mayúsculas (2-10 caracteres)'
    },
    meta: {
      validation: { isString: true, required: true, notEmpty: true, isLength: { min: 2, max: 10 } },
      messages: {
        required: "El código del tipo de contratación es obligatorio",
        isString: "El código debe ser un texto válido",
        notEmpty: "El código no puede estar vacío",
        isLength: "El código debe tener entre 2 y 10 caracteres"
      },
    },
  },
  
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200,
    meta: {
      validation: { isString: true, required: true, notEmpty: true, isLength: { min: 5, max: 200 } },
      messages: {
        required: "El nombre del tipo de contratación es obligatorio",
        isString: "El nombre debe ser un texto válido",
        notEmpty: "El nombre no puede estar vacío",
        isLength: "El nombre debe tener entre 5 y 200 caracteres"
      },
    },
  },

  category: {
    type: String,
    enum: {
      values: ["COMMON", "SPECIAL"],
      message: "La categoría debe ser COMMON o SPECIAL"
    },
    required: true,
    uppercase: true,
    meta: {
      validation: { isIn: ["COMMON", "SPECIAL"], required: true },
      messages: {
        required: "La categoría es obligatoria",
        isIn: "La categoría debe ser COMÚN o ESPECIAL según LOSNCP"
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
        isLength: "La descripción no puede exceder 1000 caracteres"
      },
    },
  },

  // Montos según LOSNCP
  amountLimits: {
    goods: {
      min: {
        type: Number,
        min: 0,
        default: 0,
        meta: {
          validation: { isNumeric: true, min: 0, optional: true },
          messages: {
            isNumeric: "El monto mínimo debe ser numérico",
            min: "El monto mínimo no puede ser negativo"
          },
        },
      },
      max: {
        type: Number,
        min: 0,
        meta: {
          validation: { isNumeric: true, min: 0, optional: true },
          messages: {
            isNumeric: "El monto máximo debe ser numérico",
            min: "El monto máximo no puede ser negativo"
          },
        },
      }
    },
    services: {
      min: {
        type: Number,
        min: 0,
        default: 0,
        meta: {
          validation: { isNumeric: true, min: 0, optional: true },
          messages: {
            isNumeric: "El monto mínimo debe ser numérico",
            min: "El monto mínimo no puede ser negativo"
          },
        },
      },
      max: {
        type: Number,
        min: 0,
        meta: {
          validation: { isNumeric: true, min: 0, optional: true },
          messages: {
            isNumeric: "El monto máximo debe ser numérico",
            min: "El monto máximo no puede ser negativo"
          },
        },
      }
    },
    works: {
      min: {
        type: Number,
        min: 0,
        default: 0,
        meta: {
          validation: { isNumeric: true, min: 0, optional: true },
          messages: {
            isNumeric: "El monto mínimo debe ser numérico",
            min: "El monto mínimo no puede ser negativo"
          },
        },
      },
      max: {
        type: Number,
        min: 0,
        meta: {
          validation: { isNumeric: true, min: 0, optional: true },
          messages: {
            isNumeric: "El monto máximo debe ser numérico",
            min: "El monto máximo no puede ser negativo"
          },
        },
      }
    }
  },

  // Configuración de procedimiento
  procedureConfig: {
    requiresPublication: {
      type: Boolean,
      default: true
    },
    publicationDays: {
      type: Number,
      min: 0,
      max: 30,
      default: 15
    },
    questionsDeadlineDays: {
      type: Number,
      min: 0,
      max: 15,
      default: 5
    },
    evaluationDays: {
      type: Number,
      min: 1,
      max: 30,
      default: 10
    },
    requiresInsurance: {
      type: Boolean,
      default: true
    },
    insurancePercentage: {
      type: Number,
      min: 0,
      max: 100,
      default: 5
    }
  },

  // Control de estado
  isActive: {
    type: Boolean,
    default: true,
    index: true,
    meta: {
      validation: { isBoolean: true, optional: true },
      messages: {
        isBoolean: "El estado activo debe ser verdadero o falso"
      },
    },
  },

  // Orden para mostrar en listas
  displayOrder: {
    type: Number,
    min: 0,
    default: 0,
    index: true
  }
};

// Crear el esquema con campos base
const ContractTypeSchema = new Schema(stripMetaFields(ContractTypeJSON), {
  timestamps: true,
  collection: "contracttypes"
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

// Pre-save: validar montos
ContractTypeSchema.pre('save', function(next) {
  // Validar que min <= max para cada tipo
  const types = ['goods', 'services', 'works'];
  
  for (const type of types) {
    const min = this.amountLimits[type]?.min || 0;
    const max = this.amountLimits[type]?.max;
    
    if (max !== undefined && min > max) {
      return next(new Error(`El monto mínimo no puede ser mayor al máximo para ${type}`));
    }
  }
  
  next();
});

// === MÉTODOS DE INSTANCIA ===

ContractTypeSchema.methods.toJSON = function() {
  const obj = this.toObject();
  return stripMetaFields(obj);
};

ContractTypeSchema.methods.isApplicableForAmount = function(amount, contractObject = 'goods') {
  const limits = this.amountLimits[contractObject];
  if (!limits) return false;
  
  const min = limits.min || 0;
  const max = limits.max;
  
  return amount >= min && (max === undefined || amount <= max);
};

ContractTypeSchema.methods.getRequiredInsuranceAmount = function(contractValue) {
  if (!this.procedureConfig.requiresInsurance) return 0;
  return (contractValue * this.procedureConfig.insurancePercentage) / 100;
};

// === MÉTODOS ESTÁTICOS ===

ContractTypeSchema.statics.isProtected = function(method) {
  const protectedMethods = ["get", "put", "delete", "createBatch", "updateBatch"];
  return protectedMethods.includes(method);
};

ContractTypeSchema.statics.findByCategory = function(category) {
  return this.findActive({ category: category.toUpperCase() });
};

ContractTypeSchema.statics.findForAmount = function(amount, contractObject = 'goods') {
  return this.findActive().then(types => {
    return types.filter(type => type.isApplicableForAmount(amount, contractObject));
  });
};

ContractTypeSchema.statics.getActiveOrderedList = function() {
  return this.findActive({}, { sort: { displayOrder: 1, name: 1 } });
};

// === QUERY HELPERS ===

ContractTypeSchema.query.byCategory = function(category) {
  return this.where({ category: category.toUpperCase() });
};

ContractTypeSchema.query.requiresPublication = function() {
  return this.where({ 'procedureConfig.requiresPublication': true });
};

// === ÍNDICES ADICIONALES ===

ContractTypeSchema.index({ code: 1 }, { unique: true });
ContractTypeSchema.index({ category: 1, isActive: 1 });
ContractTypeSchema.index({ displayOrder: 1, name: 1 });
ContractTypeSchema.index({ isActive: 1, createdAt: -1 });

// Índice de texto para búsqueda
ContractTypeSchema.index({ 
  name: "text", 
  description: "text", 
  code: "text" 
});

// === HOOKS Y PLUGINS ===

// Plugin de paginación
ContractTypeSchema.plugin(mongoosePaginate);

// === VALIDACIONES ADICIONALES ===

// Validar códigos únicos (case-insensitive)
ContractTypeSchema.index({ code: 1 }, { 
  unique: true, 
  collation: { locale: 'en', strength: 2 }
});

export const ContractType = mongoose.model("ContractType", ContractTypeSchema);