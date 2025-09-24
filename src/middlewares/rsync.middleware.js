// =============================================================================
// src/middlewares/rsync.middleware.js
// Middleware reutilizable para sincronización automática con RSync
// GADM Cantón Esmeraldas - Módulo de Expediente Digital
// =============================================================================

import fs from "fs/promises";
import path from "path";

/**
 * Middleware configurable para sincronización automática con RSync
 * @param {Object} options - Opciones de configuración
 * @param {string} [options.remoteBasePath] - Ruta base remota personalizada
 * @param {Function} [options.pathBuilder] - Función para construir rutas dinámicas
 * @param {string} [options.priority='NORMAL'] - Prioridad de transferencia
 * @param {boolean} [options.createRemoteDir=true] - Crear directorio remoto si no existe
 * @param {boolean} [options.verifyTransfer=true] - Verificar integridad de transferencia
 * @param {boolean} [options.failOnError=false] - Fallar request completo si rsync falla
 * @param {boolean} [options.enabled=true] - Habilitar/deshabilitar rsync
 * @param {Function} [options.onSuccess] - Callback ejecutado después de transferencia exitosa
 * @param {Function} [options.onError] - Callback ejecutado en caso de error
 * @param {boolean} [options.keepTempFiles=false] - Mantener archivos temporales para debug
 * @returns {Function} Middleware configurado
 */
/**
 * Middleware configurable para sincronización automática con RSync
 * @param {Object} options - Opciones de configuración
 * @param {Function} [options.fileNameBuilder] - Función para generar nombres de archivos consistentes
 */
export const createRsyncMiddleware = (options = {}) => {
  const {
    remoteBasePath,
    pathBuilder,
    fileNameBuilder, // Nueva opción para nombres consistentes
    priority = "NORMAL",
    createRemoteDir = true,
    verifyTransfer = true,
    failOnError = false,
    enabled = process.env.RSYNC_ENABLED !== "false",
    onSuccess,
    onError,
    keepTempFiles = process.env.NODE_ENV === "development" &&
      process.env.RSYNC_KEEP_TEMP === "true",
  } = options;

  return async (req, res, next) => {
    // Si rsync está deshabilitado, continuar sin procesamiento
    if (!enabled) {
      console.log("🔄 RSync deshabilitado, saltando sincronización");
      req.rsyncResults = { enabled: false, reason: "disabled" };
      return next();
    }

    // Solo procesar si hay archivos
    if (!req.files || req.files.length === 0) {
      console.log("📭 No hay archivos para sincronizar con rsync");
      req.rsyncResults = { enabled: false, reason: "no_files" };
      return next();
    }

    let rsyncClient;

    try {
      console.log(
        `🔄 Iniciando middleware rsync para ${req.files.length} archivo(s)`
      );

      // Importar cliente rsync dinámicamente
      rsyncClient = (await import("../config/rsync.client.js")).default;

      // Construir ruta remota
      const remotePath = await buildRemotePath(
        req,
        remoteBasePath,
        pathBuilder
      );
      console.log(`📂 Ruta remota determinada: ${remotePath}`);

      // Procesar archivos con nombres consistentes
      const rsyncResults = await processFilesWithConsistentNames(
        req.files,
        remotePath,
        rsyncClient,
        {
          priority,
          createRemoteDir,
          verifyTransfer,
          keepTempFiles,
          fileNameBuilder, // Pasar función de nombres consistentes
        }
      );

      // Agregar resultados al request
      req.rsyncResults = {
        enabled: true,
        remotePath,
        results: rsyncResults,
        summary: {
          total: req.files.length,
          successful: rsyncResults.filter((r) => r.success).length,
          failed: rsyncResults.filter((r) => !r.success).length,
        },
        timestamp: new Date().toISOString(),
      };

      // Log resumen
      const { successful, failed } = req.rsyncResults.summary;
      console.log(
        `📊 RSync completado: ${successful} exitosos, ${failed} fallidos`
      );

      // Ejecutar callback de éxito si hay transferencias exitosas
      if (successful > 0 && onSuccess) {
        try {
          await onSuccess(
            req,
            rsyncResults.filter((r) => r.success)
          );
        } catch (callbackError) {
          console.warn("⚠️ Error en callback onSuccess:", callbackError);
        }
      }

      // Si hay errores y se debe fallar el request completo
      if (failed > 0 && failOnError) {
        const errors = rsyncResults
          .filter((r) => !r.success)
          .map((r) => r.error);
        const error = new Error(
          `RSync falló para ${failed} archivo(s): ${errors.join(", ")}`
        );
        error.statusCode = 500;
        error.code = "RSYNC_FAILURE";
        throw error;
      }

      next();
    } catch (error) {
      console.error("❌ Error en middleware rsync:", error);

      // Preparar información de error
      req.rsyncResults = {
        enabled: true,
        error: error.message,
        timestamp: new Date().toISOString(),
        summary: {
          total: req.files.length,
          successful: 0,
          failed: req.files.length,
        },
      };

      // Ejecutar callback de error
      if (onError) {
        try {
          await onError(req, error);
        } catch (callbackError) {
          console.warn("⚠️ Error en callback onError:", callbackError);
        }
      }

      // Decidir si fallar el request o continuar
      if (failOnError) {
        error.statusCode = error.statusCode || 500;
        error.code = error.code || "RSYNC_MIDDLEWARE_ERROR";
        return next(error);
      } else {
        // Continuar sin fallar - rsync es complementario
        console.log(
          "⚠️ Continuando sin rsync debido a error, pero almacenamiento local procederá"
        );
        next();
      }
    }
  };
};

/**
 * Procesar archivos individuales con nombres consistentes
 * @private
 */
async function processFilesWithConsistentNames(
  files,
  remotePath,
  rsyncClient,
  options
) {
  const {
    priority,
    createRemoteDir,
    verifyTransfer,
    keepTempFiles,
    fileNameBuilder,
  } = options;
  const results = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    let tempFilePath = null;

    try {
      console.log(
        `📤 Procesando archivo ${i + 1}/${files.length}: ${file.originalname}`
      );

      // Generar nombre consistente si se proporciona función
      const consistentFileName = fileNameBuilder
        ? fileNameBuilder(file, i)
        : `${Date.now()}_${Math.random().toString(36).substring(7)}_${file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_")}`;

      // Crear archivo temporal con nombre consistente
      tempFilePath = await createTempFileWithConsistentName(
        file,
        rsyncClient.config.tempDir,
        consistentFileName
      );

      // Transferir archivo con el nombre consistente
      const transferResult = await rsyncClient.transferFile(
        tempFilePath,
        remotePath,
        {
          priority,
          createRemoteDir,
          verifyTransfer,
          destinationFileName: consistentFileName, // Usar nombre consistente en destino
        }
      );

      results.push({
        file: file.originalname,
        systemName: consistentFileName, // Incluir nombre del sistema
        success: transferResult.success,
        remotePath: transferResult.remotePath,
        remoteFileName: consistentFileName,
        size: file.size,
        mimeType: file.mimetype,
        transferTime: transferResult.transferTime,
        verified: transferResult.verified,
      });

      console.log(
        `✅ ${file.originalname} -> ${consistentFileName} sincronizado exitosamente`
      );
    } catch (error) {
      console.error(`❌ Error procesando ${file.originalname}:`, error);

      results.push({
        file: file.originalname,
        systemName: fileNameBuilder ? fileNameBuilder(file, i) : null,
        success: false,
        error: error.message,
        size: file.size,
        mimeType: file.mimetype,
      });
    } finally {
      // Limpiar archivo temporal
      if (tempFilePath && !keepTempFiles) {
        try {
          await fs.unlink(tempFilePath);
        } catch (cleanupError) {
          console.warn(
            `⚠️ No se pudo eliminar archivo temporal ${tempFilePath}:`,
            cleanupError
          );
        }
      } else if (tempFilePath && keepTempFiles) {
        console.log(`🗂️ Archivo temporal conservado: ${tempFilePath}`);
      }
    }
  }

  return results;
}

/**
 * Crear archivo temporal con nombre consistente
 * @private
 */
async function createTempFileWithConsistentName(
  file,
  tempDir,
  consistentFileName
) {
  const tempFilePath = path.join(tempDir, consistentFileName);

  // Escribir contenido del archivo
  await fs.writeFile(tempFilePath, file.buffer);

  console.log(
    `📝 Archivo temporal creado con nombre consistente: ${consistentFileName}`
  );
  return tempFilePath;
}

/**
 * Construir ruta remota basada en el request
 * @private
 */
async function buildRemotePath(req, remoteBasePath, pathBuilder) {
  if (pathBuilder && typeof pathBuilder === "function") {
    // Usar función personalizada para construir ruta
    return await pathBuilder(req);
  }

  if (remoteBasePath) {
    // Usar ruta base personalizada
    return remoteBasePath;
  }

  // Ruta por defecto basada en la ruta del endpoint
  const routeParts = req.route.path
    .split("/")
    .filter((part) => part && !part.startsWith(":"));
  const year = new Date().getFullYear();
  const month = String(new Date().getMonth() + 1).padStart(2, "0");

  return `${routeParts.join("/")}/${year}/${month}`;
}

/**
 * Procesar archivos individuales
 * @private
 */
async function processFiles(files, remotePath, rsyncClient, options) {
  const { priority, createRemoteDir, verifyTransfer, keepTempFiles } = options;
  const results = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    let tempFilePath = null;

    try {
      console.log(
        `📤 Procesando archivo ${i + 1}/${files.length}: ${file.originalname}`
      );

      // Crear archivo temporal
      tempFilePath = await createTempFile(file, rsyncClient.config.tempDir);

      // Transferir archivo
      const transferResult = await rsyncClient.transferFile(
        tempFilePath,
        remotePath,
        {
          priority,
          createRemoteDir,
          verifyTransfer,
        }
      );

      results.push({
        file: file.originalname,
        success: transferResult.success,
        remotePath: transferResult.remotePath,
        size: file.size,
        mimeType: file.mimetype,
        transferTime: transferResult.transferTime,
        verified: transferResult.verified,
      });

      console.log(`✅ ${file.originalname} sincronizado exitosamente`);
    } catch (error) {
      console.error(`❌ Error procesando ${file.originalname}:`, error);

      results.push({
        file: file.originalname,
        success: false,
        error: error.message,
        size: file.size,
        mimeType: file.mimetype,
      });
    } finally {
      // Limpiar archivo temporal
      if (tempFilePath && !keepTempFiles) {
        try {
          await fs.unlink(tempFilePath);
        } catch (cleanupError) {
          console.warn(
            `⚠️ No se pudo eliminar archivo temporal ${tempFilePath}:`,
            cleanupError
          );
        }
      } else if (tempFilePath && keepTempFiles) {
        console.log(`🗂️ Archivo temporal conservado: ${tempFilePath}`);
      }
    }
  }

  return results;
}

/**
 * Crear archivo temporal para transferencia
 * @private
 */
async function createTempFile(file, tempDir) {
  // Generar nombre único para archivo temporal
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(7);
  const extension = path.extname(file.originalname);
  const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_");

  const tempFileName = `rsync_${timestamp}_${randomStr}_${sanitizedName}`;
  const tempFilePath = path.join(tempDir, tempFileName);

  // Escribir contenido del archivo
  await fs.writeFile(tempFilePath, file.buffer);

  console.log(`📝 Archivo temporal creado: ${tempFileName}`);
  return tempFilePath;
}

// =============================================================================
// MIDDLEWARE RSYNC MEJORADO PARA DOCUMENTOS DE CONTRATOS
// =============================================================================

/**
 * Middleware preconfigurado para documentos de contratos
 * Corrige la nomenclatura y estructura de archivos
 */
export const rsyncContractDocuments = createRsyncMiddleware({
  pathBuilder: async (req) => {
    const contractId = req.params.contractId;
    const year = new Date().getFullYear();

    // Obtener información de la fase desde la BD
    let phaseName = "general";
    let documentType = "OTROS";

    if (req.body.phase) {
      try {
        // Si phase es un ObjectId, buscar el nombre de la fase
        if (
          typeof req.body.phase === "string" &&
          req.body.phase.match(/^[0-9a-fA-F]{24}$/)
        ) {
          const { ContractPhaseService } = await import(
            "../services/contract-phase.service.js"
          );
          const phaseService = new ContractPhaseService();
          const phase = await phaseService.getPhaseById(req.body.phase);
          phaseName = phase?.code || phase?.name || "general";
        } else {
          // Si es un string, usarlo directamente pero sanitizado
          phaseName = req.body.phase.toString().replace(/[^a-zA-Z0-9-_]/g, "_");
        }
      } catch (error) {
        console.warn(
          `⚠️ No se pudo obtener información de la fase: ${error.message}`
        );
        phaseName =
          req.body.phase?.toString()?.replace(/[^a-zA-Z0-9-_]/g, "_") ||
          "general";
      }
    }

    if (req.body.documentType) {
      documentType = req.body.documentType
        .toString()
        .replace(/[^a-zA-Z0-9-_]/g, "_");
    }

    // Estructura mejorada: contratos/{contractId}/{year}/{phase}/{documentType}
    return `expediente_data/expedientes/contratos/${contractId}/${year}/${phaseName}/${documentType}`;
  },

  priority: "HIGH",

  // Función personalizada para generar nombres de archivos consistentes
  fileNameBuilder: (file, index) => {
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    const extension = path.extname(file.originalname);
    const baseName = path
      .basename(file.originalname, extension)
      .replace(/[^a-zA-Z0-9-_]/g, "_")
      .substring(0, 50); // Limitar longitud

    // Formato consistente: {timestamp}_{random}_{baseName}{extension}
    return `${timestamp}_${randomStr}_${baseName}${extension}`;
  },

  // Callback después de sincronización exitosa
  onSuccess: async (req, successfulFiles) => {
    console.log(
      `📋 Documentos de contrato ${req.params.contractId} sincronizados: ${successfulFiles.length} archivos`
    );

    // Opcional: Actualizar registros en BD con información de rsync
    try {
      for (const fileResult of successfulFiles) {
        // Aquí podrías actualizar el registro del archivo con la información de rsync
        console.log(
          `✅ Archivo sincronizado: ${fileResult.file} -> ${fileResult.remotePath}`
        );
      }
    } catch (error) {
      console.warn("⚠️ Error actualizando información de rsync en BD:", error);
    }
  },

  // Callback en caso de error
  onError: async (req, error) => {
    console.error(
      `❌ Error sincronizando documentos del contrato ${req.params.contractId}:`,
      error.message
    );

    // Opcional: Registrar error en auditoría
    // await auditService.logError('RSYNC_FAILURE', { contractId: req.params.contractId, error: error.message });
  },

  // Configuraciones adicionales
  verifyTransfer: true,
  createRemoteDir: true,
  failOnError: false, // No fallar el request si rsync falla
});

/**
 * Función auxiliar para crear archivo temporal con nombre consistente
 * Esta función se integra con createTempFile del middleware base
 */
async function createConsistentTempFile(file, tempDir, customFileName) {
  const tempFilePath = path.join(tempDir, customFileName);

  // Escribir contenido del archivo
  await fs.writeFile(tempFilePath, file.buffer);

  console.log(
    `📝 Archivo temporal creado con nombre consistente: ${customFileName}`
  );
  return tempFilePath;
}

/**
 * Función para sincronizar nombres entre rsync y base de datos
 * Esta función debe llamarse desde el controller después de subir el archivo
 */
export const syncFileNamesWithRsync = async (fileRecord, rsyncResult) => {
  if (rsyncResult && rsyncResult.success) {
    // Actualizar registro del archivo con información de rsync
    await fileRecord.updateOne({
      "rsyncInfo.remoteFileName": rsyncResult.remoteFileName,
      "rsyncInfo.remotePath": rsyncResult.remotePath,
      "rsyncInfo.syncStatus": "SYNCED",
      "rsyncInfo.lastSyncSuccess": new Date(),
    });

    console.log(
      `🔄 Registro actualizado con información de rsync para: ${fileRecord.originalName}`
    );
  }
};

/**
 * Middleware preconfigurado para archivos generales
 */
export const rsyncGeneralFiles = createRsyncMiddleware({
  pathBuilder: (req) => {
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, "0");
    return `archivos-generales/${year}/${month}`;
  },
  priority: "NORMAL",
});

/**
 * Middleware preconfigurado para documentos departamentales
 */
export const rsyncDepartmentDocuments = createRsyncMiddleware({
  pathBuilder: (req) => {
    const departmentId =
      req.params.departmentId || req.body.departmentId || "general";
    const year = new Date().getFullYear();
    return `departamentos/${departmentId}/${year}`;
  },
  priority: "NORMAL",
});

/**
 * Middleware preconfigurado para respaldos críticos
 */
export const rsyncCriticalBackup = createRsyncMiddleware({
  pathBuilder: (req) => {
    const timestamp = new Date().toISOString().split("T")[0];
    return `respaldos-criticos/${timestamp}`;
  },
  priority: "HIGH",
  verifyTransfer: true,
  failOnError: true, // Fallar si el respaldo crítico no se puede sincronizar
});

// =============================================================================
// UTILIDADES PARA RESPUESTAS
// =============================================================================

/**
 * Agregar información de rsync a la respuesta JSON
 * @param {Object} responseData - Datos de respuesta existentes
 * @param {Object} req - Request object con rsyncResults
 * @returns {Object} Datos de respuesta con información de rsync
 */
export const addRsyncToResponse = (responseData, req) => {
  if (req.rsyncResults) {
    responseData.rsync = req.rsyncResults;
  }
  return responseData;
};

/**
 * Middleware para agregar automáticamente información de rsync a respuestas JSON
 */
export const autoAddRsyncResponse = (req, res, next) => {
  // Interceptar res.json para agregar información de rsync automáticamente
  const originalJson = res.json;

  res.json = function (data) {
    if (req.rsyncResults && data && typeof data === "object") {
      data = addRsyncToResponse(data, req);
    }
    return originalJson.call(this, data);
  };

  next();
};

export default {
  createRsyncMiddleware,
  rsyncContractDocuments,
  rsyncGeneralFiles,
  rsyncDepartmentDocuments,
  rsyncCriticalBackup,
  addRsyncToResponse,
  autoAddRsyncResponse,
};
