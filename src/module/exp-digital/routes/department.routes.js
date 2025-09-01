// =============================================================================
// src/module/exp-digital/routes/department.routes.js
// Rutas para gestión de departamentos organizacionales
// GADM Cantón Esmeraldas - Sistema de Contratación Pública
// =============================================================================

import { Router } from "express";
import { DepartmentController } from "../controllers/department.controller.js";
import {
  requirePermission,
  requireAnyPermission,
  requireFlexiblePermissions,
} from "../../../middlewares/permission.middleware.js";
import { auth, verifyModuleAccess } from "../../../middlewares/auth.js";

const router = Router();
const departmentController = new DepartmentController();

// =============================================================================
// MIDDLEWARES ESPECÍFICOS PARA DEPARTAMENTOS
// =============================================================================

// Verificar acceso básico al módulo (todos los endpoints requieren esto)
router.use(auth, verifyModuleAccess);

// =============================================================================
// RUTAS CRUD DE DEPARTAMENTOS
// =============================================================================

/**
 * Crear nuevo departamento
 * POST /departments
 * Permisos: special.canManagePermissions (solo administradores)
 */
router.post(
  "/",
  requirePermission({
    category: "special",
    permission: "canManagePermissions",
    errorMessage: "Solo los administradores pueden crear departamentos",
  }),
  departmentController.createDepartment
);

/**
 * Obtener todos los departamentos
 * GET /departments
 * Permisos: Acceso básico al módulo
 */
router.get("/", departmentController.getAllDepartments);

/**
 * Obtener departamento por ID
 * GET /departments/:id
 * Permisos: Acceso básico al módulo
 */
router.get("/:id", departmentController.getDepartmentById);

/**
 * Actualizar departamento
 * PUT /departments/:id
 * Permisos: special.canManagePermissions (solo administradores)
 */
router.put(
  "/:id",
  requirePermission({
    category: "special",
    permission: "canManagePermissions",
    errorMessage: "Solo los administradores pueden actualizar departamentos",
  }),
  departmentController.updateDepartment
);

/**
 * Eliminar departamento (soft delete)
 * DELETE /departments/:id
 * Permisos: special.canManagePermissions (solo administradores)
 */
router.delete(
  "/:id",
  requirePermission({
    category: "special",
    permission: "canManagePermissions",
    errorMessage: "Solo los administradores pueden eliminar departamentos",
  }),
  departmentController.deleteDepartment
);

// =============================================================================
// OPERACIONES ESPECÍFICAS PARA CONTRATACIÓN PÚBLICA
// =============================================================================

/**
 * Obtener departamentos que pueden aprobar un monto específico
 * GET /departments/approval/:amount
 * Permisos: Acceso básico al módulo
 */
router.get("/approval/:amount", departmentController.getDepartmentsForApproval);

/**
 * Obtener árbol organizacional
 * GET /departments/organizational-tree
 * Permisos: Acceso básico al módulo
 */
router.get("/organizational-tree", departmentController.getOrganizationalTree);

/**
 * Buscar departamentos con criterios específicos
 * POST /departments/search
 * Permisos: Acceso básico al módulo
 */
router.post("/search", departmentController.searchDepartments);

// =============================================================================
// OPERACIONES DE ESTADÍSTICAS Y REPORTES
// =============================================================================

/**
 * Obtener estadísticas generales de departamentos
 * GET /departments/statistics
 * Permisos: Acceso básico al módulo
 */
router.get("/statistics", departmentController.getDepartmentsStatistics);

/**
 * Validar jerarquía de departamentos
 * POST /departments/validate-hierarchy
 * Permisos: special.canManagePermissions (solo administradores)
 */
router.post(
  "/validate-hierarchy",
  requirePermission({
    category: "special",
    permission: "canManagePermissions",
    errorMessage: "Solo los administradores pueden validar jerarquías",
  }),
  departmentController.validateDepartmentHierarchy
);

// =============================================================================
// OPERACIONES DE UTILIDADES
// =============================================================================

/**
 * Obtener tipos de tags disponibles para departamentos
 * GET /departments/available-tags
 * Permisos: Acceso básico al módulo
 */
router.get("/available-tags", departmentController.getAvailableTags);

/**
 * Obtener departamentos por nivel específico
 * GET /departments/by-level/:level
 * Permisos: Acceso básico al módulo
 */
router.get("/by-level/:level", departmentController.getDepartmentsByLevel);

/**
 * Exportar departamentos
 * GET /departments/export
 * Permisos: special.canExportData
 */
router.get(
  "/export",
  requirePermission({
    category: "special",
    permission: "canExportData",
    errorMessage: "No tiene permisos para exportar datos",
  }),
  departmentController.exportDepartments
);

export default router;
