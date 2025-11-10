// =============================================================================
// src/module/exp-digital/controllers/file.controller.js
// Controlador para gestión de archivos del expediente digital con RSync
// GADM Cantón Esmeraldas - Sistema de Contratación Pública
// =============================================================================

import { FileService } from "../services/file.service.js";
import {
  requirePermission,
  requireAnyPermission,
  requireFlexiblePermissions,
} from "../../../middlewares/permission.middleware.js";
import { auth, verifyModuleAccess } from "../../../middlewares/auth.js";
import { crearMiddlewareArchivos } from "../../../middlewares/files.middleware.js";
import {
  createError,
  createValidationError,
  ERROR_CODES,
} from "../../../../utils/error.util.js";
import {
  validateObjectId,
  validateRequiredFields,
} from "../../../../utils/validation.util.js";

export class FileController {
  constructor() {
    this.fileService = new FileService();

    // Configurar middleware de archivos para documentos
    this.uploadMiddleware = crearMiddlewareArchivos({
      destino: "expediente-digital",
      maxTamaño: 100, // 100MB para documentos
      campoNombre: "files",
      maxArchivos: 10,
      tiposPermitidos: [
        ".pdf",
        ".doc",
        ".docx",
        ".xls",
        ".xlsx",
        ".ppt",
        ".pptx",
        ".jpg",
        ".jpeg",
        ".png",
        ".gif",
        ".webp",
        ".txt",
        ".csv",
        ".zip",
        ".rar",
      ],
      optimizarImagenes: true,
    });
  }

  // =============================================================================
  // OPERACIONES CRUD DE ARCHIVOS
  // =============================================================================

  /**
   * Subir archivos al sistema
   * POST /files/upload
   * Permisos: documents.canUpload
   */
  uploadFiles = async (req, res) => {
    try {
      const { user, body, files } = req;

      console.log(
        `📤 Usuario ${user.userId} subiendo ${files?.length || 0} archivo(s)`
      );

      if (!files || files.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No se recibieron archivos para subir",
          code: "NO_FILES_UPLOADED",
        });
      }

      // Extraer metadatos del body
      const {
        contractId,
        phaseId,
        documentType = "OTROS",
        description = "",
        isPublic = false,
        allowedRoles = [],
        allowedUsers = [],
        priority = "NORMAL",
        keepLocal = true,
      } = body;

      // Procesar archivos en paralelo
      const uploadPromises = files.map(async (file, index) => {
        try {
          const metadata = {
            contractId,
            phaseId,
            documentType: Array.isArray(documentType)
              ? documentType[index] || "OTROS"
              : documentType,
            description: Array.isArray(description)
              ? description[index] || ""
              : description,
            isPublic: isPublic === "true",
            allowedRoles:
              typeof allowedRoles === "string"
                ? allowedRoles.split(",")
                : allowedRoles,
            allowedUsers:
              typeof allowedUsers === "string"
                ? allowedUsers.split(",")
                : allowedUsers,
            priority,
            keepLocal: keepLocal === "true",
            uploadedBy: user.userId,
          };

          return await this.fileService.uploadFile(file, metadata, {
            ipAddress: req.ip,
            userAgent: req.get("User-Agent"),
          });
        } catch (error) {
          console.error(
            `❌ Error subiendo archivo ${file.originalname}: ${error.message}`
          );
          return {
            success: false,
            originalName: file.originalname,
            error: error.message,
          };
        }
      });

      const results = await Promise.all(uploadPromises);

      // Separar exitosos y fallidos
      const successful = results.filter((r) => r.success !== false);
      const failed = results.filter((r) => r.success === false);

      console.log(
        `✅ Subida completada: ${successful.length} exitosos, ${failed.length} fallidos`
      );

      res.status(successful.length > 0 ? 201 : 400).json({
        success: successful.length > 0,
        data: {
          successful,
          failed,
          summary: {
            total: results.length,
            uploaded: successful.length,
            failed: failed.length,
          },
        },
        message:
          successful.length === results.length
            ? "Todos los archivos subidos exitosamente"
            : `${successful.length}/${results.length} archivos subidos exitosamente`,
        metadata: {
          uploadedBy: user.userId,
          uploadedAt: new Date(),
        },
      });
    } catch (error) {
      console.error(`❌ Error en controlador de subida: ${error.message}`);

      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Error interno del servidor",
        code: error.code || "UPLOAD_ERROR",
      });
    }
  };

  /**
   * Obtener todos los archivos con filtros
   * GET /files
   * Permisos: documents.canView
   */
  getAllFiles = async (req, res) => {
    try {
      const { user, query } = req;

      console.log(`📋 Usuario ${user.userId} consultando archivos`);

      // Extraer parámetros de consulta
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
      } = query;

      // Preparar filtros
      const filters = {
        page: parseInt(page),
        limit: parseInt(limit),
        contractId,
        phaseId,
        documentType,
        category,
        syncStatus,
        uploadedBy,
        dateFrom: dateFrom ? new Date(dateFrom) : null,
        dateTo: dateTo ? new Date(dateTo) : null,
        search,
        sortBy,
        sortOrder,
        includeDeleted: includeDeleted === "true",
      };
      console.log("Filters: ", filters);

      const result = await this.fileService.getAllFiles(filters);

      console.log(
        `✅ Archivos devueltos: ${result.files.length}/${result.pagination.totalFiles}`
      );

      res.status(200).json({
        success: true,
        data: {
          files: result.files,
          pagination: result.pagination,
          summary: {
            total: result.pagination.totalFiles,
            showing: result.files.length,
            page: result.pagination.currentPage,
            pages: result.pagination.totalPages,
          },
        },
        filters: result.appliedFilters,
        metadata: {
          requestedBy: user.userId,
          requestedAt: new Date(),
        },
      });
    } catch (error) {
      console.error(`❌ Error obteniendo archivos: ${error.message}`);

      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Error interno del servidor",
        code: error.code || "GET_FILES_ERROR",
      });
    }
  };

  /**
   * Obtener archivo por ID
   * GET /files/:id
   * Permisos: documents.canView + acceso al archivo específico
   */
  getFileById = async (req, res) => {
    try {
      const { user, params, query } = req;
      const { id } = params;
      const { includeContent = false } = query;

      console.log(`🔍 Usuario ${user.userId} consultando archivo: ${id}`);

      validateObjectId(id, "ID del archivo");

      const result = await this.fileService.getFileById(id, {
        includeContent: includeContent === "true",
      });

      if (!result) {
        return res.status(404).json({
          success: false,
          message: "Archivo no encontrado",
          code: "FILE_NOT_FOUND",
        });
      }

      // TODO: Verificar permisos específicos del archivo aquí
      // if (!result.file.canUserAccess(user.userId, user.role)) { ... }

      console.log(`✅ Archivo encontrado: ${result.file.originalName}`);

      res.status(200).json({
        success: true,
        data: result,
        metadata: {
          requestedBy: user.userId,
          requestedAt: new Date(),
          options: {
            includeContent: includeContent === "true",
          },
        },
      });
    } catch (error) {
      console.error(`❌ Error obteniendo archivo: ${error.message}`);

      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Error interno del servidor",
        code: error.code || "GET_FILE_ERROR",
      });
    }
  };

  getFileHistory = async (req, res) => {
    try {
      const { user, params } = req;
      const { id } = params;

      console.log(
        `📋 Usuario ${user.userId} consultando historial de archivo: ${id}`
      );

      validateObjectId(id, "ID del archivo");

      const result = await this.fileService.getFileById(id);
      if (!result) {
        return res.status(404).json({
          success: false,
          message: "Archivo no encontrado",
          code: "FILE_NOT_FOUND",
        });
      }

      const history = result.file.access.history;

      console.log(`✅ Historial obtenido: ${history.length} entradas`);

      res.status(200).json({
        success: true,
        data: history,
        metadata: {
          requestedBy: user.userId,
          requestedAt: new Date(),
        },
      });
    } catch (error) {
      console.error(
        `❌ Error obteniendo historial de archivo: ${error.message}`
      );

      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Error interno del servidor",
        code: error.code || "GET_FILE_HISTORY_ERROR",
      });
    }
  };

  /**
   * Actualizar metadatos del archivo
   * PUT /files/:id
   * Permisos: documents.canEdit + propiedad del archivo
   */
  updateFile = async (req, res) => {
    try {
      const { user, params, body } = req;
      const { id } = params;

      console.log(`✏️ Usuario ${user.userId} actualizando archivo: ${id}`);

      validateObjectId(id, "ID del archivo");

      // TODO: Verificar que el usuario sea propietario o tenga permisos especiales

      const updatedFile = await this.fileService.updateFile(id, body, user);

      console.log(`✅ Archivo actualizado: ${updatedFile.originalName}`);

      res.status(200).json({
        success: true,
        data: updatedFile,
        message: "Archivo actualizado exitosamente",
        metadata: {
          updatedBy: user.userId,
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      console.error(`❌ Error actualizando archivo: ${error.message}`);

      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Error interno del servidor",
        code: error.code || "UPDATE_FILE_ERROR",
      });
    }
  };

  /**
   * Eliminar archivo
   * DELETE /files/:id
   * Permisos: documents.canDelete + propiedad del archivo
   */
  deleteFile = async (req, res) => {
    try {
      const { user, params, body } = req;
      const { id } = params;
      const {
        deleteLocal = false,
        deleteRemote = false,
        reason = "Eliminación solicitada por usuario",
      } = body;

      console.log(`🗑️ Usuario ${user.userId} eliminando archivo: ${id}`);

      validateObjectId(id, "ID del archivo");

      // TODO: Verificar que el usuario sea propietario o tenga permisos especiales

      const result = await this.fileService.deleteFile(
        id,
        {
          deleteLocal: deleteLocal === true,
          deleteRemote: deleteRemote === true,
          deletedBy: user.userId,
          reason,
        },
        user
      );

      console.log(`✅ Archivo eliminado: ${result.fileName}`);

      res.status(200).json({
        success: true,
        data: result,
        message: "Archivo eliminado exitosamente",
        metadata: {
          deletedBy: user.userId,
          deletedAt: new Date(),
        },
      });
    } catch (error) {
      console.error(`❌ Error eliminando archivo: ${error.message}`);

      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Error interno del servidor",
        code: error.code || "DELETE_FILE_ERROR",
      });
    }
  };

  // =============================================================================
  // OPERACIONES DE DESCARGA
  // =============================================================================

  /**
   * Descargar archivo
   * GET /files/:id/download
   * Permisos: documents.canDownload + acceso al archivo
   */
  downloadFile = async (req, res) => {
    try {
      const { user, params, query } = req;
      const { id } = params;
      const { source = "auto", track = true } = query;

      console.log(`📥 Usuario ${user.userId} descargando archivo: ${id}`);

      validateObjectId(id, "ID del archivo");

      const result = await this.fileService.downloadFile(id, {
        source,
        userId: user.userId,
        trackDownload: track === "true",
      });
      await this.fileService.trackViewOrDownload(id, user.userId, "api", true);
      // TODO: Verificar permisos de descarga específicos del archivo

      console.log(
        `✅ Descarga preparada: ${result.metadata.originalName}`,
        JSON.stringify(result.metadata, null, 2)
      );

      // Configurar headers para descarga
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${result.metadata.originalName}"`
      );
      res.setHeader("Content-Type", result.metadata.mimeType);
      res.setHeader("Content-Length", result.metadata.size);
      res.setHeader("X-File-Source", result.metadata.source);
      //res.setHeader("X-File-Checksum", result.metadata.checksum);

      // Enviar archivo
      res.status(200).send(result.fileStream);
    } catch (error) {
      console.error(`❌ Error descargando archivo: ${error.message}`);

      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Error interno del servidor",
        code: error.code || "DOWNLOAD_ERROR",
      });
    }
  };

  /**
   * Previsualizar archivo (para imágenes y PDFs)
   * GET /files/:id/preview
   * Permisos: documents.canView + acceso al archivo
   */
  previewFile = async (req, res) => {
    try {
      const { user, params } = req;
      const { id } = params;

      console.log(`👁️ Usuario ${user.userId} previsualizando archivo: ${id}`);

      validateObjectId(id, "ID del archivo");

      const result = await this.fileService.downloadFile(id, {
        source: "auto",
        userId: user.userId,
        trackDownload: false, // No trackear previsualizaciones
      });

      // Verificar que el archivo sea previsualizable
      const previewableTypes = [
        "application/pdf",
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/gif",
        "image/webp",
        "image/svg+xml",
      ];
      const isPreviewable = previewableTypes.some((type) =>
        result.metadata.mimeType.startsWith(type)
      );

      if (!isPreviewable) {
        return res.status(400).json({
          success: false,
          message: "Este tipo de archivo no es previsualizable",
          code: "NOT_PREVIEWABLE",
        });
      }

      await this.fileService.trackViewOrDownload(id, user.userId, "api", false);
      // ========================================
      // 🔧 FIX: CONFIGURAR HEADERS CSP PARA IFRAME
      // ========================================

      // Headers de seguridad para permitir iframe desde el frontend
      res.setHeader("Content-Type", result.metadata.mimeType);
      res.setHeader("Content-Length", result.metadata.size);
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${result.metadata.originalName}"`
      );

      // ✅ CSP MÁS FLEXIBLE PARA PREVIEW
      const allowedDomains = [
        "'self'",
        "http://localhost:*",
        "http://127.0.0.1:*",
        "https://*.*.gob.ec",
      ].join(" ");

      res.setHeader(
        "Content-Security-Policy",
        `frame-ancestors ${allowedDomains}`
      );

      // Headers de seguridad adicionales
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("X-Frame-Options", "ALLOW-FROM https://*.gob.ec"); // Compatibilidad legacy

      // Cache para mejorar rendimiento
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.setHeader("X-File-Source", result.metadata.source);
      res.setHeader("X-File-Id", result.metadata.id);

      // ========================================
      // ENVIAR ARCHIVO
      // ========================================
      res.status(200).send(result.fileStream);
    } catch (error) {
      console.error(`❌ Error previsualizando archivo: ${error.message}`);

      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Error interno del servidor",
        code: error.code || "PREVIEW_ERROR",
      });
    }
  };

  // =============================================================================
  // OPERACIONES DE RSYNC Y SINCRONIZACIÓN
  // =============================================================================

  /**
   * Sincronizar archivo específico
   * POST /files/:id/sync
   * Permisos: special.canManageFiles (administradores)
   */
  syncFile = async (req, res) => {
    try {
      const { user, params, body } = req;
      const { id } = params;
      const {
        forcePriority = null,
        resetRetries = false,
        updatePriority = false,
      } = body;

      console.log(`🔄 Usuario ${user.userId} sincronizando archivo: ${id}`);

      validateObjectId(id, "ID del archivo");

      const result = await this.fileService.syncFile(id, {
        forcePriority,
        resetRetries,
        updatePriority,
      });

      console.log(`✅ Sincronización ${result.status}: ${result.systemName}`);

      res.status(200).json({
        success: true,
        data: result,
        message: `Archivo ${result.status === "SYNCED" ? "sincronizado" : "falló sincronización"}`,
        metadata: {
          syncedBy: user.userId,
          syncedAt: new Date(),
        },
      });
    } catch (error) {
      console.error(`❌ Error sincronizando archivo: ${error.message}`);

      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Error interno del servidor",
        code: error.code || "SYNC_ERROR",
      });
    }
  };

  /**
   * Procesar cola de sincronización
   * POST /files/sync/process-queue
   * Permisos: special.canManageFiles (administradores)
   */
  processRsyncQueue = async (req, res) => {
    try {
      const { user, body } = req;
      const { batchSize = 10, priorityFirst = true, maxRetries = 3 } = body;

      console.log(
        `⚡ Usuario ${user.userId} procesando cola rsync (lote: ${batchSize})`
      );

      const result = await this.fileService.processRsyncQueue({
        batchSize,
        priorityFirst,
        maxRetries,
      });

      console.log(
        `✅ Cola procesada: ${result.successful}/${result.processed} exitosos`
      );

      res.status(200).json({
        success: true,
        data: result,
        message:
          result.processed > 0
            ? `Cola procesada: ${result.successful}/${result.processed} archivos sincronizados`
            : "No hay archivos pendientes de sincronización",
        metadata: {
          processedBy: user.userId,
          processedAt: new Date(),
        },
      });
    } catch (error) {
      console.error(`❌ Error procesando cola: ${error.message}`);

      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Error interno del servidor",
        code: error.code || "QUEUE_PROCESS_ERROR",
      });
    }
  };

  /**
   * Obtener estado de la cola de sincronización
   * GET /files/sync/queue-status
   * Permisos: special.canManageFiles (administradores)
   */
  getRsyncQueueStatus = async (req, res) => {
    try {
      const { user } = req;

      console.log(`📊 Usuario ${user.userId} consultando estado de cola rsync`);

      const result = await this.fileService.getRsyncQueueStatus();

      console.log(`✅ Estado de cola obtenido`);

      res.status(200).json({
        success: true,
        data: result,
        metadata: {
          requestedBy: user.userId,
          requestedAt: new Date(),
        },
      });
    } catch (error) {
      console.error(`❌ Error obteniendo estado de cola: ${error.message}`);

      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Error interno del servidor",
        code: error.code || "QUEUE_STATUS_ERROR",
      });
    }
  };

  // =============================================================================
  // OPERACIONES DE ESTADÍSTICAS Y REPORTES
  // =============================================================================

  /**
   * Obtener estadísticas de archivos
   * GET /files/statistics
   * Permisos: documents.canView
   */
  getFilesStatistics = async (req, res) => {
    try {
      const { user, query } = req;
      const { contractId, phaseId, period = "month" } = query;

      console.log(
        `📊 Usuario ${user.userId} consultando estadísticas de archivos`
      );

      const result = await this.fileService.getFilesStatistics({
        contractId,
        phaseId,
        period,
      });

      console.log(`✅ Estadísticas generadas exitosamente`);

      res.status(200).json({
        success: true,
        data: result,
        metadata: {
          requestedBy: user.userId,
          requestedAt: new Date(),
        },
      });
    } catch (error) {
      console.error(`❌ Error obteniendo estadísticas: ${error.message}`);

      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Error interno del servidor",
        code: error.code || "STATISTICS_ERROR",
      });
    }
  };

  // =============================================================================
  // OPERACIONES DE UTILIDADES
  // =============================================================================

  /**
   * Obtener tipos de documentos disponibles
   * GET /files/document-types
   * Permisos: Acceso básico al módulo
   */
  getDocumentTypes = async (req, res) => {
    try {
      const { user } = req;

      console.log(`📋 Usuario ${user.userId} consultando tipos de documentos`);

      const documentTypes = this.fileService.config.documentTypes;

      res.status(200).json({
        success: true,
        data: {
          documentTypes,
          categories: [
            "LEGAL_REQUIRED",
            "IMAGE",
            "DOCUMENT_PDF",
            "SPREADSHEET",
            "DOCUMENT_TEXT",
            "OTHER",
          ],
        },
        metadata: {
          requestedBy: user.userId,
          requestedAt: new Date(),
          totalTypes: Object.keys(documentTypes).length,
        },
      });
    } catch (error) {
      console.error(
        `❌ Error obteniendo tipos de documentos: ${error.message}`
      );

      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Error interno del servidor",
        code: error.code || "DOCUMENT_TYPES_ERROR",
      });
    }
  };

  /**
   * Validar archivos antes de subir
   * POST /files/validate
   * Permisos: documents.canUpload
   */
  validateFiles = async (req, res) => {
    try {
      const { user, body } = req;
      const { files = [] } = body;

      console.log(
        `✅ Usuario ${user.userId} validando ${files.length} archivo(s)`
      );

      const validationResults = files.map((file) => {
        const errors = [];
        const warnings = [];

        // Validar tamaño
        if (file.size > this.fileService.config.maxFileSize) {
          errors.push(
            `Archivo demasiado grande: ${Math.round(file.size / 1024 / 1024)}MB (máximo: ${Math.round(this.fileService.config.maxFileSize / 1024 / 1024)}MB)`
          );
        }

        // Validar tipo
        const extension = file.name.split(".").pop().toLowerCase();
        if (!this.fileService.config.allowedTypes.includes(extension)) {
          errors.push(`Tipo de archivo no permitido: .${extension}`);
        }

        // Validar nombre
        if (file.name.length > 255) {
          errors.push(
            "Nombre de archivo demasiado largo (máximo 255 caracteres)"
          );
        }

        // Advertencias
        if (file.size > 10 * 1024 * 1024) {
          // 10MB
          warnings.push("Archivo grande, la subida puede tomar tiempo");
        }

        return {
          fileName: file.name,
          size: file.size,
          type: file.type,
          extension,
          isValid: errors.length === 0,
          errors,
          warnings,
        };
      });

      const summary = {
        total: files.length,
        valid: validationResults.filter((r) => r.isValid).length,
        invalid: validationResults.filter((r) => !r.isValid).length,
      };

      console.log(
        `✅ Validación completada: ${summary.valid}/${summary.total} válidos`
      );

      res.status(200).json({
        success: true,
        data: {
          results: validationResults,
          summary,
          config: {
            maxFileSize: this.fileService.config.maxFileSize,
            allowedTypes: this.fileService.config.allowedTypes,
          },
        },
        metadata: {
          validatedBy: user.userId,
          validatedAt: new Date(),
        },
      });
    } catch (error) {
      console.error(`❌ Error validando archivos: ${error.message}`);

      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Error interno del servidor",
        code: error.code || "VALIDATION_ERROR",
      });
    }
  };

  /**
   * Buscar archivos con filtros avanzados
   * POST /files/search
   * Permisos: documents.canView
   */
  searchFiles = async (req, res) => {
    try {
      const { user, body } = req;

      console.log(`🔍 Usuario ${user.userId} realizando búsqueda de archivos`);

      const searchFilters = {
        ...body,
        page: body.page || 1,
        limit: body.limit || 20,
      };

      const result = await this.fileService.getAllFiles(searchFilters);

      console.log(`✅ Búsqueda completada: ${result.files.length} resultados`);

      res.status(200).json({
        success: true,
        data: result,
        searchCriteria: searchFilters,
        metadata: {
          searchedBy: user.userId,
          searchedAt: new Date(),
        },
      });
    } catch (error) {
      console.error(`❌ Error en búsqueda de archivos: ${error.message}`);

      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Error interno del servidor",
        code: error.code || "SEARCH_ERROR",
      });
    }
  };

  /**
   * Limpiar archivos huérfanos (sin referencias en contratos)
   * DELETE /files/cleanup
   * Permisos: special.canManageFiles (administradores)
   */
  cleanupOrphanFiles = async (req, res) => {
    try {
      const { user, body } = req;
      const { dryRun = true, olderThanDays = 30, deleteLocal = false } = body;

      console.log(
        `🧹 Usuario ${user.userId} ${dryRun ? "simulando" : "ejecutando"} limpieza de archivos`
      );

      // TODO: Implementar limpieza de archivos huérfanos
      // Esta funcionalidad requiere verificar qué archivos no están referenciados
      // en ningún contrato activo y han estado sin referencias por X días

      const result = {
        dryRun,
        found: 0,
        cleaned: 0,
        message: "Funcionalidad de limpieza en desarrollo",
      };

      res.status(200).json({
        success: true,
        data: result,
        message: dryRun
          ? "Simulación de limpieza completada"
          : "Limpieza de archivos completada",
        metadata: {
          cleanedBy: user.userId,
          cleanedAt: new Date(),
        },
      });
    } catch (error) {
      console.error(`❌ Error en limpieza de archivos: ${error.message}`);

      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Error interno del servidor",
        code: error.code || "CLEANUP_ERROR",
      });
    }
  };
}
