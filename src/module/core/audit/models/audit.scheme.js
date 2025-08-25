"use strict";

import mongoose from "mongoose";
import { stripMetaFields } from "../../../utils/MetaField.js";
import mongoosePaginate from "mongoose-paginate-v2";

const { Schema } = mongoose;

const ChangeJSON = {
  field: {
    type: String,
    required: true,
    meta: {
      validation: { isString: true, required: true, notEmpty: true },
      messages: {
        required: "El campo es obligatorio",
        isString: "El campo debe ser un texto válido",
        notEmpty: "El campo no puede estar vacío",
      },
    },
  },
  oldValue: {
    type: Schema.Types.Mixed,
    meta: {
      validation: { optional: true },
      messages: {
        invalid: "El valor anterior debe ser válido",
      },
    },
  },
};

const UserDataJSON = {
  ip: {
    type: String,
    meta: {
      validation: { isString: true, optional: true },
      messages: {
        isString: "La IP debe ser un texto válido",
      },
    },
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: "user",
    meta: {
      validation: { isMongoId: true, optional: true },
      messages: {
        isMongoId: "El ID de usuario no es válido",
      },
    },
  },
  location: {
    lat: {
      type: Number,
      meta: {
        validation: { isNumeric: true, optional: true, min: -90, max: 90 },
        messages: {
          isNumeric: "La latitud debe ser un número válido",
          min: "La latitud debe ser mayor a -90",
          max: "La latitud debe ser menor a 90",
        },
      },
    },
    long: {
      type: Number,
      meta: {
        validation: { isNumeric: true, optional: true, min: -180, max: 180 },
        messages: {
          isNumeric: "La longitud debe ser un número válido",
          min: "La longitud debe ser mayor a -180",
          max: "La longitud debe ser menor a 180",
        },
      },
    },
  },
};

export const AuditJSON = {
  schema: {
    type: String,
    required: true,
    meta: {
      validation: { isString: true, required: true, notEmpty: true },
      messages: {
        required: "El esquema es obligatorio",
        isString: "El esquema debe ser un texto válido",
        notEmpty: "El esquema no puede estar vacío",
      },
    },
  },
  documentId: {
    type: Schema.Types.ObjectId,
    required: true,
    meta: {
      validation: { isMongoId: true, required: true },
      messages: {
        required: "El ID del documento es obligatorio",
        isMongoId: "El ID del documento no es válido",
      },
    },
  },
  method: {
    type: String,
    required: true,
    meta: {
      validation: { isString: true, required: true, notEmpty: true },
      messages: {
        required: "El método es obligatorio",
        isString: "El método debe ser un texto válido",
        notEmpty: "El método no puede estar vacío",
      },
    },
  },
  changes: {
    type: [ChangeJSON],
    default: [],
    meta: {
      validation: { isArray: true, optional: true },
      messages: {
        isArray: "Los cambios deben ser una lista válida",
      },
    },
  },
  userData: {
    type: UserDataJSON,
    meta: {
      validation: { optional: true },
      messages: {
        invalid: "Los datos de usuario deben ser válidos",
      },
    },
  },
};

const AuditSchema = new Schema(stripMetaFields(AuditJSON), {
  timestamps: true,
  collection: "audits",
});

// === MÉTODOS DE INSTANCIA ===

AuditSchema.methods.toJSON = function () {
  const obj = this.toObject();
  return stripMetaFields(obj);
};

// === MÉTODOS ESTÁTICOS ===

AuditSchema.statics.isProtected = function (method) {
  const protectedMethods = [
    "get",
    "put",
    "delete",
    "createBatch",
    "updateBatch",
  ];
  return protectedMethods.includes(method);
};

AuditSchema.statics.findByDocument = function (schema, documentId) {
  return this.find({ schema, documentId }).sort({ createdAt: -1 });
};

AuditSchema.statics.findByUser = function (userId) {
  return this.find({ "userData.userId": userId }).sort({ createdAt: -1 });
};

// === ÍNDICES ===
AuditSchema.index({ schema: 1, documentId: 1 });
AuditSchema.index({ "userData.userId": 1 });
AuditSchema.index({ createdAt: -1 });
//plugin de paginación
AuditSchema.plugin(mongoosePaginate);
export const Audit = mongoose.model("Audit", AuditSchema);
