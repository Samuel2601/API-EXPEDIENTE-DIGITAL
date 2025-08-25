// models/Department.js
const departmentSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      // Código único de la dirección/departamento
    },
    name: {
      type: String,
      required: true,
      // Nombre de la dirección/departamento
    },
    description: String, // Descripción de las funciones del departamento
    responsible: {
      name: String, // Nombre del responsable
      email: String, // Email del responsable
      phone: String, // Teléfono del responsable
    },
    isActive: {
      type: Boolean,
      default: true,
      // Estado activo del departamento
    },
  },
  {
    timestamps: true,
  }
);

// Índices
departmentSchema.index({ code: 1 });
departmentSchema.index({ isActive: 1 });

module.exports = mongoose.model("Department", departmentSchema);
