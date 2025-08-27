/**
 * Utilitario para validaciones en el sistema de expediente digital
 * Proporciona funciones de validación reutilizables y consistentes
 */

import mongoose from "mongoose";
import { createError, ERROR_CODES } from "./error.util.js";

/**
 * Expresiones regulares comunes
 */
export const REGEX_PATTERNS = {
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PHONE: /^[\+]?[\d\s\-\(\)]{7,15}$/,
  RUC: /^\d{13}001$/, // RUC ecuatoriano
  CEDULA: /^\d{10}$/, // Cédula ecuatoriana
  CONTRACT_CODE: /^[A-Z0-9_-]+$/,
  ALPHANUMERIC: /^[a-zA-Z0-9]+$/,
  ALPHANUMERIC_SPACES: /^[a-zA-Z0-9\s]+$/,
  NUMERIC: /^\d+$/,
  DECIMAL: /^\d+(\.\d{1,2})?$/,
  PASSWORD: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/, // Mínimo 8 caracteres, 1 mayúscula, 1 minúscula, 1 número
  URL: /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/,
};

/**
 * Tipos de archivos permitidos por categoría
 */
export const ALLOWED_FILE_TYPES = {
  DOCUMENTS: ["pdf", "doc", "docx", "xls", "xlsx", "txt"],
  IMAGES: ["jpg", "jpeg", "png", "gif", "bmp", "webp"],
  COMPRESSED: ["zip", "rar", "7z"],
  ALL: [
    "pdf",
    "doc",
    "docx",
    "xls",
    "xlsx",
    "txt",
    "jpg",
    "jpeg",
    "png",
    "gif",
    "bmp",
    "webp",
    "zip",
    "rar",
    "7z",
  ],
};

/**
 * Límites de tamaño de archivo (en bytes)
 */
export const FILE_SIZE_LIMITS = {
  SMALL: 1024 * 1024, // 1MB
  MEDIUM: 5 * 1024 * 1024, // 5MB
  LARGE: 10 * 1024 * 1024, // 10MB
  XLARGE: 50 * 1024 * 1024, // 50MB
};

/**
 * Validar ObjectId de MongoDB
 * @param {String} id - ID a validar
 * @param {String} fieldName - Nombre del campo (para mensajes de error)
 * @throws {CustomError} Si el ID no es válido
 */
export function validateObjectId(id, fieldName = "ID") {
  if (!id) {
    throw createError(
      ERROR_CODES.MISSING_FIELDS,
      `${fieldName} es requerido`,
      400
    );
  }

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw createError(
      ERROR_CODES.INVALID_OBJECT_ID,
      `${fieldName} no es un ObjectId válido: ${id}`,
      400,
      { invalidId: id, field: fieldName }
    );
  }
}

/**
 * Validar array de ObjectIds
 * @param {Array} ids - Array de IDs a validar
 * @param {String} fieldName - Nombre del campo
 * @param {Boolean} allowEmpty - Permitir array vacío
 * @throws {CustomError} Si algún ID no es válido
 */
export function validateObjectIdArray(
  ids,
  fieldName = "IDs",
  allowEmpty = false
) {
  if (!Array.isArray(ids)) {
    throw createError(
      ERROR_CODES.INVALID_FORMAT,
      `${fieldName} debe ser un array`,
      400
    );
  }

  if (!allowEmpty && ids.length === 0) {
    throw createError(
      ERROR_CODES.MISSING_FIELDS,
      `${fieldName} no puede estar vacío`,
      400
    );
  }

  ids.forEach((id, index) => {
    try {
      validateObjectId(id, `${fieldName}[${index}]`);
    } catch (error) {
      throw error;
    }
  });
}

/**
 * Validar email
 * @param {String} email - Email a validar
 * @param {Boolean} required - Si es requerido
 * @throws {CustomError} Si el email no es válido
 */
export function validateEmail(email, required = true) {
  if (!email) {
    if (required) {
      throw createError(ERROR_CODES.MISSING_FIELDS, "Email es requerido", 400);
    }
    return;
  }

  if (!REGEX_PATTERNS.EMAIL.test(email)) {
    throw createError(
      ERROR_CODES.INVALID_FORMAT,
      "Formato de email no válido",
      400,
      { email, field: "email" }
    );
  }
}

/**
 * Validar cédula ecuatoriana
 * @param {String} cedula - Cédula a validar
 * @param {Boolean} required - Si es requerido
 * @throws {CustomError} Si la cédula no es válida
 */
export function validateCedula(cedula, required = true) {
  if (!cedula) {
    if (required) {
      throw createError(ERROR_CODES.MISSING_FIELDS, "Cédula es requerida", 400);
    }
    return;
  }

  // Validar formato básico
  if (!REGEX_PATTERNS.CEDULA.test(cedula)) {
    throw createError(
      ERROR_CODES.INVALID_FORMAT,
      "Formato de cédula no válido",
      400,
      { cedula, field: "cedula" }
    );
  }

  // Validar algoritmo de cédula ecuatoriana
  const digits = cedula.split("").map(Number);
  const provinceCode = parseInt(cedula.substring(0, 2));

  if (provinceCode < 1 || provinceCode > 24) {
    throw createError(
      ERROR_CODES.INVALID_FORMAT,
      "Código de provincia en cédula no válido",
      400,
      { cedula, field: "cedula" }
    );
  }

  // Algoritmo de validación
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let digit = digits[i];
    if (i % 2 === 0) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }

  const checkDigit = (10 - (sum % 10)) % 10;
  if (checkDigit !== digits[9]) {
    throw createError(
      ERROR_CODES.INVALID_FORMAT,
      "Cédula no válida según algoritmo de verificación",
      400,
      { cedula, field: "cedula" }
    );
  }
}

/**
 * Validar RUC ecuatoriano
 * @param {String} ruc - RUC a validar
 * @param {Boolean} required - Si es requerido
 * @throws {CustomError} Si el RUC no es válido
 */
export function validateRUC(ruc, required = true) {
  if (!ruc) {
    if (required) {
      throw createError(ERROR_CODES.MISSING_FIELDS, "RUC es requerido", 400);
    }
    return;
  }

  if (!REGEX_PATTERNS.RUC.test(ruc)) {
    throw createError(
      ERROR_CODES.INVALID_FORMAT,
      "Formato de RUC no válido",
      400,
      { ruc, field: "ruc" }
    );
  }

  // Validar que los primeros 10 dígitos sean una cédula válida
  const cedula = ruc.substring(0, 10);
  try {
    validateCedula(cedula, true);
  } catch (error) {
    throw createError(
      ERROR_CODES.INVALID_FORMAT,
      "RUC no válido: cédula base incorrecta",
      400,
      { ruc, field: "ruc" }
    );
  }
}

/**
 * Validar teléfono
 * @param {String} phone - Teléfono a validar
 * @param {Boolean} required - Si es requerido
 * @throws {CustomError} Si el teléfono no es válido
 */
export function validatePhone(phone, required = true) {
  if (!phone) {
    if (required) {
      throw createError(
        ERROR_CODES.MISSING_FIELDS,
        "Teléfono es requerido",
        400
      );
    }
    return;
  }

  if (!REGEX_PATTERNS.PHONE.test(phone)) {
    throw createError(
      ERROR_CODES.INVALID_FORMAT,
      "Formato de teléfono no válido",
      400,
      { phone, field: "phone" }
    );
  }
}

/**
 * Validar monto monetario
 * @param {Number} amount - Monto a validar
 * @param {Number} min - Valor mínimo permitido
 * @param {Number} max - Valor máximo permitido
 * @param {Boolean} required - Si es requerido
 * @throws {CustomError} Si el monto no es válido
 */
export function validateAmount(amount, min = 0, max = null, required = true) {
  if (amount === null || amount === undefined) {
    if (required) {
      throw createError(ERROR_CODES.MISSING_FIELDS, "Monto es requerido", 400);
    }
    return;
  }

  if (typeof amount !== "number" || isNaN(amount)) {
    throw createError(
      ERROR_CODES.INVALID_FORMAT,
      "Monto debe ser un número válido",
      400,
      { amount, field: "amount" }
    );
  }

  if (amount < min) {
    throw createError(
      ERROR_CODES.INVALID_AMOUNT,
      `Monto no puede ser menor a ${min}`,
      400,
      { amount, min, field: "amount" }
    );
  }

  if (max !== null && amount > max) {
    throw createError(
      ERROR_CODES.INVALID_AMOUNT,
      `Monto no puede ser mayor a ${max}`,
      400,
      { amount, max, field: "amount" }
    );
  }
}

/**
 * Validar fecha
 * @param {String|Date} date - Fecha a validar
 * @param {Boolean} required - Si es requerido
 * @param {Date} minDate - Fecha mínima permitida
 * @param {Date} maxDate - Fecha máxima permitida
 * @throws {CustomError} Si la fecha no es válida
 */
export function validateDate(
  date,
  required = true,
  minDate = null,
  maxDate = null
) {
  if (!date) {
    if (required) {
      throw createError(ERROR_CODES.MISSING_FIELDS, "Fecha es requerida", 400);
    }
    return;
  }

  const dateObj = date instanceof Date ? date : new Date(date);

  if (isNaN(dateObj.getTime())) {
    throw createError(ERROR_CODES.INVALID_FORMAT, "Fecha no válida", 400, {
      date,
      field: "date",
    });
  }

  if (minDate && dateObj < minDate) {
    throw createError(
      ERROR_CODES.INVALID_FORMAT,
      `Fecha no puede ser anterior a ${minDate.toISOString()}`,
      400,
      { date, minDate, field: "date" }
    );
  }

  if (maxDate && dateObj > maxDate) {
    throw createError(
      ERROR_CODES.INVALID_FORMAT,
      `Fecha no puede ser posterior a ${maxDate.toISOString()}`,
      400,
      { date, maxDate, field: "date" }
    );
  }
}

/**
 * Validar string con opciones
 * @param {String} str - String a validar
 * @param {Object} options - Opciones de validación
 * @throws {CustomError} Si el string no es válido
 */
export function validateString(str, options = {}) {
  const {
    required = true,
    minLength = 0,
    maxLength = null,
    pattern = null,
    trim = true,
    fieldName = "campo",
  } = options;

  if (!str || (typeof str === "string" && str.trim() === "")) {
    if (required) {
      throw createError(
        ERROR_CODES.MISSING_FIELDS,
        `${fieldName} es requerido`,
        400
      );
    }
    return;
  }

  const value = trim ? str.trim() : str;

  if (value.length < minLength) {
    throw createError(
      ERROR_CODES.INVALID_FORMAT,
      `${fieldName} debe tener al menos ${minLength} caracteres`,
      400,
      { value, minLength, field: fieldName }
    );
  }

  if (maxLength && value.length > maxLength) {
    throw createError(
      ERROR_CODES.INVALID_FORMAT,
      `${fieldName} no puede tener más de ${maxLength} caracteres`,
      400,
      { value, maxLength, field: fieldName }
    );
  }

  if (pattern && !pattern.test(value)) {
    throw createError(
      ERROR_CODES.INVALID_FORMAT,
      `${fieldName} no cumple con el formato requerido`,
      400,
      { value, field: fieldName }
    );
  }
}

/**
 * Validar array de strings con opciones
 * @param {Array} arr - Array a validar
 * @param {Object} options - Opciones de validación
 * @throws {CustomError} Si el array no es válido
 */
export function validateStringArray(arr, options = {}) {
  const {
    required = true,
    minLength = 0,
    maxLength = null,
    allowEmpty = false,
    fieldName = "array",
  } = options;

  if (!arr) {
    if (required) {
      throw createError(
        ERROR_CODES.MISSING_FIELDS,
        `${fieldName} es requerido`,
        400
      );
    }
    return;
  }

  if (!Array.isArray(arr)) {
    throw createError(
      ERROR_CODES.INVALID_FORMAT,
      `${fieldName} debe ser un array`,
      400
    );
  }

  if (!allowEmpty && arr.length === 0) {
    throw createError(
      ERROR_CODES.MISSING_FIELDS,
      `${fieldName} no puede estar vacío`,
      400
    );
  }

  if (arr.length < minLength) {
    throw createError(
      ERROR_CODES.INVALID_FORMAT,
      `${fieldName} debe tener al menos ${minLength} elementos`,
      400,
      { length: arr.length, minLength, field: fieldName }
    );
  }

  if (maxLength && arr.length > maxLength) {
    throw createError(
      ERROR_CODES.INVALID_FORMAT,
      `${fieldName} no puede tener más de ${maxLength} elementos`,
      400,
      { length: arr.length, maxLength, field: fieldName }
    );
  }
}

/**
 * Validar archivo
 * @param {Object} file - Objeto de archivo
 * @param {Object} options - Opciones de validación
 * @throws {CustomError} Si el archivo no es válido
 */
export function validateFile(file, options = {}) {
  const {
    required = true,
    allowedTypes = ALLOWED_FILE_TYPES.ALL,
    maxSize = FILE_SIZE_LIMITS.MEDIUM,
    fieldName = "archivo",
  } = options;

  if (!file) {
    if (required) {
      throw createError(
        ERROR_CODES.MISSING_FIELDS,
        `${fieldName} es requerido`,
        400
      );
    }
    return;
  }

  // Validar tipo de archivo
  if (file.originalname) {
    const extension = file.originalname.split(".").pop().toLowerCase();
    if (!allowedTypes.includes(extension)) {
      throw createError(
        ERROR_CODES.INVALID_FORMAT,
        `Tipo de archivo no permitido. Tipos permitidos: ${allowedTypes.join(", ")}`,
        400,
        { extension, allowedTypes, field: fieldName }
      );
    }
  }

  // Validar tamaño
  if (file.size && file.size > maxSize) {
    const maxSizeMB = (maxSize / (1024 * 1024)).toFixed(1);
    throw createError(
      ERROR_CODES.INVALID_FORMAT,
      `Tamaño de archivo excede el límite de ${maxSizeMB}MB`,
      400,
      { size: file.size, maxSize, field: fieldName }
    );
  }
}

/**
 * Validar que los campos requeridos estén presentes
 * @param {Object} data - Objeto con datos
 * @param {Array} requiredFields - Array de campos requeridos
 * @param {String} objectName - Nombre del objeto (para mensajes)
 * @throws {CustomError} Si faltan campos requeridos
 */
export function validateRequiredFields(
  data,
  requiredFields,
  objectName = "objeto"
) {
  if (!data || typeof data !== "object") {
    throw createError(
      ERROR_CODES.INVALID_FORMAT,
      `${objectName} debe ser un objeto válido`,
      400
    );
  }

  const missingFields = requiredFields.filter((field) => {
    const value = data[field];
    return (
      value === null ||
      value === undefined ||
      (typeof value === "string" && value.trim() === "")
    );
  });

  if (missingFields.length > 0) {
    throw createError(
      ERROR_CODES.MISSING_FIELDS,
      `Campos requeridos faltantes en ${objectName}: ${missingFields.join(", ")}`,
      400,
      { missingFields, objectName }
    );
  }
}

/**
 * Validar enum (valor dentro de opciones permitidas)
 * @param {*} value - Valor a validar
 * @param {Array} allowedValues - Valores permitidos
 * @param {String} fieldName - Nombre del campo
 * @param {Boolean} required - Si es requerido
 * @throws {CustomError} Si el valor no está permitido
 */
export function validateEnum(
  value,
  allowedValues,
  fieldName = "campo",
  required = true
) {
  if (!value) {
    if (required) {
      throw createError(
        ERROR_CODES.MISSING_FIELDS,
        `${fieldName} es requerido`,
        400
      );
    }
    return;
  }

  if (!allowedValues.includes(value)) {
    throw createError(
      ERROR_CODES.INVALID_FORMAT,
      `${fieldName} debe ser uno de: ${allowedValues.join(", ")}`,
      400,
      { value, allowedValues, field: fieldName }
    );
  }
}

/**
 * Validar URL
 * @param {String} url - URL a validar
 * @param {Boolean} required - Si es requerido
 * @throws {CustomError} Si la URL no es válida
 */
export function validateURL(url, required = true) {
  if (!url) {
    if (required) {
      throw createError(ERROR_CODES.MISSING_FIELDS, "URL es requerida", 400);
    }
    return;
  }

  if (!REGEX_PATTERNS.URL.test(url)) {
    throw createError(
      ERROR_CODES.INVALID_FORMAT,
      "Formato de URL no válido",
      400,
      { url, field: "url" }
    );
  }
}

/**
 * Sanitizar string (remover caracteres peligrosos)
 * @param {String} str - String a sanitizar
 * @returns {String} String sanitizado
 */
export function sanitizeString(str) {
  if (typeof str !== "string") return str;

  return str
    .trim()
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "") // Remover scripts
    .replace(/[<>]/g, "") // Remover < y >
    .replace(/javascript:/gi, "") // Remover javascript:
    .replace(/on\w+\s*=/gi, ""); // Remover event handlers
}

export default {
  // Constantes
  REGEX_PATTERNS,
  ALLOWED_FILE_TYPES,
  FILE_SIZE_LIMITS,

  // Validaciones básicas
  validateObjectId,
  validateObjectIdArray,
  validateEmail,
  validateCedula,
  validateRUC,
  validatePhone,
  validateAmount,
  validateDate,
  validateString,
  validateStringArray,
  validateFile,
  validateRequiredFields,
  validateEnum,
  validateURL,

  // Utilidades
  sanitizeString,
};
