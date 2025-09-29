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
import { FileService } from "../services/file.service.js";

export class ContractController {
  constructor() {
    this.contractService = new ContractService();
    this.configService = new ContractConfigurationService();
    this.fileService = new FileService();
  }

  // =============================================================================
  // OPERACIONES CRUD DE CONTRATOS
  // =============================================================================

  /**
   * Crear nuevo contrato
   * POST /contracts
   * Permisos: contracts.canCreate
   */
  createContract = async (req, res) => {
    try {
      const { body, user } = req;

      console.log(`📝 Usuario ${user.userId} creando nuevo contrato`);

      // Validar campos requeridos
      validateRequiredFields(
        body,
        ["contractualObject", "contractType", "requestingDepartment", "budget"],
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
          createHistory: true,
        },
        user
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
      console.error(`❌ Controller Error creando contrato: ${error}`);

      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Error interno del servidor",
        code: error.code || "CREATE_CONTRACT_ERROR",
        details:
          process.env.NODE_ENV === "development" ? error.details : undefined,
      });
    }
  };

  /**
   * Obtener todos los contratos con filtros
   * GET /contracts
   * Permisos: contracts.canViewDepartment o contracts.canViewAll
   */
  getAllContracts = async (req, res) => {
    try {
      const { query, user, permissions } = req;

      console.log(`📋 Usuario ${user.userId} consultando contratos.`);
      console.log("📋 Permisos de usuario:", permissions);
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
        // Verificar si el usuario tiene accesos a departamentos
        if (permissions.accesses && permissions.accesses.length > 0) {
          const departmentIds = [];

          // Recorrer todos los accesos y extraer los departmentId
          permissions.accesses.forEach((access) => {
            if (access.departmentId) {
              departmentIds.push(access.departmentId);
            }
          });

          if (departmentIds.length > 0) {
            departmentAccess = {
              type: "specific",
              departmentIds: departmentIds,
            };
          } else {
            return res.status(403).json({
              success: false,
              message:
                "No tiene acceso a ningún departamento para consultar contratos",
              code: "INSUFFICIENT_PERMISSIONS",
            });
          }
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
      const result = await this.contractService.getAllContracts(serviceFilters);

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
  };

  /**
   * Obtener contrato por ID
   * GET /contracts/:contractId
   * Permisos: Acceso al contrato específico
   */
  getContractById = async (req, res) => {
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
      console.log(
        "Permissions",
        req.permissions?.hasPermission("contracts", "canEdit")
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
            req.permissions?.hasPermission("contracts", "canViewAll") || false,
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
  };

  /**
   * Actualizar contrato
   * PUT /contracts/:contractId
   * Permisos: contracts.canEdit + acceso al contrato
   */
  updateContract = async (req, res) => {
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

      console.log(`✅ Contrato actualizado: ${updatedContract.contractNumber}`);

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
  };

  /**
   * Eliminar contrato (soft delete)
   * DELETE /contracts/:contractId
   * Permisos: contracts.canDelete + acceso al contrato
   */
  deleteContract = async (req, res) => {
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
  };

  // =============================================================================
  // OPERACIONES DE GESTIÓN DE FASES
  // =============================================================================

  /**
   * Avanzar a la siguiente fase del contrato
   * POST /contracts/:contractId/advance-phase
   * Permisos: contracts.canEdit + acceso al contrato
   */
  advanceContractPhase = async (req, res) => {
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
  };

  /**
   * Actualizar fase específica del contrato
   * PUT /contracts/:contractId/phases/:phaseId
   * Permisos: contracts.canEdit + acceso al contrato
   */
  updateContractPhase = async (req, res) => {
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
  };

  // =============================================================================
  // OPERACIONES DE CONFIGURACIÓN Y UTILIDADES
  // =============================================================================

  /**
   * Obtener configuración de tipos y fases de contratación
   * GET /contracts/configuration
   * Permisos: Acceso básico al módulo
   */
  getContractsConfiguration = async (req, res) => {
    try {
      const { user } = req;
      const { includeInactive = false } = req.query;

      console.log(
        `⚙️ Usuario ${user.userId} consultando configuración de contratos`
      );

      // Obtener configuración completa usando el servicio de configuración
      const configuration = await this.configService.getCompleteConfiguration({
        includeInactive: includeInactive === "true",
      });

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
  };

  /**
   * Obtener estadísticas de contratos
   * GET /contracts/statistics
   * Permisos: Acceso básico al módulo
   */
  getContractsStatistics = async (req, res) => {
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
  };

  /**
   * Exportar contratos
   * GET /contracts/export
   * Permisos: special.canExportData
   */
  exportContracts = async (req, res) => {
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

      const exportResult = await this.contractService.exportContracts(format, {
        filters: parsedFilters,
        userId: user.userId,
        includeDeleted: false,
      });

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
  };

  // =============================================================================
  // OPERACIONES MASIVAS
  // =============================================================================

  /**
   * Actualización masiva de contratos
   * PUT /contracts/bulk-update
   */
  bulkUpdateContracts = async (req, res) => {
    try {
      const { contractIds, updateData } = req.body;
      const { user } = req;

      if (!Array.isArray(contractIds) || contractIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Se requiere un array de IDs de contratos válidos",
        });
      }

      const result = await this.contractService.bulkUpdateContracts(
        contractIds,
        updateData,
        {
          userId: user.userId,
          permissions: req.permissions,
        }
      );

      res.json({
        success: true,
        message: `${result.successful.length} contratos actualizados exitosamente`,
        data: result,
      });
    } catch (error) {
      console.error("❌ Error en bulkUpdateContracts:", error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Error interno del servidor",
      });
    }
  };

  /**
   * Eliminación masiva de contratos
   * DELETE /contracts/bulk-delete
   */
  bulkDeleteContracts = async (req, res) => {
    try {
      const { contractIds } = req.body;
      const { user } = req;

      if (!Array.isArray(contractIds) || contractIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Se requiere un array de IDs de contratos válidos",
        });
      }

      const result = await this.contractService.bulkDeleteContracts(
        contractIds,
        {
          userId: user.userId,
          permissions: req.permissions,
        }
      );

      res.json({
        success: true,
        message: `${result.successful.length} contratos eliminados exitosamente`,
        data: result,
      });
    } catch (error) {
      console.error("❌ Error en bulkDeleteContracts:", error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Error interno del servidor",
      });
    }
  };

  /**
   * Exportación masiva de contratos
   * POST /contracts/bulk-export
   */
  bulkExportContracts = async (req, res) => {
    try {
      const {
        contractIds,
        format = "excel",
        includeDocuments = false,
      } = req.body;
      const { user } = req;

      const result = await this.contractService.bulkExportContracts(
        contractIds || null,
        {
          format,
          includeDocuments,
          userId: user.userId,
          permissions: req.permissions,
          filters: req.query,
        }
      );

      res.setHeader(
        "Content-Disposition",
        `attachment; filename="contratos_export_${Date.now()}.${result.extension}"`
      );
      res.setHeader("Content-Type", result.mimeType);

      if (result.buffer) {
        res.send(result.buffer);
      } else {
        res.download(result.filePath, () => {
          // Limpiar archivo temporal después de la descarga
          if (result.cleanup) {
            result.cleanup();
          }
        });
      }
    } catch (error) {
      console.error("❌ Error en bulkExportContracts:", error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Error al exportar contratos",
      });
    }
  };

  // =============================================================================
  // GESTIÓN DE FASES
  // =============================================================================

  /**
   * Cambio de fase de contrato
   * PUT /contracts/:contractId/change-phase
   */
  changeContractPhase = async (req, res) => {
    try {
      const { contractId } = req.params;
      const { newPhase, observations, attachments } = req.body;
      const { user } = req;

      validateObjectId(contractId, "ID del contrato");

      const result = await this.contractService.changeContractPhase(
        contractId,
        {
          newPhase,
          observations,
          attachments,
          userId: user.userId,
          userInfo: {
            name: user.name,
            email: user.email,
          },
        }
      );

      res.json({
        success: true,
        message: "Fase del contrato cambiada exitosamente",
        data: result,
      });
    } catch (error) {
      console.error("❌ Error en changeContractPhase:", error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Error al cambiar fase del contrato",
      });
    }
  };

  /**
   * Cambio de estado de contrato
   * PUT /contracts/:contractId/change-status
   */
  changeContractStatus = async (req, res) => {
    try {
      const { contractId } = req.params;
      const { newStatus, reason, observations } = req.body;
      const { user } = req;

      validateObjectId(contractId, "ID del contrato");

      const result = await this.contractService.changeContractStatus(
        contractId,
        {
          newStatus,
          reason,
          observations,
          userId: user.userId,
          userInfo: {
            name: user.name,
            email: user.email,
          },
        }
      );

      res.json({
        success: true,
        message: "Estado del contrato actualizado exitosamente",
        data: result,
      });
    } catch (error) {
      console.error("❌ Error en changeContractStatus:", error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Error al cambiar estado del contrato",
      });
    }
  };

  /**
   * Obtener fases disponibles para un contrato
   * GET /contracts/:contractId/phases
   */
  getContractPhases = async (req, res) => {
    try {
      const { contractId } = req.params;
      validateObjectId(contractId, "ID del contrato");

      const phases = await this.contractService.getContractPhases(contractId);

      res.json({
        success: true,
        data: phases,
      });
    } catch (error) {
      console.error("❌ Error en getContractPhases:", error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Error al obtener fases del contrato",
      });
    }
  };

  /**
   * Obtener transiciones disponibles para un contrato
   * GET /contracts/:contractId/available-transitions
   */
  getAvailableTransitions = async (req, res) => {
    try {
      const { contractId } = req.params;
      validateObjectId(contractId, "ID del contrato");

      const transitions = await this.contractService.getAvailableTransitions(
        contractId,
        req.permissions
      );

      res.json({
        success: true,
        data: transitions,
      });
    } catch (error) {
      console.error("❌ Error en getAvailableTransitions:", error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Error al obtener transiciones disponibles",
      });
    }
  };

  // =============================================================================
  // GESTIÓN DE DOCUMENTOS
  // =============================================================================

  /**
   * Subir documentos a un contrato específico
   * POST /contracts/:contractId/documents
   * Permisos: documents.canUpload + acceso al contrato
   */
  uploadContractDocument = async (req, res) => {
    try {
      const { contractId } = req.params;
      const { user, body, files } = req;

      console.log(
        `📤 Subiendo ${files?.length || 0} documento(s) al contrato ${contractId}`
      );

      // Validaciones básicas
      validateObjectId(contractId, "ID del contrato");
      if (!files || files.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No se recibieron archivos para subir",
          code: "NO_FILES_PROVIDED",
        });
      }

      // Extraer y validar datos del documento
      const documentData = {
        contractId,
        phase: body.phase,
        documentType: body.documentType || "OTROS",
        description: body.description || "",
        isPublic: body.isPublic === "true",
        allowedRoles: body.allowedRoles ? JSON.parse(body.allowedRoles) : [],
        allowedUsers: body.allowedUsers ? JSON.parse(body.allowedUsers) : [],
        files,
      };

      const userData = {
        userId: user.userId,
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      };

      // Procesar archivos con el service
      const result = await this.contractService.uploadContractDocuments(
        contractId,
        documentData,
        userData
      );

      console.log(
        `✅ Documentos procesados: ${result.successful.length} exitosos, ${result.failed.length} fallidos`
      );

      // NUEVA FUNCIONALIDAD: Sincronizar nombres con resultados de rsync
      if (
        req.rsyncResults &&
        req.rsyncResults.enabled &&
        req.rsyncResults.results
      ) {
        await this.synchronizeFileNamesWithRsync(
          result.successful,
          req.rsyncResults.results,
          userData
        );
      }

      res.status(201).json({
        success: true,
        message: `Documentos procesados exitosamente`,
        data: {
          documents: result.successful,
          errors: result.failed,
          uploaded: result.successful,
          failed: result.failed,
          summary: {
            total: documentData.files.length,
            successful: result.successful.length,
            failed: result.failed.length,
          },
        },
        // Incluir información de rsync si está disponible
        ...(req.rsyncResults && {
          rsync: {
            enabled: req.rsyncResults.enabled,
            summary: req.rsyncResults.summary,
            remotePath: req.rsyncResults.remotePath,
          },
        }),
      });
    } catch (error) {
      console.error(`❌ Controller error en uploadContractDocument:`, error);

      res.status(error.status || 500).json({
        success: false,
        message: error.message || "Error interno del servidor",
        code: error.code || "INTERNAL_ERROR",
        ...(process.env.NODE_ENV === "development" && {
          debug: {
            stack: error.stack?.split("\n").slice(0, 5),
            timestamp: new Date().toISOString(),
          },
        }),
      });
    }
  };

  /**
   * Sincronizar nombres de archivos entre BD y resultados de rsync
   * @private
   */

  /**
   * Sincronizar nombres de archivos entre BD y resultados de rsync
   * @private
   */
  async synchronizeFileNamesWithRsync(successfulFiles, rsyncResults, userData) {
    try {
      console.log(
        `🔄 Sincronizando nombres de ${successfulFiles.length} archivos con rsync`
      );

      console.log("rsyncResults", JSON.stringify(rsyncResults, null, 2));
      console.log("successfulFiles", JSON.stringify(successfulFiles, null, 2));

      for (let i = 0; i < successfulFiles.length; i++) {
        const fileRecord = successfulFiles[i];
        console.log("fileRecord", fileRecord.fileId);
        const rsyncResult = rsyncResults.find(
          (r) => r.file === fileRecord.filename && r.success === true
        );
        console.log("rsyncResult", JSON.stringify(rsyncResult, null, 2));
        if (rsyncResult) {
          // CORREGIDO: Estructura correcta del objeto de actualización
          // Actualizar el registro del archivo con información de rsync
          await this.fileService.updateFile(
            fileRecord.fileId,
            {
              storage: {
                storageProvider: "RSYNC",
                path: rsyncResult.remotePath,
              },
            },
            userData
          );

          const updateData = {
            rsyncInfo: {
              remoteFileName:
                rsyncResult.systemName || rsyncResult.remoteFileName,
              remotePath: rsyncResult.remotePath,
              syncStatus: "SYNCED",
              lastSyncSuccess: new Date(),
              syncError: null,
              syncRetries: 0,
            },
          };
          console.log("updateData", JSON.stringify(updateData, null, 2));
          // Actualizar el registro del archivo con información de rsync
          await this.fileService.updateFile(
            fileRecord.fileId,
            updateData,
            userData
          );

          // Actualizar el systemName en la BD para que coincida con rsync
          if (
            rsyncResult.systemName &&
            rsyncResult.systemName !== fileRecord.systemName
          ) {
            await this.fileService.updateFile(
              fileRecord.fileId,
              {
                systemName: rsyncResult.systemName,
              },
              userData
            );

            console.log(
              `✅ Archivo sincronizado: ${fileRecord.originalName} -> ${rsyncResult.systemName}`
            );
          }
        } else {
          console.warn(
            `⚠️ No se encontró resultado de rsync para: ${fileRecord.originalName}`
          );
        }
      }

      console.log(`✅ Sincronización de nombres completada`);
    } catch (error) {
      console.error(`❌ Error sincronizando nombres con rsync:`, error);
      // No lanzar error - esto es complementario
    }
  }

  /**
   * Obtener documentos de un contrato
   * GET /contracts/:contractId/documents
   */
  getContractDocuments = async (req, res) => {
    try {
      const { contractId } = req.params;
      const { phase, documentType, includeContent } = req.query;

      validateObjectId(contractId, "ID del contrato");

      const documents = await this.contractService.getContractDocuments(
        contractId,
        {
          phase,
          documentType,
          includeContent: includeContent === "true",
          permissions: req.permissions,
        }
      );

      res.json({
        success: true,
        data: documents,
      });
    } catch (error) {
      console.error("❌ Error en getContractDocuments:", error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Error al obtener documentos del contrato",
      });
    }
  };

  /**
   * Obtener documento específico
   * GET /contracts/:contractId/documents/:documentId
   */
  getContractDocument = async (req, res) => {
    try {
      const { contractId, documentId } = req.params;
      const { download } = req.query;

      validateObjectId(contractId, "ID del contrato");
      validateObjectId(documentId, "ID del documento");

      const document = await this.contractService.getContractDocument(
        contractId,
        documentId,
        {
          permissions: req.permissions,
          includeContent: download === "true",
        }
      );

      if (download === "true") {
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${document.originalName}"`
        );
        res.setHeader("Content-Type", document.mimeType);
        res.send(document.content);
      } else {
        res.json({
          success: true,
          data: document,
        });
      }
    } catch (error) {
      console.error("❌ Error en getContractDocument:", error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Error al obtener documento",
      });
    }
  };

  /**
   * Actualizar documento de contrato
   * PUT /contracts/:contractId/documents/:documentId
   */
  updateContractDocument = async (req, res) => {
    try {
      const { contractId, documentId } = req.params;
      const updateData = req.body;
      const { user } = req;

      validateObjectId(contractId, "ID del contrato");
      validateObjectId(documentId, "ID del documento");

      const result = await this.contractService.updateContractDocument(
        contractId,
        documentId,
        {
          ...updateData,
          userId: user.userId,
        }
      );

      res.json({
        success: true,
        message: "Documento actualizado exitosamente",
        data: result,
      });
    } catch (error) {
      console.error("❌ Error en updateContractDocument:", error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Error al actualizar documento",
      });
    }
  };

  /**
   * Eliminar documento de contrato
   * DELETE /contracts/:contractId/documents/:documentId
   */
  deleteContractDocument = async (req, res) => {
    try {
      const { contractId, documentId } = req.params;
      const { reason } = req.body;
      const { user } = req;

      validateObjectId(contractId, "ID del contrato");
      validateObjectId(documentId, "ID del documento");

      await this.contractService.deleteContractDocument(
        contractId,
        documentId,
        {
          reason,
          userId: user.userId,
          userInfo: {
            name: user.name,
            email: user.email,
          },
        }
      );

      res.json({
        success: true,
        message: "Documento eliminado exitosamente",
      });
    } catch (error) {
      console.error("❌ Error en deleteContractDocument:", error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Error al eliminar documento",
      });
    }
  };

  // =============================================================================
  // HISTORIAL Y AUDITORÍA
  // =============================================================================

  /**
   * Obtener historial de un contrato
   * GET /contracts/:contractId/history
   */
  getContractHistory = async (req, res) => {
    try {
      const { contractId } = req.params;
      const { page = 1, limit = 20, eventType, dateFrom, dateTo } = req.query;

      validateObjectId(contractId, "ID del contrato");

      const history = await this.contractService.getContractHistory(
        contractId,
        {
          page: parseInt(page),
          limit: parseInt(limit),
          filters: { eventType, dateFrom, dateTo },
        }
      );

      res.json({
        success: true,
        data: history,
      });
    } catch (error) {
      console.error("❌ Error en getContractHistory:", error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Error al obtener historial del contrato",
      });
    }
  };

  /**
   * Obtener timeline de un contrato
   * GET /contracts/:contractId/timeline
   */
  getContractTimeline = async (req, res) => {
    try {
      const { contractId } = req.params;
      const { includeDocuments, includeMilestones } = req.query;

      validateObjectId(contractId, "ID del contrato");

      const timeline = await this.contractService.getContractTimeline(
        contractId,
        {
          includeDocuments: includeDocuments === "true",
          includeMilestones: includeMilestones === "true",
        }
      );

      res.json({
        success: true,
        data: timeline,
      });
    } catch (error) {
      console.error("❌ Error en getContractTimeline:", error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Error al obtener timeline del contrato",
      });
    }
  };

  /**
   * Obtener auditoría de un contrato
   * GET /contracts/:contractId/audit
   */
  getContractAudit = async (req, res) => {
    try {
      const { contractId } = req.params;
      const { page = 1, limit = 50, action, dateFrom, dateTo } = req.query;

      validateObjectId(contractId, "ID del contrato");

      const audit = await this.contractService.getContractAudit(contractId, {
        page: parseInt(page),
        limit: parseInt(limit),
        filters: { action, dateFrom, dateTo },
      });

      res.json({
        success: true,
        data: audit,
      });
    } catch (error) {
      console.error("❌ Error en getContractAudit:", error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Error al obtener auditoría del contrato",
      });
    }
  };

  // =============================================================================
  // OBSERVACIONES
  // =============================================================================

  /**
   * Agregar observación a un contrato
   * POST /contracts/:contractId/observations
   */
  addContractObservation = async (req, res) => {
    try {
      const { contractId } = req.params;
      const { content, type, phase, attachments } = req.body;
      const { user } = req;

      validateObjectId(contractId, "ID del contrato");
      validateRequiredFields(req.body, ["content"], "observación");

      const observation = await this.contractService.addContractObservation(
        contractId,
        {
          content,
          type,
          phase,
          attachments,
          userId: user.userId,
          userInfo: {
            name: user.name,
            email: user.email,
          },
        }
      );

      res.json({
        success: true,
        message: "Observación agregada exitosamente",
        data: observation,
      });
    } catch (error) {
      console.error("❌ Error en addContractObservation:", error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Error al agregar observación",
      });
    }
  };

  /**
   * Obtener observaciones de un contrato
   * GET /contracts/:contractId/observations
   */
  getContractObservations = async (req, res) => {
    try {
      const { contractId } = req.params;
      const { phase, type, page = 1, limit = 20 } = req.query;

      validateObjectId(contractId, "ID del contrato");

      const observations = await this.contractService.getContractObservations(
        contractId,
        {
          phase,
          type,
          page: parseInt(page),
          limit: parseInt(limit),
        }
      );

      res.json({
        success: true,
        data: observations,
      });
    } catch (error) {
      console.error("❌ Error en getContractObservations:", error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Error al obtener observaciones",
      });
    }
  };

  /**
   * Actualizar observación
   * PUT /contracts/:contractId/observations/:observationId
   */
  updateContractObservation = async (req, res) => {
    try {
      const { contractId, observationId } = req.params;
      const updateData = req.body;
      const { user } = req;

      validateObjectId(contractId, "ID del contrato");
      validateObjectId(observationId, "ID de la observación");

      const observation = await this.contractService.updateContractObservation(
        contractId,
        observationId,
        {
          ...updateData,
          userId: user.userId,
        }
      );

      res.json({
        success: true,
        message: "Observación actualizada exitosamente",
        data: observation,
      });
    } catch (error) {
      console.error("❌ Error en updateContractObservation:", error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Error al actualizar observación",
      });
    }
  };

  /**
   * Eliminar observación
   * DELETE /contracts/:contractId/observations/:observationId
   */
  deleteContractObservation = async (req, res) => {
    try {
      const { contractId, observationId } = req.params;
      const { reason } = req.body;
      const { user } = req;

      validateObjectId(contractId, "ID del contrato");
      validateObjectId(observationId, "ID de la observación");

      await this.contractService.deleteContractObservation(
        contractId,
        observationId,
        {
          reason,
          userId: user.userId,
        }
      );

      res.json({
        success: true,
        message: "Observación eliminada exitosamente",
      });
    } catch (error) {
      console.error("❌ Error en deleteContractObservation:", error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Error al eliminar observación",
      });
    }
  };

  // =============================================================================
  // ESTADÍSTICAS Y REPORTES
  // =============================================================================

  /**
   * Obtener estadísticas de contratos
   * GET /contracts/statistics
   */
  getContractStatistics = async (req, res) => {
    try {
      const { period, departmentId, contractType } = req.query;

      const statistics = await this.contractService.getContractStatistics({
        period,
        departmentId,
        contractType,
        permissions: req.permissions,
      });

      res.json({
        success: true,
        data: statistics,
      });
    } catch (error) {
      console.error("❌ Error en getContractStatistics:", error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Error al obtener estadísticas",
      });
    }
  };

  /**
   * Obtener estadísticas por departamento
   * GET /contracts/statistics/department
   */
  getDepartmentStatistics = async (req, res) => {
    try {
      const { period } = req.query;

      const statistics = await this.contractService.getDepartmentStatistics({
        period,
        permissions: req.permissions,
      });

      res.json({
        success: true,
        data: statistics,
      });
    } catch (error) {
      console.error("❌ Error en getDepartmentStatistics:", error);
      res.status(error.statusCode || 500).json({
        success: false,
        message:
          error.message || "Error al obtener estadísticas por departamento",
      });
    }
  };

  /**
   * Obtener estadísticas por fase
   * GET /contracts/statistics/phase
   */
  getPhaseStatistics = async (req, res) => {
    try {
      const { period, contractType } = req.query;

      const statistics = await this.contractService.getPhaseStatistics({
        period,
        contractType,
        permissions: req.permissions,
      });

      res.json({
        success: true,
        data: statistics,
      });
    } catch (error) {
      console.error("❌ Error en getPhaseStatistics:", error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Error al obtener estadísticas por fase",
      });
    }
  };

  /**
   * Obtener estadísticas financieras
   * GET /contracts/statistics/financial
   */
  getFinancialStatistics = async (req, res) => {
    try {
      const { period, departmentId } = req.query;

      const statistics = await this.contractService.getFinancialStatistics({
        period,
        departmentId,
        permissions: req.permissions,
      });

      res.json({
        success: true,
        data: statistics,
      });
    } catch (error) {
      console.error("❌ Error en getFinancialStatistics:", error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Error al obtener estadísticas financieras",
      });
    }
  };

  /**
   * Obtener reporte de cumplimiento
   * GET /contracts/reports/compliance
   */
  getComplianceReport = async (req, res) => {
    try {
      const { period, format = "json" } = req.query;

      const report = await this.contractService.getComplianceReport({
        period,
        permissions: req.permissions,
      });

      if (format === "excel") {
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="reporte_cumplimiento_${Date.now()}.xlsx"`
        );
        res.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        res.send(report.buffer);
      } else {
        res.json({
          success: true,
          data: report,
        });
      }
    } catch (error) {
      console.error("❌ Error en getComplianceReport:", error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Error al generar reporte de cumplimiento",
      });
    }
  };

  /**
   * Obtener reporte de desempeño
   * GET /contracts/reports/performance
   */
  getPerformanceReport = async (req, res) => {
    try {
      const { period, departmentId, format = "json" } = req.query;

      const report = await this.contractService.getPerformanceReport({
        period,
        departmentId,
        permissions: req.permissions,
      });

      if (format === "excel") {
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="reporte_desempeño_${Date.now()}.xlsx"`
        );
        res.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        res.send(report.buffer);
      } else {
        res.json({
          success: true,
          data: report,
        });
      }
    } catch (error) {
      console.error("❌ Error en getPerformanceReport:", error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Error al generar reporte de desempeño",
      });
    }
  };

  // =============================================================================
  // DASHBOARD Y UTILIDADES
  // =============================================================================

  /**
   * Obtener datos para dashboard
   * GET /contracts/dashboard
   */
  getContractsDashboard = async (req, res) => {
    try {
      const dashboard = await this.contractService.getContractsDashboard({
        userId: req.user.userId,
        permissions: req.permissions,
      });

      res.json({
        success: true,
        data: dashboard,
      });
    } catch (error) {
      console.error("❌ Error en getContractsDashboard:", error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Error al obtener datos del dashboard",
      });
    }
  };

  /**
   * Obtener acciones pendientes
   * GET /contracts/pending-actions
   */
  getPendingActions = async (req, res) => {
    try {
      const { page = 1, limit = 20, priority } = req.query;

      const actions = await this.contractService.getPendingActions({
        userId: req.user.userId,
        permissions: req.permissions,
        page: parseInt(page),
        limit: parseInt(limit),
        priority,
      });

      res.json({
        success: true,
        data: actions,
      });
    } catch (error) {
      console.error("❌ Error en getPendingActions:", error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Error al obtener acciones pendientes",
      });
    }
  };

  // =============================================================================
  // OPERACIONES ESPECIALES
  // =============================================================================

  /**
   * Duplicar contrato
   * POST /contracts/:contractId/duplicate
   */
  duplicateContract = async (req, res) => {
    try {
      const { contractId } = req.params;
      const { newContractData } = req.body;
      const { user } = req;

      validateObjectId(contractId, "ID del contrato");

      const duplicated = await this.contractService.duplicateContract(
        contractId,
        {
          ...newContractData,
          createdBy: user.userId,
          createdByInfo: {
            name: user.name,
            email: user.email,
          },
        }
      );

      res.json({
        success: true,
        message: "Contrato duplicado exitosamente",
        data: duplicated,
      });
    } catch (error) {
      console.error("❌ Error en duplicateContract:", error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Error al duplicar contrato",
      });
    }
  };

  /**
   * Archivar contrato
   * POST /contracts/:contractId/archive
   */
  archiveContract = async (req, res) => {
    try {
      const { contractId } = req.params;
      const { reason, archiveDocuments = true } = req.body;
      const { user } = req;

      validateObjectId(contractId, "ID del contrato");

      await this.contractService.archiveContract(contractId, {
        reason,
        archiveDocuments,
        userId: user.userId,
        userInfo: {
          name: user.name,
          email: user.email,
        },
      });

      res.json({
        success: true,
        message: "Contrato archivado exitosamente",
      });
    } catch (error) {
      console.error("❌ Error en archiveContract:", error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Error al archivar contrato",
      });
    }
  };

  /**
   * Restaurar contrato archivado
   * POST /contracts/:contractId/restore
   */
  restoreContract = async (req, res) => {
    try {
      const { contractId } = req.params;
      const { reason } = req.body;
      const { user } = req;

      validateObjectId(contractId, "ID del contrato");

      const restored = await this.contractService.restoreContract(contractId, {
        reason,
        userId: user.userId,
        userInfo: {
          name: user.name,
          email: user.email,
        },
      });

      res.json({
        success: true,
        message: "Contrato restaurado exitosamente",
        data: restored,
      });
    } catch (error) {
      console.error("❌ Error en restoreContract:", error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Error al restaurar contrato",
      });
    }
  };
}
