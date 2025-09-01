// =============================================================================
// src/module/exp-digital/services/contract-configuration.service.js
// Servicio unificado para configuración de tipos y fases de contratación pública
// GADM Cantón Esmeraldas - Módulo de Expediente Digital
// =============================================================================

import { ContractTypeRepository } from "../repositories/contract-type.repository.js";
import { ContractPhaseRepository } from "../repositories/contract-phase.repository.js";
import {
  createError,
  createValidationError,
  ERROR_CODES,
} from "../../../../utils/error.util.js";
import {
  validateObjectId,
  validateObjectIdArray,
} from "../../../../utils/validation.util.js";

export class ContractConfigurationService {
  constructor() {
    this.contractTypeRepository = new ContractTypeRepository();
    this.contractPhaseRepository = new ContractPhaseRepository();
  }

  // =============================================================================
  // OPERACIONES CRUD PARA TIPOS DE CONTRATACIÓN
  // =============================================================================

  /**
   * Obtener todos los tipos de contratación con información completa
   * @param {Object} options - Opciones de consulta
   * @returns {Promise<Object>} Tipos de contratación categorizados
   */
  async getAllContractTypes(options = {}) {
    try {
      const {
        includeInactive = false,
        category = null,
        page = 1,
        limit = 50,
      } = options;

      console.log(
        `📋 Service: Obteniendo tipos de contratación con opciones:`,
        options
      );

      if (category) {
        // Si se especifica una categoría, obtener solo esa
        const types = await this.contractTypeRepository.findByCategory(
          category,
          {
            includeInactive,
            page,
            limit,
          }
        );

        return {
          [category.toLowerCase()]: {
            category,
            description:
              category === "COMMON"
                ? "Procedimientos Comunes según LOSNCP"
                : "Procedimientos Especiales según LOSNCP",
            types: types.docs || types,
            count: types.totalDocs || types.length,
            totalPages: types.totalPages || 1,
            currentPage: types.page || 1,
          },
          totalTypes: types.totalDocs || types.length,
        };
      }

      // Obtener tipos comunes y especiales por separado
      const [commonTypes, specialTypes] = await Promise.all([
        this.contractTypeRepository.findByCategory("COMMON", {
          includeInactive,
          page: 1,
          limit: 100,
        }),
        this.contractTypeRepository.findByCategory("SPECIAL", {
          includeInactive,
          page: 1,
          limit: 100,
        }),
      ]);

      return {
        common: {
          category: "COMMON",
          description: "Procedimientos Comunes según LOSNCP",
          types: commonTypes.docs || commonTypes,
          count: commonTypes.totalDocs || commonTypes.length,
        },
        special: {
          category: "SPECIAL",
          description: "Procedimientos Especiales según LOSNCP",
          types: specialTypes.docs || specialTypes,
          count: specialTypes.totalDocs || specialTypes.length,
        },
        totalTypes:
          (commonTypes.totalDocs || commonTypes.length) +
          (specialTypes.totalDocs || specialTypes.length),
      };
    } catch (error) {
      throw createError(
        ERROR_CODES.QUERY_ERROR,
        `Error obteniendo tipos de contratación: ${error.message}`,
        500
      );
    }
  }

  /**
   * Obtener un tipo de contratación por ID
   * @param {String} typeId - ID del tipo de contratación
   * @returns {Promise<Object>} Tipo de contratación
   */
  async getContractTypeById(typeId) {
    try {
      validateObjectId(typeId, "ID del tipo de contratación");

      console.log(
        `🔍 Service: Obteniendo tipo de contratación por ID: ${typeId}`
      );

      const contractType = await this.contractTypeRepository.findById(typeId);

      if (!contractType) {
        return null;
      }

      return contractType;
    } catch (error) {
      throw createError(
        ERROR_CODES.QUERY_ERROR,
        `Error obteniendo tipo de contratación: ${error.message}`,
        500
      );
    }
  }

  /**
   * Crear un nuevo tipo de contratación
   * @param {Object} typeData - Datos del tipo de contratación
   * @param {Object} options - Opciones adicionales
   * @returns {Promise<Object>} Tipo de contratación creado
   */
  async createContractType(typeData, options = {}) {
    try {
      console.log(
        `📝 Service: Creando nuevo tipo de contratación: ${typeData.code}`
      );

      // Validar datos requeridos
      const requiredFields = ["code", "name", "category", "description"];
      const missingFields = requiredFields.filter((field) => !typeData[field]);

      if (missingFields.length > 0) {
        throw createValidationError(
          `Campos requeridos faltantes: ${missingFields.join(", ")}`
        );
      }

      // Validar categoría
      const validCategories = ["COMMON", "SPECIAL"];
      if (!validCategories.includes(typeData.category)) {
        throw createValidationError(
          `Categoría inválida. Debe ser: ${validCategories.join(" o ")}`
        );
      }

      // Verificar que el código no exista
      const existingType = await this.contractTypeRepository.findByCode(
        typeData.code
      );
      if (existingType) {
        throw createValidationError(
          `Ya existe un tipo de contratación con el código: ${typeData.code}`
        );
      }

      // Preparar datos con valores por defecto
      const contractTypeToCreate = {
        code: typeData.code.toUpperCase(),
        name: typeData.name,
        category: typeData.category,
        description: typeData.description,
        displayOrder: typeData.displayOrder || 99,
        requiresPublication: typeData.requiresPublication ?? true,
        estimatedDuration: typeData.estimatedDuration || 30,
        legalReference: typeData.legalReference || "",
        applicableObjects: typeData.applicableObjects || [
          "bienes",
          "servicios",
        ],
        monetaryLimits: typeData.monetaryLimits || {},
        isActive: typeData.isActive ?? true,
        audit: {
          createdBy: options.userId || "system",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      const createdType =
        await this.contractTypeRepository.create(contractTypeToCreate);

      console.log(
        `✅ Service: Tipo de contratación creado exitosamente: ${createdType.code}`
      );

      return createdType;
    } catch (error) {
      throw createError(
        ERROR_CODES.CREATION_ERROR,
        `Error creando tipo de contratación: ${error.message}`,
        400
      );
    }
  }

  /**
   * Actualizar un tipo de contratación existente
   * @param {String} typeId - ID del tipo de contratación
   * @param {Object} updateData - Datos a actualizar
   * @param {Object} options - Opciones adicionales
   * @returns {Promise<Object>} Tipo de contratación actualizado
   */
  async updateContractType(typeId, updateData, options = {}) {
    try {
      validateObjectId(typeId, "ID del tipo de contratación");

      console.log(`📝 Service: Actualizando tipo de contratación: ${typeId}`);

      // Verificar que existe
      const existingType = await this.contractTypeRepository.findById(typeId);
      if (!existingType) {
        throw createError(
          ERROR_CODES.NOT_FOUND,
          "Tipo de contratación no encontrado",
          404
        );
      }

      // Si se actualiza el código, verificar que no exista otro con el mismo código
      if (updateData.code && updateData.code !== existingType.code) {
        const duplicateType = await this.contractTypeRepository.findByCode(
          updateData.code
        );
        if (duplicateType) {
          throw createValidationError(
            `Ya existe otro tipo de contratación con el código: ${updateData.code}`
          );
        }
      }

      // Validar categoría si se actualiza
      if (updateData.category) {
        const validCategories = ["COMMON", "SPECIAL"];
        if (!validCategories.includes(updateData.category)) {
          throw createValidationError(
            `Categoría inválida. Debe ser: ${validCategories.join(" o ")}`
          );
        }
      }

      // Preparar datos de actualización
      const dataToUpdate = {
        ...updateData,
        audit: {
          ...existingType.audit,
          updatedBy: options.userId || "system",
          updatedAt: new Date(),
        },
      };

      // Si se actualiza el código, convertir a mayúsculas
      if (dataToUpdate.code) {
        dataToUpdate.code = dataToUpdate.code.toUpperCase();
      }

      const updatedType = await this.contractTypeRepository.updateById(
        typeId,
        dataToUpdate,
        { returnDocument: "after" }
      );

      console.log(
        `✅ Service: Tipo de contratación actualizado: ${updatedType.code}`
      );

      return updatedType;
    } catch (error) {
      throw createError(
        ERROR_CODES.UPDATE_ERROR,
        `Error actualizando tipo de contratación: ${error.message}`,
        400
      );
    }
  }

  /**
   * Eliminar un tipo de contratación (soft delete)
   * @param {String} typeId - ID del tipo de contratación
   * @param {Object} options - Opciones adicionales
   * @returns {Promise<Object>} Tipo de contratación eliminado
   */
  async deleteContractType(typeId, options = {}) {
    try {
      validateObjectId(typeId, "ID del tipo de contratación");

      console.log(`🗑️ Service: Eliminando tipo de contratación: ${typeId}`);

      // Verificar que existe
      const existingType = await this.contractTypeRepository.findById(typeId);
      if (!existingType) {
        throw createError(
          ERROR_CODES.NOT_FOUND,
          "Tipo de contratación no encontrado",
          404
        );
      }

      // Verificar que no esté siendo usado en contratos activos
      // (Esta validación se puede implementar según la lógica de negocio)
      // const activeContracts = await this.contractRepository.findByType(typeId);
      // if (activeContracts.length > 0) {
      //   throw createValidationError(
      //     "No se puede eliminar un tipo de contratación que está siendo usado en contratos activos"
      //   );
      // }

      // Realizar soft delete
      const deletedType = await this.contractTypeRepository.updateById(
        typeId,
        {
          isActive: false,
          deletedAt: new Date(),
          audit: {
            ...existingType.audit,
            deletedBy: options.userId || "system",
            deletedAt: new Date(),
          },
        },
        { returnDocument: "after" }
      );

      console.log(
        `✅ Service: Tipo de contratación eliminado: ${deletedType.code}`
      );

      return deletedType;
    } catch (error) {
      throw createError(
        ERROR_CODES.DELETE_ERROR,
        `Error eliminando tipo de contratación: ${error.message}`,
        400
      );
    }
  }

  // =============================================================================
  // OPERACIONES CRUD PARA FASES DE CONTRATACIÓN
  // =============================================================================

  /**
   * Obtener todas las fases de contratación
   * @param {Object} options - Opciones de consulta
   * @returns {Promise<Object>} Fases de contratación categorizadas
   */
  async getAllContractPhases(options = {}) {
    try {
      const {
        includeInactive = false,
        contractTypeCode = null,
        category = null,
        page = 1,
        limit = 50,
      } = options;

      console.log(
        `📋 Service: Obteniendo fases de contratación con opciones:`,
        options
      );

      let query = {};

      // Filtrar por activas/inactivas
      if (!includeInactive) {
        query.isActive = true;
      }

      // Filtrar por categoría si se especifica
      if (category) {
        query.category = category;
      }

      // Filtrar por tipo de contrato si se especifica
      if (contractTypeCode) {
        query["applicableContractTypes.code"] = contractTypeCode;
      }

      const phases = await this.contractPhaseRepository.find(query, {
        page,
        limit,
        sort: { order: 1, name: 1 },
      });

      // Agrupar por categoría
      const phasesByCategory = {};
      const allPhases = phases.docs || phases;

      allPhases.forEach((phase) => {
        const cat = phase.category || "OTHER";
        if (!phasesByCategory[cat]) {
          phasesByCategory[cat] = {
            category: cat,
            description: this._getCategoryDescription(cat),
            phases: [],
            count: 0,
          };
        }
        phasesByCategory[cat].phases.push(phase);
        phasesByCategory[cat].count++;
      });

      return {
        byCategory: phasesByCategory,
        allPhases,
        totalPhases: phases.totalDocs || allPhases.length,
        totalPages: phases.totalPages || 1,
        currentPage: phases.page || 1,
        metadata: {
          includeInactive,
          contractTypeCode,
          category,
        },
      };
    } catch (error) {
      throw createError(
        ERROR_CODES.QUERY_ERROR,
        `Error obteniendo fases de contratación: ${error.message}`,
        500
      );
    }
  }

  /**
   * Obtener una fase de contratación por ID
   * @param {String} phaseId - ID de la fase de contratación
   * @returns {Promise<Object>} Fase de contratación
   */
  async getContractPhaseById(phaseId) {
    try {
      validateObjectId(phaseId, "ID de la fase de contratación");

      console.log(
        `🔍 Service: Obteniendo fase de contratación por ID: ${phaseId}`
      );

      const contractPhase =
        await this.contractPhaseRepository.findById(phaseId);

      if (!contractPhase) {
        return null;
      }

      return contractPhase;
    } catch (error) {
      throw createError(
        ERROR_CODES.QUERY_ERROR,
        `Error obteniendo fase de contratación: ${error.message}`,
        500
      );
    }
  }

  /**
   * Crear una nueva fase de contratación
   * @param {Object} phaseData - Datos de la fase de contratación
   * @param {Object} options - Opciones adicionales
   * @returns {Promise<Object>} Fase de contratación creada
   */
  async createContractPhase(phaseData, options = {}) {
    try {
      console.log(
        `📝 Service: Creando nueva fase de contratación: ${phaseData.code}`
      );

      // Validar datos requeridos
      const requiredFields = ["code", "name", "category", "order"];
      const missingFields = requiredFields.filter((field) => !phaseData[field]);

      if (missingFields.length > 0) {
        throw createValidationError(
          `Campos requeridos faltantes: ${missingFields.join(", ")}`
        );
      }

      // Validar categoría
      const validCategories = [
        "PREPARATORIA",
        "PRECONTRACTUAL",
        "CONTRACTUAL",
        "PAGO",
        "RECEPCION",
      ];
      if (!validCategories.includes(phaseData.category)) {
        throw createValidationError(
          `Categoría inválida. Debe ser: ${validCategories.join(", ")}`
        );
      }

      // Verificar que el código no exista
      const existingPhase = await this.contractPhaseRepository.findByCode(
        phaseData.code
      );
      if (existingPhase) {
        throw createValidationError(
          `Ya existe una fase de contratación con el código: ${phaseData.code}`
        );
      }

      // Preparar datos con valores por defecto
      const contractPhaseToCreate = {
        code: phaseData.code.toUpperCase(),
        name: phaseData.name,
        shortName: phaseData.shortName || phaseData.name.substring(0, 20),
        category: phaseData.category,
        order: phaseData.order,
        description: phaseData.description || "",
        isRequired: phaseData.isRequired ?? true,
        canBeSkipped: phaseData.canBeSkipped ?? false,
        estimatedDuration: phaseData.estimatedDuration || 5,
        requiredDocuments: phaseData.requiredDocuments || [],
        applicableContractTypes: phaseData.applicableContractTypes || [],
        dependencies: phaseData.dependencies || {},
        isActive: phaseData.isActive ?? true,
        audit: {
          createdBy: options.userId || "system",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      const createdPhase = await this.contractPhaseRepository.create(
        contractPhaseToCreate
      );

      console.log(
        `✅ Service: Fase de contratación creada exitosamente: ${createdPhase.code}`
      );

      return createdPhase;
    } catch (error) {
      throw createError(
        ERROR_CODES.CREATION_ERROR,
        `Error creando fase de contratación: ${error.message}`,
        400
      );
    }
  }

  /**
   * Actualizar una fase de contratación existente
   * @param {String} phaseId - ID de la fase de contratación
   * @param {Object} updateData - Datos a actualizar
   * @param {Object} options - Opciones adicionales
   * @returns {Promise<Object>} Fase de contratación actualizada
   */
  async updateContractPhase(phaseId, updateData, options = {}) {
    try {
      validateObjectId(phaseId, "ID de la fase de contratación");

      console.log(`📝 Service: Actualizando fase de contratación: ${phaseId}`);

      // Verificar que existe
      const existingPhase =
        await this.contractPhaseRepository.findById(phaseId);
      if (!existingPhase) {
        throw createError(
          ERROR_CODES.NOT_FOUND,
          "Fase de contratación no encontrada",
          404
        );
      }

      // Si se actualiza el código, verificar que no exista otro con el mismo código
      if (updateData.code && updateData.code !== existingPhase.code) {
        const duplicatePhase = await this.contractPhaseRepository.findByCode(
          updateData.code
        );
        if (duplicatePhase) {
          throw createValidationError(
            `Ya existe otra fase de contratación con el código: ${updateData.code}`
          );
        }
      }

      // Validar categoría si se actualiza
      if (updateData.category) {
        const validCategories = [
          "PREPARATORIA",
          "PRECONTRACTUAL",
          "CONTRACTUAL",
          "PAGO",
          "RECEPCION",
        ];
        if (!validCategories.includes(updateData.category)) {
          throw createValidationError(
            `Categoría inválida. Debe ser: ${validCategories.join(", ")}`
          );
        }
      }

      // Preparar datos de actualización
      const dataToUpdate = {
        ...updateData,
        audit: {
          ...existingPhase.audit,
          updatedBy: options.userId || "system",
          updatedAt: new Date(),
        },
      };

      // Si se actualiza el código, convertir a mayúsculas
      if (dataToUpdate.code) {
        dataToUpdate.code = dataToUpdate.code.toUpperCase();
      }

      const updatedPhase = await this.contractPhaseRepository.updateById(
        phaseId,
        dataToUpdate,
        { returnDocument: "after" }
      );

      console.log(
        `✅ Service: Fase de contratación actualizada: ${updatedPhase.code}`
      );

      return updatedPhase;
    } catch (error) {
      throw createError(
        ERROR_CODES.UPDATE_ERROR,
        `Error actualizando fase de contratación: ${error.message}`,
        400
      );
    }
  }

  /**
   * Eliminar una fase de contratación (soft delete)
   * @param {String} phaseId - ID de la fase de contratación
   * @param {Object} options - Opciones adicionales
   * @returns {Promise<Object>} Fase de contratación eliminada
   */
  async deleteContractPhase(phaseId, options = {}) {
    try {
      validateObjectId(phaseId, "ID de la fase de contratación");

      console.log(`🗑️ Service: Eliminando fase de contratación: ${phaseId}`);

      // Verificar que existe
      const existingPhase =
        await this.contractPhaseRepository.findById(phaseId);
      if (!existingPhase) {
        throw createError(
          ERROR_CODES.NOT_FOUND,
          "Fase de contratación no encontrada",
          404
        );
      }

      // Verificar que no esté siendo usada en contratos activos
      // (Esta validación se puede implementar según la lógica de negocio)

      // Verificar que no sea una fase crítica requerida
      if (existingPhase.isRequired && !options.force) {
        throw createValidationError(
          "No se puede eliminar una fase requerida. Use force: true para forzar la eliminación"
        );
      }

      // Realizar soft delete
      const deletedPhase = await this.contractPhaseRepository.updateById(
        phaseId,
        {
          isActive: false,
          deletedAt: new Date(),
          audit: {
            ...existingPhase.audit,
            deletedBy: options.userId || "system",
            deletedAt: new Date(),
          },
        },
        { returnDocument: "after" }
      );

      console.log(
        `✅ Service: Fase de contratación eliminada: ${deletedPhase.code}`
      );

      return deletedPhase;
    } catch (error) {
      throw createError(
        ERROR_CODES.DELETE_ERROR,
        `Error eliminando fase de contratación: ${error.message}`,
        400
      );
    }
  }

  // =============================================================================
  // MÉTODOS DE CONFIGURACIÓN COMPLETA Y UTILIDADES
  // =============================================================================

  /**
   * Obtener configuración completa del sistema
   * @param {Object} options - Opciones de consulta
   * @returns {Promise<Object>} Configuración completa
   */
  async getCompleteConfiguration(options = {}) {
    try {
      const { includeInactive = false, contractTypeCode = null } = options;

      console.log(`⚙️ Service: Obteniendo configuración completa del sistema`);

      const [contractTypes, contractPhases] = await Promise.all([
        this.getAllContractTypes({ includeInactive }),
        this.getAllContractPhases({ includeInactive, contractTypeCode }),
      ]);

      return {
        contractTypes,
        contractPhases,
        metadata: {
          includeInactive,
          contractTypeCode,
          generatedAt: new Date().toISOString(),
          source: "GADM Cantón Esmeraldas - Expediente Digital",
          legalFramework:
            "LOSNCP - Ley Orgánica del Sistema Nacional de Contratación Pública",
        },
      };
    } catch (error) {
      throw createError(
        ERROR_CODES.CONFIG_ERROR,
        `Error obteniendo configuración completa: ${error.message}`,
        500
      );
    }
  }

  /**
   * Obtener estadísticas de configuración
   * @returns {Promise<Object>} Estadísticas del sistema
   */
  async getConfigurationStatistics() {
    try {
      console.log(`📊 Service: Generando estadísticas de configuración`);

      const [contractTypes, contractPhases] = await Promise.all([
        this.contractTypeRepository.findAll({ isActive: true }),
        this.contractPhaseRepository.findAll({ isActive: true }),
      ]);

      // Estadísticas de tipos
      const typeStats = contractTypes.reduce(
        (stats, type) => {
          stats.total++;
          stats.byCategory[type.category] =
            (stats.byCategory[type.category] || 0) + 1;
          if (type.requiresPublication) stats.requirePublication++;
          return stats;
        },
        { total: 0, byCategory: {}, requirePublication: 0 }
      );

      // Estadísticas de fases
      const phaseStats = contractPhases.reduce(
        (stats, phase) => {
          stats.total++;
          stats.byCategory[phase.category] =
            (stats.byCategory[phase.category] || 0) + 1;
          if (phase.isRequired) stats.required++;
          stats.totalDocuments += phase.requiredDocuments?.length || 0;
          return stats;
        },
        { total: 0, byCategory: {}, required: 0, totalDocuments: 0 }
      );

      return {
        contractTypes: typeStats,
        contractPhases: phaseStats,
        system: {
          configuredAt: new Date().toISOString(),
          framework: "LOSNCP",
          entity: "GADM Cantón Esmeraldas",
        },
      };
    } catch (error) {
      throw createError(
        ERROR_CODES.STATISTICS_ERROR,
        `Error obteniendo estadísticas: ${error.message}`,
        500
      );
    }
  }

  /**
   * Inicializar toda la configuración del sistema de contratación
   * @returns {Promise<Object>} Resultado completo de la inicialización
   */
  async initializeCompleteConfiguration() {
    try {
      console.log(
        "🚀 Service: Iniciando configuración completa del sistema de contratación..."
      );

      const results = {
        contractTypes: null,
        contractPhases: null,
        summary: {
          success: false,
          totalOperations: 2,
          completedOperations: 0,
          errors: [],
        },
        timestamp: new Date().toISOString(),
      };

      // Inicializar tipos de contratación
      try {
        console.log("📋 Inicializando tipos de contratación...");
        results.contractTypes = await this.initializeContractTypes();
        results.summary.completedOperations++;
        console.log(
          `✅ Tipos de contratación: ${results.contractTypes.summary.created} creados, ${results.contractTypes.summary.skipped} omitidos`
        );
      } catch (error) {
        console.error(
          "❌ Error inicializando tipos de contratación:",
          error.message
        );
        results.summary.errors.push({
          operation: "initializeContractTypes",
          error: error.message,
        });
      }

      // Inicializar fases de contratación
      try {
        console.log("📝 Inicializando fases de contratación...");
        results.contractPhases = await this.initializeContractPhases();
        results.summary.completedOperations++;
        console.log(
          `✅ Fases de contratación: ${results.contractPhases.summary.created} creadas, ${results.contractPhases.summary.skipped} omitidas`
        );
      } catch (error) {
        console.error(
          "❌ Error inicializando fases de contratación:",
          error.message
        );
        results.summary.errors.push({
          operation: "initializeContractPhases",
          error: error.message,
        });
      }

      results.summary.success =
        results.summary.completedOperations === results.summary.totalOperations;

      if (results.summary.success) {
        console.log(
          "🎉 Configuración completa del sistema finalizada exitosamente"
        );
      } else {
        console.warn("⚠️ Configuración completada con algunos errores");
      }

      return results;
    } catch (error) {
      throw createError(
        ERROR_CODES.CONFIG_ERROR,
        `Error en configuración completa del sistema: ${error.message}`,
        500
      );
    }
  }

  // =============================================================================
  // MÉTODOS DE INICIALIZACIÓN ESPECÍFICOS
  // =============================================================================

  /**
   * Inicializar tipos de contratación por defecto según LOSNCP
   * @returns {Promise<Object>} Resultado de la inicialización
   */
  async initializeContractTypes() {
    try {
      console.log(
        "📋 Service: Inicializando tipos de contratación por defecto..."
      );

      const defaultTypes = [
        // TIPOS COMUNES
        {
          code: "SIE",
          name: "Subasta Inversa Electrónica",
          category: "COMMON",
          description:
            "Procedimiento común para adquisición de bienes y servicios normalizados",
          displayOrder: 1,
          requiresPublication: true,
          estimatedDuration: 30,
          legalReference: "Art. 44-51 LOSNCP",
          applicableObjects: ["bienes", "servicios"],
        },
        {
          code: "LIC",
          name: "Licitación",
          category: "COMMON",
          description:
            "Procedimiento para contratación de bienes, servicios y obras de mayor cuantía",
          displayOrder: 2,
          requiresPublication: true,
          estimatedDuration: 45,
          legalReference: "Art. 32 LOSNCP",
          applicableObjects: ["bienes", "servicios", "obras"],
        },
        {
          code: "COT",
          name: "Cotización",
          category: "COMMON",
          description: "Procedimiento para contratación de cuantía media",
          displayOrder: 3,
          requiresPublication: true,
          estimatedDuration: 20,
          legalReference: "Art. 33 LOSNCP",
          applicableObjects: ["bienes", "servicios", "obras"],
        },
        {
          code: "MC",
          name: "Menor Cuantía",
          category: "COMMON",
          description: "Procedimiento para contratación de cuantía menor",
          displayOrder: 4,
          requiresPublication: true,
          estimatedDuration: 15,
          legalReference: "Art. 34 LOSNCP",
          applicableObjects: ["bienes", "servicios", "obras"],
        },
        {
          code: "CON",
          name: "Consultoría",
          category: "COMMON",
          description:
            "Procedimiento para contratación de servicios de consultoría",
          displayOrder: 5,
          requiresPublication: true,
          estimatedDuration: 35,
          legalReference: "Art. 36-40 LOSNCP",
          applicableObjects: ["consultorias"],
        },
        {
          code: "LC",
          name: "Lista Corta",
          category: "COMMON",
          description: "Procedimiento para consultoría mediante lista corta",
          displayOrder: 6,
          requiresPublication: false,
          estimatedDuration: 25,
          legalReference: "Art. 41-43 LOSNCP",
          applicableObjects: ["consultorias"],
        },
        // TIPOS ESPECIALES
        {
          code: "EME",
          name: "Emergencia",
          category: "SPECIAL",
          description: "Contratación de emergencia por situaciones imprevistas",
          displayOrder: 1,
          requiresPublication: false,
          estimatedDuration: 3,
          legalReference: "Art. 57 LOSNCP",
          applicableObjects: ["bienes", "servicios", "obras"],
        },
        {
          code: "RE",
          name: "Régimen Especial",
          category: "SPECIAL",
          description: "Contratación bajo régimen especial",
          displayOrder: 2,
          requiresPublication: false,
          estimatedDuration: 15,
          legalReference: "Art. 62-77 LOSNCP",
          applicableObjects: ["bienes", "servicios", "obras"],
        },
        {
          code: "CE",
          name: "Catálogo Electrónico",
          category: "SPECIAL",
          description: "Contratación a través de catálogo electrónico",
          displayOrder: 3,
          requiresPublication: false,
          estimatedDuration: 10,
          legalReference: "Art. 77-80 LOSNCP",
          applicableObjects: ["bienes", "servicios"],
        },
        {
          code: "CM",
          name: "Convenio Marco",
          category: "SPECIAL",
          description: "Contratación a través de convenios marco establecidos",
          displayOrder: 4,
          requiresPublication: false,
          estimatedDuration: 10,
          legalReference: "Art. 81-84 LOSNCP",
          applicableObjects: ["bienes", "servicios", "obras"],
        },
        {
          code: "IC",
          name: "Ínfima Cuantía",
          category: "SPECIAL",
          description:
            "Contratación de ínfima cuantía para montos muy pequeños",
          displayOrder: 5,
          requiresPublication: false,
          estimatedDuration: 5,
          legalReference: "Art. 85 LOSNCP",
          applicableObjects: ["bienes", "servicios"],
        },
      ];

      const results = {
        created: [],
        skipped: [],
        errors: [],
      };

      for (const typeData of defaultTypes) {
        try {
          // Verificar si ya existe
          const existing = await this.contractTypeRepository.findByCode(
            typeData.code
          );
          if (existing) {
            results.skipped.push({
              code: typeData.code,
              reason: "Ya existe",
            });
            continue;
          }

          // Crear el tipo
          const created = await this.createContractType(typeData, {
            userId: "system",
          });
          results.created.push(created);
        } catch (error) {
          results.errors.push({
            code: typeData.code,
            error: error.message,
          });
        }
      }

      return {
        summary: {
          total: defaultTypes.length,
          created: results.created.length,
          skipped: results.skipped.length,
          errors: results.errors.length,
        },
        details: results,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw createError(
        ERROR_CODES.INIT_ERROR,
        `Error inicializando tipos de contratación: ${error.message}`,
        500
      );
    }
  }

  /**
   * Inicializar fases de contratación por defecto según LOSNCP
   * @returns {Promise<Object>} Resultado de la inicialización
   */
  async initializeContractPhases() {
    try {
      console.log(
        "📝 Service: Inicializando fases de contratación por defecto..."
      );

      const defaultPhases = [
        // FASE PREPARATORIA
        {
          code: "PREP",
          name: "Fase Preparatoria",
          shortName: "Preparatoria",
          category: "PREPARATORIA",
          order: 1,
          description:
            "Definición de necesidades, estudios, certificación presupuestaria",
          isRequired: true,
          estimatedDuration: 10,
          requiredDocuments: [
            "Certificación Presupuestaria (PAC)",
            "Estudios de Mercado",
            "Términos de Referencia/Especificaciones Técnicas",
            "Resolución de Inicio de Proceso",
            "Informe de Necesidad/Justificación",
          ],
          applicableContractTypes: [], // Se aplica a todos
        },
        // FASE PRECONTRACTUAL
        {
          code: "PRECONT",
          name: "Fase Precontractual",
          shortName: "Precontractual",
          category: "PRECONTRACTUAL",
          order: 2,
          description: "Convocatoria, evaluación de ofertas, adjudicación",
          isRequired: true,
          estimatedDuration: 20,
          requiredDocuments: [
            "Pliegos (Documento convocatoria)",
            "Preguntas y Respuestas/Aclaraciones",
            "Ofertas/Propuestas de proveedores",
            "Informe de Evaluación",
            "Adjudicación/Declaratoria Desierto",
          ],
          applicableContractTypes: [],
        },
        // FASE CONTRACTUAL
        {
          code: "CONT",
          name: "Fase Contractual de Ejecución",
          shortName: "Contractual",
          category: "CONTRACTUAL",
          order: 3,
          description: "Ejecución del contrato, seguimiento y control",
          isRequired: true,
          estimatedDuration: 90,
          requiredDocuments: [
            "Contrato firmado",
            "Garantías (Fiel cumplimiento, Técnica, etc.)",
            "Cronograma valorado de trabajos",
            "Informes de fiscalización/administración",
          ],
          applicableContractTypes: [],
        },
        // FASE DE PAGO
        {
          code: "PAGO",
          name: "Fase de Pago",
          shortName: "Pago",
          category: "PAGO",
          order: 4,
          description: "Procesamiento de pagos y facturación",
          isRequired: true,
          estimatedDuration: 5,
          requiredDocuments: [
            "Facturas/Comprobantes de venta",
            "Planillas de pago",
            "Retenciones tributarias",
            "Comprobantes de egreso",
          ],
          applicableContractTypes: [],
        },
        // FASE DE RECEPCIÓN
        {
          code: "RECEP",
          name: "Fase de Recepción",
          shortName: "Recepción",
          category: "RECEPCION",
          order: 5,
          description: "Recepción definitiva, liquidación del contrato",
          isRequired: true,
          estimatedDuration: 10,
          requiredDocuments: [
            "Acta de entrega recepción definitiva",
            "Informe final de fiscalización",
            "Liquidación del contrato",
            "Devolución de garantías",
          ],
          applicableContractTypes: [],
        },
      ];

      const results = {
        created: [],
        skipped: [],
        errors: [],
      };

      for (const phaseData of defaultPhases) {
        try {
          // Verificar si ya existe
          const existing = await this.contractPhaseRepository.findByCode(
            phaseData.code
          );
          if (existing) {
            results.skipped.push({
              code: phaseData.code,
              reason: "Ya existe",
            });
            continue;
          }

          // Crear la fase
          const created = await this.createContractPhase(phaseData, {
            userId: "system",
          });
          results.created.push(created);
        } catch (error) {
          results.errors.push({
            code: phaseData.code,
            error: error.message,
          });
        }
      }

      return {
        summary: {
          total: defaultPhases.length,
          created: results.created.length,
          skipped: results.skipped.length,
          errors: results.errors.length,
        },
        details: results,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw createError(
        ERROR_CODES.INIT_ERROR,
        `Error inicializando fases de contratación: ${error.message}`,
        500
      );
    }
  }

  // =============================================================================
  // MÉTODOS PRIVADOS Y UTILIDADES
  // =============================================================================

  /**
   * Obtener descripción de categoría de fase
   * @param {String} category - Categoría de la fase
   * @returns {String} Descripción
   * @private
   */
  _getCategoryDescription(category) {
    const descriptions = {
      PREPARATORIA: "Definición de necesidades y estudios previos",
      PRECONTRACTUAL: "Convocatoria, evaluación y adjudicación",
      CONTRACTUAL: "Ejecución y seguimiento del contrato",
      PAGO: "Procesamiento de pagos y facturación",
      RECEPCION: "Recepción definitiva y liquidación",
      OTHER: "Otras fases del proceso",
    };

    return descriptions[category] || descriptions.OTHER;
  }
}
