// =============================================================================
// src/middlewares/files.middleware.js - MEJORADO
// Middleware optimizado para manejo de archivos del expediente digital
// Soporte para documentos generales + optimización de imágenes
// =============================================================================

import multer from "multer";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import sharp from "sharp";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Middleware mejorado para manejo de archivos del expediente digital
 * @param {Object} opciones - Configuración del middleware
 * @param {string} [opciones.destino="expediente-digital"] - Carpeta de destino
 * @param {number} [opciones.maxTamaño=50] - Tamaño máximo en MB
 * @param {Array} [opciones.campos] - Configuración de campos (para fields)
 * @param {string} [opciones.campoNombre="documents"] - Nombre del campo (para array)
 * @param {number} [opciones.maxArchivos=10] - Máximo número de archivos
 * @param {Array} [opciones.tiposPermitidos] - Tipos de archivos permitidos
 * @param {boolean} [opciones.optimizarImagenes=true] - Si optimizar imágenes
 * @param {Object} [opciones.optimizacionImagenes] - Opciones para optimización de imágenes
 * @param {boolean} [opciones.generarChecksum=true] - Si generar checksum de archivos
 * @param {boolean} [opciones.validarVirusLogic=false] - Placeholder para validación antivirus
 * @returns {Function} Middleware configurado
 */
export const crearMiddlewareArchivos = (opciones = {}) => {
  const {
    destino = "expediente-digital",
    maxTamaño = 50, // 50MB para documentos del expediente digital
    campos,
    campoNombre = "documents",
    maxArchivos = 10,
    tiposPermitidos = [
      // Documentos de oficina
      ".pdf",
      ".doc",
      ".docx",
      ".xls",
      ".xlsx",
      ".ppt",
      ".pptx",
      // Imágenes
      ".jpg",
      ".jpeg",
      ".png",
      ".gif",
      ".webp",
      ".bmp",
      ".tiff",
      // Texto y datos
      ".txt",
      ".csv",
      ".rtf",
      ".odt",
      ".ods",
      ".odp",
      // Comprimidos
      ".zip",
      ".rar",
      ".7z",
      ".tar",
      ".gz",
      // Otros
      ".xml",
      ".json",
    ],
    optimizarImagenes = true,
    optimizacionImagenes = {
      maxWidth: 1920,
      maxHeight: 1080,
      quality: 85,
      format: "webp", // Convertir a WebP para mejor compresión
      preserveOriginal: true, // Mantener original para documentos legales
    },
    generarChecksum = true,
    validarVirusLogic = false, // Placeholder para futura implementación
  } = opciones;

  // Determinar tipos MIME válidos basados en extensiones permitidas
  const getMimeTypesPermitidos = () => {
    const mimeMap = {
      // Documentos
      ".pdf": "application/pdf",
      ".doc": "application/msword",
      ".docx":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ".xls": "application/vnd.ms-excel",
      ".xlsx":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ".ppt": "application/vnd.ms-powerpoint",
      ".pptx":
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",

      // Imágenes
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".bmp": "image/bmp",
      ".tiff": "image/tiff",

      // Texto
      ".txt": "text/plain",
      ".csv": "text/csv",
      ".rtf": "application/rtf",
      ".xml": "application/xml",
      ".json": "application/json",

      // OpenDocument
      ".odt": "application/vnd.oasis.opendocument.text",
      ".ods": "application/vnd.oasis.opendocument.spreadsheet",
      ".odp": "application/vnd.oasis.opendocument.presentation",

      // Comprimidos
      ".zip": "application/zip",
      ".rar": "application/x-rar-compressed",
      ".7z": "application/x-7z-compressed",
      ".tar": "application/x-tar",
      ".gz": "application/gzip",
    };

    return tiposPermitidos.map((ext) => mimeMap[ext]).filter(Boolean);
  };

  const mimeTypesPermitidos = getMimeTypesPermitidos();

  // Función de filtro de archivos mejorada
  const fileFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const mime = file.mimetype.toLowerCase();

    console.log(`🔍 Validando archivo: ${file.originalname}`);
    console.log(`   Extensión: ${ext}, MIME: ${mime}`);

    // Validar extensión
    const esExtensionValida = tiposPermitidos.includes(ext);

    // Validar MIME type (más permisivo para documentos)
    const esMimeValido =
      mimeTypesPermitidos.includes(mime) ||
      mime.startsWith("application/") || // Para documentos diversos
      mime.startsWith("text/") || // Para archivos de texto
      mime.startsWith("image/"); // Para imágenes

    // Validaciones adicionales por tipo
    let validacionAdicional = true;
    let razonRechazo = "";

    if (!esExtensionValida) {
      razonRechazo = `Extensión '${ext}' no permitida`;
      validacionAdicional = false;
    } else if (!esMimeValido) {
      razonRechazo = `MIME type '${mime}' no válido para '${ext}'`;
      validacionAdicional = false;
    } else {
      // Validaciones específicas por tipo de archivo
      if (
        mime.startsWith("image/") &&
        ![
          "image/jpeg",
          "image/png",
          "image/gif",
          "image/webp",
          "image/bmp",
          "image/tiff",
        ].includes(mime)
      ) {
        razonRechazo = `Tipo de imagen no soportado: ${mime}`;
        validacionAdicional = false;
      }
    }

    if (esExtensionValida && esMimeValido && validacionAdicional) {
      console.log(`✅ Archivo válido: ${file.originalname}`);
      cb(null, true);
    } else {
      console.log(
        `❌ Archivo rechazado: ${file.originalname} - ${razonRechazo}`
      );
      cb(new Error(`Archivo rechazado: ${razonRechazo}`), false);
    }
  };

  // Usar memoryStorage para procesar archivos en memoria
  const storage = multer.memoryStorage();

  // Configuración de multer
  const upload = multer({
    storage,
    fileFilter,
    limits: {
      fileSize: maxTamaño * 1024 * 1024, // Convertir MB a bytes
      files: campos
        ? campos.reduce((total, campo) => total + campo.maxCount, 0)
        : maxArchivos,
      fieldSize: 1024 * 1024, // 1MB para campos de formulario
      fieldNameSize: 100, // Límite para nombre de campos
      fields: 20, // Máximo número de campos non-file
    },
  });

  // Middleware principal mejorado
  return async (req, res, next) => {
    try {
      console.log(`📁 Iniciando procesamiento de archivos para: ${req.path}`);

      // 1. Subida de archivos usando multer
      const uploadMiddleware = campos
        ? upload.fields(campos)
        : upload.array(campoNombre, maxArchivos);

      await new Promise((resolve, reject) => {
        uploadMiddleware(req, res, (err) => {
          if (err) {
            console.error(`❌ Error en multer: ${err.message}`);
            reject(err);
          } else {
            resolve();
          }
        });
      });

      // 2. Procesar archivos subidos
      if (
        req.files &&
        (Array.isArray(req.files) || Object.keys(req.files).length > 0)
      ) {
        console.log(
          `📋 Procesando ${Array.isArray(req.files) ? req.files.length : Object.keys(req.files).length} archivo(s)`
        );

        // Crear estructura de información de archivos
        req.archivosInfo = {
          carpetaDestino: null, // Se asignará después
          archivos: [],
          porCampo: {},
          estadisticas: {
            total: 0,
            imagenes: 0,
            documentos: 0,
            comprimidos: 0,
            otros: 0,
            tamañoTotal: 0,
          },
        };

        // Función para procesar un archivo individual
        const procesarArchivo = async (file, campo = campoNombre) => {
          console.log(`🔄 Procesando archivo: ${file.originalname}`);

          const esImagen = file.mimetype.startsWith("image/");
          const extension = path.extname(file.originalname).toLowerCase();

          let archivoProcessado = {
            campo,
            nombreOriginal: file.originalname,
            mimetype: file.mimetype,
            tamañoOriginal: file.size,
            extension,
            esImagen,
            buffer: file.buffer,
          };

          // Generar checksum si está habilitado
          if (generarChecksum) {
            archivoProcessado.checksum = crypto
              .createHash("sha256")
              .update(file.buffer)
              .digest("hex");
            console.log(
              `🔐 Checksum generado: ${archivoProcessado.checksum.substring(0, 16)}...`
            );
          }

          // Optimizar imágenes si está habilitado y es una imagen
          if (optimizarImagenes && esImagen) {
            try {
              console.log(`🖼️ Optimizando imagen: ${file.originalname}`);

              // Crear versión optimizada
              const imagenOptimizada = await sharp(file.buffer)
                .resize(
                  optimizacionImagenes.maxWidth,
                  optimizacionImagenes.maxHeight,
                  {
                    fit: "inside",
                    withoutEnlargement: true,
                  }
                )
                .toFormat(optimizacionImagenes.format, {
                  quality: optimizacionImagenes.quality,
                })
                .toBuffer();

              // Agregar versión optimizada
              archivoProcessado.optimizacion = {
                buffer: imagenOptimizada,
                tamaño: imagenOptimizada.length,
                formato: optimizacionImagenes.format,
                compresion: Math.round(
                  ((file.size - imagenOptimizada.length) / file.size) * 100
                ),
              };

              // Si se preserva original, mantener ambas versiones
              if (optimizacionImagenes.preserveOriginal) {
                archivoProcessado.bufferOriginal = file.buffer;
                // Usar la versión optimizada como principal para reducir transferencias
                archivoProcessado.buffer = imagenOptimizada;
                archivoProcessado.tamañoOptimizado = imagenOptimizada.length;
              } else {
                // Solo usar la versión optimizada
                archivoProcessado.buffer = imagenOptimizada;
                archivoProcessado.tamañoOptimizado = imagenOptimizada.length;
              }

              console.log(
                `✅ Imagen optimizada: ${file.originalname} (${archivoProcessado.optimizacion.compresion}% de compresión)`
              );
            } catch (error) {
              console.warn(
                `⚠️ Error optimizando imagen ${file.originalname}: ${error.message}`
              );
              // En caso de error, usar la imagen original
              archivoProcessado.optimizacion = null;
            }
          }

          // Validación antivirus (placeholder)
          if (validarVirusLogic) {
            // TODO: Implementar validación antivirus aquí
            console.log(
              `🛡️ Validación antivirus para: ${file.originalname} (placeholder)`
            );
          }

          // Actualizar estadísticas
          req.archivosInfo.estadisticas.total++;
          req.archivosInfo.estadisticas.tamañoTotal += file.size;

          if (esImagen) {
            req.archivosInfo.estadisticas.imagenes++;
          } else if (
            file.mimetype.includes("zip") ||
            file.mimetype.includes("rar") ||
            file.mimetype.includes("compressed")
          ) {
            req.archivosInfo.estadisticas.comprimidos++;
          } else if (
            file.mimetype.includes("pdf") ||
            file.mimetype.includes("document") ||
            file.mimetype.includes("spreadsheet")
          ) {
            req.archivosInfo.estadisticas.documentos++;
          } else {
            req.archivosInfo.estadisticas.otros++;
          }

          console.log(`✅ Archivo procesado: ${file.originalname}`);
          return archivoProcessado;
        };

        // Procesar archivos según configuración
        if (campos) {
          // Procesamiento por campos específicos
          for (const [campo, archivos] of Object.entries(req.files)) {
            console.log(
              `📂 Procesando campo: ${campo} (${archivos.length} archivo(s))`
            );

            const archivosProcessados = await Promise.all(
              archivos.map((archivo) => procesarArchivo(archivo, campo))
            );

            req.archivosInfo.porCampo[campo] = {
              cantidad: archivos.length,
              archivos: archivosProcessados,
            };

            req.archivosInfo.archivos.push(...archivosProcessados);
          }
        } else {
          // Procesamiento de array de archivos
          console.log(
            `📂 Procesando array de archivos: ${req.files.length} archivo(s)`
          );

          req.archivosInfo.archivos = await Promise.all(
            req.files.map((archivo) => procesarArchivo(archivo, campoNombre))
          );

          req.archivosInfo.cantidad = req.archivosInfo.archivos.length;
        }

        // Información adicional sobre el procesamiento
        req.archivosInfo.procesamiento = {
          timestamp: new Date(),
          optimizacionImagenes: optimizarImagenes,
          checksumGenerado: generarChecksum,
          validacionAntivirus: validarVirusLogic,
        };

        console.log(
          `✅ Procesamiento completado: ${req.archivosInfo.estadisticas.total} archivos`
        );
        console.log(
          `📊 Estadísticas: ${req.archivosInfo.estadisticas.imagenes} imágenes, ${req.archivosInfo.estadisticas.documentos} documentos, ${req.archivosInfo.estadisticas.comprimidos} comprimidos, ${req.archivosInfo.estadisticas.otros} otros`
        );
      } else {
        console.log(`📭 No se recibieron archivos`);
        req.archivosInfo = null;
      }

      next();
    } catch (error) {
      console.error(`❌ Error en middleware de archivos: ${error.message}`);
      manejarErrores(error, res, maxTamaño, maxArchivos, campoNombre);
    }
  };
};

/**
 * Función mejorada de manejo de errores
 * @param {Error} error - Error ocurrido
 * @param {Object} res - Objeto response
 * @param {number} maxTamaño - Tamaño máximo permitido
 * @param {number} maxArchivos - Número máximo de archivos
 * @param {string} campoNombre - Nombre del campo
 */
const manejarErrores = (error, res, maxTamaño, maxArchivos, campoNombre) => {
  console.error(`❌ Error de archivos: ${error.message}`);

  const errores = {
    LIMIT_FILE_SIZE: {
      status: 413,
      error: "ARCHIVO_DEMASIADO_GRANDE",
      mensaje: `El tamaño máximo permitido es ${maxTamaño}MB`,
      detalles: `Cada archivo individual no puede exceder ${maxTamaño}MB`,
    },
    LIMIT_FILE_COUNT: {
      status: 413,
      error: "DEMASIADOS_ARCHIVOS",
      mensaje: `Máximo ${maxArchivos} archivos permitidos`,
      detalles: `Se pueden subir hasta ${maxArchivos} archivos simultáneamente`,
    },
    LIMIT_FIELD_COUNT: {
      status: 413,
      error: "DEMASIADOS_CAMPOS",
      mensaje: "Demasiados campos en el formulario",
      detalles: "Número máximo de campos excedido",
    },
    LIMIT_UNEXPECTED_FILE: {
      status: 400,
      error: "CAMPO_INCORRECTO",
      mensaje: campoNombre
        ? `Use el campo '${campoNombre}' para subir archivos`
        : "Campo de archivo no reconocido",
      detalles: "Verifique el nombre del campo en su formulario",
    },
    LIMIT_FIELD_SIZE: {
      status: 413,
      error: "CAMPO_DEMASIADO_GRANDE",
      mensaje: "Valor de campo demasiado grande",
      detalles: "Los campos de texto no pueden exceder 1MB",
    },
    LIMIT_FIELD_NAME_SIZE: {
      status: 400,
      error: "NOMBRE_CAMPO_LARGO",
      mensaje: "Nombre de campo demasiado largo",
      detalles: "Los nombres de campo no pueden exceder 100 caracteres",
    },
  };

  // Determinar respuesta según el tipo de error
  const respuesta =
    error instanceof multer.MulterError
      ? errores[error.code] || {
          status: 400,
          error: "ERROR_MULTER",
          mensaje: "Error procesando archivos",
          detalles: error.message,
        }
      : {
          status: 400,
          error: "ERROR_VALIDACION",
          mensaje: error.message,
          detalles: "Error en validación de archivos",
        };

  // Agregar información adicional de debugging en desarrollo
  if (process.env.NODE_ENV === "development") {
    respuesta.debug = {
      errorType: error.constructor.name,
      stack: error.stack?.split("\n").slice(0, 3),
      timestamp: new Date().toISOString(),
    };
  }

  // Enviar respuesta de error
  res.status(respuesta.status).json({
    success: false,
    ...respuesta,
    configuracion: {
      maxTamaño: `${maxTamaño}MB`,
      maxArchivos,
      campoNombre,
    },
  });
};

/**
 * Middleware simple para archivos únicos
 * @param {Object} opciones - Configuración
 * @returns {Function} Middleware para un solo archivo
 */
export const archivoUnico = (opciones = {}) => {
  return crearMiddlewareArchivos({
    ...opciones,
    maxArchivos: 1,
    campoNombre: opciones.campoNombre || "archivo",
  });
};

/**
 * Middleware específico para imágenes (compatibilidad con código existente)
 * @param {Object} opciones - Configuración
 * @returns {Function} Middleware específico para imágenes
 */
export const crearMiddlewareImagenes = (opciones = {}) => {
  return crearMiddlewareArchivos({
    ...opciones,
    tiposPermitidos: [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"],
    optimizarImagenes: true,
    campoNombre: opciones.campoNombre || "imagenes",
  });
};

/**
 * Middleware específico para documentos oficiales
 * @param {Object} opciones - Configuración
 * @returns {Function} Middleware para documentos oficiales
 */
export const documentosOficiales = (opciones = {}) => {
  return crearMiddlewareArchivos({
    ...opciones,
    tiposPermitidos: [".pdf", ".doc", ".docx", ".xls", ".xlsx"],
    optimizarImagenes: false, // No optimizar documentos oficiales
    generarChecksum: true, // Siempre generar checksum para documentos legales
    campoNombre: opciones.campoNombre || "documentos",
    maxTamaño: opciones.maxTamaño || 25, // 25MB para documentos oficiales
  });
};

// Exportar middleware principal como default
export default crearMiddlewareArchivos;
