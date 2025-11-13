// src/module/exp-digital/models/file.scheme.js
import mongoose from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";
import {
  setupBaseSchema,
  CommonValidators,
} from "../../core/base/models/base.scheme.js";
import { stripMetaFields } from "../../../../utils/meta-field.js";
import crypto from "crypto";
import path from "path";
import rsyncClient from "../../../config/rsync.client.js";

const { Schema } = mongoose;

// ============================================
// SUB-ESQUEMAS
// ============================================

// Sub-esquema para metadatos de archivo
const FileMetadataJSON = {
  // Información técnica del archivo
  encoding: {
    type: String,
    trim: true,
    maxlength: 20,
    default: "utf-8",
  },

  dimensions: {
    width: {
      type: Number,
      min: 0,
    },
    height: {
      type: Number,
      min: 0,
    },
  },

  // Para documentos PDF
  pageCount: {
    type: Number,
    min: 0,
  },

  // Información de seguridad
  isPasswordProtected: {
    type: Boolean,
    default: false,
  },

  hasSignatures: {
    type: Boolean,
    default: false,
  },

  // Metadatos extraídos del archivo
  title: String,
  author: String,
  subject: String,
  keywords: [String],
  creator: String,
  producer: String,
  creationDate: Date,
  modificationDate: Date,
};

// Sub-esquema mejorado para control de versiones
const VersionInfoJSON = {
  // Versión actual del documento
  version: {
    type: Number,
    required: true,
    min: 1,
    default: 1,
  },

  // Indica si esta es la versión actual/vigente
  isCurrentVersion: {
    type: Boolean,
    default: true,
    index: true,
  },

  // Referencia al documento padre (versión anterior)
  // Este campo se usa para crear la cadena de versionado
  parentDocument: {
    type: Schema.Types.ObjectId,
    ref: "File",
    default: null,
    index: true,
    meta: {
      validation: { isMongoId: true, optional: true },
      messages: {
        isMongoId: "El ID del documento padre no es válido",
      },
    },
  },

  // Referencia al documento raíz (primera versión)
  // Útil para encontrar todas las versiones de un documento
  rootDocument: {
    type: Schema.Types.ObjectId,
    ref: "File",
    default: null,
    index: true,
    meta: {
      validation: { isMongoId: true, optional: true },
      messages: {
        isMongoId: "El ID del documento raíz no es válido",
      },
    },
  },

  // Notas sobre los cambios realizados en esta versión
  versionNotes: {
    type: String,
    trim: true,
    maxlength: 1000,
    meta: {
      validation: { isString: true, optional: true, isLength: { max: 1000 } },
      messages: {
        isString: "Las notas de versión deben ser un texto válido",
        isLength: "Las notas de versión no pueden exceder 1000 caracteres",
      },
    },
  },

  // Tipo de cambio realizado
  changeType: {
    type: String,
    enum: [
      "MINOR", // Cambios menores (correcciones tipográficas, formato)
      "MAJOR", // Cambios significativos (contenido, estructura)
      "CORRECTION", // Corrección por error o rechazo
      "REPLACEMENT", // Reemplazo completo del documento
      "REVISION", // Revisión tras rechazo
    ],
    default: "MINOR",
    uppercase: true,
  },

  // Razón del cambio (especialmente importante para CORRECTION y REVISION)
  changeReason: {
    type: String,
    trim: true,
    maxlength: 500,
    meta: {
      validation: { isString: true, optional: true, isLength: { max: 500 } },
      messages: {
        isString: "La razón del cambio debe ser un texto válido",
        isLength: "La razón del cambio no puede exceder 500 caracteres",
      },
    },
  },

  // Usuario que creó esta versión
  versionedBy: {
    type: Schema.Types.ObjectId,
    ref: "User",
    meta: {
      validation: { isMongoId: true, optional: true },
      messages: {
        isMongoId: "El ID del usuario que versionó no es válido",
      },
    },
  },

  // Fecha de creación de la versión
  versionDate: {
    type: Date,
    default: Date.now,
    meta: {
      validation: { isDate: true, optional: true },
      messages: {
        isDate: "La fecha de versión debe ser válida",
      },
    },
  },
};

// Sub-esquema específico para rsync
const RsyncInfoJSON = {
  // Información de ubicación remota
  remoteHost: {
    type: String,
    trim: true,
    maxlength: 255,
    default: null,
  },

  remotePath: {
    type: String,
    trim: true,
    maxlength: 1000,
    default: null,
  },

  // CAMPO CRÍTICO: Nombre del archivo en el servidor remoto
  remoteFileName: {
    type: String,
    trim: true,
    maxlength: 255,
    default: null,
    index: true,
  },

  // Estado de sincronización
  syncStatus: {
    type: String,
    enum: ["PENDING", "SYNCING", "SYNCED", "FAILED", "PARTIAL", "SKIPPED"],
    default: "PENDING",
    index: true,
  },

  // Timestamps de sincronización
  lastSyncAttempt: {
    type: Date,
    default: null,
  },

  lastSyncSuccess: {
    type: Date,
    default: null,
    index: true,
  },

  // Control de reintentos
  syncRetries: {
    type: Number,
    default: 0,
    min: 0,
    max: 10,
  },

  maxRetries: {
    type: Number,
    default: 3,
    min: 0,
    max: 10,
  },

  // Error de sincronización
  syncError: {
    type: String,
    trim: true,
    maxlength: 2000,
    default: null,
  },

  // Verificación de integridad
  remoteHash: {
    type: String,
    trim: true,
    maxlength: 128,
    default: null,
  },

  remoteSize: {
    type: Number,
    min: 0,
    default: null,
  },

  verificationDate: {
    type: Date,
    default: null,
  },

  // Configuración de sincronización
  priority: {
    type: String,
    enum: ["LOW", "NORMAL", "HIGH", "URGENT"],
    default: "NORMAL",
    index: true,
  },

  autoSync: {
    type: Boolean,
    default: true,
  },

  keepLocal: {
    type: Boolean,
    default: true,
  },

  // Configuración específica del middleware
  middlewareConfig: {
    pathBuilder: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },

    customNaming: {
      type: Boolean,
      default: false,
    },

    verifyTransfer: {
      type: Boolean,
      default: true,
    },
  },

  // Estadísticas de transferencia
  transferStats: {
    totalTransfers: {
      type: Number,
      default: 0,
      min: 0,
    },

    successfulTransfers: {
      type: Number,
      default: 0,
      min: 0,
    },

    avgTransferTime: {
      type: Number,
      default: 0,
      min: 0,
    },

    lastTransferDuration: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
};

// ============================================
// ESQUEMA PRINCIPAL
// ============================================

export const FileJSON = {
  // ============================================
  // CONTEXTO Y MÓDULO
  // ============================================

  // Identificar el módulo de origen del documento
  module: {
    type: String,
    enum: [
      "DIGITAL_RECORD", // Expediente Digital (Contratación)
      "DOCUMENT_MANAGEMENT", // Gestión Documental (Recepción/Emisión)
      "ARCHIVE", // Archivo
      "GENERAL", // General
    ],
    default: "DIGITAL_RECORD",
    uppercase: true,
    required: true,
    index: true,
    meta: {
      validation: {
        isIn: ["DIGITAL_RECORD", "DOCUMENT_MANAGEMENT", "ARCHIVE", "GENERAL"],
        required: true,
      },
      messages: {
        required: "El módulo es obligatorio",
        isIn: "El módulo debe ser uno de los valores válidos",
      },
    },
  },

  // ============================================
  // RELACIONES OPCIONALES (según módulo)
  // ============================================

  // SOLO para módulo DIGITAL_RECORD (Expediente Digital)
  contract: {
    type: Schema.Types.ObjectId,
    ref: "Contract",
    default: null,
    index: true,
    meta: {
      validation: { isMongoId: true, optional: true },
      messages: {
        isMongoId: "El ID del contrato no es válido",
      },
    },
  },

  phase: {
    type: Schema.Types.ObjectId,
    ref: "ContractPhase",
    default: null,
    index: true,
    meta: {
      validation: { isMongoId: true, optional: true },
      messages: {
        isMongoId: "El ID de la fase no es válido",
      },
    },
  },

  // PARA todos los módulos - Departamento que gestiona el documento
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

  // ============================================
  // INFORMACIÓN DEL DOCUMENTO
  // ============================================

  documentType: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
    maxlength: 50,
    index: true,
    meta: {
      validation: {
        isString: true,
        required: true,
        notEmpty: true,
        isLength: { min: 2, max: 50 },
      },
      messages: {
        required: "El tipo de documento es obligatorio",
        isString: "El tipo de documento debe ser un texto válido",
        notEmpty: "El tipo de documento no puede estar vacío",
        isLength: "El tipo de documento debe tener entre 2 y 50 caracteres",
      },
    },
  },

  // ============================================
  // INFORMACIÓN DEL ARCHIVO
  // ============================================

  // Información del archivo original
  originalName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 255,
    meta: {
      validation: {
        isString: true,
        required: true,
        notEmpty: true,
        isLength: { min: 1, max: 255 },
      },
      messages: {
        required: "El nombre original es obligatorio",
        isString: "El nombre original debe ser un texto válido",
        notEmpty: "El nombre original no puede estar vacío",
        isLength: "El nombre original no puede exceder 255 caracteres",
      },
    },
  },

  // Nombre generado por el sistema
  systemName: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    maxlength: 100,
    meta: {
      validation: {
        isString: true,
        required: true,
        notEmpty: true,
        isLength: { min: 1, max: 100 },
      },
      messages: {
        required: "El nombre del sistema es obligatorio",
        isString: "El nombre del sistema debe ser un texto válido",
        notEmpty: "El nombre del sistema no puede estar vacío",
        isLength: "El nombre del sistema no puede exceder 100 caracteres",
      },
    },
  },

  // Rutas de almacenamiento (EXTENDIDO para rsync)
  storage: {
    path: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
      meta: {
        validation: {
          isString: true,
          required: true,
          notEmpty: true,
          isLength: { min: 1, max: 500 },
        },
        messages: {
          required: "La ruta de almacenamiento es obligatoria",
          isString: "La ruta debe ser un texto válido",
          notEmpty: "La ruta no puede estar vacía",
          isLength: "La ruta no puede exceder 500 caracteres",
        },
      },
    },

    relativePath: {
      type: String,
      trim: true,
      maxlength: 300,
      meta: {
        validation: { isString: true, optional: true, isLength: { max: 300 } },
        messages: {
          isString: "La ruta relativa debe ser un texto válido",
          isLength: "La ruta relativa no puede exceder 300 caracteres",
        },
      },
    },

    storageProvider: {
      type: String,
      enum: ["LOCAL", "AWS_S3", "AZURE", "GOOGLE_CLOUD", "RSYNC", "DELETED"],
      default: "LOCAL",
      uppercase: true,
    },

    bucket: {
      type: String,
      trim: true,
      maxlength: 100,
    },

    region: {
      type: String,
      trim: true,
      maxlength: 50,
    },
  },

  // Información específica de rsync (NUEVO)
  rsyncInfo: {
    type: RsyncInfoJSON,
    default: () => ({}),
    meta: {
      validation: { optional: true },
      messages: {
        invalid: "La información de rsync debe ser válida",
      },
    },
  },

  // Información técnica del archivo
  fileInfo: {
    fileType: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      maxlength: 10,
      validate: {
        validator: function (v) {
          const allowedTypes = [
            "pdf",
            "doc",
            "docx",
            "xls",
            "xlsx",
            "jpg",
            "jpeg",
            "png",
            "gif",
            "zip",
            "rar",
            "7z",
            "txt",
            "csv",
          ];
          return allowedTypes.includes(v);
        },
        message: "Tipo de archivo no permitido",
      },
      meta: {
        validation: {
          isIn: [
            "pdf",
            "doc",
            "docx",
            "xls",
            "xlsx",
            "jpg",
            "jpeg",
            "png",
            "gif",
            "zip",
            "rar",
            "7z",
            "txt",
            "csv",
          ],
          required: true,
        },
        messages: {
          required: "El tipo de archivo es obligatorio",
          isIn: "El tipo de archivo no está permitido",
        },
      },
    },

    mimeType: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
      meta: {
        validation: {
          isString: true,
          required: true,
          notEmpty: true,
          isLength: { max: 100 },
        },
        messages: {
          required: "El tipo MIME es obligatorio",
          isString: "El tipo MIME debe ser un texto válido",
          notEmpty: "El tipo MIME no puede estar vacío",
          isLength: "El tipo MIME no puede exceder 100 caracteres",
        },
      },
    },

    size: {
      type: Number,
      required: true,
      min: 0,
      max: 104857600, // 100MB máximo
      meta: {
        validation: { isNumeric: true, required: true, min: 0, max: 104857600 },
        messages: {
          required: "El tamaño del archivo es obligatorio",
          isNumeric: "El tamaño debe ser numérico",
          min: "El tamaño no puede ser negativo",
          max: "El archivo no puede exceder 100MB",
        },
      },
    },

    hash: {
      type: String,
      required: true,
      trim: true,
      length: 64, // SHA-256
      validate: {
        validator: function (v) {
          return /^[a-f0-9]{64}$/i.test(v);
        },
        message: "El hash debe ser un SHA-256 válido",
      },
      index: true,
      meta: {
        validation: {
          isString: true,
          required: true,
          isLength: { min: 64, max: 64 },
        },
        messages: {
          required: "El hash del archivo es obligatorio",
          isString: "El hash debe ser un texto válido",
          isLength: "El hash debe tener exactamente 64 caracteres",
        },
      },
    },

    checksum: {
      type: String,
      trim: true,
      maxlength: 64,
    },
  },

  // Metadatos del documento
  document: {
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

    category: {
      type: String,
      enum: ["LEGAL", "TECHNICAL", "FINANCIAL", "ADMINISTRATIVE", "OTHER"],
      default: "ADMINISTRATIVE",
      uppercase: true,
    },

    confidentialityLevel: {
      type: String,
      enum: ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"],
      default: "INTERNAL",
      uppercase: true,
    },

    language: {
      type: String,
      default: "es",
      lowercase: true,
      maxlength: 5,
    },

    keywords: {
      type: [String],
      default: [],
      validate: {
        validator: function (v) {
          return v.length <= 20;
        },
        message: "No se pueden tener más de 20 palabras clave",
      },
    },

    expirationDate: {
      type: Date,
      meta: {
        validation: { isDate: true, optional: true },
        messages: {
          isDate: "La fecha de expiración debe ser válida",
        },
      },
    },
  },

  // ============================================
  // CONTROL DE VERSIONES
  // ============================================

  versionInfo: {
    type: VersionInfoJSON,
    default: () => ({}),
    meta: {
      validation: { optional: true },
      messages: {
        invalid: "La información de versión debe ser válida",
      },
    },
  },

  // Metadatos del archivo
  metadata: {
    type: FileMetadataJSON,
    default: () => ({}),
    meta: {
      validation: { optional: true },
      messages: {
        invalid: "Los metadatos del archivo deben ser válidos",
      },
    },
  },

  // ============================================
  // CONTROL DE ACCESO
  // ============================================

  access: {
    isPublic: {
      type: Boolean,
      default: false,
      index: true,
      meta: {
        validation: { isBoolean: true, optional: true },
        messages: {
          isBoolean: "El acceso público debe ser verdadero o falso",
        },
      },
    },

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

    allowedUsers: [
      {
        userId: {
          type: Schema.Types.ObjectId,
          ref: "User",
        },
        permissions: {
          type: [String],
          enum: ["READ", "DOWNLOAD", "COMMENT", "EDIT"],
          default: ["READ"],
        },
      },
    ],

    // NUEVO: Historial unificado
    history: [
      {
        userId: {
          type: Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        action: {
          type: String,
          //enum: ["VIEW", "DOWNLOAD"],
          required: true,
        },
        observations: String,
        timestamp: {
          type: Date,
          default: Date.now,
        },
        source: {
          type: String,
          enum: ["web", "mobile", "api"],
          default: "web",
        },
        ipAddress: String,
        userAgent: String,
        format: String, // Solo para downloads
      },
    ],

    downloadCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    viewCount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },

  // ============================================
  // AUDITORÍA
  // ============================================

  audit: {
    uploadedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      meta: {
        validation: { isMongoId: true, required: true },
        messages: {
          required: "El usuario que subió el archivo es obligatorio",
          isMongoId: "El ID del usuario no es válido",
        },
      },
    },

    uploadDate: {
      type: Date,
      default: Date.now,
      required: true,
      index: true,
      meta: {
        validation: { isDate: true, required: true },
        messages: {
          required: "La fecha de subida es obligatoria",
          isDate: "La fecha de subida debe ser válida",
        },
      },
    },

    lastAccessDate: {
      type: Date,
      meta: {
        validation: { isDate: true, optional: true },
        messages: {
          isDate: "La fecha de último acceso debe ser válida",
        },
      },
    },

    lastModifiedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      meta: {
        validation: { isMongoId: true, optional: true },
        messages: {
          isMongoId: "El ID del último modificador no es válido",
        },
      },
    },

    ipAddress: {
      type: String,
      trim: true,
      maxlength: 45,
    },

    userAgent: {
      type: String,
      trim: true,
      maxlength: 500,
    },
  },

  // ============================================
  // ESTADOS DEL DOCUMENTO (EXTENDIDOS)
  // ============================================

  status: {
    type: String,
    enum: {
      values: [
        // Estados de flujo de contratación
        "DRAFT", // Borrador
        "REVIEW", // En revisión
        "APPROVED", // Aprobado
        "REJECTED", // Rechazado
        "OBSOLETE", // Obsoleto
        "ARCHIVED", // Archivado
        // Estados de gestión documental
        "RECEPTION", // Recepción de documento
        "EMISSION", // Emisión de documento
        "PENDING", // Pendiente
        "IN_PROCESS", // En proceso
        "COMPLETED", // Completado
      ],
      message: "Estado no válido",
    },
    default: "DRAFT",
    uppercase: true,
    index: true,
    meta: {
      validation: {
        isIn: [
          "DRAFT",
          "REVIEW",
          "APPROVED",
          "REJECTED",
          "OBSOLETE",
          "ARCHIVED",
          "RECEPTION",
          "EMISSION",
          "PENDING",
          "IN_PROCESS",
          "COMPLETED",
        ],
        optional: true,
      },
      messages: {
        isIn: "El estado debe ser uno de los valores válidos",
      },
    },
  },

  // ============================================
  // REVISIÓN Y APROBACIÓN
  // ============================================

  review: {
    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      meta: {
        validation: { isMongoId: true, optional: true },
        messages: {
          isMongoId: "El ID del revisor no es válido",
        },
      },
    },

    reviewDate: {
      type: Date,
      meta: {
        validation: { isDate: true, optional: true },
        messages: {
          isDate: "La fecha de revisión debe ser válida",
        },
      },
    },

    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      meta: {
        validation: { isMongoId: true, optional: true },
        messages: {
          isMongoId: "El ID del aprobador no es válido",
        },
      },
    },

    approvalDate: {
      type: Date,
      meta: {
        validation: { isDate: true, optional: true },
        messages: {
          isDate: "La fecha de aprobación debe ser válida",
        },
      },
    },

    observations: {
      type: String,
      trim: true,
      maxlength: 2000,
      meta: {
        validation: { isString: true, optional: true, isLength: { max: 2000 } },
        messages: {
          isString: "Las observaciones deben ser un texto válido",
          isLength: "Las observaciones no pueden exceder 2000 caracteres",
        },
      },
    },

    rejectionReason: {
      type: String,
      trim: true,
      maxlength: 1000,
      meta: {
        validation: { isString: true, optional: true, isLength: { max: 1000 } },
        messages: {
          isString: "La razón de rechazo debe ser un texto válido",
          isLength: "La razón de rechazo no puede exceder 1000 caracteres",
        },
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
        isBoolean: "El estado activo debe ser verdadero o falso",
      },
    },
  },
};

// ============================================
// CREAR ESQUEMA
// ============================================

const FileSchema = new Schema(stripMetaFields(FileJSON), {
  timestamps: true,
  collection: "files",
});

// Aplicar configuración base
setupBaseSchema(FileSchema);

// ============================================
// MIDDLEWARES PERSONALIZADOS
// ============================================

// Pre-save: validaciones y configuraciones
FileSchema.pre("save", async function (next) {
  // 1. Generar nombre del sistema si es nuevo
  if (this.isNew && !this.systemName) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const extension = path.extname(this.originalName);

    this.systemName = `${timestamp}_${random}${extension}`;
  }

  // 2. Validación según módulo
  if (this.module === "DIGITAL_RECORD") {
    // Para expediente digital, contrato y fase son obligatorios
    if (!this.contract) {
      return next(
        new Error(
          "El contrato es obligatorio para documentos del expediente digital"
        )
      );
    }
    if (!this.phase) {
      return next(
        new Error(
          "La fase es obligatoria para documentos del expediente digital"
        )
      );
    }
  }

  // 3. Configurar rootDocument si es la primera versión
  if (this.isNew && !this.versionInfo.rootDocument) {
    this.versionInfo.rootDocument = this._id;
  }

  // 4. Configurar versionInfo al crear versiones
  if (this.versionInfo.parentDocument && this.isNew) {
    // Buscar el documento padre para obtener la información de versión
    const parentDoc = await this.constructor.findById(
      this.versionInfo.parentDocument
    );

    if (parentDoc) {
      // Heredar el rootDocument del padre
      if (!this.versionInfo.rootDocument) {
        this.versionInfo.rootDocument =
          parentDoc.versionInfo.rootDocument || parentDoc._id;
      }

      // Incrementar la versión
      this.versionInfo.version = parentDoc.versionInfo.version + 1;

      // Marcar el documento padre como versión no actual
      parentDoc.versionInfo.isCurrentVersion = false;
      await parentDoc.save({ validateBeforeSave: false });
    }
  }

  // 5. Configurar rsync si se especifica como proveedor
  if (this.storage.storageProvider === "RSYNC") {
    if (!this.rsyncInfo) {
      this.rsyncInfo = {};
    }

    if (!this.rsyncInfo.remoteHost) {
      this.rsyncInfo.remoteHost = process.env.RSYNC_REMOTE_HOST;
    }

    if (!this.rsyncInfo.remotePath) {
      const baseRemotePath = process.env.RSYNC_REMOTE_PATH || "/files";

      // Construir ruta según el módulo
      if (this.module === "DIGITAL_RECORD" && this.contract && this.phase) {
        this.rsyncInfo.remotePath = `${baseRemotePath}/${this.contract}/${this.phase}`;
      } else {
        this.rsyncInfo.remotePath = `${baseRemotePath}/${this.department}`;
      }
    }

    if (!this.rsyncInfo.remoteFileName) {
      this.rsyncInfo.remoteFileName = this.systemName;
    }

    if (this.isNew) {
      this.rsyncInfo.syncStatus = "PENDING";
      this.rsyncInfo.autoSync = this.rsyncInfo.autoSync !== false;
    }
  }

  // 6. Validar tamaño según tipo de archivo
  const maxSizes = {
    pdf: 50 * 1024 * 1024, // 50MB
    doc: 25 * 1024 * 1024, // 25MB
    docx: 25 * 1024 * 1024, // 25MB
    xls: 15 * 1024 * 1024, // 15MB
    xlsx: 15 * 1024 * 1024, // 15MB
    jpg: 10 * 1024 * 1024, // 10MB
    jpeg: 10 * 1024 * 1024, // 10MB
    png: 10 * 1024 * 1024, // 10MB
    zip: 100 * 1024 * 1024, // 100MB
    rar: 100 * 1024 * 1024, // 100MB
  };

  const maxSize = maxSizes[this.fileInfo.fileType] || 10 * 1024 * 1024;

  if (this.fileInfo.size > maxSize) {
    return next(
      new Error(
        `El archivo ${this.fileInfo.fileType} no puede exceder ${Math.round(maxSize / (1024 * 1024))}MB`
      )
    );
  }

  // 7. Validar duplicados por hash
  if (this.isModified("fileInfo.hash")) {
    const existingFile = await this.constructor.findOne({
      _id: { $ne: this._id },
      "fileInfo.hash": this.fileInfo.hash,
      isActive: true,
    });

    if (existingFile) {
      console.warn(
        `Archivo duplicado detectado: ${this.originalName} (hash: ${this.fileInfo.hash})`
      );
    }
  }

  // 8. Actualizar fecha de último acceso si es nuevo
  if (this.isNew) {
    this.audit.lastAccessDate = new Date();
  }

  next();
});

// Post-save: sincronizar con rsync automáticamente
FileSchema.post("save", async function (doc) {
  if (
    doc.storage.storageProvider === "RSYNC" &&
    doc.rsyncInfo?.autoSync &&
    doc.rsyncInfo?.syncStatus === "PENDING"
  ) {
    console.log(
      `📤 Iniciando sincronización automática para archivo: ${doc.systemName}`
    );

    setImmediate(async () => {
      try {
        await doc.syncToRsync();
      } catch (error) {
        console.error(
          `❌ Error en sincronización automática: ${error.message}`
        );
      }
    });
  }
});

// ============================================
// MÉTODOS DE INSTANCIA
// ============================================

FileSchema.methods.toJSON = function () {
  const obj = this.toObject();
  return stripMetaFields(obj);
};

// Obtener extensión del archivo
FileSchema.methods.getFileExtension = function () {
  return path.extname(this.originalName).toLowerCase().substring(1);
};

// Obtener tamaño del archivo con unidad
FileSchema.methods.getFileSize = function (unit = "MB") {
  const units = {
    B: 1,
    KB: 1024,
    MB: 1024 * 1024,
    GB: 1024 * 1024 * 1024,
  };

  const size = this.fileInfo.size / (units[unit] || units.MB);
  return Math.round(size * 100) / 100;
};

// Crear nueva versión del documento
FileSchema.methods.createNewVersion = async function (fileData, options = {}) {
  const {
    userId,
    changeType = "MINOR",
    changeReason = "",
    versionNotes = "",
  } = options;

  // Marcar esta versión como no actual
  this.versionInfo.isCurrentVersion = false;
  await this.save({ validateBeforeSave: false });

  // Crear nuevo documento con los datos del archivo
  const newVersion = new this.constructor({
    ...fileData,
    // Heredar información relevante del documento padre
    module: this.module,
    contract: this.contract,
    phase: this.phase,
    department: this.department,
    unit: this.unit,
    documentType: this.documentType,
    document: {
      ...this.document,
      description: fileData.document?.description || this.document.description,
    },
    // Configurar información de versión
    versionInfo: {
      version: this.versionInfo.version + 1,
      isCurrentVersion: true,
      parentDocument: this._id,
      rootDocument: this.versionInfo.rootDocument || this._id,
      changeType,
      changeReason,
      versionNotes,
      versionedBy: userId,
      versionDate: new Date(),
    },
    // Configurar auditoría
    audit: {
      uploadedBy: userId,
      uploadDate: new Date(),
      ipAddress: fileData.audit?.ipAddress,
      userAgent: fileData.audit?.userAgent,
    },
    // Iniciar en estado borrador
    status: "DRAFT",
  });

  await newVersion.save();
  return newVersion;
};

// Obtener todas las versiones del documento
FileSchema.methods.getAllVersions = function () {
  const rootId = this.versionInfo.rootDocument || this._id;

  return this.constructor
    .find({
      $or: [{ _id: rootId }, { "versionInfo.rootDocument": rootId }],
      isActive: true,
    })
    .sort({ "versionInfo.version": 1 });
};

// Obtener versión actual
FileSchema.methods.getCurrentVersion = function () {
  const rootId = this.versionInfo.rootDocument || this._id;

  return this.constructor.findOne({
    $or: [{ _id: rootId }, { "versionInfo.rootDocument": rootId }],
    "versionInfo.isCurrentVersion": true,
    isActive: true,
  });
};

// Sincronizar con rsync
FileSchema.methods.syncToRsync = async function () {
  if (this.storage.storageProvider !== "RSYNC") {
    throw new Error("Este archivo no está configurado para usar rsync");
  }

  if (this.rsyncInfo.syncStatus === "SYNCING") {
    throw new Error("Ya hay una sincronización en progreso");
  }

  const startTime = new Date();

  try {
    this.rsyncInfo.syncStatus = "SYNCING";
    this.rsyncInfo.lastSyncAttempt = startTime;
    this.rsyncInfo.syncError = undefined;
    await this.save({ validateBeforeSave: false });

    console.log(
      `🔄 Sincronizando archivo ${this.systemName} a ${this.rsyncInfo.remoteHost}`
    );

    const result = await rsyncClient.transferFile(
      this.storage.path,
      this.rsyncInfo.remoteFileName
    );

    if (result.success) {
      this.rsyncInfo.syncStatus = "SYNCED";
      this.rsyncInfo.lastSyncSuccess = new Date();
      this.rsyncInfo.syncRetries = 0;

      console.log(`✅ Archivo ${this.systemName} sincronizado exitosamente`);
    } else {
      throw new Error("La sincronización no fue exitosa");
    }
  } catch (error) {
    this.rsyncInfo.syncStatus = "FAILED";
    this.rsyncInfo.syncError = error.message;
    this.rsyncInfo.syncRetries += 1;

    console.error(
      `❌ Error sincronizando ${this.systemName}: ${error.message}`
    );

    if (this.rsyncInfo.syncRetries < this.rsyncInfo.maxRetries) {
      console.log(
        `🔄 Programando reintento ${this.rsyncInfo.syncRetries + 1}/${this.rsyncInfo.maxRetries}`
      );
      this.rsyncInfo.syncStatus = "PENDING";

      const delay = Math.min(
        30000 * Math.pow(2, this.rsyncInfo.syncRetries),
        300000
      );
      setTimeout(() => {
        this.syncToRsync().catch((err) =>
          console.error(`❌ Error en reintento: ${err.message}`)
        );
      }, delay);
    }

    throw error;
  } finally {
    await this.save({ validateBeforeSave: false });
  }
};

// Verificar integridad del archivo remoto
FileSchema.methods.verifyRemoteIntegrity = async function () {
  if (
    this.storage.storageProvider !== "RSYNC" ||
    this.rsyncInfo?.syncStatus !== "SYNCED"
  ) {
    return { verified: false, reason: "Archivo no sincronizado con rsync" };
  }

  try {
    const remoteFiles = await rsyncClient.listRemoteFiles();
    const remoteFile = remoteFiles.find((file) =>
      file.includes(this.rsyncInfo.remoteFileName)
    );

    if (!remoteFile) {
      return {
        verified: false,
        reason: "Archivo no encontrado en servidor remoto",
      };
    }

    this.rsyncInfo.verificationDate = new Date();
    await this.save({ validateBeforeSave: false });

    return {
      verified: true,
      remoteFile: remoteFile,
      verificationDate: this.rsyncInfo.verificationDate,
    };
  } catch (error) {
    console.error(`❌ Error verificando integridad remota: ${error.message}`);
    return { verified: false, reason: error.message };
  }
};

// Obtener URL de acceso
FileSchema.methods.getAccessUrl = function () {
  if (this.storage.storageProvider === "RSYNC") {
    if (this.rsyncInfo?.syncStatus === "SYNCED") {
      return `/api/files/${this._id}/download?source=remote`;
    } else {
      return this.rsyncInfo?.keepLocal
        ? `/api/files/${this._id}/download?source=local`
        : null;
    }
  }

  return `/api/files/${this._id}/download`;
};

// Verificar si el archivo está disponible
FileSchema.methods.isAvailable = function () {
  if (this.storage.storageProvider === "RSYNC") {
    return this.rsyncInfo?.syncStatus === "SYNCED" || this.rsyncInfo?.keepLocal;
  }

  return true;
};

// Forzar re-sincronización
FileSchema.methods.forceSyncToRsync = async function () {
  if (this.storage.storageProvider !== "RSYNC") {
    throw new Error("Este archivo no está configurado para usar rsync");
  }

  this.rsyncInfo.syncStatus = "PENDING";
  this.rsyncInfo.syncRetries = 0;
  this.rsyncInfo.syncError = undefined;

  await this.save();
  return await this.syncToRsync();
};

// Verificar si un usuario puede acceder al archivo
FileSchema.methods.canUserAccess = function (userId, userRole) {
  if (!this.isAvailable()) {
    return false;
  }

  if (this.access.isPublic) return true;
  if (this.audit.uploadedBy.toString() === userId.toString()) return true;
  if (this.access.allowedRoles.includes(userRole)) return true;

  const userAccess = this.access.allowedUsers.find(
    (u) => u.userId.toString() === userId.toString()
  );

  return !!userAccess;
};

// ============================================
// MÉTODOS ESTÁTICOS
// ============================================

FileSchema.statics.isProtected = function (method) {
  const protectedMethods = [
    "get",
    "put",
    "delete",
    "createBatch",
    "updateBatch",
  ];
  return protectedMethods.includes(method);
};

// Buscar archivos por contrato
FileSchema.statics.findByContract = function (contractId, options = {}) {
  const { phase, documentType, status, currentVersionOnly = false } = options;

  let query = { contract: contractId, isActive: true };

  if (phase) query.phase = phase;
  if (documentType) query.documentType = documentType.toUpperCase();
  if (status) query.status = status.toUpperCase();
  if (currentVersionOnly) query["versionInfo.isCurrentVersion"] = true;

  return this.find(query).sort({ "audit.uploadDate": -1 });
};

// Buscar archivos por departamento
FileSchema.statics.findByDepartment = function (departmentId, options = {}) {
  const { module, documentType, status, currentVersionOnly = false } = options;

  let query = { department: departmentId, isActive: true };

  if (module) query.module = module.toUpperCase();
  if (documentType) query.documentType = documentType.toUpperCase();
  if (status) query.status = status.toUpperCase();
  if (currentVersionOnly) query["versionInfo.isCurrentVersion"] = true;

  return this.find(query).sort({ "audit.uploadDate": -1 });
};

// Buscar archivos por módulo
FileSchema.statics.findByModule = function (module, options = {}) {
  const { department, status, currentVersionOnly = false } = options;

  let query = { module: module.toUpperCase(), isActive: true };

  if (department) query.department = department;
  if (status) query.status = status.toUpperCase();
  if (currentVersionOnly) query["versionInfo.isCurrentVersion"] = true;

  return this.find(query).sort({ "audit.uploadDate": -1 });
};

// Buscar todas las versiones de un documento
FileSchema.statics.findAllVersions = function (rootDocumentId) {
  return this.find({
    $or: [
      { _id: rootDocumentId },
      { "versionInfo.rootDocument": rootDocumentId },
    ],
    isActive: true,
  }).sort({ "versionInfo.version": 1 });
};

// Buscar documentos pendientes de sincronización
FileSchema.statics.findPendingSync = function () {
  return this.findActive({
    "storage.storageProvider": "RSYNC",
    "rsyncInfo.syncStatus": "PENDING",
  }).sort({ "rsyncInfo.priority": -1, createdAt: 1 });
};

// Buscar documentos con sincronización fallida
FileSchema.statics.findFailedSync = function () {
  return this.findActive({
    "storage.storageProvider": "RSYNC",
    "rsyncInfo.syncStatus": "FAILED",
    "rsyncInfo.syncRetries": { $lt: 3 },
  });
};

// Buscar documentos sincronizados
FileSchema.statics.findSyncedFiles = function () {
  return this.findActive({
    "storage.storageProvider": "RSYNC",
    "rsyncInfo.syncStatus": "SYNCED",
  });
};

// Obtener estadísticas de rsync
FileSchema.statics.getRsyncStats = function () {
  return this.aggregate([
    { $match: { "storage.storageProvider": "RSYNC", isActive: true } },
    {
      $group: {
        _id: "$rsyncInfo.syncStatus",
        count: { $sum: 1 },
        totalSize: { $sum: "$fileInfo.size" },
        avgRetries: { $avg: "$rsyncInfo.syncRetries" },
      },
    },
  ]);
};

// Procesar cola de sincronización
FileSchema.statics.processRsyncQueue = async function (batchSize = 10) {
  const pendingFiles = await this.findPendingSync().limit(batchSize);
  const results = [];

  for (const file of pendingFiles) {
    try {
      await file.syncToRsync();
      results.push({ file: file._id, success: true });
    } catch (error) {
      results.push({ file: file._id, success: false, error: error.message });
    }
  }

  return results;
};

// ============================================
// VIRTUALES
// ============================================

FileSchema.virtual("displaySize").get(function () {
  return this.getFileSize() + " MB";
});

FileSchema.virtual("extension").get(function () {
  return this.getFileExtension();
});

FileSchema.virtual("downloadUrl").get(function () {
  return this.getAccessUrl();
});

FileSchema.virtual("syncStatusDisplay").get(function () {
  if (this.storage.storageProvider !== "RSYNC") return null;

  const statusMap = {
    PENDING: "Pendiente de sincronización",
    SYNCING: "Sincronizando...",
    SYNCED: "Sincronizado",
    FAILED: "Error en sincronización",
    PARTIAL: "Sincronización parcial",
  };

  return statusMap[this.rsyncInfo?.syncStatus] || "Estado desconocido";
});

FileSchema.virtual("isRemoteAvailable").get(function () {
  return (
    this.storage.storageProvider === "RSYNC" &&
    this.rsyncInfo?.syncStatus === "SYNCED"
  );
});

// ============================================
// ÍNDICES
// ============================================

FileSchema.index({ systemName: 1 }, { unique: true });
FileSchema.index({ contract: 1, phase: 1 });
FileSchema.index({ department: 1, module: 1 });
FileSchema.index({ "storage.storageProvider": 1 });
FileSchema.index({ "rsyncInfo.syncStatus": 1 });
FileSchema.index({ "rsyncInfo.lastSyncSuccess": -1 });
FileSchema.index({ "rsyncInfo.priority": -1 });
FileSchema.index({ "rsyncInfo.autoSync": 1 });
FileSchema.index({ "versionInfo.rootDocument": 1 });
FileSchema.index({ "versionInfo.parentDocument": 1 });
FileSchema.index({ "versionInfo.isCurrentVersion": 1 });
FileSchema.index({ module: 1, status: 1 });

// Índices compuestos
FileSchema.index({
  "storage.storageProvider": 1,
  "rsyncInfo.syncStatus": 1,
  "rsyncInfo.priority": -1,
});

FileSchema.index({
  module: 1,
  department: 1,
  status: 1,
});

FileSchema.index({
  "versionInfo.rootDocument": 1,
  "versionInfo.version": 1,
});

// ============================================
// QUERY HELPERS
// ============================================

FileSchema.query.rsyncFiles = function () {
  return this.where({ "storage.storageProvider": "RSYNC" });
};

FileSchema.query.pendingSync = function () {
  return this.where({ "rsyncInfo.syncStatus": "PENDING" });
};

FileSchema.query.synced = function () {
  return this.where({ "rsyncInfo.syncStatus": "SYNCED" });
};

FileSchema.query.syncFailed = function () {
  return this.where({ "rsyncInfo.syncStatus": "FAILED" });
};

FileSchema.query.highPriority = function () {
  return this.where({ "rsyncInfo.priority": { $in: ["HIGH", "URGENT"] } });
};

FileSchema.query.currentVersions = function () {
  return this.where({ "versionInfo.isCurrentVersion": true });
};

FileSchema.query.byModule = function (module) {
  return this.where({ module: module.toUpperCase() });
};

FileSchema.query.byDepartment = function (departmentId) {
  return this.where({ department: departmentId });
};

// ============================================
// PLUGINS
// ============================================

FileSchema.plugin(mongoosePaginate);

// ============================================
// EXPORTAR MODELO
// ============================================

export const File = mongoose.model("File", FileSchema);
