// =============================================================================
// src/module/exp-digital/controllers/contract-configuration.controller.js
// Controlador específico para configuración de tipos y fases de contratación pública
// GADM Cantón Esmeraldas - Módulo de Expediente Digital
// =============================================================================

import { ContractConfigurationService } from "../services/contract-configuration.service.js";
import {
  requirePermission,
  requireAnyPermission,
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

export class ContractConfigurationController {
  constructor() {
    this.configService = new ContractConfigurationService();
  }

  // =============================================================================
  // ENDPOINTS PARA TIPOS DE CONTRATACIÓN
  // =============================================================================

  /**
   * Obtener todos los tipos de contratación
   * GET /contract-configuration/types
   * Permisos: Acceso básico al módulo
   */
  getAllContractTypes = [
    // Middlewares de autenticación
    auth,
    verifyModuleAccess,

    // Controlador
    async (req, res) => {
      try {
        const { user, query } = req;
        const {
          includeInactive = false,
          category = null,
          page = 1,
          limit = 50,
        } = query;

        console.log(
          `📋 Usuario ${user.userId} consultando tipos de contratación`
        );

        const options = {
          includeInactive: includeInactive === "true",
          category,
          page: parseInt(page),
          limit: parseInt(limit),
        };

        const contractTypes =
          await this.configService.getAllContractTypes(options);

        console.log(
          `✅ Tipos obtenidos: ${contractTypes.common?.count || 0} comunes, ${contractTypes.special?.count || 0} especiales`
        );

        res.status(200).json({
          success: true,
          data: contractTypes,
          metadata: {
            requestedBy: user.userId,
            requestedAt: new Date(),
            options,
            framework: "LOSNCP",
            version: "1.0",
          },
        });
      } catch (error) {
        console.error(
          `❌ Error obteniendo tipos de contratación: ${error.message}`
        );

        res.status(error.statusCode || 500).json({
          success: false,
          message: error.message || "Error interno del servidor",
          code: error.code || "CONTRACT_TYPES_ERROR",
        });
      }
    },
  ];

  /**
   * Obtener un tipo de contratación específico
   * GET /contract-configuration/types/:id
   * Permisos: Acceso básico al módulo
   */
  getContractTypeById = [
    // Middlewares
    auth,
    verifyModuleAccess,

    // Controlador
    async (req, res) => {
      try {
        const { user, params } = req;
        const { id } = params;

        console.log(
          `🔍 Usuario ${user.userId} consultando tipo de contratación: ${id}`
        );

        // Validar ObjectId
        validateObjectId(id, "ID del tipo de contratación");

        const contractType = await this.configService.getContractTypeById(id);

        if (!contractType) {
          return res.status(404).json({
            success: false,
            message: "Tipo de contratación no encontrado",
            code: "CONTRACT_TYPE_NOT_FOUND",
          });
        }

        console.log(
          `✅ Tipo encontrado: ${contractType.name} (${contractType.code})`
        );

        res.status(200).json({
          success: true,
          data: contractType,
          metadata: {
            requestedBy: user.userId,
            requestedAt: new Date(),
          },
        });
      } catch (error) {
        console.error(
          `❌ Error obteniendo tipo de contratación: ${error.message}`
        );

        res.status(error.statusCode || 500).json({
          success: false,
          message: error.message || "Error interno del servidor",
          code: error.code || "CONTRACT_TYPE_ERROR",
        });
      }
    },
  ];

  // =============================================================================
  // ENDPOINTS PARA FASES DE CONTRATACIÓN
  // =============================================================================

  /**
   * Obtener todas las fases de contratación
   * GET /contract-configuration/phases
   * Permisos: Acceso básico al módulo
   */
  getAllContractPhases = [
    // Middlewares
    auth,
    verifyModuleAccess,

    // Controlador
    async (req, res) => {
      try {
        const { user, query } = req;
        const {
          includeInactive = false,
          contractTypeCode = null,
          page = 1,
          limit = 50,
        } = query;

        console.log(
          `📊 Usuario ${user.userId} consultando fases de contratación`
        );

        const options = {
          includeInactive: includeInactive === "true",
          contractTypeCode,
          page: parseInt(page),
          limit: parseInt(limit),
        };

        const contractPhases =
          await this.configService.getAllContractPhases(options);

        console.log(
          `✅ Fases obtenidas: ${contractPhases.totalPhases} total, ${contractPhases.activePhases} activas`
        );

        res.status(200).json({
          success: true,
          data: contractPhases,
          metadata: {
            requestedBy: user.userId,
            requestedAt: new Date(),
            options,
            framework: "LOSNCP",
            version: "1.0",
          },
        });
      } catch (error) {
        console.error(
          `❌ Error obteniendo fases de contratación: ${error.message}`
        );

        res.status(error.statusCode || 500).json({
          success: false,
          message: error.message || "Error interno del servidor",
          code: error.code || "CONTRACT_PHASES_ERROR",
        });
      }
    },
  ];

  /**
   * Obtener fases de un tipo de contratación específico
   * GET /contract-configuration/phases/by-type/:contractTypeId
   * Permisos: Acceso básico al módulo
   */
  getPhasesByContractType = [
    // Middlewares
    auth,
    verifyModuleAccess,

    // Controlador
    async (req, res) => {
      try {
        const { user, params, query } = req;
        const { contractTypeId } = params;
        const { includeInactive = false } = query;

        console.log(
          `🔗 Usuario ${user.userId} consultando fases para tipo: ${contractTypeId}`
        );

        // Validar ObjectId
        validateObjectId(contractTypeId, "ID del tipo de contratación");

        const phases = await this.configService.getPhasesByContractTypeId(
          contractTypeId,
          { includeInactive: includeInactive === "true" }
        );

        console.log(
          `✅ Encontradas ${phases.length} fases para el tipo de contratación`
        );

        res.status(200).json({
          success: true,
          data: {
            contractTypeId,
            phases,
            count: phases.length,
          },
          metadata: {
            requestedBy: user.userId,
            requestedAt: new Date(),
            includeInactive: includeInactive === "true",
          },
        });
      } catch (error) {
        console.error(`❌ Error obteniendo fases por tipo: ${error.message}`);

        res.status(error.statusCode || 500).json({
          success: false,
          message: error.message || "Error interno del servidor",
          code: error.code || "PHASES_BY_TYPE_ERROR",
        });
      }
    },
  ];

  /**
   * Obtener una fase específica por ID
   * GET /contract-configuration/phases/:id
   * Permisos: Acceso básico al módulo
   */
  getContractPhaseById = [
    // Middlewares
    auth,
    verifyModuleAccess,

    // Controlador
    async (req, res) => {
      try {
        const { user, params } = req;
        const { id } = params;

        console.log(`🔍 Usuario ${user.userId} consultando fase: ${id}`);

        // Validar ObjectId
        validateObjectId(id, "ID de la fase");

        const phase = await this.configService.getContractPhaseById(id);

        if (!phase) {
          return res.status(404).json({
            success: false,
            message: "Fase de contratación no encontrada",
            code: "CONTRACT_PHASE_NOT_FOUND",
          });
        }

        console.log(`✅ Fase encontrada: ${phase.name} (${phase.code})`);

        res.status(200).json({
          success: true,
          data: phase,
          metadata: {
            requestedBy: user.userId,
            requestedAt: new Date(),
          },
        });
      } catch (error) {
        console.error(`❌ Error obteniendo fase: ${error.message}`);

        res.status(error.statusCode || 500).json({
          success: false,
          message: error.message || "Error interno del servidor",
          code: error.code || "CONTRACT_PHASE_ERROR",
        });
      }
    },
  ];

  // =============================================================================
  // ENDPOINTS PARA CONFIGURACIÓN COMPLETA
  // =============================================================================

  /**
   * Obtener configuración completa del sistema
   * GET /contract-configuration/complete
   * Permisos: Acceso básico al módulo
   */
  getCompleteConfiguration = [
    // Middlewares
    auth,
    verifyModuleAccess,

    // Controlador
    async (req, res) => {
      try {
        const { user, query } = req;
        const { includeInactive = false, contractTypeCode = null } = query;

        console.log(
          `⚙️ Usuario ${user.userId} consultando configuración completa del sistema`
        );

        const options = {
          includeInactive: includeInactive === "true",
          contractTypeCode,
        };

        const configuration =
          await this.configService.getCompleteConfiguration(options);

        console.log(
          `✅ Configuración obtenida: ${configuration.contractTypes.totalTypes} tipos, ${configuration.contractPhases.totalPhases} fases`
        );

        res.status(200).json({
          success: true,
          data: configuration,
          metadata: {
            requestedBy: user.userId,
            requestedAt: new Date(),
            options,
            framework: "LOSNCP",
            version: "1.0",
            institution: "GADM Cantón Esmeraldas",
            module: "Expediente Digital",
          },
        });
      } catch (error) {
        console.error(
          `❌ Error obteniendo configuración completa: ${error.message}`
        );

        res.status(error.statusCode || 500).json({
          success: false,
          message: error.message || "Error interno del servidor",
          code: error.code || "COMPLETE_CONFIG_ERROR",
        });
      }
    },
  ];

  // =============================================================================
  // ENDPOINTS ADMINISTRATIVOS (Requieren permisos especiales)
  // =============================================================================

  /**
   * Inicializar configuración del sistema
   * POST /contract-configuration/initialize
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
          `🚀 Administrador ${user.userId} inicializando configuración del sistema`
        );

        const initResult =
          await this.configService.initializeCompleteConfiguration();

        const statusCode = initResult.summary.success ? 200 : 207; // 207 Multi-Status si hay errores parciales

        console.log(
          `✅ Configuración inicializada: ${initResult.summary.completedOperations}/${initResult.summary.totalOperations} operaciones exitosas`
        );

        res.status(statusCode).json({
          success: initResult.summary.success,
          data: {
            initializationResult: initResult,
            message: initResult.summary.success
              ? "Configuración inicializada exitosamente"
              : "Configuración inicializada con algunos errores",
          },
          metadata: {
            executedBy: user.userId,
            executedAt: new Date(),
            totalOperations: initResult.summary.totalOperations,
            completedOperations: initResult.summary.completedOperations,
            errorCount: initResult.summary.errors.length,
          },
        });
      } catch (error) {
        console.error(`❌ Error inicializando configuración: ${error.message}`);

        res.status(error.statusCode || 500).json({
          success: false,
          message: error.message || "Error interno del servidor",
          code: error.code || "INITIALIZATION_ERROR",
        });
      }
    },
  ];

  /**
   * Validar integridad de la configuración
   * GET /contract-configuration/validate
   * Permisos: contracts.canRead (acceso básico)
   */
  validateConfiguration = [
    // Middlewares
    auth,
    verifyModuleAccess,
    requireAnyPermission([
      { category: "contracts", permission: "canRead" },
      { category: "special", permission: "canManagePermissions" },
    ]),

    // Controlador
    async (req, res) => {
      try {
        const { user } = req;

        console.log(
          `🔍 Usuario ${user.userId} validando integridad de configuración`
        );

        const validation =
          await this.configService.validateConfigurationIntegrity();

        const statusCode = validation.isValid ? 200 : 409; // 409 Conflict si hay problemas

        console.log(
          `${validation.isValid ? "✅" : "⚠️"} Validación completada: ${validation.summary.totalChecks} verificaciones, ${validation.summary.errors.length} errores`
        );

        res.status(statusCode).json({
          success: true,
          data: {
            isValid: validation.isValid,
            summary: validation.summary,
            details: validation.details,
            message: validation.isValid
              ? "Configuración válida"
              : "Se encontraron problemas en la configuración",
          },
          metadata: {
            validatedBy: user.userId,
            validatedAt: new Date(),
            framework: "LOSNCP",
            version: "1.0",
          },
        });
      } catch (error) {
        console.error(`❌ Error validando configuración: ${error.message}`);

        res.status(error.statusCode || 500).json({
          success: false,
          message: error.message || "Error interno del servidor",
          code: error.code || "VALIDATION_ERROR",
        });
      }
    },
  ];

  // =============================================================================
  // ENDPOINTS DE UTILIDADES
  // =============================================================================

  /**
   * Obtener resumen estadístico de la configuración
   * GET /contract-configuration/statistics
   * Permisos: Acceso básico al módulo
   */
  getConfigurationStatistics = [
    // Middlewares
    auth,
    verifyModuleAccess,

    // Controlador
    async (req, res) => {
      try {
        const { user } = req;

        console.log(
          `📈 Usuario ${user.userId} consultando estadísticas de configuración`
        );

        const stats = await this.configService.getConfigurationStatistics();

        console.log(`✅ Estadísticas generadas exitosamente`);

        res.status(200).json({
          success: true,
          data: stats,
          metadata: {
            requestedBy: user.userId,
            requestedAt: new Date(),
            framework: "LOSNCP",
            version: "1.0",
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
   * Exportar configuración en diferentes formatos
   * GET /contract-configuration/export
   * Permisos: contracts.canRead
   * Query params: format (json|csv|excel)
   */
  exportConfiguration = [
    // Middlewares
    auth,
    verifyModuleAccess,
    requirePermission({
      category: "contracts",
      permission: "canRead",
      errorMessage: "No tiene permisos para exportar configuraciones",
    }),

    // Controlador
    async (req, res) => {
      try {
        const { user, query } = req;
        const { format = "json", includeInactive = false } = query;

        console.log(
          `📤 Usuario ${user.userId} exportando configuración en formato: ${format}`
        );

        const validFormats = ["json", "csv", "excel"];
        if (!validFormats.includes(format)) {
          return res.status(400).json({
            success: false,
            message: `Formato no soportado. Use: ${validFormats.join(", ")}`,
            code: "INVALID_FORMAT",
          });
        }

        const exportData = await this.configService.exportConfiguration({
          format,
          includeInactive: includeInactive === "true",
        });

        console.log(
          `✅ Configuración exportada exitosamente en formato ${format}`
        );

        // Establecer headers apropiados según el formato
        const headers = {
          json: {
            "Content-Type": "application/json",
            "Content-Disposition": `attachment; filename="configuracion_contratos_${new Date().toISOString().split("T")[0]}.json"`,
          },
          csv: {
            "Content-Type": "text/csv",
            "Content-Disposition": `attachment; filename="configuracion_contratos_${new Date().toISOString().split("T")[0]}.csv"`,
          },
          excel: {
            "Content-Type":
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": `attachment; filename="configuracion_contratos_${new Date().toISOString().split("T")[0]}.xlsx"`,
          },
        };

        // Establecer headers de respuesta
        Object.entries(headers[format]).forEach(([key, value]) => {
          res.set(key, value);
        });

        // Enviar datos según el formato
        if (format === "json") {
          res.status(200).json({
            success: true,
            data: exportData,
            metadata: {
              exportedBy: user.userId,
              exportedAt: new Date(),
              format,
              includeInactive: includeInactive === "true",
            },
          });
        } else {
          // Para CSV y Excel, enviar el archivo directamente
          res.status(200).send(exportData);
        }
      } catch (error) {
        console.error(`❌ Error exportando configuración: ${error.message}`);

        res.status(error.statusCode || 500).json({
          success: false,
          message: error.message || "Error interno del servidor",
          code: error.code || "EXPORT_ERROR",
        });
      }
    },
  ];
}
