import multer from "multer";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Middleware optimizado para manejo de imágenes con compresión
 * @param {Object} opciones - Configuración del middleware
 * @param {string} [opciones.destino="general"] - Carpeta de destino
 * @param {number} [opciones.maxTamaño=5] - Tamaño máximo en MB
 * @param {Array} [opciones.campos] - Configuración de campos (para fields)
 * @param {string} [opciones.campoNombre] - Nombre del campo (para array)
 * @param {number} [opciones.maxImagenes] - Máximo de imágenes (para array)
 * @param {Object} [opciones.optimizacion] - Opciones para sharp
 * @returns {Function} Middleware configurado
 */
export const crearMiddlewareImagenes = (opciones = {}) => {
  const {
    destino = "general",
    maxTamaño = 5,
    campos,
    campoNombre,
    maxImagenes,
    optimizacion = {
      width: 1200,
      height: 1200,
      quality: 80,
      format: "webp",
    },
  } = opciones;

  // Configuración común
  const fileFilter = (req, file, cb) => {
    const extensionesPermitidas = [
      ".jpeg",
      ".jpg",
      ".jfif",
      ".png",
      ".gif",
      ".webp",
    ];
    const mimeTypesPermitidos = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
    ];

    const ext = path.extname(file.originalname).toLowerCase();
    const mime = file.mimetype;

    const esExtensionValida = extensionesPermitidas.includes(ext);
    const esMimeValido = mimeTypesPermitidos.includes(mime);

    // Debug: log para identificar el problema
    console.log("Archivo:", file.originalname);
    console.log("Extensión detectada:", ext);
    console.log("Mime type:", mime);
    console.log("Extensión válida:", esExtensionValida);
    console.log("Mime válido:", esMimeValido);

    if (esExtensionValida && esMimeValido) {
      cb(null, true);
    } else {
      // Error más descriptivo
      const razon = !esExtensionValida
        ? `extensión '${ext}' no permitida`
        : `mime type '${mime}' no permitido`;
      cb(new Error(`Archivo rechazado: ${razon}`), false);
    }
  };

  // Usamos memoryStorage para procesar en memoria
  const storage = multer.memoryStorage();

  // Configuración de multer
  const upload = multer({
    storage,
    fileFilter,
    limits: {
      fileSize: maxTamaño * 1024 * 1024,
      files: campos ? campos.reduce((t, c) => t + c.maxCount, 0) : maxImagenes,
    },
  });

  // Middleware principal
  return async (req, res, next) => {
    try {
      // 1. Subida de archivos
      const uploadMiddleware = campos
        ? upload.fields(campos)
        : upload.array(campoNombre, maxImagenes);

      await new Promise((resolve, reject) => {
        uploadMiddleware(req, res, (err) => (err ? reject(err) : resolve()));
      });

      // 2. Procesamiento de imágenes
      if (req.files) {
        const carpetaDestino = path.join(__dirname, "upload", destino);
        await fs.mkdir(carpetaDestino, { recursive: true });

        req.imagenesInfo = {
          carpetaDestino,
          archivos: [],
          porCampo: {},
        };

        const procesarArchivo = async (file, campo) => {
          const nombreUnico = `${Date.now()}_${Math.round(Math.random() * 1e9)}`;
          const extension =
            optimizacion.format || path.extname(file.originalname).slice(1);
          const nombreArchivo = `${nombreUnico}.${extension}`;
          const rutaCompleta = path.join(carpetaDestino, nombreArchivo);

          // Optimizar imagen
          const imagenOptimizada = await sharp(file.buffer)
            .resize(optimizacion.width, optimizacion.height, {
              fit: "inside",
              withoutEnlargement: true,
            })
            [optimizacion.format]({ quality: optimizacion.quality })
            .toBuffer();

          // Guardar a disco
          await fs.writeFile(rutaCompleta, imagenOptimizada);

          return {
            campo,
            nombreOriginal: file.originalname,
            nombreArchivo,
            ruta: rutaCompleta,
            tamañoOriginal: file.size,
            tamañoOptimizado: imagenOptimizada.length,
            mimetype: `image/${optimizacion.format}`,
          };
        };

        // Procesar todos los archivos en paralelo
        if (campos) {
          for (const [campo, archivos] of Object.entries(req.files)) {
            req.imagenesInfo.porCampo[campo] = {
              cantidad: archivos.length,
              archivos: await Promise.all(
                archivos.map((f) => procesarArchivo(f, campo))
              ),
            };
            req.imagenesInfo.archivos.push(
              ...req.imagenesInfo.porCampo[campo].archivos
            );
          }
        } else {
          req.imagenesInfo.archivos = await Promise.all(
            req.files.map((f) => procesarArchivo(f, campoNombre))
          );
          req.imagenesInfo.cantidad = req.imagenesInfo.archivos.length;
        }
      }

      next();
    } catch (error) {
      manejarErrores(
        error,
        res,
        maxTamaño,
        maxImagenes || campos?.reduce((t, c) => t + c.maxCount, 0),
        campoNombre
      );
    }
  };
};

// Función de manejo de errores (mejorada)
const manejarErrores = (error, res, maxTamaño, maxImagenes, campoNombre) => {
  const errores = {
    LIMIT_FILE_SIZE: {
      status: 413,
      error: "Archivo demasiado grande",
      mensaje: `El tamaño máximo permitido es ${maxTamaño}MB`,
    },
    LIMIT_FILE_COUNT: {
      status: 413,
      error: "Demasiados archivos",
      mensaje: `Máximo ${maxImagenes} imágenes permitidas`,
    },
    LIMIT_UNEXPECTED_FILE: {
      status: 400,
      error: "Campo incorrecto",
      mensaje: campoNombre
        ? `Use el campo '${campoNombre}'`
        : "Campo no válido",
    },
  };

  const respuesta =
    error instanceof multer.MulterError
      ? errores[error.code] || {
          status: 400,
          error: "Error de carga",
          mensaje: error.message,
        }
      : { status: 400, error: "Error de validación", mensaje: error.message };

  res.status(respuesta.status).json(respuesta);
};
