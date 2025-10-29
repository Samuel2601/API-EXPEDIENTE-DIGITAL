// =============================================================================
// src/module/exp-digital/routes/sercop-sync.routes.js
// Rutas para sincronización con APIs de SERCOP
// =============================================================================

import express from "express";
import sercopSyncController from "../controllers/sercop-sync.controller.js";
// import { requirePermission } from '../../../middleware/permission.middleware.js';

const router = express.Router();

// =============================================================================
// ENDPOINTS DE SINCRONIZACIÓN DE TIPOS
// =============================================================================

/**
 * POST /sercop/sync-types
 * Sincronizar tipos de contrato desde SERCOP
 * Body: { year, buyer, dryRun }
 * Permisos: Administradores o usuarios con permisos especiales
 */
router.post(
  "/sync-types",
  // requirePermission({
  //   category: 'special',
  //   permission: 'canManagePermissions',
  //   errorMessage: 'Solo administradores pueden sincronizar tipos de contrato'
  // }),
  sercopSyncController.syncContractTypes
);

/**
 * POST /sercop/resolve-type
 * Resolver/crear un tipo específico desde internal_type de SERCOP
 * Body: { internalType, dryRun }
 * Permisos: Administradores
 */
router.post(
  "/resolve-type",
  // requirePermission({
  //   category: 'special',
  //   permission: 'canManagePermissions',
  //   errorMessage: 'Solo administradores pueden resolver tipos'
  // }),
  sercopSyncController.resolveContractType
);

/**
 * POST /sercop/validate-type
 * Validar si un internal_type tiene mapeo definido
 * Body: { internalType }
 * Permisos: Acceso básico al módulo
 */
router.post("/validate-type", sercopSyncController.validateType);

/**
 * GET /sercop/type-mapping
 * Obtener mapeo completo de tipos SERCOP <-> Sistema
 * Permisos: Administradores
 */
router.get(
  "/type-mapping",
  // requirePermission({
  //   category: 'special',
  //   permission: 'canManagePermissions',
  //   errorMessage: 'Solo administradores pueden ver el mapeo completo'
  // }),
  sercopSyncController.getTypeMapping
);

// =============================================================================
// ENDPOINTS DE CONSULTA A SERCOP
// =============================================================================

/**
 * GET /sercop/search
 * Buscar contratos en SERCOP
 * Query: year, buyer, page, limit
 * Permisos: Acceso básico al módulo
 */
router.get("/search", sercopSyncController.searchContracts);

/**
 * GET /sercop/contract/:ocid
 * Obtener detalle de un contrato desde SERCOP
 * Params: ocid (Open Contracting ID)
 * Permisos: Acceso básico al módulo
 */
router.get("/contract/:ocid", sercopSyncController.getContractDetail);

export default router;
