// models/ContractType.js
const mongoose = require("mongoose");

const contractTypeSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      // Código único del tipo de contratación (ej: SIE, LIC, COT)
    },
    name: {
      type: String,
      required: true,
      // Nombre del tipo de contratación
    },
    category: {
      type: String,
      enum: ["COMMON", "SPECIAL"], // COMUN, ESPECIAL
      required: true,
      // Categoría del procedimiento según LOSNCP
    },
    description: String, // Descripción del tipo de contratación
    minAmount: {
      goods: Number, // Monto mínimo para bienes
      services: Number, // Monto mínimo para servicios
      works: Number, // Monto mínimo para obras
    },
    maxAmount: {
      goods: Number, // Monto máximo para bienes
      services: Number, // Monto máximo para servicios
      works: Number, // Monto máximo para obras
    },
    isActive: {
      type: Boolean,
      default: true,
      // Estado activo del tipo de contratación
    },
  },
  {
    timestamps: true, // createdAt, updatedAt automáticos
  }
);

// Índices para optimización
contractTypeSchema.index({ code: 1 });
contractTypeSchema.index({ category: 1 });
contractTypeSchema.index({ isActive: 1 });

module.exports = mongoose.model("ContractType", contractTypeSchema);
