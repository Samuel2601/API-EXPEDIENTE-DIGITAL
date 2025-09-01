// =============================================================================
// src/module/exp-digital/models/department.scheme.js - OPTIMIZADO
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

export const DepartmentJSON = {
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    maxlength: 20,
    validate: {
      validator: function (v) {
        return /^[A-Z0-9_-]{2,20}$/.test(v);
      },
      message:
        "El código debe contener solo letras mayúsculas, números, guiones y guiones bajos",
    },
    meta: {
      validation: {
        isString: true,
        required: true,
        notEmpty: true,
        isLength: { min: 2, max: 20 },
      },
      messages: {
        required: "El código del departamento es obligatorio",
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
    maxlength: 250,
    meta: {
      validation: {
        isString: true,
        required: true,
        notEmpty: true,
        isLength: { min: 3, max: 250 },
      },
      messages: {
        required: "El nombre del departamento es obligatorio",
        isString: "El nombre debe ser un texto válido",
        notEmpty: "El nombre no puede estar vacío",
        isLength: "El nombre debe tener entre 3 y 250 caracteres",
      },
    },
  },

  shortName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50,
    meta: {
      validation: {
        isString: true,
        required: true,
        notEmpty: true,
        isLength: { min: 2, max: 50 },
      },
      messages: {
        required: "El nombre corto es obligatorio",
        isString: "El nombre corto debe ser un texto válido",
        notEmpty: "El nombre corto no puede estar vacío",
        isLength: "El nombre corto debe tener entre 2 y 50 caracteres",
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

  // Información del responsable
  responsible: {
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
          required: "El nombre del responsable es obligatorio",
          isString: "El nombre debe ser un texto válido",
          notEmpty: "El nombre no puede estar vacío",
          isLength: "El nombre debe tener entre 3 y 150 caracteres",
        },
      },
    },
    position: {
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
          isString: "El cargo debe ser un texto válido",
          isLength: "El cargo no puede exceder 100 caracteres",
        },
      },
    },
    extension: {
      type: String,
      trim: true,
      maxlength: 10,
      meta: {
        validation: {
          isString: true,
          optional: true,
          isLength: { max: 10 },
        },
        messages: {
          isString: "La extensión debe ser un texto válido",
          isLength: "La extensión no puede exceder 10 caracteres",
        },
      },
    },
  },

  // Información de contacto
  contact: {
    phone: {
      type: String,
      trim: true,
      maxlength: 20,
      validate: {
        validator: function (v) {
          if (!v) return true; // Campo opcional
          return /^[\d\s\-\+\(\)]{7,20}$/.test(v);
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
    email: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 100,
      validate: CommonValidators.email,
      meta: {
        validation: { isEmail: true, optional: true },
        messages: {
          isEmail: "El email del departamento no es válido",
        },
      },
    },
    floor: {
      type: String,
      trim: true,
      maxlength: 20,
      meta: {
        validation: { isString: true, optional: true, isLength: { max: 20 } },
        messages: {
          isString: "El piso debe ser un texto válido",
          isLength: "El piso no puede exceder 20 caracteres",
        },
      },
    },
    office: {
      type: String,
      trim: true,
      maxlength: 20,
      meta: {
        validation: { isString: true, optional: true, isLength: { max: 20 } },
        messages: {
          isString: "La oficina debe ser un texto válido",
          isLength: "La oficina no puede exceder 20 caracteres",
        },
      },
    },
  },

  // Jerarquía departamental
  parentDepartment: {
    type: Schema.Types.ObjectId,
    ref: "Department",
    meta: {
      validation: { isMongoId: true, optional: true },
      messages: {
        isMongoId: "El ID del departamento padre no es válido",
      },
    },
  },

  // Nivel jerárquico (0 = raíz, 1 = primer nivel, etc.)
  level: {
    type: Number,
    default: 0,
    min: 0,
    max: 20,
    meta: {
      validation: {
        isInt: true,
        min: 0,
        max: 20,
      },
      messages: {
        isInt: "El nivel debe ser un número entero",
        min: "El nivel no puede ser menor a 0",
        max: "El nivel no puede ser mayor a 20",
      },
    },
  },

  // Orden de visualización
  displayOrder: {
    type: Number,
    default: 0,
    min: 0,
    meta: {
      validation: {
        isInt: true,
        min: 0,
      },
      messages: {
        isInt: "El orden debe ser un número entero",
        min: "El orden no puede ser menor a 0",
      },
    },
  },

  // Configuración presupuestaria
  budgetConfig: {
    maxApprovalAmount: {
      type: Number,
      default: 0,
      min: 0,
      meta: {
        validation: {
          isNumeric: true,
          min: 0,
        },
        messages: {
          isNumeric: "El monto máximo de aprobación debe ser un número",
          min: "El monto no puede ser negativo",
        },
      },
    },
    canApproveContracts: {
      type: Boolean,
      default: false,
      meta: {
        validation: { isBoolean: true },
        messages: {
          isBoolean: "El campo debe ser verdadero o falso",
        },
      },
    },
    requiresApproval: {
      type: Boolean,
      default: true,
      meta: {
        validation: { isBoolean: true },
        messages: {
          isBoolean: "El campo debe ser verdadero o falso",
        },
      },
    },
  },

  // Tags para categorización
  tags: {
    type: [String],
    default: [],
    validate: {
      validator: function (arr) {
        return arr.length <= 10; // Máximo 10 tags
      },
      message: "No se pueden tener más de 10 tags",
    },
    meta: {
      validation: {
        isArray: true,
        optional: true,
      },
      messages: {
        isArray: "Los tags deben ser un arreglo",
      },
    },
  },
};

// === CONFIGURACIÓN DEL ESQUEMA ===

// 2. Crea el esquema de Mongoose
const DepartmentSchema = new Schema(stripMetaFields(DepartmentJSON), {
  timestamps: true,
  collection: "departments",
});

// 3. AHORA aplica la configuración base
setupBaseSchema(DepartmentSchema, {
  addTimestamps: true,
  addIndexes: true,
  addVirtuals: true,
  addMethods: true,
  addStatics: true,
  addHelpers: true,
  addBaseFields: true,
});

// === VIRTUALES ===

DepartmentSchema.virtual("displayName").get(function () {
  return this.shortName ? `${this.name} (${this.shortName})` : this.name;
});

DepartmentSchema.virtual("contactInfo").get(function () {
  const info = [];
  if (this.contact.phone) info.push(`Tel: ${this.contact.phone}`);
  if (this.contact.email) info.push(`Email: ${this.contact.email}`);
  if (this.contact.office) info.push(`Oficina: ${this.contact.office}`);
  return info.join(" | ");
});

// === QUERY HELPERS ===
// ✅ MANTENIDOS: Para que el repositorio pueda usarlos

DepartmentSchema.query.byParent = function (parentId) {
  return this.where({ parentDepartment: parentId });
};

DepartmentSchema.query.withApprovalCapability = function () {
  return this.where({ "budgetConfig.canApproveContracts": true });
};

DepartmentSchema.query.byLevel = function (level) {
  return this.where({ level });
};

DepartmentSchema.query.byTags = function (tags) {
  return this.where({ tags: { $in: tags } });
};

DepartmentSchema.query.active = function () {
  return this.where({ isActive: true });
};

// === MÉTODOS DE INSTANCIA ===
// ✅ SOLO MÉTODOS SIMPLES QUE NO REQUIEREN AGREGACIÓN

DepartmentSchema.methods.toJSON = function () {
  const obj = this.toObject();
  return stripMetaFields(obj);
};

// ✅ MÉTODO SIMPLE: Verificar capacidad de aprobación
DepartmentSchema.methods.canApprove = function (amount) {
  return (
    this.budgetConfig.canApproveContracts &&
    this.budgetConfig.maxApprovalAmount >= amount
  );
};

// ✅ MÉTODO SIMPLE: Verificar si es departamento raíz
DepartmentSchema.methods.isRoot = function () {
  return !this.parentDepartment || this.level === 0;
};

// ✅ MÉTODO SIMPLE: Obtener información básica del responsable
DepartmentSchema.methods.getResponsibleInfo = function () {
  if (!this.responsible.name) return null;

  const info = [this.responsible.name];
  if (this.responsible.position) info.push(this.responsible.position);
  if (this.responsible.extension)
    info.push(`Ext: ${this.responsible.extension}`);

  return info.join(" - ");
};

// ❌ ELIMINADOS: Métodos complejos que requieren agregación
// - getFullHierarchy() -> Mover al repositorio
// - getAllDescendants() -> Mover al repositorio
// - getChildren() -> Usar query helper byParent en el repositorio

// === MIDDLEWARES MEJORADOS ===

// Pre-save: Validaciones básicas y normalización
DepartmentSchema.pre("save", function (next) {
  // Normalizar código a mayúsculas
  if (this.code) {
    this.code = this.code.toUpperCase().trim();
  }

  // Normalizar tags
  if (this.tags && this.tags.length > 0) {
    this.tags = this.tags
      .map((tag) => tag.trim().toLowerCase())
      .filter((tag) => tag);
  }

  next();
});

// ❌ ELIMINADO: Pre-save para calcular nivel
// La lógica compleja de validación de jerarquía se maneja en el repositorio

// Pre-remove: Validar que no tenga hijos activos
DepartmentSchema.pre(
  "deleteOne",
  { document: true, query: false },
  async function (next) {
    try {
      const childrenCount = await this.constructor.countDocuments({
        parentDepartment: this._id,
        isActive: true,
      });

      if (childrenCount > 0) {
        return next(
          new Error(
            "No se puede eliminar un departamento que tiene departamentos hijos activos"
          )
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  }
);

// === ÍNDICES OPTIMIZADOS ===

DepartmentSchema.index({ code: 1 }, { unique: true });
DepartmentSchema.index({ parentDepartment: 1, isActive: 1 });
DepartmentSchema.index({ level: 1, displayOrder: 1 });
DepartmentSchema.index({ "budgetConfig.canApproveContracts": 1 });
DepartmentSchema.index({ tags: 1 });

// Índice de texto para búsqueda
DepartmentSchema.index({
  name: "text",
  shortName: "text",
  description: "text",
  code: "text",
  "responsible.name": "text",
});

// Índice compuesto para jerarquía y ordenamiento
DepartmentSchema.index({
  parentDepartment: 1,
  level: 1,
  displayOrder: 1,
});

// Índice para consultas de capacidad de aprobación
DepartmentSchema.index({
  "budgetConfig.canApproveContracts": 1,
  "budgetConfig.maxApprovalAmount": 1,
  isActive: 1,
});

// === CONFIGURACIÓN FINAL ===

// Incluir virtuals en JSON y Object
DepartmentSchema.set("toJSON", { virtuals: true });
DepartmentSchema.set("toObject", { virtuals: true });

// Plugin de paginación
DepartmentSchema.plugin(mongoosePaginate);

// === EXPORTACIÓN ===

export const Department = mongoose.model("Department", DepartmentSchema);
