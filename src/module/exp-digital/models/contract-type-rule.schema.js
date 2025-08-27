// contract-type-rule.scheme.js
import mongoose from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";
import {
  setupBaseSchema,
  CommonValidators,
} from "../../core/base/models/base.scheme.js";
import { stripMetaFields } from "../../../../utils/meta-field.js";

const { Schema } = mongoose;

export const ContractTypeRuleJSON = {
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
        required: "El nombre de la regla es obligatorio",
        isString: "El nombre debe ser un texto válido",
        notEmpty: "El nombre no puede estar vacío",
        isLength: "El nombre debe tener entre 3 y 150 caracteres",
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

  ruleType: {
    type: String,
    required: true,
    enum: [
      "amount_range",
      "special_procedure",
      "emergency",
      "catalog",
      "framework_agreement",
      "custom",
    ],
    meta: {
      validation: {
        isString: true,
        required: true,
        isIn: [
          "amount_range",
          "special_procedure",
          "emergency",
          "catalog",
          "framework_agreement",
          "custom",
        ],
      },
      messages: {
        required: "El tipo de regla es obligatorio",
        isString: "El tipo de regla debe ser un texto válido",
        isIn: "El tipo de regla no es válido",
      },
    },
  },

  conditions: {
    contractObjects: [
      {
        type: String,
        enum: ["bienes", "servicios", "obras", "consultoria", "todos"],
        meta: {
          validation: {
            isString: true,
            isIn: ["bienes", "servicios", "obras", "consultoria", "todos"],
          },
          messages: {
            isString: "El objeto de contrato debe ser un texto válido",
            isIn: "El objeto de contrato no es válido",
          },
        },
      },
    ],
    amountRanges: [
      {
        contractObject: {
          type: String,
          enum: ["bienes", "servicios", "obras", "consultoria"],
          meta: {
            validation: {
              isString: true,
              isIn: ["bienes", "servicios", "obras", "consultoria"],
            },
            messages: {
              isString: "El objeto de contrato debe ser un texto válido",
              isIn: "El objeto de contrato no es válido",
            },
          },
        },
        minAmount: {
          type: Number,
          min: 0,
          meta: {
            validation: {
              isNumeric: true,
              min: 0,
            },
            messages: {
              isNumeric: "El monto mínimo debe ser un número",
              min: "El monto mínimo no puede ser negativo",
            },
          },
        },
        maxAmount: {
          type: Number,
          validate: {
            validator: function (value) {
              return (
                value === null || value === undefined || value > this.minAmount
              );
            },
            message: "El monto máximo debe ser mayor al monto mínimo",
          },
          meta: {
            validation: {
              isNumeric: true,
              optional: true,
            },
            messages: {
              isNumeric: "El monto máximo debe ser un número",
              invalid: "El monto máximo debe ser mayor al monto mínimo",
            },
          },
        },
      },
    ],
    specialConditions: [
      {
        condition: {
          type: String,
          trim: true,
          maxlength: 100,
          meta: {
            validation: {
              isString: true,
              isLength: { max: 100 },
            },
            messages: {
              isString: "La condición debe ser un texto válido",
              isLength: "La condición no puede exceder 100 caracteres",
            },
          },
        },
        value: {
          type: Schema.Types.Mixed,
          meta: {
            validation: {
              optional: true,
            },
          },
        },
      },
    ],
    excludeConditions: [
      {
        condition: {
          type: String,
          trim: true,
          maxlength: 100,
          meta: {
            validation: {
              isString: true,
              isLength: { max: 100 },
            },
            messages: {
              isString: "La condición de exclusión debe ser un texto válido",
              isLength:
                "La condición de exclusión no puede exceder 100 caracteres",
            },
          },
        },
        value: {
          type: Schema.Types.Mixed,
          meta: {
            validation: {
              optional: true,
            },
          },
        },
      },
    ],
  },

  isAlwaysAvailable: {
    type: Boolean,
    default: false,
    meta: {
      validation: {
        isBoolean: true,
      },
      messages: {
        isBoolean: "El campo debe ser verdadero o falso",
      },
    },
  },

  requiresSpecialAuthorization: {
    type: Boolean,
    default: false,
    meta: {
      validation: {
        isBoolean: true,
      },
      messages: {
        isBoolean: "El campo debe ser verdadero o falso",
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

  legalReference: {
    article: {
      type: String,
      trim: true,
      maxlength: 50,
      meta: {
        validation: {
          isString: true,
          optional: true,
          isLength: { max: 50 },
        },
        messages: {
          isString: "El artículo debe ser un texto válido",
          isLength: "El artículo no puede exceder 50 caracteres",
        },
      },
    },
    law: {
      type: String,
      default: "LOSNCP",
      trim: true,
      maxlength: 50,
      meta: {
        validation: {
          isString: true,
          optional: true,
          isLength: { max: 50 },
        },
        messages: {
          isString: "La ley debe ser un texto válido",
          isLength: "La ley no puede exceder 50 caracteres",
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

  validFrom: {
    type: Date,
    default: Date.now,
    meta: {
      validation: {
        isDate: true,
      },
      messages: {
        isDate: "La fecha de inicio debe ser una fecha válida",
      },
    },
  },

  validUntil: {
    type: Date,
    meta: {
      validation: {
        isDate: true,
        optional: true,
      },
      messages: {
        isDate: "La fecha de fin debe ser una fecha válida",
      },
    },
  },

  metadata: {
    requiresMarketStudy: {
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
    requiresTechnicalSpecs: {
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
    estimatedDuration: {
      type: Number,
      min: 1,
      max: 365,
      meta: {
        validation: {
          isInt: true,
          min: 1,
          max: 365,
          optional: true,
        },
        messages: {
          isInt: "La duración estimada debe ser un número entero",
          min: "La duración no puede ser menor a 1 día",
          max: "La duración no puede ser mayor a 365 días",
        },
      },
    },
    allowsNegotiation: {
      type: Boolean,
      default: false,
      meta: {
        validation: {
          isBoolean: true,
        },
        messages: {
          isBoolean: "El campo debe ser verdadero o falso",
        },
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

const ContractTypeRuleSchema = setupBaseSchema(ContractTypeRuleJSON);

// === QUERY HELPERS ===

ContractTypeRuleSchema.query.byContractType = function (contractTypeCode) {
  return this.where({ contractTypeCode });
};

ContractTypeRuleSchema.query.byRuleType = function (ruleType) {
  return this.where({ ruleType });
};

ContractTypeRuleSchema.query.active = function () {
  return this.where({ isActive: true });
};

ContractTypeRuleSchema.query.withApprovalCapability = function () {
  return this.where({ requiresSpecialAuthorization: false });
};

ContractTypeRuleSchema.query.byContractObject = function (contractObject) {
  return this.where({ "conditions.contractObjects": contractObject });
};

// === MÉTODOS DE INSTANCIA ===

ContractTypeRuleSchema.methods.toJSON = function () {
  const obj = this.toObject();
  return stripMetaFields(obj);
};

// Método para evaluar si la regla aplica
ContractTypeRuleSchema.methods.evaluateRule = function (params) {
  const { amount, contractObject, specialConditions = {} } = params;

  // Si siempre está disponible, retorna true
  if (this.isAlwaysAvailable) {
    return true;
  }

  // Verificar objeto de contrato
  if (
    this.conditions.contractObjects &&
    this.conditions.contractObjects.length > 0
  ) {
    if (
      !this.conditions.contractObjects.includes("todos") &&
      !this.conditions.contractObjects.includes(contractObject)
    ) {
      return false;
    }
  }

  // Verificar rangos de monto
  if (this.conditions.amountRanges && this.conditions.amountRanges.length > 0) {
    const applicableRange = this.conditions.amountRanges.find(
      (range) =>
        range.contractObject === contractObject || !range.contractObject
    );

    if (applicableRange) {
      if (amount < applicableRange.minAmount) return false;
      if (
        applicableRange.maxAmount !== null &&
        applicableRange.maxAmount !== undefined &&
        amount > applicableRange.maxAmount
      )
        return false;
    }
  }

  // Verificar condiciones especiales
  if (
    this.conditions.specialConditions &&
    this.conditions.specialConditions.length > 0
  ) {
    for (const condition of this.conditions.specialConditions) {
      if (
        !specialConditions[condition.condition] ||
        specialConditions[condition.condition] !== condition.value
      ) {
        return false;
      }
    }
  }

  // Verificar condiciones de exclusión
  if (
    this.conditions.excludeConditions &&
    this.conditions.excludeConditions.length > 0
  ) {
    for (const excludeCondition of this.conditions.excludeConditions) {
      if (
        specialConditions[excludeCondition.condition] === excludeCondition.value
      ) {
        return false;
      }
    }
  }

  return true;
};

// === MIDDLEWARES ===

// Pre-save: Normalización de datos
ContractTypeRuleSchema.pre("save", function (next) {
  // Normalizar código a mayúsculas
  if (this.contractTypeCode) {
    this.contractTypeCode = this.contractTypeCode.toUpperCase().trim();
  }

  next();
});

// === ÍNDICES OPTIMIZADOS ===

ContractTypeRuleSchema.index({ contractTypeCode: 1, ruleType: 1, isActive: 1 });
ContractTypeRuleSchema.index({ "conditions.contractObjects": 1, isActive: 1 });
ContractTypeRuleSchema.index({ isAlwaysAvailable: 1, isActive: 1 });
ContractTypeRuleSchema.index({ requiresSpecialAuthorization: 1 });
ContractTypeRuleSchema.index({ priority: 1 });
ContractTypeRuleSchema.index({ validFrom: 1, validUntil: 1 });

// Índice de texto para búsqueda
ContractTypeRuleSchema.index({
  name: "text",
  contractTypeCode: "text",
  "legalReference.article": "text",
  "legalReference.law": "text",
  "legalReference.description": "text",
});

// === CONFIGURACIÓN FINAL ===

// Incluir virtuals en JSON y Object
ContractTypeRuleSchema.set("toJSON", { virtuals: true });
ContractTypeRuleSchema.set("toObject", { virtuals: true });

// Plugin de paginación
ContractTypeRuleSchema.plugin(mongoosePaginate);

// === EXPORTACIÓN ===

export const ContractTypeRule = mongoose.model(
  "ContractTypeRule",
  ContractTypeRuleSchema
);
