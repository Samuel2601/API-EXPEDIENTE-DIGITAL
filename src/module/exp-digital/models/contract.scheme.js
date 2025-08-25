// models/Contract.js
const contractSchema = new mongoose.Schema(
  {
    contractNumber: {
      type: String,
      required: true,
      unique: true,
      // Número único de contratación interno
    },
    sercopCode: String, // Código en el sistema SERCOP

    // Información básica del contrato
    contractType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ContractType",
      required: true,
      // Tipo de contratación
    },
    requestingDepartment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      required: true,
      // Dirección solicitante
    },

    // Detalles del objeto contractual
    contractualObject: {
      type: String,
      required: true,
      // Objeto de la contratación
    },
    detailedDescription: String, // Descripción detallada
    cpcClassifier: String, // Clasificador CPC

    // Información presupuestaria
    estimatedValue: {
      type: Number,
      required: true,
      // Valor estimado del contrato
    },
    awardedValue: Number, // Valor adjudicado
    paidValue: {
      type: Number,
      default: 0,
      // Valor pagado acumulado
    },
    currency: {
      type: String,
      default: "USD",
      // Moneda del contrato
    },

    // Fechas importantes del proceso
    startDate: Date, // Fecha de inicio del proceso
    questionsDeadline: Date, // Fecha límite para preguntas
    openingDate: Date, // Fecha de apertura de ofertas
    awardDate: Date, // Fecha de adjudicación
    contractSigningDate: Date, // Fecha de firma del contrato
    executionStartDate: Date, // Fecha de inicio de ejecución
    executionEndDate: Date, // Fecha de fin de ejecución
    executionPeriod: Number, // Plazo de ejecución en días

    // Información del contratista
    contractor: {
      ruc: String, // RUC del contratista
      businessName: String, // Razón social
      legalRepresentative: String, // Representante legal
      email: String, // Email de contacto
      phone: String, // Teléfono
      address: String, // Dirección
    },

    // Estado y control de fases
    generalStatus: {
      type: String,
      enum: [
        "PREPARATION", // PREPARACION
        "CALL", // CONVOCATORIA
        "EVALUATION", // EVALUACION
        "AWARD", // ADJUDICACION
        "CONTRACTING", // CONTRATACION
        "EXECUTION", // EJECUCION
        "RECEPTION", // RECEPCION
        "LIQUIDATED", // LIQUIDADO
        "FINISHED", // TERMINADO
        "DESERTED", // DESIERTO
        "CANCELLED", // CANCELADO
      ],
      default: "PREPARATION",
      // Estado general del proceso
    },

    currentPhase: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ContractPhase",
      // Fase actual del proceso
    },

    // Control de fases del proceso
    phases: [
      {
        phase: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "ContractPhase",
          // Referencia a la fase
        },
        status: {
          type: String,
          enum: ["PENDING", "IN_PROGRESS", "COMPLETED", "NOT_APPLICABLE"],
          default: "PENDING",
          // Estado de la fase: PENDIENTE, EN_PROCESO, COMPLETADA, NO_APLICA
        },
        startDate: Date, // Fecha de inicio de la fase
        completionDate: Date, // Fecha de finalización de la fase
        observations: String, // Observaciones de la fase
        responsible: {
          name: String, // Nombre del responsable
          email: String, // Email del responsable
        },
      },
    ],

    // Metadatos de auditoría
    createdBy: {
      type: String,
      required: true,
      // Usuario que creó el registro
    },
    lastModification: {
      date: {
        type: Date,
        default: Date.now,
        // Fecha de última modificación
      },
      user: String, // Usuario de última modificación
    },

    observations: String, // Observaciones generales

    isActive: {
      type: Boolean,
      default: true,
      // Estado activo del contrato
    },
  },
  {
    timestamps: true,
  }
);

// Índices para optimizar consultas
contractSchema.index({ contractNumber: 1 });
contractSchema.index({ sercopCode: 1 });
contractSchema.index({ contractType: 1 });
contractSchema.index({ requestingDepartment: 1 });
contractSchema.index({ generalStatus: 1 });
contractSchema.index({ startDate: -1 });
contractSchema.index({ estimatedValue: -1 });
contractSchema.index({ "contractor.ruc": 1 });
contractSchema.index({
  "contractor.businessName": "text",
  contractualObject: "text",
}); // Índice de texto para búsqueda
contractSchema.index({ isActive: 1 });

module.exports = mongoose.model("Contract", contractSchema);
