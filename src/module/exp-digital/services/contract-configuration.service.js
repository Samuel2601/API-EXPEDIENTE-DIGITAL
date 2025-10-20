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
            effectiveConfig: {
              ...phaseConfig,
              documentsRequired: this._mergeDocumentRequirements(
                phase.requiredDocuments,
                phaseConfig?.documentExceptions
              ),
              duration: this._calculateEffectiveDuration(
                phase.defaultDuration,
                phaseConfig?.customDuration
              ),
            },
          };
        })
      );

      return {
        contractType: contractType.toJSON
          ? contractType.toJSON()
          : contractType,
        phases: effectivePhases,
        summary: {
          totalPhases: effectivePhases.length,
          requiredPhases: effectivePhases.filter((p) => p.isRequired).length,
          optionalPhases: effectivePhases.filter((p) => !p.isRequired).length,
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
   * @returns {Promise<Object>} Tipos de contratación categorizados o planos
   */
  async getAllContractTypes(options = {}) {
    try {
      const {
        includeInactive = false,
        regime = null,
        page = 1,
        limit = 50,
        flat = false, // Nueva opción para devolver todo plano
      } = options;

      console.log(`📋 Obteniendo tipos de contratación:`, options);

      // Si se solicita un régimen específico
      if (regime) {
        const types = await this.contractTypeRepository.findByRegimen(regime, {
          includeInactive,
          page,
          limit,
        });

        const resultData = types.docs || types;

        // Si flat=true, devolver directamente el array
        if (flat) {
          return {
            types: resultData,
            count: types.totalDocs || types.length,
            totalPages: types.totalPages || 1,
            currentPage: types.page || 1,
            regime,
            includeInactive,
          };
        }

        return {
          [regime.toLowerCase()]: {
            regime,
            description:
              regime === "COMUN"
                ? "Procedimientos Comunes según LOSNCP"
                : "Procedimientos Especiales según LOSNCP",
            types: resultData,
            count: types.totalDocs || types.length,
            totalPages: types.totalPages || 1,
            currentPage: types.page || 1,
          },
          totalTypes: types.totalDocs || types.length,
        };
      }

      // Obtener ambos regímenes
      const [commonTypes, specialTypes] = await Promise.all([
        this.contractTypeRepository.findByRegimen("COMUN", {
          includeInactive,
          page: 1,
          limit: 100,
        }),
        this.contractTypeRepository.findByRegimen("ESPECIAL", {
          includeInactive,
          page: 1,
          limit: 100,
        }),
      ]);

      const commonTypesData = commonTypes.docs || commonTypes;
      const specialTypesData = specialTypes.docs || specialTypes;

      // Si flat=true, combinar todos los tipos en un solo array
      if (flat) {
        const allTypes = [...commonTypesData, ...specialTypesData];
        return {
          types: allTypes,
          count: allTypes.length,
          comunCount: commonTypesData.length,
          especialCount: specialTypesData.length,
          totalTypes: allTypes.length,
          includeInactive,
        };
      }

      // Estructura original agrupada
      return {
        comun: {
          regime: "COMUN",
          description: "Procedimientos Comunes según LOSNCP",
          types: commonTypesData,
          count: commonTypes.totalDocs || commonTypes.length,
        },
        especial: {
          regime: "ESPECIAL",
          description: "Procedimientos Especiales según LOSNCP",
          types: specialTypesData,
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
      console.log(typeData);
      return await this.contractTypeRepository.create(typeData, userData);
    } catch (error) {
      throw createError(
        ERROR_CODES.CREATE_ERROR,
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
        return await this.contractPhaseRepository.findByCategory(category, {
          includeInactive,
          page: page,
          limit: limit,
        });
      }

      // Filtrar por tipo de contrato si se especifica
      if (contractTypeCode) {
        const contractType =
          await this.contractTypeRepository.findByCode(contractTypeCode);
        console.log("Buscando contracType", contractType);
        if (contractType) {
          return await this.contractPhaseRepository.findForContractType(
            contractType._id,
            {
              populateDependencies: true,
              includeInactive,
            }
          );
        }
      }

      const phases = await this.contractPhaseRepository.findAll(query, {
        page,
        limit,
        includeDeleted: includeInactive ? true : false,
        populate: [
          "dependencies.requiredPhases.phase",
          "typeSpecificConfig.contractType",
        ],
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
    // Separar configuraciones específicas de los datos base
    const { typeSpecificConfig, ...basePhaseData } = phaseData;

    // Crear fase base sin las configuraciones específicas
    const createdPhase = await this.createContractPhase(
      basePhaseData,
      {},
      userData
    );

    // ✅ Aplicar configuraciones específicas si existen
    if (typeSpecificConfig && typeSpecificConfig.length > 0) {
      for (const config of typeSpecificConfig) {
        try {
          // Resolver el código del tipo de contrato a ObjectId
          const contractType = await this.contractTypeRepository.findByCode(
            config.contractType
          );

          if (contractType) {
            // Preparar configuración con ObjectId
            const configWithObjectId = {
              ...config,
              contractType: contractType._id,
            };

            // Usar método del repository para agregar configuración
            await this.contractPhaseRepository.addTypeSpecificConfiguration(
              createdPhase._id,
              configWithObjectId,
              userData
            );
          } else {
            console.warn(
              `Tipo de contrato no encontrado: ${config.contractType}`
            );
          }
        } catch (error) {
          console.warn(
            `Error aplicando configuración para ${config.contractType}:`,
            error.message
          );
        }
      }
    }

    return await this.contractPhaseRepository.findById(createdPhase._id);
  }

  /**
   * ✅ NUEVO: Método auxiliar para migrar configuraciones existentes
   * Convierte el formato antiguo al nuevo si es necesario
   */
  _convertLegacyConfiguration(phaseData) {
    // Si ya está en el formato nuevo, devolverlo tal como está
    if (phaseData.typeSpecificConfig) {
      return phaseData;
    }

    // Convertir formato legacy (documentsExceptions + durationByType)
    const typeSpecificConfig = [];

    if (phaseData.documentsExceptions || phaseData.durationByType) {
      const allTypes = new Set([
        ...Object.keys(phaseData.documentsExceptions || {}),
        ...Object.keys(phaseData.durationByType || {}),
      ]);

      for (const contractTypeCode of allTypes) {
        const config = {
          contractType: contractTypeCode,
        };

        if (phaseData.documentsExceptions?.[contractTypeCode]) {
          config.excludedDocuments =
            phaseData.documentsExceptions[contractTypeCode];
        }

        if (phaseData.durationByType?.[contractTypeCode]) {
          config.customDuration = phaseData.durationByType[contractTypeCode];
        }

        typeSpecificConfig.push(config);
      }
    }

    // Remover propiedades legacy y agregar la nueva
    const { documentsExceptions, durationByType, ...cleanPhaseData } =
      phaseData;

    return {
      ...cleanPhaseData,
      typeSpecificConfig,
    };
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
      PLANIFICACION: "Planificación anual y estudios preliminares",
      PREPARACION:
        "Definición de necesidades, elaboración de bases y aprobación del proceso",
      CONVOCATORIA: "Publicación de la licitación o invitación a participar",
      EVALUACION: "Evaluación técnica, financiera y legal de las ofertas",
      ADJUDICACION: "Decisión final y firma de contrato",
      EJECUCION: "Ejecución y seguimiento del contrato",
      LIQUIDACION: "Recepción definitiva, cierre y liquidación del contrato",
      ARCHIVO: "Archivo del expediente y cierre documental",
      OTHER: "Otras fases del proceso",
    };

    return descriptions[category] || descriptions.OTHER;
  }

  _getDefaultTypes() {
    return [
      // ========== RÉGIMEN COMÚN ==========
      {
        code: "INFIMA_CUANTIA",
        name: "Ínfima Cuantía",
        category: "CONTRATACION_DIRECTA",
        regime: "COMUN",
        description:
          "Contrataciones hasta $7.212,60 USD (0,02% PIE 2025). No requiere publicación ni garantías.",
        applicableObjects: ["bienes", "servicios", "obras"],
        amountLimits: [
          { objectType: "bienes", min: 0, max: 7212.6 },
          { objectType: "servicios", min: 0, max: 7212.6 },
          { objectType: "obras", min: 0, max: 7212.6 },
        ],
        procedureConfig: {
          requiresPublication: false,
          evaluationDays: 5,
          requiresInsurance: false,
        },
      },
      {
        code: "MENOR_CUANTIA",
        name: "Menor Cuantía",
        category: "COTIZACION",
        regime: "COMUN",
        description:
          "Contrataciones entre $7.212,61 y $72.126,03 USD (0,02%-0,2% PIE). Requiere publicación y garantías.",
        applicableObjects: ["bienes", "servicios", "obras"],
        amountLimits: [
          { objectType: "bienes", min: 7212.61, max: 72126.03 },
          { objectType: "servicios", min: 7212.61, max: 72126.03 },
          { objectType: "obras", min: 7212.61, max: 252441.12 },
        ],
        procedureConfig: {
          requiresPublication: true,
          publicationDays: 5,
          evaluationDays: 10,
          requiresInsurance: true,
          insurancePercentage: 5,
        },
      },
      {
        code: "SUBASTA_INVERSA_NORMALIZADA",
        name: "Subasta Inversa Electrónica - Bienes/Servicios Normalizados",
        category: "LICITACION",
        regime: "COMUN",
        description:
          "Para bienes y servicios normalizados entre $7.212,61 y $540.945,26 USD.",
        applicableObjects: ["bienes_normalizados", "servicios_normalizados"],
        amountLimits: [
          { objectType: "bienes_normalizados", min: 7212.61, max: 540945.26 },
          {
            objectType: "servicios_normalizados",
            min: 7212.61,
            max: 540945.26,
          },
        ],
        procedureConfig: {
          requiresPublication: true,
          publicationDays: 8,
          evaluationDays: 15,
          requiresInsurance: true,
          insurancePercentage: 5,
        },
      },
      {
        code: "SUBASTA_INVERSA_NO_NORMALIZADA",
        name: "Subasta Inversa Electrónica - Bienes/Servicios No Normalizados",
        category: "LICITACION",
        regime: "COMUN",
        description:
          "Para bienes y servicios no normalizados entre $7.212,61 y $250.000 USD.",
        applicableObjects: [
          "bienes_no_normalizados",
          "servicios_no_normalizados",
        ],
        amountLimits: [
          { objectType: "bienes_no_normalizados", min: 7212.61, max: 250000 },
          {
            objectType: "servicios_no_normalizados",
            min: 7212.61,
            max: 250000,
          },
        ],
        procedureConfig: {
          requiresPublication: true,
          publicationDays: 8,
          evaluationDays: 15,
          requiresInsurance: true,
          insurancePercentage: 5,
        },
      },
      {
        code: "LICITACION_PUBLICA",
        name: "Licitación Pública",
        category: "LICITACION",
        regime: "COMUN",
        description:
          "Contrataciones superiores a $540.945,26 USD para bienes/servicios normalizados, o superiores a $250.000 para no normalizados.",
        applicableObjects: ["bienes", "servicios"],
        amountLimits: [
          { objectType: "bienes_normalizados", min: 540945.27, max: null },
          { objectType: "servicios_normalizados", min: 540945.27, max: null },
          { objectType: "bienes_no_normalizados", min: 250000.01, max: null },
          {
            objectType: "servicios_no_normalizados",
            min: 250000.01,
            max: null,
          },
        ],
        procedureConfig: {
          requiresPublication: true,
          publicationDays: 15,
          evaluationDays: 20,
          requiresInsurance: true,
          insurancePercentage: 10,
        },
      },
      {
        code: "OBRAS_COTIZACION",
        name: "Obras - Cotización",
        category: "COTIZACION",
        regime: "COMUN",
        description: "Obras entre $252.441,12 y $1.081.890,51 USD.",
        applicableObjects: ["obras"],
        amountLimits: [
          { objectType: "obras", min: 252441.12, max: 1081890.51 },
        ],
        procedureConfig: {
          requiresPublication: true,
          publicationDays: 10,
          evaluationDays: 15,
          requiresInsurance: true,
          insurancePercentage: 5,
        },
      },
      {
        code: "OBRAS_LICITACION",
        name: "Obras - Licitación",
        category: "LICITACION",
        regime: "COMUN",
        description: "Obras superiores a $1.081.890,51 USD.",
        applicableObjects: ["obras"],
        amountLimits: [{ objectType: "obras", min: 1081890.52, max: null }],
        procedureConfig: {
          requiresPublication: true,
          publicationDays: 15,
          evaluationDays: 20,
          requiresInsurance: true,
          insurancePercentage: 10,
        },
      },
      {
        code: "CONSULTORIA_DIRECTA",
        name: "Consultoría - Contratación Directa",
        category: "CONTRATACION_DIRECTA",
        regime: "COMUN",
        description: "Servicios de consultoría hasta $72.126,03 USD.",
        applicableObjects: ["consultorias"],
        amountLimits: [{ objectType: "consultorias", min: 0, max: 72126.03 }],
        procedureConfig: {
          requiresPublication: false,
          evaluationDays: 10,
          requiresInsurance: true,
          insurancePercentage: 5,
        },
      },
      {
        code: "CONSULTORIA_LISTA_CORTA",
        name: "Consultoría - Lista Corta",
        category: "CONSULTORIA",
        regime: "COMUN",
        description:
          "Servicios de consultoría entre $72.126,03 y $540.945,26 USD (o $200.000 con financiamiento).",
        applicableObjects: ["consultorias"],
        amountLimits: [
          { objectType: "consultorias", min: 72126.03, max: 540945.26 },
          {
            objectType: "consultorias_financiamiento",
            min: 72126.03,
            max: 200000,
          },
        ],
        procedureConfig: {
          requiresPublication: true,
          publicationDays: 10,
          evaluationDays: 20,
          requiresInsurance: true,
          insurancePercentage: 5,
        },
      },
      {
        code: "CONCURSO_PUBLICO_CONSULTORIA",
        name: "Consultoría - Concurso Público",
        category: "CONCURSO",
        regime: "COMUN",
        description: "Servicios de consultoría superiores a $540.945,26 USD.",
        applicableObjects: ["consultorias"],
        amountLimits: [
          { objectType: "consultorias", min: 540945.27, max: null },
        ],
        procedureConfig: {
          requiresPublication: true,
          publicationDays: 15,
          evaluationDays: 25,
          requiresInsurance: true,
          insurancePercentage: 10,
        },
      },
      {
        code: "CATALOGO_ELECTRONICO",
        name: "Catálogo Electrónico",
        category: "CATALOGO_ELECTRONICO",
        regime: "COMUN",
        description: "Compra por catálogo electrónico - sin límite de monto.",
        applicableObjects: ["bienes_catalogo", "servicios_catalogo"],
        amountLimits: [
          { objectType: "bienes_catalogo", min: 0, max: null },
          { objectType: "servicios_catalogo", min: 0, max: null },
        ],
        procedureConfig: {
          requiresPublication: false,
          evaluationDays: 3,
          requiresInsurance: false,
        },
      },

      // ========== RÉGIMEN ESPECIAL ==========
      {
        code: "CONTRATACION_DIRECTA_ESP",
        name: "Contratación Directa Especial",
        category: "CONTRATACION_DIRECTA",
        regime: "ESPECIAL",
        description:
          "Para casos de emergencia, urgencia, o cuando exista un único proveedor.",
        applicableObjects: ["bienes", "servicios", "obras"],
        amountLimits: [
          { objectType: "bienes", min: 0, max: null },
          { objectType: "servicios", min: 0, max: null },
          { objectType: "obras", min: 0, max: null },
        ],
        procedureConfig: {
          requiresPublication: false,
          evaluationDays: 3,
          requiresInsurance: false,
          specialConditions: ["Emergencia", "Urgencia", "Proveedor Único"],
        },
      },
      {
        code: "ENCARGO_CONFIANZA_ESP",
        name: "Encargo de Confianza",
        category: "ENCARGO_DE_CONFIANZA",
        regime: "ESPECIAL",
        description:
          "Para servicios personales de alta especialización o confianza.",
        applicableObjects: ["servicios_personales"],
        amountLimits: [
          { objectType: "servicios_personales", min: 0, max: null },
        ],
        procedureConfig: {
          requiresPublication: false,
          evaluationDays: 5,
          requiresInsurance: false,
          specialConditions: ["Alta especialización", "Relación de confianza"],
        },
      },
      {
        code: "OBRAS_ARTISTICAS_ESP",
        name: "Obras Artísticas y Culturales",
        category: "CONCURSO",
        regime: "ESPECIAL",
        description:
          "Para adquisición de obras de arte, derechos de autor y actividades culturales.",
        applicableObjects: ["obras_artisticas", "derechos_autor"],
        amountLimits: [
          { objectType: "obras_artisticas", min: 0, max: null },
          { objectType: "derechos_autor", min: 0, max: null },
        ],
        procedureConfig: {
          requiresPublication: true,
          publicationDays: 8,
          evaluationDays: 12,
          requiresInsurance: false,
          specialConditions: ["Concurso de Méritos Artísticos"],
        },
      },
      {
        code: "INVESTIGACION_CIENTIFICA_ESP",
        name: "Investigación Científica",
        category: "CONTRATACION_DIRECTA",
        regime: "ESPECIAL",
        description:
          "Para proyectos de investigación científica y desarrollo tecnológico.",
        applicableObjects: ["investigacion", "desarrollo_tecnologico"],
        amountLimits: [
          { objectType: "investigacion", min: 0, max: null },
          { objectType: "desarrollo_tecnologico", min: 0, max: null },
        ],
        procedureConfig: {
          requiresPublication: true,
          publicationDays: 10,
          evaluationDays: 20,
          requiresInsurance: false,
          specialConditions: ["Evaluación por Pares Académicos"],
        },
      },
      {
        code: "FERIAS_INCLUSIVAS",
        name: "Ferias Inclusivas",
        category: "CONTRATACION_DIRECTA",
        regime: "ESPECIAL",
        description:
          "Procedimiento especial para fomento de la participación inclusiva.",
        applicableObjects: ["bienes", "servicios"],
        amountLimits: [
          { objectType: "bienes", min: 0, max: 200000 },
          { objectType: "servicios", min: 0, max: 200000 },
        ],
        procedureConfig: {
          requiresPublication: true,
          publicationDays: 8,
          evaluationDays: 10,
          requiresInsurance: true,
          insurancePercentage: 5,
          specialConditions: [
            "Participación Inclusiva",
            "Economía Popular y Solidaria",
          ],
        },
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

    const allContractTypes = [
      "INFIMA_CUANTIA",
      "MENOR_CUANTIA",
      "SUBASTA_INVERSA_NORMALIZADA",
      "SUBASTA_INVERSA_NO_NORMALIZADA",
      "LICITACION_PUBLICA",
      "OBRAS_COTIZACION",
      "OBRAS_LICITACION",
      "CONSULTORIA_DIRECTA",
      "CONSULTORIA_LISTA_CORTA",
      "CONCURSO_PUBLICO_CONSULTORIA",
      "CATALOGO_ELECTRONICO",
      "CONTRATACION_DIRECTA_ESP",
      "ENCARGO_CONFIANZA_ESP",
      "OBRAS_ARTISTICAS_ESP",
      "INVESTIGACION_CIENTIFICA_ESP",
      "FERIAS_INCLUSIVAS",
    ];

    return [
      // FASE DE PLANIFICACIÓN
      {
        code: "PLAN",
        name: "Fase de Planificación",
        shortName: "Planificación",
        category: "PLANIFICACION",
        order: 1,
        description:
          "Planificación anual, estudios preliminares y estimación de costos",
        phaseConfig: {
          isOptional: false,
          allowParallel: false,
          estimatedDays: 10,
          requiresApproval: true,
          autoAdvance: false,
          notificationDays: 3,
        },
        requiredDocuments: [
          "Plan Anual de Contrataciones",
          "Estudios de Mercado",
          "Estimación de Costos",
        ].map((doc) => ({
          code: `PLAN_${slugify(doc)}`,
          name: doc,
          isMandatory: true,
          allowedFileTypes: ["pdf", "docx"],
          maxFileSize: 10485760,
        })),
        // ✅ NUEVO: Configuraciones específicas usando typeSpecificConfig
        typeSpecificConfig: [
          {
            contractType: "INFIMA_CUANTIA", // Se resolverá a ObjectId en _createPhaseWithConfiguration
            excludedDocuments: ["PLAN_ESTUDIOS_DE_MERCADO"],
            customDuration: 5,
          },
          {
            contractType: "MENOR_CUANTIA",
            excludedDocuments: ["PLAN_ESTUDIOS_DE_MERCADO"],
            customDuration: 7,
          },
          {
            contractType: "LICITACION_PUBLICA",
            customDuration: 15,
          },
        ],
      },

      // FASE PREPARATORIA
      {
        code: "PREP",
        name: "Fase Preparatoria",
        shortName: "Preparatoria",
        category: "PREPARACION",
        order: 2,
        description:
          "Elaboración de estudios técnicos, términos de referencia y especificaciones",
        phaseConfig: {
          isOptional: false,
          allowParallel: true,
          estimatedDays: 15,
          requiresApproval: true,
          autoAdvance: false,
          notificationDays: 3,
        },
        requiredDocuments: [
          "Certificación Presupuestaria",
          "Términos de Referencia",
          "Especificaciones Técnicas",
          "Resolución de Inicio",
          "Estudio de Desagregación Tecnológica",
        ].map((doc) => ({
          code: `PREP_${slugify(doc)}`,
          name: doc,
          isMandatory: true,
          allowedFileTypes: ["pdf", "docx"],
          maxFileSize: 10485760,
        })),
        typeSpecificConfig: [
          {
            contractType: "INFIMA_CUANTIA",
            excludedDocuments: ["PREP_ESTUDIO_DE_DESAGREGACION_TECNOLOGICA"],
            customDuration: 5,
          },
          {
            contractType: "MENOR_CUANTIA",
            excludedDocuments: ["PREP_ESTUDIO_DE_DESAGREGACION_TECNOLOGICA"],
            customDuration: 8,
          },
          {
            contractType: "CONSULTORIA_DIRECTA",
            additionalDocuments: [
              {
                code: "PREP_PERFIL_CONSULTOR",
                name: "Perfil del Consultor",
                isMandatory: true,
                allowedFileTypes: ["pdf"],
                maxFileSize: 5242880,
              },
            ],
            customDuration: 20,
          },
        ],
      },

      // FASE PRECONTRACTUAL
      {
        code: "PRECON",
        name: "Fase Precontractual",
        shortName: "Precontractual",
        category: "CONVOCATORIA",
        order: 3,
        description: "Convocatoria, recepción y evaluación de ofertas",
        phaseConfig: {
          isOptional: false,
          allowParallel: false,
          estimatedDays: 20,
          requiresApproval: true,
          autoAdvance: false,
          notificationDays: 5,
        },
        requiredDocuments: [
          "Pliegos",
          "Ofertas Recibidas",
          "Preguntas y Respuestas",
          "Informe de Evaluación",
          "Adjudicación",
        ].map((doc) => ({
          code: `PRECON_${slugify(doc)}`,
          name: doc,
          isMandatory: true,
          allowedFileTypes: ["pdf", "docx", "xlsx"],
          maxFileSize: 15728640,
        })),
        typeSpecificConfig: [
          {
            contractType: "INFIMA_CUANTIA",
            excludedDocuments: [
              "PRECON_PLIEGOS",
              "PRECON_INFORME_DE_EVALUACION",
            ],
            customDuration: 3,
          },
          {
            contractType: "SUBASTA_INVERSA_NORMALIZADA",
            customDuration: 15,
          },
          {
            contractType: "LICITACION_PUBLICA",
            customDuration: 30,
          },
        ],
      },

      // FASE CONTRACTUAL
      {
        code: "EJEC",
        name: "Fase Contractual/Ejecución",
        shortName: "Ejecución",
        category: "EJECUCION",
        order: 4,
        description: "Ejecución del contrato, entregables y seguimiento",
        phaseConfig: {
          isOptional: false,
          allowParallel: true,
          estimatedDays: 90,
          requiresApproval: false,
          autoAdvance: false,
          notificationDays: 7,
        },
        requiredDocuments: [
          "Contrato Firmado",
          "Garantías",
          "Cronograma Valorado",
          "Actas Entrega Parcial",
          "Informes de Fiscalización",
        ].map((doc) => ({
          code: `EJEC_${slugify(doc)}`,
          name: doc,
          isMandatory: doc !== "Actas Entrega Parcial",
          allowedFileTypes: ["pdf", "docx", "xlsx"],
          maxFileSize: 20971520,
        })),
        typeSpecificConfig: [
          {
            contractType: "OBRAS_LICITACION",
            additionalDocuments: [
              {
                code: "EJEC_PLANILLAS_AVANCE",
                name: "Planillas de Avance",
                isMandatory: true,
                allowedFileTypes: ["xlsx", "pdf"],
                maxFileSize: 10485760,
              },
            ],
            customDuration: 180,
          },
          {
            contractType: "CONSULTORIA_DIRECTA",
            customDuration: 60,
          },
        ],
      },

      // FASE DE LIQUIDACIÓN
      {
        code: "LIQ",
        name: "Fase de Liquidación",
        shortName: "Liquidación",
        category: "LIQUIDACION",
        order: 5,
        description: "Recepción definitiva, liquidación y cierre del proceso",
        phaseConfig: {
          isOptional: false,
          allowParallel: false,
          estimatedDays: 15,
          requiresApproval: true,
          autoAdvance: false,
          notificationDays: 3,
        },
        requiredDocuments: [
          "Acta Entrega Recepción Definitiva",
          "Liquidación del Contrato",
          "Informe Final Fiscalización",
          "Devolución Garantías",
        ].map((doc) => ({
          code: `LIQ_${slugify(doc)}`,
          name: doc,
          isMandatory: true,
          allowedFileTypes: ["pdf", "docx"],
          maxFileSize: 10485760,
        })),
        typeSpecificConfig: [
          {
            contractType: "OBRAS_LICITACION",
            additionalDocuments: [
              {
                code: "LIQ_PLANOS_AS_BUILT",
                name: "Planos As Built",
                isMandatory: true,
                allowedFileTypes: ["pdf", "dwg"],
                maxFileSize: 52428800,
              },
            ],
            customDuration: 30,
          },
        ],
      },
    ];
  }

  // ===== MÉTODOS AUXILIARES PRIVADOS =====

  /**
   * Combinar requerimientos de documentos con excepciones
   */
  _mergeDocumentRequirements(baseDocuments, exceptions = []) {
    const finalDocuments = [...(baseDocuments || [])];

    exceptions.forEach((exception) => {
      if (exception.action === "ADD") {
        finalDocuments.push(exception.document);
      } else if (exception.action === "REMOVE") {
        const index = finalDocuments.findIndex(
          (doc) => doc.code === exception.document.code
        );
        if (index > -1) finalDocuments.splice(index, 1);
      }
    });

    return finalDocuments;
  }

  /**
   * Calcular duración efectiva considerando configuraciones específicas
   */
  _calculateEffectiveDuration(defaultDuration, customDuration) {
    return (
      customDuration || defaultDuration || { days: 15, isBusinessDays: true }
    );
  }

  /**
   * Validar integridad de la configuración
   */
  async _validateConfigurationIntegrity() {
    const [types, phases] = await Promise.all([
      this.contractTypeRepository.findAll({ isActive: true }),
      this.contractPhaseRepository.findAll({ isActive: true }),
    ]);

    const issues = [];

    // Validar que cada tipo tenga al menos una fase preparatoria
    for (const type of types) {
      const preparatoryPhases = phases.filter(
        (p) =>
          p.category === "PREPARATORIA" &&
          p.typeSpecificConfig?.some((config) =>
            config.contractType.equals(type._id)
          )
      );

      if (preparatoryPhases.length === 0) {
        issues.push(`Tipo ${type.code} no tiene fase preparatoria configurada`);
      }
    }

    if (issues.length > 0) {
      console.warn("⚠️  Problemas de integridad encontrados:", issues);
    }

    return { valid: issues.length === 0, issues };
  }

  /**
   * Obtener descripción de categoría
   */
  _getCategoryDescription(category) {
    const descriptions = {
      COMUN: "Procedimientos de uso común regulados por la LOSNCP",
      ESPECIAL: "Procedimientos especiales con normativas específicas",
      EMERGENCIA: "Procedimientos de emergencia y urgencia",
      CATALOGO: "Compras a través de catálogo electrónico",
    };
    return descriptions[category] || `Categoría: ${category}`;
  }
}
