// models/ContractHistory.js
const contractHistorySchema = new mongoose.Schema(
  {
    contract: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contract",
      required: true,
      // Referencia al contrato
    },

    // Información del evento/cambio
    eventType: {
      type: String,
      enum: [
        "CREATION", // CREACION
        "PHASE_CHANGE", // CAMBIO_FASE
        "STATUS_CHANGE", // CAMBIO_ESTADO
        "DOCUMENT_UPLOAD", // SUBIDA_DOCUMENTO
        "DATA_MODIFICATION", // MODIFICACION_DATOS
        "AWARD", // ADJUDICACION
        "CONTRACT_SIGNING", // FIRMA_CONTRATO
        "PAYMENT_MADE", // PAGO_REALIZADO
        "OBSERVATION_ADDED", // OBSERVACION_AGREGADA
      ],
      required: true,
      // Tipo de evento registrado
    },

    description: {
      type: String,
      required: true,
      // Descripción del cambio realizado
    },

    // Detalles del cambio
    previousStatus: String, // Estado anterior
    newStatus: String, // Estado nuevo
    previousPhase: String, // Fase anterior
    newPhase: String, // Fase nueva

    // Valores modificados (para auditoría completa)
    changesData: mongoose.Schema.Types.Mixed, // Datos de los cambios realizados

    // Usuario responsable del cambio
    user: {
      type: String,
      required: true,
      // Usuario que realizó el cambio
    },

    eventDate: {
      type: Date,
      default: Date.now,
      // Fecha y hora del evento
    },

    // Información adicional de auditoría
    ipAddress: String, // Dirección IP del usuario
    userAgent: String, // User Agent del navegador
  },
  {
    timestamps: true,
  }
);

// Índices para auditoría y consultas
contractHistorySchema.index({ contract: 1, eventDate: -1 });
contractHistorySchema.index({ eventType: 1 });
contractHistorySchema.index({ user: 1 });
contractHistorySchema.index({ eventDate: -1 });

module.exports = mongoose.model("ContractHistory", contractHistorySchema);
