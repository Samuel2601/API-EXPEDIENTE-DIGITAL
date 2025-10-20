// =============================================================================
// src/module/exp-digital/repositories/contract.repository.js - MEJORADO
// Repositorio especializado para gestión de contratos de contratación pública
// =============================================================================

import { Types } from "mongoose";
import { BaseRepository } from "../../core/base/repositories/base.repository.js";
import { Contract } from "../models/contract.scheme.js";

export class ContractRepository extends BaseRepository {
  constructor() {
    super(Contract);
    this.setupContractLookups();
  }

  /**
   * Configurar lookups específicos para contratos
   */
  setupContractLookups() {
    this.contractLookups = {
      contractType: {
        from: "contracttypes",
        localField: "contractType",
        foreignField: "_id",
        as: "contractTypeInfo",
        pipeline: [
          { $project: { code: 1, name: 1, category: 1, isActive: 1 } },
        ],
      },
      requestingDepartment: {
        from: "departments",
        localField: "requestingDepartment",
        foreignField: "_id",
        as: "departmentInfo",
        pipeline: [
          {
            $project: {
              code: 1,
              name: 1,
              shortName: 1,
              responsible: 1,
              isActive: 1,
            },
          },
        ],
      },
      currentPhase: {
        from: "contractphases",
        localField: "currentPhase",
        foreignField: "_id",
        as: "currentPhaseInfo",
        pipeline: [
          {
            $project: { code: 1, name: 1, shortName: 1, order: 1, category: 1 },
          },
        ],
      },
      phases: {
        from: "contractphases",
        localField: "phases.phase",
        foreignField: "_id",
        as: "phasesInfo",
        pipeline: [
          {
            $project: { code: 1, name: 1, shortName: 1, order: 1, category: 1 },
          },
        ],
      },
    };
  }

  // ===== MÉTODOS USANDO QUERY HELPERS DEL ESQUEMA =====

  /**
   * Buscar contratos por estado - USA QUERY HELPER
   * ✅ MEJORA: Utiliza el query helper del esquema
   */
  async findByStatus(status, options = {}) {
    try {
      const { page = 1, limit = 10, includePopulation = true } = options;

      // ✅ Usar query helper del esquema
      let query = this.model.find().byStatus(status);

      if (includePopulation) {
        query = query.populate([
          { path: "contractType", select: "code name category" },
          { path: "requestingDepartment", select: "code name shortName" },
          { path: "currentPhase", select: "code name shortName order" },
        ]);
      }

      return await this.model.paginate(query, { page, limit });
    } catch (error) {
      throw new Error(`Error buscando contratos por estado: ${error.message}`);
    }
  }

  /**
   * Buscar contratos por departamento - USA QUERY HELPER
   */
  async findByDepartment(departmentId, options = {}) {
    try {
      const { page = 1, limit = 10, status } = options;

      // ✅ Usar query helper del esquema
      let query = this.model.find().byDepartment(departmentId);

      if (status) {
        query = query.byStatus(status); // Combinar query helpers
      }

      query = query
        .populate([
          { path: "contractType", select: "code name category" },
          { path: "currentPhase", select: "code name shortName order" },
        ])
        .sort({ createdAt: -1 });

      return await this.model.paginate(query, { page, limit });
    } catch (error) {
      throw new Error(
        `Error buscando contratos por departamento: ${error.message}`
      );
    }
  }

  /**
   * Buscar contratos por tipo - USA QUERY HELPER
   */
  async findByContractType(contractTypeId, options = {}) {
    try {
      const { page = 1, limit = 10, status } = options;

      // ✅ Usar query helper del esquema
      let query = this.model.find().byContractType(contractTypeId);

      if (status) {
        query = query.byStatus(status);
      }

      query = query
        .populate([
          { path: "requestingDepartment", select: "code name shortName" },
          { path: "currentPhase", select: "code name shortName order" },
        ])
        .sort({ createdAt: -1 });

      return await this.model.paginate(query, { page, limit });
    } catch (error) {
      throw new Error(`Error buscando contratos por tipo: ${error.message}`);
    }
  }

  /**
   * Buscar contratos vencidos - USA QUERY HELPER
   */
  async findOverdue(options = {}) {
    try {
      const { page = 1, limit = 10 } = options;

      // ✅ Usar query helper del esquema
      const query = this.model
        .find()
        .overdue()
        .populate([
          { path: "contractType", select: "code name category" },
          { path: "requestingDepartment", select: "code name shortName" },
        ])
        .sort({ "timeline.executionEndDate": 1 });

      return await this.model.paginate(query, { page, limit });
    } catch (error) {
      throw new Error(`Error buscando contratos vencidos: ${error.message}`);
    }
  }

  /**
   * Buscar contratos en progreso - USA QUERY HELPER
   */
  async findInProgress(options = {}) {
    try {
      const { page = 1, limit = 10 } = options;

      // ✅ Usar query helper del esquema
      const query = this.model
        .find()
        .inProgress()
        .populate([
          { path: "contractType", select: "code name category" },
          { path: "requestingDepartment", select: "code name shortName" },
          { path: "currentPhase", select: "code name shortName order" },
        ])
        .sort({ createdAt: -1 });

      return await this.model.paginate(query, { page, limit });
    } catch (error) {
      throw new Error(`Error buscando contratos en progreso: ${error.message}`);
    }
  }

  // ===== MÉTODOS USANDO MÉTODOS ESTÁTICOS DEL ESQUEMA =====

  /**
   * Buscar contratos por rango de valor - USA MÉTODO ESTÁTICO
   * ✅ MEJORA: Utiliza el método estático del esquema
   */
  async findByValueRange(minValue, maxValue, options = {}) {
    try {
      const { page = 1, limit = 10 } = options;

      // ✅ Usar método estático del esquema
      const query = this.model
        .findByValueRange(minValue, maxValue)
        .populate([
          { path: "contractType", select: "code name category" },
          { path: "requestingDepartment", select: "code name shortName" },
        ])
        .sort({ "budget.estimatedValue": -1 });

      return await this.model.paginate(query, { page, limit });
    } catch (error) {
      throw new Error(
        `Error buscando contratos por rango de valor: ${error.message}`
      );
    }
  }

  /**
   * Obtener estadísticas por departamento - USA MÉTODO ESTÁTICO
   * ✅ MEJORA: Utiliza el método estático del esquema
   */
  async getStatsByDepartment(options = {}) {
    try {
      const { populateDepartmentInfo = true } = options;

      // ✅ Usar método estático del esquema
      let stats = await this.model.getStatsByDepartment();

      if (populateDepartmentInfo && stats.length > 0) {
        // Poblar información de departamentos
        await this.model.populate(stats, {
          path: "_id",
          select: "code name shortName",
          model: "Department",
        });
      }

      return stats;
    } catch (error) {
      throw new Error(
        `Error obteniendo estadísticas por departamento: ${error.message}`
      );
    }
  }

  // ===== MÉTODOS ESPECÍFICOS DEL REPOSITORIO =====

  /**
   * Buscar contrato por número
   */
  async findByContractNumber(contractNumber, isDeleted = true) {
    try {
      const contract = await this.model
        .findOne({
          contractNumber: contractNumber.toUpperCase(),
          isDeleted: isDeleted,
        })
        .populate([
          { path: "contractType", select: "code name category" },
          {
            path: "requestingDepartment",
            select: "code name shortName responsible",
          },
          { path: "currentPhase", select: "code name shortName order" },
          { path: "phases.phase", select: "code name shortName order" },
        ]);

      return contract;
    } catch (error) {
      throw new Error(`Error buscando contrato por número: ${error.message}`);
    }
  }

  /**
   * Buscar contrato por código SERCOP
   */
  async findBySercopCode(sercopCode) {
    try {
      const contract = await this.model
        .findOne({
          sercopCode: sercopCode.toUpperCase(),
          isActive: true,
        })
        .populate([
          { path: "contractType", select: "code name category" },
          { path: "requestingDepartment", select: "code name shortName" },
        ]);

      return contract;
    } catch (error) {
      throw new Error(
        `Error buscando contrato por código SERCOP: ${error.message}`
      );
    }
  }

  // ===== MÉTODOS DE GESTIÓN DE FASES =====

  /**
   * Avanzar a la siguiente fase
   * ✅ MEJORA: Utiliza métodos del esquema para validaciones
   */
  async advanceToNextPhase(contractId, userData, options = {}) {
    try {
      const contract = await this.findById(contractId);
      if (!contract) {
        throw new Error("Contrato no encontrado");
      }

      // ✅ Usar método del esquema para validar
      if (!contract.canAdvanceToNextPhase()) {
        throw new Error("El contrato no puede avanzar a la siguiente fase");
      }

      // ✅ Usar método del esquema para obtener siguiente fase
      const nextPhase = contract.getNextPhase();
      if (!nextPhase) {
        throw new Error("No hay una fase siguiente disponible");
      }

      // Actualizar fase actual
      const updateData = {
        currentPhase: nextPhase.phase,
        "phases.$.status": "IN_PROGRESS",
      };

      const updatedContract = await this.update(
        contractId,
        updateData,
        userData,
        options
      );

      return {
        contract: updatedContract,
        previousPhase: contract.getCurrentPhaseInfo(),
        currentPhase: nextPhase,
      };
    } catch (error) {
      throw new Error(`Error avanzando fase: ${error.message}`);
    }
  }

  /**
   * Obtener información detallada de progreso
   * ✅ MEJORA: Utiliza métodos del esquema
   */
  async getProgressInfo(contractId) {
    try {
      const contract = await this.findById(contractId);
      if (!contract) {
        throw new Error("Contrato no encontrado");
      }

      return {
        contractId: contract._id,
        contractNumber: contract.contractNumber,
        // ✅ Usar métodos del esquema
        progress: contract.calculateProgress(),
        daysRemaining: contract.getDaysRemaining(),
        isOverdue: contract.isOverdue(),
        budgetUtilization: contract.getBudgetUtilization(),
        currentPhase: contract.getCurrentPhaseInfo(),
        nextPhase: contract.getNextPhase(),
        canAdvanceToNext: contract.canAdvanceToNextPhase(),
      };
    } catch (error) {
      throw new Error(
        `Error obteniendo información de progreso: ${error.message}`
      );
    }
  }

  // ===== MÉTODOS DE BÚSQUEDA AVANZADA =====

  /**
   * Búsqueda avanzada de contratos
   */
  async findAdvanced(criteria, options = {}) {
    try {
      const {
        page = 1,
        limit = 10,
        sort = { createdAt: -1 },
        populate = true,
      } = options;

      const {
        status,
        department,
        contractType,
        minValue,
        maxValue,
        dateFrom,
        dateTo,
        searchText,
        isOverdue,
        tags,
      } = criteria;

      // Construir query base
      let query = this.model.find();

      // Aplicar filtros usando query helpers cuando sea apropiado
      if (status) query = query.byStatus(status);
      if (department) query = query.byDepartment(department);
      if (contractType) query = query.byContractType(contractType);
      if (isOverdue) query = query.overdue();

      // Filtros adicionales
      if (minValue || maxValue) {
        const valueQuery = {};
        if (minValue) valueQuery.$gte = minValue;
        if (maxValue) valueQuery.$lte = maxValue;
        query = query.where({ "budget.estimatedValue": valueQuery });
      }

      if (dateFrom || dateTo) {
        const dateQuery = {};
        if (dateFrom) dateQuery.$gte = new Date(dateFrom);
        if (dateTo) dateQuery.$lte = new Date(dateTo);
        query = query.where({ createdAt: dateQuery });
      }

      if (searchText) {
        query = query.where({
          $text: { $search: searchText },
        });
      }

      if (tags && tags.length > 0) {
        query = query.where({ "metadata.tags": { $in: tags } });
      }

      // Población condicional
      if (populate) {
        query = query.populate([
          { path: "contractType", select: "code name category" },
          { path: "requestingDepartment", select: "code name shortName" },
          { path: "currentPhase", select: "code name shortName order" },
        ]);
      }

      // Aplicar ordenamiento
      query = query.sort(sort);

      return await this.model.paginate(query, { page, limit });
    } catch (error) {
      throw new Error(`Error en búsqueda avanzada: ${error.message}`);
    }
  }

  // ===== MÉTODOS DE REPORTES Y ESTADÍSTICAS =====

  /**
   * Obtener dashboard mejorado usando métodos del esquema
   */
  async getDashboard(filters = {}, userId = null, userRole = null) {
    try {
      const { department, dateFrom, dateTo } = filters;

      let matchStage = { isActive: true };

      // Filtros opcionales
      if (department)
        matchStage.requestingDepartment = new Types.ObjectId(department);
      if (dateFrom || dateTo) {
        matchStage.createdAt = {};
        if (dateFrom) matchStage.createdAt.$gte = new Date(dateFrom);
        if (dateTo) matchStage.createdAt.$lte = new Date(dateTo);
      }

      const pipeline = [
        { $match: matchStage },
        {
          $facet: {
            // Usar métodos estáticos para estadísticas
            byStatus: [
              {
                $group: {
                  _id: "$generalStatus",
                  count: { $sum: 1 },
                  totalValue: { $sum: "$budget.estimatedValue" },
                },
              },
            ],

            // Contratos recientes con información de progreso
            recent: [
              { $sort: { createdAt: -1 } },
              { $limit: 5 },
              {
                $lookup: {
                  from: "departments",
                  localField: "requestingDepartment",
                  foreignField: "_id",
                  as: "department",
                },
              },
              { $unwind: "$department" },
              {
                $project: {
                  contractNumber: 1,
                  contractualObject: 1,
                  "budget.estimatedValue": 1,
                  generalStatus: 1,
                  "department.name": 1,
                  createdAt: 1,
                  "timeline.executionEndDate": 1,
                  phases: 1,
                },
              },
            ],

            // Contratos vencidos (usar lógica similar al query helper)
            overdue: [
              {
                $match: {
                  "timeline.executionEndDate": { $lt: new Date() },
                  generalStatus: {
                    $nin: ["FINISHED", "LIQUIDATED", "CANCELLED"],
                  },
                },
              },
              { $count: "count" },
            ],

            // Totales
            totals: [
              {
                $group: {
                  _id: null,
                  totalContracts: { $sum: 1 },
                  totalEstimatedValue: { $sum: "$budget.estimatedValue" },
                  totalAwardedValue: { $sum: "$budget.awardedValue" },
                },
              },
            ],
          },
        },
      ];

      const result = await this.model.aggregate(pipeline);
      const dashboard = result[0];

      // Enriquecer con estadísticas por departamento si es necesario
      if (!department) {
        dashboard.byDepartment = await this.getStatsByDepartment();
      }

      return dashboard;
    } catch (error) {
      throw new Error(`Error obteniendo dashboard: ${error.message}`);
    }
  }

  // ===== VALIDACIONES ESPECÍFICAS =====

  /**
   * Validar datos antes de crear contrato
   */
  async validateBeforeCreate(data) {
    const errors = [];

    // Validar unicidad de número de contrato
    if (data.contractNumber) {
      const existing = await this.model.findOne({
        contractNumber: data.contractNumber.toUpperCase(),
        isActive: true,
      });
      if (existing) {
        errors.push("El número de contrato ya existe");
      }
    }

    // Validar unicidad de código SERCOP
    if (data.sercopCode) {
      const existing = await this.model.findOne({
        sercopCode: data.sercopCode.toUpperCase(),
        isActive: true,
      });
      if (existing) {
        errors.push("El código SERCOP ya existe");
      }
    }

    if (errors.length > 0) {
      throw new Error(`Validación fallida: ${errors.join(", ")}`);
    }

    return true;
  }

  /**
   * Crear contrato con validaciones
   */
  async create(data, userData, options = {}) {
    try {
      await this.validateBeforeCreate(data);
      return await super.create(data, userData, options);
    } catch (error) {
      throw new Error(`Repositorio Error creando contrato: ${error.message}`);
    }
  }

  async countDocuments(filter = {}) {
    try {
      return await this.model.countDocuments(filter);
    } catch (error) {
      throw new Error(
        `Repositorio Error contando documentos: ${error.message}`
      );
    }
  }
}

export default new ContractRepository();
