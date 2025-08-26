// =============================================================================
// src/module/exp-digital/models/module-permission.scheme.js - VERSIÓN SIMPLIFICADA
// Sistema de permisos multi-departamental para seguimiento de procesos de contratación
// GADM Cantón Esmeraldas - Ecuador
// =============================================================================

import mongoose from "mongoose";
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
    viewableDepartments: [
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

setupBaseSchema(UserDepartmentAccessSchema, {
  addTimestamps: true,
  addIndexes: true,
  addVirtuals: true,
  addMethods: true,
  addStatics: true,
  addHelpers: true,
  addBaseFields: false,
});

setupBaseSchema(PermissionTemplateSchema, {
  addTimestamps: true,
  addIndexes: true,
  addVirtuals: true,
  addMethods: true,
  addStatics: true,
  addHelpers: true,
  addBaseFields: false,
});

setupBaseSchema(PermissionHistorySchema, {
  addTimestamps: false, // Ya tiene changeDate
  addIndexes: true,
  addVirtuals: true,
  addMethods: true,
  addStatics: true,
  addHelpers: true,
  addBaseFields: false,
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
UserDepartmentAccessSchema.methods.hasPermission = function (
  category,
  permission
) {
  if (!this.isActive || this.status !== "ACTIVE" || this.isExpired()) {
    return false;
  }

  return this.permissions[category] && this.permissions[category][permission];
};

// Verificar si el acceso ha expirado
UserDepartmentAccessSchema.methods.isExpired = function () {
  if (!this.validity.endDate) return false;
  return new Date() > this.validity.endDate;
};

// Verificar si puede acceder a un contrato específico
UserDepartmentAccessSchema.methods.canAccessContract = function (contract) {
  if (!this.isActive || this.status !== "ACTIVE" || this.isExpired()) {
    return false;
  }

  // Si es del mismo departamento
  if (contract.requestingDepartment.toString() === this.department.toString()) {
    return this.hasPermission("contracts", "canViewDepartment");
  }

  // Si tiene acceso global (REPOSITORY)
  if (
    this.crossDepartmentAccess.hasGlobalAccess &&
    this.hasPermission("contracts", "canViewAll")
  ) {
    return true;
  }

  // Si tiene acceso específico a otros departamentos
  const crossAccess = this.crossDepartmentAccess.viewableDepartments.find(
    (vd) =>
      vd.department.toString() === contract.requestingDepartment.toString()
  );

  return !!crossAccess;
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

// Obtener todos los accesos de un usuario
UserDepartmentAccessSchema.statics.getUserAccesses = function (
  userId,
  status = "ACTIVE"
) {
  return this.find({
    user: userId,
    status: status,
    isActive: true,
  })
    .populate("department", "code name shortName")
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

    if (!access.canAccessContract(contract)) {
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
UserDepartmentAccessSchema.index(
  { user: 1, department: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "ACTIVE" },
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
