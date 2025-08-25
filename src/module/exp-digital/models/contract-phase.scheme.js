// models/ContractPhase.js
const contractPhaseSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      // Código único de la fase (PREP, PREC, EXEC, etc.)
    },
    name: {
      type: String,
      required: true,
      // Nombre de la fase de contratación
    },
    description: String, // Descripción de la fase
    order: {
      type: Number,
      required: true,
      // Orden secuencial de la fase
    },
    requiredDocuments: [
      {
        code: {
          type: String,
          required: true,
          uppercase: true,
          // Código del documento requerido
        },
        name: {
          type: String,
          required: true,
          // Nombre del documento
        },
        description: String, // Descripción del documento
        isMandatory: {
          type: Boolean,
          default: true,
          // Si el documento es obligatorio
        },
        allowedFileTypes: [String], // Tipos de archivo permitidos ['pdf', 'doc', 'docx', 'xls', 'xlsx']
        applicableTypes: [String], // Códigos de tipos de contratación donde aplica este documento
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
      // Estado activo de la fase
    },
  },
  {
    timestamps: true,
  }
);

// Índices
contractPhaseSchema.index({ code: 1 });
contractPhaseSchema.index({ order: 1 });
contractPhaseSchema.index({ isActive: 1 });

module.exports = mongoose.model("ContractPhase", contractPhaseSchema);
