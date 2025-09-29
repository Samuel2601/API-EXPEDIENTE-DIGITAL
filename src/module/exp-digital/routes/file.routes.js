// =============================================================================
// src/module/exp-digital/routes/file.routes.js
// Router para gestión de archivos con integración RSync
// GADM Cantón Esmeraldas - Módulo de Expediente Digital
// =============================================================================

import { Router } from "express";
import { FileController } from "../controllers/file.controller.js";
import {
  auth,
  authFile,
  verifyModuleAccess,
} from "../../../middlewares/auth.js";
import {
  requirePermission,
  requireFlexiblePermissions,
} from "#middlewares/permission.middleware.js";

const router = Router();
const controller = new FileController();

// =============================================================================
// MIDDLEWARES DE AUTENTICACIÓN Y PERMISOS
// =============================================================================

// Middleware de autenticación para todas las rutas
router.use((req, res, next) => {
  // Excluir la ruta de download del auth global
  if (req.path.includes("/download") || req.path.includes("/preview")) {
    return next();
  }
  auth(req, res, next);
});

router.use((req, res, next) => {
  // Excluir la ruta de download del verifyModuleAccess global
  if (req.path.includes("/download") || req.path.includes("/preview")) {
    return next();
  }
  verifyModuleAccess(req, res, next);
});

// =============================================================================
// OPERACIONES PRINCIPALES DE ARCHIVOS
// =============================================================================

/**
 * POST /files/upload
 * Subir archivos al sistema
 * Permisos: documents.canUpload
 */
router.post(
  "/upload",
  requirePermission({
    category: "documents",
    permission: "canUpload",
    errorMessage: "No tiene permisos para subir archivos",
  }),
  controller.uploadMiddleware,
  controller.uploadFiles
);

/**
 * GET /files
 * Obtener todos los archivos con filtros
 * Permisos: documents.canView
 */
router.get("/", controller.getAllFiles);

/**
 * GET /files/:id
 * Obtener archivo por ID
 * Permisos: documents.canView + acceso al archivo específico
 */
router.get(
  "/:id",
  requirePermission({
    category: "documents",
    permission: "canView",
    errorMessage: "No tiene permisos para ver archivos",
  }),
  controller.getFileById
);

/**
 * PUT /files/:id
 * Actualizar metadatos del archivo
 * Permisos: documents.canEdit + propiedad del archivo
 */
router.put(
  "/:id",
  requirePermission({
    category: "documents",
    permission: "canEdit",
    errorMessage: "No tiene permisos para editar archivos",
  }),
  controller.updateFile
);

/**
 * DELETE /files/:id
 * Eliminar archivo (soft delete)
 * Permisos: documents.canDelete + propiedad del archivo
 */
router.delete(
  "/:id",
  requirePermission({
    category: "documents",
    permission: "canDelete",
    errorMessage: "No tiene permisos para eliminar archivos",
  }),
  controller.deleteFile
);

// =============================================================================
// OPERACIONES DE DESCARGA
// =============================================================================

/**
 * GET /files/:id/download
 * Descargar archivo
 * Permisos: documents.canDownload + acceso al archivo
 */
router.get(
  "/:id/download",
  authFile({ allowQueryToken: true }),
  requirePermission({
    category: "documents",
    permission: "canDownload",
    errorMessage: "No tiene permisos para descargar archivos",
  }),
  controller.downloadFile
);

/**
 * GET /files/:id/preview
 * Previsualizar archivo (para imágenes y PDFs)
 * Permisos: documents.canView + acceso al archivo
 */
router.get(
  "/:id/preview",
  authFile({ allowQueryToken: true }),
  requirePermission({
    category: "documents",
    permission: "canView",
    errorMessage: "No tiene permisos para ver archivos",
  }),
  controller.previewFile
);

// =============================================================================
// OPERACIONES DE RSYNC Y SINCRONIZACIÓN
// =============================================================================

/**
 * POST /files/:id/sync
 * Sincronizar archivo específico
 * Permisos: special.canManageFiles (administradores)
 */
router.post(
  "/:id/sync",
  requirePermission({
    category: "special",
    permission: "canManageFiles",
    errorMessage: "Solo los administradores pueden forzar sincronización",
  }),
  controller.syncFile
);

/**
 * POST /files/sync/process-queue
 * Procesar cola de sincronización
 * Permisos: special.canManageFiles (administradores)
 */
router.post(
  "/sync/process-queue",
  requirePermission({
    category: "special",
    permission: "canManageFiles",
    errorMessage:
      "Solo los administradores pueden procesar la cola de sincronización",
  }),
  controller.processRsyncQueue
);

/**
 * GET /files/sync/queue-status
 * Obtener estado de la cola de sincronización
 * Permisos: special.canManageFiles (administradores)
 */
router.get(
  "/sync/queue-status",
  requirePermission({
    category: "special",
    permission: "canManageFiles",
    errorMessage: "Solo los administradores pueden ver el estado de la cola",
  }),
  controller.getRsyncQueueStatus
);

// =============================================================================
// OPERACIONES DE ESTADÍSTICAS Y REPORTES
// =============================================================================

/**
 * GET /files/statistics
 * Obtener estadísticas de archivos
 * Permisos: documents.canView
 */
router.get(
  "/statistics",
  requirePermission({
    category: "documents",
    permission: "canView",
    errorMessage: "No tiene permisos para ver estadísticas de archivos",
  }),
  controller.getFilesStatistics
);

// =============================================================================
// OPERACIONES DE UTILIDADES
// =============================================================================

/**
 * GET /files/document-types
 * Obtener tipos de documentos disponibles
 * Permisos: Acceso básico al módulo
 */
router.get("/document-types", controller.getDocumentTypes);

/**
 * POST /files/validate
 * Validar archivos antes de subir
 * Permisos: documents.canUpload
 */
router.post(
  "/validate",
  requirePermission({
    category: "documents",
    permission: "canUpload",
    errorMessage: "No tiene permisos para validar archivos",
  }),
  controller.validateFiles
);

/**
 * POST /files/search
 * Buscar archivos con filtros avanzados
 * Permisos: documents.canView
 */
router.post(
  "/search",
  requirePermission({
    category: "documents",
    permission: "canView",
    errorMessage: "No tiene permisos para buscar archivos",
  }),
  controller.searchFiles
);

/**
 * DELETE /files/cleanup
 * Limpiar archivos huérfanos (sin referencias en contratos)
 * Permisos: special.canManageFiles (administradores)
 */
router.delete(
  "/cleanup",
  requirePermission({
    category: "special",
    permission: "canManageFiles",
    errorMessage: "Solo los administradores pueden limpiar archivos",
  }),
  controller.cleanupOrphanFiles
);

export default router;
