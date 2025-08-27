// =============================================================================
// src/module/exp-digital/controllers/contract.controller.js
// Controlador principal para gestión de contratos del expediente digital
// GADM Cantón Esmeraldas - Sistema de Contratación Pública
// =============================================================================

import { ContractService } from "../services/contract.service.js";
import { ContractConfigurationService } from "../services/contract-configuration.service.js";
import {
  requirePermission,
  requireContractAccess,
  requireAnyPermission,
} from "../../../middlewares/permission.middleware.js";
import { auth, verifyModuleAccess } from "../../../middlewares/auth.js";
import {
  createError,
  createValidationError,
  ERROR_CODES,
} from "../../../utils/error.util.js";
import {
  validateObjectId,
  validateRequiredFields,
} from "../../../utils/validation.util.js";

export class ContractController {
  constructor() {
    this.contractService = new ContractService();
    this.configService = new ContractConfigurationService();
  }

  // =============================================================================
  // OPERACIONES CRUD DE CONTRATOS
  // =============================================================================

  /**
   * Crear nuevo contrato
   * POST /contracts
   * Permisos: contracts.canCreate
   */
  createContract = [
    // Middlewares de autenticación y permisos
    auth,
    verifyModuleAccess,
    requirePermission({
      category: "contracts",
      permission: "canCreate",
      errorMessage: "No tiene permisos para crear contratos",
    }),

    // Controlador
    async (req, res) => {
      try {
        const { body, user } = req;

        console.log(`📝 Usuario ${user.userId} creando nuevo contrato`);

        // Validar campos requeridos
        validateRequiredFields(
          body,
          [
            "contractualObject",
            "contractType",
            "requestingDepartment",
            "budget",
          ],
          "datos del contrato"
        );

        // Validar que el usuario tenga acceso al departamento solicitante
        if (body.requestingDepartment !== req.permissions.departmentId) {
          return res.status(403).json({
            success: false,
            message: "Solo puede crear contratos para su departamento asignado",
            departmentId: req.permissions.departmentId,
          });
        }

        // Preparar datos del contrato
        const contractData = {
          ...body,
          createdBy: user.userId,
          generalStatus: "DRAFT",
          currentPhase: null, // Se asignará automáticamente
          audit: {
            createdBy: user.userId,
            createdAt: new Date(),
            ipAddress: req.ip,
            userAgent: req.get("User-Agent"),
          },
        };

        // Crear contrato usando el servicio
        const newContract =
          await this.contractService.createContract(contractData);

        console.log(
          `✅ Contrato creado exitosamente: ${newContract.contractNumber}`
        );

        res.status(201).json({
          success: true,
          data: {
            contract: newContract,
            message: "Contrato creado exitosamente",
            nextSteps: [
              "Completar documentos de la fase preparatoria",
              "Subir certificación presupuestaria",
              "Definir términos de referencia",
            ],
          },
          metadata: {
            createdBy: user.userId,
            createdAt: new Date(),
            contractNumber: newContract.contractNumber,
          },
        });
      } catch (error) {
        console.error(`❌ Error creando contrato: ${error.message}`);

        res.status(error.statusCode || 500).json({
          success: false,
          message: error.message || "Error interno del servidor",
          code: error.code || "INTERNAL_ERROR",
          details:
            process.env.NODE_ENV === "development" ? error.details : undefined,
        });
      }
    },
  ];

  /**
   * Obtener todos los contratos con filtros
   * GET /contracts
   * Permisos: contracts.canViewDepartment o contracts.canViewAll
   */
  getAllContracts = [
    // Middlewares
    auth,
    verifyModuleAccess,
    requireAnyPermission([
      { category: "contracts", permission: "canViewDepartment" },
      { category: "contracts", permission: "canViewAll" },
    ]),

    // Controlador
    async (req, res) => {
      try {
        const { query, user, permissions } = req;

        console.log(`📋 Usuario ${user.userId} consultando contratos`);

        // Extraer parámetros de consulta
        const {
          page = 1,
          limit = 20,
          status,
          contractType,
          dateFrom,
          dateTo,
          search,
          sortBy = "createdAt",
          sortOrder = "desc",
          includeInactive = false,
        } = query;

        // Construir filtros según permisos del usuario
        const filters = {
          page: parseInt(page),
          limit: Math.min(parseInt(limit), 100), // Máximo 100 por página
          status,
          contractType,
          dateFrom,
          dateTo,
          search,
          sortBy,
          sortOrder,
          includeInactive: includeInactive === "true",
        };

        // Restricciones de acceso según permisos
        if (permissions.hasPermission("contracts", "canViewAll")) {
          // Puede ver todos los contratos
          filters.departmentAccess = "all";
        } else if (
          permissions.hasPermission("contracts", "canViewDepartment")
        ) {
          // Solo contratos de su departamento
          filters.departmentAccess = "department";
          filters.departmentId = permissions.departmentId;
        }

        // Obtener contratos del servicio
        const result = await this.contractService.getAllContracts(filters);

        console.log(
          `✅ Contratos obtenidos: ${result.contracts.length}/${result.pagination.totalContracts}`
        );

        res.status(200).json({
          success: true,
          data: {
            contracts: result.contracts,
            pagination: result.pagination,
            filters: result.appliedFilters,
            summary: {
              totalContracts: result.pagination.totalContracts,
              currentPage: result.pagination.currentPage,
              totalPages: result.pagination.totalPages,
              pageSize: result.pagination.limit,
            },
          },
          metadata: {
            requestedBy: user.userId,
            requestedAt: new Date(),
            departmentAccess: filters.departmentAccess,
            permissions: {
              canCreate: permissions.hasPermission("contracts", "canCreate"),
              canViewAll: permissions.hasPermission("contracts", "canViewAll"),
              canExport: permissions.hasPermission("special", "canExportData"),
            },
          },
        });
      } catch (error) {
        console.error(`❌ Error obteniendo contratos: ${error.message}`);

        res.status(error.statusCode || 500).json({
          success: false,
          message: error.message || "Error interno del servidor",
          code: error.code || "FETCH_ERROR",
        });
      }
    },
  ];

  /**
   * Obtener contrato por ID
   * GET /contracts/:contractId
   * Permisos: Acceso al contrato específico
   */
  getContractById = [
    // Middlewares
    auth,
    verifyModuleAccess,
    requireContractAccess("contractId"),

    // Controlador
    async (req, res) => {
      try {
        const { contractId } = req.params;
        const { user, contract: contractAccess } = req;

        console.log(
          `👀 Usuario ${user.userId} consultando contrato: ${contractId}`
        );

        // Validar ID del contrato
        validateObjectId(contractId, "ID del contrato");

        // Obtener contrato detallado
        const contractDetails = await this.contractService.getContractById(
          contractId,
          {
            includeHistory: true,
            includeDocuments: true,
            includePhases: true,
            userId: user.userId,
          }
        );

        // Verificar permisos específicos para este contrato
        const userPermissions = {
          canEdit:
            req.permissions?.hasPermission("contracts", "canEdit") || false,
          canDelete:
            req.permissions?.hasPermission("contracts", "canDelete") || false,
          canViewFinancial:
            req.permissions?.hasPermission("special", "canViewFinancialData") ||
            false,
          canUploadDocuments:
            req.permissions?.hasPermission("documents", "canUpload") || false,
          canDownloadDocuments:
            req.permissions?.hasPermission("documents", "canDownload") || false,
        };

        console.log(
          `✅ Contrato obtenido: ${contractDetails.contract.contractNumber}`
        );

        res.status(200).json({
          success: true,
          data: {
            contract: contractDetails.contract,
            phases: contractDetails.phases,
            documents: contractDetails.documents,
            history: contractDetails.history,
            statistics: contractDetails.statistics,
            permissions: userPermissions,
          },
          metadata: {
            requestedBy: user.userId,
            requestedAt: new Date(),
            contractId,
            hasFullAccess:
              req.permissions?.hasPermission("contracts", "canViewAll") ||
              false,
          },
        });
      } catch (error) {
        console.error(`❌ Error obteniendo contrato: ${error.message}`);

        res.status(error.statusCode || 500).json({
          success: false,
          message: error.message || "Error interno del servidor",
          code: error.code || "NOT_FOUND",
        });
      }
    },
  ];

  /**
   * Actualizar contrato
   * PUT /contracts/:contractId
   * Permisos: contracts.canEdit + acceso al contrato
   */
  updateContract = [
    // Middlewares
    auth,
    verifyModuleAccess,
    requireContractAccess("contractId"),
    requirePermission({
      category: "contracts",
      permission: "canEdit",
      errorMessage: "No tiene permisos para editar contratos",
    }),

    // Controlador
    async (req, res) => {
      try {
        const { contractId } = req.params;
        const { body, user } = req;

        console.log(
          `✏️ Usuario ${user.userId} actualizando contrato: ${contractId}`
        );

        // Validar ID del contrato
        validateObjectId(contractId, "ID del contrato");

        // Preparar datos de actualización
        const updateData = {
          ...body,
          audit: {
            lastModifiedBy: user.userId,
            lastModifiedAt: new Date(),
            ipAddress: req.ip,
            userAgent: req.get("User-Agent"),
          },
        };

        // Remover campos que no se pueden actualizar directamente
        const protectedFields = [
          "_id",
          "contractNumber",
          "createdAt",
          "createdBy",
        ];
        protectedFields.forEach((field) => delete updateData[field]);

        // Actualizar contrato usando el servicio
        const updatedContract = await this.contractService.updateContract(
          contractId,
          updateData,
          {
            userId: user.userId,
            createHistory: true,
            validateTransitions: true,
          }
        );

        console.log(
          `✅ Contrato actualizado: ${updatedContract.contractNumber}`
        );

        res.status(200).json({
          success: true,
          data: {
            contract: updatedContract,
            message: "Contrato actualizado exitosamente",
            changes: updatedContract.changesSummary || [],
          },
          metadata: {
            updatedBy: user.userId,
            updatedAt: new Date(),
            contractId,
            version: updatedContract.version || 1,
          },
        });
      } catch (error) {
        console.error(`❌ Error actualizando contrato: ${error.message}`);

        res.status(error.statusCode || 500).json({
          success: false,
          message: error.message || "Error interno del servidor",
          code: error.code || "UPDATE_ERROR",
        });
      }
    },
  ];

  /**
   * Eliminar contrato (soft delete)
   * DELETE /contracts/:contractId
   * Permisos: contracts.canDelete + acceso al contrato
   */
  deleteContract = [
    // Middlewares
    auth,
    verifyModuleAccess,
    requireContractAccess("contractId"),
    requirePermission({
      category: "contracts",
      permission: "canDelete",
      errorMessage: "No tiene permisos para eliminar contratos",
    }),

    // Controlador
    async (req, res) => {
      try {
        const { contractId } = req.params;
        const { user } = req;
        const { reason } = req.body;

        console.log(
          `🗑️ Usuario ${user.userId} eliminando contrato: ${contractId}`
        );

        // Validar ID del contrato
        validateObjectId(contractId, "ID del contrato");

        // Validar razón de eliminación
        if (!reason || reason.trim().length < 10) {
          return res.status(400).json({
            success: false,
            message:
              "Se requiere una razón de eliminación de al menos 10 caracteres",
            field: "reason",
          });
        }

        // Eliminar contrato usando el servicio
        const result = await this.contractService.deleteContract(contractId, {
          reason: reason.trim(),
          deletedBy: user.userId,
          createHistory: true,
          softDelete: true, // Siempre soft delete para auditoría
        });

        console.log(`✅ Contrato eliminado: ${result.contractNumber}`);

        res.status(200).json({
          success: true,
          data: {
            message: "Contrato eliminado exitosamente",
            contractNumber: result.contractNumber,
            deletedAt: result.deletedAt,
            reason: result.deletionReason,
          },
          metadata: {
            deletedBy: user.userId,
            deletedAt: new Date(),
            contractId,
            type: "soft_delete",
          },
        });
      } catch (error) {
        console.error(`❌ Error eliminando contrato: ${error.message}`);

        res.status(error.statusCode || 500).json({
          success: false,
          message: error.message || "Error interno del servidor",
          code: error.code || "DELETE_ERROR",
        });
      }
    },
  ];

  // =============================================================================
  // OPERACIONES DE GESTIÓN DE FASES
  // =============================================================================

  /**
   * Avanzar contrato a la siguiente fase
   * POST /contracts/:contractId/advance-phase
   * Permisos: contracts.canEdit + verificaciones de fase
   */
  advanceContractPhase = [
    // Middlewares
    auth,
    verifyModuleAccess,
    requireContractAccess("contractId"),
    requirePermission({
      category: "contracts",
      permission: "canEdit",
      errorMessage: "No tiene permisos para cambiar fases de contratos",
    }),

    // Controlador
    async (req, res) => {
      try {
        const { contractId } = req.params;
        const { user } = req;
        const { notes, skipValidations = false } = req.body;

        console.log(
          `⏭️ Usuario ${user.userId} avanzando fase del contrato: ${contractId}`
        );

        // Validar ID del contrato
        validateObjectId(contractId, "ID del contrato");

        // Avanzar fase usando el servicio
        const result = await this.contractService.advanceContractPhase(
          contractId,
          {
            notes: notes || "",
            userId: user.userId,
            skipValidations: skipValidations === true,
            createHistory: true,
            validateDocuments: true,
          }
        );

        console.log(
          `✅ Fase avanzada: ${result.previousPhase?.name} → ${result.currentPhase?.name}`
        );

        res.status(200).json({
          success: true,
          data: {
            contract: result.contract,
            phaseTransition: {
              from: result.previousPhase,
              to: result.currentPhase,
              transitionDate: new Date(),
              notes: notes,
            },
            nextSteps: result.nextSteps || [],
            message: `Contrato avanzado a la fase: ${result.currentPhase?.name}`,
          },
          metadata: {
            advancedBy: user.userId,
            advancedAt: new Date(),
            contractId,
          },
        });
      } catch (error) {
        console.error(`❌ Error avanzando fase: ${error.message}`);

        res.status(error.statusCode || 500).json({
          success: false,
          message: error.message || "Error interno del servidor",
          code: error.code || "PHASE_ADVANCE_ERROR",
          details: {
            currentPhase: error.currentPhase,
            blockedBy: error.blockedBy,
            missingRequirements: error.missingRequirements,
          },
        });
      }
    },
  ];

  /**
   * Cambiar estado del contrato
   * POST /contracts/:contractId/change-status
   * Permisos: contracts.canEdit + validaciones de estado
   */
  changeContractStatus = [
    // Middlewares
    auth,
    verifyModuleAccess,
    requireContractAccess("contractId"),
    requirePermission({
      category: "contracts",
      permission: "canEdit",
      errorMessage: "No tiene permisos para cambiar estados de contratos",
    }),

    // Controlador
    async (req, res) => {
      try {
        const { contractId } = req.params;
        const { newStatus, reason, effectiveDate } = req.body;
        const { user } = req;

        console.log(
          `🔄 Usuario ${user.userId} cambiando estado del contrato: ${contractId}`
        );

        // Validaciones básicas
        validateObjectId(contractId, "ID del contrato");
        validateRequiredFields(
          { newStatus, reason },
          ["newStatus", "reason"],
          "cambio de estado"
        );

        // Validar nuevo estado
        const validStatuses = [
          "DRAFT",
          "PREPARATION",
          "CALL",
          "EVALUATION",
          "AWARD",
          "CONTRACTING",
          "EXECUTION",
          "FINISHED",
          "LIQUIDATED",
          "CANCELLED",
          "SUSPENDED",
        ];

        if (!validStatuses.includes(newStatus)) {
          return res.status(400).json({
            success: false,
            message: "Estado no válido",
            validStatuses,
            provided: newStatus,
          });
        }

        // Cambiar estado usando el servicio
        const result = await this.contractService.changeContractStatus(
          contractId,
          {
            newStatus,
            reason: reason.trim(),
            effectiveDate: effectiveDate ? new Date(effectiveDate) : new Date(),
            userId: user.userId,
            createHistory: true,
            validateTransition: true,
          }
        );

        console.log(
          `✅ Estado cambiado: ${result.previousStatus} → ${result.currentStatus}`
        );

        res.status(200).json({
          success: true,
          data: {
            contract: result.contract,
            statusChange: {
              from: result.previousStatus,
              to: result.currentStatus,
              reason: reason.trim(),
              effectiveDate: result.effectiveDate,
              changedBy: user.userId,
            },
            message: `Estado del contrato cambiado a: ${result.currentStatus}`,
          },
          metadata: {
            changedBy: user.userId,
            changedAt: new Date(),
            contractId,
          },
        });
      } catch (error) {
        console.error(`❌ Error cambiando estado: ${error.message}`);

        res.status(error.statusCode || 500).json({
          success: false,
          message: error.message || "Error interno del servidor",
          code: error.code || "STATUS_CHANGE_ERROR",
        });
      }
    },
  ];

  // =============================================================================
  // OPERACIONES DE CONSULTA Y REPORTES
  // =============================================================================

  /**
   * Obtener dashboard de contratos
   * GET /contracts/dashboard
   * Permisos: contracts.canViewDepartment o contracts.canViewAll
   */
  getContractsDashboard = [
    // Middlewares
    auth,
    verifyModuleAccess,
    requireAnyPermission([
      { category: "contracts", permission: "canViewDepartment" },
      { category: "contracts", permission: "canViewAll" },
    ]),

    // Controlador
    async (req, res) => {
      try {
        const { user, permissions } = req;

        console.log(
          `📊 Usuario ${user.userId} consultando dashboard de contratos`
        );

        // Determinar alcance del dashboard según permisos
        const scope = permissions.hasPermission("contracts", "canViewAll")
          ? "global"
          : "department";

        const dashboardOptions = {
          scope,
          departmentId:
            scope === "department" ? permissions.departmentId : null,
          userId: user.userId,
          includeFinancialData: permissions.hasPermission(
            "special",
            "canViewFinancialData"
          ),
          includeTrends: true,
          includeAlerts: true,
        };

        // Obtener datos del dashboard
        const dashboard =
          await this.contractService.getContractsDashboard(dashboardOptions);

        console.log(
          `✅ Dashboard generado con ${dashboard.summary.totalContracts} contratos`
        );

        res.status(200).json({
          success: true,
          data: {
            summary: dashboard.summary,
            statusDistribution: dashboard.statusDistribution,
            phaseDistribution: dashboard.phaseDistribution,
            typeDistribution: dashboard.typeDistribution,
            trends: dashboard.trends,
            alerts: dashboard.alerts,
            recentActivity: dashboard.recentActivity,
            upcomingDeadlines: dashboard.upcomingDeadlines,
            financialSummary: dashboard.financialSummary, // Solo si tiene permisos
          },
          metadata: {
            scope,
            departmentId: dashboardOptions.departmentId,
            generatedAt: new Date(),
            generatedBy: user.userId,
            permissions: {
              canViewAll: permissions.hasPermission("contracts", "canViewAll"),
              canViewFinancialData: permissions.hasPermission(
                "special",
                "canViewFinancialData"
              ),
              canExportData: permissions.hasPermission(
                "special",
                "canExportData"
              ),
            },
          },
        });
      } catch (error) {
        console.error(`❌ Error obteniendo dashboard: ${error.message}`);

        res.status(error.statusCode || 500).json({
          success: false,
          message: error.message || "Error interno del servidor",
          code: error.code || "DASHBOARD_ERROR",
        });
      }
    },
  ];

  /**
   * Buscar contratos con filtros avanzados
   * POST /contracts/search
   * Permisos: contracts.canViewDepartment o contracts.canViewAll
   */
  searchContracts = [
    // Middlewares
    auth,
    verifyModuleAccess,
    requireAnyPermission([
      { category: "contracts", permission: "canViewDepartment" },
      { category: "contracts", permission: "canViewAll" },
    ]),

    // Controlador
    async (req, res) => {
      try {
        const { body, user, permissions } = req;

        console.log(
          `🔍 Usuario ${user.userId} ejecutando búsqueda avanzada de contratos`
        );

        // Construir criterios de búsqueda
        const searchCriteria = {
          ...body,
          // Aplicar restricciones de acceso
          accessRestrictions: {
            scope: permissions.hasPermission("contracts", "canViewAll")
              ? "global"
              : "department",
            departmentId: permissions.hasPermission("contracts", "canViewAll")
              ? null
              : permissions.departmentId,
            userId: user.userId,
          },
        };

        // Ejecutar búsqueda usando el servicio
        const searchResults =
          await this.contractService.searchContracts(searchCriteria);

        console.log(
          `✅ Búsqueda completada: ${searchResults.results.length} contratos encontrados`
        );

        res.status(200).json({
          success: true,
          data: {
            results: searchResults.results,
            pagination: searchResults.pagination,
            aggregations: searchResults.aggregations,
            appliedFilters: searchResults.appliedFilters,
            searchMetadata: searchResults.searchMetadata,
          },
          metadata: {
            searchedBy: user.userId,
            searchedAt: new Date(),
            totalResults: searchResults.pagination.totalResults,
            searchDuration: searchResults.searchMetadata.duration,
            scope: searchCriteria.accessRestrictions.scope,
          },
        });
      } catch (error) {
        console.error(`❌ Error en búsqueda: ${error.message}`);

        res.status(error.statusCode || 500).json({
          success: false,
          message: error.message || "Error interno del servidor",
          code: error.code || "SEARCH_ERROR",
        });
      }
    },
  ];

  // =============================================================================
  // OPERACIONES DE CONFIGURACIÓN
  // =============================================================================

  /**
   * Obtener configuración de tipos y fases de contratación
   * GET /contracts/configuration
   * Permisos: Acceso básico al módulo
   */
  getContractsConfiguration = [
    // Middlewares
    auth,
    verifyModuleAccess,

    // Controlador
    async (req, res) => {
      try {
        const { user } = req;
        const { includeInactive = false } = req.query;

        console.log(
          `⚙️ Usuario ${user.userId} consultando configuración de contratos`
        );

        // Obtener configuración completa usando el servicio de configuración
        const configuration = await this.configService.getCompleteConfiguration(
          {
            includeInactive: includeInactive === "true",
          }
        );

        console.log(
          `✅ Configuración obtenida: ${configuration.contractTypes.totalTypes} tipos, ${configuration.contractPhases.totalPhases} fases`
        );

        res.status(200).json({
          success: true,
          data: {
            contractTypes: configuration.contractTypes,
            contractPhases: configuration.contractPhases,
            metadata: configuration.metadata,
          },
          metadata: {
            requestedBy: user.userId,
            requestedAt: new Date(),
            includeInactive: includeInactive === "true",
            version: "1.0",
            framework: "LOSNCP",
          },
        });
      } catch (error) {
        console.error(`❌ Error obteniendo configuración: ${error.message}`);

        res.status(error.statusCode || 500).json({
          success: false,
          message: error.message || "Error interno del servidor",
          code: error.code || "CONFIG_ERROR",
        });
      }
    },
  ];

  /**
   * Inicializar configuración del sistema
   * POST /contracts/configuration/initialize
   * Permisos: special.canManagePermissions (solo administradores)
   */
  initializeConfiguration = [
    // Middlewares
    auth,
    verifyModuleAccess,
    requirePermission({
      category: "special",
      permission: "canManagePermissions",
      errorMessage:
        "Solo los administradores pueden inicializar la configuración del sistema",
    }),

    // Controlador
    async (req, res) => {
      try {
        const { user } = req;

        console.log(
          `🚀 Usuario ${user.userId} inicializando configuración del sistema`
        );

        // Inicializar configuración completa usando el servicio de configuración
        const initResult =
          await this.configService.initializeCompleteConfiguration();

        console.log(
          `✅ Configuración inicializada: ${initResult.summary.completedOperations}/${initResult.summary.totalOperations} operaciones exitosas`
        );

        res.status(200).json({
          success: true,
          data: {
            initializationResult: initResult,
            message: initResult.summary.success
              ? "Configuración inicializada exitosamente"
              : "Configuración inicializada con algunos errores",
            summary: initResult.summary,
          },
          metadata: {
            initializedBy: user.userId,
            initializedAt: new Date(),
            systemReady: initResult.summary.success,
          },
        });
      } catch (error) {
        console.error(`❌ Error inicializando configuración: ${error.message}`);

        res.status(error.statusCode || 500).json({
          success: false,
          message: error.message || "Error interno del servidor",
          code: error.code || "INIT_ERROR",
        });
      }
    },
  ];

  // =============================================================================
  // OPERACIONES DE EXPORTACIÓN Y REPORTES
  // =============================================================================

  /**
   * Exportar contratos a Excel/PDF
   * POST /contracts/export
   * Permisos: special.canExportData
   */
  exportContracts = [
    // Middlewares
    auth,
    verifyModuleAccess,
    requirePermission({
      category: "special",
      permission: "canExportData",
      errorMessage: "No tiene permisos para exportar datos",
    }),

    // Controlador
    async (req, res) => {
      try {
        const { body, user, permissions } = req;

        console.log(`📤 Usuario ${user.userId} exportando contratos`);

        // Extraer opciones de exportación
        const {
          format = "excel", // excel, pdf, csv
          filters = {},
          includeDocuments = false,
          includeHistory = false,
          includeFinancialData = false,
        } = body;

        // Validar formato
        const validFormats = ["excel", "pdf", "csv"];
        if (!validFormats.includes(format)) {
          return res.status(400).json({
            success: false,
            message: "Formato de exportación no válido",
            validFormats,
            provided: format,
          });
        }

        // Verificar permisos adicionales
        if (
          includeFinancialData &&
          !permissions.hasPermission("special", "canViewFinancialData")
        ) {
          return res.status(403).json({
            success: false,
            message: "No tiene permisos para exportar datos financieros",
          });
        }

        // Aplicar restricciones de acceso
        const exportOptions = {
          format,
          filters: {
            ...filters,
            // Aplicar restricciones departamentales si es necesario
            ...(permissions.hasPermission("contracts", "canViewAll")
              ? {}
              : { departmentId: permissions.departmentId }),
          },
          includeDocuments,
          includeHistory,
          includeFinancialData,
          exportedBy: user.userId,
          exportDate: new Date(),
        };

        // Generar exportación usando el servicio
        const exportResult =
          await this.contractService.exportContracts(exportOptions);

        console.log(
          `✅ Exportación completada: ${exportResult.recordCount} registros en formato ${format}`
        );

        // Configurar headers para descarga
        res.setHeader("Content-Type", exportResult.mimeType);
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${exportResult.filename}"`
        );
        res.setHeader("Content-Length", exportResult.size);

        // Enviar archivo
        res.send(exportResult.buffer);
      } catch (error) {
        console.error(`❌ Error exportando contratos: ${error.message}`);

        res.status(error.statusCode || 500).json({
          success: false,
          message: error.message || "Error interno del servidor",
          code: error.code || "EXPORT_ERROR",
        });
      }
    },
  ];

  /**
   * Generar reporte estadístico de contratos
   * GET /contracts/statistics
   * Permisos: contracts.canViewDepartment o contracts.canViewAll
   */
  getContractStatistics = [
    // Middlewares
    auth,
    verifyModuleAccess,
    requireAnyPermission([
      { category: "contracts", permission: "canViewDepartment" },
      { category: "contracts", permission: "canViewAll" },
    ]),

    // Controlador
    async (req, res) => {
      try {
        const { query, user, permissions } = req;

        console.log(
          `📈 Usuario ${user.userId} consultando estadísticas de contratos`
        );

        // Extraer parámetros de consulta
        const {
          dateFrom,
          dateTo,
          groupBy = "status", // status, type, department, phase
          includeFinancialData = "false",
          includeComparison = "false",
        } = query;

        // Verificar permisos para datos financieros
        const canViewFinancial = permissions.hasPermission(
          "special",
          "canViewFinancialData"
        );
        const requestedFinancialData = includeFinancialData === "true";

        if (requestedFinancialData && !canViewFinancial) {
          return res.status(403).json({
            success: false,
            message: "No tiene permisos para ver datos financieros",
          });
        }

        // Configurar opciones de estadísticas
        const statsOptions = {
          dateFrom: dateFrom ? new Date(dateFrom) : null,
          dateTo: dateTo ? new Date(dateTo) : null,
          groupBy,
          includeFinancialData: requestedFinancialData && canViewFinancial,
          includeComparison: includeComparison === "true",
          scope: permissions.hasPermission("contracts", "canViewAll")
            ? "global"
            : "department",
          departmentId: permissions.hasPermission("contracts", "canViewAll")
            ? null
            : permissions.departmentId,
          userId: user.userId,
        };

        // Generar estadísticas usando el servicio
        const statistics =
          await this.contractService.getContractStatistics(statsOptions);

        console.log(
          `✅ Estadísticas generadas para ${statistics.metadata.totalContracts} contratos`
        );

        res.status(200).json({
          success: true,
          data: {
            statistics: statistics.data,
            summary: statistics.summary,
            trends: statistics.trends,
            comparisons: statistics.comparisons,
            charts: statistics.chartData,
            metadata: statistics.metadata,
          },
          metadata: {
            generatedBy: user.userId,
            generatedAt: new Date(),
            scope: statsOptions.scope,
            includeFinancialData: statsOptions.includeFinancialData,
            period: {
              from: statsOptions.dateFrom,
              to: statsOptions.dateTo,
            },
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
    },
  ];
}
