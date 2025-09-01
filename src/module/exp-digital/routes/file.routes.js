// =============================================================================
// src/module/exp-digital/routes/file.routes.js
// Router para gestión de archivos con integración RSync
// GADM Cantón Esmeraldas - Módulo de Expediente Digital
// =============================================================================

import { Router } from "express";
import { FileController } from "../controllers/file.controller.js";
import { uploadMiddleware } from "../../../middlewares/files.middleware.js";

const router = Router();
const controller = new FileController();

// =============================================================================
// OPERACIONES PRINCIPALES DE ARCHIVOS
// =============================================================================

/**
 * POST /files/upload
 * Subir archivo individual con configuración RSync
 * Permisos: documents.canUpload
 * Form data: file, contractId, phaseId, documentType, description, etc.
 */
router.post("/upload", uploadMiddleware.single("file"), controller.uploadFile);

/**
 * GET /files/:fileId/download
 * Descargar archivo desde local o remoto
 * Query params: source (auto, local, remote)
 * Permisos: documents.canDownload + acceso al archivo
 */
router.get("/:fileId/download", controller.downloadFile);

/**
 * GET /files/:fileId
 * Obtener información detallada del archivo
 * Permisos: documents.canView + acceso al archivo
 */
router.get("/:fileId", controller.getFileById);

/**
 * PUT /files/:fileId
 * Actualizar metadatos del archivo
 * Body: description, documentType, isPublic, allowedRoles
 * Permisos: documents.canManageAll + acceso al archivo
 */
router.put("/:fileId", controller.updateFileMetadata);

/**
 * DELETE /files/:fileId
 * Eliminar archivo (soft delete + cleanup RSync)
 * Permisos: documents.canDelete + acceso al archivo
 */
router.delete("/:fileId", controller.deleteFile);

// =============================================================================
// OPERACIONES DE BÚSQUEDA Y FILTRADO
// =============================================================================

/**
 * GET /files
 * Buscar archivos con filtros avanzados
 * Query params: search, contractId, phaseId, documentType, uploadedBy, etc.
 * Permisos: documents.canView + filtros por permisos
 */
router.get("/", controller.searchFiles);

/**
 * GET /files/contract/:contractId
 * Obtener archivos de un contrato específico
 * Query params: phaseId, documentType, includeDeleted
 * Permisos: documents.canView + acceso al contrato
 */
router.get("/contract/:contractId", controller.getFilesByContract);

/**
 * GET /files/phase/:phaseId
 * Obtener archivos de una fase específica
 * Query params: documentType, sortBy, order
 * Permisos: documents.canView + acceso a la fase
 */
router.get("/phase/:phaseId", controller.getFilesByPhase);

/**
 * GET /files/user/:userId
 * Obtener archivos subidos por un usuario
 * Query params: dateFrom, dateTo, status
 * Permisos: documents.canView + (own files o admin)
 */
router.get("/user/:userId", controller.getFilesByUser);

/**
 * GET /files/department/:departmentId
 * Obtener archivos de un departamento
 * Permisos: documents.canView + acceso departamental
 */
router.get("/department/:departmentId", controller.getFilesByDepartment);

// =============================================================================
// OPERACIONES RSYNC ESPECÍFICAS
// =============================================================================

/**
 * POST /files/:fileId/sync
 * Forzar sincronización RSync de archivo específico
 * Body: priority (LOW, NORMAL, HIGH), updatePriority
 * Permisos: documents.canManageAll
 */
router.post("/:fileId/sync", controller.forceFileSync);

/**
 * GET /files/:fileId/sync-status
 * Obtener estado detallado de sincronización
 * Permisos: documents.canView + acceso al archivo
 */
router.get("/:fileId/sync-status", controller.getFileSyncStatus);

/**
 * GET /files/sync/pending
 * Listar archivos pendientes de sincronización
 * Query params: priority, retryCount, olderThan
 * Permisos: documents.canManageAll
 */
router.get("/sync/pending", controller.getPendingSyncFiles);

/**
 * POST /files/sync/retry-failed
 * Reintentar sincronización de archivos fallidos
 * Body: fileIds[], resetRetryCount
 * Permisos: documents.canManageAll
 */
router.post("/sync/retry-failed", controller.retryFailedSyncs);

/**
 * GET /files/sync/monitor
 * Monitor en tiempo real del estado RSync
 * Permisos: documents.canManageAll
 */
router.get("/sync/monitor", controller.getRsyncMonitor);

// =============================================================================
// VALIDACIÓN Y VERIFICACIÓN
// =============================================================================

/**
 * POST /files/:fileId/validate
 * Validar integridad del archivo (hash, tamaño, etc.)
 * Permisos: documents.canView + acceso al archivo
 */
router.post("/:fileId/validate", controller.validateFile);

/**
 * GET /files/:fileId/preview
 * Vista previa del archivo (imágenes, PDFs)
 * Query params: size, page (para PDFs)
 * Permisos: documents.canView + acceso al archivo
 */
router.get("/:fileId/preview", controller.previewFile);

/**
 * GET /files/:fileId/thumbnail
 * Miniatura del archivo
 * Query params: size (small, medium, large)
 * Permisos: documents.canView + acceso al archivo
 */
router.get("/:fileId/thumbnail", controller.getFileThumbnail);

/**
 * POST /files/:fileId/scan
 * Escanear archivo por virus/malware
 * Permisos: documents.canManageAll
 */
router.post("/:fileId/scan", controller.scanFile);

/**
 * GET /files/:fileId/versions
 * Obtener historial de versiones del archivo
 * Permisos: documents.canView + acceso al archivo
 */
router.get("/:fileId/versions", controller.getFileVersions);

// =============================================================================
// OPERACIONES MASIVAS
// =============================================================================

/**
 * POST /files/bulk-upload
 * Subida masiva de archivos
 * Form data: files[], contractId, phaseId, documentType
 * Permisos: documents.canUpload
 */
router.post(
  "/bulk-upload",
  uploadMiddleware.array("files", 20),
  controller.bulkUploadFiles
);

/**
 * POST /files/bulk-delete
 * Eliminación masiva de archivos
 * Body: fileIds[], reason, hardDelete
 * Permisos: documents.canDelete
 */
router.post("/bulk-delete", controller.bulkDeleteFiles);

/**
 * POST /files/bulk-sync
 * Sincronización masiva RSync
 * Body: fileIds[], priority, forceSync
 * Permisos: documents.canManageAll
 */
router.post("/bulk-sync", controller.bulkSyncFiles);

/**
 * POST /files/bulk-download
 * Descarga masiva como ZIP
 * Body: fileIds[]
 * Permisos: documents.canDownload + acceso a archivos
 */
router.post("/bulk-download", controller.bulkDownloadFiles);

/**
 * POST /files/bulk-move
 * Mover archivos entre contratos/fases
 * Body: fileIds[], targetContractId, targetPhaseId
 * Permisos: documents.canManageAll
 */
router.post("/bulk-move", controller.bulkMoveFiles);

// =============================================================================
// ESTADÍSTICAS Y MONITOREO
// =============================================================================

/**
 * GET /files/statistics/storage
 * Estadísticas de almacenamiento
 * Query params: period, groupBy (contract, phase, user, department)
 * Permisos: special.canViewStatistics
 */
router.get("/statistics/storage", controller.getStorageStatistics);

/**
 * GET /files/statistics/sync
 * Estadísticas de sincronización RSync
 * Query params: period, includeErrors
 * Permisos: documents.canManageAll
 */
router.get("/statistics/sync", controller.getSyncStatistics);

/**
 * GET /files/statistics/usage
 * Estadísticas de uso de archivos
 * Query params: period, groupBy
 * Permisos: special.canViewStatistics
 */
router.get("/statistics/usage", controller.getUsageStatistics);

/**
 * GET /files/statistics/performance
 * Métricas de rendimiento del sistema
 * Permisos: documents.canManageAll
 */
router.get("/statistics/performance", controller.getPerformanceStats);

// =============================================================================
// REPORTES Y AUDITORÍA
// =============================================================================

/**
 * GET /files/reports/audit
 * Reporte de auditoría de archivos
 * Query params: dateFrom, dateTo, action, userId
 * Permisos: special.canViewAuditLog
 */
router.get("/reports/audit", controller.getAuditReport);

/**
 * GET /files/reports/integrity
 * Reporte de integridad de archivos
 * Query params: includeCorrupted, includeOrphaned
 * Permisos: documents.canManageAll
 */
router.get("/reports/integrity", controller.getIntegrityReport);

/**
 * GET /files/reports/compliance
 * Reporte de cumplimiento documental
 * Query params: contractId, phaseId, missingOnly
 * Permisos: special.canViewStatistics
 */
router.get("/reports/compliance", controller.getComplianceReport);

// =============================================================================
// CONFIGURACIÓN Y ADMINISTRACIÓN
// =============================================================================

/**
 * GET /files/config
 * Obtener configuración del sistema de archivos
 * Permisos: documents.canManageAll
 */
router.get("/config", controller.getFileSystemConfig);

/**
 * PUT /files/config
 * Actualizar configuración del sistema
 * Body: rsyncConfig, storageConfig, validationRules
 * Permisos: special.canManagePermissions
 */
router.put("/config", controller.updateFileSystemConfig);

/**
 * GET /files/health
 * Estado de salud del sistema de archivos
 * Permisos: documents.canManageAll
 */
router.get("/health", controller.getSystemHealth);

/**
 * POST /files/maintenance/cleanup
 * Limpieza de archivos huérfanos y temporales
 * Body: dryRun, olderThan, includeDeleted
 * Permisos: special.canManagePermissions
 */
router.post("/maintenance/cleanup", controller.cleanupFiles);

/**
 * POST /files/maintenance/verify-integrity
 * Verificación masiva de integridad
 * Body: contractIds[], fixCorrupted
 * Permisos: documents.canManageAll
 */
router.post("/maintenance/verify-integrity", controller.verifyIntegrity);

// =============================================================================
// ENDPOINTS ESPECIALES
// =============================================================================

/**
 * GET /files/:fileId/share
 * Generar enlace de compartir temporal
 * Query params: expiresIn, allowedDownloads
 * Permisos: documents.canDownload + acceso al archivo
 */
router.get("/:fileId/share", controller.generateShareLink);

/**
 * POST /files/:fileId/convert
 * Convertir archivo a otro formato
 * Body: targetFormat, quality, options
 * Permisos: documents.canManageAll
 */
router.post("/:fileId/convert", controller.convertFile);

/**
 * POST /files/:fileId/duplicate
 * Duplicar archivo en otro contrato/fase
 * Body: targetContractId, targetPhaseId, newName
 * Permisos: documents.canUpload
 */
router.post("/:fileId/duplicate", controller.duplicateFile);

export default router;
