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
import { tempFileService } from "./temp-file.service.js";

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
    this.TEMP_DIR = path.join(process.env.RSYNC_TEMP_DIR || "./temp");
    // Crear directorio temporal si no existe
    this._ensureTempDir();
  }

  /**
   * Asegurar que existe el directorio temporal
   * @private
   */
  async _ensureTempDir() {
    try {
      await fs.access(this.TEMP_DIR);
    } catch (error) {
      // El directorio no existe, crearlo
      await fs.mkdir(this.TEMP_DIR, { recursive: true });
      console.log(`📁 Directorio temporal creado: ${this.TEMP_DIR}`);
    }
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
            path: "contract",
            select: "contractNumber contractualObject generalStatus",
          },
          {
            path: "phase",
            select: "code name category",
          },
          {
            path: "audit.uploadedBy",
            select: "name last_name email",
            model: "user",
          },
          {
            path: "createdBy",
            select: "name last_name email",
            model: "user",
          },
          {
            path: "updatedBy",
            select: "name last_name email",
            model: "user",
          },
        ],
      };

      // Ejecutar consulta
      const result = await this.fileRepository.findAll(query, queryOptions);

      // Enriquecer datos
      const enrichedFiles = await Promise.all(
        result.docs.map(async (file) => {
          const enriched = file.toObject?.() ? file.toObject() : file;

          // Agregar estadísticas y estado
          //enriched.status = this._getFileStatus(file);
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
            path: "contract",
            select: "contractNumber contractualObject generalStatus",
          },
          {
            path: "phase",
            select: "code name category",
          },
          {
            path: "audit.uploadedBy",
            select: "name last_name email",
            model: "user",
          },
          {
            path: "createdBy",
            select: "name last_name email",
            model: "user",
          },
          {
            path: "updatedBy",
            select: "name last_name email",
            model: "user",
          },
          {
            path: "review.reviewedBy",
            select: "name last_name email",
            model: "user",
          },
          {
            path: "review.approvedBy",
            select: "name last_name email",
            model: "user",
          },
        ],
      });

      if (!file) {
        return null;
      }
      console.log("Archivo obtenido: ", file);
      const result = {
        file: file,
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
   * @param {Object} userData - Datos del usuario
   * @returns {Promise<Object>} Archivo actualizado
   */
  async updateFile(fileId, updateData, userData = {}) {
    try {
      validateObjectId(fileId, "ID del archivo");

      console.log(`✏️ Service: Actualizando archivo: ${fileId}`);

      // Obtener archivo actual
      const existingFile = await this.fileRepository.findById(fileId);
      if (!existingFile) {
        throw createError(ERROR_CODES.NOT_FOUND, "Archivo no encontrado", 404);
      }

      // Preparar datos de actualización
      const updatePayload = { ...updateData };

      // Si se está cambiando el estado, auto-rellenar campos según el estado
      if (updateData.status && updateData.status !== existingFile.status) {
        updatePayload.review = updatePayload.review || {};

        switch (updateData.status) {
          case "REVIEW":
            // Para estado REVIEW, asignar revisor y fecha de revisión
            if (!updatePayload.review.reviewedBy) {
              updatePayload.review.reviewedBy = userData.userId;
            }
            if (!updatePayload.review.reviewDate) {
              updatePayload.review.reviewDate = new Date();
            }
            break;

          case "APPROVED":
            // Para estado APPROVED, asignar aprobador y fecha de aprobación
            if (!updatePayload.review.approvedBy) {
              updatePayload.review.approvedBy = userData.userId;
            }
            if (!updatePayload.review.approvalDate) {
              updatePayload.review.approvalDate = new Date();
            }

            // Si no hay revisor asignado, usar el mismo usuario
            if (!updatePayload.review.reviewedBy) {
              updatePayload.review.reviewedBy = userData.userId;
            }
            if (!updatePayload.review.reviewDate) {
              updatePayload.review.reviewDate = new Date();
            }
            break;

          case "REJECTED":
            // Para estado REJECTED, validar que hay razón de rechazo
            if (!updatePayload.review.rejectionReason) {
              throw createError(
                ERROR_CODES.INVALID_OPERATION,
                "No se puede rechazar el archivo sin especificar la razón de rechazo",
                400
              );
            }

            // Asignar revisor y fecha
            if (!updatePayload.review.reviewedBy) {
              updatePayload.review.reviewedBy = userData.userId;
            }
            if (!updatePayload.review.reviewDate) {
              updatePayload.review.reviewDate = new Date();
            }
            break;

          case "OBSOLETE":
          case "ARCHIVED":
            // Para estados de archivo, registrar quién realizó la acción
            updatePayload.audit = updatePayload.audit || {};
            if (!updatePayload.audit.lastModifiedBy) {
              updatePayload.audit.lastModifiedBy = userData.userId;
            }
            break;
        }
      }

      // Validaciones específicas por estado
      if (updateData.status) {
        switch (updateData.status) {
          case "REVIEW":
            if (!updatePayload.review?.observations) {
              throw createError(
                ERROR_CODES.INVALID_OPERATION,
                "No se puede cambiar el estado a REVIEW sin observaciones",
                400
              );
            }
            break;

          case "APPROVED":
            if (!updatePayload.review?.observations) {
              throw createError(
                ERROR_CODES.INVALID_OPERATION,
                "No se puede cambiar el estado a APPROVED sin observaciones",
                400
              );
            }
            break;

          case "REJECTED":
            if (!updatePayload.review?.rejectionReason) {
              throw createError(
                ERROR_CODES.INVALID_OPERATION,
                "No se puede cambiar el estado a REJECTED sin razón de rechazo",
                400
              );
            }
            break;
        }
      }

      // Si hay observaciones en la revisión pero no hay revisor asignado
      if (
        updatePayload.review?.observations &&
        !updatePayload.review.reviewedBy
      ) {
        updatePayload.review.reviewedBy = userData.userId;
        updatePayload.review.reviewDate = new Date();
      }

      // Campos permitidos para actualización - EXPANDIDOS
      const allowedFields = [
        "status",
        "review.observations",
        "review.reviewedBy",
        "review.reviewDate",
        "review.approvedBy",
        "review.approvalDate",
        "review.rejectionReason",
        "displayName",
        "description",
        "documentType",
        "category",
        "systemName", // ✅ NUEVO: Para sincronización con rsync
        "storage.storageProvider", // ✅ NUEVO: Para info de almacenamiento
        "storage.path", // ✅ NUEVO: Para ruta de almacenamiento
        "access.isPublic",
        "access.allowedRoles",
        "access.allowedUsers",
        "rsyncInfo.remoteFileName", // ✅ NUEVO: Para sincronización
        "rsyncInfo.remotePath", // ✅ NUEVO: Para sincronización
        "rsyncInfo.syncStatus", // ✅ NUEVO: Para sincronización
        "rsyncInfo.lastSyncSuccess", // ✅ NUEVO: Para sincronización
        "rsyncInfo.syncError", // ✅ NUEVO: Para sincronización
        "rsyncInfo.syncRetries", // ✅ NUEVO: Para sincronización
        "rsyncInfo.priority",
        "rsyncInfo.keepLocal",
      ];
      console.log("Datos recbidos: ", JSON.stringify(updatePayload, null, 2));
      // Filtrar datos de actualización
      const filteredUpdate = this._filterUpdateFields(
        updatePayload,
        allowedFields
      );

      console.log(
        `📋 Campos a actualizar:`,
        JSON.stringify(filteredUpdate, null, 2)
      );

      // Si cambió el tipo de documento, actualizar categoría
      if (filteredUpdate.documentType) {
        filteredUpdate.category = this._categorizeFile(
          existingFile.fileInfo.mimeType,
          filteredUpdate.documentType
        );
      }

      // Actualizar archivo
      const updatedFile = await this.fileRepository.update(
        fileId,
        filteredUpdate,
        userData
      );

      //Agregar al Historial de Cambios
      await this.fileRepository.addChangeLogEntry(
        fileId,
        {
          userId: userData.userId,
          action: updateData.status,
          observations:
            updateData.observations || updateData.rejectionReason || "",
          source: "web",
          ipAddress: userData.ipAddress,
          userAgent: userData.userAgent,
        },
        userData
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
   * Filtrar campos permitidos para actualización (versión corregida)
   * @param {Object} updateData - Datos a actualizar
   * @param {Array} allowedFields - Campos permitidos
   * @returns {Object} Datos filtrados
   * @private
   */
  _filterUpdateFields(updateData, allowedFields) {
    const filtered = {};

    allowedFields.forEach((field) => {
      // Verificar si el campo existe directamente en updateData (notación de puntos como clave)
      if (updateData[field] !== undefined) {
        // El campo viene como "storage.path" en el objeto updateData
        // Necesitamos convertirlo a estructura anidada { storage: { path: value } }
        const fieldParts = field.split(".");
        let targetObj = filtered;

        for (let i = 0; i < fieldParts.length; i++) {
          const part = fieldParts[i];
          if (i === fieldParts.length - 1) {
            // Última parte - asignar el valor
            targetObj[part] = updateData[field];
          } else {
            // Partes intermedias - crear objetos si no existen
            if (!targetObj[part] || typeof targetObj[part] !== "object") {
              targetObj[part] = {};
            }
            targetObj = targetObj[part];
          }
        }
      }

      // También verificar si existe en estructura anidada (para compatibilidad)
      const fieldParts = field.split(".");
      let sourceValue = updateData;

      for (let i = 0; i < fieldParts.length; i++) {
        const part = fieldParts[i];
        if (sourceValue && sourceValue[part] !== undefined) {
          sourceValue = sourceValue[part];
        } else {
          sourceValue = undefined;
          break;
        }
      }

      // Si encontramos el valor en estructura anidada, construimos la estructura
      if (sourceValue !== undefined) {
        let targetObj = filtered;
        for (let i = 0; i < fieldParts.length; i++) {
          const part = fieldParts[i];
          if (i === fieldParts.length - 1) {
            targetObj[part] = sourceValue;
          } else {
            if (!targetObj[part] || typeof targetObj[part] !== "object") {
              targetObj[part] = {};
            }
            targetObj = targetObj[part];
          }
        }
      }
    });

    return filtered;
  }

  /**
   * Eliminar archivo (soft delete)
   * @param {String} fileId - ID del archivo
   * @param {Object} options - Opciones de eliminación
   * @returns {Promise<Object>} Resultado de la eliminación
   */
  async deleteFile(fileId, deleteType, user = {}) {
    validateObjectId(fileId, "ID del archivo");

    console.log(`🗑️ Service: Eliminando archivo: ${fileId}`);

    // Obtener archivo
    const file = await this.fileRepository.findById(fileId);
    if (!file) {
      throw createError(ERROR_CODES.NOT_FOUND, "Archivo no encontrado", 404);
    }

    // Verificar si ya está eliminado (para soft/complete)
    if (
      file.deletedAt &&
      (deleteType === "soft" || deleteType === "complete")
    ) {
      throw new Error("El archivo ya está marcado como eliminado");
    }

    let result = { message: "", data: null };

    try {
      switch (deleteType) {
        case "soft":
          // Solo marca deletedAt
          result.data = await this.fileRepository.softDelete(fileId, user);
          result.message = "Archivo marcado como eliminado exitosamente";
          break;

        case "physical":
          // Solo elimina archivo físico
          await this.deletePhysicalFile(file.storage);
          result.data = await this.fileRepository.update(fileId, {
            physicallyDeleted: true,
            physicallyDeletedAt: new Date(),
            physicallyDeletedBy: user._id,
          });
          result.message = "Archivo físico eliminado exitosamente";
          break;

        case "permanent":
          // Hard delete del registro
          await this.deletePhysicalFile(file.storage);
          await this.fileRepository.forceDelete(fileId, user);
          result.message =
            "Registro eliminado permanentemente de la base de datos";
          break;

        case "complete":
          // Elimina físico + soft delete
          await this.deletePhysicalFile(file.storage);
          result.data = await this.fileRepository.softDelete(fileId, user);
          await this.fileRepository.update(fileId, {
            storageProvider: "DELETED",
          });
          result.message =
            "Archivo eliminado completamente (físico y registro)";
          break;
      }

      return result;
    } catch (error) {
      console.error(`❌ Service: Error eliminando archivo: ${error.message}`);
      throw createError(
        ERROR_CODES.DELETE_ERROR,
        `Error al eliminar archivo: ${error.message}`,
        400
      );
    }
  }

  async deletePhysicalFile(storage) {
    const fs = require("fs").promises;
    try {
      switch (storage.storageProvider) {
        case "LOCAL":
          await fs.unlink(storage.localPath);
          break;
        case "AWS_S3":
          /*await s3Client.deleteObject({
            Bucket: storage.bucket,
            Key: storage.path,
          });*/
          break;
        case "AZURE":
          //await azureClient.deleteBlob(storage.container, storage.path);
          break;
        case "GOOGLE_CLOUD":
          //await googleClient.deleteBlob(storage.bucket, storage.path);
          break;
        case "RSYNC":
          await rsyncClient.deleteFile(storage.path);
          break;
        case "DELETED":
          break;
      }
    } catch (error) {
      if (error.code !== "ENOENT") {
        // Ignorar si el archivo no existe
        throw new Error(`Error al eliminar archivo físico: ${error.message}`);
      }
    }
  }

  // =============================================================================
  // OPERACIONES DE DESCARGA Y SERVICIO DE ARCHIVOS
  // =============================================================================

  /**
   * Descargar archivo del sistema (VERSIÓN CORREGIDA - SIN REDUNDANCIA)
   * @param {String} fileId - ID del archivo
   * @param {Object} options - Opciones de descarga
   * @returns {Promise<Object>} Stream y metadatos del archivo */
  /**
   * Descargar archivo del sistema (VERSIÓN CORREGIDA - SIN DUPLICADOS)
   */
  async downloadFile(fileId, options = {}) {
    const { source = "auto", userId = null, trackDownload = true } = options;

    try {
      console.log(`📥 Iniciando descarga de archivo: ${fileId}`);

      // 1. Obtener metadata del archivo
      const file = await this.fileRepository.findById(fileId);
      if (!file) {
        throw new AppError("Archivo no encontrado", 404, "FILE_NOT_FOUND");
      }

      const cacheKey = tempFileService.generateCacheKey(fileId, 1);

      // 2. VERIFICAR CACHÉ PRIMERO
      const cacheCheck = await tempFileService.isCached(fileId, 1);

      if (cacheCheck.cached) {
        console.log(`✅ Usando archivo desde caché: ${file.systemName}`);

        if (trackDownload && userId) {
          await this.trackDownload(fileId, userId, "cache");
        }

        const fileBuffer = await fs.readFile(cacheCheck.path);

        return {
          fileStream: fileBuffer,
          metadata: {
            id: file._id,
            originalName: file.originalName,
            systemName: file.systemName,
            mimeType: file.fileInfo.mimeType,
            size: file.fileInfo.size,
            source: "cache",
            checksum: file.fileInfo.checksum,
          },
        };
      }

      // 3. ADQUIRIR LOCK (si otro proceso está descargando, esperar)
      const lockResult = await tempFileService.acquireLock(
        fileId,
        file.version
      );

      // Si el lock indica que el archivo ya fue descargado por otro proceso
      if (lockResult.fromCache && lockResult.cachePath) {
        console.log(`♻️ Archivo descargado por otro proceso, usando caché`);

        const fileBuffer = await fs.readFile(lockResult.cachePath);

        if (trackDownload && userId) {
          await this.trackDownload(fileId, userId, "cache");
        }

        return {
          fileStream: fileBuffer,
          metadata: {
            id: file._id,
            originalName: file.originalName,
            systemName: file.systemName,
            mimeType: file.fileInfo.mimeType,
            size: file.fileInfo.size,
            source: "cache",
            checksum: file.fileInfo.checksum,
          },
        };
      }

      // 4. DESCARGAR ARCHIVO (este proceso tiene el lock)
      let cachePath;
      let fileSource;

      try {
        fileSource = this._determineDownloadSource(file, source);
        console.log(`📡 Descargando desde: ${fileSource}`);

        if (fileSource === "local") {
          cachePath = await this._downloadFromLocal(file);
        } else {
          // Descargar directamente al caché (sin archivos temporales intermedios)
          cachePath = await this._downloadFromRemote(file, cacheKey);
        }

        // Verificar descarga exitosa
        await fs.access(cachePath, fs.constants.R_OK);
        const stats = await fs.stat(cachePath);

        if (stats.size === 0) {
          throw new Error("Archivo descargado está vacío");
        }

        console.log(
          `✅ Descarga completada: ${file.systemName} (${stats.size} bytes)`
        );

        // Guardar metadata en caché
        tempFileService.registerCache(cacheKey, {
          path: cachePath,
          size: stats.size,
          fileId,
          version: file.version,
        });

        // Liberar lock con éxito
        tempFileService.releaseLock(lockResult.lockKey, cachePath);

        // Leer y retornar archivo
        const cachedBuffer = await fs.readFile(cachePath);

        if (trackDownload && userId) {
          await this.trackDownload(fileId, userId, fileSource);
        }

        return {
          fileStream: cachedBuffer,
          metadata: {
            id: file._id,
            originalName: file.originalName,
            systemName: file.systemName,
            mimeType: file.fileInfo.mimeType,
            size: file.fileInfo.size,
            source: fileSource,
            checksum: file.fileInfo.checksum,
          },
        };
      } catch (downloadError) {
        // Liberar lock con error
        tempFileService.releaseLock(lockResult.lockKey, null);

        // Limpiar archivo parcial si existe
        if (cachePath) {
          await fs.unlink(cachePath).catch(() => {});
        }

        throw downloadError;
      }
    } catch (error) {
      console.error(`❌ Error en downloadFile: ${error.message}`);
      throw error;
    }
  }

  // Aumentar contador de viewCount y/o downloadCount
  async trackViewOrDownload(fileId, userId, source, isDownload) {
    console.log(
      `📊 Registrando ${isDownload ? "descarga" : "vista"} para ${fileId}`
    );
    try {
      if (isDownload) {
        await this.fileRepository.incrementDownloadCount(fileId, {
          userId,
          source,
          timestamp: new Date(),
        });
      } else {
        await this.fileRepository.incrementViewCount(fileId, {
          userId,
          source,
          timestamp: new Date(),
        });
      }
    } catch (error) {
      console.error(`❌ Error en trackViewOrDownload: ${error.message}`);
      throw error;
    }
  }

  /**
   * Registrar descarga de archivo
   */
  async trackDownload(fileId, userId, source) {
    try {
      await this.fileRepository.incrementDownloads(fileId, {
        userId,
        source,
        timestamp: new Date(),
      });
      console.log(`📊 Descarga registrada: ${fileId} por ${userId}`);
    } catch (error) {
      console.warn(`⚠️ Error registrando descarga: ${error.message}`);
    }
  }

  /**
   * Descargar desde almacenamiento local (VERSIÓN CORREGIDA)
   */
  async _downloadFromLocal(file) {
    const filePath = file.storage.localPath;

    // Verificar que existe localmente
    try {
      await fs.access(filePath);
      // ✅ CORRECCIÓN: Devolver la RUTA, no el contenido
      return filePath;
    } catch (error) {
      throw createError(
        ERROR_CODES.FILE_NOT_FOUND,
        "Archivo no encontrado en almacenamiento local",
        404
      );
    }
  }

  /**
   * Descargar desde servidor remoto via RSync (DIRECTAMENTE AL CACHÉ)
   */
  async _downloadFromRemote(file, cacheKey) {
    console.log(
      `🌐 Service: Descargando desde servidor remoto: ${file.systemName}`
    );

    if (!file.storage?.path) {
      throw createError(
        ERROR_CODES.CONFIG_ERROR,
        "El archivo no tiene configuración de almacenamiento remoto",
        500
      );
    }

    try {
      // ✅ CORRECCIÓN: Descargar DIRECTAMENTE a la ruta de caché (sin temporales)
      const cacheDir = tempFileService.TEMP_DIR;
      await fs.mkdir(cacheDir, { recursive: true });

      const timestamp = Date.now();
      const cacheFileName = `cache_${cacheKey}_${timestamp}`;
      const cachePath = path.join(cacheDir, cacheFileName);

      console.log(`⬇️ Service: Descargando directamente a caché: ${cachePath}`);

      // Ejecutar rsync para descargar el archivo
      const result = await this._executeRsyncDownload(
        file.storage.path,
        cachePath
      );

      if (!result.success) {
        throw new Error(`Error en rsync: ${result.error}`);
      }

      // Verificar que el archivo se descargó correctamente
      await fs.access(cachePath);
      const stats = await fs.stat(cachePath);

      if (stats.size === 0) {
        throw new Error("Archivo descargado está vacío");
      }

      console.log(`✅ Archivo descargado: ${cachePath} (${stats.size} bytes)`);

      // Retornar la ruta del archivo en caché (NO el contenido)
      return cachePath;
    } catch (error) {
      console.error(`❌ Service: Error en descarga remota: ${error.message}`);

      // Mapear errores específicos de rsync
      if (error.message.includes("No such file or directory")) {
        throw createError(
          ERROR_CODES.FILE_NOT_FOUND,
          "Archivo no encontrado en el servidor remoto",
          404
        );
      } else if (error.message.includes("Permission denied")) {
        throw createError(
          ERROR_CODES.PERMISSION_DENIED,
          "Sin permisos para acceder al archivo remoto",
          403
        );
      } else if (
        error.message.includes("Connection refused") ||
        error.message.includes("Network is unreachable")
      ) {
        throw createError(
          ERROR_CODES.SERVICE_UNAVAILABLE,
          "No se puede conectar al servidor remoto",
          503
        );
      } else {
        throw createError(
          ERROR_CODES.INTERNAL_ERROR,
          `Error descargando archivo remoto: ${error.message}`,
          500
        );
      }
    }
  }

  /**
   * Ejecutar rsync para descargar archivo
   */
  async _executeRsyncDownload(remotePath, localPath) {
    try {
      console.log(
        `🔄 Service: Ejecutando rsync download: ${remotePath} -> ${localPath}`
      );

      const { host, user, module, port } = rsyncClient.config;

      console.log("user", user);
      console.log("host", host);
      console.log("port", port);
      console.log("module", module);
      console.log("remotePath", remotePath);
      console.log("localPath", localPath);

      // CORRECCIÓN: El módulo rsync ya incluye la ruta base (/srv/expediente_data)
      // No necesitamos agregar "srv/expediente_data" nuevamente
      const remoteUrl = `rsync://${user}@${host}:${port}/${module}/${remotePath}`;

      // CORRECCIÓN: Para descarga, el ORDEN es crucial:
      // ORIGEN: remoteUrl (archivo en servidor rsync)
      // DESTINO: localPath (archivo local)
      const formattedLocalPath = rsyncClient.formatPathForRsync(localPath);

      console.log(`🔗 Service: URL remota (origen): ${remoteUrl}`);
      console.log(`📁 Service: Ruta local (destino): ${formattedLocalPath}`);

      // CORRECCIÓN: Ejecutar rsync con el orden correcto
      // rsync [ORIGEN] [DESTINO] -> rsync [remoto] [local]
      const result = await rsyncClient.executeRsync(
        remoteUrl, // ORIGEN (remoto)
        formattedLocalPath // DESTINO (local)
      );

      return {
        success: true,
        result,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Obtener archivo desde caché temporal (VERSIÓN CORREGIDA)
   */
  async _getCachedFile(file) {
    try {
      const fileId = file._id.toString();
      const version = file.version;

      // Usar el método correcto: isCached
      const cacheCheck = await tempFileService.isCached(fileId, version);

      if (cacheCheck.cached) {
        console.log(`✅ Cache HIT: ${fileId}`);
        // ✅ CORRECCIÓN: Devolver metadata con la ruta, no el contenido
        return {
          path: cacheCheck.path,
          metadata: cacheCheck.metadata,
        };
      }

      console.log(`📭 Cache MISS: ${fileId}`);
      return null;
    } catch (error) {
      console.warn(`⚠️ Service: Error accediendo a caché: ${error.message}`);
      return null;
    }
  }

  /**
   * Guardar archivo en caché temporal
   */
  async _cacheFile(file, tempFilePath) {
    try {
      const fileId = file._id.toString();
      const version = file.version;

      // Verificar que tempFilePath es una ruta válida (string)
      if (typeof tempFilePath !== "string") {
        throw new Error("tempFilePath debe ser una ruta de archivo string");
      }

      // Verificar que el archivo existe
      await fs.access(tempFilePath);

      // Usar el método correcto: saveToCache
      const cachePath = await tempFileService.saveToCache(
        fileId,
        tempFilePath,
        version
      );

      console.log(`💾 Service: Archivo guardado en caché: ${file.storedName}`);
      return cachePath;
    } catch (error) {
      console.warn(`⚠️ Service: Error guardando en caché: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generar clave única para caché
   */
  _getCacheKey(file) {
    return `cache_${file._id}_${file.fileInfo.checksum}`;
  }

  /**
   * Determinar fuente de descarga
   */
  _determineDownloadSource(file, preferredSource) {
    if (preferredSource !== "auto") {
      return preferredSource;
    }

    // Lógica automática para determinar la mejor fuente
    const hasLocal = file.storage?.storageProvider === "LOCAL";
    const hasRemote = file.storage?.storageProvider === "RSYNC";

    if (hasLocal) {
      return "local";
    } else if (hasRemote) {
      return "remote";
    } else {
      throw createError(
        ERROR_CODES.CONFIG_ERROR,
        "El archivo no tiene fuentes de descarga configuradas",
        500
      );
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
      query["contract"] = filters.contractId;
    }

    if (filters.phaseId) {
      query["phase"] = filters.phaseId;
    }

    if (filters.documentType) {
      query["documentType"] = filters.documentType;
    }

    if (filters.category) {
      query["documentInfo.category"] = filters.category;
    }

    if (filters.systemName) {
      query["systemName"] = filters.systemName;
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
   * Poblar datos del archivo con información relacionada
   * @param {Object} file - Archivo base
   * @returns {Promise<Object>} Archivo poblado
   * @private
   */
  async _populateFileData(file) {
    return await this.fileRepository.findById(file._id, {
      populate: [
        {
          path: "contract",
          select: "contractNumber contractualObject generalStatus",
        },
        {
          path: "phase",
          select: "code name category order",
        },
        {
          path: "audit.uploadedBy",
          select: "name last_name email",
          model: "user",
        },
      ],
    });
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
