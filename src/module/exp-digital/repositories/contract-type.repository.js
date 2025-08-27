// =============================================================================
// src/module/exp-digital/repositories/contract-type.repository.js
// Repositorio especializado para gestión de tipos de contratación pública
// =============================================================================

import { Types } from "mongoose";
import { BaseRepository } from "../../core/base/repositories/base.repository.js";
import { ContractType } from "../models/contract-type.scheme.js";

export class ContractTypeRepository extends BaseRepository {
  constructor() {
    super(ContractType);
    this.setupContractTypeLookups();
  }

  /**
   * Configurar lookups específicos para tipos de contratación
   */
  setupContractTypeLookups() {
    // Como ContractType es un modelo de configuración, no necesita muchos lookups
    // Pero podríamos agregar lookups hacia estadísticas de uso o relaciones futuras
    this.contractTypeLookups = {
      // Futuro: lookup hacia estadísticas de uso
      usageStats: {
        from: "contracts",
        localField: "_id",
        foreignField: "contractType",
        as: "usage",
        pipeline: [
          { $match: { isActive: true } },
          {
            $group: {
              _id: null,
              totalContracts: { $sum: 1 },
              totalValue: { $sum: "$budget.estimatedValue" },
              avgValue: { $avg: "$budget.estimatedValue" },
            },
          },
        ],
      },
    };
  }

  // ===== MÉTODOS USANDO QUERY HELPERS DEL ESQUEMA =====

  /**
   * Buscar tipos de contratación por categoría - USA QUERY HELPER
   * ✅ MEJORA: Utiliza el query helper del esquema
   */
  async findByCategory(category, options = {}) {
    try {
      const { page = 1, limit = 10, includeInactive = false } = options;

      // ✅ Usar query helper del esquema
      let query = this.model.find().byCategory(category);

      if (!includeInactive) {
        query = query.where({ isActive: true });
      }

      query = query.sort({ displayOrder: 1, name: 1 });

      return await this.paginate(query, { page, limit });
    } catch (error) {
      throw new Error(`Error buscando tipos por categoría: ${error.message}`);
    }
  }

  /**
   * Buscar tipos que requieren publicación - USA QUERY HELPER
   * ✅ MEJORA: Utiliza el query helper del esquema
   */
  async findRequiringPublication(options = {}) {
    try {
      const { page = 1, limit = 10 } = options;

      // ✅ Usar query helper del esquema
      const query = this.model
        .find()
        .requiresPublication()
        .where({ isActive: true })
        .sort({ displayOrder: 1, name: 1 });

      return await this.paginate(query, { page, limit });
    } catch (error) {
      throw new Error(
        `Error buscando tipos que requieren publicación: ${error.message}`
      );
    }
  }

  // ===== MÉTODOS USANDO MÉTODOS ESTÁTICOS DEL ESQUEMA =====

  /**
   * Obtener tipos aplicables para un monto y objeto contractual - USA MÉTODO ESTÁTICO
   * ✅ MEJORA: Utiliza el método estático del esquema
   */
  async findForAmount(amount, contractObject = "goods", options = {}) {
    try {
      const { page = 1, limit = 10 } = options;

      // ✅ Usar método estático del esquema
      const applicableTypes = await this.model.findForAmount(
        amount,
        contractObject
      );

      // Si se requiere paginación, aplicarla manualmente
      if (page && limit) {
        const startIndex = (page - 1) * limit;
        const endIndex = page * limit;
        const paginatedTypes = applicableTypes.slice(startIndex, endIndex);

        return {
          docs: paginatedTypes,
          totalDocs: applicableTypes.length,
          limit: limit,
          totalPages: Math.ceil(applicableTypes.length / limit),
          page: page,
          pagingCounter: startIndex + 1,
          hasPrevPage: page > 1,
          hasNextPage: endIndex < applicableTypes.length,
          prevPage: page > 1 ? page - 1 : null,
          nextPage: endIndex < applicableTypes.length ? page + 1 : null,
        };
      }

      return applicableTypes;
    } catch (error) {
      throw new Error(`Error buscando tipos por monto: ${error.message}`);
    }
  }

  /**
   * Obtener lista ordenada de tipos activos - USA MÉTODO ESTÁTICO
   * ✅ MEJORA: Utiliza el método estático del esquema
   */
  async getActiveOrderedList() {
    try {
      // ✅ Usar método estático del esquema
      return await this.model.getActiveOrderedList();
    } catch (error) {
      throw new Error(`Error obteniendo lista ordenada: ${error.message}`);
    }
  }

  // ===== MÉTODOS ESPECÍFICOS DEL REPOSITORIO =====

  /**
   * Buscar tipo de contratación por código
   */
  async findByCode(code) {
    try {
      const contractType = await this.model.findOne({
        code: code.toUpperCase(),
        isActive: true,
      });

      return contractType;
    } catch (error) {
      throw new Error(`Error buscando tipo por código: ${error.message}`);
    }
  }

  /**
   * Verificar disponibilidad de código
   */
  async isCodeAvailable(code, excludeId = null) {
    try {
      const query = {
        code: code.toUpperCase(),
        isActive: true,
      };

      if (excludeId) {
        query._id = { $ne: excludeId };
      }

      const existingType = await this.model.findOne(query);
      return !existingType;
    } catch (error) {
      throw new Error(`Error verificando código: ${error.message}`);
    }
  }

  // ===== MÉTODOS CON CÁLCULOS DE MONTOS =====

  /**
   * Calcular monto de garantía requerida usando método del esquema
   * ✅ MEJORA: Utiliza el método del esquema para cálculos
   */
  async calculateRequiredInsurance(contractTypeId, contractValue) {
    try {
      const contractType = await this.findById(contractTypeId);
      if (!contractType) {
        throw new Error("Tipo de contratación no encontrado");
      }

      // ✅ Usar método del esquema
      return contractType.getRequiredInsuranceAmount(contractValue);
    } catch (error) {
      throw new Error(`Error calculando garantía: ${error.message}`);
    }
  }

  /**
   * Validar aplicabilidad de tipo para monto y objeto
   * ✅ MEJORA: Utiliza el método del esquema para validaciones
   */
  async validateApplicability(
    contractTypeId,
    amount,
    contractObject = "goods"
  ) {
    try {
      const contractType = await this.findById(contractTypeId);
      if (!contractType) {
        throw new Error("Tipo de contratación no encontrado");
      }

      // ✅ Usar método del esquema
      const isApplicable = contractType.isApplicableForAmount(
        amount,
        contractObject
      );

      if (!isApplicable) {
        const limits = contractType.amountLimits[contractObject];
        const min = limits?.min || 0;
        const max = limits?.max || "sin límite";

        throw new Error(
          `El monto ${amount} no es aplicable para ${contractObject}. ` +
            `Rango permitido: ${min} - ${max}`
        );
      }

      return {
        isApplicable: true,
        contractType: contractType,
        requiredInsurance: contractType.getRequiredInsuranceAmount(amount),
        procedureConfig: contractType.procedureConfig,
      };
    } catch (error) {
      throw new Error(`Error validando aplicabilidad: ${error.message}`);
    }
  }

  // ===== MÉTODOS DE BÚSQUEDA AVANZADA =====

  /**
   * Búsqueda avanzada de tipos de contratación
   */
  async findAdvanced(criteria, options = {}) {
    try {
      const {
        page = 1,
        limit = 10,
        sort = { displayOrder: 1, name: 1 },
      } = options;

      const {
        category,
        requiresPublication,
        requiresInsurance,
        minAmount,
        maxAmount,
        contractObject = "goods",
        searchText,
        isActive = true,
      } = criteria;

      // Construir query base
      let query = this.model.find();

      // Aplicar filtros usando query helpers cuando sea apropiado
      if (category) query = query.byCategory(category);
      if (requiresPublication) query = query.requiresPublication();

      // Filtros adicionales
      if (isActive !== undefined) {
        query = query.where({ isActive });
      }

      if (requiresInsurance !== undefined) {
        query = query.where({
          "procedureConfig.requiresInsurance": requiresInsurance,
        });
      }

      // Filtros por rango de montos (más complejo)
      if (minAmount !== undefined || maxAmount !== undefined) {
        const amountFilter = {};
        if (minAmount !== undefined) {
          amountFilter[`amountLimits.${contractObject}.min`] = {
            $lte: minAmount,
          };
        }
        if (maxAmount !== undefined) {
          amountFilter[`amountLimits.${contractObject}.max`] = {
            $gte: maxAmount,
          };
        }
        query = query.where(amountFilter);
      }

      if (searchText) {
        query = query.where({
          $text: { $search: searchText },
        });
      }

      // Aplicar ordenamiento
      query = query.sort(sort);

      return await this.paginate(query, { page, limit });
    } catch (error) {
      throw new Error(`Error en búsqueda avanzada: ${error.message}`);
    }
  }

  /**
   * Obtener tipos con estadísticas de uso
   */
  async findWithUsageStats(options = {}) {
    try {
      const { category, page = 1, limit = 10 } = options;

      const matchStage = { isActive: true };
      if (category) {
        matchStage.category = category.toUpperCase();
      }

      const pipeline = [
        { $match: matchStage },

        // Lookup para obtener estadísticas de uso desde contratos
        {
          $lookup: {
            from: "contracts",
            localField: "_id",
            foreignField: "contractType",
            as: "contracts",
            pipeline: [
              { $match: { isActive: true } },
              {
                $group: {
                  _id: null,
                  totalContracts: { $sum: 1 },
                  totalValue: { $sum: "$budget.estimatedValue" },
                  avgValue: { $avg: "$budget.estimatedValue" },
                  maxValue: { $max: "$budget.estimatedValue" },
                  minValue: { $min: "$budget.estimatedValue" },
                },
              },
            ],
          },
        },

        // Proyectar datos enriquecidos
        {
          $project: {
            code: 1,
            name: 1,
            category: 1,
            description: 1,
            amountLimits: 1,
            procedureConfig: 1,
            displayOrder: 1,
            createdAt: 1,
            updatedAt: 1,
            usageStats: {
              $cond: {
                if: { $gt: [{ $size: "$contracts" }, 0] },
                then: { $arrayElemAt: ["$contracts", 0] },
                else: {
                  totalContracts: 0,
                  totalValue: 0,
                  avgValue: 0,
                  maxValue: 0,
                  minValue: 0,
                },
              },
            },
          },
        },

        // Ordenar
        { $sort: { displayOrder: 1, name: 1 } },
      ];

      return await this.aggregateWithPagination(pipeline, { page, limit });
    } catch (error) {
      throw new Error(
        `Error obteniendo tipos con estadísticas: ${error.message}`
      );
    }
  }

  // ===== MÉTODOS DE CONFIGURACIÓN Y REPORTE =====

  /**
   * Obtener configuración de procedimientos por categoría
   */
  async getProcedureConfigByCategory() {
    try {
      const pipeline = [
        { $match: { isActive: true } },
        {
          $group: {
            _id: "$category",
            types: {
              $push: {
                code: "$code",
                name: "$name",
                procedureConfig: "$procedureConfig",
                amountLimits: "$amountLimits",
              },
            },
            avgPublicationDays: { $avg: "$procedureConfig.publicationDays" },
            avgEvaluationDays: { $avg: "$procedureConfig.evaluationDays" },
            requiresInsuranceCount: {
              $sum: {
                $cond: ["$procedureConfig.requiresInsurance", 1, 0],
              },
            },
            totalCount: { $sum: 1 },
          },
        },
        {
          $project: {
            category: "$_id",
            types: 1,
            avgPublicationDays: { $round: ["$avgPublicationDays", 1] },
            avgEvaluationDays: { $round: ["$avgEvaluationDays", 1] },
            requiresInsurancePercentage: {
              $round: [
                {
                  $multiply: [
                    { $divide: ["$requiresInsuranceCount", "$totalCount"] },
                    100,
                  ],
                },
                1,
              ],
            },
            totalCount: 1,
          },
        },
        { $sort: { category: 1 } },
      ];

      return await this.model.aggregate(pipeline);
    } catch (error) {
      throw new Error(
        `Error obteniendo configuración por categoría: ${error.message}`
      );
    }
  }

  /**
   * Generar reporte de límites de montos
   */
  async getAmountLimitsReport(contractObject = "goods") {
    try {
      const pipeline = [
        { $match: { isActive: true } },
        {
          $project: {
            code: 1,
            name: 1,
            category: 1,
            minLimit: `$amountLimits.${contractObject}.min`,
            maxLimit: `$amountLimits.${contractObject}.max`,
            hasLimits: {
              $or: [
                { $gt: [`$amountLimits.${contractObject}.min`, 0] },
                { $ne: [`$amountLimits.${contractObject}.max`, null] },
              ],
            },
          },
        },
        { $sort: { minLimit: 1, name: 1 } },
      ];

      return await this.model.aggregate(pipeline);
    } catch (error) {
      throw new Error(`Error generando reporte de límites: ${error.message}`);
    }
  }

  // ===== VALIDACIONES ESPECÍFICAS =====

  /**
   * Validar datos antes de crear tipo de contratación
   */
  async validateBeforeCreate(data) {
    const errors = [];

    // Validar unicidad de código
    if (data.code) {
      const isAvailable = await this.isCodeAvailable(data.code);
      if (!isAvailable) {
        errors.push("El código ya existe");
      }
    }

    // Validar límites de montos
    const objects = ["goods", "services", "works"];
    for (const obj of objects) {
      if (data.amountLimits && data.amountLimits[obj]) {
        const limits = data.amountLimits[obj];
        if (limits.min !== undefined && limits.max !== undefined) {
          if (limits.min > limits.max) {
            errors.push(
              `El monto mínimo no puede ser mayor al máximo para ${obj}`
            );
          }
        }
      }
    }

    // Validar porcentajes
    if (data.procedureConfig && data.procedureConfig.insurancePercentage) {
      const percentage = data.procedureConfig.insurancePercentage;
      if (percentage < 0 || percentage > 100) {
        errors.push("El porcentaje de garantía debe estar entre 0 y 100");
      }
    }

    if (errors.length > 0) {
      throw new Error(`Validación fallida: ${errors.join(", ")}`);
    }

    return true;
  }

  /**
   * Crear tipo de contratación con validaciones
   */
  async create(data, userData, options = {}) {
    try {
      await this.validateBeforeCreate(data);

      // Normalizar código a mayúsculas
      if (data.code) {
        data.code = data.code.toUpperCase().trim();
      }

      // Normalizar categoría
      if (data.category) {
        data.category = data.category.toUpperCase();
      }

      return await super.create(data, userData, options);
    } catch (error) {
      throw new Error(`Error creando tipo de contratación: ${error.message}`);
    }
  }

  /**
   * Actualizar con validaciones mejoradas
   */
  async update(id, data, userData, options = {}) {
    try {
      // Validar código si se está cambiando
      if (data.code && !(await this.isCodeAvailable(data.code, id))) {
        throw new Error("El código ya existe");
      }

      // Normalizar campos
      if (data.code) {
        data.code = data.code.toUpperCase().trim();
      }

      if (data.category) {
        data.category = data.category.toUpperCase();
      }

      return await super.update(id, data, userData, options);
    } catch (error) {
      throw new Error(
        `Error actualizando tipo de contratación: ${error.message}`
      );
    }
  }
}

export default new ContractTypeRepository();
