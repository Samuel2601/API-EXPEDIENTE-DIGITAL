// =============================================================================
// src/module/exp-digital/routes/contract-configuration.routes.js
// Router para configuración de tipos y fases de contratación pública
// GADM Cantón Esmeraldas - Módulo de Expediente Digital
// =============================================================================

import { Router } from "express";
import { ContractConfigurationController } from "../controllers/contract-configuration.controller.js";
import { auth, verifyModuleAccess } from "#src/middlewares/auth.js";
import { requirePermission } from "#src/middlewares/permission.middleware.js";

const router = Router();
const controller = new ContractConfigurationController();

// =============================================================================
// MIDDLEWARES DE AUTENTICACIÓN Y PERMISOS
// =============================================================================

// Middleware de autenticación para todas las rutas
router.use(auth);
router.use(verifyModuleAccess);

// =============================================================================
// ENDPOINTS PARA TIPOS DE CONTRATACIÓN
// =============================================================================

/**
 * GET /contract-configuration/types
 * Obtener todos los tipos de contratación
 * Query params: includeInactive, category, page, limit
 */
router.get("/types", controller.getAllContractTypes);

/**
 * POST /contract-configuration/types
 * Crear nuevo tipo de contratación
 * Permisos: special.canManagePermissions
 */
router.post(
  "/types",
  requirePermission({
    category: "special",
    permission: "canManagePermissions",
    errorMessage: "Solo los administradores pueden crear tipos de contratación",
  }),
  controller.createContractType
);

/**
 * GET /contract-configuration/types/:id
 * Obtener tipo de contratación específico
 */
router.get("/types/:id", controller.getContractTypeById);

/**
 * PUT /contract-configuration/types/:id
 * Actualizar tipo de contratación
 * Permisos: special.canManagePermissions
 */
router.put(
  "/types/:id",
  requirePermission({
    category: "special",
    permission: "canManagePermissions",
    errorMessage:
      "Solo los administradores pueden actualizar tipos de contratación",
  }),
  controller.updateContractType
);

/**
 * DELETE /contract-configuration/types/:id
 * Eliminar tipo de contratación (soft delete)
 * Permisos: special.canManagePermissions
 */
router.delete(
  "/types/:id",
  requirePermission({
    category: "special",
    permission: "canManagePermissions",
    errorMessage:
      "Solo los administradores pueden eliminar tipos de contratación",
  }),
  controller.deleteContractType
);

// =============================================================================
// ENDPOINTS PARA FASES DE CONTRATACIÓN
// =============================================================================

/**
 * GET /contract-configuration/phases
 * Obtener todas las fases de contratación
 * Query params: includeInactive, contractType, page, limit
 */
router.get("/phases", controller.getAllContractPhases);

/**
 * POST /contract-configuration/phases
 * Crear nueva fase de contratación
 * Permisos: special.canManagePermissions
 */
router.post(
  "/phases",
  requirePermission({
    category: "special",
    permission: "canManagePermissions",
    errorMessage: "Solo los administradores pueden crear fases de contratación",
  }),
  controller.createContractPhase
);

/**
 * GET /contract-configuration/phases/:id
 * Obtener fase de contratación específica
 */
router.get("/phases/:id", controller.getContractPhaseById);

/**
 * PUT /contract-configuration/phases/:id
 * Actualizar fase de contratación
 * Permisos: special.canManagePermissions
 */
router.put(
  "/phases/:id",
  requirePermission({
    category: "special",
    permission: "canManagePermissions",
    errorMessage:
      "Solo los administradores pueden actualizar fases de contratación",
  }),
  controller.updateContractPhase
);

/**
 * DELETE /contract-configuration/phases/:id
 * Eliminar fase de contratación (soft delete)
 * Permisos: special.canManagePermissions
 */
router.delete(
  "/phases/:id",
  requirePermission({
    category: "special",
    permission: "canManagePermissions",
    errorMessage:
      "Solo los administradores pueden eliminar fases de contratación",
  }),
  controller.deleteContractPhase
);

// =============================================================================
// ENDPOINTS PARA CONFIGURACIÓN COMPLETA
// =============================================================================

/**
 * GET /contract-configuration/complete
 * Obtener configuración completa (tipos + fases)
 * Query params: includeInactive
 */
router.get("/complete", controller.getCompleteConfiguration);

/**
 * POST /contract-configuration/initialize
 * Inicializar configuración del sistema completa
 * Permisos: special.canManagePermissions (solo administradores)
 */
router.post(
  "/initialize",
  /*requirePermission({
    category: "special",
    permission: "canManagePermissions",
    errorMessage:
      "Solo los administradores pueden inicializar la configuración del sistema",
  }),*/
  controller.initializeConfiguration
);

/**
 * GET /contract-configuration/validate
 * Validar integridad de la configuración
 * Permisos: contracts.canRead o special.canManagePermissions
 */
router.get("/validate", controller.validateConfiguration);

// =============================================================================
// ENDPOINTS ADICIONALES Y ESTADÍSTICAS
// =============================================================================

/**
 * GET /contract-configuration/statistics
 * Obtener estadísticas de configuración
 * Permisos: Acceso básico al módulo
 */
router.get("/statistics", controller.getConfigurationStatistics);

/**
 * GET /contract-configuration/types/by-amount/:amount
 * Determinar tipo de contratación por monto
 * Params: amount (número)
 */
router.get("/types/by-amount/:amount", controller.getContractTypeByAmount);

/**
 * GET /contract-configuration/types/:id/phases
 * Obtener fases requeridas para un tipo específico
 * Params: id (ObjectId del tipo de contratación)
 */
router.get("/types/:id/phases", controller.getPhasesByContractType);

/**
 * PUT /contract-configuration/types/:id/phases
 * Configurar/actualizar fases para un tipo específico
 * Permisos: special.canManagePermissions
 */
router.put("/types/:id/phases", controller.updatePhasesByContractType);

// =============================================================================
// ENDPOINTS DE EXPORTACIÓN E IMPORTACIÓN
// =============================================================================

/**
 * GET /contract-configuration/export
 * Exportar configuración completa
 * Query params: format (json, excel), includeInactive
 * Permisos: special.canExportData
 */
//router.get("/export", controller.exportConfiguration);

/**
 * POST /contract-configuration/import
 * Importar configuración desde archivo
 * Permisos: special.canManagePermissions
 */
//router.post("/import", controller.importConfiguration);

// =============================================================================
// ENDPOINTS DE VALIDACIÓN Y UTILIDADES
// =============================================================================

/**
 * GET /contract-configuration/framework-info
 * Obtener información del marco legal (LOSNCP)
 */
//router.get("/framework-info", controller.getFrameworkInfo);

/**
 * GET /contract-configuration/health
 * Verificar salud del sistema de configuración
 */
//router.get("/health", controller.getConfigurationHealth);

/**
 * POST /contract-configuration/reset
 * Resetear configuración a valores por defecto (PELIGROSO)
 * Permisos: special.canManagePermissions + confirmación adicional
 */
//router.post("/reset", controller.resetConfiguration);

export default router;
