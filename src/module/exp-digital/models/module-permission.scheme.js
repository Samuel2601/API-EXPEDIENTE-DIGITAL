// =============================================================================
// src/module/exp-digital/models/module-permission.scheme.js
// Sistema de permisos específicos para el módulo de expediente digital
// =============================================================================

import mongoose from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";
import { setupBaseSchema } from "../../core/base/models/base.scheme.js";
import { stripMetaFields } from "../../../../utils/meta-field.js";

const { Schema } = mongoose;

// ===== ESQUEMA PRINCIPAL DE PERMISOS DEL MÓDULO =====

export const ModulePermissionJSON = {
  // Usuario al que se le otorga el permiso
  user: {
    type: Schema.Types.ObjectId,
    ref: "user", // Referencia al modelo base de usuarios
    required: true,
    index: true,
    meta: {
      validation: { isMongoId: true, required: true },
      messages: {
        required: "El usuario es obligatorio",
        isMongoId: "El ID del usuario no es válido"
      },
    },
  },

  // Departamento sobre el cual se aplica el permiso
  department: {
    type: Schema.Types.ObjectId,
    ref: "Department",
    required: true,
    index: true,
    meta: {
      validation: { isMongoId: true, required: true },
      messages: {
        required: "El departamento es obligatorio",
        isMongoId: "El ID del departamento no es válido"
      },
    },
  },

  // Tipo de acceso que tiene el usuario
  accessType: {
    type: String,
    enum: {
      values: [
        "FULL_DEPARTMENT",    // Acceso completo al departamento
        "OWN_CONTRACTS_ONLY", // Solo sus propios contratos
        "ASSIGNED_CONTRACTS", // Solo contratos asignados específicamente
        "READ_ONLY_DEPT",     // Solo lectura de todo el departamento
        "CUSTOM"              // Permisos personalizados
      ],
      message: "Tipo de acceso no válido"
    },
    required: true,
    uppercase: true,
    index: true,
    meta: {
      validation: { isIn: ["FULL_DEPARTMENT", "OWN_CONTRACTS_ONLY", "ASSIGNED_CONTRACTS", "READ_ONLY_DEPT", "CUSTOM"], required: true },
      messages: {
        required: "El tipo de acceso es obligatorio",
        isIn: "El tipo de acceso debe ser uno de los valores válidos"
      },
    },
  },

  // Acciones permitidas (CRUD)
  permissions: {
    canCreate: {
      type: Boolean,
      default: false,
      index: true
    },
    canRead: {
      type: Boolean,
      default: true,
      index: true
    },
    canUpdate: {
      type: Boolean,
      default: false,
      index: true
    },
    canDelete: {
      type: Boolean,
      default: false,
      index: true
    },
    // Permisos específicos del módulo
    canApprove: {
      type: Boolean,
      default: false,
      index: true
    },
    canReject: {
      type: Boolean,
      default: false,
      index: true
    },
    canChangePhase: {
      type: Boolean,
      default: false
    },
    canAssignContractors: {
      type: Boolean,
      default: false
    },
    canManageDocuments: {
      type: Boolean,
      default: false
    },
    canViewFinancialInfo: {
      type: Boolean,
      default: false
    },
    canGenerateReports: {
      type: Boolean,
      default: false
    },
    canManagePermissions: {
      type: Boolean,
      default: false
    }
  },

  // Restricciones específicas
  restrictions: {
    // Tipos de contrato que puede manejar
    allowedContractTypes: [{
      type: Schema.Types.ObjectId,
      ref: "ContractType"
    }],
    
    // Fases en las que puede trabajar
    allowedPhases: [{
      type: Schema.Types.ObjectId,
      ref: "ContractPhase"
    }],
    
    // Rango de montos que puede manejar
    amountLimits: {
      minAmount: {
        type: Number,
        min: 0,
        default: 0
      },
      maxAmount: {
        type: Number,
        min: 0
      }
    },
    
    // Estados de contrato que puede manejar
    allowedStatuses: [{
      type: String,
      enum: ["PREPARATION", "CALL", "EVALUATION", "AWARD", "CONTRACTING", "EXECUTION", "RECEPTION", "LIQUIDATED", "FINISHED", "DESERTED", "CANCELLED"]
    }],
    
    // Restricción de horario
    timeRestrictions: {
      startTime: {
        type: String, // formato HH:mm
        validate: {
          validator: function(v) {
            return !v || /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
          },
          message: 'La hora debe tener formato HH:mm'
        }
      },
      endTime: {
        type: String, // formato HH:mm
        validate: {
          validator: function(v) {
            return !v || /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
          },
          message: 'La hora debe tener formato HH:mm'
        }
      },
      allowedDays: [{
        type: String,
        enum: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"]
      }]
    }
  },

  // Contratos específicos asignados (solo para ASSIGNED_CONTRACTS)
  assignedContracts: [{
    contract: {
      type: Schema.Types.ObjectId,
      ref: "Contract"
    },
    assignedDate: {
      type: Date,
      default: Date.now
    },
    assignedBy: {
      type: Schema.Types.ObjectId,
      ref: "user"
    },
    permissions: {
      canRead: { type: Boolean, default: true },
      canUpdate: { type: Boolean, default: false },
      canDelete: { type: Boolean, default: false },
      canApprove: { type: Boolean, default: false }
    }
  }],

  // Vigencia del permiso
  validity: {
    startDate: {
      type: Date,
      default: Date.now,
      required: true,
      meta: {
        validation: { isDate: true, required: true },
        messages: {
          required: "La fecha de inicio es obligatoria",
          isDate: "La fecha de inicio debe ser válida"
        },
      },
    },
    endDate: {
      type: Date,
      meta: {
        validation: { isDate: true, optional: true },
        messages: {
          isDate: "La fecha de fin debe ser válida"
        },
      },
    },
    isTemporary: {
      type: Boolean,
      default: false
    }
  },

  // Información de la asignación
  assignment: {
    assignedBy: {
      type: Schema.Types.ObjectId,
      ref: "user",
      required: true,
      meta: {
        validation: { isMongoId: true, required: true },
        messages: {
          required: "El usuario asignador es obligatorio",
          isMongoId: "El ID del usuario asignador no es válido"
        },
      },
    },
    assignmentReason: {
      type: String,
      trim: true,
      maxlength: 500,
      meta: {
        validation: { isString: true, optional: true, isLength: { max: 500 } },
        messages: {
          isString: "La razón debe ser un texto válido",
          isLength: "La razón no puede exceder 500 caracteres"
        },
      },
    },
    priority: {
      type: String,
      enum: ["LOW", "NORMAL", "HIGH", "URGENT"],
      default: "NORMAL",
      uppercase: true
    }
  },

  // Estado del permiso
  status: {
    type: String,
    enum: {
      values: ["ACTIVE", "SUSPENDED", "EXPIRED", "REVOKED"],
      message: "Estado no válido"
    },
    default: "ACTIVE",
    uppercase: true,
    index: true,
    meta: {
      validation: { isIn: ["ACTIVE", "SUSPENDED", "EXPIRED", "REVOKED"], optional: true },
      messages: {
        isIn: "El estado debe ser uno de los valores válidos"
      },
    },
  },

  // Observaciones
  observations: {
    type: String,
    trim: true,
    maxlength: 1000,
    meta: {
      validation: { isString: true, optional: true, isLength: { max: 1000 } },
      messages: {
        isString: "Las observaciones deben ser un texto válido",
        isLength: "Las observaciones no pueden exceder 1000 caracteres"
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
        isBoolean: "El estado activo debe ser verdadero o falso"
      },
    },
  }
};

// ===== ESQUEMA DE PERMISOS POR DEFECTO SEGÚN ROL =====

export const RoleDefaultPermissionJSON = {
  // Rol del sistema base
  role: {
    type: Schema.Types.ObjectId,
    ref: "role", // Referencia al modelo base de roles
    required: true,
    index: true,
    meta: {
      validation: { isMongoId: true, required: true },
      messages: {
        required: "El rol es obligatorio",
        isMongoId: "El ID del rol no es válido"
      },
    },
  },

  // Nombre descriptivo del rol en este módulo
  moduleName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
    meta: {
      validation: { isString: true, required: true, notEmpty: true, isLength: { min: 3, max: 100 } },
      messages: {
        required: "El nombre del módulo es obligatorio",
        isString: "El nombre debe ser un texto válido",
        notEmpty: "El nombre no puede estar vacío",
        isLength: "El nombre debe tener entre 3 y 100 caracteres"
      },
    },
  },

  description: {
    type: String,
    trim: true,
    maxlength: 500,
    meta: {
      validation: { isString: true, optional: true, isLength: { max: 500 } },
      messages: {
        isString: "La descripción debe ser un texto válido",
        isLength: "La descripción no puede exceder 500 caracteres"
      },
    },
  },

  // Configuración por defecto para este rol
  defaultConfig: {
    // Tipo de acceso por defecto
    defaultAccessType: {
      type: String,
      enum: ["FULL_DEPARTMENT", "OWN_CONTRACTS_ONLY", "ASSIGNED_CONTRACTS", "READ_ONLY_DEPT", "CUSTOM"],
      required: true,
      uppercase: true
    },
    
    // Permisos por defecto
    defaultPermissions: {
      canCreate: { type: Boolean, default: false },
      canRead: { type: Boolean, default: true },
      canUpdate: { type: Boolean, default: false },
      canDelete: { type: Boolean, default: false },
      canApprove: { type: Boolean, default: false },
      canReject: { type: Boolean, default: false },
      canChangePhase: { type: Boolean, default: false },
      canAssignContractors: { type: Boolean, default: false },
      canManageDocuments: { type: Boolean, default: false },
      canViewFinancialInfo: { type: Boolean, default: false },
      canGenerateReports: { type: Boolean, default: false },
      canManagePermissions: { type: Boolean, default: false }
    },
    
    // Restricciones por defecto
    defaultRestrictions: {
      maxContractAmount: {
        type: Number,
        min: 0
      },
      
      restrictedContractTypes: [{
        type: Schema.Types.ObjectId,
        ref: "ContractType"
      }],
      
      restrictedPhases: [{
        type: Schema.Types.ObjectId,
        ref: "ContractPhase"
      }],
      
      requiresApproval: {
        type: Boolean,
        default: false
      },
      
      approvalThreshold: {
        type: Number,
        min: 0,
        default: 0
      }
    }
  },

  // Reglas de auto-asignación
  autoAssignmentRules: {
    // Se asigna automáticamente cuando un usuario tiene este rol
    autoAssignOnRoleAssignment: {
      type: Boolean,
      default: false
    },
    
    // Departamentos donde se aplica automáticamente
    autoDepartments: [{
      department: {
        type: Schema.Types.ObjectId,
        ref: "Department"
      },
      accessType: {
        type: String,
        enum: ["FULL_DEPARTMENT", "OWN_CONTRACTS_ONLY", "ASSIGNED_CONTRACTS", "READ_ONLY_DEPT", "CUSTOM"],
        default: "OWN_CONTRACTS_ONLY"
      }
    }],
    
    // Condiciones para la auto-asignación
    conditions: {
      userMustBelongToDepartment: {
        type: Boolean,
        default: true
      },
      
      requiresManagerApproval: {
        type: Boolean,
        default: false
      },
      
      validityDays: {
        type: Number,
        min: 1,
        max: 365,
        default: 90
      }
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
  }
};

// ===== ESQUEMA DE HISTORIAL DE CAMBIOS DE PERMISOS =====

export const PermissionHistoryJSON = {
  // Permiso modificado
  permission: {
    type: Schema.Types.ObjectId,
    ref: "ModulePermission",
    required: true,
    index: true,
    meta: {
      validation: { isMongoId: true, required: true },
      messages: {
        required: "El permiso es obligatorio",
        isMongoId: "El ID del permiso no es válido"
      },
    },
  },

  // Tipo de acción realizada
  actionType: {
    type: String,
    enum: {
      values: ["CREATED", "UPDATED", "SUSPENDED", "ACTIVATED", "REVOKED", "EXPIRED"],
      message: "Tipo de acción no válido"
    },
    required: true,
    uppercase: true,
    index: true,
    meta: {
      validation: { isIn: ["CREATED", "UPDATED", "SUSPENDED", "ACTIVATED", "REVOKED", "EXPIRED"], required: true },
      messages: {
        required: "El tipo de acción es obligatorio",
        isIn: "El tipo de acción debe ser uno de los valores válidos"
      },
    },
  },

  // Valores anteriores (para UPDATED)
  previousValues: {
    type: Schema.Types.Mixed,
    meta: {
      validation: { optional: true },
      messages: {
        invalid: "Los valores anteriores deben ser válidos"
      },
    },
  },

  // Valores nuevos (para UPDATED)
  newValues: {
    type: Schema.Types.Mixed,
    meta: {
      validation: { optional: true },
      messages: {
        invalid: "Los valores nuevos deben ser válidos"
      },
    },
  },

  // Usuario que realizó la acción
  actionBy: {
    type: Schema.Types.ObjectId,
    ref: "user",
    required: true,
    meta: {
      validation: { isMongoId: true, required: true },
      messages: {
        required: "El usuario que realizó la acción es obligatorio",
        isMongoId: "El ID del usuario no es válido"
      },
    },
  },

  // Fecha de la acción
  actionDate: {
    type: Date,
    default: Date.now,
    required: true,
    index: true,
    meta: {
      validation: { isDate: true, required: true },
      messages: {
        required: "La fecha de acción es obligatoria",
        isDate: "La fecha de acción debe ser válida"
      },
    },
  },

  // Razón del cambio
  reason: {
    type: String,
    trim: true,
    maxlength: 500,
    meta: {
      validation: { isString: true, optional: true, isLength: { max: 500 } },
      messages: {
        isString: "La razón debe ser un texto válido",
        isLength: "La razón no puede exceder 500 caracteres"
      },
    },
  },

  // Información de auditoría
  auditInfo: {
    ipAddress: {
      type: String,
      trim: true,
      maxlength: 45
    },
    userAgent: {
      type: String,
      trim: true,
      maxlength: 500
    },
    requestId: {
      type: String,
      trim: true,
      maxlength: 100
    }
  }
};

// ===== CREACIÓN DE ESQUEMAS =====

// Esquema principal de permisos
const ModulePermissionSchema = new Schema(stripMetaFields(ModulePermissionJSON), {
  timestamps: true,
  collection: "modulepermissions"
});

// Esquema de permisos por defecto
const RoleDefaultPermissionSchema = new Schema(stripMetaFields(RoleDefaultPermissionJSON), {
  timestamps: true,
  collection: "roledefaultpermissions"
});

// Esquema de historial
const PermissionHistorySchema = new Schema(stripMetaFields(PermissionHistoryJSON), {
  timestamps: true,
  collection: "permissionhistory"
});

// ===== APLICAR CONFIGURACIÓN BASE =====

setupBaseSchema(ModulePermissionSchema, {
  addTimestamps: true,
  addIndexes: true,
  addVirtuals: true,
  addMethods: true,
  addStatics: true,
  addHelpers: true,
  addBaseFields: false, // No necesitamos soft delete para permisos
});

setupBaseSchema(RoleDefaultPermissionSchema, {
  addTimestamps: true,
  addIndexes: true,
  addVirtuals: true,
  addMethods: true,
  addStatics: true,
  addHelpers: true,
  addBaseFields: false,
});

setupBaseSchema(PermissionHistorySchema, {
  addTimestamps: false, // Ya tiene actionDate
  addIndexes: true,
  addVirtuals: true,
  addMethods: true,
  addStatics: true,
  addHelpers: true,
  addBaseFields: false,
});

// ===== MIDDLEWARES Y VALIDACIONES =====

// Middleware para ModulePermission
ModulePermissionSchema.pre('save', function(next) {
  // Validar fechas de vigencia
  if (this.validity.endDate && this.validity.startDate >= this.validity.endDate) {
    return next(new Error('La fecha de fin debe ser posterior a la fecha de inicio'));
  }
  
  // Validar que no se asigne el mismo permiso dos veces al mismo usuario-departamento
  if (this.isNew) {
    this.constructor.findOne({
      user: this.user,
      department: this.department,
      status: 'ACTIVE',
      _id: { $ne: this._id }
    }).then(existing => {
      if (existing) {
        return next(new Error('El usuario ya tiene permisos activos en este departamento'));
      }
      next();
    }).catch(next);
  } else {
    next();
  }
});

// ===== MÉTODOS DE INSTANCIA =====

ModulePermissionSchema.methods.isExpired = function() {
  if (!this.validity.endDate) return false;
  return new Date() > this.validity.endDate;
};

ModulePermissionSchema.methods.hasPermission = function(action) {
  if (!this.isActive || this.status !== 'ACTIVE' || this.isExpired()) {
    return false;
  }
  
  const permissionMap = {
    'create': 'canCreate',
    'read': 'canRead', 
    'update': 'canUpdate',
    'delete': 'canDelete',
    'approve': 'canApprove',
    'reject': 'canReject'
  };
  
  return this.permissions[permissionMap[action]] || false;
};

ModulePermissionSchema.methods.canAccessContract = function(contract) {
  switch (this.accessType) {
    case 'FULL_DEPARTMENT':
      return contract.requestingDepartment.toString() === this.department.toString();
      
    case 'OWN_CONTRACTS_ONLY':
      return contract.createdBy?.toString() === this.user.toString();
      
    case 'ASSIGNED_CONTRACTS':
      return this.assignedContracts.some(ac => 
        ac.contract.toString() === contract._id.toString()
      );
      
    case 'READ_ONLY_DEPT':
      return contract.requestingDepartment.toString() === this.department.toString();
      
    default:
      return false;
  }
};

// ===== MÉTODOS ESTÁTICOS =====

ModulePermissionSchema.statics.isProtected = function(method) {
  const protectedMethods = ["get", "post", "put", "delete", "createBatch", "updateBatch"];
  return protectedMethods.includes(method);
};

ModulePermissionSchema.statics.findUserPermissions = function(userId, departmentId = null) {
  const query = { 
    user: userId, 
    status: 'ACTIVE', 
    isActive: true 
  };
  
  if (departmentId) {
    query.department = departmentId;
  }
  
  return this.find(query)
    .populate('department', 'code name shortName')
    .populate('assignedContracts.contract', 'contractNumber contractualObject')
    .sort({ createdAt: -1 });
};

ModulePermissionSchema.statics.getUserPermissionForDepartment = function(userId, departmentId) {
  return this.findOne({
    user: userId,
    department: departmentId,
    status: 'ACTIVE',
    isActive: true
  });
};

// ===== ÍNDICES =====

// Índices para ModulePermission
ModulePermissionSchema.index({ user: 1, department: 1 });
ModulePermissionSchema.index({ user: 1, status: 1 });
ModulePermissionSchema.index({ department: 1, accessType: 1 });
ModulePermissionSchema.index({ status: 1, 'validity.endDate': 1 });
ModulePermissionSchema.index({ 'assignedContracts.contract': 1 });

// Índice único para evitar duplicados activos
ModulePermissionSchema.index(
  { user: 1, department: 1, status: 1 }, 
  { 
    unique: true, 
    partialFilterExpression: { status: 'ACTIVE' } 
  }
);

// Índices para RoleDefaultPermission
RoleDefaultPermissionSchema.index({ role: 1 }, { unique: true });
RoleDefaultPermissionSchema.index({ isActive: 1 });

// Índices para PermissionHistory
PermissionHistorySchema.index({ permission: 1, actionDate: -1 });
PermissionHistorySchema.index({ actionBy: 1, actionDate: -1 });
PermissionHistorySchema.index({ actionType: 1, actionDate: -1 });

// ===== PLUGINS =====

ModulePermissionSchema.plugin(mongoosePaginate);
RoleDefaultPermissionSchema.plugin(mongoosePaginate);
PermissionHistorySchema.plugin(mongoosePaginate);

// ===== EXPORTACIÓN =====

export const ModulePermission = mongoose.model("ModulePermission", ModulePermissionSchema);
export const RoleDefaultPermission = mongoose.model("RoleDefaultPermission", RoleDefaultPermissionSchema);
export const PermissionHistory = mongoose.model("PermissionHistory", PermissionHistorySchema);