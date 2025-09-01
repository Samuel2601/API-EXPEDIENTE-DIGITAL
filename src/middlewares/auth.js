"use strict";
import { validationResult } from "express-validator";
import pkg from "jwt-simple";
import moment from "moment";
import { ModelMongoose } from "../module/core/base/models/export.schema.js";
import * as fs from "fs";
import path from "path";

var secret = "labella";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ===== MIDDLEWARE DE VERIFICACIÓN DE MÓDULO =====

/**
 * Middleware para verificar acceso al módulo
 */
export const verifyModuleAccess = async (req, res, next) => {
  const modulePermissionName = "ModuleExpDigital";
  const modulePermissionMethod = "get";
  try {
    // Primero autenticar al usuario
    await auth(req, res, async () => {
      // Luego verificar permisos del módulo
      await permissUser(modulePermissionName, modulePermissionMethod)(
        req,
        res,
        next
      );
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
        // Después de autenticar, verificar permisos
        await permissUser(path, method)(req, res, next);
      });
    } else {
      // Si no está protegido, pasar al siguiente middleware
      next();
    }
  };
};

export const auth = (req, res, next) => {
  //console.log("Autorizando...", req.headers.authorization);
  if (!req.headers.authorization) {
    return res.status(401).send({ message: "NoHeadersError" });
  }

  var token1 = req.headers.authorization.replace(/^Bearer\s/, ""); // Esto elimina 'Bearer ' al principio
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
      //console.log("Usuario autenticado:", req.user);

      // ✅ CORREGIDO: Solo llamar next() aquí, no al final
      return next();
    } catch (error) {
      console.error(error);
      return res.status(402).send({ message: "InvalidToken" });
    }
  }
  // ✅ REMOVIDO: Este next() duplicado causaba la ejecución doble
  // next();
};

// Función centralizada para verificar permisos
const checkPermission = async (path, method, user, rol) => {
  console.log("Verificando permisos para:", path, method, user, rol);

  // Normalizar path y method para hacer la búsqueda insensible a mayúsculas/minúsculas
  const normalizedPath = path.toLowerCase();
  const normalizedMethod = method.toLowerCase();

  // Check permission based on user
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

  // Check permission based on role
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
      req.user.sub,
      req.user.role
    );

    if (!hasPermission) {
      console.log("Permiso no encontrado para:", path, method);
      return res.status(403).json({ message: "Sin Permisos" }); // Cambiado a 403 que es más apropiado
    }

    return next();
  } catch (error) {
    console.error("Error en verificación de permisos:", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const createToken = async function (user, time, tipo, externo) {
  const validTimeUnits = [
    "year",
    "years",
    "y",
    "month",
    "months",
    "M",
    "week",
    "weeks",
    "w",
    "day",
    "days",
    "d",
    "hour",
    "hours",
    "h",
    "minute",
    "minutes",
    "m",
    "second",
    "seconds",
    "s",
    "millisecond",
    "milliseconds",
    "ms",
  ];
  console.log("USUARIO:", user, "TIME:", time, "TIPO:", tipo);
  try {
    // Verifica que la unidad de tiempo sea válida
    if (tipo && !validTimeUnits.includes(tipo)) {
      throw new Error("Unidad de tiempo inválida");
    }

    // Establece valores predeterminados si no se proporcionan
    const tiempoValido = time || 3;
    const tipoValido = tipo || "hours";

    if (user.status && !externo) {
      var payload = {
        sub: user._id,
        name: user.name.toUpperCase(),
        last_name: user.last_name.toUpperCase(),
        photo: user.photo,
        email: user.email,
        role: user.role,
        iat: moment().unix(),
        exp: moment().add(tiempoValido, tipoValido).unix(),
      };

      if (user.dni) {
        payload.dni = user.dni;
      }

      console.log("Payload creado:", payload);

      return pkg.encode(payload, secret);
    } else if (externo) {
      var payload = {
        sub: user._id,
        name: user.name.toUpperCase(),
        dni: user.dni,
        phone: user.phone,
        iat: moment().unix(),
        exp: moment().add(tiempoValido, tipoValido).unix(),
      };

      console.log("Payload creado:", payload);

      return pkg.encode(payload, secret);
    } else {
      return { message: "Usuario deshabilitado" };
    }
  } catch (error) {
    console.error("Error crear TOKEN:", error);
    return { message: "ERROR interno del Servidor" };
  }
};

export const idtokenUser = async function (req, res, next) {
  try {
    const token = req.headers.authorization
      ?.replace(/^Bearer\s/, "")
      ?.replace(/['"]+/g, "");
    if (!token) {
      return res.status(403).send({ message: "TokenMissing" });
    }

    const payload = pkg.decode(token, secret); // Asegúrate de tener 'secret' definido correctamente
    const id = req.query["id"];

    if (payload.sub !== id) {
      return res.status(403).send({ message: "InvalidToken" });
    }

    return next();
  } catch (error) {
    console.error(error);
    return res.status(403).send({ message: "InvalidToken" });
  }
};

export const obtenerImagen = async function (req, res) {
  try {
    const carpeta = req.params["carpeta"];
    const img = req.params["img"];

    // Seguridad: evitar path traversal
    if (!carpeta || !img || carpeta.includes("..") || img.includes("..")) {
      return res.status(400).send("Solicitud inválida");
    }

    // Ruta base segura desde la raíz del proyecto
    const carpetaDestino = path.join(__dirname, "..", "middlewares", "upload");
    const imgPath = path.join(carpetaDestino, carpeta, img);
    const defaultImgPath = path.join(carpetaDestino, "default.jpg");

    // Si no se proporciona imagen
    if (!img) {
      return res.status(200).sendFile(path.resolve(defaultImgPath));
    }

    fs.stat(imgPath, (err) => {
      if (!err) {
        return res.status(200).sendFile(path.resolve(imgPath));
      } else {
        return res.status(200).sendFile(path.resolve(defaultImgPath));
      }
    });
  } catch (error) {
    console.error("Error obteniendo imagen:", error);
    res.status(500).send("Error obteniendo imagen");
  }
};
