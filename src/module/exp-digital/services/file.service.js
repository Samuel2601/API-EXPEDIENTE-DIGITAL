// =============================================================================
// src/module/exp-digital/services/file.service.js
// Servicio completo para gestión de archivos del expediente digital
// GADM Cantón Esmeraldas - Integración con repositorio rsync
// =============================================================================

import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import sharp from "sharp";
import { FileRepository } from "../repositories/file.repository.js";
import rsyncClient from "../../../config/rsync.client.js";
import {
  createError,
  createValidationError,
  ERROR_CODES,
} from "../../../utils/error.util.js";
import {
  validateObjectId,
  validateFile,
  validateRequiredFields,
  validateEnum,
  ALLOWED_FILE_TYPES,
  FILE_SIZE_LIMITS,
} from "../../../../utils/validation.util.js";

export class FileService {
  constructor() {
    this.fileRepository = new FileRepository();

    // Configuración desde variables de entorno
    this.config = {
      uploadPath: process.env.UPLOAD_PATH || "./uploads",
      maxFileSize:
        parseInt(process.env.MAX_FILE_SIZE) || FILE_SIZE_LIMITS.LARGE,
      allowedTypes:
        process.env.ALLOWED_FILE_TYPES?.split(",") || ALLOWED_FILE_TYPES.ALL,
      rsyncEnabled: process.env.RSYNC_ENABLED === "true",
      autoSync: process.env.RSYNC_AUTO_SYNC !== "false", // Por defecto true
      imageOptimization: {
        maxWidth: parseInt(process.env.IMAGE_MAX_WIDTH) || 1920,
        maxHeight: parseInt(process.env.IMAGE_MAX_HEIGHT) || 1080,
        quality: parseInt(process.env.IMAGE_QUALITY) || 85,
        format: process.env.IMAGE_FORMAT || "webp",
      },
    };
  }

  // =============================================================================
  // MÉTODOS PRINCIPALES DE ARCHIVOS
  // =============================================================================

  /**
   * Subir archivo al sistema con validaciones completas
   * @param {Object} fileData - Datos del archivo
   * @param {Object} userData - Información del usuario
   * @param {Object} options - Opciones de subida
   * @returns {Promise<Object>} Archivo creado
   */
  async uploadFile(fileData, userData, options = {}) {
    try {
      const {
        contractId,
        phaseId,
        documentType,
        description,
        isPublic = false,
        allowedRoles = [],
        autoSync = this.config.autoSync,
        priority = "NORMAL",
        keepLocal = false,
      } = options;

      // Validaciones básicas
      await this._validateUploadData(
        fileData,
        contractId,
        phaseId,
        documentType
      );

      // Verificar que el archivo temporal existe
      if (!fileData.buffer && !fileData.tempPath) {
        throw createError(
          ERROR_CODES.MISSING_FIELDS,
          "Se requiere el buffer o ruta temporal del archivo",
          400
        );
      }

      console.log(`📤 Iniciando subida de archivo: ${fileData.originalName}`);

      // Generar nombres y rutas
      const fileInfo = await this._prepareFileInfo(
        fileData,
        contractId,
        phaseId
      );

      // Optimizar imagen si es necesario
      if (this._isImage(fileData.mimeType)) {
        await this._optimizeImage(fileInfo);
      }

      // Mover archivo a ubicación final
      await this._saveFile(fileInfo);

      // Calcular hash del archivo
      const hash = await this._calculateFileHash(fileInfo.finalPath);

      // Verificar duplicados
      const existingFile = await this.fileRepository.findByHash(hash);
      if (existingFile) {
        // Limpiar archivo temporal
        await this._cleanupTempFile(fileInfo.finalPath);

        throw createError(
          ERROR_CODES.DUPLICATE_ENTRY,
          `Ya existe un archivo con el mismo contenido: ${existingFile.systemName}`,
          409,
          { existingFileId: existingFile._id }
        );
      }

      // Extraer metadatos del archivo
      const metadata = await this._extractMetadata(fileInfo);

      // Preparar documento para base de datos
      const fileDocument = {
        contract: contractId,
        phase: phaseId,
        documentType: documentType.toUpperCase(),
        description: description || "",

        // Nombres y sistema
        originalName: fileData.originalName,
        systemName: fileInfo.systemName,
        displayName: fileData.displayName || fileData.originalName,

        // Almacenamiento
        storage: {
          path: fileInfo.finalPath,
          relativePath: fileInfo.relativePath,
          storageProvider: this.config.rsyncEnabled ? "RSYNC" : "LOCAL",
          bucket: null,
          region: null,
        },

        // Información del archivo
        fileInfo: {
          fileType: fileInfo.extension.substring(1), // Sin el punto
          mimeType: fileData.mimeType,
          size: fileInfo.size,
          hash: hash,
          checksum: hash, // Misma información
        },

        // Metadatos extraídos
        metadata: metadata,

        // Control de versiones
        versionInfo: {
          version: 1,
          isCurrentVersion: true,
          versionNotes: "Versión inicial",
          changeType: "MINOR",
        },

        // Control de acceso
        access: {
          isPublic: isPublic,
          allowedRoles: allowedRoles,
          allowedUsers: [],
          downloadCount: 0,
          viewCount: 0,
        },

        // Auditoría
        audit: {
          uploadedBy: userData.userId,
          uploadDate: new Date(),
          ipAddress: userData.ipAddress || null,
          userAgent: userData.userAgent || null,
        },

        // Estado del archivo
        status: "ACTIVE",
        isActive: true,
      };

      // Configurar rsync si está habilitado
      if (this.config.rsyncEnabled) {
        fileDocument.rsyncInfo = {
          remoteHost: process.env.RSYNC_REMOTE_HOST,
          remotePath: `${process.env.RSYNC_REMOTE_PATH}/${contractId}/${phaseId}`,
          remoteFileName: fileInfo.systemName,
          syncStatus: "PENDING",
          priority: priority,
          autoSync: autoSync,
          keepLocal: keepLocal,
          maxRetries: 3,
          syncRetries: 0,
        };
      }

      // Crear registro en base de datos
      const createdFile = await this.fileRepository.create(fileDocument);

      console.log(`✅ Archivo subido exitosamente: ${createdFile.systemName}`);

      // Programar sincronización automática si está habilitada
      if (this.config.rsyncEnabled && autoSync) {
        setTimeout(() => {
          this._syncFileAsync(createdFile._id).catch((error) => {
            console.error(
              `❌ Error en sincronización automática: ${error.message}`
            );
          });
        }, 1000); // Delay de 1 segundo
      }

      return {
        fileId: createdFile._id,
        systemName: createdFile.systemName,
        originalName: createdFile.originalName,
        size: createdFile.fileInfo.size,
        hash: createdFile.fileInfo.hash,
        uploadDate: createdFile.audit.uploadDate,
        status: createdFile.status,
        syncStatus: createdFile.rsyncInfo?.syncStatus || null,
        downloadUrl: `/api/files/${createdFile._id}/download`,
        metadata: {
          contractId,
          phaseId,
          documentType,
          isRsyncEnabled: this.config.rsyncEnabled,
        },
      };
    } catch (error) {
      console.error(`❌ Error subiendo archivo: ${error.message}`);
      throw error;
    }
  }

  /**
   * Descargar archivo desde el sistema
   * @param {String} fileId - ID del archivo
   * @param {Object} userData - Datos del usuario que descarga
   * @param {Object} options - Opciones de descarga
   * @returns {Promise<Object>} Información del archivo y stream
   */
  async downloadFile(fileId, userData, options = {}) {
    try {
      validateObjectId(fileId, "ID del archivo");

      const { source = "auto", updateStats = true } = options;

      console.log(`📥 Iniciando descarga de archivo: ${fileId}`);

      // Obtener información del archivo
      const file = await this.fileRepository.findById(fileId, {
        populate: ["contractInfo", "phaseInfo", "uploaderInfo"],
      });

      if (!file) {
        throw createError(ERROR_CODES.NOT_FOUND, "Archivo no encontrado", 404);
      }

      // Verificar permisos de acceso
      if (!file.canUserAccess(userData.userId, userData.role)) {
        throw createError(
          ERROR_CODES.FORBIDDEN,
          "No tiene permisos para descargar este archivo",
          403
        );
      }

      // Verificar disponibilidad del archivo
      if (!file.isAvailable()) {
        throw createError(
          ERROR_CODES.NOT_FOUND,
          "Archivo no disponible. Puede estar en proceso de sincronización",
          503,
          { syncStatus: file.rsyncInfo?.syncStatus }
        );
      }

      let filePath;
      let downloadSource;

      // Determinar fuente de descarga
      if (
        source === "remote" ||
        (source === "auto" &&
          file.storage.storageProvider === "RSYNC" &&
          file.rsyncInfo?.syncStatus === "SYNCED")
      ) {
        // Descargar desde servidor remoto
        downloadSource = "remote";
        // Para rsync, necesitaríamos implementar descarga remota
        // Por ahora, fallar back a local si existe
        if (file.rsyncInfo?.keepLocal) {
          filePath = file.storage.path;
          downloadSource = "local";
        } else {
          throw createError(
            ERROR_CODES.NOT_FOUND,
            "Archivo remoto no accesible directamente. Use descarga local",
            503
          );
        }
      } else {
        // Descargar desde almacenamiento local
        filePath = file.storage.path;
        downloadSource = "local";
      }

      // Verificar que el archivo existe físicamente
      try {
        await fs.access(filePath);
      } catch (error) {
        throw createError(
          ERROR_CODES.NOT_FOUND,
          "Archivo físico no encontrado en el almacenamiento",
          404,
          { filePath, downloadSource }
        );
      }

      // Actualizar estadísticas si se solicita
      if (updateStats) {
        await this._updateDownloadStats(file, userData);
      }

      console.log(
        `✅ Descarga autorizada para: ${file.systemName} (${downloadSource})`
      );

      // Retornar información para el stream
      return {
        filePath,
        fileName: file.displayName || file.originalName,
        mimeType: file.fileInfo.mimeType,
        size: file.fileInfo.size,
        downloadSource,
        file: {
          id: file._id,
          systemName: file.systemName,
          originalName: file.originalName,
          displayName: file.displayName,
          documentType: file.documentType,
          uploadDate: file.audit.uploadDate,
          contractInfo: file.contractInfo?.[0] || null,
          phaseInfo: file.phaseInfo?.[0] || null,
        },
      };
    } catch (error) {
      console.error(`❌ Error descargando archivo: ${error.message}`);
      throw error;
    }
  }

  // =============================================================================
  // MÉTODOS DE RSYNC Y SINCRONIZACIÓN
  // =============================================================================

  /**
   * Sincronizar archivo específico con rsync
   * @param {String} fileId - ID del archivo
   * @param {Object} options - Opciones de sincronización
   * @returns {Promise<Object>} Resultado de la sincronización
   */
  async syncFile(fileId, options = {}) {
    try {
      validateObjectId(fileId, "ID del archivo");

      if (!this.config.rsyncEnabled) {
        throw createError(
          ERROR_CODES.CONFIG_ERROR,
          "Rsync no está habilitado en la configuración",
          503
        );
      }

      const { forcePriority = null, resetRetries = false } = options;

      console.log(`🔄 Sincronizando archivo: ${fileId}`);

      return await this.fileRepository.forceSyncFile(fileId, {
        updatePriority: !!forcePriority,
        newPriority: forcePriority || "HIGH",
        resetRetries,
      });
    } catch (error) {
      console.error(`❌ Error sincronizando archivo: ${error.message}`);
      throw error;
    }
  }

  /**
   * Procesar cola de sincronización rsync
   * @param {Object} options - Opciones de procesamiento
   * @returns {Promise<Object>} Resultado del procesamiento
   */
  async processRsyncQueue(options = {}) {
    try {
      if (!this.config.rsyncEnabled) {
        throw createError(
          ERROR_CODES.CONFIG_ERROR,
          "Rsync no está habilitado en la configuración",
          503
        );
      }

      const { batchSize = 10, priorityFirst = true } = options;

      console.log(`⚡ Procesando cola rsync (lote: ${batchSize})`);

      // Obtener archivos pendientes
      const pendingFiles = await this.fileRepository.findPendingSync({
        limit: batchSize,
        sort: priorityFirst
          ? { "rsyncInfo.priority": -1, createdAt: 1 }
          : { createdAt: 1 },
      });

      if (pendingFiles.length === 0) {
        console.log("📭 No hay archivos pendientes de sincronización");
        return {
          processed: 0,
          successful: 0,
          failed: 0,
          results: [],
          message: "No hay archivos pendientes",
        };
      }

      const results = [];
      let successful = 0;
      let failed = 0;

      // Procesar cada archivo
      for (const file of pendingFiles) {
        try {
          console.log(`🔄 Procesando: ${file.systemName}`);

          // Usar el método del esquema para sincronizar
          await file.syncToRsync();

          results.push({
            fileId: file._id,
            systemName: file.systemName,
            success: true,
            syncStatus: "SYNCED",
          });
          successful++;

          console.log(`✅ Sincronizado: ${file.systemName}`);
        } catch (error) {
          console.error(
            `❌ Error sincronizando ${file.systemName}: ${error.message}`
          );

          results.push({
            fileId: file._id,
            systemName: file.systemName,
            success: false,
            error: error.message,
            syncStatus: "FAILED",
          });
          failed++;
        }
      }

      const summary = {
        processed: results.length,
        successful,
        failed,
        successRate:
          results.length > 0
            ? ((successful / results.length) * 100).toFixed(2)
            : 0,
        results,
        timestamp: new Date().toISOString(),
      };

      console.log(
        `🎯 Cola procesada: ${successful}/${results.length} exitosos (${summary.successRate}%)`
      );

      return summary;
    } catch (error) {
      console.error(`❌ Error procesando cola rsync: ${error.message}`);
      throw error;
    }
  }

  /**
   * Reintentar archivos fallidos con reintentos disponibles
   * @param {Object} options - Opciones de reintento
   * @returns {Promise<Object>} Resultado de los reintentos
   */
  async retryFailedSyncs(options = {}) {
    try {
      if (!this.config.rsyncEnabled) {
        throw createError(
          ERROR_CODES.CONFIG_ERROR,
          "Rsync no está habilitado en la configuración",
          503
        );
      }

      const { limit = 5 } = options;

      console.log(`🔄 Reintentando archivos fallidos (límite: ${limit})`);

      return await this.fileRepository.retryFailedSyncs({ limit });
    } catch (error) {
      console.error(`❌ Error reintentando sincronizaciones: ${error.message}`);
      throw error;
    }
  }

  // =============================================================================
  // MÉTODOS DE GESTIÓN Y CONSULTAS
  // =============================================================================

  /**
   * Obtener archivos de un contrato con filtros
   * @param {String} contractId - ID del contrato
   * @param {Object} filters - Filtros de consulta
   * @returns {Promise<Object>} Lista de archivos paginada
   */
  async getContractFiles(contractId, filters = {}) {
    try {
      validateObjectId(contractId, "ID del contrato");

      const {
        phaseId = null,
        documentType = null,
        status = null,
        currentVersionOnly = true,
        page = 1,
        limit = 20,
        sortBy = "uploadDate",
        sortOrder = "desc",
      } = filters;

      console.log(`📋 Obteniendo archivos del contrato: ${contractId}`);

      const queryOptions = {
        phase: phaseId,
        documentType,
        status,
        currentVersionOnly,
      };

      // Usar el método del repositorio
      const files = await this.fileRepository.findByContract(
        contractId,
        queryOptions
      );

      // Aplicar paginación y ordenamiento
      const sortOptions = {};
      sortOptions[sortBy === "uploadDate" ? "audit.uploadDate" : sortBy] =
        sortOrder === "asc" ? 1 : -1;

      const query = this.fileRepository.model
        .find({ _id: { $in: files.map((f) => f._id) } })
        .populate([
          { path: "phase", select: "code name shortName category" },
          { path: "audit.uploadedBy", select: "name email" },
        ])
        .sort(sortOptions);

      const result = await this.fileRepository.paginate(query, { page, limit });

      // Enriquecer con información de sincronización
      const enrichedFiles = result.docs.map((file) => ({
        ...file.toObject(),
        downloadUrl: file.getAccessUrl(),
        isAvailable: file.isAvailable(),
        syncStatusDisplay: file.syncStatusDisplay,
        isRemoteAvailable: file.isRemoteAvailable,
      }));

      return {
        files: enrichedFiles,
        pagination: {
          currentPage: result.page,
          totalPages: result.totalPages,
          totalFiles: result.totalDocs,
          limit: result.limit,
          hasNext: result.hasNextPage,
          hasPrev: result.hasPrevPage,
        },
        filters: {
          contractId,
          phaseId,
          documentType,
          status,
          currentVersionOnly,
        },
        metadata: {
          generatedAt: new Date().toISOString(),
          rsyncEnabled: this.config.rsyncEnabled,
        },
      };
    } catch (error) {
      console.error(
        `❌ Error obteniendo archivos del contrato: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Obtener información detallada de un archivo
   * @param {String} fileId - ID del archivo
   * @param {Object} userData - Datos del usuario
   * @returns {Promise<Object>} Información completa del archivo
   */
  async getFileDetails(fileId, userData) {
    try {
      validateObjectId(fileId, "ID del archivo");

      const file = await this.fileRepository.findById(fileId, {
        populate: [
          "contractInfo",
          "phaseInfo",
          "uploaderInfo",
          {
            path: "versionInfo.previousVersion",
            select: "systemName versionInfo audit",
          },
        ],
      });

      if (!file) {
        throw createError(ERROR_CODES.NOT_FOUND, "Archivo no encontrado", 404);
      }

      // Verificar permisos de acceso
      if (!file.canUserAccess(userData.userId, userData.role)) {
        throw createError(
          ERROR_CODES.FORBIDDEN,
          "No tiene permisos para ver este archivo",
          403
        );
      }

      // Incrementar contador de visualizaciones
      await this.fileRepository.updateById(file._id, {
        $inc: { "access.viewCount": 1 },
        $set: { "audit.lastAccessDate": new Date() },
      });

      return {
        file: {
          id: file._id,
          systemName: file.systemName,
          originalName: file.originalName,
          displayName: file.displayName,
          description: file.description,
          documentType: file.documentType,
          status: file.status,

          // Información técnica
          fileInfo: file.fileInfo,
          metadata: file.metadata,

          // Información de versión
          versionInfo: file.versionInfo,

          // Control de acceso
          access: file.access,

          // Auditoría
          audit: file.audit,

          // URLs y disponibilidad
          downloadUrl: file.getAccessUrl(),
          isAvailable: file.isAvailable(),

          // Información de rsync
          rsyncInfo: file.rsyncInfo,
          syncStatusDisplay: file.syncStatusDisplay,
          isRemoteAvailable: file.isRemoteAvailable,

          // Información relacionada
          contractInfo: file.contractInfo?.[0] || null,
          phaseInfo: file.phaseInfo?.[0] || null,
          uploaderInfo: file.uploaderInfo?.[0] || null,
        },
        permissions: {
          canDownload: true, // Ya verificamos acceso arriba
          canEdit:
            userData.userId.toString() === file.audit.uploadedBy.toString() ||
            userData.role === "admin",
          canDelete:
            userData.userId.toString() === file.audit.uploadedBy.toString() ||
            userData.role === "admin",
          canSync:
            this.config.rsyncEnabled &&
            (userData.role === "admin" || userData.role === "technical"),
        },
        metadata: {
          requestedAt: new Date().toISOString(),
          requestedBy: userData.userId,
          rsyncEnabled: this.config.rsyncEnabled,
        },
      };
    } catch (error) {
      console.error(
        `❌ Error obteniendo detalles del archivo: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Obtener estadísticas de archivos y rsync
   * @param {Object} filters - Filtros para las estadísticas
   * @returns {Promise<Object>} Estadísticas completas
   */
  async getFileStatistics(filters = {}) {
    try {
      const {
        contractId = null,
        phaseId = null,
        dateFrom = null,
        dateTo = null,
      } = filters;

      console.log("📊 Generando estadísticas de archivos...");

      // Construir query base
      let matchQuery = { isActive: true };

      if (contractId) matchQuery.contract = contractId;
      if (phaseId) matchQuery.phase = phaseId;

      if (dateFrom || dateTo) {
        matchQuery["audit.uploadDate"] = {};
        if (dateFrom) matchQuery["audit.uploadDate"].$gte = new Date(dateFrom);
        if (dateTo) matchQuery["audit.uploadDate"].$lte = new Date(dateTo);
      }

      // Estadísticas generales
      const generalStats = await this.fileRepository.model.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: null,
            totalFiles: { $sum: 1 },
            totalSize: { $sum: "$fileInfo.size" },
            avgSize: { $avg: "$fileInfo.size" },
            maxSize: { $max: "$fileInfo.size" },
            minSize: { $min: "$fileInfo.size" },
          },
        },
      ]);

      // Estadísticas por tipo de documento
      const byDocumentType = await this.fileRepository.model.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: "$documentType",
            count: { $sum: 1 },
            totalSize: { $sum: "$fileInfo.size" },
          },
        },
        { $sort: { count: -1 } },
      ]);

      // Estadísticas por tipo de archivo
      const byFileType = await this.fileRepository.model.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: "$fileInfo.fileType",
            count: { $sum: 1 },
            totalSize: { $sum: "$fileInfo.size" },
          },
        },
        { $sort: { count: -1 } },
      ]);

      // Estadísticas de rsync si está habilitado
      let rsyncStats = null;
      if (this.config.rsyncEnabled) {
        const rsyncQuery = {
          ...matchQuery,
          "storage.storageProvider": "RSYNC",
        };

        rsyncStats = await this.fileRepository.model.aggregate([
          { $match: rsyncQuery },
          {
            $group: {
              _id: "$rsyncInfo.syncStatus",
              count: { $sum: 1 },
              totalSize: { $sum: "$fileInfo.size" },
              avgRetries: { $avg: "$rsyncInfo.syncRetries" },
            },
          },
        ]);
      }

      // Estadísticas de actividad (últimos 30 días)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const activityStats = await this.fileRepository.model.aggregate([
        {
          $match: {
            ...matchQuery,
            "audit.uploadDate": { $gte: thirtyDaysAgo },
          },
        },
        {
          $group: {
            _id: {
              year: { $year: "$audit.uploadDate" },
              month: { $month: "$audit.uploadDate" },
              day: { $dayOfMonth: "$audit.uploadDate" },
            },
            count: { $sum: 1 },
            size: { $sum: "$fileInfo.size" },
          },
        },
        { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } },
      ]);

      return {
        general: generalStats[0] || {
          totalFiles: 0,
          totalSize: 0,
          avgSize: 0,
          maxSize: 0,
          minSize: 0,
        },
        byDocumentType,
        byFileType,
        rsyncStats: rsyncStats || [],
        activityStats,
        metadata: {
          filters,
          generatedAt: new Date().toISOString(),
          rsyncEnabled: this.config.rsyncEnabled,
          period: "Last 30 days for activity",
        },
      };
    } catch (error) {
      console.error(`❌ Error obteniendo estadísticas: ${error.message}`);
      throw createError(
        ERROR_CODES.STATISTICS_ERROR,
        `Error generando estadísticas: ${error.message}`,
        500
      );
    }
  }

  // =============================================================================
  // MÉTODOS PRIVADOS DE UTILIDAD
  // =============================================================================

  /**
   * Validar datos de subida de archivo
   * @private
   */
  async _validateUploadData(fileData, contractId, phaseId, documentType) {
    // Validar IDs
    validateObjectId(contractId, "ID del contrato");
    validateObjectId(phaseId, "ID de la fase");

    // Validar campos requeridos del archivo
    validateRequiredFields(
      fileData,
      ["originalName", "mimeType"],
      "datos del archivo"
    );

    // Validar tipo de documento
    const allowedDocTypes = [
      "CERT_PRES",
      "EST_MERC",
      "TDR_ESPTEC",
      "EST_DESAG",
      "RES_INICIO",
      "AUT_CONTRAT",
      "INF_NECESIDAD",
      "PLIEGOS",
      "PREG_RESP",
      "OFERTAS",
      "INF_EVAL",
      "INF_CONVAL",
      "ADJUD",
      "RES_ADJUD",
      "CONTRATO",
      "GARANTIAS",
      "CRONOGRAMA",
      "PLANILLAS",
      "ACTAS_PARC",
      "INF_FISCAL",
      "ORD_CAMBIO",
      "MULTAS",
      "FACTURAS",
      "PLAN_PAGO",
      "RETENCIONES",
      "COMP_EGRESO",
      "AUT_PAGO",
      "ACTA_RECEP",
      "INF_FINAL",
      "LIQUIDACION",
      "DEV_GARANT",
      "PLANOS_AB",
      "MANUALES",
      "OTHER",
    ];

    validateEnum(documentType, allowedDocTypes, "Tipo de documento");

    // Validar archivo usando utilidad
    const fileSize = fileData.buffer ? fileData.buffer.length : fileData.size;
    validateFile(
      {
        name: fileData.originalName,
        size: fileSize,
        type: fileData.mimeType,
      },
      this.config.allowedTypes,
      this.config.maxFileSize,
      "archivo"
    );
  }

  /**
   * Preparar información del archivo para almacenamiento
   * @private
   */
  async _prepareFileInfo(fileData, contractId, phaseId) {
    const timestamp = Date.now();
    const extension = path.extname(fileData.originalName).toLowerCase();
    const baseName = path.basename(fileData.originalName, extension);

    // Generar nombre de sistema único
    const systemName = `${timestamp}_${baseName.replace(/[^a-zA-Z0-9]/g, "_")}${extension}`;

    // Crear estructura de directorios
    const relativePath = path.join("contracts", contractId, phaseId);
    const fullPath = path.join(this.config.uploadPath, relativePath);

    // Asegurar que el directorio existe
    await fs.mkdir(fullPath, { recursive: true });

    const finalPath = path.join(fullPath, systemName);

    return {
      originalName: fileData.originalName,
      systemName,
      extension,
      relativePath,
      fullPath,
      finalPath,
      size: fileData.buffer ? fileData.buffer.length : fileData.size,
      buffer: fileData.buffer,
      tempPath: fileData.tempPath,
    };
  }

  /**
   * Verificar si es un archivo de imagen
   * @private
   */
  _isImage(mimeType) {
    return mimeType && mimeType.startsWith("image/");
  }

  /**
   * Optimizar imagen si es necesario
   * @private
   */
  async _optimizeImage(fileInfo) {
    if (!this._isImage(fileInfo.mimeType) || !fileInfo.buffer) {
      return;
    }

    try {
      const { maxWidth, maxHeight, quality, format } =
        this.config.imageOptimization;

      let sharpInstance = sharp(fileInfo.buffer).resize(maxWidth, maxHeight, {
        fit: "inside",
        withoutEnlargement: true,
      });

      // Aplicar formato y calidad
      if (format === "webp") {
        sharpInstance = sharpInstance.webp({ quality });
        fileInfo.extension = ".webp";
        fileInfo.systemName = fileInfo.systemName.replace(/\.[^.]+$/, ".webp");
        fileInfo.finalPath = fileInfo.finalPath.replace(/\.[^.]+$/, ".webp");
      } else if (format === "jpeg") {
        sharpInstance = sharpInstance.jpeg({ quality });
      }

      fileInfo.buffer = await sharpInstance.toBuffer();
      fileInfo.size = fileInfo.buffer.length;

      console.log(
        `📸 Imagen optimizada: ${fileInfo.originalName} -> ${fileInfo.size} bytes`
      );
    } catch (error) {
      console.warn(`⚠️ No se pudo optimizar la imagen: ${error.message}`);
      // Continuar con la imagen original
    }
  }

  /**
   * Guardar archivo en el sistema de archivos
   * @private
   */
  async _saveFile(fileInfo) {
    if (fileInfo.buffer) {
      await fs.writeFile(fileInfo.finalPath, fileInfo.buffer);
    } else if (fileInfo.tempPath) {
      await fs.rename(fileInfo.tempPath, fileInfo.finalPath);
    } else {
      throw createError(
        ERROR_CODES.MISSING_FIELDS,
        "No se encontró buffer ni ruta temporal para el archivo",
        400
      );
    }
  }

  /**
   * Calcular hash del archivo
   * @private
   */
  async _calculateFileHash(filePath) {
    const buffer = await fs.readFile(filePath);
    return crypto.createHash("sha256").update(buffer).digest("hex");
  }

  /**
   * Extraer metadatos del archivo
   * @private
   */
  async _extractMetadata(fileInfo) {
    const metadata = {
      encoding: "utf-8",
      extractedAt: new Date(),
    };

    // Para imágenes, extraer dimensiones
    if (this._isImage(fileInfo.mimeType)) {
      try {
        const imageInfo = await sharp(fileInfo.finalPath).metadata();
        metadata.dimensions = {
          width: imageInfo.width,
          height: imageInfo.height,
        };
        metadata.format = imageInfo.format;
        metadata.channels = imageInfo.channels;
      } catch (error) {
        console.warn(
          `⚠️ No se pudieron extraer metadatos de imagen: ${error.message}`
        );
      }
    }

    return metadata;
  }

  /**
   * Limpiar archivo temporal
   * @private
   */
  async _cleanupTempFile(filePath) {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      console.warn(`⚠️ No se pudo limpiar archivo temporal: ${error.message}`);
    }
  }

  /**
   * Actualizar estadísticas de descarga
   * @private
   */
  async _updateDownloadStats(file, userData) {
    await this.fileRepository.updateById(file._id, {
      $inc: { "access.downloadCount": 1 },
      $set: { "audit.lastAccessDate": new Date() },
    });
  }

  /**
   * Sincronizar archivo de forma asíncrona
   * @private
   */
  async _syncFileAsync(fileId) {
    try {
      const file = await this.fileRepository.findById(fileId);
      if (
        file &&
        file.rsyncInfo?.autoSync &&
        file.rsyncInfo?.syncStatus === "PENDING"
      ) {
        await file.syncToRsync();
        console.log(
          `✅ Sincronización automática completada: ${file.systemName}`
        );
      }
    } catch (error) {
      console.error(`❌ Error en sincronización automática: ${error.message}`);
    }
  }
}
