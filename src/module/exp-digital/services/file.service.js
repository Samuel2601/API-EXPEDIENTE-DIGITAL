// =============================================================================
// src/module/exp-digital/services/file.service.js
// Servicio completo para gestión de archivos del expediente digital con RSync
// GADM Cantón Esmeraldas - Integración con almacenamiento distribuido
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
} from "../../../../utils/error.util.js";
import {
  validateObjectId,
  validateRequiredFields,
} from "../../../../utils/validation.util.js";

export class FileService {
  constructor() {
    this.fileRepository = new FileRepository();

    // Configuración desde variables de entorno
    this.config = {
      uploadPath: process.env.UPLOAD_PATH || "./uploads",
      maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 50 * 1024 * 1024, // 50MB
      allowedTypes: process.env.ALLOWED_FILE_TYPES?.split(",") || [
        "pdf",
        "doc",
        "docx",
        "xls",
        "xlsx",
        "ppt",
        "pptx",
        "jpg",
        "jpeg",
        "png",
        "gif",
        "webp",
        "txt",
        "csv",
        "zip",
        "rar",
      ],
      rsyncEnabled: process.env.RSYNC_ENABLED === "true",
      autoSync: process.env.RSYNC_AUTO_SYNC !== "false", // Por defecto true
      imageOptimization: {
        maxWidth: parseInt(process.env.IMAGE_MAX_WIDTH) || 1920,
        maxHeight: parseInt(process.env.IMAGE_MAX_HEIGHT) || 1080,
        quality: parseInt(process.env.IMAGE_QUALITY) || 85,
        format: process.env.IMAGE_FORMAT || "webp",
      },
      documentTypes: {
        CERTIFICACION_PRESUPUESTARIA: "Certificación Presupuestaria (PAC)",
        ESTUDIOS_MERCADO: "Estudios de Mercado",
        TERMINOS_REFERENCIA: "Términos de Referencia",
        ESPECIFICACIONES_TECNICAS: "Especificaciones Técnicas",
        PLIEGOS: "Pliegos (Documento de Convocatoria)",
        OFERTAS: "Ofertas/Propuestas de Proveedores",
        INFORME_EVALUACION: "Informe de Evaluación",
        CONTRATO: "Contrato Firmado",
        GARANTIAS: "Garantías",
        FACTURAS: "Facturas/Comprobantes",
        ACTA_RECEPCION: "Acta de Entrega Recepción",
        OTROS: "Otros Documentos",
      },
    };
  }

  // =============================================================================
  // OPERACIONES CRUD DE ARCHIVOS
  // =============================================================================

  /**
   * Subir archivo al sistema con validaciones completas
   * @param {Object} fileData - Datos del archivo desde multer
   * @param {Object} metadata - Metadatos del archivo
   * @param {Object} options - Opciones de subida
   * @returns {Promise<Object>} Archivo creado
   */
  async uploadFile(fileData, metadata, options = {}) {
    try {
      console.log(`📤 Iniciando subida de archivo: ${fileData.originalname}`);

      // Validaciones básicas
      await this._validateUploadData(fileData, metadata);

      const {
        contractId,
        phaseId,
        documentType = "OTROS",
        description = "",
        isPublic = false,
        allowedRoles = [],
        allowedUsers = [],
        autoSync = this.config.autoSync,
        priority = "NORMAL",
        keepLocal = true, // Para documentos legales, mantener copia local
        uploadedBy,
      } = metadata;

      // Preparar información del archivo
      const fileInfo = await this._prepareFileInfo(fileData, {
        contractId,
        phaseId,
        documentType,
      });

      // Guardar archivo localmente
      await this._saveFileLocally(fileData, fileInfo.systemName);

      // Crear registro en base de datos
      const fileRecord = await this.fileRepository.create({
        // Información básica del archivo
        originalName: fileData.originalname,
        systemName: fileInfo.systemName,
        displayName: fileInfo.displayName,

        // Información técnica
        fileInfo: {
          mimeType: fileData.mimetype,
          size: fileData.size,
          extension: fileInfo.extension,
          encoding: fileData.encoding,
          checksum: fileInfo.checksum,
        },

        // Almacenamiento
        storage: {
          storageProvider: this.config.rsyncEnabled ? "RSYNC" : "LOCAL",
          localPath: fileInfo.localPath,
          remotePath: this.config.rsyncEnabled ? fileInfo.remotePath : null,
          publicUrl: null, // Se asignará después de la sincronización
        },

        // Información del documento
        documentInfo: {
          contractId: contractId || null,
          phaseId: phaseId || null,
          documentType,
          description,
          category: this._categorizeFile(fileData.mimetype, documentType),
        },

        // Control de acceso
        access: {
          isPublic,
          allowedRoles,
          allowedUsers: allowedUsers.map((userId) => ({
            userId,
            canDownload: true,
          })),
        },

        // RSync específico
        rsyncInfo: this.config.rsyncEnabled
          ? {
              syncStatus: "PENDING",
              priority,
              keepLocal,
              syncRetries: 0,
              lastSyncAttempt: null,
              syncError: null,
              remoteSize: null,
            }
          : null,

        // Auditoría
        audit: {
          uploadedBy,
          uploadedAt: new Date(),
          ipAddress: options.ipAddress || null,
          userAgent: options.userAgent || null,
        },
      });

      // Si está habilitado rsync y autoSync, programar sincronización
      if (this.config.rsyncEnabled && autoSync) {
        // Sincronizar de forma asíncrona (no bloqueante)
        this._scheduleRsyncSync(fileRecord._id).catch((error) => {
          console.error(
            `⚠️ Error programando sincronización para ${fileRecord.systemName}: ${error.message}`
          );
        });
      }

      console.log(`✅ Archivo subido exitosamente: ${fileRecord.systemName}`);

      return await this._populateFileData(fileRecord);
    } catch (error) {
      console.error(`❌ Error subiendo archivo: ${error.message}`);
      throw createError(
        ERROR_CODES.CREATION_ERROR,
        `Error al subir archivo: ${error.message}`,
        400
      );
    }
  }

  /**
   * Obtener todos los archivos con filtros
   * @param {Object} filters - Filtros de búsqueda
   * @returns {Promise<Object>} Lista de archivos
   */
  async getAllFiles(filters = {}) {
    try {
      console.log("📋 Service: Obteniendo archivos con filtros:", filters);

      const {
        page = 1,
        limit = 20,
        contractId,
        phaseId,
        documentType,
        category,
        syncStatus,
        uploadedBy,
        dateFrom,
        dateTo,
        search,
        sortBy = "uploadedAt",
        sortOrder = "desc",
        includeDeleted = false,
      } = filters;

      // Construir query
      const query = this._buildFilesQuery({
        contractId,
        phaseId,
        documentType,
        category,
        syncStatus,
        uploadedBy,
        dateFrom,
        dateTo,
        search,
        includeDeleted,
      });

      // Configurar opciones de consulta
      const queryOptions = {
        page,
        limit,
        sort: { [sortBy]: sortOrder === "desc" ? -1 : 1 },
        populate: [
          {
            path: "documentInfo.contractId",
            select: "contractNumber contractualObject generalStatus",
          },
          {
            path: "documentInfo.phaseId",
            select: "code name category",
          },
          {
            path: "audit.uploadedBy",
            select: "firstName lastName email",
          },
        ],
      };

      // Ejecutar consulta
      const result = await this.fileRepository.findWithPagination(
        query,
        queryOptions
      );

      // Enriquecer datos
      const enrichedFiles = await Promise.all(
        result.docs.map(async (file) => {
          const enriched = file.toObject();

          // Agregar estadísticas y estado
          enriched.status = this._getFileStatus(file);
          enriched.downloadUrl = this._generateDownloadUrl(file);
          enriched.isAvailable = this._isFileAvailable(file);

          return enriched;
        })
      );

      console.log(
        `✅ Service: Archivos obtenidos: ${enrichedFiles.length}/${result.totalDocs}`
      );

      return {
        files: enrichedFiles,
        pagination: {
          currentPage: result.page,
          totalPages: result.totalPages,
          totalFiles: result.totalDocs,
          limit: result.limit,
          hasNextPage: result.hasNextPage,
          hasPrevPage: result.hasPrevPage,
        },
        appliedFilters: {
          contractId,
          phaseId,
          documentType,
          category,
          syncStatus,
          dateRange: dateFrom || dateTo ? { from: dateFrom, to: dateTo } : null,
          search,
          sorting: { field: sortBy, order: sortOrder },
        },
      };
    } catch (error) {
      console.error(`❌ Service: Error obteniendo archivos: ${error.message}`);
      throw createError(
        ERROR_CODES.QUERY_ERROR,
        `Error al obtener archivos: ${error.message}`,
        500
      );
    }
  }

  /**
   * Obtener archivo por ID
   * @param {String} fileId - ID del archivo
   * @param {Object} options - Opciones de consulta
   * @returns {Promise<Object>} Archivo con información detallada
   */
  async getFileById(fileId, options = {}) {
    try {
      validateObjectId(fileId, "ID del archivo");

      console.log(`🔍 Service: Obteniendo archivo por ID: ${fileId}`);

      const { includeContent = false } = options;

      // Obtener archivo con populate
      const file = await this.fileRepository.findById(fileId, {
        populate: [
          {
            path: "documentInfo.contractId",
            select: "contractNumber contractualObject generalStatus",
          },
          {
            path: "documentInfo.phaseId",
            select: "code name category order",
          },
          {
            path: "audit.uploadedBy",
            select: "firstName lastName email",
          },
        ],
      });

      if (!file) {
        return null;
      }

      const result = {
        file: file.toObject(),
        status: this._getFileStatus(file),
        downloadUrl: this._generateDownloadUrl(file),
        isAvailable: this._isFileAvailable(file),
      };

      // Incluir metadatos adicionales si se solicita
      if (includeContent) {
        result.metadata = await this._getFileMetadata(file);
      }

      console.log(`✅ Service: Archivo obtenido: ${file.systemName}`);

      return result;
    } catch (error) {
      console.error(`❌ Service: Error obteniendo archivo: ${error.message}`);
      throw createError(
        ERROR_CODES.QUERY_ERROR,
        `Error al obtener archivo: ${error.message}`,
        500
      );
    }
  }

  /**
   * Actualizar metadatos del archivo
   * @param {String} fileId - ID del archivo
   * @param {Object} updateData - Datos a actualizar
   * @param {Object} options - Opciones adicionales
   * @returns {Promise<Object>} Archivo actualizado
   */
  async updateFile(fileId, updateData, options = {}) {
    try {
      validateObjectId(fileId, "ID del archivo");

      console.log(`✏️ Service: Actualizando archivo: ${fileId}`);

      // Obtener archivo actual
      const existingFile = await this.fileRepository.findById(fileId);
      if (!existingFile) {
        throw createError(ERROR_CODES.NOT_FOUND, "Archivo no encontrado", 404);
      }

      // Campos permitidos para actualización
      const allowedFields = [
        "displayName",
        "description",
        "documentType",
        "category",
        "access.isPublic",
        "access.allowedRoles",
        "access.allowedUsers",
        "rsyncInfo.priority",
        "rsyncInfo.keepLocal",
      ];

      // Filtrar datos de actualización
      const filteredUpdate = this._filterUpdateFields(
        updateData,
        allowedFields
      );

      // Si cambió el tipo de documento, actualizar categoría
      if (filteredUpdate.documentType) {
        filteredUpdate.category = this._categorizeFile(
          existingFile.fileInfo.mimeType,
          filteredUpdate.documentType
        );
      }

      // Actualizar archivo
      const updatedFile = await this.fileRepository.updateById(
        fileId,
        filteredUpdate
      );

      console.log(`✅ Service: Archivo actualizado: ${updatedFile.systemName}`);

      return await this._populateFileData(updatedFile);
    } catch (error) {
      console.error(`❌ Service: Error actualizando archivo: ${error.message}`);
      throw createError(
        ERROR_CODES.UPDATE_ERROR,
        `Error al actualizar archivo: ${error.message}`,
        400
      );
    }
  }

  /**
   * Eliminar archivo (soft delete)
   * @param {String} fileId - ID del archivo
   * @param {Object} options - Opciones de eliminación
   * @returns {Promise<Object>} Resultado de la eliminación
   */
  async deleteFile(fileId, options = {}) {
    try {
      validateObjectId(fileId, "ID del archivo");

      console.log(`🗑️ Service: Eliminando archivo: ${fileId}`);

      const {
        deleteLocal = false,
        deleteRemote = false,
        deletedBy,
        reason = "Eliminación solicitada por usuario",
      } = options;

      // Obtener archivo
      const file = await this.fileRepository.findById(fileId);
      if (!file) {
        throw createError(ERROR_CODES.NOT_FOUND, "Archivo no encontrado", 404);
      }

      // Verificar si se puede eliminar
      if (file.documentInfo.category === "LEGAL_REQUIRED") {
        throw createValidationError(
          "No se puede eliminar un documento requerido legalmente"
        );
      }

      // Soft delete en base de datos
      const deletedFile = await this.fileRepository.updateById(fileId, {
        isActive: false,
        deletedAt: new Date(),
        deletionReason: reason,
        "audit.deletedBy": deletedBy,
        "audit.deletedAt": new Date(),
      });

      // Eliminar archivos físicos si se solicita
      const deletionResults = {
        database: true,
        local: false,
        remote: false,
      };

      if (deleteLocal) {
        try {
          await fs.unlink(file.storage.localPath);
          deletionResults.local = true;
          console.log(`🗑️ Archivo local eliminado: ${file.storage.localPath}`);
        } catch (error) {
          console.warn(`⚠️ Error eliminando archivo local: ${error.message}`);
        }
      }

      if (deleteRemote && this.config.rsyncEnabled && file.storage.remotePath) {
        try {
          // TODO: Implementar eliminación remota via SSH/rsync
          console.log(
            `🗑️ Solicitud de eliminación remota: ${file.storage.remotePath}`
          );
        } catch (error) {
          console.warn(`⚠️ Error eliminando archivo remoto: ${error.message}`);
        }
      }

      console.log(`✅ Service: Archivo eliminado: ${file.systemName}`);

      return {
        fileName: file.originalName,
        systemName: file.systemName,
        deletedAt: new Date(),
        deletionResults,
        reason,
      };
    } catch (error) {
      console.error(`❌ Service: Error eliminando archivo: ${error.message}`);
      throw createError(
        ERROR_CODES.DELETE_ERROR,
        `Error al eliminar archivo: ${error.message}`,
        400
      );
    }
  }

  // =============================================================================
  // OPERACIONES DE DESCARGA Y SERVICIO DE ARCHIVOS
  // =============================================================================

  /**
   * Descargar archivo del sistema
   * @param {String} fileId - ID del archivo
   * @param {Object} options - Opciones de descarga
   * @returns {Promise<Object>} Stream y metadatos del archivo
   */
  async downloadFile(fileId, options = {}) {
    try {
      validateObjectId(fileId, "ID del archivo");

      console.log(`📥 Service: Preparando descarga de archivo: ${fileId}`);

      const {
        source = "auto", // "auto", "local", "remote"
        userId = null,
        trackDownload = true,
      } = options;

      // Obtener archivo
      const file = await this.fileRepository.findById(fileId);
      if (!file) {
        throw createError(ERROR_CODES.NOT_FOUND, "Archivo no encontrado", 404);
      }

      // Verificar disponibilidad
      if (!this._isFileAvailable(file)) {
        throw createError(
          ERROR_CODES.SERVICE_UNAVAILABLE,
          "Archivo temporalmente no disponible",
          503
        );
      }

      // Determinar fuente de descarga
      const downloadSource = this._determineDownloadSource(file, source);

      let filePath;
      let fileStream;

      switch (downloadSource) {
        case "local":
          filePath = file.storage.localPath;

          // Verificar que existe localmente
          try {
            await fs.access(filePath);
            fileStream = await fs.readFile(filePath);
          } catch (error) {
            throw createError(
              ERROR_CODES.FILE_NOT_FOUND,
              "Archivo no encontrado en almacenamiento local",
              404
            );
          }
          break;

        case "remote":
          // TODO: Implementar descarga desde servidor remoto
          throw createError(
            ERROR_CODES.NOT_IMPLEMENTED,
            "Descarga desde servidor remoto no implementada aún",
            501
          );

        default:
          throw createError(
            ERROR_CODES.CONFIG_ERROR,
            "Fuente de descarga no válida",
            400
          );
      }

      // Registrar descarga si se solicita
      if (trackDownload && userId) {
        await this._trackDownload(fileId, userId, downloadSource);
      }

      console.log(
        `✅ Service: Archivo preparado para descarga: ${file.systemName}`
      );

      return {
        fileStream,
        metadata: {
          originalName: file.originalName,
          systemName: file.systemName,
          mimeType: file.fileInfo.mimeType,
          size: file.fileInfo.size,
          checksum: file.fileInfo.checksum,
          source: downloadSource,
        },
      };
    } catch (error) {
      console.error(`❌ Service: Error descargando archivo: ${error.message}`);
      throw error;
    }
  }

  // =============================================================================
  // OPERACIONES DE RSYNC Y SINCRONIZACIÓN
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
          ERROR_CODES.SERVICE_UNAVAILABLE,
          "Servicio de sincronización rsync no está habilitado",
          503
        );
      }

      console.log(`🔄 Service: Sincronizando archivo: ${fileId}`);

      const {
        forcePriority = null,
        resetRetries = false,
        updatePriority = false,
      } = options;

      // Obtener archivo
      const file = await this.fileRepository.findById(fileId);
      if (!file) {
        throw createError(ERROR_CODES.NOT_FOUND, "Archivo no encontrado", 404);
      }

      if (!file.rsyncInfo) {
        throw createError(
          ERROR_CODES.INVALID_OPERATION,
          "Este archivo no está configurado para rsync",
          400
        );
      }

      // Actualizar prioridad si se solicita
      if (updatePriority && forcePriority) {
        await this.fileRepository.updateById(fileId, {
          "rsyncInfo.priority": forcePriority,
        });
      }

      // Resetear reintentos si se solicita
      if (resetRetries) {
        await this.fileRepository.updateById(fileId, {
          "rsyncInfo.syncRetries": 0,
          "rsyncInfo.syncError": null,
        });
      }

      // Usar el método del modelo para sincronizar
      const updatedFile = await this.fileRepository.findById(fileId);
      const syncResult = await updatedFile.syncToRsync();

      console.log(`✅ Service: Archivo sincronizado: ${file.systemName}`);

      return {
        fileId,
        systemName: file.systemName,
        syncResult,
        status: syncResult.success ? "SYNCED" : "FAILED",
      };
    } catch (error) {
      console.error(
        `❌ Service: Error sincronizando archivo: ${error.message}`
      );
      throw createError(
        ERROR_CODES.SYNC_ERROR,
        `Error en sincronización: ${error.message}`,
        500
      );
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
          ERROR_CODES.SERVICE_UNAVAILABLE,
          "Servicio rsync no está habilitado",
          503
        );
      }

      const { batchSize = 10, priorityFirst = true, maxRetries = 3 } = options;

      console.log(`⚡ Service: Procesando cola rsync (lote: ${batchSize})`);

      // Obtener archivos pendientes
      const query = {
        "rsyncInfo.syncStatus": "PENDING",
        "rsyncInfo.syncRetries": { $lt: maxRetries },
        isActive: true,
      };

      const sort = priorityFirst
        ? { "rsyncInfo.priority": -1, "audit.uploadedAt": 1 }
        : { "audit.uploadedAt": 1 };

      const pendingFiles = await this.fileRepository.find(query, {
        limit: batchSize,
        sort,
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

          // Actualizar estado a SYNCING
          await this.fileRepository.updateById(file._id, {
            "rsyncInfo.syncStatus": "SYNCING",
            "rsyncInfo.lastSyncAttempt": new Date(),
          });

          // Sincronizar usando rsync
          const syncResult = await rsyncClient.transferFile(
            file.storage.localPath,
            file.systemName
          );

          // Actualizar estado exitoso
          await this.fileRepository.updateById(file._id, {
            "rsyncInfo.syncStatus": "SYNCED",
            "rsyncInfo.syncedAt": new Date(),
            "rsyncInfo.syncError": null,
            "storage.publicUrl": this._generatePublicUrl(file.systemName),
          });

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

          // Incrementar contador de reintentos y marcar como fallido
          await this.fileRepository.updateById(file._id, {
            "rsyncInfo.syncStatus": "FAILED",
            "rsyncInfo.syncRetries": file.rsyncInfo.syncRetries + 1,
            "rsyncInfo.syncError": error.message,
            "rsyncInfo.lastSyncAttempt": new Date(),
          });

          results.push({
            fileId: file._id,
            systemName: file.systemName,
            success: false,
            error: error.message,
            syncStatus: "FAILED",
            retries: file.rsyncInfo.syncRetries + 1,
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
            ? Math.round((successful / results.length) * 100)
            : 0,
        results,
        queueStatus: await this.getRsyncQueueStatus(),
      };

      console.log(
        `✅ Service: Cola procesada - ${successful}/${results.length} exitosos`
      );

      return summary;
    } catch (error) {
      console.error(
        `❌ Service: Error procesando cola rsync: ${error.message}`
      );
      throw createError(
        ERROR_CODES.QUEUE_ERROR,
        `Error procesando cola: ${error.message}`,
        500
      );
    }
  }

  /**
   * Obtener estado de la cola de sincronización
   * @returns {Promise<Object>} Estado de la cola
   */
  async getRsyncQueueStatus() {
    try {
      if (!this.config.rsyncEnabled) {
        return {
          enabled: false,
          message: "RSync no está habilitado",
        };
      }

      const stats = await this.fileRepository.aggregate([
        {
          $match: {
            rsyncInfo: { $exists: true },
            isActive: true,
          },
        },
        {
          $group: {
            _id: "$rsyncInfo.syncStatus",
            count: { $sum: 1 },
            totalSize: { $sum: "$fileInfo.size" },
            avgRetries: { $avg: "$rsyncInfo.syncRetries" },
          },
        },
      ]);

      const queueStats = {};
      stats.forEach((stat) => {
        queueStats[stat._id] = {
          count: stat.count,
          totalSize: stat.totalSize,
          avgRetries: stat.avgRetries,
        };
      });

      return {
        enabled: true,
        stats: queueStats,
        summary: {
          pending: queueStats.PENDING?.count || 0,
          syncing: queueStats.SYNCING?.count || 0,
          synced: queueStats.SYNCED?.count || 0,
          failed: queueStats.FAILED?.count || 0,
          total: Object.values(queueStats).reduce(
            (sum, stat) => sum + stat.count,
            0
          ),
        },
        generatedAt: new Date(),
      };
    } catch (error) {
      console.error(
        `❌ Service: Error obteniendo estado de cola: ${error.message}`
      );
      throw createError(
        ERROR_CODES.QUERY_ERROR,
        `Error obteniendo estado de cola: ${error.message}`,
        500
      );
    }
  }

  // =============================================================================
  // OPERACIONES DE ESTADÍSTICAS Y REPORTES
  // =============================================================================

  /**
   * Obtener estadísticas de archivos
   * @param {Object} filters - Filtros para estadísticas
   * @returns {Promise<Object>} Estadísticas de archivos
   */
  async getFilesStatistics(filters = {}) {
    try {
      console.log("📊 Service: Generando estadísticas de archivos");

      const { contractId, phaseId, period = "month" } = filters;

      // Construir match stage
      let matchStage = { isActive: true };

      if (contractId) {
        validateObjectId(contractId, "ID del contrato");
        matchStage["documentInfo.contractId"] = contractId;
      }

      if (phaseId) {
        validateObjectId(phaseId, "ID de la fase");
        matchStage["documentInfo.phaseId"] = phaseId;
      }

      // Pipeline de agregación
      const pipeline = [
        { $match: matchStage },
        {
          $group: {
            _id: null,
            totalFiles: { $sum: 1 },
            totalSize: { $sum: "$fileInfo.size" },
            avgSize: { $avg: "$fileInfo.size" },
            byType: {
              $push: {
                documentType: "$documentInfo.documentType",
                category: "$documentInfo.category",
                size: "$fileInfo.size",
              },
            },
            bySyncStatus: {
              $push: {
                syncStatus: "$rsyncInfo.syncStatus",
                size: "$fileInfo.size",
              },
            },
          },
        },
      ];

      const [stats] = await this.fileRepository.aggregate(pipeline);

      if (!stats) {
        return {
          totalFiles: 0,
          totalSize: 0,
          avgSize: 0,
          byType: {},
          bySyncStatus: {},
          byCategory: {},
        };
      }

      // Procesar estadísticas por tipo
      const typeStats = {};
      stats.byType.forEach((item) => {
        const key = item.documentType || "OTROS";
        if (!typeStats[key]) {
          typeStats[key] = { count: 0, size: 0 };
        }
        typeStats[key].count += 1;
        typeStats[key].size += item.size || 0;
      });

      // Procesar estadísticas por estado de sincronización
      const syncStats = {};
      stats.bySyncStatus.forEach((item) => {
        const key = item.syncStatus || "LOCAL";
        if (!syncStats[key]) {
          syncStats[key] = { count: 0, size: 0 };
        }
        syncStats[key].count += 1;
        syncStats[key].size += item.size || 0;
      });

      console.log("✅ Service: Estadísticas generadas exitosamente");

      return {
        totalFiles: stats.totalFiles,
        totalSize: stats.totalSize,
        avgSize: Math.round(stats.avgSize),
        byType: typeStats,
        bySyncStatus: syncStats,
        filters: {
          contractId,
          phaseId,
          period,
        },
        generatedAt: new Date(),
      };
    } catch (error) {
      console.error(
        `❌ Service: Error generando estadísticas: ${error.message}`
      );
      throw createError(
        ERROR_CODES.STATISTICS_ERROR,
        `Error generando estadísticas: ${error.message}`,
        500
      );
    }
  }

  // =============================================================================
  // MÉTODOS PRIVADOS Y UTILIDADES
  // =============================================================================

  /**
   * Validar datos de subida
   * @param {Object} fileData - Datos del archivo
   * @param {Object} metadata - Metadatos
   * @private
   */
  async _validateUploadData(fileData, metadata) {
    if (!fileData || !fileData.buffer) {
      throw createValidationError("Se requiere el archivo a subir");
    }

    // Validar tamaño
    if (fileData.size > this.config.maxFileSize) {
      throw createValidationError(
        `El archivo es demasiado grande. Máximo: ${Math.round(this.config.maxFileSize / 1024 / 1024)}MB`
      );
    }

    // Validar tipo de archivo
    const extension = path
      .extname(fileData.originalname)
      .slice(1)
      .toLowerCase();
    if (!this.config.allowedTypes.includes(extension)) {
      throw createValidationError(
        `Tipo de archivo no permitido. Tipos válidos: ${this.config.allowedTypes.join(", ")}`
      );
    }

    // Validar metadatos requeridos
    const requiredFields = ["uploadedBy"];
    const missingFields = requiredFields.filter((field) => !metadata[field]);

    if (missingFields.length > 0) {
      throw createValidationError(
        `Campos requeridos faltantes: ${missingFields.join(", ")}`
      );
    }

    // Validar ObjectIds si se proporcionan
    if (metadata.contractId) {
      validateObjectId(metadata.contractId, "ID del contrato");
    }
    if (metadata.phaseId) {
      validateObjectId(metadata.phaseId, "ID de la fase");
    }
  }

  /**
   * Preparar información del archivo
   * @param {Object} fileData - Datos del archivo
   * @param {Object} context - Contexto del archivo
   * @returns {Promise<Object>} Información preparada
   * @private
   */
  async _prepareFileInfo(fileData, context) {
    const extension = path
      .extname(fileData.originalname)
      .slice(1)
      .toLowerCase();
    const timestamp = new Date().getTime();
    const random = Math.random().toString(36).substring(7);

    // Generar nombre del sistema
    let systemName = `${timestamp}_${random}.${extension}`;

    // Si hay contexto de contrato/fase, incluirlo en el nombre
    if (context.contractId || context.phaseId) {
      const prefix = context.contractId ? "contract" : "phase";
      const id = (context.contractId || context.phaseId).toString().slice(-8);
      systemName = `${prefix}_${id}_${systemName}`;
    }

    // Calcular checksum
    const checksum = crypto
      .createHash("sha256")
      .update(fileData.buffer)
      .digest("hex");

    // Generar rutas
    const localPath = path.join(this.config.uploadPath, systemName);
    const remotePath = this.config.rsyncEnabled
      ? path.join(process.env.RSYNC_REMOTE_PATH || "/files", systemName)
      : null;

    return {
      systemName,
      displayName: fileData.originalname,
      extension,
      localPath,
      remotePath,
      checksum,
    };
  }

  /**
   * Guardar archivo localmente
   * @param {Object} fileData - Datos del archivo
   * @param {String} systemName - Nombre del sistema
   * @private
   */
  async _saveFileLocally(fileData, systemName) {
    try {
      // Asegurar que el directorio existe
      await fs.mkdir(this.config.uploadPath, { recursive: true });

      const localPath = path.join(this.config.uploadPath, systemName);

      // Guardar archivo
      await fs.writeFile(localPath, fileData.buffer);

      console.log(`💾 Archivo guardado localmente: ${localPath}`);
    } catch (error) {
      throw new Error(`Error guardando archivo localmente: ${error.message}`);
    }
  }

  /**
   * Categorizar archivo según su tipo y propósito
   * @param {String} mimeType - Tipo MIME del archivo
   * @param {String} documentType - Tipo de documento
   * @returns {String} Categoría del archivo
   * @private
   */
  _categorizeFile(mimeType, documentType) {
    // Documentos legales requeridos
    const legalDocs = [
      "CERTIFICACION_PRESUPUESTARIA",
      "CONTRATO",
      "GARANTIAS",
      "ACTA_RECEPCION",
    ];

    if (legalDocs.includes(documentType)) {
      return "LEGAL_REQUIRED";
    }

    // Por tipo MIME
    if (mimeType.startsWith("image/")) {
      return "IMAGE";
    } else if (mimeType === "application/pdf") {
      return "DOCUMENT_PDF";
    } else if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) {
      return "SPREADSHEET";
    } else if (mimeType.includes("word") || mimeType.includes("document")) {
      return "DOCUMENT_TEXT";
    } else {
      return "OTHER";
    }
  }

  /**
   * Construir query para filtros de archivos
   * @param {Object} filters - Filtros
   * @returns {Object} Query de MongoDB
   * @private
   */
  _buildFilesQuery(filters) {
    const query = {};

    if (!filters.includeDeleted) {
      query.isActive = true;
    }

    if (filters.contractId) {
      query["documentInfo.contractId"] = filters.contractId;
    }

    if (filters.phaseId) {
      query["documentInfo.phaseId"] = filters.phaseId;
    }

    if (filters.documentType) {
      query["documentInfo.documentType"] = filters.documentType;
    }

    if (filters.category) {
      query["documentInfo.category"] = filters.category;
    }

    if (filters.syncStatus) {
      query["rsyncInfo.syncStatus"] = filters.syncStatus;
    }

    if (filters.uploadedBy) {
      query["audit.uploadedBy"] = filters.uploadedBy;
    }

    if (filters.dateFrom || filters.dateTo) {
      query["audit.uploadedAt"] = {};
      if (filters.dateFrom)
        query["audit.uploadedAt"].$gte = new Date(filters.dateFrom);
      if (filters.dateTo)
        query["audit.uploadedAt"].$lte = new Date(filters.dateTo);
    }

    if (filters.search) {
      query.$or = [
        { originalName: { $regex: filters.search, $options: "i" } },
        { displayName: { $regex: filters.search, $options: "i" } },
        {
          "documentInfo.description": { $regex: filters.search, $options: "i" },
        },
      ];
    }

    return query;
  }

  /**
   * Obtener estado del archivo
   * @param {Object} file - Archivo
   * @returns {String} Estado del archivo
   * @private
   */
  _getFileStatus(file) {
    if (!file.isActive) return "DELETED";

    if (this.config.rsyncEnabled && file.rsyncInfo) {
      return file.rsyncInfo.syncStatus || "UNKNOWN";
    }

    return "LOCAL";
  }

  /**
   * Generar URL de descarga
   * @param {Object} file - Archivo
   * @returns {String} URL de descarga
   * @private
   */
  _generateDownloadUrl(file) {
    return `/api/files/${file._id}/download`;
  }

  /**
   * Verificar si el archivo está disponible
   * @param {Object} file - Archivo
   * @returns {Boolean} Si está disponible
   * @private
   */
  _isFileAvailable(file) {
    if (!file.isActive) return false;

    if (this.config.rsyncEnabled && file.rsyncInfo) {
      return file.rsyncInfo.syncStatus === "SYNCED" || file.rsyncInfo.keepLocal;
    }

    return true;
  }

  /**
   * Programar sincronización rsync de forma asíncrona
   * @param {String} fileId - ID del archivo
   * @private
   */
  async _scheduleRsyncSync(fileId) {
    // Esto se ejecuta de forma asíncrona
    setTimeout(async () => {
      try {
        await this.syncFile(fileId);
      } catch (error) {
        console.error(
          `⚠️ Error en sincronización programada: ${error.message}`
        );
      }
    }, 1000); // Delay de 1 segundo para no bloquear la respuesta
  }

  /**
   * Determinar fuente de descarga
   * @param {Object} file - Archivo
   * @param {String} preferredSource - Fuente preferida
   * @returns {String} Fuente de descarga
   * @private
   */
  _determineDownloadSource(file, preferredSource) {
    if (preferredSource === "local" || !this.config.rsyncEnabled) {
      return "local";
    }

    if (
      preferredSource === "remote" &&
      file.rsyncInfo?.syncStatus === "SYNCED"
    ) {
      return "remote";
    }

    // Auto: preferir local si está disponible, sino remoto
    if (file.rsyncInfo?.keepLocal) {
      return "local";
    } else if (file.rsyncInfo?.syncStatus === "SYNCED") {
      return "remote";
    } else {
      return "local";
    }
  }

  /**
   * Poblar datos del archivo con información relacionada
   * @param {Object} file - Archivo base
   * @returns {Promise<Object>} Archivo poblado
   * @private
   */
  async _populateFileData(file) {
    return await this.fileRepository.findById(file._id, {
      populate: [
        {
          path: "documentInfo.contractId",
          select: "contractNumber contractualObject generalStatus",
        },
        {
          path: "documentInfo.phaseId",
          select: "code name category order",
        },
        {
          path: "audit.uploadedBy",
          select: "firstName lastName email",
        },
      ],
    });
  }

  /**
   * Filtrar campos permitidos para actualización
   * @param {Object} updateData - Datos a actualizar
   * @param {Array} allowedFields - Campos permitidos
   * @returns {Object} Datos filtrados
   * @private
   */
  _filterUpdateFields(updateData, allowedFields) {
    const filtered = {};
    allowedFields.forEach((field) => {
      if (this._getNestedValue(updateData, field) !== undefined) {
        this._setNestedValue(
          filtered,
          field,
          this._getNestedValue(updateData, field)
        );
      }
    });
    return filtered;
  }

  /**
   * Obtener valor anidado
   * @param {Object} obj - Objeto
   * @param {String} path - Ruta del campo
   * @returns {*} Valor
   * @private
   */
  _getNestedValue(obj, path) {
    return path.split(".").reduce((current, key) => current?.[key], obj);
  }

  /**
   * Establecer valor anidado
   * @param {Object} obj - Objeto
   * @param {String} path - Ruta del campo
   * @param {*} value - Valor
   * @private
   */
  _setNestedValue(obj, path, value) {
    const keys = path.split(".");
    const lastKey = keys.pop();
    const target = keys.reduce((current, key) => {
      if (!current[key]) current[key] = {};
      return current[key];
    }, obj);
    target[lastKey] = value;
  }

  /**
   * Generar URL pública del archivo
   * @param {String} systemName - Nombre del sistema
   * @returns {String} URL pública
   * @private
   */
  _generatePublicUrl(systemName) {
    const baseUrl =
      process.env.RSYNC_PUBLIC_URL || "https://files.gadmesmeraldas.gob.ec";
    return `${baseUrl}/${systemName}`;
  }

  /**
   * Registrar descarga de archivo
   * @param {String} fileId - ID del archivo
   * @param {String} userId - ID del usuario
   * @param {String} source - Fuente de descarga
   * @private
   */
  async _trackDownload(fileId, userId, source) {
    try {
      // TODO: Implementar tracking de descargas si es necesario
      console.log(
        `📊 Descarga registrada: ${fileId} por ${userId} desde ${source}`
      );
    } catch (error) {
      console.warn(`⚠️ Error registrando descarga: ${error.message}`);
    }
  }

  /**
   * Obtener metadatos adicionales del archivo
   * @param {Object} file - Archivo
   * @returns {Promise<Object>} Metadatos
   * @private
   */
  async _getFileMetadata(file) {
    try {
      const stats = await fs.stat(file.storage.localPath);

      return {
        lastModified: stats.mtime,
        permissions: stats.mode,
        isSymbolicLink: stats.isSymbolicLink(),
        blocks: stats.blocks,
      };
    } catch (error) {
      console.warn(`⚠️ Error obteniendo metadatos: ${error.message}`);
      return {};
    }
  }
}
