// =============================================================================
// src/module/exp-digital/services/contract-configuration.service.js
// Servicio de configuración para tipos de contratación pública
// =============================================================================

import { ContractTypeRepository } from "../repositories/contract-type.repository.js";
import { ContractTypeRuleRepository } from "../repositories/contract-type-rule.repository.js";
import { ContractAmountRangeRepository } from "../repositories/contract-amount-range.repository.js";
import { createError } from "../../../../utils/error.util.js";
import { validateObjectId } from "../../../../utils/validation.util.js";

export class ContractConfigurationService {
  constructor() {
    this.contractTypeRepository = new ContractTypeRepository();
    this.contractTypeRuleRepository = new ContractTypeRuleRepository();
    this.contractAmountRangeRepository = new ContractAmountRangeRepository();
  }

  // ===== MÉTODOS DE CONFIGURACIÓN GENERAL =====

  /**
   * Obtener configuración completa de tipos de contratación
   * @param {Object} options - Opciones de filtrado
   * @returns {Promise<Object>} Configuración completa con tipos, reglas y rangos
   */
  async getCompleteConfiguration(options = {}) {
    try {
      const { includeInactive = false, category = null } = options;

      // Obtener tipos de contratación
      const typeFilters = { isActive: !includeInactive };
      if (category) typeFilters.category = category;

      const [contractTypes, contractRules, amountRanges] = await Promise.all([
        this.contractTypeRepository.findAll(typeFilters),
        this.contractTypeRuleRepository.findAll({
          isActive: !includeInactive,
        }),
        this.contractAmountRangeRepository.findAll({
          isActive: !includeInactive,
        }),
      ]);

      // Agrupar por categoría
      const configuration = {
        common: {
          types: contractTypes.filter((type) => type.category === "comun"),
          rules: contractRules.filter((rule) =>
            contractTypes.find(
              (type) =>
                type.code === rule.contractTypeCode && type.category === "comun"
            )
          ),
          ranges: amountRanges.filter((range) =>
            contractTypes.find(
              (type) =>
                type.code === range.contractTypeCode &&
                type.category === "comun"
            )
          ),
        },
        special: {
          types: contractTypes.filter((type) => type.category === "especial"),
          rules: contractRules.filter((rule) =>
            contractTypes.find(
              (type) =>
                type.code === rule.contractTypeCode &&
                type.category === "especial"
            )
          ),
          ranges: amountRanges.filter((range) =>
            contractTypes.find(
              (type) =>
                type.code === range.contractTypeCode &&
                type.category === "especial"
            )
          ),
        },
        summary: {
          totalTypes: contractTypes.length,
          totalRules: contractRules.length,
          totalRanges: amountRanges.length,
          activeTypes: contractTypes.filter((t) => t.isActive).length,
          categories: {
            common: contractTypes.filter((t) => t.category === "comun").length,
            special: contractTypes.filter((t) => t.category === "especial")
              .length,
          },
        },
      };

      return configuration;
    } catch (error) {
      throw createError(
        "CONFIG_FETCH_ERROR",
        `Error al obtener configuración: ${error.message}`,
        500
      );
    }
  }

  /**
   * Obtener tipos de contratación aplicables según monto y objeto
   * @param {Number} amount - Monto del contrato
   * @param {String} contractObject - Tipo de objeto (bienes, servicios, obras, consultoria)
   * @param {Object} options - Opciones adicionales
   * @returns {Promise<Array>} Tipos de contratación aplicables ordenados por prioridad
   */
  async getApplicableContractTypes(amount, contractObject, options = {}) {
    try {
      // Validar parámetros de entrada
      this._validateContractParameters(amount, contractObject);

      const {
        includeSpecial = true,
        specialConditions = {},
        prioritizeCommon = true,
      } = options;

      // Buscar rangos de montos aplicables
      const applicableRanges =
        await this.contractAmountRangeRepository.findApplicableRanges(
          amount,
          contractObject
        );

      if (!applicableRanges || applicableRanges.length === 0) {
        throw createError(
          "NO_APPLICABLE_RANGES",
          `No se encontraron rangos aplicables para ${contractObject} con monto ${amount}`,
          404
        );
      }

      // Obtener códigos de tipos de contrato
      const contractTypeCodes = [
        ...new Set(applicableRanges.map((range) => range.contractTypeCode)),
      ];

      // Buscar tipos de contratación correspondientes
      const contractTypes = await Promise.all(
        contractTypeCodes.map((code) =>
          this.contractTypeRepository.findByCode(code)
        )
      );

      const validTypes = contractTypes.filter((type) => type && type.isActive);

      // Buscar reglas aplicables
      const applicableRules = await this._getApplicableRules(
        amount,
        contractObject,
        specialConditions
      );

      // Procesar tipos con sus reglas y metadatos
      let applicableTypes = validTypes.map((type) => {
        const typeRanges = applicableRanges.filter(
          (range) => range.contractTypeCode === type.code
        );

        const typeRules = applicableRules.filter(
          (rule) => rule.contractTypeCode === type.code
        );

        return {
          ...type.toObject(),
          applicableRanges: typeRanges,
          applicableRules: typeRules,
          priority: this._calculateTypePriority(type, typeRules, amount),
          metadata: {
            recommendedFor: this._getRecommendedUse(
              type,
              amount,
              contractObject
            ),
            estimatedTimeframe: this._getEstimatedTimeframe(type),
            complexity: this._getComplexityLevel(type),
          },
        };
      });

      // Filtrar por categoría si es necesario
      if (!includeSpecial) {
        applicableTypes = applicableTypes.filter(
          (type) => type.category === "comun"
        );
      }

      // Ordenar por prioridad
      applicableTypes.sort((a, b) => {
        if (prioritizeCommon) {
          // Priorizar procedimientos comunes sobre especiales
          if (a.category === "comun" && b.category === "especial") return -1;
          if (a.category === "especial" && b.category === "comun") return 1;
        }
        return b.priority - a.priority;
      });

      return applicableTypes;
    } catch (error) {
      if (error.status) throw error;
      throw createError(
        "APPLICABLE_TYPES_ERROR",
        `Error al obtener tipos aplicables: ${error.message}`,
        500
      );
    }
  }

  /**
   * Determinar tipo de contratación recomendado
   * @param {Number} amount - Monto del contrato
   * @param {String} contractObject - Tipo de objeto
   * @param {Object} context - Contexto adicional (urgencia, complejidad, etc.)
   * @returns {Promise<Object>} Tipo recomendado con justificación
   */
  async getRecommendedContractType(amount, contractObject, context = {}) {
    try {
      const {
        isUrgent = false,
        isComplex = false,
        hasSpecialRequirements = false,
        departmentExperience = "medium",
      } = context;

      const applicableTypes = await this.getApplicableContractTypes(
        amount,
        contractObject,
        { includeSpecial: true }
      );

      if (applicableTypes.length === 0) {
        throw createError(
          "NO_RECOMMENDATIONS",
          "No se pueden generar recomendaciones para los parámetros dados",
          404
        );
      }

      let recommendedType;
      let justification = [];

      // Lógica de recomendación según el contexto
      if (isUrgent) {
        // Buscar procedimientos de emergencia o menor cuantía
        recommendedType =
          applicableTypes.find((type) =>
            ["EMRG", "MENC", "INFC"].includes(type.code)
          ) || applicableTypes[0];
        justification.push("Se priorizó por urgencia del requerimiento");
      } else if (hasSpecialRequirements) {
        // Buscar consultoría o licitación
        recommendedType =
          applicableTypes.find((type) =>
            ["CONS", "LICT"].includes(type.code)
          ) || applicableTypes[0];
        justification.push("Se seleccionó por requerimientos especiales");
      } else {
        // Procedimiento estándar basado en monto
        recommendedType = applicableTypes[0]; // Ya están ordenados por prioridad
        justification.push(
          "Se seleccionó el procedimiento estándar para el rango de monto"
        );
      }

      // Validaciones adicionales
      const validationResults = await this._validateRecommendation(
        recommendedType,
        amount,
        contractObject,
        context
      );

      return {
        recommended: recommendedType,
        alternatives: applicableTypes.slice(1, 4), // Hasta 3 alternativas
        justification,
        validations: validationResults,
        estimatedProcess: {
          durationDays: this._getEstimatedTimeframe(recommendedType),
          keyMilestones: this._getKeyMilestones(recommendedType),
          requiredDocuments: await this._getRequiredDocuments(
            recommendedType.code
          ),
        },
      };
    } catch (error) {
      if (error.status) throw error;
      throw createError(
        "RECOMMENDATION_ERROR",
        `Error al generar recomendación: ${error.message}`,
        500
      );
    }
  }

  // ===== MÉTODOS DE GESTIÓN DE REGLAS =====

  /**
   * Crear o actualizar una regla de tipo de contrato
   * @param {String} contractTypeCode - Código del tipo de contrato
   * @param {Object} ruleData - Datos de la regla
   * @returns {Promise<Object>} Regla creada/actualizada
   */
  async manageContractTypeRule(contractTypeCode, ruleData) {
    try {
      // Validar que el tipo de contrato existe
      const contractType =
        await this.contractTypeRepository.findByCode(contractTypeCode);
      if (!contractType) {
        throw createError(
          "CONTRACT_TYPE_NOT_FOUND",
          `Tipo de contrato no encontrado: ${contractTypeCode}`,
          404
        );
      }

      // Validar datos de la regla
      this._validateRuleData(ruleData);

      // Verificar si ya existe una regla similar
      const existingRule = await this.contractTypeRuleRepository.findOne({
        contractTypeCode,
        ruleType: ruleData.ruleType,
        isActive: true,
      });

      if (existingRule) {
        // Actualizar regla existente
        const updated = await this.contractTypeRuleRepository.update(
          existingRule._id,
          ruleData
        );
        return updated;
      } else {
        // Crear nueva regla
        const created = await this.contractTypeRuleRepository.create({
          ...ruleData,
          contractTypeCode,
        });
        return created;
      }
    } catch (error) {
      if (error.status) throw error;
      throw createError(
        "RULE_MANAGEMENT_ERROR",
        `Error gestionando regla: ${error.message}`,
        500
      );
    }
  }

  /**
   * Sincronizar rangos de montos con tipos de contratación
   * @param {String} contractTypeCode - Código del tipo de contrato
   * @param {Array} rangeConfigs - Configuraciones de rangos
   * @returns {Promise<Array>} Rangos sincronizados
   */
  async synchronizeAmountRanges(contractTypeCode, rangeConfigs) {
    try {
      // Validar tipo de contrato
      const contractType =
        await this.contractTypeRepository.findByCode(contractTypeCode);
      if (!contractType) {
        throw createError(
          "CONTRACT_TYPE_NOT_FOUND",
          `Tipo de contrato no encontrado: ${contractTypeCode}`,
          404
        );
      }

      // Validar configuraciones de rangos
      this._validateRangeConfigs(rangeConfigs);

      // Desactivar rangos existentes
      await this.contractAmountRangeRepository.updateMany(
        { contractTypeCode, isActive: true },
        { isActive: false }
      );

      // Crear nuevos rangos
      const newRanges = [];
      for (const config of rangeConfigs) {
        const range = await this.contractAmountRangeRepository.create({
          ...config,
          contractTypeCode,
          isActive: true,
        });
        newRanges.push(range);
      }

      return newRanges;
    } catch (error) {
      if (error.status) throw error;
      throw createError(
        "RANGE_SYNC_ERROR",
        `Error sincronizando rangos: ${error.message}`,
        500
      );
    }
  }

  // ===== MÉTODOS DE FASES DE CONTRATACIÓN =====

  /**
   * Obtener documentos requeridos por fase y tipo de contratación
   * @param {String} contractTypeCode - Código del tipo de contrato
   * @param {String} phase - Fase de contratación
   * @returns {Promise<Array>} Lista de documentos requeridos
   */
  async getRequiredDocumentsByPhase(contractTypeCode, phase) {
    try {
      const contractType =
        await this.contractTypeRepository.findByCode(contractTypeCode);
      if (!contractType) {
        throw createError(
          "CONTRACT_TYPE_NOT_FOUND",
          `Tipo de contrato no encontrado: ${contractTypeCode}`,
          404
        );
      }

      // Mapeo de fases y documentos según LOSNCP
      const phaseDocuments = {
        preparatoria: [
          "certificacion_presupuestaria",
          "estudios_mercado",
          "terminos_referencia",
          "estudio_desagregacion",
          "resolucion_inicio",
          "autorizacion_contratar",
          "informe_necesidad",
        ],
        precontractual: [
          "pliegos",
          "preguntas_respuestas",
          "ofertas_propuestas",
          "informe_evaluacion",
          "convalidacion_errores",
          "adjudicacion",
          "resolucion_adjudicacion",
        ],
        contractual: [
          "contrato_firmado",
          "garantias",
          "cronograma_valorado",
          "planillas_avance",
          "actas_entrega_parcial",
          "informes_fiscalizacion",
          "ordenes_cambio",
          "multas_sanciones",
        ],
        pago: [
          "facturas",
          "planillas_pago",
          "retenciones_tributarias",
          "comprobantes_egreso",
          "autorizaciones_pago",
        ],
        recepcion: [
          "acta_entrega_definitiva",
          "informe_final_fiscalizacion",
          "liquidacion_contrato",
          "devolucion_garantias",
          "planos_as_built",
          "manuales_certificados",
        ],
      };

      const baseDocuments = phaseDocuments[phase] || [];

      // Personalizar según tipo de contrato
      const customDocuments = await this._getCustomDocuments(
        contractTypeCode,
        phase
      );

      return {
        phase,
        contractType: contractTypeCode,
        required: baseDocuments,
        optional: customDocuments.optional || [],
        conditional: customDocuments.conditional || [],
        metadata: {
          estimatedDuration: this._getPhaseEstimatedDuration(
            phase,
            contractTypeCode
          ),
          criticalPath: this._getPhaseCriticalPath(phase),
          responsibleParties: this._getPhaseResponsibleParties(phase),
        },
      };
    } catch (error) {
      if (error.status) throw error;
      throw createError(
        "PHASE_DOCUMENTS_ERROR",
        `Error obteniendo documentos de fase: ${error.message}`,
        500
      );
    }
  }

  // ===== MÉTODOS PRIVADOS DE UTILIDAD =====

  /**
   * Validar parámetros de contrato
   */
  _validateContractParameters(amount, contractObject) {
    if (!amount || amount <= 0) {
      throw createError("INVALID_AMOUNT", "El monto debe ser mayor a 0", 400);
    }

    const validObjects = ["bienes", "servicios", "obras", "consultoria"];
    if (!validObjects.includes(contractObject?.toLowerCase())) {
      throw createError(
        "INVALID_CONTRACT_OBJECT",
        `Tipo de objeto no válido. Debe ser: ${validObjects.join(", ")}`,
        400
      );
    }
  }

  /**
   * Obtener reglas aplicables
   */
  async _getApplicableRules(amount, contractObject, specialConditions) {
    return await this.contractTypeRuleRepository.findApplicableRules({
      amount,
      contractObject: contractObject.toLowerCase(),
      specialConditions,
    });
  }

  /**
   * Calcular prioridad de tipo
   */
  _calculateTypePriority(type, rules, amount) {
    let priority = type.displayOrder || 0;

    // Ajustar prioridad según reglas
    if (rules.length > 0) {
      const avgRulePriority =
        rules.reduce((sum, rule) => sum + (rule.priority || 0), 0) /
        rules.length;
      priority += avgRulePriority;
    }

    return priority;
  }

  /**
   * Obtener uso recomendado
   */
  _getRecommendedUse(type, amount, contractObject) {
    if (type.category === "especial") return "Casos especiales según normativa";
    if (amount < 5000) return "Adquisiciones de bajo monto";
    if (amount > 500000) return "Adquisiciones de alto valor";
    return "Adquisiciones estándar";
  }

  /**
   * Obtener tiempo estimado
   */
  _getEstimatedTimeframe(type) {
    const timeframes = {
      INFC: 1, // Ínfima cuantía
      MENC: 15, // Menor cuantía
      COTI: 30, // Cotización
      LICT: 60, // Licitación
      SUBE: 45, // Subasta electrónica
      CONS: 90, // Consultoría
      EMRG: 7, // Emergencia
    };
    return timeframes[type.code] || 30;
  }

  /**
   * Obtener nivel de complejidad
   */
  _getComplexityLevel(type) {
    const complexity = {
      INFC: "Muy Baja",
      MENC: "Baja",
      COTI: "Media",
      LICT: "Alta",
      SUBE: "Media",
      CONS: "Muy Alta",
      EMRG: "Baja",
    };
    return complexity[type.code] || "Media";
  }

  /**
   * Validar datos de regla
   */
  _validateRuleData(ruleData) {
    if (!ruleData.name || ruleData.name.trim().length < 3) {
      throw createError("INVALID_RULE_NAME", "Nombre de regla inválido", 400);
    }
    if (!ruleData.ruleType) {
      throw createError("MISSING_RULE_TYPE", "Tipo de regla requerido", 400);
    }
  }

  /**
   * Validar configuraciones de rangos
   */
  _validateRangeConfigs(rangeConfigs) {
    if (!Array.isArray(rangeConfigs) || rangeConfigs.length === 0) {
      throw createError(
        "INVALID_RANGE_CONFIGS",
        "Configuraciones de rango inválidas",
        400
      );
    }

    for (const config of rangeConfigs) {
      if (!config.contractObject || !config.minAmount) {
        throw createError(
          "INCOMPLETE_RANGE_CONFIG",
          "Configuración de rango incompleta",
          400
        );
      }
    }
  }

  /**
   * Validar recomendación
   */
  async _validateRecommendation(type, amount, contractObject, context) {
    const validations = [];

    // Validar monto vs límites del tipo
    if (type.amountLimits && type.amountLimits[contractObject]) {
      const limits = type.amountLimits[contractObject];
      if (limits.min && amount < limits.min) {
        validations.push({
          type: "warning",
          message: `Monto menor al límite mínimo para ${type.name}`,
        });
      }
      if (limits.max && amount > limits.max) {
        validations.push({
          type: "error",
          message: `Monto excede el límite máximo para ${type.name}`,
        });
      }
    }

    return validations;
  }

  /**
   * Obtener documentos requeridos básicos
   */
  async _getRequiredDocuments(contractTypeCode) {
    // Implementar lógica específica según tipo
    return ["certificacion_presupuestaria", "terminos_referencia"];
  }

  /**
   * Obtener hitos clave
   */
  _getKeyMilestones(type) {
    return [
      "Preparación de documentos",
      "Publicación",
      "Recepción de ofertas",
      "Evaluación",
      "Adjudicación",
      "Suscripción de contrato",
    ];
  }

  /**
   * Obtener documentos personalizados
   */
  async _getCustomDocuments(contractTypeCode, phase) {
    // Implementar lógica específica según tipo y fase
    return {
      optional: [],
      conditional: [],
    };
  }

  /**
   * Obtener duración estimada de fase
   */
  _getPhaseEstimatedDuration(phase, contractTypeCode) {
    const baseDurations = {
      preparatoria: 10,
      precontractual: 30,
      contractual: 90,
      pago: 15,
      recepcion: 10,
    };
    return baseDurations[phase] || 15;
  }

  /**
   * Obtener ruta crítica de fase
   */
  _getPhaseCriticalPath(phase) {
    const criticalPaths = {
      preparatoria: ["Certificación PAC", "Estudios de mercado", "TDR"],
      precontractual: ["Publicación", "Preguntas", "Evaluación"],
      contractual: ["Suscripción", "Garantías", "Ejecución"],
      pago: ["Facturación", "Verificación", "Autorización"],
      recepcion: ["Inspección final", "Acta", "Liquidación"],
    };
    return criticalPaths[phase] || [];
  }

  /**
   * Obtener responsables de fase
   */
  _getPhaseResponsibleParties(phase) {
    const responsibles = {
      preparatoria: ["Área requirente", "Área financiera"],
      precontractual: ["Comisión técnica", "Área jurídica"],
      contractual: ["Administrador de contrato", "Contratista"],
      pago: ["Área financiera", "Tesorería"],
      recepcion: ["Comisión de recepción", "Área requirente"],
    };
    return responsibles[phase] || [];
  }
}

export default new ContractConfigurationService();
