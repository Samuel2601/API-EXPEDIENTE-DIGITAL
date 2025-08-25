// src/module/exp-digital/models/file.scheme.js
import mongoose from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";
import { setupBaseSchema, CommonValidators, stripMetaFields } from "../../../core/base/models/base.scheme.js";
import crypto from "crypto";
import path from "path";

const { Schema } = mongoose;

// Sub-esquema para metadatos de archivo
const FileMetadataJSON = {
  // Información técnica del archivo
  encoding: {
    type: String,
    trim: true,
    maxlength: 20,
    default: "utf-8"
  },
  
  dimensions: {
    width: {
      type: Number, 
      min: 0
    },
    height: {
      type: Number,
      min: 0
    }
  },
  
  // Para documentos PDF
  pageCount: {
    type: Number,
    min: 0
  },
  
  // Información de seguridad
  isPasswordProtected: {
    type: Boolean,
    default: false
  },
  
  hasSignatures: {
    type: Boolean,
    default: false
  },
  
  // Metadatos extraídos del archivo
  title: String,
  author: String,
  subject: String,
  keywords: [String],
  creator: String,
  producer: String,
  creationDate: Date,
  modificationDate: Date
};

// Sub-esquema para control de versiones
const VersionInfoJSON = {
  version: {
    type: Number,
    required: true,
    min: 1,
    default: 1
  },
  
  isCurrentVersion: {
    type: Boolean,
    default: true,
    index: true
  },
  
  previousVersion: {
    type: Schema.Types.ObjectId,
    ref: "File"
  },
  
  versionNotes: {
    type: String,
    trim: true,
    maxlength: 500
  },
  
  changeType: {
    type: String,
    enum: ["MINOR", "MAJOR", "CORRECTION", "REPLACEMENT"],
    default: "MINOR"
  }
};

export const FileJSON = {
  contract: {
    type: Schema.Types.ObjectId,
    ref: "Contract",
    required: true,
    index: true,
    meta: {
      validation: { isMongoId: true, required: true },
      messages: {
        required: "El contrato es obligatorio",
        isMongoId: "El ID del contrato no es válido"
      },
    },
  },
  
  phase: {
    type: Schema.Types.ObjectId,
    ref: "ContractPhase",
    required: true,
    index: true,
    meta: {
      validation: { isMongoId: true, required: true },
      messages: {
        required: "La fase es obligatoria",
        isMongoId: "El ID de la fase no es válido"
      },
    },
  },
  
  documentType: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
    maxlength: 50,
    index: true,
    meta: {
      validation: { isString: true, required: true, notEmpty: true, isLength: { min: 2, max: 50 } },
      messages: {
        required: "El tipo de documento es obligatorio",
        isString: "El tipo de documento debe ser un texto válido",
        notEmpty: "El tipo de documento no puede estar vacío",
        isLength: "El tipo de documento debe tener entre 2 y 50 caracteres"
      },
    },
  },
  
  // Información del archivo original
  originalName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 255,
    meta: {
      validation: { isString: true, required: true, notEmpty: true, isLength: { min: 1, max: 255 } },
      messages: {
        required: "El nombre original es obligatorio",
        isString: "El nombre original debe ser un texto válido",
        notEmpty: "El nombre original no puede estar vacío",
        isLength: "El nombre original no puede exceder 255 caracteres"
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
      validation: { isString: true, required: true, notEmpty: true, isLength: { min: 1, max: 100 } },
      messages: {
        required: "El nombre del sistema es obligatorio",
        isString: "El nombre del sistema debe ser un texto válido",
        notEmpty: "El nombre del sistema no puede estar vacío",
        isLength: "El nombre del sistema no puede exceder 100 caracteres"
      },
    },
  },
  
  // Rutas de almacenamiento
  storage: {
    path: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
      meta: {
        validation: { isString: true, required: true, notEmpty: true, isLength: { min: 1, max: 500 } },
        messages: {
          required: "La ruta de almacenamiento es obligatoria",
          isString: "La ruta debe ser un texto válido",
          notEmpty: "La ruta no puede estar vacía",
          isLength: "La ruta no puede exceder 500 caracteres"
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
          isLength: "La ruta relativa no puede exceder 300 caracteres"
        },
      },
    },
    
    storageProvider: {
      type: String,
      enum: ["LOCAL", "AWS_S3", "AZURE", "GOOGLE_CLOUD"],
      default: "LOCAL",
      uppercase: true
    },
    
    bucket: {
      type: String,
      trim: true,
      maxlength: 100
    },
    
    region: {
      type: String,
      trim: true,
      maxlength: 50
    }
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
        validator: function(v) {
          const allowedTypes = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'jpg', 'jpeg', 'png', 'gif', 'zip', 'rar', '7z', 'txt', 'csv'];
          return allowedTypes.includes(v);
        },
        message: 'Tipo de archivo no permitido'
      },
      meta: {
        validation: { isIn: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'jpg', 'jpeg', 'png', 'gif', 'zip', 'rar', '7z', 'txt', 'csv'], required: true },
        messages: {
          required: "El tipo de archivo es obligatorio",
          isIn: "El tipo de archivo no está permitido"
        },
      },
    },
    
    mimeType: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
      meta: {
        validation: { isString: true, required: true, notEmpty: true, isLength: { max: 100 } },
        messages: {
          required: "El tipo MIME es obligatorio",
          isString: "El tipo MIME debe ser un texto válido",
          notEmpty: "El tipo MIME no puede estar vacío",
          isLength: "El tipo MIME no puede exceder 100 caracteres"
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
          max: "El archivo no puede exceder 100MB"
        },
      },
    },
    
    hash: {
      type: String,
      required: true,
      trim: true,
      length: 64, // SHA-256
      validate: {
        validator: function(v) {
          return /^[a-f0-9]{64}$/i.test(v);
        },
        message: 'El hash debe ser un SHA-256 válido'
      },
      index: true,
      meta: {
        validation: { isString: true, required: true, isLength: { min: 64, max: 64 } },
        messages: {
          required: "El hash del archivo es obligatorio",
          isString: "El hash debe ser un texto válido",
          isLength: "El hash debe tener exactamente 64 caracteres"
        },
      },
    },
    
    checksum: {
      type: String,
      trim: true,
      maxlength: 64
    }
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
          isLength: "La descripción no puede exceder 1000 caracteres"
        },
      },
    },
    
    category: {
      type: String,
      enum: ["LEGAL", "TECHNICAL", "FINANCIAL", "ADMINISTRATIVE", "OTHER"],
      default: "ADMINISTRATIVE",
      uppercase: true
    },
    
    confidentialityLevel: {
      type: String,
      enum: ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"],
      default: "INTERNAL",
      uppercase: true
    },
    
    language: {
      type: String,
      default: "es",
      lowercase: true,
      maxlength: 5
    },
    
    keywords: {
      type: [String],
      default: [],
      validate: {
        validator: function(v) {
          return v.length <= 20;
        },
        message: 'No se pueden tener más de 20 palabras clave'
      }
    },
    
    expirationDate: {
      type: Date,
      meta: {
        validation: { isDate: true, optional: true },
        messages: {
          isDate: "La fecha de expiración debe ser válida"
        },
      },
    }
  },
  
  // Control de versiones
  versionInfo: {
    type: VersionInfoJSON,
    default: {},
    meta: {
      validation: { optional: true },
      messages: {
        invalid: "La información de versión debe ser válida"
      },
    },
  },
  
  // Metadatos del archivo
  metadata: {
    type: FileMetadataJSON,
    default: {},
    meta: {
      validation: { optional: true },
      messages: {
        invalid: "Los metadatos del archivo deben ser válidos"
      },
    },
  },
  
  // Control de acceso
  access: {
    isPublic: {
      type: Boolean,
      default: false,
      index: true,
      meta: {
        validation: { isBoolean: true, optional: true },
        messages: {
          isBoolean: "El acceso público debe ser verdadero o falso"
        },
      },
    },
    
    allowedRoles: {
      type: [String],
      default: [],
      validate: {
        validator: function(v) {
          return v.length <= 10;
        },
        message: 'No se pueden especificar más de 10 roles'
      }
    },
    
    allowedUsers: [{
      userId: {
        type: Schema.Types.ObjectId,
        ref: "User"
      },
      permissions: {
        type: [String],
        enum: ["READ", "DOWNLOAD", "COMMENT", "EDIT"],
        default: ["READ"]
      }
    }],
    
    downloadCount: {
      type: Number,
      default: 0,
      min: 0
    },
    
    viewCount: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  
  // Auditoría del archivo
  audit: {
    uploadedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      meta: {
        validation: { isMongoId: true, required: true },
        messages: {
          required: "El usuario que subió el archivo es obligatorio",
          isMongoId: "El ID del usuario no es válido"
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
          isDate: "La fecha de subida debe ser válida"
        },
      },
    },
    
    lastAccessDate: {
      type: Date,
      meta: {
        validation: { isDate: true, optional: true },
        messages: {
          isDate: "La fecha de último acceso debe ser válida"
        },
      },
    },
    
    lastModifiedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      meta: {
        validation: { isMongoId: true, optional: true },
        messages: {
          isMongoId: "El ID del último modificador no es válido"
        },
      },
    },
    
    ipAddress: {
      type: String,
      trim: true,
      maxlength: 45
    },
    
    userAgent: {
      type: String,
      trim: true,
      maxlength: 500
    }
  },
  
  // Estado del documento
  status: {
    type: String,
    enum: {
      values: ["DRAFT", "REVIEW", "APPROVED", "REJECTED", "OBSOLETE", "ARCHIVED"],
      message: "Estado no válido"
    },
    default: "DRAFT",
    uppercase: true,
    index: true,
    meta: {
      validation: { isIn: ["DRAFT", "REVIEW", "APPROVED", "REJECTED", "OBSOLETE", "ARCHIVED"], optional: true },
      messages: {
        isIn: "El estado debe ser uno de los valores válidos"
      },
    },
  },
  
  // Revisión y aprobación
  review: {
    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      meta: {
        validation: { isMongoId: true, optional: true },
        messages: {
          isMongoId: "El ID del revisor no es válido"
        },
      },
    },
    
    reviewDate: {
      type: Date,
      meta: {
        validation: { isDate: true, optional: true },
        messages: {
          isDate: "La fecha de revisión debe ser válida"
        },
      },
    },
    
    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      meta: {
        validation: { isMongoId: true, optional: true },
        messages: {
          isMongoId: "El ID del aprobador no es válido"
        },
      },
    },
    
    approvalDate: {
      type: Date,
      meta: {
        validation: { isDate: true, optional: true },
        messages: {
          isDate: "La fecha de aprobación debe ser válida"
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
          isLength: "Las observaciones no pueden exceder 2000 caracteres"
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
          isLength: "La razón de rechazo no puede exceder 1000 caracteres"
        },
      },
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

// Crear el esquema con campos base
const FileSchema = new Schema(stripMetaFields(FileJSON), {
  timestamps: true,
  collection: "files"
});

// Aplicar configuración base
setupBaseSchema(FileSchema, {
  addTimestamps: true,
  addIndexes: true,
  addVirtuals: true,
  addMethods: true,
  addStatics: true,
  addHelpers: true,
  addBaseFields: true,
});

// === MIDDLEWARES PERSONALIZADOS ===

// Pre-save: generar nombre del sistema y validaciones
FileSchema.pre('save', async function(next) {
  // Generar nombre del sistema si es nuevo
  if (this.isNew && !this.systemName) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const extension = path.extname(this.originalName);
    
    this.systemName = `${timestamp}_${random}${extension}`;
  }
  
  // Validar tamaño según tipo de archivo
  const maxSizes = {
    'pdf': 50 * 1024 * 1024,  // 50MB
    'doc': 25 * 1024 * 1024,  // 25MB
    'docx': 25 * 1024 * 1024, // 25MB
    'xls': 15 * 1024 * 1024,  // 15MB
    'xlsx': 15 * 1024 * 1024, // 15MB
    'jpg': 10 * 1024 * 1024,  // 10MB
    'jpeg': 10 * 1024 * 1024, // 10MB
    'png': 10 * 1024 * 1024,  // 10MB
    'zip': 100 * 1024 * 1024, // 100MB
    'rar': 100 * 1024 * 1024  // 100MB
  };
  
  const maxSize = maxSizes[this.fileInfo.fileType] || 10 * 1024 * 1024; // 10MB por defecto
  
  if (this.fileInfo.size > maxSize) {
    return next(new Error(`El archivo ${this.fileInfo.fileType} no puede exceder ${Math.round(maxSize / (1024 * 1024))}MB`));
  }
  
  // Validar que el hash sea único para evitar duplicados
  if (this.isModified('fileInfo.hash')) {
    const existingFile = await this.constructor.findOne({
      _id: { $ne: this._id },
      'fileInfo.hash': this.fileInfo.hash,
      isActive: true
    });
    
    if (existingFile) {
      console.warn(`Archivo duplicado detectado: ${this.originalName} (hash: ${this.fileInfo.hash})`);
      // No error, pero log para auditoría
    }
  }
  
  // Actualizar fecha de último acceso si es nuevo
  if (this.isNew) {
    this.audit.lastAccessDate = new Date();
  }
  
  next();
});

// Pre-save: manejar versionado
FileSchema.pre('save', async function(next) {
  if (this.versionInfo.version > 1 && this.versionInfo.isCurrentVersion) {
    // Si esta es una nueva versión actual, marcar la anterior como no actual
    await this.constructor.updateMany({
      contract: this.contract,
      phase: this.phase,
      documentType: this.documentType,
      'versionInfo.isCurrentVersion': true,
      _id: { $ne: this._id }
    }, {
      $set: { 'versionInfo.isCurrentVersion': false }
    });
  }
  
  next();
});

// === MÉTODOS DE INSTANCIA ===

FileSchema.methods.toJSON = function() {
  const obj = this.toObject();
  return stripMetaFields(obj);
};

FileSchema.methods.getFileExtension = function() {
  return path.extname(this.originalName).toLowerCase().substring(1);
};

FileSchema.methods.getFileSize = function(unit = 'MB') {
  const units = {
    'B': 1,
    'KB': 1024,
    'MB': 1024 * 1024,
    'GB': 1024 * 1024 * 1024
  };
  
  const size = this.fileInfo.size / (units[unit] || units.MB);
  return Math.round(size * 100) / 100;
};

FileSchema.methods.isImage = function() {
  const imageTypes = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'];
  return imageTypes.includes(this.fileInfo.fileType);
};

FileSchema.methods.isDocument = function() {
  const docTypes = ['pdf', 'doc', 'docx', 'txt', 'rtf'];
  return docTypes.includes(this.fileInfo.fileType);
};

FileSchema.methods.isSpreadsheet = function() {
  const spreadsheetTypes = ['xls', 'xlsx', 'csv'];
  return spreadsheetTypes.includes(this.fileInfo.fileType);
};

FileSchema.methods.isArchive = function() {
  const archiveTypes = ['zip', 'rar', '7z', 'tar', 'gz'];
  return archiveTypes.includes(this.fileInfo.fileType);
};

FileSchema.methods.canUserAccess = function(userId, userRole) {
  // Verificar si es público
  if (this.access.isPublic) return true;
  
  // Verificar si el usuario es el que subió el archivo
  if (this.audit.uploadedBy.toString() === userId.toString()) return true;
  
  // Verificar roles permitidos
  if (this.access.allowedRoles.includes(userRole)) return true;
  
  // Verificar usuarios específicos
  const userAccess = this.access.allowedUsers.find(u => 
    u.userId.toString() === userId.toString()
  );
  
  return !!userAccess;
};

FileSchema.methods.hasPermission = function(userId, permission) {
  const userAccess = this.access.allowedUsers.find(u => 
    u.userId.toString() === userId.toString()
  );
  
  return userAccess && userAccess.permissions.includes(permission);
};

FileSchema.methods.incrementDownloadCount = function() {
  this.access.downloadCount += 1;
  this.audit.lastAccessDate = new Date();
  return this.save();
};

FileSchema.methods.incrementViewCount = function() {
  this.access.viewCount += 1;
  this.audit.lastAccessDate = new Date();
  return this.save();
};

FileSchema.methods.approve = function(approvedBy, observations = '') {
  this.status = 'APPROVED';
  this.review.approvedBy = approvedBy;
  this.review.approvalDate = new Date();
  if (observations) this.review.observations = observations;
  
  return this.save();
};

FileSchema.methods.reject = function(rejectedBy, reason) {
  this.status = 'REJECTED';
  this.review.reviewedBy = rejectedBy;
  this.review.reviewDate = new Date();
  this.review.rejectionReason = reason;
  
  return this.save();
};

FileSchema.methods.isExpired = function() {
  if (!this.document.expirationDate) return false;
  return new Date() > this.document.expirationDate;
};

// === MÉTODOS ESTÁTICOS ===

FileSchema.statics.isProtected = function(method) {
  const protectedMethods = ["get", "put", "delete", "createBatch", "updateBatch"];
  return protectedMethods.includes(method);
};

FileSchema.statics.findByContract = function(contractId, options = {}) {
  const { phase, documentType, status, currentVersionOnly = false } = options;
  
  let query = { contract: contractId, isActive: true };
  
  if (phase) query.phase = phase;
  if (documentType) query.documentType = documentType.toUpperCase();
  if (status) query.status = status.toUpperCase();
  if (currentVersionOnly) query['versionInfo.isCurrentVersion'] = true;
  
  return this.find(query).sort({ 'audit.uploadDate': -1 });
};

FileSchema.statics.findByPhase = function(phaseId) {
  return this.findActive({ phase: phaseId })
    .sort({ documentType: 1, 'versionInfo.version': -1 });
};

FileSchema.statics.findByDocumentType = function(documentType, contractId) {
  const query = { documentType: documentType.toUpperCase() };
  if (contractId) query.contract = contractId;
  
  return this.findActive(query).sort({ 'versionInfo.version': -1 });
};

FileSchema.statics.findCurrentVersions = function(contractId) {
  return this.findActive({
    contract: contractId,
    'versionInfo.isCurrentVersion': true
  });
};

FileSchema.statics.findByHash = function(hash) {
  return this.findActive({ 'fileInfo.hash': hash });
};

FileSchema.statics.findDuplicates = function() {
  return this.aggregate([
    { $match: { isActive: true } },
    {
      $group: {
        _id: '$fileInfo.hash',
        count: { $sum: 1 },
        files: { $push: { _id: '$_id', originalName: '$originalName', size: '$fileInfo.size' } }
      }
    },
    { $match: { count: { $gt: 1 } } },
    { $sort: { count: -1 } }
  ]);
};

FileSchema.statics.findPendingReview = function() {
  return this.findActive({ status: 'REVIEW' })
    .sort({ 'audit.uploadDate': 1 });
};

FileSchema.statics.findExpired = function() {
  const now = new Date();
  return this.findActive({
    'document.expirationDate': { $lt: now }
  });
};

FileSchema.statics.getStorageStats = function() {
  return this.aggregate([
    { $match: { isActive: true } },
    {
      $group: {
        _id: null,
        totalFiles: { $sum: 1 },
        totalSize: { $sum: '$fileInfo.size' },
        avgSize: { $avg: '$fileInfo.size' },
        fileTypes: { $addToSet: '$fileInfo.fileType' }
      }
    }
  ]);
};

FileSchema.statics.getStatsByFileType = function() {
  return this.aggregate([
    { $match: { isActive: true } },
    {
      $group: {
        _id: '$fileInfo.fileType',
        count: { $sum: 1 },
        totalSize: { $sum: '$fileInfo.size' },
        avgSize: { $avg: '$fileInfo.size' }
      }
    },
    { $sort: { count: -1 } }
  ]);
};

FileSchema.statics.cleanupOldVersions = function(keepVersions = 5) {
  return this.aggregate([
    { $match: { isActive: true } },
    {
      $group: {
        _id: { contract: '$contract', phase: '$phase', documentType: '$documentType' },
        files: { 
          $push: { 
            _id: '$_id', 
            version: '$versionInfo.version',
            isCurrentVersion: '$versionInfo.isCurrentVersion'
          }
        }
      }
    },
    {
      $project: {
        filesToDelete: {
          $slice: [
            {
              $filter: {
                input: { $sortArray: { input: '$files', sortBy: { version: -1 } } },
                cond: { $eq: ['$$this.isCurrentVersion', false] }
              }
            },
            keepVersions,
            1000
          ]
        }
      }
    }
  ]);
};

// === VIRTUALES ===

FileSchema.virtual('displaySize').get(function() {
  return this.getFileSize() + ' MB';
});

FileSchema.virtual('extension').get(function() {
  return this.getFileExtension();
});

FileSchema.virtual('downloadUrl').get(function() {
  return `/api/files/${this._id}/download`;
});

FileSchema.virtual('previewUrl').get(function() {
  if (this.isImage() || this.fileInfo.fileType === 'pdf') {
    return `/api/files/${this._id}/preview`;
  }
  return null;
});

FileSchema.virtual('isExpiredDoc').get(function() {
  return this.isExpired();
});

// === QUERY HELPERS ===

FileSchema.query.byContract = function(contractId) {
  return this.where({ contract: contractId });
};

FileSchema.query.byPhase = function(phaseId) {
  return this.where({ phase: phaseId });
};

FileSchema.query.byDocumentType = function(documentType) {
  return this.where({ documentType: documentType.toUpperCase() });
};

FileSchema.query.currentVersions = function() {
  return this.where({ 'versionInfo.isCurrentVersion': true });
};

FileSchema.query.byStatus = function(status) {
  return this.where({ status: status.toUpperCase() });
};

FileSchema.query.images = function() {
  return this.where({ 'fileInfo.fileType': { $in: ['jpg', 'jpeg', 'png', 'gif'] } });
};

FileSchema.query.documents = function() {
  return this.where({ 'fileInfo.fileType': { $in: ['pdf', 'doc', 'docx'] } });
};

FileSchema.query.public = function() {
  return this.where({ 'access.isPublic': true });
};

FileSchema.query.expired = function() {
  const now = new Date();
  return this.where({ 'document.expirationDate': { $lt: now } });
};

// === ÍNDICES ADICIONALES ===

FileSchema.index({ systemName: 1 }, { unique: true });
FileSchema.index({ contract: 1, phase: 1 });
FileSchema.index({ contract: 1, documentType: 1 });
FileSchema.index({ 'fileInfo.hash': 1 });
FileSchema.index({ 'versionInfo.isCurrentVersion': 1 });
FileSchema.index({ status: 1, 'audit.uploadDate': -1 });
FileSchema.index({ 'audit.uploadedBy': 1 });
FileSchema.index({ 'access.isPublic': 1 });
FileSchema.index({ 'document.expirationDate': 1 });

// Índices compuestos
FileSchema.index({ 
  contract: 1, 
  phase: 1, 
  documentType: 1, 
  'versionInfo.isCurrentVersion': 1 
});

FileSchema.index({ 
  'fileInfo.fileType': 1, 
  status: 1, 
  'audit.uploadDate': -1 
});

// Índice de texto para búsqueda
FileSchema.index({ 
  originalName: "text", 
  'document.description': "text",
  'document.keywords': "text",
  'review.observations': "text"
});

// === HOOKS Y PLUGINS ===

// Plugin de paginación
FileSchema.plugin(mongoosePaginate);

export const File = mongoose.model("File", FileSchema);