// src/module/exp-digital/models/department.scheme.js
import mongoose from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";
import { setupBaseSchema, CommonValidators } from "../../core/base/models/base.scheme.js";
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
      validator: function(v) {
        return /^[A-Z0-9_-]{2,20}$/.test(v);
      },
      message: 'El código debe contener solo letras mayúsculas, números, guiones y guiones bajos'
    },
    meta: {
      validation: { isString: true, required: true, notEmpty: true, isLength: { min: 2, max: 20 } },
      messages: {
        required: "El código del departamento es obligatorio",
        isString: "El código debe ser un texto válido",
        notEmpty: "El código no puede estar vacío",
        isLength: "El código debe tener entre 2 y 20 caracteres"
      },
    },
  },

  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 250,
    meta: {
      validation: { isString: true, required: true, notEmpty: true, isLength: { min: 3, max: 250 } },
      messages: {
        required: "El nombre del departamento es obligatorio",
        isString: "El nombre debe ser un texto válido",
        notEmpty: "El nombre no puede estar vacío",
        isLength: "El nombre debe tener entre 3 y 250 caracteres"
      },
    },
  },

  shortName: {
    type: String,
    trim: true,
    maxlength: 50,
    meta: {
      validation: { isString: true, optional: true, isLength: { max: 50 } },
      messages: {
        isString: "El nombre corto debe ser un texto válido",
        isLength: "El nombre corto no puede exceder 50 caracteres"
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
        isString: "La descripción debe ser un texto válida",
        isLength: "La descripción no puede exceder 2000 caracteres"
      },
    },
  },

  // Información del responsable
  responsible: {
    name: {
      type: String,
      trim: true,
      maxlength: 150,
      meta: {
        validation: { isString: true, optional: true, isLength: { max: 150 } },
        messages: {
          isString: "El nombre del responsable debe ser un texto válido",
          isLength: "El nombre del responsable no puede exceder 150 caracteres"
        },
      },
    },
    position: {
      type: String,
      trim: true,
      maxlength: 150,
      meta: {
        validation: { isString: true, optional: true, isLength: { max: 150 } },
        messages: {
          isString: "El cargo debe ser un texto válido",
          isLength: "El cargo no puede exceder 150 caracteres"
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
          isEmail: "El email del responsable no es válido"
        },
      },
    },
    phone: {
      type: String,
      trim: true,
      maxlength: 20,
      validate: {
        validator: function(v) {
          return !v || /^[\d\-\+\(\)\s]{7,20}$/.test(v);
        },
        message: 'El teléfono debe tener un formato válido'
      },
      meta: {
        validation: { optional: true },
        messages: {
          invalid: "El teléfono debe tener un formato válido"
        },
      },
    },
    extension: {
      type: String,
      trim: true,
      maxlength: 10,
      meta: {
        validation: { isString: true, optional: true, isLength: { max: 10 } },
        messages: {
          isString: "La extensión debe ser un texto válido",
          isLength: "La extensión no puede exceder 10 caracteres"
        },
      },
    }
  },

  // Información de contacto del departamento
  contact: {
    address: {
      type: String,
      trim: true,
      maxlength: 300,
      meta: {
        validation: { isString: true, optional: true, isLength: { max: 300 } },
        messages: {
          isString: "La dirección debe ser un texto válido",
          isLength: "La dirección no puede exceder 300 caracteres"
        },
      },
    },
    phone: {
      type: String,
      trim: true,
      maxlength: 20,
      validate: {
        validator: function(v) {
          return !v || /^[\d\-\+\(\)\s]{7,20}$/.test(v);
        },
        message: 'El teléfono debe tener un formato válido'
      },
      meta: {
        validation: { optional: true },
        messages: {
          invalid: "El teléfono debe tener un formato válido"
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
          isEmail: "El email del departamento no es válido"
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
          isLength: "El piso no puede exceder 20 caracteres"
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
          isLength: "La oficina no puede exceder 20 caracteres"
        },
      },
    }
  },

  // Jerarquía departamental
  parentDepartment: {
    type: Schema.Types.ObjectId,
    ref: "Department",
    meta: {
      validation: { isMongoId: true, optional: true },
      messages: {
        isMongoId: "El ID del departamento padre no es válido"
      },
    },
  },

  // Nivel jerárquico (0 = raíz, 1 = primer nivel, etc.)
  level: {
    type: Number,
    min: 0,
    max: 10,
    default: 0,
    index: true,
    meta: {
      validation: { isNumeric: true, min: 0, max: 10 },
      messages: {
        isNumeric: "El nivel debe ser numérico",
        min: "El nivel mínimo es 0",
        max: "El nivel máximo es 10"
      },
    },
  },

  // Configuración presupuestaria
  budgetConfig: {
    hasOwnBudget: { //Tiene su propio presupuesto
      type: Boolean,
      default: false
    },
    budgetCode: { //Código del presupuesto
      type: String,
      trim: true,
      maxlength: 30
    },
    canApproveContracts: { //Puede aprobar contratos
      type: Boolean,
      default: false
    },
    maxApprovalAmount: { //Importe máximo de aprobación
      type: Number,
      min: 0,
      default: 0
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
  },

  // Tags/etiquetas para categorización
  tags: {
    type: [String],
    default: [],
    validate: {
      validator: function(v) {
        return v.length <= 20;
      },
      message: 'No se pueden tener más de 20 tags'
    }
  }
};

// Crear el esquema con campos base
const DepartmentSchema = new Schema(stripMetaFields(DepartmentJSON), {
  timestamps: true,
  collection: "departments"
});

// Aplicar configuración base
setupBaseSchema(DepartmentSchema, {
  addTimestamps: true,
  addIndexes: true,
  addVirtuals: true,
  addMethods: true,
  addStatics: true,
  addHelpers: true,
  addBaseFields: true,
});

// === MIDDLEWARES PERSONALIZADOS ===

// Pre-save: calcular nivel automáticamente
DepartmentSchema.pre('save', async function(next) {
  if (this.isModified('parentDepartment')) {
    if (this.parentDepartment) {
      try {
        const parent = await this.constructor.findById(this.parentDepartment);
        if (parent) {
          this.level = parent.level + 1;
          
          // Prevenir referencias circulares
          if (parent.parentDepartment && parent.parentDepartment.toString() === this._id.toString()) {
            return next(new Error('No se puede crear una referencia circular'));
          }
        }
      } catch (error) {
        return next(error);
      }
    } else {
      this.level = 0;
    }
  }
  
  next();
});

// === MÉTODOS DE INSTANCIA ===

DepartmentSchema.methods.toJSON = function() {
  const obj = this.toObject();
  return stripMetaFields(obj);
};

DepartmentSchema.methods.getFullHierarchy = async function() {
  const hierarchy = [this];
  let current = this;
  
  while (current.parentDepartment) {
    current = await this.constructor.findById(current.parentDepartment);
    if (current) {
      hierarchy.unshift(current);
    } else {
      break;
    }
  }
  
  return hierarchy;
};

DepartmentSchema.methods.getChildren = function() {
  return this.constructor.findActive({ parentDepartment: this._id });
};

DepartmentSchema.methods.getAllDescendants = async function() {
  const descendants = [];
  const directChildren = await this.getChildren();
  
  for (const child of directChildren) {
    descendants.push(child);
    const childDescendants = await child.getAllDescendants();
    descendants.push(...childDescendants);
  }
  
  return descendants;
};

DepartmentSchema.methods.canApprove = function(amount) {
  return this.budgetConfig.canApproveContracts && 
         amount <= this.budgetConfig.maxApprovalAmount;
};

// === MÉTODOS ESTÁTICOS ===

DepartmentSchema.statics.isProtected = function(method) {
  const protectedMethods = ["get", "put", "delete", "createBatch", "updateBatch"];
  return protectedMethods.includes(method);
};

DepartmentSchema.statics.findRootDepartments = function() {
  return this.findActive({ 
    $or: [
      { parentDepartment: null },
      { parentDepartment: { $exists: false } }
    ]
  }).sort({ displayOrder: 1, name: 1 });
};

DepartmentSchema.statics.findByLevel = function(level) {
  return this.findActive({ level }).sort({ displayOrder: 1, name: 1 });
};

DepartmentSchema.statics.getHierarchyTree = async function() {
  const allDepartments = await this.findActive().populate('parentDepartment');
  const tree = [];
  const departmentMap = new Map();
  
  // Crear mapa de departamentos
  allDepartments.forEach(dept => {
    departmentMap.set(dept._id.toString(), { ...dept.toObject(), children: [] });
  });
  
  // Construir árbol
  allDepartments.forEach(dept => {
    if (dept.parentDepartment) {
      const parent = departmentMap.get(dept.parentDepartment._id.toString());
      if (parent) {
        parent.children.push(departmentMap.get(dept._id.toString()));
      }
    } else {
      tree.push(departmentMap.get(dept._id.toString()));
    }
  });
  
  return tree;
};

DepartmentSchema.statics.findWithApprovalCapability = function(minAmount = 0) {
  return this.findActive({
    'budgetConfig.canApproveContracts': true,
    'budgetConfig.maxApprovalAmount': { $gte: minAmount }
  }).sort({ 'budgetConfig.maxApprovalAmount': -1 });
};

// === VIRTUALES ===

DepartmentSchema.virtual('fullName').get(function() {
  return this.shortName ? `${this.name} (${this.shortName})` : this.name;
});

DepartmentSchema.virtual('contactInfo').get(function() {
  const info = [];
  if (this.contact.phone) info.push(`Tel: ${this.contact.phone}`);
  if (this.contact.email) info.push(`Email: ${this.contact.email}`);
  if (this.contact.office) info.push(`Oficina: ${this.contact.office}`);
  return info.join(' | ');
});

// === QUERY HELPERS ===

DepartmentSchema.query.byParent = function(parentId) {
  return this.where({ parentDepartment: parentId });
};

DepartmentSchema.query.withApprovalCapability = function() {
  return this.where({ 'budgetConfig.canApproveContracts': true });
};

DepartmentSchema.query.byLevel = function(level) {
  return this.where({ level });
};

// === ÍNDICES ADICIONALES ===

DepartmentSchema.index({ code: 1 }, { unique: true });
DepartmentSchema.index({ parentDepartment: 1, isActive: 1 });
DepartmentSchema.index({ level: 1, displayOrder: 1 });
DepartmentSchema.index({ 'budgetConfig.canApproveContracts': 1 });
DepartmentSchema.index({ tags: 1 });

// Índice de texto para búsqueda
DepartmentSchema.index({ 
  name: "text", 
  shortName: "text",
  description: "text", 
  code: "text",
  "responsible.name": "text"
});

// Índice compuesto para jerarquía
DepartmentSchema.index({ 
  parentDepartment: 1, 
  level: 1, 
  displayOrder: 1 
});

// === HOOKS Y PLUGINS ===

// Plugin de paginación
DepartmentSchema.plugin(mongoosePaginate);

export const Department = mongoose.model("Department", DepartmentSchema);