// =============================================================================
// src/middlewares/auth.js - Versión mejorada
// =============================================================================
"use strict";
import { validationResult } from "express-validator";
import pkg from "jwt-simple";
import moment from "moment";
import { ModelMongoose } from "../module/core/base/models/export.schema.js";
import { userContext } from "../../utils/user-context.js";
import * as fs from "fs";
import path from "path";

var secret = "labella";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ===== MIDDLEWARE DE CONTEXTO DE USUARIO MEJORADO =====

/**
 * Middleware para establecer contexto de usuario con AsyncLocalStorage
 * Este middleware debe ejecutarse DESPUÉS de auth() para tener req.user disponible
 */
export const mongooseContextMiddleware = (req, res, next) => {
  if (req.user) {
    console.log("Estableciendo contexto de usuario:", req.user);
    // Ejecutar el resto de la cadena de middlewares/controladores dentro del contexto
    userContext.run(req.user, () => {
      next();
    });
  } else {
    // Si no hay usuario, continuar sin contexto
    next();
  }
};

/**
 * Middleware para verificar acceso al módulo
 */
export const verifyModuleAccess = async (req, res, next) => {
  const modulePermissionName = "ModuleExpDigital";
  const modulePermissionMethod = "get";
  try {
    // Primero autenticar al usuario
    await auth(req, res, async () => {
      // Establecer contexto después de autenticación
      mongooseContextMiddleware(req, res, async () => {
        // Luego verificar permisos del módulo
        await permissUser(modulePermissionName, modulePermissionMethod)(
          req,
          res,
          next
        );
      });
    });
  } catch (error) {
    console.error("Error en verificación de módulo:", error);
    return res.status(403).json({ message: "Acceso denegado al módulo" });
  }
};

export const validationResultExpress = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

export const validateAuth = (ModelMongoose, method, path) => {
  return async (req, res, next) => {
    const isProtected = ModelMongoose.isProtected(method);

    if (isProtected) {
      // Primero autenticar al usuario
      await auth(req, res, async () => {
        // Establecer contexto después de autenticación
        mongooseContextMiddleware(req, res, async () => {
          // Después verificar permisos
          await permissUser(path, method)(req, res, next);
        });
      });
    } else {
      // Si no está protegido, pasar al siguiente middleware
      next();
    }
  };
};

export const authFile = (options = {}) => {
  return (req, res, next) => {
    console.log("Headers:", req.headers);
    console.log("Query params:", req.query);

    let token = "";

    // Si la ruta está configurada para aceptar token por query, buscarlo ahí primero
    if (options.allowQueryToken && req.query.token) {
      token = req.query.token.replace(/['"]+/g, "");
      console.log("Token obtenido de query parameters");
    }
    // Si no, buscar en headers como siempre
    else if (req.headers.authorization) {
      const token1 = req.headers.authorization.replace(/^Bearer\s/, "");
      token = token1.replace(/['"]+/g, "");
      console.log("Token obtenido de headers");
    }
    // Si no hay token
    else {
      console.log("No hay token disponible");
      return res.status(401).send({ message: "NoHeadersError" });
    }

    const segment = token.split(".");

    if (segment.length !== 3) {
      return res.status(402).send({ message: "InvalidToken" });
    }

    try {
      const payload = pkg.decode(token, secret);

      if (payload.exp <= moment().unix()) {
        return res.status(403).send({ message: "TokenExpirado" });
      }

      req.user = payload;
      req.user.userId = req.user.sub;

      return next();
    } catch (error) {
      console.error(error);
      return res.status(402).send({ message: "InvalidToken" });
    }
  };
};

export const auth = (req, res, next) => {
  if (!req.headers.authorization) {
    console.log("No hay token en la cabecera");
    return res.status(401).send({ message: "NoHeadersError" });
  }

  var token1 = req.headers.authorization.replace(/^Bearer\s/, "");
  var token = token1.replace(/['"]+/g, "");
  var segment = token.split(".");

  if (segment.length != 3) {
    return res.status(402).send({ message: "InvalidToken" });
  } else {
    try {
      var payload = pkg.decode(token, secret);

      if (payload.exp <= moment().unix()) {
        return res.status(403).send({ message: "TokenExpirado" });
      }

      req.user = payload;
      req.user.userId = req.user.sub;

      // ✅ IMPORTANTE: No llamar mongooseContextMiddleware aquí
      // El contexto debe establecerse en validateAuth o verifyModuleAccess
      return next();
    } catch (error) {
      console.error(error);
      return res.status(402).send({ message: "InvalidToken" });
    }
  }
};

// Función centralizada para verificar permisos
const checkPermission = async (path, method, user, rol) => {
  console.log("Verificando permisos para:", path, method, user, rol);

  const normalizedPath = path.toLowerCase();
  const normalizedMethod = method.toLowerCase();

  const permission = await ModelMongoose.Permiso.findOne({
    name: { $regex: new RegExp(`^${normalizedPath}$`, "i") },
    method: { $regex: new RegExp(`^${normalizedMethod}$`, "i") },
  });

  if (!permission) {
    console.log("Permiso no encontrado para:", path, method);
    return false;
  }

  if (permission.user.find((u) => u.toString() === user.toString())) {
    console.log("Permiso encontrado para este usuario:", path, method);
    return true;
  }

  const role = await ModelMongoose.Role.findOne({
    _id: rol,
  });

  if (
    role &&
    role.permisos.find((p) => p.toString() === permission._id.toString())
  ) {
    console.log("Permiso encontrado para este rol:", path, method);
    return true;
  }

  return false;
};

// Middleware para verificar permisos de usuario y rol
export const permissUser = (path, method) => async (req, res, next) => {
  if (!req.user) {
    return res.status(403).json({ message: "No tienes permisos para esto." });
  }

  try {
    const hasPermission = await checkPermission(
      path,
      method,
      req.user.userId,
      req.user.role
    );

    if (hasPermission) {
      next();
    } else {
      return res.status(403).json({ message: "No tienes permisos para esto." });
    }
  } catch (error) {
    console.error("Error verificando permisos:", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};
