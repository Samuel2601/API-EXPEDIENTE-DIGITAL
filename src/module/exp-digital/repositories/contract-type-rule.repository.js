import { Types } from "mongoose";
import { BaseRepository } from "../../core/base/repositories/base.repository.js";
import { ContractTypeRule } from "../models/contract-type-rule.schema.js";

export class ContractTypeRuleRepository extends BaseRepository {
  constructor() {
    super(ContractTypeRule);
  }

  /**
   * Buscar reglas por código de tipo de contratación
   * @param {String} contractTypeCode - Código del tipo
   * @param {Boolean} isActive - Filtro por estado activo
   * @returns {Promise<Array>} Lista de reglas
   */
  async findByContractTypeCode(contractTypeCode, isActive = true) {
    return await this.model
      .find({
        contractTypeCode,
        isActive,
        $or: [{ validUntil: null }, { validUntil: { $gte: new Date() } }],
      })
      .sort({ priority: 1 });
  }

  /**
   * Buscar reglas por tipo de regla
   * @param {String} ruleType - Tipo de regla
   * @param {Boolean} isActive - Filtro por estado activo
   * @returns {Promise<Array>} Lista de reglas
   */
  async findByRuleType(ruleType, isActive = true) {
    return await this.model
      .find({
        ruleType,
        isActive,
        $or: [{ validUntil: null }, { validUntil: { $gte: new Date() } }],
      })
      .sort({ priority: 1 });
  }

  /**
   * Buscar reglas siempre disponibles (procedimientos especiales)
   * @returns {Promise<Array>} Reglas siempre disponibles
   */
  async findAlwaysAvailableRules() {
    return await this.model
      .find({
        isAlwaysAvailable: true,
        isActive: true,
        $or: [{ validUntil: null }, { validUntil: { $gte: new Date() } }],
      })
      .sort({ priority: 1 });
  }

  /**
   * Buscar reglas aplicables para parámetros específicos
   * @param {Object} params - Parámetros de búsqueda
   * @param {Number} params.amount - Monto del contrato
   * @param {String} params.contractObject - Tipo de objeto
   * @param {Object} params.specialConditions - Condiciones especiales
   * @returns {Promise<Array>} Reglas aplicables
   */
  async findApplicableRules(params) {
    const { amount, contractObject, specialConditions = {} } = params;

    // Construir query base
    const query = {
      isActive: true,
      $or: [{ validUntil: null }, { validUntil: { $gte: new Date() } }],
    };

    // Buscar todas las reglas activas
    const allRules = await this.model.find(query).sort({ priority: 1 });

    // Filtrar reglas aplicables usando el método del modelo
    const applicableRules = [];
    for (const rule of allRules) {
      if (rule.evaluateRule(params)) {
        applicableRules.push(rule);
      }
    }

    return applicableRules;
  }

  /**
   * Buscar reglas por objeto de contratación
   * @param {String} contractObject - Tipo de objeto
   * @param {Boolean} isActive - Filtro por estado activo
   * @returns {Promise<Array>} Lista de reglas
   */
  async findByContractObject(contractObject, isActive = true) {
    return await this.model
      .find({
        "conditions.contractObjects": { $in: [contractObject, "todos"] },
        isActive,
        $or: [{ validUntil: null }, { validUntil: { $gte: new Date() } }],
      })
      .sort({ priority: 1 });
  }

  /**
   * Buscar reglas que requieren autorización especial
   * @param {Boolean} isActive - Filtro por estado activo
   * @returns {Promise<Array>} Reglas que requieren autorización especial
   */
  async findRequiringSpecialAuthorization(isActive = true) {
    return await this.model
      .find({
        requiresSpecialAuthorization: true,
        isActive,
        $or: [{ validUntil: null }, { validUntil: { $gte: new Date() } }],
      })
      .sort({ priority: 1 });
  }

  /**
   * Obtener estadísticas de uso de reglas
   * @returns {Promise<Array>} Estadísticas por tipo de regla
   */
  async getUsageStatistics() {
    return await this.model.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: {
            ruleType: "$ruleType",
            contractTypeCode: "$contractTypeCode",
          },
          count: { $sum: 1 },
          alwaysAvailable: { $sum: { $cond: ["$isAlwaysAvailable", 1, 0] } },
          requiresAuth: {
            $sum: { $cond: ["$requiresSpecialAuthorization", 1, 0] },
          },
        },
      },
      { $sort: { count: -1 } },
    ]);
  }

  /**
   * Buscar reglas próximas a vencer
   * @param {Number} days - Días antes del vencimiento
   * @returns {Promise<Array>} Reglas próximas a vencer
   */
  async findExpiringRules(days = 30) {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    return await this.model
      .find({
        isActive: true,
        validUntil: {
          $ne: null,
          $lte: futureDate,
          $gte: new Date(),
        },
      })
      .sort({ validUntil: 1 });
  }

  /**
   * Validar reglas para un tipo de contratación
   * @param {String} contractTypeCode - Código del tipo
   * @returns {Promise<Object>} Resultado de la validación
   */
  async validateRulesForContractType(contractTypeCode) {
    const rules = await this.findByContractTypeCode(contractTypeCode);

    const validation = {
      isValid: true,
      errors: [],
      warnings: [],
      ruleCount: rules.length,
    };

    // Verificar que exista al menos una regla
    if (rules.length === 0) {
      validation.isValid = false;
      validation.errors.push(
        "No existen reglas definidas para este tipo de contratación"
      );
    }

    // Verificar conflictos en rangos de montos
    const amountRules = rules.filter(
      (rule) =>
        rule.conditions.amountRanges && rule.conditions.amountRanges.length > 0
    );

    for (let i = 0; i < amountRules.length; i++) {
      for (let j = i + 1; j < amountRules.length; j++) {
        const rule1 = amountRules[i];
        const rule2 = amountRules[j];

        // Verificar solapamientos (lógica simplificada)
        // En implementación real, se necesitaría lógica más compleja
        if (
          this._rangesOverlap(
            rule1.conditions.amountRanges,
            rule2.conditions.amountRanges
          )
        ) {
          validation.warnings.push(
            `Posible solapamiento entre reglas ${rule1.name} y ${rule2.name}`
          );
        }
      }
    }

    return validation;
  }

  /**
   * Método auxiliar para verificar solapamiento de rangos
   * @private
   */
  _rangesOverlap(ranges1, ranges2) {
    // Implementación simplificada
    // En implementación real, se necesitaría lógica más robusta
    return false;
  }

  /**
   * Buscar reglas con paginación
   * @param {Object} filter - Filtros de búsqueda
   * @param {Object} options - Opciones de paginación
   * @returns {Promise<Object>} Resultado paginado
   */
  async findWithPagination(filter = {}, options = {}) {
    const {
      page = 1,
      limit = 10,
      sortBy = "priority",
      sortOrder = "asc",
    } = options;

    const query = this.model.find(filter);
    const sortOption = { [sortBy]: sortOrder === "asc" ? 1 : -1 };

    return await this.paginate(query, { page, limit, sort: sortOption });
  }

  /**
   * Buscar reglas por múltiples tipos de regla
   * @param {Array} ruleTypes - Tipos de regla
   * @param {Boolean} isActive - Filtro por estado activo
   * @returns {Promise<Array>} Lista de reglas
   */
  async findByMultipleRuleTypes(ruleTypes, isActive = true) {
    return await this.model
      .find({
        ruleType: { $in: ruleTypes },
        isActive,
        $or: [{ validUntil: null }, { validUntil: { $gte: new Date() } }],
      })
      .sort({ ruleType: 1, priority: 1 });
  }

  /**
   * Desactivar reglas por tipo de contratación
   * @param {String} contractTypeCode - Código del tipo
   * @returns {Promise<Object>} Resultado de la operación
   */
  async deactivateByContractType(contractTypeCode) {
    return await this.model.updateMany(
      {
        contractTypeCode,
        isActive: true,
      },
      {
        $set: {
          isActive: false,
          updatedAt: new Date(),
        },
      }
    );
  }

  /**
   * Buscar reglas que aplican para un monto específico
   * @param {String} contractObject - Tipo de objeto
   * @param {Number} amount - Monto del contrato
   * @returns {Promise<Array>} Reglas aplicables
   */
  async findRulesByAmount(contractObject, amount) {
    return await this.model
      .find({
        "conditions.contractObjects": { $in: [contractObject, "todos"] },
        isActive: true,
        $or: [{ validUntil: null }, { validUntil: { $gte: new Date() } }],
        $or: [
          { "conditions.amountRanges": { $size: 0 } },
          {
            "conditions.amountRanges": {
              $elemMatch: {
                $or: [
                  { contractObject: contractObject },
                  { contractObject: { $exists: false } },
                  { contractObject: "" },
                ],
                minAmount: { $lte: amount },
                $or: [
                  { maxAmount: null },
                  { maxAmount: { $exists: false } },
                  { maxAmount: { $gte: amount } },
                ],
              },
            },
          },
        ],
      })
      .sort({ priority: 1 });
  }
}

export default ContractTypeRuleRepository;
