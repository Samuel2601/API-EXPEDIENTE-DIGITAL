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
  // ENDPOINTS PARA TIPOS DE CONTRATACIÓN (CONTRACT TYPES)
  // =============================================================================

  /**
   * Obtener todos los tipos de contratación
   * GET /contract-configuration/types
   * Permisos: Acceso básico al módulo
   */
  getAllContractTypes = async (req, res) => {
    try {
      const { user, query } = req;
      const {
        includeInactive = false,
        regime = null,
        page = 1,
        limit = 50,
        flat = false,
      } = query;

      console.log(
        `📋 Usuario ${user.userId} consultando tipos de contratación`,
        query
      );

      const options = {
        includeInactive: includeInactive === "true",
        regime,
        page: parseInt(page),
        limit: parseInt(limit),
        flat,
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
  };

  /**
   * Obtener un tipo de contratación específico por ID
   * GET /contract-configuration/types/:id
   * Permisos: Acceso básico al módulo
   */
  getContractTypeById = async (req, res) => {
    try {
      const { user, params } = req;
      const { id } = params;

      console.log(
        `🔍 Usuario ${user.userId} consultando tipo de contratación: ${id}`
      );

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
  };

  /**
   * Crear nuevo tipo de contratación
   * POST /contract-configuration/types
   * Permisos: special.canManagePermissions (solo administradores)
   */
  createContractType = async (req, res) => {
    try {
      const { body, user } = req;

      console.log(
        `📝 Usuario ${user.userId} creando nuevo tipo de contratación`
      );

      // Validar campos requeridos
      validateRequiredFields(
        body,
        ["code", "name", "category", "description"],
        "datos del tipo de contratación"
      );

      const contractType = await this.configService.createContractType(body, {
        userId: user.userId,
      });

      console.log(`✅ Tipo de contratación creado: ${contractType.code}`);

      res.status(201).json({
        success: true,
        data: contractType,
        message: "Tipo de contratación creado exitosamente",
        metadata: {
          createdBy: user.userId,
          createdAt: new Date(),
        },
      });
    } catch (error) {
      console.error(`❌ Error creando tipo de contratación: ${error.message}`);

      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Error interno del servidor",
        code: error.code || "CREATE_CONTRACT_TYPE_ERROR",
      });
    }
  };

  /**
   * Actualizar tipo de contratación existente
   * PUT /contract-configuration/types/:id
   * Permisos: special.canManagePermissions (solo administradores)
   */
  updateContractType = async (req, res) => {
    try {
      const { body, user, params } = req;
      const { id } = params;

      console.log(
        `📝 Usuario ${user.userId} actualizando tipo de contratación: ${id}`
      );

      validateObjectId(id, "ID del tipo de contratación");

      const updatedType = await this.configService.updateContractType(
        id,
        body,
        {
          userId: user.userId,
        }
      );

      console.log(`✅ Tipo de contratación actualizado: ${updatedType.code}`);

      res.status(200).json({
        success: true,
        data: updatedType,
        message: "Tipo de contratación actualizado exitosamente",
        metadata: {
          updatedBy: user.userId,
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      console.error(
        `❌ Error actualizando tipo de contratación: ${error.message}`
      );

      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Error interno del servidor",
        code: error.code || "UPDATE_CONTRACT_TYPE_ERROR",
      });
    }
  };

  /**
   * Eliminar tipo de contratación (soft delete)
   * DELETE /contract-configuration/types/:id
   * Permisos: special.canManagePermissions (solo administradores)
   */
  deleteContractType = async (req, res) => {
    try {
      const { user, params } = req;
      const { id } = params;

      console.log(
        `🗑️ Usuario ${user.userId} eliminando tipo de contratación: ${id}`
      );

      validateObjectId(id, "ID del tipo de contratación");

      const deletedType = await this.configService.deleteContractType(
        id,
        user,
        {}
      );

      console.log(`✅ Tipo de contratación eliminado: ${deletedType.code}`);

      res.status(200).json({
        success: true,
        data: deletedType,
        message: "Tipo de contratación eliminado exitosamente",
        metadata: {
          deletedBy: user.userId,
          deletedAt: new Date(),
        },
      });
    } catch (error) {
      console.error(
        `❌ Error eliminando tipo de contratación: ${error.message}`
      );

      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Error interno del servidor",
        code: error.code || "DELETE_CONTRACT_TYPE_ERROR",
      });
    }
  };

  // =============================================================================
  // ENDPOINTS PARA FASES DE CONTRATACIÓN (CONTRACT PHASES)
  // =============================================================================

  /**
   * Obtener todas las fases de contratación
   * GET /contract-configuration/phases
   * Permisos: Acceso básico al módulo
   */
  getAllContractPhases = async (req, res) => {
    try {
      const { user, query } = req;
      const {
        includeInactive = false,
        contractTypeCode = null,
        category = null,
        page = 1,
        limit = 50,
      } = query;

      console.log(
        `📋 Usuario ${user.userId} consultando fases de contratación`
      );

      const options = {
        includeInactive: includeInactive === "true",
        contractTypeCode,
        category,
        page: parseInt(page),
        limit: parseInt(limit),
      };

      const contractPhases =
        await this.configService.getAllContractPhases(options);

      console.log(
        `✅ Fases obtenidas: ${contractPhases.totalPhases || 0} fases`
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
  };

  /**
   * Obtener una fase de contratación específica por ID
   * GET /contract-configuration/phases/:id
   * Permisos: Acceso básico al módulo
   */
  getContractPhaseById = async (req, res) => {
    try {
      const { user, params } = req;
      const { id } = params;

      console.log(`🔍 Usuario ${user.userId} consultando fase: ${id}`);

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
  };

  /**
   * Crear nueva fase de contratación
   * POST /contract-configuration/phases
   * Permisos: special.canManagePermissions (solo administradores)
   */
  createContractPhase = async (req, res) => {
    try {
      const { body, user } = req;

      console.log(
        `📝 Usuario ${user.userId} creando nueva fase de contratación`
      );

      // Validar campos requeridos
      validateRequiredFields(
        body,
        ["code", "name", "category", "order"],
        "datos de la fase de contratación"
      );

      const contractPhase = await this.configService.createContractPhase(body, {
        userId: user.userId,
      });

      console.log(`✅ Fase de contratación creada: ${contractPhase.code}`);

      res.status(201).json({
        success: true,
        data: contractPhase,
        message: "Fase de contratación creada exitosamente",
        metadata: {
          createdBy: user.userId,
          createdAt: new Date(),
        },
      });
    } catch (error) {
      console.error(`❌ Error creando fase de contratación: ${error.message}`);

      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Error interno del servidor",
        code: error.code || "CREATE_CONTRACT_PHASE_ERROR",
      });
    }
  };

  /**
   * Actualizar fase de contratación existente
   * PUT /contract-configuration/phases/:id
   * Permisos: special.canManagePermissions (solo administradores)
   */
  updateContractPhase = async (req, res) => {
    try {
      const { body, user, params } = req;
      const { id } = params;

      console.log(
        `📝 Usuario ${user.userId} actualizando fase de contratación: ${id}`
      );
      console.log(body);
      validateObjectId(id, "ID de la fase de contratación");

      const updatedPhase = await this.configService.updateContractPhase(
        id,
        body,
        user
      );

      console.log(`✅ Fase de contratación actualizada: ${updatedPhase.code}`);

      res.status(200).json({
        success: true,
        data: updatedPhase,
        message: "Fase de contratación actualizada exitosamente",
        metadata: {
          updatedBy: user.userId,
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      console.error(`❌ Error actualizando fase de contratación: ${error}`);

      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Error interno del servidor",
        code: error.code || "UPDATE_CONTRACT_PHASE_ERROR",
      });
    }
  };

  /**
   * Eliminar fase de contratación (soft delete)
   * DELETE /contract-configuration/phases/:id
   * Permisos: special.canManagePermissions (solo administradores)
   */
  deleteContractPhase = async (req, res) => {
    try {
      const { user, params } = req;
      const { id } = params;

      console.log(
        `🗑️ Usuario ${user.userId} eliminando fase de contratación: ${id}`
      );

      validateObjectId(id, "ID de la fase de contratación");

      const deletedPhase = await this.configService.deleteContractPhase(
        id,
        user
      );

      console.log(`✅ Fase de contratación eliminada: ${deletedPhase.code}`);

      res.status(200).json({
        success: true,
        data: deletedPhase,
        message: "Fase de contratación eliminada exitosamente",
        metadata: {
          deletedBy: user.userId,
          deletedAt: new Date(),
        },
      });
    } catch (error) {
      console.error(
        `❌ Error eliminando fase de contratación: ${error.message}`
      );

      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Error interno del servidor",
        code: error.code || "DELETE_CONTRACT_PHASE_ERROR",
      });
    }
  };

  // =============================================================================
  // ENDPOINTS PARA CONFIGURACIÓN COMPLETA
  // =============================================================================

  /**
   * Obtener configuración completa del sistema
   * GET /contract-configuration/complete
   * Permisos: Acceso básico al módulo
   */
  getCompleteConfiguration = async (req, res) => {
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
        `✅ Configuración completa obtenida: ${configuration.contractTypes.common?.count || 0 + configuration.contractTypes.special?.count || 0} tipos, ${configuration.contractPhases.totalPhases || 0} fases`
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
  };

  /**
   * Inicializar configuración completa del sistema
   * POST /contract-configuration/initialize
   * Permisos: special.canManagePermissions (solo administradores)
   */
  initializeCompleteConfiguration = async (req, res) => {
    try {
      const { user } = req;

      console.log(
        `🚀 Usuario ${user.userId} inicializando configuración completa del sistema`
      );

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
            : "Configuración completada con algunos errores",
        },
        metadata: {
          initializedBy: user.userId,
          initializedAt: new Date(),
          framework: "LOSNCP",
          version: "1.0",
        },
      });
    } catch (error) {
      console.error(`❌ Error inicializando configuración: ${error.message}`);

      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Error interno del servidor",
        code: error.code || "INIT_CONFIG_ERROR",
      });
    }
  };

  // =============================================================================
  // ENDPOINTS UTILITARIOS
  // =============================================================================

  /**
   * Obtener estadísticas de configuración
   * GET /contract-configuration/statistics
   * Permisos: Acceso básico al módulo
   */
  getConfigurationStatistics = async (req, res) => {
    try {
      const { user } = req;

      console.log(
        `📊 Usuario ${user.userId} consultando estadísticas de configuración`
      );

      const statistics = await this.configService.getConfigurationStatistics();

      console.log(`✅ Estadísticas generadas exitosamente`);

      res.status(200).json({
        success: true,
        data: statistics,
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
  };

  /**
   * POST /contract-configuration/initialize
   * Permisos: special.canManagePermissions (solo administradores)
   * Body: none
   * Este endpoint inicializa la configuración del sistema completa
   */
  initializeConfiguration = async (req, res) => {
    try {
      const { user } = req;

      console.log(
        `🚀 Usuario ${user.userId} inicializando configuración del sistema`
      );

      const initResult =
        await this.configService.initializeSystemConfiguration(user);

      console.log(
        `✅ Configuración inicializada: ${initResult.summary.completedOperations}/${initResult.summary.totalOperations} operaciones exitosas`
      );

      res.status(200).json({
        success: true,
        data: {
          initializationResult: initResult,
          message: initResult.summary.success
            ? "Configuración inicializada exitosamente"
            : "Configuración completada con algunos errores",
        },
        metadata: {
          initializedBy: user.userId,
          initializedAt: new Date(),
          framework: "LOSNCP",
          version: "1.0",
        },
      });
    } catch (error) {
      console.error(`❌ Error inicializando configuración: ${error.message}`);

      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Error interno del servidor",
        code: error.code || "INIT_CONFIG_ERROR",
      });
    }
  };

  /**
   * POST /contract-configuration/validate
   * Permisos: special.canManagePermissions (solo administradores)
   * Body: none
   * Este endpoint valida la configuración del sistema
   */

  validateConfiguration = async (req, res) => {
    try {
      const { user } = req;

      console.log(
        `📋 Usuario ${user.userId} validando configuración del sistema`
      );

      const validationResult =
        await this.configService.validateSystemConfiguration();

      console.log(
        `✅ Configuración validada: ${validationResult.summary.valid} validadas, ${validationResult.summary.invalid} inválidas`
      );

      res.status(200).json({
        success: true,
        data: {
          validationResult,
          message:
            validationResult.summary.valid > 0
              ? "Configuración validada exitosamente"
              : "Configuración inválida",
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
        code: error.code || "VALIDATION_CONFIG_ERROR",
      });
    }
  };

  getContractTypeByAmount = async (req, res) => {
    try {
      const { user, params } = req;
      const { amount } = params;

      console.log(
        `🔍 Usuario ${user.userId} consultando tipo de contratación por monto: ${amount}`
      );

      const contractType =
        await this.configService.getContractTypeByAmount(amount);

      if (!contractType) {
        return res.status(404).json({
          success: false,
          message: "Tipo de contratación no encontrado",
          code: "CONTRACT_TYPE_NOT_FOUND",
        });
      }

      console.log(
        `✅ Tipo de contratación encontrado: ${contractType.name} (${contractType.code})`
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
  };

  getPhasesByContractType = async (req, res) => {
    try {
      const { user, params } = req;
      const { id } = params;

      console.log(
        `🔍 Usuario ${user.userId} consultando fases de contratación por tipo: ${id}`
      );

      // Buscar primero el tipo de contratación para validar que existe
      const contractType = await this.configService.getContractTypeById(id);

      if (!contractType) {
        return res.status(404).json({
          success: false,
          message: "Tipo de contratación no encontrado",
          code: "CONTRACT_TYPE_NOT_FOUND",
        });
      }

      // Obtener las fases aplicables para este tipo
      const contractPhases =
        await this.configService.getPhasesByContractType(id);

      console.log(
        `✅ Fases de contratación encontradas para ${contractType.code}: ${contractPhases.length} fases`
      );

      res.status(200).json({
        success: true,
        data: {
          contractType: {
            _id: contractType._id,
            code: contractType.code,
            name: contractType.name,
            category: contractType.category,
          },
          phases: contractPhases,
        },
        metadata: {
          requestedBy: user.userId,
          requestedAt: new Date(),
          totalPhases: contractPhases.length,
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
  };

  updatePhasesByContractType = async (req, res) => {
    try {
      const { user, params, body } = req;
      const { contractTypeCode } = params;

      console.log(
        `📝 Usuario ${user.userId} actualizando fases de contratación por tipo: ${contractTypeCode}`
      );

      const updatedPhases = await this.configService.updatePhasesByContractType(
        contractTypeCode,
        body,
        {
          userId: user.userId,
        }
      );

      console.log(
        `✅ Fases de contratación actualizadas: ${updatedPhases.length} fases`
      );

      res.status(200).json({
        success: true,
        data: updatedPhases,
        message: "Fases de contratación actualizadas exitosamente",
        metadata: {
          updatedBy: user.userId,
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      console.error(
        `❌ Error actualizando fases de contratación: ${error.message}`
      );

      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Error interno del servidor",
        code: error.code || "UPDATE_PHASES_ERROR",
      });
    }
  };
}
