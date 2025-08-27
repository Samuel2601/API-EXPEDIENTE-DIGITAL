/**
 * Utilitario para manejo de errores en el sistema de expediente digital
 * Proporciona funciones consistentes para crear y manejar errores
 */

export class CustomError extends Error {
  constructor(code, message, statusCode = 500, details = null) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.timestamp = new Date().toISOString();

    // Mantener stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      details: this.details,
      timestamp: this.timestamp,
    };
  }
}

/**
 * Códigos de error predefinidos para el sistema
 */
export const ERROR_CODES = {
  // Errores generales
  INTERNAL_SERVER_ERROR: "INTERNAL_SERVER_ERROR",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  NOT_FOUND: "NOT_FOUND",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  BAD_REQUEST: "BAD_REQUEST",
  CONFLICT: "CONFLICT",

  // Errores de base de datos
  DATABASE_ERROR: "DATABASE_ERROR",
  DUPLICATE_ENTRY: "DUPLICATE_ENTRY",
  FOREIGN_KEY_CONSTRAINT: "FOREIGN_KEY_CONSTRAINT",

  // Errores de validación específicos
  MISSING_FIELDS: "MISSING_FIELDS",
  INVALID_FORMAT: "INVALID_FORMAT",
  INVALID_OBJECT_ID: "INVALID_OBJECT_ID",

  // Errores específicos del módulo de contratación
  DUPLICATE_CONTRACT_TYPE: "DUPLICATE_CONTRACT_TYPE",
  CONTRACT_TYPE_NOT_FOUND: "CONTRACT_TYPE_NOT_FOUND",
  CONTRACT_TYPE_IN_USE: "CONTRACT_TYPE_IN_USE",
  INVALID_CATEGORY: "INVALID_CATEGORY",
  INVALID_CODE: "INVALID_CODE",
  INVALID_AMOUNT: "INVALID_AMOUNT",
  INVALID_CONTRACT_OBJECT: "INVALID_CONTRACT_OBJECT",
  MISSING_CONTRACT_OBJECT: "MISSING_CONTRACT_OBJECT",
  MISSING_CODE: "MISSING_CODE",
  MISSING_CONTRACT_TYPE_CODE: "MISSING_CONTRACT_TYPE_CODE",
  OVERLAPPING_RANGES: "OVERLAPPING_RANGES",
  INVALID_MIN_AMOUNT: "INVALID_MIN_AMOUNT",
  INVALID_MAX_AMOUNT: "INVALID_MAX_AMOUNT",
  INVALID_RULE_TYPE: "INVALID_RULE_TYPE",

  // Errores de operaciones
  FETCH_ERROR: "FETCH_ERROR",
  CREATE_ERROR: "CREATE_ERROR",
  UPDATE_ERROR: "UPDATE_ERROR",
  DELETE_ERROR: "DELETE_ERROR",
  EXPORT_ERROR: "EXPORT_ERROR",
  IMPORT_ERROR: "IMPORT_ERROR",
  INIT_ERROR: "INIT_ERROR",
  CONFIG_ERROR: "CONFIG_ERROR",
  STATISTICS_ERROR: "STATISTICS_ERROR",
  VALIDATION_CONFIG_ERROR: "VALIDATION_CONFIG_ERROR",
};

/**
 * Mapeo de códigos de error a códigos de estado HTTP por defecto
 */
export const ERROR_STATUS_MAP = {
  [ERROR_CODES.VALIDATION_ERROR]: 400,
  [ERROR_CODES.NOT_FOUND]: 404,
  [ERROR_CODES.UNAUTHORIZED]: 401,
  [ERROR_CODES.FORBIDDEN]: 403,
  [ERROR_CODES.BAD_REQUEST]: 400,
  [ERROR_CODES.CONFLICT]: 409,
  [ERROR_CODES.DUPLICATE_ENTRY]: 409,
  [ERROR_CODES.MISSING_FIELDS]: 400,
  [ERROR_CODES.INVALID_FORMAT]: 400,
  [ERROR_CODES.INVALID_OBJECT_ID]: 400,
  [ERROR_CODES.DUPLICATE_CONTRACT_TYPE]: 409,
  [ERROR_CODES.CONTRACT_TYPE_NOT_FOUND]: 404,
  [ERROR_CODES.CONTRACT_TYPE_IN_USE]: 409,
  [ERROR_CODES.INVALID_CATEGORY]: 400,
  [ERROR_CODES.INVALID_CODE]: 400,
  [ERROR_CODES.INVALID_AMOUNT]: 400,
  [ERROR_CODES.INVALID_CONTRACT_OBJECT]: 400,
  [ERROR_CODES.MISSING_CONTRACT_OBJECT]: 400,
  [ERROR_CODES.MISSING_CODE]: 400,
  [ERROR_CODES.MISSING_CONTRACT_TYPE_CODE]: 400,
  [ERROR_CODES.OVERLAPPING_RANGES]: 409,
  [ERROR_CODES.INVALID_MIN_AMOUNT]: 400,
  [ERROR_CODES.INVALID_MAX_AMOUNT]: 400,
  [ERROR_CODES.INVALID_RULE_TYPE]: 400,
};

/**
 * Crear un error personalizado
 * @param {String} code - Código del error
 * @param {String} message - Mensaje del error
 * @param {Number} statusCode - Código de estado HTTP (opcional)
 * @param {Object} details - Detalles adicionales del error (opcional)
 * @returns {CustomError} Error personalizado
 */
export function createError(code, message, statusCode = null, details = null) {
  // Si no se proporciona statusCode, intentar obtenerlo del mapeo
  const finalStatusCode = statusCode || ERROR_STATUS_MAP[code] || 500;

  return new CustomError(code, message, finalStatusCode, details);
}

/**
 * Crear error de validación con detalles específicos
 * @param {String} message - Mensaje general del error
 * @param {Array|Object} validationErrors - Errores específicos de validación
 * @returns {CustomError} Error de validación
 */
export function createValidationError(message, validationErrors = null) {
  return createError(ERROR_CODES.VALIDATION_ERROR, message, 400, {
    validationErrors,
  });
}

/**
 * Crear error de base de datos
 * @param {String} message - Mensaje del error
 * @param {Object} dbError - Error original de la base de datos
 * @returns {CustomError} Error de base de datos
 */
export function createDatabaseError(message, dbError = null) {
  const details = dbError
    ? {
        originalError: {
          name: dbError.name,
          message: dbError.message,
          code: dbError.code,
        },
      }
    : null;

  return createError(ERROR_CODES.DATABASE_ERROR, message, 500, details);
}

/**
 * Crear error de recurso no encontrado
 * @param {String} resource - Nombre del recurso
 * @param {String|Object} identifier - Identificador del recurso
 * @returns {CustomError} Error de recurso no encontrado
 */
export function createNotFoundError(resource, identifier = null) {
  const message = identifier
    ? `${resource} con identificador '${identifier}' no encontrado`
    : `${resource} no encontrado`;

  return createError(ERROR_CODES.NOT_FOUND, message, 404, {
    resource,
    identifier,
  });
}

/**
 * Crear error de autorización
 * @param {String} message - Mensaje del error (opcional)
 * @param {Object} details - Detalles adicionales (opcional)
 * @returns {CustomError} Error de autorización
 */
export function createUnauthorizedError(
  message = "Acceso no autorizado",
  details = null
) {
  return createError(ERROR_CODES.UNAUTHORIZED, message, 401, details);
}

/**
 * Crear error de permisos insuficientes
 * @param {String} message - Mensaje del error (opcional)
 * @param {Object} details - Detalles adicionales (opcional)
 * @returns {CustomError} Error de permisos
 */
export function createForbiddenError(
  message = "Permisos insuficientes",
  details = null
) {
  return createError(ERROR_CODES.FORBIDDEN, message, 403, details);
}

/**
 * Crear error de conflicto (recursos duplicados, etc.)
 * @param {String} message - Mensaje del error
 * @param {Object} details - Detalles del conflicto (opcional)
 * @returns {CustomError} Error de conflicto
 */
export function createConflictError(message, details = null) {
  return createError(ERROR_CODES.CONFLICT, message, 409, details);
}

/**
 * Middleware de manejo de errores para Express
 * @param {Error} err - Error capturado
 * @param {Object} req - Request de Express
 * @param {Object} res - Response de Express
 * @param {Function} next - Función next de Express
 */
export function errorHandler(err, req, res, next) {
  // Si el error ya fue manejado (response ya enviado), no hacer nada
  if (res.headersSent) {
    return next(err);
  }

  // Log del error para debugging
  console.error("Error Handler:", {
    url: req.url,
    method: req.method,
    error: err.message,
    stack: err.stack,
    timestamp: new Date().toISOString(),
  });

  let error;

  // Si es un CustomError, usarlo directamente
  if (err instanceof CustomError) {
    error = err;
  }
  // Si es un error de validación de Mongoose
  else if (err.name === "ValidationError") {
    const validationErrors = Object.keys(err.errors).map((key) => ({
      field: key,
      message: err.errors[key].message,
    }));

    error = createValidationError(
      "Error de validación en los datos proporcionados",
      validationErrors
    );
  }
  // Si es un error de duplicado de MongoDB
  else if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || "campo";
    error = createConflictError(`Ya existe un registro con el mismo ${field}`, {
      duplicateField: field,
      duplicateValue: err.keyValue,
    });
  }
  // Si es un error de ObjectId inválido de Mongoose
  else if (err.name === "CastError" && err.kind === "ObjectId") {
    error = createError(
      ERROR_CODES.INVALID_OBJECT_ID,
      "ID de objeto no válido",
      400,
      { invalidId: err.value }
    );
  }
  // Para cualquier otro error, crear un error genérico
  else {
    error = createError(
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      process.env.NODE_ENV === "production"
        ? "Error interno del servidor"
        : err.message,
      500,
      process.env.NODE_ENV === "production" ? null : { stack: err.stack }
    );
  }

  // Enviar respuesta de error
  res.status(error.statusCode).json({
    success: false,
    error: {
      code: error.code,
      message: error.message,
      details: error.details,
      timestamp: error.timestamp,
    },
  });
}

/**
 * Formatear error para logging
 * @param {Error} error - Error a formatear
 * @param {Object} context - Contexto adicional (opcional)
 * @returns {Object} Error formateado para logging
 */
export function formatErrorForLogging(error, context = {}) {
  return {
    timestamp: new Date().toISOString(),
    level: "error",
    message: error.message,
    code: error.code || "UNKNOWN",
    statusCode: error.statusCode || 500,
    stack: error.stack,
    details: error.details,
    context,
    // Información adicional para debugging
    errorName: error.name,
    isCustomError: error instanceof CustomError,
  };
}

/**
 * Wrapper para funciones async que maneja errores automáticamente
 * @param {Function} fn - Función async a envolver
 * @returns {Function} Función envuelta con manejo de errores
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Validar y normalizar código de error
 * @param {String} code - Código de error a validar
 * @returns {String} Código normalizado o código por defecto
 */
export function normalizeErrorCode(code) {
  return Object.values(ERROR_CODES).includes(code)
    ? code
    : ERROR_CODES.INTERNAL_SERVER_ERROR;
}

// Exportación por defecto para facilitar la importación
export default {
  // Clases y constantes
  CustomError,
  ERROR_CODES,
  ERROR_STATUS_MAP,

  // Funciones principales
  createError,
  createValidationError,
  createDatabaseError,
  createNotFoundError,
  createUnauthorizedError,
  createForbiddenError,
  createConflictError,

  // Middleware y utilidades
  errorHandler,
  asyncHandler,
  formatErrorForLogging,
  normalizeErrorCode,
};
