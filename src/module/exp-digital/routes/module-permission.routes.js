// =============================================================================
// src/module/exp-digital/routes/module-permission.routes.js
// Rutas para gestión de permisos multi-departamentales
// =============================================================================

import { Router } from "express";
import ModulePermissionController from "../controllers/module-permission.controller.js";
import { auth, permissUser, verifyModuleAccess } from "#middlewares/auth.js";
import {
  requirePermission,
  requireFlexiblePermissions,
} from "../../../middlewares/permission.middleware.js";

const router = Router();

// ===== MIDDLEWARE DE VERIFICACIÓN DE MÓDULO =====
router.use(auth);
router.use(verifyModuleAccess);

// ===== RUTAS PARA USER DEPARTMENT ACCESS =====

/**
 * Crear acceso de usuario a departamento
 * Requiere: contracts.canCreate (para el departamento destino)
 */
router.post(
  "/accesses",
  /*requirePermission({
    category: "contracts",
    permission: "canCreate",
    departmentParam: "department",
    errorMessage: "No tiene permisos para crear accesos en este departamento",
  }),*/
  ModulePermissionController.createUserDepartmentAccess
);

/**
 * Obtener accesos de un usuario específico
 * Requiere: special.canViewCrossDepartment O acceso al departamento del usuario consultado
 */
router.get(
  "/users/:userId/accesses",
  /*  requireFlexiblePermissions(
    [
      { category: "special", permission: "canViewCrossDepartment" },
      { category: "contracts", permission: "canViewDepartment" },
    ],
    { allowGlobal: true, requireDepartment: false }
  ),*/
  ModulePermissionController.getUserAccesses
);

/**
 * Obtener dashboard de permisos de usuario
 * El usuario solo puede ver su propio dashboard a menos que tenga permisos globales
 */
router.get(
  "/users/:userId/dashboard",
  /*(req, res, next) => {
    // Permitir que los usuarios vean solo su propio dashboard, a menos que tengan permisos globales
    if (req.user.sub !== req.params.userId) {
      return requireFlexiblePermissions(
        [{ category: "special", permission: "canViewCrossDepartment" }],
        { allowGlobal: true }
      )(req, res, next);
    }
    next();
  },*/
  ModulePermissionController.getUserDashboard
);

/**
 * Verificar permisos de usuario específicos
 */
router.get(
  "/users/:userId/departments/:departmentId/permissions/check",
  ModulePermissionController.checkUserPermission
);

/**
 * Buscar accesos con filtros avanzados
 * Requiere permisos de administración
 */
router.get(
  "/accesses/search",
  requireFlexiblePermissions(
    [
      { category: "special", permission: "canViewCrossDepartment" },
      { category: "special", permission: "canManagePermissions" },
    ],
    { allowGlobal: true }
  ),
  ModulePermissionController.searchAccesses
);

/**
 * Actualizar acceso de usuario
 * Requiere: special.canManagePermissions O ser owner del departamento
 */
router.put(
  "/accesses/:id",
  requireFlexiblePermissions(
    [
      { category: "special", permission: "canManagePermissions" },
      { category: "contracts", permission: "canEdit" },
    ],
    { allowGlobal: true }
  ),
  ModulePermissionController.updateUserAccess
);

/**
 * Desactivar acceso de usuario
 * Requiere: special.canManagePermissions O ser owner del departamento
 */
router.patch(
  "/accesses/:id/deactivate",
  requireFlexiblePermissions(
    [
      { category: "special", permission: "canManagePermissions" },
      { category: "contracts", permission: "canDelete" },
    ],
    { allowGlobal: true }
  ),
  ModulePermissionController.deactivateUserAccess
);

/**
 * Reactivar acceso de usuario
 * Requiere: special.canManagePermissions
 */
router.patch(
  "/accesses/:id/reactivate",
  requirePermission({
    category: "special",
    permission: "canManagePermissions",
    errorMessage: "Solo administradores pueden reactivar accesos",
  }),
  ModulePermissionController.reactivateUserAccess
);

/**
 * Transferir ownership de departamento
 * Requiere: ser el owner actual del departamento
 */
router.post(
  "/departments/:departmentId/transfer-ownership",
  requirePermission({
    category: "special",
    permission: "canManagePermissions",
    departmentParam: "departmentId",
    errorMessage: "Solo el owner actual puede transferir la propiedad",
  }),
  ModulePermissionController.transferDepartmentOwnership
);

// ===== RUTAS PARA PERMISSION TEMPLATES =====

/**
 * Crear plantilla de permisos
 * Requiere: special.canManagePermissions
 */
router.post(
  "/templates",
  requirePermission({
    category: "special",
    permission: "canManagePermissions",
    errorMessage: "Solo administradores pueden crear plantillas de permisos",
  }),
  ModulePermissionController.createPermissionTemplate
);

/**
 * Buscar plantillas de permisos
 */
router.get("/templates", ModulePermissionController.findTemplates);

/**
 * Obtener plantillas aplicables
 */
router.get(
  "/templates/applicable",
  ModulePermissionController.getApplicableTemplates
);

/**
 * Aplicar plantilla a múltiples usuarios
 * Requiere: special.canManagePermissions
 */
router.post(
  "/templates/:templateId/apply",
  requirePermission({
    category: "special",
    permission: "canManagePermissions",
    errorMessage: "Solo administradores pueden aplicar plantillas",
  }),
  ModulePermissionController.applyTemplateToUsers
);

// ===== RUTAS PARA PERMISSION HISTORY =====

/**
 * Obtener historial de permisos de un acceso específico
 * Requiere permisos de administración o ser el usuario dueño del acceso
 */
router.get(
  "/accesses/:accessId/history",
  (req, res, next) => {
    // Verificar si el usuario es administrador o el dueño del acceso
    const checkAdmin = requireFlexiblePermissions(
      [{ category: "special", permission: "canManagePermissions" }],
      { allowGlobal: true }
    );

    checkAdmin(req, res, (err) => {
      if (err) {
        // Si no es admin, verificar si es el dueño del acceso
        ModulePermissionController.getPermissionHistory(req, res, next);
      } else {
        next();
      }
    });
  },
  ModulePermissionController.getPermissionHistory
);

/**
 * Obtener historial completo de usuario
 * Solo administradores o el propio usuario
 */
router.get(
  "/users/:userId/permission-history",
  (req, res, next) => {
    if (req.user.sub !== req.params.userId) {
      return requireFlexiblePermissions(
        [{ category: "special", permission: "canManagePermissions" }],
        { allowGlobal: true }
      )(req, res, next);
    }
    next();
  },
  ModulePermissionController.getUserPermissionHistory
);

// ===== RUTAS DE VERIFICACIÓN DE PERMISOS =====

/**
 * Verificar si usuario puede realizar acción del sistema
 */
router.get(
  "/users/:userId/departments/:departmentId/system-actions/:systemAction",
  ModulePermissionController.canPerformSystemAction
);

/**
 * Verificar múltiples permisos en lote
 */
router.post(
  "/permissions/batch-check",
  ModulePermissionController.batchCheckPermissions
);

// ===== RUTAS DE ESTADÍSTICAS Y REPORTES =====

/**
 * Obtener estadísticas de permisos
 * Requiere: special.canViewCrossDepartment
 */
router.get(
  "/stats/permissions",
  requireFlexiblePermissions(
    [{ category: "special", permission: "canViewCrossDepartment" }],
    { allowGlobal: true }
  ),
  ModulePermissionController.getPermissionStats
);

/**
 * Obtener reporte de accesos por departamento
 * Requiere acceso al departamento o permisos globales
 */
router.get(
  "/departments/:departmentId/access-report",
  requireFlexiblePermissions(
    [
      { category: "special", permission: "canViewCrossDepartment" },
      { category: "contracts", permission: "canViewDepartment" },
    ],
    { allowGlobal: true }
  ),
  ModulePermissionController.getDepartmentAccessReport
);

/**
 * Obtener usuarios con acceso a departamento
 * Requiere acceso al departamento o permisos globales
 */
router.get(
  "/departments/:departmentId/users",
  requireFlexiblePermissions(
    [
      { category: "special", permission: "canViewCrossDepartment" },
      { category: "contracts", permission: "canViewDepartment" },
    ],
    { allowGlobal: true }
  ),
  ModulePermissionController.findUsersWithDepartmentAccess
);

// ===== RUTAS AUXILIARES =====

/**
 * Obtener niveles de acceso disponibles
 */
router.get("/access-levels", ModulePermissionController.getAccessLevels);

/**
 * Obtener acciones del sistema disponibles
 */
router.get("/system-actions", ModulePermissionController.getSystemActions);

export default router;
