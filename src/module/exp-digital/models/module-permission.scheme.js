// =============================================================================
// src/module/exp-digital/models/module-permission.scheme.js - VERSIÓN SIMPLIFICADA
// Sistema de permisos multi-departamental para seguimiento de procesos de contratación
// GADM Cantón Esmeraldas - Ecuador
// =============================================================================

import mongoose, { Types } from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";
import { setupBaseSchema } from "../../core/base/models/base.scheme.js";
import { stripMetaFields } from "../../../../utils/meta-field.js";

const { Schema } = mongoose;

// ===== DEFINICIÓN DE NIVELES DE ACCESO =====
export const ACCESS_LEVELS = {
  OWNER: "OWNER", // Gestor completo del departamento
  CONTRIBUTOR: "CONTRIBUTOR", // Colaborador con permisos limitados
  OBSERVER: "OBSERVER", // Solo lectura y observaciones
  REPOSITORY: "REPOSITORY", // Acceso total como repositorio (ej: Compras Públicas)
};

// ===== DEFINICIÓN DE ACCIONES DEL SISTEMA =====
export const SYSTEM_ACTIONS = {
  // Gestión de contratos
  CREATE_CONTRACT: "create_contract",
  VIEW_CONTRACT: "view_contract",
  EDIT_CONTRACT: "edit_contract",
  DELETE_CONTRACT: "delete_contract",

  // Gestión documental
  UPLOAD_DOCUMENT: "upload_document",
  DOWNLOAD_DOCUMENT: "download_document",
  DELETE_DOCUMENT: "delete_document",
  VIEW_DOCUMENT: "view_document",

  // Interacciones
  ADD_OBSERVATION: "add_observation",
  EDIT_OBSERVATION: "edit_observation",
  DELETE_OBSERVATION: "delete_observation",

  // Visualización de datos
  VIEW_FINANCIAL_DATA: "view_financial_data",
  VIEW_ALL_DEPARTMENTS: "view_all_departments",
  EXPORT_DATA: "export_data",
};

// ===== ESQUEMA DE ACCESO POR DEPARTAMENTO =====
export const UserDepartmentAccessJSON = {
  // Usuario que recibe el acceso
  user: {
    type: Schema.Types.ObjectId,
    ref: "user",
    required: true,
    index: true,
    meta: {
      validation: { isMongoId: true, required: true },
      messages: {
        required: "El usuario es obligatorio",
        isMongoId: "El ID del usuario no es válido",
      },
    },
  },

  // Departamento al que accede
  department: {
    type: Schema.Types.ObjectId,
    ref: "Department",
    required: true,
    index: true,
    meta: {
      validation: { isMongoId: true, required: true },
      messages: {
        required: "El departamento es obligatorio",
        isMongoId: "El ID del departamento no es válido",
      },
    },
  },

  // Nivel de acceso en este departamento
  accessLevel: {
    type: String,
    enum: {
      values: Object.values(ACCESS_LEVELS),
      message: "Nivel de acceso no válido",
    },
    required: true,
    uppercase: true,
    index: true,
    meta: {
      validation: { isIn: Object.values(ACCESS_LEVELS), required: true },
      messages: {
        required: "El nivel de acceso es obligatorio",
        isIn: "El nivel de acceso debe ser uno de los valores válidos (OWNER, CONTRIBUTOR, OBSERVER, REPOSITORY)",
      },
    },
  },

  // ===== PERMISOS ESPECÍFICOS EN ESTE DEPARTAMENTO =====
  permissions: {
    // === GESTIÓN DE CONTRATOS ===
    contracts: {
      canCreate: { type: Boolean, default: false },
      canViewOwn: { type: Boolean, default: true },
      canViewDepartment: { type: Boolean, default: true },
      canViewAll: { type: Boolean, default: false }, // Para REPOSITORY
      canEdit: { type: Boolean, default: false },
      canDelete: { type: Boolean, default: false },
    },

    // === GESTIÓN DOCUMENTAL ===
    documents: {
      canUpload: { type: Boolean, default: false },
      canDownload: { type: Boolean, default: true },
      canView: { type: Boolean, default: true },
      canDelete: { type: Boolean, default: false },
      canManageAll: { type: Boolean, default: false }, // Para OWNER
    },

    // === INTERACCIONES ===
    interactions: {
      canAddObservations: { type: Boolean, default: false },
      canEditOwnObservations: { type: Boolean, default: false },
      canDeleteOwnObservations: { type: Boolean, default: false },
      canViewAllObservations: { type: Boolean, default: true },
    },

    // === ACCESOS ESPECIALES ===
    special: {
      canViewFinancialData: { type: Boolean, default: false },
      canExportData: { type: Boolean, default: false },
      canViewCrossDepartment: { type: Boolean, default: false },
      canManagePermissions: { type: Boolean, default: false }, // Solo para administradores
    },
  },

  // ===== RESTRICCIONES ESPECÍFICAS (OPCIONALES) =====
  restrictions: {
    // Tipos de contrato que puede gestionar (vacío = todos)
    allowedContractTypes: [
      {
        type: Schema.Types.ObjectId,
        ref: "ContractType",
      },
    ],

    // Fases específicas donde puede trabajar (vacío = todas)
    allowedPhases: [
      {
        type: Schema.Types.ObjectId,
        ref: "ContractPhase",
      },
    ],

    // Límite de monto para contratos (0 = sin límite)
    maxContractAmount: {
      type: Number,
      min: 0,
      default: 0,
    },

    // Restricciones temporales
    workingHours: {
      enabled: { type: Boolean, default: false },
      startTime: {
        type: String, // HH:MM
        validate: {
          validator: function (v) {
            return !v || /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
          },
          message: "La hora debe tener formato HH:MM",
        },
      },
      endTime: {
        type: String, // HH:MM
        validate: {
          validator: function (v) {
            return !v || /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
          },
          message: "La hora debe tener formato HH:MM",
        },
      },
      allowedDays: [
        {
          type: String,
          enum: [
            "MONDAY",
            "TUESDAY",
            "WEDNESDAY",
            "THURSDAY",
            "FRIDAY",
            "SATURDAY",
            "SUNDAY",
          ],
        },
      ],
    },

    // Restricciones de IP (opcional)
    ipRestrictions: {
      enabled: { type: Boolean, default: false },
      allowedIPs: [String],
      blockedIPs: [String],
    },
  },

  // ===== CONFIGURACIÓN DE ACCESO CRUZADO =====
  crossDepartmentAccess: {
    // Departamentos que puede visualizar (además del propio)
    viewableDepartments: {
      type: [
        {
          department: {
            type: Schema.Types.ObjectId,
            ref: "Department",
          },
          accessLevel: {
            type: String,
            enum: ["READ_ONLY", "OBSERVE_COMMENT", "COLLABORATE"],
            default: "READ_ONLY",
          },
        },
      ],
      default: [],
    },

    // Si tiene acceso global (como repositorio)
    hasGlobalAccess: { type: Boolean, default: false },
  },

  // ===== INFORMACIÓN DE ASIGNACIÓN =====
  assignment: {
    assignedBy: {
      type: Schema.Types.ObjectId,
      ref: "user",
      required: true,
      meta: {
        validation: { isMongoId: true, required: true },
        messages: {
          required: "El usuario que asigna es obligatorio",
          isMongoId: "El ID del usuario asignador no es válido",
        },
      },
    },

    assignmentDate: {
      type: Date,
      default: Date.now,
      required: true,
    },

    assignmentReason: {
      type: String,
      trim: true,
      maxlength: 500,
      meta: {
        validation: { isString: true, optional: true, isLength: { max: 500 } },
        messages: {
          isString: "La razón debe ser un texto válido",
          isLength: "La razón no puede exceder 500 caracteres",
        },
      },
    },

    isPrimary: {
      type: Boolean,
      default: false,
      index: true,
    }, // Marca si este es su departamento principal

    priority: {
      type: String,
      enum: ["LOW", "NORMAL", "HIGH"],
      default: "NORMAL",
      uppercase: true,
    },
  },

  // ===== VIGENCIA DEL ACCESO =====
  validity: {
    startDate: {
      type: Date,
      default: Date.now,
      required: true,
      meta: {
        validation: { isDate: true, required: true },
        messages: {
          required: "La fecha de inicio es obligatoria",
          isDate: "La fecha de inicio debe ser válida",
        },
      },
    },

    endDate: {
      type: Date,
      meta: {
        validation: { isDate: true, optional: true },
        messages: {
          isDate: "La fecha de fin debe ser válida",
        },
      },
    },

    isTemporary: { type: Boolean, default: false },

    autoExpire: {
      enabled: { type: Boolean, default: false },
      days: { type: Number, min: 1, max: 365 }, // Días después de los cuales expira
    },
  },

  // ===== ESTADO DEL ACCESO =====
  status: {
    type: String,
    enum: {
      values: ["ACTIVE", "SUSPENDED", "EXPIRED", "REVOKED", "PENDING"],
      message: "Estado no válido",
    },
    default: "ACTIVE",
    uppercase: true,
    index: true,
    meta: {
      validation: {
        isIn: ["ACTIVE", "SUSPENDED", "EXPIRED", "REVOKED", "PENDING"],
        optional: true,
      },
      messages: {
        isIn: "El estado debe ser uno de los valores válidos",
      },
    },
  },

  // ===== OBSERVACIONES Y METADATOS =====
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

  metadata: {
    lastAccess: Date,
    accessCount: { type: Number, default: 0 },

    // Tags para categorización
    tags: [
      {
        type: String,
        maxlength: 50,
      },
    ],

    // Información adicional
    notes: String,
  },

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

// ===== ESQUEMA DE PLANTILLAS DE PERMISOS =====
export const PermissionTemplateJSON = {
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
    unique: true,
    meta: {
      validation: {
        isString: true,
        required: true,
        notEmpty: true,
        isLength: { min: 3, max: 100 },
      },
      messages: {
        required: "El nombre de la plantilla es obligatorio",
        isString: "El nombre debe ser un texto válido",
        notEmpty: "El nombre no puede estar vacío",
        isLength: "El nombre debe tener entre 3 y 100 caracteres",
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
        isLength: "La descripción no puede exceder 500 caracteres",
      },
    },
  },

  // Nivel de acceso que aplica esta plantilla
  defaultAccessLevel: {
    type: String,
    enum: Object.values(ACCESS_LEVELS),
    required: true,
    uppercase: true,
  },

  // Configuración de permisos de la plantilla
  permissionTemplate: {
    contracts: {
      canCreate: { type: Boolean, default: false },
      canViewOwn: { type: Boolean, default: true },
      canViewDepartment: { type: Boolean, default: true },
      canViewAll: { type: Boolean, default: false },
      canEdit: { type: Boolean, default: false },
      canDelete: { type: Boolean, default: false },
    },

    documents: {
      canUpload: { type: Boolean, default: false },
      canDownload: { type: Boolean, default: true },
      canView: { type: Boolean, default: true },
      canDelete: { type: Boolean, default: false },
      canManageAll: { type: Boolean, default: false },
    },

    interactions: {
      canAddObservations: { type: Boolean, default: false },
      canEditOwnObservations: { type: Boolean, default: false },
      canDeleteOwnObservations: { type: Boolean, default: false },
      canViewAllObservations: { type: Boolean, default: true },
    },

    special: {
      canViewFinancialData: { type: Boolean, default: false },
      canExportData: { type: Boolean, default: false },
      canViewCrossDepartment: { type: Boolean, default: false },
      canManagePermissions: { type: Boolean, default: false },
    },
  },

  // Roles que pueden usar esta plantilla
  applicableRoles: [
    {
      type: Schema.Types.ObjectId,
      ref: "role",
    },
  ],

  // Departamentos donde se puede aplicar
  applicableDepartments: [
    {
      type: Schema.Types.ObjectId,
      ref: "Department",
    },
  ],

  // Configuración de auto-aplicación
  autoAssignment: {
    enabled: { type: Boolean, default: false },
    trigger: {
      type: String,
      enum: ["ROLE_ASSIGNMENT", "DEPARTMENT_JOIN", "MANUAL"],
      default: "MANUAL",
    },
  },

  createdBy: {
    type: Schema.Types.ObjectId,
    ref: "user",
    required: true,
  },

  isActive: { type: Boolean, default: true, index: true },
};

// ===== ESQUEMA DE HISTORIAL DE PERMISOS =====
export const PermissionHistoryJSON = {
  userDepartmentAccess: {
    type: Schema.Types.ObjectId,
    ref: "UserDepartmentAccess",
    required: true,
    index: true,
  },

  actionType: {
    type: String,
    enum: {
      values: [
        "CREATED",
        "UPDATED",
        "ACTIVATED",
        "SUSPENDED",
        "REVOKED",
        "EXPIRED",
        "RESTORED",
      ],
      message: "Tipo de acción no válido",
    },
    required: true,
    uppercase: true,
    index: true,
  },

  changedBy: {
    type: Schema.Types.ObjectId,
    ref: "user",
    required: true,
  },

  changeDate: {
    type: Date,
    default: Date.now,
    required: true,
    index: true,
  },

  previousValues: Schema.Types.Mixed,
  newValues: Schema.Types.Mixed,

  reason: {
    type: String,
    trim: true,
    maxlength: 500,
  },

  auditInfo: {
    ipAddress: String,
    userAgent: String,
    sessionId: String,
  },
};

// ===== EXTENSIÓN DEL ESQUEMA DE CONTRATO PARA CONCURRENCIA =====
export const ContractConcurrencyExtension = {
  concurrencyControl: {
    currentlyEditing: {
      userId: {
        type: Schema.Types.ObjectId,
        ref: "user",
      },
      userName: {
        type: String,
        trim: true,
        maxlength: 150,
      },
      userEmail: {
        type: String,
        trim: true,
        lowercase: true,
      },
      startTime: Date,
      sessionId: {
        type: String,
        trim: true,
        maxlength: 100,
      },
      ipAddress: {
        type: String,
        trim: true,
        maxlength: 45,
      },
    },
    editLock: {
      type: Boolean,
      default: false,
      index: true,
    },
    lockExpiration: {
      type: Date,
      index: true,
    },
    version: {
      type: Number,
      default: 0,
      min: 0,
    },
    forceUnlocked: {
      type: Boolean,
      default: false,
    },
    forceUnlockedBy: {
      type: Schema.Types.ObjectId,
      ref: "user",
    },
    forceUnlockedAt: Date,
  },
};

// ===== EXTENSIÓN DEL ESQUEMA DE DEPARTAMENTO PARA POLÍTICAS =====
export const DepartmentContractPoliciesExtension = {
  contractPolicies: {
    // Control de concurrencia
    concurrency: {
      allowMultipleEditors: {
        type: Boolean,
        default: false,
      },
      maxConcurrentEdits: {
        type: Number,
        default: 1,
        min: 1,
        max: 5,
      },
      autoReleaseLockMinutes: {
        type: Number,
        default: 30,
        min: 5,
        max: 240,
      },
      lockExtensionAllowed: {
        type: Boolean,
        default: true,
      },
      maxLockExtensions: {
        type: Number,
        default: 2,
        min: 0,
        max: 5,
      },
    },

    // Acciones permitidas
    allowedActions: [
      {
        type: String,
        enum: [
          "UPLOAD_DOCUMENT",
          "MODIFY_DATA",
          "DELETE_DOCUMENT",
          "CHANGE_PHASE",
          "ADD_OBSERVATION",
          "APPROVE",
          "REJECT",
        ],
      },
    ],

    // Restricciones de edición
    editRestrictions: {
      requiresApprovalToEdit: {
        type: Boolean,
        default: false,
      },
      editablePhases: [
        {
          type: Schema.Types.ObjectId,
          ref: "ContractPhase",
        },
      ],
      restrictedFields: [String], // Campos que no se pueden editar

      // Restricciones por rol
      roleRestrictions: [
        {
          role: {
            type: String,
            enum: ["OWNER", "CONTRIBUTOR", "OBSERVER", "REPOSITORY"],
          },
          allowedActions: [String],
          maxEditTime: Number, // minutos
        },
      ],
    },

    // Notificaciones
    notifications: {
      notifyOnLock: { type: Boolean, default: true },
      notifyOnUnlock: { type: Boolean, default: false },
      notifyOnForceUnlock: { type: Boolean, default: true },
      notifyDepartmentHead: { type: Boolean, default: false },
      escalationMinutes: { type: Number, default: 60 },
    },

    // Auditoría
    auditLevel: {
      type: String,
      enum: ["BASIC", "DETAILED", "COMPREHENSIVE"],
      default: "BASIC",
    },
  },
};

// ===== CREACIÓN DE ESQUEMAS =====

const UserDepartmentAccessSchema = new Schema(
  stripMetaFields(UserDepartmentAccessJSON),
  {
    timestamps: true,
    collection: "userdepartmentaccess",
  }
);

const PermissionTemplateSchema = new Schema(
  stripMetaFields(PermissionTemplateJSON),
  {
    timestamps: true,
    collection: "permissiontemplates",
  }
);

const PermissionHistorySchema = new Schema(
  stripMetaFields(PermissionHistoryJSON),
  {
    timestamps: true,
    collection: "permissionhistory",
  }
);

// ===== APLICAR CONFIGURACIÓN BASE =====

setupBaseSchema(UserDepartmentAccessSchema);

setupBaseSchema(PermissionTemplateSchema);

setupBaseSchema(PermissionHistorySchema, {
  addTimestamps: false, // Ya tiene changeDate
  addIndexes: true,
  addVirtuals: true,
  addMethods: true,
  addStatics: true,
  addHelpers: true,
});

// ===== MIDDLEWARES =====

// Pre-save: Configurar permisos según nivel de acceso
UserDepartmentAccessSchema.pre("save", function (next) {
  // Auto-configurar permisos según el nivel de acceso
  if (this.isModified("accessLevel")) {
    this.configurePermissionsByLevel();
  }

  // Validar que no haya duplicados activos
  if (this.isNew || this.isModified("user") || this.isModified("department")) {
    this.constructor
      .findOne({
        user: this.user,
        department: this.department,
        status: "ACTIVE",
        _id: { $ne: this._id },
      })
      .then((existing) => {
        if (existing) {
          return next(
            new Error("El usuario ya tiene acceso activo a este departamento")
          );
        }
        next();
      })
      .catch(next);
  } else {
    next();
  }
});

// ===== HOOKS =====

// ✅ CRÍTICO: Hook pre-save para controlar isPrimary duplicados
// Garantiza que solo un acceso por usuario tenga isPrimary = true
UserDepartmentAccessSchema.pre("save", async function (next) {
  // Solo aplicar si isPrimary cambió a true
  if (
    this.isModified("assignment.isPrimary") &&
    this.assignment.isPrimary === true
  ) {
    try {
      // Desmarcar otros accesos como primarios para este usuario
      await this.constructor.updateMany(
        {
          user: this.user,
          _id: { $ne: this._id }, // Excluir el documento actual
          "assignment.isPrimary": true,
        },
        {
          $set: { "assignment.isPrimary": false },
        }
      );
      console.log(
        `[pre-save] Unmarked other primary accesses for user: ${this.user}`
      );
    } catch (error) {
      console.error("[pre-save] Error unmarking primary accesses:", error);
      return next(error);
    }
  }
  next();
});

// ✅ Hook pre-save para actualizar versión de concurrencia
UserDepartmentAccessSchema.pre("save", function (next) {
  if (this.isModified() && !this.isNew) {
    this.concurrency.version += 1;
    this.concurrency.lastModified = new Date();
  }
  next();
});

// ===== MÉTODOS DE INSTANCIA =====

UserDepartmentAccessSchema.methods.toJSON = function () {
  const obj = this.toObject();
  return stripMetaFields(obj);
};

// Configurar permisos automáticamente según el nivel de acceso
UserDepartmentAccessSchema.methods.configurePermissionsByLevel = function () {
  switch (this.accessLevel) {
    case ACCESS_LEVELS.OWNER:
      this.permissions = {
        contracts: {
          canCreate: true,
          canViewOwn: true,
          canViewDepartment: true,
          canViewAll: false,
          canEdit: true,
          canDelete: true,
        },
        documents: {
          canUpload: true,
          canDownload: true,
          canView: true,
          canDelete: true,
          canManageAll: true,
        },
        interactions: {
          canAddObservations: true,
          canEditOwnObservations: true,
          canDeleteOwnObservations: true,
          canViewAllObservations: true,
        },
        special: {
          canViewFinancialData: true,
          canExportData: true,
          canViewCrossDepartment: false,
          canManagePermissions: false,
        },
      };
      break;

    case ACCESS_LEVELS.REPOSITORY:
      this.permissions = {
        contracts: {
          canCreate: false,
          canViewOwn: true,
          canViewDepartment: true,
          canViewAll: true,
          canEdit: false,
          canDelete: false,
        },
        documents: {
          canUpload: false,
          canDownload: true,
          canView: true,
          canDelete: false,
          canManageAll: false,
        },
        interactions: {
          canAddObservations: true,
          canEditOwnObservations: true,
          canDeleteOwnObservations: false,
          canViewAllObservations: true,
        },
        special: {
          canViewFinancialData: true,
          canExportData: true,
          canViewCrossDepartment: true,
          canManagePermissions: false,
        },
      };
      this.crossDepartmentAccess.hasGlobalAccess = true;
      break;

    case ACCESS_LEVELS.CONTRIBUTOR:
      this.permissions = {
        contracts: {
          canCreate: false,
          canViewOwn: true,
          canViewDepartment: true,
          canViewAll: false,
          canEdit: false,
          canDelete: false,
        },
        documents: {
          canUpload: true,
          canDownload: true,
          canView: true,
          canDelete: false,
          canManageAll: false,
        },
        interactions: {
          canAddObservations: true,
          canEditOwnObservations: true,
          canDeleteOwnObservations: false,
          canViewAllObservations: true,
        },
        special: {
          canViewFinancialData: false,
          canExportData: false,
          canViewCrossDepartment: false,
          canManagePermissions: false,
        },
      };
      break;

    case ACCESS_LEVELS.OBSERVER:
      this.permissions = {
        contracts: {
          canCreate: false,
          canViewOwn: true,
          canViewDepartment: true,
          canViewAll: false,
          canEdit: false,
          canDelete: false,
        },
        documents: {
          canUpload: false,
          canDownload: true,
          canView: true,
          canDelete: false,
          canManageAll: false,
        },
        interactions: {
          canAddObservations: true,
          canEditOwnObservations: true,
          canDeleteOwnObservations: false,
          canViewAllObservations: true,
        },
        special: {
          canViewFinancialData: false,
          canExportData: false,
          canViewCrossDepartment: false,
          canManagePermissions: false,
        },
      };
      break;
  }
};

// Verificar si tiene un permiso específico
// ✅ CORRECCIÓN: Logging más robusto y distinción de errores
UserDepartmentAccessSchema.methods.hasPermission = function (
  category,
  permission
) {
  if (!this.permissions) {
    console.warn(`[hasPermission] No permissions object found`);
    return false;
  }

  const cat = this.permissions[category];
  if (!cat) {
    console.warn(`[hasPermission] Category not found: ${category}`);
    return false;
  }

  if (!(permission in cat)) {
    console.warn(
      `[hasPermission] Permission key not found in category ${category}: ${permission}`
    );
    return false;
  }

  return Boolean(cat[permission]);
};

// Verificar si el acceso ha expirado
UserDepartmentAccessSchema.methods.isExpired = function () {
  if (!this.validity.endDate) return false;
  return new Date() > this.validity.endDate;
};

// Verificar si puede acceder a un contrato específico
// ✅ CORRECCIÓN COMPLETA: Evalúa allowedPhases, maxContractAmount y usa comparaciones robustas
UserDepartmentAccessSchema.methods.canAccessContract = function (contract) {
  // 1. Verificaciones de estado básico
  if (!this.isActive || this.status !== "ACTIVE" || this.isExpired()) {
    console.log(
      "[canAccessContract] Access is inactive, not ACTIVE, or expired"
    );
    return false;
  }

  // 2. Obtener IDs de forma segura
  const departmentId =
    this.department && (this.department._id || this.department);
  const contractDeptId =
    contract.requestingDepartment &&
    (contract.requestingDepartment._id || contract.requestingDepartment);

  if (!departmentId || !contractDeptId) {
    console.warn("[canAccessContract] Missing department IDs");
    return false;
  }

  // 3. Verificar acceso departamental (mismo departamento)
  const isSameDepartment = new Types.ObjectId(departmentId).equals(
    new Types.ObjectId(contractDeptId)
  );

  if (isSameDepartment) {
    if (!this.hasPermission("contracts", "canViewDepartment")) {
      console.log(
        "[canAccessContract] Same department but no canViewDepartment permission"
      );
      return false;
    }
  } else {
    // 4. Verificar acceso cross-departamental
    // 4.1 Acceso global (REPOSITORY)
    if (
      this.crossDepartmentAccess &&
      this.crossDepartmentAccess.hasGlobalAccess &&
      this.hasPermission("contracts", "canViewAll")
    ) {
      // OK - tiene acceso global, continuar con validaciones adicionales
    } else {
      // 4.2 Acceso específico cross-department
      const viewableDepts =
        (this.crossDepartmentAccess &&
          this.crossDepartmentAccess.viewableDepartments) ||
        [];
      const hasCrossAccess = viewableDepts.some((vd) => {
        const crossId = vd.department && (vd.department._id || vd.department);
        return (
          crossId &&
          Types.ObjectId(crossId).equals(Types.ObjectId(contractDeptId))
        );
      });

      if (!hasCrossAccess) {
        console.log("[canAccessContract] No cross-department access found");
        return false;
      }
    }
  }

  // 5. ✅ CRÍTICO: Verificar restricción de FASES
  if (
    this.restrictions &&
    Array.isArray(this.restrictions.allowedPhases) &&
    this.restrictions.allowedPhases.length > 0
  ) {
    const contractPhaseId =
      contract.phase && (contract.phase._id || contract.phase);

    if (!contractPhaseId) {
      console.warn(
        "[canAccessContract] Contract has no phase, but allowedPhases restriction exists"
      );
      return false;
    }

    const isPhaseAllowed = this.restrictions.allowedPhases.some(
      (allowedPhase) => {
        const phaseId = allowedPhase._id || allowedPhase;
        return Types.ObjectId(phaseId).equals(Types.ObjectId(contractPhaseId));
      }
    );

    if (!isPhaseAllowed) {
      console.log("[canAccessContract] Contract phase not in allowedPhases");
      return false;
    }
  }

  // 6. ✅ CRÍTICO: Verificar restricción de MONTO
  if (
    this.restrictions &&
    this.restrictions.maxContractAmount &&
    this.restrictions.maxContractAmount > 0
  ) {
    const contractAmount =
      typeof contract.amount === "number"
        ? contract.amount
        : parseFloat(contract.amount);

    if (isNaN(contractAmount)) {
      console.warn("[canAccessContract] Contract amount is not a valid number");
      return false;
    }

    if (contractAmount > this.restrictions.maxContractAmount) {
      console.log(
        `[canAccessContract] Contract amount (${contractAmount}) exceeds max allowed (${this.restrictions.maxContractAmount})`
      );
      return false;
    }
  }

  // 7. ✅ Todas las validaciones pasaron
  return true;
};

// ===== MÉTODOS ESTÁTICOS =====

UserDepartmentAccessSchema.statics.isProtected = function (method) {
  const protectedMethods = [
    "get",
    "post",
    "put",
    "delete",
    "createBatch",
    "updateBatch",
  ];
  return protectedMethods.includes(method);
};

// ✅ CRÍTICO: Método para expirar accesos automáticamente
// Debe ser llamado por un job/cron periódicamente (ej: diario)
UserDepartmentAccessSchema.statics.expireAccessesBatch = async function () {
  try {
    const now = new Date();

    // Buscar accesos que deberían estar expirados
    const expiredAccesses = await this.find({
      status: "ACTIVE",
      isActive: true,
      "validity.endDate": { $lt: now },
    });

    if (expiredAccesses.length === 0) {
      console.log("[expireAccessesBatch] No expired accesses found");
      return { expired: 0, errors: [] };
    }

    const results = {
      expired: 0,
      errors: [],
    };

    // Procesar cada acceso expirado
    for (const access of expiredAccesses) {
      try {
        access.status = "EXPIRED";
        access.isActive = false;
        access.auditInfo.lastModifiedAt = now;
        access.auditInfo.lastModifiedBy = null; // Sistema automático

        await access.save();

        // Crear registro de historial si existe el modelo
        try {
          const PermissionHistory = mongoose.model("PermissionHistory");
          await PermissionHistory.create({
            userDepartmentAccess: access._id,
            actionType: "EXPIRED",
            changedBy: null, // Sistema automático
            changeDate: now,
            changeReason: "Expired automatically by system",
            previousState: { status: "ACTIVE", isActive: true },
            newState: { status: "EXPIRED", isActive: false },
          });
        } catch (historyError) {
          console.warn(
            "[expireAccessesBatch] Could not create history:",
            historyError.message
          );
        }

        results.expired++;
      } catch (error) {
        console.error(
          `[expireAccessesBatch] Error expiring access ${access._id}:`,
          error
        );
        results.errors.push({ accessId: access._id, error: error.message });
      }
    }

    console.log(
      `[expireAccessesBatch] Expired ${results.expired} accesses with ${results.errors.length} errors`
    );
    return results;
  } catch (error) {
    console.error("[expireAccessesBatch] Fatal error:", error);
    throw error;
  }
};

// Obtener todos los accesos de un usuario
UserDepartmentAccessSchema.statics.getUserAccesses = function (
  userId,
  status = "ACTIVE",
  departmentId = null
) {
  console.log("Obteniendo accesos para el usuario:", userId, status);

  // Construir el objeto de consulta base
  const query = {
    user: new Types.ObjectId(userId),
    status: status,
    isActive: true,
  };

  // Solo agregar department a la consulta si departmentId no es null
  if (departmentId !== null) {
    query.department = departmentId;
  }

  return this.find(query)
    .populate("department", "code name shortName contactInfo")
    .sort({ "assignment.isPrimary": -1, "assignment.assignmentDate": -1 });
};

// Verificar si un usuario puede realizar una acción específica
UserDepartmentAccessSchema.statics.checkUserPermission = async function (
  userId,
  departmentId,
  category,
  permission,
  contractId = null
) {
  console.log(
    "checkUserPermission",
    userId,
    departmentId,
    category,
    permission,
    contractId
  );
  const access = await this.findOne({
    user: userId,
    department: departmentId,
    status: "ACTIVE",
    isActive: true,
  });

  if (!access) return { allowed: false, reason: "No access found" };

  // Si se especifica un contrato, verificar acceso específico
  if (contractId) {
    const Contract = mongoose.model("Contract");
    const contract = await Contract.findById(contractId);
    if (!contract) return { allowed: false, reason: "Contract not found" };

    const canAccess = access.canAccessContract(contract);
    console.log("Contract access check:", canAccess);

    if (!canAccess) {
      return { allowed: false, reason: "No access to this contract" };
    }
  }

  const hasPermission = access.hasPermission(category, permission);
  return {
    allowed: hasPermission,
    accessLevel: access.accessLevel,
    reason: hasPermission ? "Permission granted" : "Permission denied",
  };
};

// Obtener el dashboard de permisos de un usuario
UserDepartmentAccessSchema.statics.getUserDashboard = async function (userId) {
  const accesses = await this.getUserAccesses(userId);

  const dashboard = {
    primaryDepartment: null,
    departmentAccesses: [],
    globalAccess: false,
    summary: {
      totalDepartments: accesses.length,
      canCreateContracts: false,
      canViewAllDepartments: false,
      isRepositoryUser: false,
    },
  };

  accesses.forEach((access) => {
    if (access.assignment.isPrimary) {
      dashboard.primaryDepartment = access;
    }

    dashboard.departmentAccesses.push({
      department: access.department,
      accessLevel: access.accessLevel,
      permissions: access.permissions,
      crossDepartmentAccess: access.crossDepartmentAccess,
    });

    // Actualizar resumen
    if (access.hasPermission("contracts", "canCreate")) {
      dashboard.summary.canCreateContracts = true;
    }

    if (access.crossDepartmentAccess.hasGlobalAccess) {
      dashboard.summary.canViewAllDepartments = true;
      dashboard.globalAccess = true;
    }

    if (access.accessLevel === ACCESS_LEVELS.REPOSITORY) {
      dashboard.summary.isRepositoryUser = true;
    }
  });

  return dashboard;
};

// ===== VIRTUALES =====

UserDepartmentAccessSchema.virtual("isExpiredVirtual").get(function () {
  return this.isExpired();
});

UserDepartmentAccessSchema.virtual("accessLevelDisplay").get(function () {
  const displayNames = {
    OWNER: "Gestor Completo",
    CONTRIBUTOR: "Colaborador",
    OBSERVER: "Observador",
    REPOSITORY: "Repositorio General",
  };
  return displayNames[this.accessLevel] || this.accessLevel;
});

// ===== QUERY HELPERS =====

UserDepartmentAccessSchema.query.active = function () {
  return this.where({ status: "ACTIVE", isActive: true });
};

UserDepartmentAccessSchema.query.byUser = function (userId) {
  return this.where({ user: userId });
};

UserDepartmentAccessSchema.query.byDepartment = function (departmentId) {
  return this.where({ department: departmentId });
};

UserDepartmentAccessSchema.query.byAccessLevel = function (level) {
  return this.where({ accessLevel: level.toUpperCase() });
};

UserDepartmentAccessSchema.query.withGlobalAccess = function () {
  return this.where({ "crossDepartmentAccess.hasGlobalAccess": true });
};

// ===== ÍNDICES OPTIMIZADOS =====

// Índices principales
UserDepartmentAccessSchema.index({ user: 1, status: 1, isActive: 1 });
UserDepartmentAccessSchema.index({ department: 1, accessLevel: 1, status: 1 });
UserDepartmentAccessSchema.index({ user: 1, department: 1, status: 1 });

// Índice único para evitar duplicados activos
// ✅ CORRECCIÓN: Incluye isActive en la expresión parcial
UserDepartmentAccessSchema.index(
  { user: 1, department: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "ACTIVE", isActive: true },
  }
);

// Índices para consultas específicas
UserDepartmentAccessSchema.index({ accessLevel: 1, isActive: 1 });
UserDepartmentAccessSchema.index({ "assignment.isPrimary": 1, user: 1 });
UserDepartmentAccessSchema.index({
  "crossDepartmentAccess.hasGlobalAccess": 1,
});
UserDepartmentAccessSchema.index({ "validity.endDate": 1, status: 1 });

// Índices para PermissionTemplate
PermissionTemplateSchema.index({ name: 1 }, { unique: true });
PermissionTemplateSchema.index({ defaultAccessLevel: 1, isActive: 1 });
PermissionTemplateSchema.index({ applicableRoles: 1 });
PermissionTemplateSchema.index({ applicableDepartments: 1 });

// Índices para PermissionHistory
PermissionHistorySchema.index({ userDepartmentAccess: 1, changeDate: -1 });
PermissionHistorySchema.index({ changedBy: 1, changeDate: -1 });
PermissionHistorySchema.index({ actionType: 1, changeDate: -1 });

// ===== PLUGINS =====

UserDepartmentAccessSchema.plugin(mongoosePaginate);
PermissionTemplateSchema.plugin(mongoosePaginate);
PermissionHistorySchema.plugin(mongoosePaginate);

// ===== EXPORTACIÓN =====

export const UserDepartmentAccess = mongoose.model(
  "UserDepartmentAccess",
  UserDepartmentAccessSchema
);
export const PermissionTemplate = mongoose.model(
  "PermissionTemplate",
  PermissionTemplateSchema
);
export const PermissionHistory = mongoose.model(
  "PermissionHistory",
  PermissionHistorySchema
);

// =============================================================================
// CORRECCIONES CRÍTICAS APLICADAS - VERSIÓN MEJORADA
// =============================================================================
//
// 1. ✅ EVALUACIÓN DE FASES (allowedPhases)
//    - canAccessContract() ahora valida si el contrato está en una fase permitida
//    - Usar: restrictions.allowedPhases = [phaseId1, phaseId2, ...]
//
// 2. ✅ EVALUACIÓN DE MONTO MÁXIMO (maxContractAmount)
//    - canAccessContract() ahora valida si el monto del contrato está dentro del límite
//    - Usar: restrictions.maxContractAmount = 50000
//
// 3. ✅ CONTROL DE isPrimary DUPLICADOS
//    - Hook pre-save garantiza que solo un acceso por usuario tenga isPrimary = true
//    - Automáticamente desmarca otros accesos primarios del mismo usuario
//
// 4. ✅ AUTOMATIZACIÓN DE EXPIRACIÓN
//    - Método estático expireAccessesBatch() para expirar accesos vencidos
//    - Llamar desde un job/cron diario:
//      ```javascript
//      const { UserDepartmentAccess } = require('./models/module-permission.scheme');
//      const result = await UserDepartmentAccess.expireAccessesBatch();
//      console.log(`Expired: ${result.expired}, Errors: ${result.errors.length}`);
//      ```
//
// 5. ✅ COMPARACIONES ROBUSTAS DE ObjectId
//    - Usa Types.ObjectId.equals() en lugar de .toString()
//    - Maneja casos poblados y no poblados correctamente
//
// 6. ✅ DEFAULTS SEGUROS
//    - crossDepartmentAccess.viewableDepartments tiene default: []
//    - Evita errores cuando el campo no existe
//
// 7. ✅ ÍNDICE ÚNICO MEJORADO
//    - Expresión parcial incluye { status: "ACTIVE", isActive: true }
//    - Más preciso para evitar duplicados
//
// 8. ✅ VERSIONADO DE CONCURRENCIA
//    - Hook pre-save incrementa concurrency.version automáticamente
//    - Actualiza concurrency.lastModified en cada guardado
//
// 9. ✅ hasPermission MEJORADO
//    - Logging detallado con console.warn para debugging
//    - Distingue entre "categoría no existe" y "permiso denegado"
//
// =============================================================================
// MIGRACIÓN REQUERIDA ANTES DE DESPLEGAR
// =============================================================================
//
// Ejecutar en MongoDB antes de aplicar el nuevo índice:
//
// ```javascript
// // 1. Limpiar duplicados activos existentes
// db.userdepartmentaccess.aggregate([
//   { $match: { status: "ACTIVE", isActive: true } },
//   { $group: { _id: { user: "$user", department: "$department" }, count: { $sum: 1 }, docs: { $push: "$$ROOT" } } },
//   { $match: { count: { $gt: 1 } } }
// ]).forEach(group => {
//   // Mantener solo el más reciente, marcar otros como INACTIVE
//   const sorted = group.docs.sort((a, b) => b.assignment.assignmentDate - a.assignment.assignmentDate);
//   sorted.slice(1).forEach(doc => {
//     db.userdepartmentaccess.updateOne(
//       { _id: doc._id },
//       { $set: { status: "INACTIVE", isActive: false } }
//     );
//   });
// });
//
// // 2. Asegurar que crossDepartmentAccess existe en todos los documentos
// db.userdepartmentaccess.updateMany(
//   { crossDepartmentAccess: { $exists: false } },
//   { $set: { crossDepartmentAccess: { viewableDepartments: [], hasGlobalAccess: false } } }
// );
//
// // 3. Normalizar isPrimary (máximo uno por usuario)
// db.userdepartmentaccess.aggregate([
//   { $match: { "assignment.isPrimary": true } },
//   { $group: { _id: "$user", count: { $sum: 1 }, docs: { $push: "$$ROOT" } } },
//   { $match: { count: { $gt: 1 } } }
// ]).forEach(group => {
//   const sorted = group.docs.sort((a, b) => b.assignment.assignmentDate - a.assignment.assignmentDate);
//   sorted.slice(1).forEach(doc => {
//     db.userdepartmentaccess.updateOne(
//       { _id: doc._id },
//       { $set: { "assignment.isPrimary": false } }
//     );
//   });
// });
// ```
//
// =============================================================================
