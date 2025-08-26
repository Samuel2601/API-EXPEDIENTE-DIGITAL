"use strict";

import mongoose from "mongoose";
const { Schema } = mongoose;

const userSchema = new Schema(
  {
    name: { type: String, required: true, description: "Name User Module" },
    last_name: {
      type: String,
      // required: true
      description: "LastName User Module",
    },
    dni: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true, // Garantiza unicidad
      sparse: true, // Permite valores null
      description: "Identification User Module",
    },
    telf: {
      type: String, //required: true
      description: "Telf User Module",
    },
    email: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      lowercase: true,
      index: { unique: true },
      description: "Email User Module",
    },
    password: {
      type: String,
      //required: true,
      description: "Password no require for User Module [Facebook, Google]",
    },
    verificado: { type: Boolean, default: false },
    status: { type: Boolean, default: true, require: true },
    role: { type: Schema.Types.ObjectId, ref: "role", required: true },
    googleId: {
      type: String,
      default: null,
    },
    facebookId: {
      type: String,
      default: null,
    },
    photo: {
      type: String,
      default: null,
    },
    verificationCode: {
      type: String,
    },
    createdAt: { type: Date, default: Date.now, require: true },
    password_temp: { type: String },
  },
  {
    timestamps: true,
  }
);
// Middleware para convertir a minúsculas antes de guardar
userSchema.pre("save", function (next) {
  this.name = this.name.toUpperCase();
  this.last_name = this.last_name.toUpperCase();
  next();
});
// Metodo isProtected para determinar si un método es protegido
userSchema.statics.isProtected = function (method) {
  const protectedMethods = [
    "get",
    "put",
    "delete",
    "createBatch",
    "updateBatch",
  ]; // método 'post' libre
  return protectedMethods.includes(method);
};

// Definir el esquema de role
const roleuserSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
    },
    permisos: [{ type: Schema.Types.ObjectId, ref: "permission" }],
    orden: { type: Number, unique: true },
  },
  {
    timestamps: true,
  }
);
roleuserSchema.statics.isProtected = function (method) {
  const protectedMethods = [
    "get",
    "post",
    "put",
    "delete",
    "createBatch",
    "updateBatch",
  ]; // método 'post' libre
  return protectedMethods.includes(method);
};

// Definir el esquema de permiso
const permissionSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
    },
    method: {
      type: String,
      required: true,
    },
    user: [{ type: Schema.Types.ObjectId, ref: "user" }],
  },
  {
    timestamps: true,
  }
);

// Middleware para convertir a minúsculas antes de guardar
permissionSchema.pre("save", function (next) {
  this.name = this.name.toLowerCase();
  this.method = this.method.toLowerCase();
  next();
});

// Índice compuesto para asegurar que la combinación de name y method sea única
permissionSchema.index({ name: 1, method: 1 }, { unique: true });

permissionSchema.statics.isProtected = function (method) {
  const protectedMethods = [
    "get",
    "post",
    "put",
    "delete",
    "createBatch",
    "updateBatch",
    "post",
  ]; // método 'post' libre
  return protectedMethods.includes(method);
};

export const ModelMongoose = {
  // modelsos de usuarios y roles
  User: mongoose.model("user", userSchema),
  Role: mongoose.model("role", roleuserSchema),
  Permiso: mongoose.model("permission", permissionSchema),
};
export const SchemamodelsOld = {
  userSchema,
  roleuserSchema,
  permissionSchema,
};
