const ContractTypeRepository = require("../repositories/contract-type.repository");
const ContractAmountRangeRepository = require("../repositories/contract-amount-range.repository");
const ContractTypeRuleRepository = require("../repositories/contract-type-rule.repository");
const { createError } = require("../../../utils/error.util");
const { validateObjectId } = require("../../../utils/validation.util");

class ContractTypeService {
  constructor() {
    this.contractTypeRepository = new ContractTypeRepository();
    this.contractAmountRangeRepository = new ContractAmountRangeRepository();
    this.contractTypeRuleRepository = new ContractTypeRuleRepository();
  }

  /**
   * Crear un nuevo tipo de contratación
   * @param {Object} contractTypeData - Datos del tipo de contratación
   * @returns {Promise<Object>} Tipo de contratación creado
   */
  async createContractType(contractTypeData) {
    try {
      // Validar datos requeridos
      this._validateContractTypeData(contractTypeData);

      // Verificar si ya existe un tipo con el mismo código
      const existingType = await this.contractTypeRepository.findByCode(
        contractTypeData.code
      );
      if (existingType) {
        throw createError(
          "DUPLICATE_CONTRACT_TYPE",
          `Ya existe un tipo de contratación con el código: ${contractTypeData.code}`,
          409
        );
      }

      // Crear el tipo de contratación
      const contractType =
        await this.contractTypeRepository.create(contractTypeData);
      return contractType;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Obtener todos los tipos de contratación
   * @param {Object} filters - Filtros opcionales
   * @returns {Promise<Array>} Lista de tipos de contratación
   */
  async getAllContractTypes(filters = {}) {
    try {
      const contractTypes = await this.contractTypeRepository.findAll(filters);
      return contractTypes;
    } catch (error) {
      throw createError(
        "FETCH_ERROR",
        "Error al obtener los tipos de contratación",
        500
      );
    }
  }

  /**
   * Obtener tipos de contratación por categoría (común/especial)
   * @param {String} category - Categoría del procedimiento
   * @returns {Promise<Array>} Lista de tipos por categoría
   */
  async getContractTypesByCategory(category) {
    try {
      if (!["comun", "especial"].includes(category.toLowerCase())) {
        throw createError(
          "INVALID_CATEGORY",
          'La categoría debe ser "comun" o "especial"',
          400
        );
      }

      const contractTypes =
        await this.contractTypeRepository.findByCategory(category);
      return contractTypes;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Obtener un tipo de contratación por ID
   * @param {String} id - ID del tipo de contratación
   * @returns {Promise<Object>} Tipo de contratación encontrado
   */
  async getContractTypeById(id) {
    try {
      validateObjectId(id);

      const contractType = await this.contractTypeRepository.findById(id);
      if (!contractType) {
        throw createError(
          "NOT_FOUND",
          "Tipo de contratación no encontrado",
          404
        );
      }

      return contractType;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Obtener un tipo de contratación por código
   * @param {String} code - Código del tipo de contratación
   * @returns {Promise<Object>} Tipo de contratación encontrado
   */
  async getContractTypeByCode(code) {
    try {
      if (!code) {
        throw createError("MISSING_CODE", "El código es requerido", 400);
      }

      const contractType = await this.contractTypeRepository.findByCode(code);
      if (!contractType) {
        throw createError(
          "NOT_FOUND",
          "Tipo de contratación no encontrado",
          404
        );
      }

      return contractType;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Actualizar un tipo de contratación
   * @param {String} id - ID del tipo de contratación
   * @param {Object} updateData - Datos a actualizar
   * @returns {Promise<Object>} Tipo de contratación actualizado
   */
  async updateContractType(id, updateData) {
    try {
      validateObjectId(id);

      // Verificar que existe
      const existingType = await this.getContractTypeById(id);

      // Si se actualiza el código, verificar que no exista otro con ese código
      if (updateData.code && updateData.code !== existingType.code) {
        const duplicateType = await this.contractTypeRepository.findByCode(
          updateData.code
        );
        if (duplicateType) {
          throw createError(
            "DUPLICATE_CONTRACT_TYPE",
            `Ya existe un tipo de contratación con el código: ${updateData.code}`,
            409
          );
        }
      }

      const updatedType = await this.contractTypeRepository.update(
        id,
        updateData
      );
      return updatedType;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Eliminar un tipo de contratación
   * @param {String} id - ID del tipo de contratación
   * @returns {Promise<Boolean>} Resultado de la eliminación
   */
  async deleteContractType(id) {
    try {
      validateObjectId(id);

      // Verificar que existe
      const contractType = await this.getContractTypeById(id);

      // Verificar que no esté siendo usado en rangos de monto o reglas activas
      const [amountRanges, typeRules] = await Promise.all([
        this.contractAmountRangeRepository.findByContractTypeCode(
          contractType.code
        ),
        this.contractTypeRuleRepository.findByContractTypeCode(
          contractType.code
        ),
      ]);

      if (amountRanges.length > 0 || typeRules.length > 0) {
        throw createError(
          "CONTRACT_TYPE_IN_USE",
          "No se puede eliminar el tipo de contratación porque está siendo utilizado en rangos o reglas activas",
          409
        );
      }

      const deleted = await this.contractTypeRepository.delete(id);
      return deleted;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Obtener tipos de contratación aplicables según monto y tipo de bien/servicio
   * @param {Number} amount - Monto del contrato
   * @param {String} contractObject - Tipo de objeto (bienes, servicios, obras, consultoria)
   * @param {Object} specialConditions - Condiciones especiales opcionales
   * @returns {Promise<Array>} Tipos de contratación aplicables
   */
  async getApplicableContractTypes(
    amount,
    contractObject,
    specialConditions = {}
  ) {
    try {
      if (!amount || amount <= 0) {
        throw createError("INVALID_AMOUNT", "El monto debe ser mayor a 0", 400);
      }

      if (!contractObject) {
        throw createError(
          "MISSING_CONTRACT_OBJECT",
          "El tipo de objeto es requerido",
          400
        );
      }

      const validObjects = ["bienes", "servicios", "obras", "consultoria"];
      if (!validObjects.includes(contractObject.toLowerCase())) {
        throw createError(
          "INVALID_CONTRACT_OBJECT",
          `Tipo de objeto no válido. Debe ser: ${validObjects.join(", ")}`,
          400
        );
      }

      // Buscar reglas aplicables usando el nuevo sistema dinámico
      const applicableRules =
        await this.contractTypeRuleRepository.findApplicableRules({
          amount,
          contractObject: contractObject.toLowerCase(),
          specialConditions,
        });

      // Obtener los tipos de contratación correspondientes
      const contractTypeCodes = [
        ...new Set(applicableRules.map((rule) => rule.contractTypeCode)),
      ];

      const contractTypes = [];
      for (const code of contractTypeCodes) {
        try {
          const contractType =
            await this.contractTypeRepository.findByCode(code);
          if (contractType && contractType.isActive) {
            // Agregar metadatos de la regla aplicable
            const rule = applicableRules.find(
              (r) => r.contractTypeCode === code
            );
            contractType.ruleMetadata = {
              priority: rule.priority,
              requiresSpecialAuthorization: rule.requiresSpecialAuthorization,
              metadata: rule.metadata,
              legalReference: rule.legalReference,
            };
            contractTypes.push(contractType);
          }
        } catch (error) {
          // Log error pero continúa con otros tipos
          console.warn(
            `Error al obtener tipo de contratación con código ${code}:`,
            error.message
          );
        }
      }

      // Ordenar por prioridad
      contractTypes.sort((a, b) => {
        const priorityA = a.ruleMetadata?.priority || 999;
        const priorityB = b.ruleMetadata?.priority || 999;
        return priorityA - priorityB;
      });

      return contractTypes;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Validar si un tipo de contratación es aplicable para un monto y objeto específico
   * @param {String} contractTypeCode - Código del tipo de contratación
   * @param {Number} amount - Monto del contrato
   * @param {String} contractObject - Tipo de objeto
   * @param {Object} specialConditions - Condiciones especiales opcionales
   * @returns {Promise<Object>} Resultado de la validación
   */
  async validateContractTypeApplicability(
    contractTypeCode,
    amount,
    contractObject,
    specialConditions = {}
  ) {
    try {
      const contractType = await this.getContractTypeByCode(contractTypeCode);

      // Buscar reglas específicas para este tipo
      const typeRules =
        await this.contractTypeRuleRepository.findByContractTypeCode(
          contractTypeCode
        );

      let isApplicable = false;
      let applicableRule = null;
      let validationDetails = [];

      // Evaluar cada regla
      for (const rule of typeRules) {
        const ruleApplies = rule.evaluateRule({
          amount,
          contractObject: contractObject.toLowerCase(),
          specialConditions,
        });

        if (ruleApplies) {
          isApplicable = true;
          applicableRule = rule;
          break;
        }

        // Recopilar detalles de validación para debugging
        validationDetails.push({
          ruleName: rule.name,
          ruleType: rule.ruleType,
          applies: ruleApplies,
          reason: this._getRuleValidationReason(rule, {
            amount,
            contractObject,
            specialConditions,
          }),
        });
      }

      return {
        isApplicable,
        contractType,
        applicableRule: applicableRule
          ? {
              name: applicableRule.name,
              ruleType: applicableRule.ruleType,
              priority: applicableRule.priority,
              requiresSpecialAuthorization:
                applicableRule.requiresSpecialAuthorization,
              metadata: applicableRule.metadata,
              legalReference: applicableRule.legalReference,
            }
          : null,
        validationDetails,
        message: isApplicable
          ? "Tipo de contratación válido para los parámetros especificados"
          : "Tipo de contratación no aplicable para los parámetros especificados",
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Obtener rangos de monto para un tipo de objeto
   * @param {String} contractObject - Tipo de objeto
   * @returns {Promise<Array>} Rangos de monto aplicables
   */
  async getAmountRangesForObject(contractObject) {
    try {
      if (!contractObject) {
        throw createError(
          "MISSING_CONTRACT_OBJECT",
          "El tipo de objeto es requerido",
          400
        );
      }

      const ranges =
        await this.contractAmountRangeRepository.findByContractObject(
          contractObject.toLowerCase()
        );
      return ranges;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Activar/Desactivar un tipo de contratación
   * @param {String} id - ID del tipo de contratación
   * @param {Boolean} isActive - Estado activo/inactivo
   * @returns {Promise<Object>} Tipo de contratación actualizado
   */
  async toggleContractTypeStatus(id, isActive) {
    try {
      validateObjectId(id);

      const updatedType = await this.contractTypeRepository.update(id, {
        isActive,
        updatedAt: new Date(),
      });

      return updatedType;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Obtener estadísticas de tipos de contratación
   * @returns {Promise<Object>} Estadísticas de uso
   */
  async getContractTypeStatistics() {
    try {
      const [totalTypes, activeTypes, typesByCategory, rulesStatistics] =
        await Promise.all([
          this.contractTypeRepository.count(),
          this.contractTypeRepository.count({ isActive: true }),
          this.contractTypeRepository.findAll().then((types) =>
            types.reduce((acc, type) => {
              acc[type.category] = (acc[type.category] || 0) + 1;
              return acc;
            }, {})
          ),
          this.contractTypeRuleRepository.getUsageStatistics(),
        ]);

      return {
        totalTypes,
        activeTypes,
        inactiveTypes: totalTypes - activeTypes,
        typesByCategory,
        rulesStatistics,
      };
    } catch (error) {
      throw createError(
        "STATISTICS_ERROR",
        "Error al obtener estadísticas",
        500
      );
    }
  }

  /**
   * Obtener configuración completa de contratación
   * @returns {Promise<Object>} Configuración completa
   */
  async getContractConfiguration() {
    try {
      const [contractTypes, amountRangesGrouped, alwaysAvailableRules] =
        await Promise.all([
          this.contractTypeRepository.findAll({ isActive: true }),
          this.contractAmountRangeRepository.findAllGroupedByObject(),
          this.contractTypeRuleRepository.findAlwaysAvailableRules(),
        ]);

      return {
        contractTypes,
        amountRanges: amountRangesGrouped,
        specialProcedures: alwaysAvailableRules,
        lastUpdated: new Date(),
      };
    } catch (error) {
      throw createError("CONFIG_ERROR", "Error al obtener configuración", 500);
    }
  }

  /**
   * Validar datos del tipo de contratación
   * @private
   * @param {Object} contractTypeData - Datos a validar
   */
  _validateContractTypeData(contractTypeData) {
    const requiredFields = ["name", "code", "category"];
    const missingFields = requiredFields.filter(
      (field) => !contractTypeData[field]
    );

    if (missingFields.length > 0) {
      throw createError(
        "MISSING_FIELDS",
        `Campos requeridos faltantes: ${missingFields.join(", ")}`,
        400
      );
    }

    // Validar categoría
    if (
      !["comun", "especial"].includes(contractTypeData.category.toLowerCase())
    ) {
      throw createError(
        "INVALID_CATEGORY",
        'La categoría debe ser "comun" o "especial"',
        400
      );
    }

    // Validar código (solo letras, números y guiones bajos)
    const codeRegex = /^[A-Z0-9_]+$/;
    if (!codeRegex.test(contractTypeData.code)) {
      throw createError(
        "INVALID_CODE",
        "El código solo puede contener letras mayúsculas, números y guiones bajos",
        400
      );
    }
  }

  /**
   * Obtener razón de validación de regla
   * @private
   * @param {Object} rule - Regla a evaluar
   * @param {Object} params - Parámetros de evaluación
   * @returns {String} Razón de la validación
   */
  _getRuleValidationReason(rule, params) {
    const { amount, contractObject, specialConditions } = params;

    if (rule.isAlwaysAvailable) {
      return "Procedimiento siempre disponible";
    }

    // Verificar objeto de contrato
    if (
      rule.conditions.contractObjects &&
      rule.conditions.contractObjects.length > 0
    ) {
      if (
        !rule.conditions.contractObjects.includes("todos") &&
        !rule.conditions.contractObjects.includes(contractObject)
      ) {
        return `No aplica para objeto de tipo: ${contractObject}`;
      }
    }

    // Verificar rangos de monto
    if (
      rule.conditions.amountRanges &&
      rule.conditions.amountRanges.length > 0
    ) {
      const applicableRange = rule.conditions.amountRanges.find(
        (range) =>
          range.contractObject === contractObject || !range.contractObject
      );

      if (applicableRange) {
        if (amount < applicableRange.minAmount) {
          return `Monto ${amount} menor al mínimo requerido: ${applicableRange.minAmount}`;
        }
        if (
          applicableRange.maxAmount !== null &&
          applicableRange.maxAmount !== undefined &&
          amount > applicableRange.maxAmount
        ) {
          return `Monto ${amount} mayor al máximo permitido: ${applicableRange.maxAmount}`;
        }
      }
    }

    return "Regla aplicable";
  }
}

module.exports = ContractTypeService;
