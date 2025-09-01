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
  requireFlexiblePermissions,
} from "../../../middlewares/permission.middleware.js";
import { auth, verifyModuleAccess } from "../../../middlewares/auth.js";
import {
  createError,
  createValidationError,
  ERROR_CODES,
} from "../../../../utils/error.util.js";
import {
  validateObjectId,
  validateRequiredFields,
} from "../../../../utils/validation.util.js";

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
    auth,
    verifyModuleAccess,
    requirePermission({
      category: "contracts",
      permission: "canCreate",
      departmentParam: "requestingDepartment",
      errorMessage: "No tiene permisos para crear contratos",
    }),
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
          audit: {
            createdBy: user.userId,
            createdAt: new Date(),
            ipAddress: req.ip,
            userAgent: req.get("User-Agent"),
          },
        };

        // Crear contrato usando el servicio
        const newContract = await this.contractService.createContract(
          contractData,
          {
            userId: user.userId,
            createHistory: true,
          }
        );

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
          code: error.code || "CREATE_CONTRACT_ERROR",
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
    auth,
    verifyModuleAccess,
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
    async (req, res) => {
      try {
        const { query, user, permissions } = req;

        console.log(`📋 Usuario ${user.userId} consultando contratos.`);

        // Extraer y procesar parámetros de consulta
        const {
          page = 1,
          limit = 20,
          status,
          contractType,
          requestingDepartment,
          dateFrom,
          dateTo,
          search,
          sortBy = "createdAt",
          sortOrder = "desc",
          includeInactive = false,
          includeDeleted = false,
          populate = "",
        } = query;

        // Determinar acceso por departamento basado en permisos
        let departmentAccess = { type: "all" };

        if (!permissions.hasGlobalAccess) {
          if (permissions.departmentId) {
            departmentAccess = {
              type: "specific",
              departmentIds: [permissions.departmentId],
            };
          } else {
            return res.status(403).json({
              success: false,
              message: "No tiene acceso para consultar contratos",
              code: "INSUFFICIENT_PERMISSIONS",
            });
          }
        }

        // Si se especifica departamento en query, validar acceso
        if (requestingDepartment && !permissions.hasGlobalAccess) {
          if (requestingDepartment !== permissions.departmentId) {
            return res.status(403).json({
              success: false,
              message:
                "No tiene acceso a los contratos del departamento especificado",
              code: "DEPARTMENT_ACCESS_DENIED",
            });
          }
        }

        // Preparar filtros para el servicio
        const serviceFilters = {
          page: parseInt(page),
          limit: parseInt(limit),
          status,
          contractType,
          requestingDepartment: requestingDepartment || null,
          dateFrom: dateFrom ? new Date(dateFrom) : null,
          dateTo: dateTo ? new Date(dateTo) : null,
          search,
          sortBy,
          sortOrder,
          includeInactive: includeInactive === "true",
          includeDeleted: includeDeleted === "true",
          populate: populate ? populate.split(",").map((p) => p.trim()) : [],
          departmentAccess,
        };

        console.log(`🔍 Filtros para servicio:`, {
          ...serviceFilters,
          departmentAccess: serviceFilters.departmentAccess,
        });

        // Llamar al servicio
        const result =
          await this.contractService.getAllContracts(serviceFilters);

        // Construir metadata de permisos
        const userPermissions = {
          canCreate:
            permissions.validPermissions?.includes("contracts.canCreate") ||
            false,
          canViewAll: permissions.hasGlobalAccess || false,
          canExport:
            permissions.validPermissions?.includes("special.canExportData") ||
            false,
          canManageAll:
            permissions.validPermissions?.includes("contracts.canViewAll") ||
            false,
        };

        // Respuesta estructurada
        const response = {
          success: true,
          data: {
            contracts: result.contracts,
            pagination: result.pagination,
            summary: {
              total: result.pagination.totalContracts,
              showing: result.contracts.length,
              page: result.pagination.currentPage,
              pages: result.pagination.totalPages,
            },
          },
          filters: {
            applied: result.appliedFilters,
            access: {
              scope: permissions.scope,
              type: departmentAccess.type,
              departments: departmentAccess.type === "specific" ? 1 : "all",
            },
          },
          permissions: userPermissions,
          metadata: {
            requestedBy: user.userId,
            requestedAt: new Date().toISOString(),
          },
        };

        console.log(
          `✅ Contratos devueltos: ${result.contracts.length}/${result.pagination.totalContracts}`
        );

        res.status(200).json(response);
      } catch (error) {
        console.error(`❌ Error en controlador getAllContracts:`, error);

        let statusCode = 500;
        let message = "Error interno del servidor";

        if (error.name === "ValidationError") {
          statusCode = 400;
          message = "Datos de entrada inválidos";
        } else if (error.statusCode) {
          statusCode = error.statusCode;
          message = error.message;
        }

        res.status(statusCode).json({
          success: false,
          message,
          code: error.code || "CONTROLLER_ERROR",
          ...(process.env.NODE_ENV === "development" && { stack: error.stack }),
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
    auth,
    verifyModuleAccess,
    requireContractAccess("contractId"),
    async (req, res) => {
      try {
        const { contractId } = req.params;
        const { user } = req;
        const {
          includeHistory = true,
          includeDocuments = true,
          includePhases = true,
        } = req.query;

        console.log(
          `👀 Usuario ${user.userId} consultando contrato: ${contractId}`
        );

        validateObjectId(contractId, "ID del contrato");

        // Obtener contrato detallado
        const contractDetails = await this.contractService.getContractById(
          contractId,
          {
            includeHistory: includeHistory === "true",
            includeDocuments: includeDocuments === "true",
            includePhases: includePhases === "true",
            userId: user.userId,
          }
        );

        if (!contractDetails) {
          return res.status(404).json({
            success: false,
            message: "Contrato no encontrado",
            code: "CONTRACT_NOT_FOUND",
          });
        }

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
          code: error.code || "GET_CONTRACT_ERROR",
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
    auth,
    verifyModuleAccess,
    requireContractAccess("contractId"),
    requirePermission({
      category: "contracts",
      permission: "canEdit",
      errorMessage: "No tiene permisos para editar contratos",
    }),
    async (req, res) => {
      try {
        const { contractId } = req.params;
        const { body, user } = req;

        console.log(
          `✏️ Usuario ${user.userId} actualizando contrato: ${contractId}`
        );

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
            userData: {
              userId: user.userId,
              ipAddress: req.ip,
              userAgent: req.get("User-Agent"),
            },
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
          code: error.code || "UPDATE_CONTRACT_ERROR",
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
    auth,
    verifyModuleAccess,
    requireContractAccess("contractId"),
    requirePermission({
      category: "contracts",
      permission: "canDelete",
      errorMessage: "No tiene permisos para eliminar contratos",
    }),
    async (req, res) => {
      try {
        const { contractId } = req.params;
        const { user } = req;
        const { reason } = req.body;

        console.log(
          `🗑️ Usuario ${user.userId} eliminando contrato: ${contractId}`
        );

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
          code: error.code || "DELETE_CONTRACT_ERROR",
        });
      }
    },
  ];

  // =============================================================================
  // OPERACIONES DE GESTIÓN DE FASES
  // =============================================================================

  /**
   * Avanzar a la siguiente fase del contrato
   * POST /contracts/:contractId/advance-phase
   * Permisos: contracts.canEdit + acceso al contrato
   */
  advanceContractPhase = [
    auth,
    verifyModuleAccess,
    requireContractAccess("contractId"),
    requirePermission({
      category: "contracts",
      permission: "canEdit",
      errorMessage: "No tiene permisos para avanzar fases de contratos",
    }),
    async (req, res) => {
      try {
        const { contractId } = req.params;
        const { user } = req;
        const { observations, skipValidations = false } = req.body;

        console.log(
          `➡️ Usuario ${user.userId} avanzando fase del contrato: ${contractId}`
        );

        validateObjectId(contractId, "ID del contrato");

        const result = await this.contractService.advanceContractPhase(
          contractId,
          {
            userId: user.userId,
            observations,
            skipValidations: skipValidations === true,
            createHistory: true,
          }
        );

        console.log(
          `✅ Fase avanzada: ${result.previousPhase?.name} → ${result.currentPhase?.name}`
        );

        res.status(200).json({
          success: true,
          data: {
            contract: result.contract,
            previousPhase: result.previousPhase,
            currentPhase: result.currentPhase,
            message: `Contrato avanzado a fase: ${result.currentPhase?.name}`,
          },
          metadata: {
            advancedBy: user.userId,
            advancedAt: new Date(),
            contractId,
          },
        });
      } catch (error) {
        console.error(`❌ Error avanzando fase del contrato: ${error.message}`);

        res.status(error.statusCode || 500).json({
          success: false,
          message: error.message || "Error interno del servidor",
          code: error.code || "ADVANCE_PHASE_ERROR",
        });
      }
    },
  ];

  /**
   * Actualizar fase específica del contrato
   * PUT /contracts/:contractId/phases/:phaseId
   * Permisos: contracts.canEdit + acceso al contrato
   */
  updateContractPhase = [
    auth,
    verifyModuleAccess,
    requireContractAccess("contractId"),
    requirePermission({
      category: "contracts",
      permission: "canEdit",
      errorMessage: "No tiene permisos para actualizar fases de contratos",
    }),
    async (req, res) => {
      try {
        const { contractId, phaseId } = req.params;
        const { body, user } = req;

        console.log(
          `📝 Usuario ${user.userId} actualizando fase ${phaseId} del contrato: ${contractId}`
        );

        validateObjectId(contractId, "ID del contrato");
        validateObjectId(phaseId, "ID de la fase");

        const updatedPhase = await this.contractService.updateContractPhase(
          contractId,
          phaseId,
          body,
          {
            userId: user.userId,
            createHistory: true,
          }
        );

        console.log(`✅ Fase actualizada exitosamente`);

        res.status(200).json({
          success: true,
          data: {
            phase: updatedPhase,
            message: "Fase actualizada exitosamente",
          },
          metadata: {
            updatedBy: user.userId,
            updatedAt: new Date(),
            contractId,
            phaseId,
          },
        });
      } catch (error) {
        console.error(
          `❌ Error actualizando fase del contrato: ${error.message}`
        );

        res.status(error.statusCode || 500).json({
          success: false,
          message: error.message || "Error interno del servidor",
          code: error.code || "UPDATE_PHASE_ERROR",
        });
      }
    },
  ];

  // =============================================================================
  // OPERACIONES DE CONFIGURACIÓN Y UTILIDADES
  // =============================================================================

  /**
   * Obtener configuración de tipos y fases de contratación
   * GET /contracts/configuration
   * Permisos: Acceso básico al módulo
   */
  getContractsConfiguration = [
    auth,
    verifyModuleAccess,
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
   * Obtener estadísticas de contratos
   * GET /contracts/statistics
   * Permisos: Acceso básico al módulo
   */
  getContractsStatistics = [
    auth,
    verifyModuleAccess,
    async (req, res) => {
      try {
        const { user, permissions } = req;
        const { period = "month", departmentId = null } = req.query;

        console.log(
          `📊 Usuario ${user.userId} consultando estadísticas de contratos`
        );

        // Validar acceso a departamento si se especifica
        if (departmentId && !permissions.hasGlobalAccess) {
          if (departmentId !== permissions.departmentId) {
            return res.status(403).json({
              success: false,
              message:
                "No tiene acceso a las estadísticas del departamento especificado",
              code: "DEPARTMENT_ACCESS_DENIED",
            });
          }
        }

        const statistics = await this.contractService.getContractsStatistics({
          period,
          departmentId:
            departmentId ||
            (permissions.hasGlobalAccess ? null : permissions.departmentId),
          userId: user.userId,
        });

        console.log(`✅ Estadísticas generadas exitosamente`);

        res.status(200).json({
          success: true,
          data: statistics,
          metadata: {
            requestedBy: user.userId,
            requestedAt: new Date(),
            period,
            departmentId: departmentId || permissions.departmentId,
            scope: permissions.hasGlobalAccess ? "global" : "department",
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

  /**
   * Exportar contratos
   * GET /contracts/export
   * Permisos: special.canExportData
   */
  exportContracts = [
    auth,
    verifyModuleAccess,
    requirePermission({
      category: "special",
      permission: "canExportData",
      errorMessage: "No tiene permisos para exportar datos",
    }),
    async (req, res) => {
      try {
        const { user, permissions } = req;
        const { format = "xlsx", filters = "{}" } = req.query;

        console.log(
          `📤 Usuario ${user.userId} exportando contratos en formato: ${format}`
        );

        // Validar formato
        const validFormats = ["xlsx", "csv", "pdf"];
        if (!validFormats.includes(format)) {
          return res.status(400).json({
            success: false,
            message: `Formato de exportación inválido. Formatos válidos: ${validFormats.join(", ")}`,
            code: "INVALID_FORMAT",
          });
        }

        // Parsear filtros
        let parsedFilters = {};
        try {
          parsedFilters = JSON.parse(filters);
        } catch (error) {
          return res.status(400).json({
            success: false,
            message: "Filtros inválidos en formato JSON",
            code: "INVALID_FILTERS",
          });
        }

        // Aplicar restricciones de departamento si no tiene acceso global
        if (!permissions.hasGlobalAccess) {
          parsedFilters.requestingDepartment = permissions.departmentId;
        }

        const exportResult = await this.contractService.exportContracts(
          format,
          {
            filters: parsedFilters,
            userId: user.userId,
            includeDeleted: false,
          }
        );

        console.log(`✅ Exportación completada: ${exportResult.filename}`);

        // Configurar headers para descarga
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${exportResult.filename}"`
        );
        res.setHeader("Content-Type", exportResult.contentType);

        // Enviar archivo
        res.status(200).send(exportResult.buffer);
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
}
