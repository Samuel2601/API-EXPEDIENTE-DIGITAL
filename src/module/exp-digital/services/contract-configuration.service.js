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

  /**
   * Obtener configuración efectiva para un tipo de contrato específico
   */
  async getEffectiveConfiguration(contractTypeId, options = {}) {
    try {
      validateObjectId(contractTypeId, "ID del tipo de contratación");

      console.log(
        `⚙️ Obteniendo configuración efectiva para tipo: ${contractTypeId}`
      );

      const [contractType, phases] = await Promise.all([
        this.contractTypeRepository.getCompleteConfiguration(contractTypeId),
        this.contractPhaseRepository.findForContractType(contractTypeId, {
          populateDependencies: true,
          limit: 100,
        }),
      ]);

      if (!contractType) {
        throw createError(
          ERROR_CODES.NOT_FOUND,
          "Tipo de contratación no encontrado",
          404
        );
      }

      // ✅ Calcular configuración efectiva por fase
      const effectivePhases = await Promise.all(
        (phases.docs || phases).map(async (phase) => {
          const phaseConfig =
            await this.contractPhaseRepository.getPhaseConfiguration(
              phase._id,
              contractTypeId
            );

          return {
            ...(phase.toJSON ? phase.toJSON() : phase),
            effectiveConfiguration: phaseConfig.effectiveForType,
          };
        })
      );

      return {
        contractType,
        phases: effectivePhases,
        summary: {
          totalPhases: effectivePhases.length,
          totalEstimatedDays: effectivePhases.reduce(
            (sum, p) =>
              sum +
              (p.effectiveConfiguration?.effectiveDuration ||
                p.phaseConfig?.estimatedDays ||
                0),
            0
          ),
          phasesWithExceptions: effectivePhases.filter(
            (p) => p.effectiveConfiguration?.hasExceptions
          ).length,
          phasesWithCustomDuration: effectivePhases.filter(
            (p) => p.effectiveConfiguration?.hasCustomDuration
          ).length,
        },
        metadata: {
          generatedAt: new Date().toISOString(),
          contractTypeId: contractTypeId.toString(),
        },
      };
    } catch (error) {
      throw createError(
        ERROR_CODES.CONFIG_ERROR,
        `Error obteniendo configuración efectiva: ${error.message}`,
        500
      );
    }
  }

  /**
   * Configurar excepciones de documentos para un tipo específico
   */
  async configureDocumentExceptions(
    phaseId,
    contractTypeId,
    documentCodes,
    userData
  ) {
    try {
      validateObjectId(phaseId, "ID de la fase");
      validateObjectId(contractTypeId, "ID del tipo de contrato");

      if (!Array.isArray(documentCodes) || documentCodes.length === 0) {
        throw createValidationError(
          "Debe especificar al menos un código de documento"
        );
      }

      console.log(
        `📋 Configurando excepciones para fase ${phaseId}, tipo ${contractTypeId}`
      );

      const updatedPhase =
        await this.contractPhaseRepository.addDocumentExceptions(
          phaseId,
          contractTypeId,
          documentCodes,
          userData
        );

      return {
        success: true,
        phase: updatedPhase,
        configured: {
          phaseCode: updatedPhase.code,
          contractTypeId: contractTypeId.toString(),
          exceptedDocuments: documentCodes,
        },
      };
    } catch (error) {
      throw createError(
        ERROR_CODES.UPDATE_ERROR,
        `Error configurando excepciones: ${error.message}`,
        400
      );
    }
  }

  /**
   * Configurar duración específica para un tipo
   */
  async configureCustomDuration(phaseId, contractTypeId, duration, userData) {
    try {
      validateObjectId(phaseId, "ID de la fase");
      validateObjectId(contractTypeId, "ID del tipo de contrato");

      if (!Number.isInteger(duration) || duration < 1 || duration > 365) {
        throw createValidationError(
          "La duración debe ser un número entero entre 1 y 365"
        );
      }

      console.log(
        `⏱️ Configurando duración ${duration} días para fase ${phaseId}, tipo ${contractTypeId}`
      );

      const updatedPhase =
        await this.contractPhaseRepository.setDurationForType(
          phaseId,
          contractTypeId,
          duration,
          userData
        );

      return {
        success: true,
        phase: updatedPhase,
        configured: {
          phaseCode: updatedPhase.code,
          contractTypeId: contractTypeId.toString(),
          customDuration: duration,
        },
      };
    } catch (error) {
      throw createError(
        ERROR_CODES.UPDATE_ERROR,
        `Error configurando duración: ${error.message}`,
        400
      );
    }
  }

  async initializeSystemConfiguration(userData = {}) {
    try {
      console.log("🚀 Service: Inicializando configuración del sistema");

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
      }; // Resultado de la inicialización

      // Inicializar tipos de contratación
      try {
        console.log("📋 Inicializando tipos de contratación...");
        results.contractTypes = await this.initializeContractTypes(userData);
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
        results.contractPhases = await this.initializeContractPhases(userData);
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

      results.summary.success = results.summary.completedOperations === 2;

      if (results.summary.success) {
        console.log(
          "🎉 Configuración completada exitosamente, reiniciando servicio..."
        );
      } else {
        console.warn("⚠️ Configuración completada con algunos errores");
      }

      return results;
    } catch (error) {
      throw createError(
        ERROR_CODES.INIT_ERROR,
        `Error inicializando configuración del sistema: ${error.message}`,
        500
      );
    }
  }

  async validateSystemConfiguration() {
    try {
      console.log("📋 Service: Validando configuración del sistema");

      const results = {
        summary: {
          valid: 0,
          invalid: 0,
        },
        timestamp: new Date().toISOString(),
      }; // Resultado de la validación

      // Validar tipos de contratación
      try {
        console.log("📋 Validando tipos de contratación...");
        results.summary.valid = await this.validateContractTypes();
        console.log(
          `✅ Tipos de contratación validados: ${results.summary.valid} validados, ${results.summary.invalid} inválidos`
        );
      } catch (error) {
        console.error(
          "❌ Error validando tipos de contratación:",
          error.message
        );
        results.summary.invalid++;
      }

      // Validar fases de contratación
      try {
        console.log("📝 Validando fases de contratación...");
        results.summary.valid += await this.validateContractPhases();
        console.log(
          `✅ Fases de contratación validadas: ${results.summary.valid} validadas, ${results.summary.invalid} inválidas`
        );
      } catch (error) {
        console.error(
          "❌ Error validando fases de contratación:",
          error.message
        );
        results.summary.invalid++;
      }

      results.summary.valid =
        results.summary.valid > 0 ? results.summary.valid : 1;

      return results;
    } catch (error) {
      throw createError(
        ERROR_CODES.VALIDATION_ERROR,
        `Error validando configuración del sistema: ${error.message}`,
        500
      );
    }
  }

  async validateContractTypes() {
    try {
      console.log("📋 Service: Validando tipos de contratación");

      const results = {
        summary: {
          valid: 0,
          invalid: 0,
        },
        timestamp: new Date().toISOString(),
      }; // Resultado de la validación

      // Obtener tipos de contratación
      const contractTypes = await this.contractTypeRepository.findAll();

      // Validar tipos de contratación
      for (const contractType of contractTypes) {
        try {
          // Validar si existe
          const existing = await this.contractTypeRepository.findByCode(
            contractType.code
          );
          if (existing) {
            results.summary.invalid++;
            continue;
          }

          // Validar si es obligatorio
          if (contractType.isRequired && !contractType.requiresPublication) {
            results.summary.invalid++;
            continue;
          }

          // Validar si es obligatorio
          if (contractType.requiresPublication && !contractType.isRequired) {
            results.summary.invalid++;
            continue;
          }
        } catch (error) {
          results.summary.invalid++;
        }
      }

      return results.summary.valid;
    } catch (error) {
      throw createError(
        ERROR_CODES.VALIDATION_ERROR,
        `Error validando tipos de contratación: ${error.message}`,
        500
      );
    }
  }

  async validateContractPhases() {
    try {
      console.log("📝 Service: Validando fases de contratación");

      const results = {
        summary: {
          valid: 0,
          invalid: 0,
        },
        timestamp: new Date().toISOString(),
      }; // Resultado de la validación

      // Obtener fases de contratación
      const contractPhases = await this.contractPhaseRepository.findAll();

      // Validar fases de contratación
      for (const contractPhase of contractPhases) {
        try {
          // Validar si existe
          const existing = await this.contractPhaseRepository.findByCode(
            contractPhase.code
          );
          if (existing) {
            results.summary.invalid++;
            continue;
          }

          // Validar si es obligatorio
          if (contractPhase.isRequired && !contractPhase.canBeSkipped) {
            results.summary.invalid++;
            continue;
          }

          // Validar si es obligatorio
          if (contractPhase.canBeSkipped && !contractPhase.isRequired) {
            results.summary.invalid++;
            continue;
          }

          if (
            contractPhase.requiresPublication &&
            !contractPhase.applicableContractTypes.length
          ) {
            results.summary.invalid++;
            continue;
          }
        } catch (error) {
          results.summary.invalid++;
        }
      }

      return results.summary.valid;
    } catch (error) {
      throw createError(
        ERROR_CODES.VALIDATION_ERROR,
        `Error validando fases de contratación: ${error.message}`,
        500
      );
    }
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

      console.log(`📋 Obteniendo tipos de contratación:`, options);

      if (category) {
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
        `Error obteniendo tipos: ${error.message}`,
        500
      );
    }
  }

  async getContractTypeByAmount(amount, contractObject = "bienes") {
    try {
      console.log(
        `💰 Buscando tipos aplicables para monto: ${amount}, objeto: ${contractObject}`
      );

      const contractTypes = await this.contractTypeRepository.findForAmount(
        amount,
        contractObject
      );

      if (!contractTypes || contractTypes.length === 0) {
        return {
          applicableTypes: [],
          recommendations: await this._getAlternativeTypes(
            amount,
            contractObject
          ),
        };
      }

      // ✅ Enriquecer con cálculos usando métodos del esquema
      const enrichedTypes = await Promise.all(
        contractTypes.map(async (type) => {
          const validation =
            await this.contractTypeRepository.validateApplicability(
              type._id,
              amount,
              contractObject
            );

          return {
            ...(type.toJSON ? type.toJSON() : type),
            calculatedInsurance: validation.requiredInsurance,
            estimatedDuration: validation.estimatedDuration,
            applicabilityCheck: validation,
          };
        })
      );

      return {
        amount,
        contractObject,
        applicableTypes: enrichedTypes,
        recommendations: {
          mostSuitable: enrichedTypes[0],
          fastest: enrichedTypes.reduce((prev, curr) =>
            curr.estimatedDuration < prev.estimatedDuration ? curr : prev
          ),
        },
      };
    } catch (error) {
      throw createError(
        ERROR_CODES.QUERY_ERROR,
        `Error por monto: ${error.message}`,
        500
      );
    }
  }

  async getPhasesByContractType(contractTypeId) {
    try {
      console.log(`📄 Obteniendo fases para tipo: ${contractTypeId}`);

      const contractType =
        await this.contractTypeRepository.findById(contractTypeId);
      if (!contractType) {
        throw createError(
          ERROR_CODES.NOT_FOUND,
          "Tipo de contratación no encontrado",
          404
        );
      }

      const phases = await this.contractPhaseRepository.findForContractType(
        contractTypeId,
        {
          populateDependencies: true,
          limit: 100,
        }
      );

      // ✅ Enriquecer fases con configuración efectiva
      const enrichedPhases = await Promise.all(
        (phases.docs || phases).map(async (phase) => {
          const effectiveDocuments =
            await this.contractPhaseRepository.getEffectiveDocuments(
              phase._id,
              contractTypeId
            );
          const effectiveDuration =
            await this.contractPhaseRepository.getEffectiveDuration(
              phase._id,
              contractTypeId
            );

          return {
            ...(phase.toJSON ? phase.toJSON() : phase),
            effectiveDocuments,
            effectiveDuration: effectiveDuration.effectiveDuration,
            hasExceptions:
              effectiveDuration.hasSpecificDuration ||
              effectiveDocuments.length <
                (phase.requiredDocuments?.length || 0),
          };
        })
      );

      return {
        contractType: {
          code: contractType.code,
          name: contractType.name,
          category: contractType.category,
        },
        phases: enrichedPhases,
        summary: {
          totalPhases: enrichedPhases.length,
          totalDuration: enrichedPhases.reduce(
            (sum, p) => sum + p.effectiveDuration,
            0
          ),
          totalDocuments: enrichedPhases.reduce(
            (sum, p) => sum + p.effectiveDocuments.length,
            0
          ),
          phasesWithExceptions: enrichedPhases.filter((p) => p.hasExceptions)
            .length,
        },
      };
    } catch (error) {
      throw createError(
        ERROR_CODES.QUERY_ERROR,
        `Error obteniendo fases: ${error.message}`,
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
  async createContractType(typeData, options = {}, userData = {}) {
    try {
      const requiredFields = ["code", "name", "category", "description"];
      const missingFields = requiredFields.filter((field) => !typeData[field]);

      if (missingFields.length > 0) {
        throw createValidationError(
          `Campos requeridos: ${missingFields.join(", ")}`
        );
      }

      const existingType = await this.contractTypeRepository.findByCode(
        typeData.code
      );
      if (existingType) {
        throw createValidationError(`Código ya existe: ${typeData.code}`);
      }

      return await this.contractTypeRepository.create(typeData, userData);
    } catch (error) {
      throw createError(
        ERROR_CODES.CREATION_ERROR,
        `Error creando tipo: ${error.message}`,
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

      const phases = await this.contractPhaseRepository.findAll(query, {
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
  async createContractPhase(phaseData, options = {}, userData = {}) {
    try {
      const requiredFields = ["code", "name", "category", "order"];
      const missingFields = requiredFields.filter((field) => !phaseData[field]);

      if (missingFields.length > 0) {
        throw createValidationError(
          `Campos requeridos: ${missingFields.join(", ")}`
        );
      }

      const existingPhase = await this.contractPhaseRepository.findByCode(
        phaseData.code
      );
      if (existingPhase) {
        throw createValidationError(`Código ya existe: ${phaseData.code}`);
      }

      return await this.contractPhaseRepository.create(phaseData, userData);
    } catch (error) {
      throw createError(
        ERROR_CODES.CREATE_ERROR,
        `Error creando fase: ${error.message}`,
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
  async initializeCompleteConfiguration(userData = {}) {
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
        results.contractTypes = await this.initializeContractTypes(userData);
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
        results.contractPhases = await this.initializeContractPhases(userData);
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
  async initializeContractTypes(userData = {}) {
    try {
      console.log("📋 Inicializando tipos de contratación...");

      const defaultTypes = this._getDefaultTypes();
      const results = { created: [], skipped: [], errors: [] };

      for (const typeData of defaultTypes) {
        try {
          const existing = await this.contractTypeRepository.findByCode(
            typeData.code
          );
          if (existing) {
            results.skipped.push({ code: typeData.code, reason: "Ya existe" });
            continue;
          }

          const created = await this.createContractType(typeData, {}, userData);
          results.created.push(created);
        } catch (error) {
          results.errors.push({ code: typeData.code, error: error.message });
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
  async initializeContractPhases(userData = {}) {
    try {
      console.log("📄 Inicializando fases de contratación...");

      const defaultPhases = this._getDefaultPhases();
      const results = { created: [], skipped: [], errors: [] };

      for (const phaseData of defaultPhases) {
        try {
          const existing = await this.contractPhaseRepository.findByCode(
            phaseData.code
          );
          if (existing) {
            results.skipped.push({ code: phaseData.code, reason: "Ya existe" });
            continue;
          }

          // ✅ Configurar excepciones y duraciones desde datos por defecto
          const created = await this._createPhaseWithConfiguration(
            phaseData,
            userData
          );
          results.created.push(created);
        } catch (error) {
          results.errors.push({ code: phaseData.code, error: error.message });
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

  async _createPhaseWithConfiguration(phaseData, userData) {
    // Separar configuración específica de datos base
    const { documentsExceptions, durationByType, ...basePhaseData } = phaseData;

    // Crear fase base
    const createdPhase = await this.createContractPhase(
      basePhaseData,
      {},
      userData
    );

    // ✅ Aplicar configuraciones específicas si existen
    if (documentsExceptions && Object.keys(documentsExceptions).length > 0) {
      for (const [typeCode, exceptions] of Object.entries(
        documentsExceptions
      )) {
        try {
          const contractType =
            await this.contractTypeRepository.findByCode(typeCode);
          if (contractType && exceptions.length > 0) {
            await this.contractPhaseRepository.addDocumentExceptions(
              createdPhase._id,
              contractType._id,
              exceptions,
              userData
            );
          }
        } catch (error) {
          console.warn(
            `Error aplicando excepciones para ${typeCode}:`,
            error.message
          );
        }
      }
    }

    if (durationByType && Object.keys(durationByType).length > 0) {
      for (const [typeCode, duration] of Object.entries(durationByType)) {
        try {
          const contractType =
            await this.contractTypeRepository.findByCode(typeCode);
          if (contractType && duration > 0) {
            await this.contractPhaseRepository.setDurationForType(
              createdPhase._id,
              contractType._id,
              duration,
              userData
            );
          }
        } catch (error) {
          console.warn(
            `Error aplicando duración para ${typeCode}:`,
            error.message
          );
        }
      }
    }

    return createdPhase;
  }

  async _getAlternativeTypes(amount, contractObject) {
    try {
      const allTypes = await this.contractTypeRepository.findAdvanced(
        {
          applicableObject: contractObject,
          isActive: true,
        },
        { limit: 5 }
      );

      return {
        suggested: allTypes.docs.slice(0, 3),
        reason: `No hay tipos exactos para monto ${amount} en ${contractObject}`,
      };
    } catch (error) {
      return { suggested: [], reason: "Error obteniendo alternativas" };
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

  _getDefaultTypes() {
    return [
      // TIPOS COMUNES
      {
        code: "SIE",
        name: "Subasta Inversa Electrónica",
        category: "COMMON",
        description:
          "Procedimiento común para adquisición de bienes y servicios normalizados",
        displayOrder: 1,
        requiresPublication: true,
        estimatedDuration: 25, // Reducido: proceso más ágil
        legalReference: "Art. 44-51 LOSNCP",
        applicableObjects: ["bienes", "servicios"],
        thresholds: { min: 0, max: null }, // Sin límite superior
        requiresInsurance: true,
        insurancePercentage: 5,
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
        thresholds: { min: 0, max: null },
        requiresInsurance: true,
        insurancePercentage: 5,
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
        thresholds: { min: 0, max: null },
        requiresInsurance: true,
        insurancePercentage: 5,
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
        thresholds: { min: 0, max: null },
        requiresInsurance: true,
        insurancePercentage: 5,
      },
      {
        code: "CON",
        name: "Consultoría",
        category: "COMMON",
        description:
          "Procedimiento para contratación de servicios de consultoría",
        displayOrder: 5,
        requiresPublication: true,
        estimatedDuration: 40, // Aumentado: procesos más complejos
        legalReference: "Art. 36-40 LOSNCP",
        applicableObjects: ["consultorias"],
        thresholds: { min: 0, max: null },
        requiresInsurance: true,
        insurancePercentage: 5,
      },
      {
        code: "LC",
        name: "Lista Corta",
        category: "COMMON",
        description: "Procedimiento para consultoría mediante lista corta",
        displayOrder: 6,
        requiresPublication: false, // CORRECTO: Lista corta no publica
        estimatedDuration: 30, // Aumentado: evaluación técnica compleja
        legalReference: "Art. 41-43 LOSNCP",
        applicableObjects: ["consultorias"],
        thresholds: { min: 0, max: null },
        requiresInsurance: true,
        insurancePercentage: 5,
      },

      // TIPOS ESPECIALES
      {
        code: "EME",
        name: "Emergencia",
        category: "SPECIAL",
        description: "Contratación de emergencia por situaciones imprevistas",
        displayOrder: 1,
        requiresPublication: false, // CORRECTO
        estimatedDuration: 3,
        legalReference: "Art. 57 LOSNCP",
        applicableObjects: ["bienes", "servicios", "obras"],
        thresholds: { min: 0, max: null },
        requiresInsurance: false, // CORRECCIÓN: Emergencia puede no requerir seguro
        insurancePercentage: 0,
      },
      {
        code: "RE",
        name: "Régimen Especial",
        category: "SPECIAL",
        description: "Contratación bajo régimen especial",
        displayOrder: 2,
        requiresPublication: false, // CORRECTO
        estimatedDuration: 15,
        legalReference: "Art. 62-77 LOSNCP",
        applicableObjects: ["bienes", "servicios", "obras"],
        thresholds: { min: 0, max: null },
        requiresInsurance: true,
        insurancePercentage: 5,
      },
      {
        code: "CE",
        name: "Catálogo Electrónico",
        category: "SPECIAL",
        description: "Contratación a través de catálogo electrónico",
        displayOrder: 3,
        requiresPublication: false, // CORRECTO
        estimatedDuration: 5, // CORRECCIÓN: Proceso muy ágil
        legalReference: "Art. 77-80 LOSNCP",
        applicableObjects: ["bienes", "servicios"],
        thresholds: { min: 0, max: null },
        requiresInsurance: false, // CORRECCIÓN: Catálogo no requiere seguro
        insurancePercentage: 0,
      },
      {
        code: "CM",
        name: "Convenio Marco",
        category: "SPECIAL",
        description: "Contratación a través de convenios marco establecidos",
        displayOrder: 4,
        requiresPublication: false, // CORRECTO
        estimatedDuration: 10,
        legalReference: "Art. 81-84 LOSNCP",
        applicableObjects: ["bienes", "servicios", "obras"],
        thresholds: { min: 0, max: null },
        requiresInsurance: false, // CORRECCIÓN: Convenio marco simplificado
        insurancePercentage: 0,
      },
      {
        code: "IC",
        name: "Ínfima Cuantía",
        category: "SPECIAL",
        description: "Contratación de ínfima cuantía para montos muy pequeños",
        displayOrder: 5,
        requiresPublication: false, // CORRECTO
        estimatedDuration: 3, // CORRECCIÓN: Proceso muy rápido
        legalReference: "Art. 85 LOSNCP",
        applicableObjects: ["bienes", "servicios"],
        thresholds: { min: 0, max: null }, // Debería tener tope pero varía por entidad
        requiresInsurance: false, // CORRECCIÓN: Ínfima cuantía no requiere seguro
        insurancePercentage: 0,
      },
    ];
  }

  _getDefaultPhases() {
    const slugify = (text) =>
      text
        .toString()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // quitar acentos
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "_")
        .replace(/^_|_$/g, "");

    const defaultPhases = [
      // FASE PREPARATORIA
      {
        code: "PREP",
        name: "Fase Preparatoria",
        shortName: "Preparatoria",
        category: "PREPARATORY",
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
        ].map((doc) => ({
          code: `PREP_${slugify(doc)}`,
          name: doc,
        })),
        // CORRECCIÓN: Aplicabilidad específica por tipo
        applicableContractTypes: [], // Vacio = aplica a todos
        // EXCEPCIÓN: Procedimientos especiales simplifican documentos
        documentsExceptions: {
          EME: ["PREP_ESTUDIOS_DE_MERCADO"], // Emergencia no requiere estudios previos
          IC: ["PREP_ESTUDIOS_DE_MERCADO"], // Ínfima cuantía simplificada
          CE: [
            "PREP_ESTUDIOS_DE_MERCADO",
            "PREP_TERMINOS_DE_REFERENCIA_ESPECIFICACIONES_TECNICAS",
          ],
          CM: ["PREP_ESTUDIOS_DE_MERCADO"],
        },
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
        ].map((doc) => ({
          code: `PRECONT_${slugify(doc)}`,
          name: doc,
        })),
        applicableContractTypes: ["SIE", "LIC", "COT", "MC", "CON", "LC"], // CORRECCIÓN: No aplica a especiales
        // Duraciones variables por tipo
        durationByType: {
          SIE: 25,
          LIC: 35,
          COT: 20,
          MC: 15,
          CON: 30,
          LC: 25,
        },
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
        estimatedDuration: 90, // Promedio para obras/servicios largos
        requiredDocuments: [
          "Contrato firmado",
          "Garantías (Fiel cumplimiento, Técnica, etc.)",
          "Cronograma valorado de trabajos",
          "Informes de fiscalización/administración",
        ].map((doc) => ({
          code: `CONT_${slugify(doc)}`,
          name: doc,
        })),
        applicableContractTypes: [], // Aplica a todos
        // CORRECCIÓN: Documentos específicos por tipo
        documentsExceptions: {
          EME: ["CONT_CRONOGRAMA_VALORADO_DE_TRABAJOS"], // Emergencia sin cronograma
          IC: [
            "CONT_GARANTIAS_FIEL_CUMPLIMIENTO_TECNICA_ETC",
            "CONT_CRONOGRAMA_VALORADO_DE_TRABAJOS",
          ],
          CE: ["CONT_CRONOGRAMA_VALORADO_DE_TRABAJOS"],
          CM: ["CONT_CRONOGRAMA_VALORADO_DE_TRABAJOS"],
        },
        // Duraciones variables según complejidad
        durationByType: {
          IC: 5, // Ínfima cuantía muy rápida
          CE: 10, // Catálogo electrónico simple
          CM: 15, // Convenio marco
          EME: 30, // Emergencia acelerada
          MC: 45, // Menor cuantía
          COT: 60, // Cotización
          SIE: 45, // Subasta inversa
          CON: 120, // Consultoría más larga
          LC: 90, // Lista corta
          LIC: 180, // Licitación más larga (obras grandes)
        },
      },

      // FASE DE PAGO
      {
        code: "PAGO",
        name: "Fase de Pago",
        shortName: "Pago",
        category: "PAYMENT",
        order: 4,
        description: "Procesamiento de pagos y facturación",
        isRequired: true,
        estimatedDuration: 5,
        requiredDocuments: [
          "Facturas/Comprobantes de venta",
          "Planillas de pago",
          "Retenciones tributarias",
          "Comprobantes de egreso",
        ].map((doc) => ({
          code: `PAGO_${slugify(doc)}`,
          name: doc,
        })),
        applicableContractTypes: [], // Aplica a todos
        // CORRECCIÓN: Documentos específicos para tipos simples
        documentsExceptions: {
          IC: ["PAGO_PLANILLAS_DE_PAGO"], // Ínfima cuantía sin planillas complejas
          CE: ["PAGO_PLANILLAS_DE_PAGO"], // Catálogo sin planillas
        },
      },

      // FASE DE RECEPCIÓN
      {
        code: "RECEP",
        name: "Fase de Recepción",
        shortName: "Recepción",
        category: "RECEIPT",
        order: 5,
        description: "Recepción definitiva, liquidación del contrato",
        isRequired: true,
        estimatedDuration: 10,
        requiredDocuments: [
          "Acta de entrega recepción definitiva",
          "Informe final de fiscalización",
          "Liquidación del contrato",
          "Devolución de garantías",
        ].map((doc) => ({
          code: `RECEP_${slugify(doc)}`,
          name: doc,
        })),
        applicableContractTypes: [], // Aplica a todos
        // CORRECCIÓN: Sin garantías para procedimientos simples
        documentsExceptions: {
          IC: [
            "RECEP_DEVOLUCION_DE_GARANTIAS",
            "RECEP_INFORME_FINAL_DE_FISCALIZACION",
          ],
          EME: ["RECEP_DEVOLUCION_DE_GARANTIAS"], // Solo si no tuvo garantías
          CE: [
            "RECEP_DEVOLUCION_DE_GARANTIAS",
            "RECEP_INFORME_FINAL_DE_FISCALIZACION",
          ],
          CM: ["RECEP_DEVOLUCION_DE_GARANTIAS"],
        },
        // Duraciones variables según complejidad
        durationByType: {
          IC: 3, // Ínfima cuantía muy simple
          CE: 5, // Catálogo rápido
          EME: 5, // Emergencia sin complicaciones
          MC: 7, // Menor cuantía
          COT: 10, // Cotización estándar
          SIE: 10, // Subasta inversa
          CM: 7, // Convenio marco
          CON: 15, // Consultoría con informes
          LC: 12, // Lista corta
          LIC: 20, // Licitación más compleja
        },
      },
    ];
    return defaultPhases;
  }
}
