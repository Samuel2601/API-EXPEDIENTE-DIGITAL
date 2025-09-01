// =============================================================================
// src/module/exp-digital/routes/contract.routes.js
// Router principal para gestión de contratos del expediente digital
// GADM Cantón Esmeraldas - Sistema de Contratación Pública
// =============================================================================

import { Router } from "express";
import { ContractController } from "../controllers/contract.controller.js";
import {
  requireContractAccess,
  requireFlexiblePermissions,
  requirePermission,
} from "#src/middlewares/permission.middleware.js";
import { auth, verifyModuleAccess } from "#src/middlewares/auth.js";

const router = Router();
const controller = new ContractController();

// =============================================================================
// MIDDLEWARES DE AUTENTICACIÓN Y PERMISOS
// =============================================================================

// Middleware de autenticación para todas las rutas
router.use(auth);
router.use(verifyModuleAccess);

// =============================================================================
// OPERACIONES CRUD DE CONTRATOS
// =============================================================================

/**
 * POST /contracts
 * Crear nuevo contrato
 * Permisos: contracts.canCreate
 * Body: contractualObject, contractType, requestingDepartment, budget, etc.
 */
router.post(
  "/",
  requirePermission({
    category: "contracts",
    permission: "canCreate",
    departmentParam: "requestingDepartment",
    errorMessage: "No tiene permisos para crear contratos",
  }),
  controller.createContract
);

/**
 * GET /contracts
 * Buscar/listar contratos con filtros avanzados
 * Query params: search, status, phase, department, dateFrom, dateTo, page, limit
 * Permisos: contracts.canViewOwn/canViewDepartment/canViewAll
 */
router.get(
  "/",
  requireFlexiblePermissions(
    [
      { category: "contracts", permission: "canViewDepartment" },
      { category: "contracts", permission: "canViewAll" },
    ],
    {
      allowGlobal: true,
      requireDepartment: false,
    }
  ),
  controller.getAllContracts
);

/**
 * GET /contracts/:contractId
 * Obtener contrato específico con detalles completos
 * Permisos: contracts.canViewOwn/canViewDepartment/canViewAll + acceso al contrato
 */
router.get(
  "/:contractId",
  requireContractAccess("contractId"),
  controller.getContractById
);

/**
 * PUT /contracts/:contractId
 * Actualizar contrato existente
 * Permisos: contracts.canEdit + acceso al contrato
 */
router.put(
  "/:contractId",
  requireContractAccess("contractId"),
  requirePermission({
    category: "contracts",
    permission: "canEdit",
    errorMessage: "No tiene permisos para editar contratos",
  }),
  controller.updateContract
);

/**
 * DELETE /contracts/:contractId
 * Eliminar contrato (soft delete)
 * Permisos: contracts.canDelete + acceso al contrato
 */
router.delete(
  "/:contractId",
  requireContractAccess("contractId"),
  requirePermission({
    category: "contracts",
    permission: "canDelete",
    errorMessage: "No tiene permisos para eliminar contratos",
  }),
  controller.deleteContract
);

// =============================================================================
// OPERACIONES MASIVAS
// =============================================================================

/**
 * POST /contracts/bulk-update
 * Actualización masiva de contratos
 * Body: contractIds[], updateData
 * Permisos: contracts.canEdit
 */
router.post("/bulk-update", controller.bulkUpdateContracts);

/**
 * POST /contracts/bulk-delete
 * Eliminación masiva de contratos
 * Body: contractIds[], reason
 * Permisos: contracts.canDelete
 */
router.post("/bulk-delete", controller.bulkDeleteContracts);

/**
 * POST /contracts/bulk-export
 * Exportación masiva de contratos
 * Body: contractIds[], format
 * Permisos: special.canExportData
 */
router.post("/bulk-export", controller.bulkExportContracts);

// =============================================================================
// GESTIÓN DE FASES Y ESTADOS
// =============================================================================

/**
 * PUT /contracts/:contractId/phase
 * Cambiar fase del contrato
 * Body: newPhase, reason, documents[]
 * Permisos: contracts.canEdit + validaciones de fase
 */
router.put("/:contractId/phase", controller.changeContractPhase);

/**
 * PUT /contracts/:contractId/status
 * Cambiar estado del contrato
 * Body: newStatus, reason
 * Permisos: contracts.canEdit + validaciones de estado
 */
router.put("/:contractId/status", controller.changeContractStatus);

/**
 * GET /contracts/:contractId/phases
 * Obtener historial de fases del contrato
 * Permisos: contracts.canViewOwn/canViewDepartment/canViewAll + acceso al contrato
 */
router.get("/:contractId/phases", controller.getContractPhases);

/**
 * GET /contracts/:contractId/transitions
 * Obtener transiciones disponibles para el contrato
 * Permisos: contracts.canViewOwn/canViewDepartment/canViewAll + acceso al contrato
 */
router.get("/:contractId/transitions", controller.getAvailableTransitions);

// =============================================================================
// GESTIÓN DE DOCUMENTOS DEL CONTRATO
// =============================================================================

/**
 * POST /contracts/:contractId/documents
 * Subir documento al contrato
 * Permisos: documents.canUpload + acceso al contrato
 */
router.post("/:contractId/documents", controller.uploadContractDocument);

/**
 * GET /contracts/:contractId/documents
 * Listar documentos del contrato
 * Query params: phase, documentType, page, limit
 * Permisos: documents.canView + acceso al contrato
 */
router.get("/:contractId/documents", controller.getContractDocuments);

/**
 * GET /contracts/:contractId/documents/:documentId
 * Obtener documento específico del contrato
 * Permisos: documents.canView + acceso al contrato
 */
router.get(
  "/:contractId/documents/:documentId",
  controller.getContractDocument
);

/**
 * PUT /contracts/:contractId/documents/:documentId
 * Actualizar metadatos del documento
 * Permisos: documents.canManageAll + acceso al contrato
 */
router.put(
  "/:contractId/documents/:documentId",
  controller.updateContractDocument
);

/**
 * DELETE /contracts/:contractId/documents/:documentId
 * Eliminar documento del contrato
 * Permisos: documents.canDelete + acceso al contrato
 */
router.delete(
  "/:contractId/documents/:documentId",
  controller.deleteContractDocument
);

// =============================================================================
// HISTORIAL Y AUDITORÍA
// =============================================================================

/**
 * GET /contracts/:contractId/history
 * Obtener historial completo del contrato
 * Query params: eventType, dateFrom, dateTo, page, limit
 * Permisos: contracts.canViewOwn/canViewDepartment/canViewAll + acceso al contrato
 */
router.get("/:contractId/history", controller.getContractHistory);

/**
 * GET /contracts/:contractId/timeline
 * Obtener línea de tiempo visual del contrato
 * Permisos: contracts.canViewOwn/canViewDepartment/canViewAll + acceso al contrato
 */
router.get("/:contractId/timeline", controller.getContractTimeline);

/**
 * GET /contracts/:contractId/audit
 * Obtener registro de auditoría detallado
 * Permisos: special.canViewAuditLog + acceso al contrato
 */
router.get("/:contractId/audit", controller.getContractAudit);

// =============================================================================
// OBSERVACIONES E INTERACCIONES
// =============================================================================

/**
 * POST /contracts/:contractId/observations
 * Agregar observación al contrato
 * Body: message, type, isPublic
 * Permisos: interactions.canAddObservations + acceso al contrato
 */
router.post("/:contractId/observations", controller.addContractObservation);

/**
 * GET /contracts/:contractId/observations
 * Listar observaciones del contrato
 * Query params: type, isPublic, page, limit
 * Permisos: interactions.canViewAllObservations + acceso al contrato
 */
router.get("/:contractId/observations", controller.getContractObservations);

/**
 * PUT /contracts/:contractId/observations/:observationId
 * Editar observación propia
 * Permisos: interactions.canEditOwnObservations + ownership
 */
router.put(
  "/:contractId/observations/:observationId",
  controller.updateContractObservation
);

/**
 * DELETE /contracts/:contractId/observations/:observationId
 * Eliminar observación
 * Permisos: interactions.canDeleteOwnObservations + ownership
 */
router.delete(
  "/:contractId/observations/:observationId",
  controller.deleteContractObservation
);

/**
 * Avanzar a la siguiente fase del contrato
 * POST /contracts/:contractId/advance-phase
 * Permisos: contracts.canEdit + acceso al contrato
 */
router.post(
  "/:contractId/advance-phase",
  requireContractAccess("contractId"),
  requirePermission({
    category: "contracts",
    permission: "canEdit",
    errorMessage: "No tiene permisos para avanzar fases de contratos",
  }),
  controller.advanceContractPhase
);

/**
 * Actualizar fase específica del contrato
 * PUT /contracts/:contractId/phases/:phaseId
 * Permisos: contracts.canEdit + validaciones de fase
 */
router.put(
  "/:contractId/phases/:phaseId",
  requireContractAccess("contractId"),
  requirePermission({
    category: "contracts",
    permission: "canEdit",
    errorMessage: "No tiene permisos para actualizar fases de contratos",
  }),
  controller.updateContractPhase
);
// =============================================================================
// ESTADÍSTICAS Y REPORTES
// =============================================================================

/**
 * GET /contracts/statistics/overview
 * Obtener estadísticas generales de contratos
 * Query params: period, department, includeFinancial
 * Permisos: contracts.canViewOwn/canViewDepartment/canViewAll
 */
router.get("/statistics/overview", controller.getContractStatistics);

/**
 * GET /contracts/statistics/department/:departmentId
 * Estadísticas específicas por departamento
 * Permisos: contracts.canViewDepartment/canViewAll
 */
router.get(
  "/statistics/department/:departmentId",
  controller.getDepartmentStatistics
);

/**
 * GET /contracts/statistics/phases
 * Estadísticas por fases de contratación
 * Query params: contractType, period
 * Permisos: contracts.canViewOwn/canViewDepartment/canViewAll
 */
router.get("/statistics/phases", controller.getPhaseStatistics);

/**
 * GET /contracts/statistics/financial
 * Estadísticas financieras
 * Query params: period, groupBy
 * Permisos: special.canViewFinancialData
 */
router.get("/statistics/financial", controller.getFinancialStatistics);

// =============================================================================
// REPORTES Y EXPORTACIÓN
// =============================================================================

/**
 * GET /contracts/reports/export
 * Exportar reporte de contratos
 * Query params: format, filters, fields
 * Permisos: special.canExportData
 */
router.get(
  "/reports/export",
  requirePermission({
    category: "special",
    permission: "canExportData",
    errorMessage: "No tiene permisos para exportar datos",
  }),
  controller.exportContracts
);

/**
 * GET /contracts/reports/compliance
 * Reporte de cumplimiento legal
 * Query params: period, contractType
 * Permisos: special.canViewFinancialData
 */
router.get("/reports/compliance", controller.getComplianceReport);

/**
 * GET /contracts/reports/performance
 * Reporte de rendimiento de contratos
 * Query params: period, department
 * Permisos: contracts.canViewDepartment/canViewAll
 */
router.get("/reports/performance", controller.getPerformanceReport);

// =============================================================================
// CONFIGURACIÓN Y UTILIDADES
// =============================================================================

/**
 * GET /contracts/configuration
 * Obtener configuración de tipos y fases
 * Query params: includeInactive
 * Permisos: Acceso básico al módulo
 */
router.get("/configuration", controller.getContractsConfiguration);

/**
 * Obtener estadísticas de contratos
 * GET /contracts/statistics
 * Permisos: Acceso básico al módulo
 */
router.get("/statistics", controller.getContractsStatistics);

/**
 * GET /contracts/dashboard
 * Obtener datos para dashboard del usuario
 * Permisos: Acceso básico al módulo
 */
router.get("/dashboard", controller.getContractsDashboard);

/**
 * GET /contracts/pending-actions
 * Obtener contratos que requieren acción del usuario
 * Permisos: contracts.canViewOwn/canViewDepartment
 */
router.get("/pending-actions", controller.getPendingActions);

// =============================================================================
// ENDPOINTS ESPECIALES
// =============================================================================

/**
 * POST /contracts/:contractId/duplicate
 * Duplicar contrato existente
 * Body: newContractData
 * Permisos: contracts.canCreate
 */
router.post("/:contractId/duplicate", controller.duplicateContract);

/**
 * POST /contracts/:contractId/archive
 * Archivar contrato completado
 * Permisos: contracts.canEdit + validaciones de estado
 */
router.post("/:contractId/archive", controller.archiveContract);

/**
 * POST /contracts/:contractId/restore
 * Restaurar contrato archivado
 * Permisos: contracts.canEdit + special permissions
 */
router.post("/:contractId/restore", controller.restoreContract);

export default router;
