// models/File.js
const fileSchema = new mongoose.Schema(
  {
    contract: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contract",
      required: true,
      // Referencia al contrato
    },
    phase: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ContractPhase",
      required: true,
      // Referencia a la fase
    },
    documentType: {
      type: String,
      required: true,
      // Tipo de documento (código del documento requerido)
    },

    // Información del archivo
    originalName: {
      type: String,
      required: true,
      // Nombre original del archivo
    },
    systemName: {
      type: String,
      required: true,
      unique: true,
      // Nombre generado por el sistema
    },
    path: {
      type: String,
      required: true,
      // Ruta de almacenamiento del archivo
    },
    fileType: String, // Extensión del archivo (pdf, doc, xlsx, etc.)
    size: Number, // Tamaño en bytes
    hash: String, // Hash para verificación de integridad

    // Metadatos del documento
    description: String, // Descripción del documento
    version: {
      type: Number,
      default: 1,
      // Versión del documento
    },
    isCurrentVersion: {
      type: Boolean,
      default: true,
      // Si es la versión actual del documento
    },

    // Control de acceso
    isPublic: {
      type: Boolean,
      default: false,
      // Si el documento es público
    },

    // Auditoría del archivo
    uploadedBy: {
      type: String,
      required: true,
      // Usuario que subió el archivo
    },
    uploadDate: {
      type: Date,
      default: Date.now,
      // Fecha de subida
    },

    // Estado del documento
    status: {
      type: String,
      enum: ["DRAFT", "REVIEW", "APPROVED", "REJECTED", "OBSOLETE"],
      default: "DRAFT",
      // Estado: BORRADOR, REVISION, APROBADO, RECHAZADO, OBSOLETO
    },

    observations: String, // Observaciones sobre el documento

    isActive: {
      type: Boolean,
      default: true,
      // Estado activo del archivo
    },
  },
  {
    timestamps: true,
  }
);

// Índices para optimización
fileSchema.index({ contract: 1, phase: 1 });
fileSchema.index({ contract: 1, documentType: 1 });
fileSchema.index({ systemName: 1 });
fileSchema.index({ uploadDate: -1 });
fileSchema.index({ isCurrentVersion: 1 });
fileSchema.index({ status: 1 });
fileSchema.index({ isActive: 1 });

module.exports = mongoose.model("File", fileSchema);
