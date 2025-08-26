// =============================================================================
// src/module/exp-digital/repositories/contract.repository.js
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
    // Lookups específicos para contratos
    this.contractLookups = {
      contractType: {
        from: "contracttypes",
        localField: "contractType",
        foreignField: "_id",
        as: "contractTypeInfo",
        pipeline: [
          { $project: { code: 1, name: 1, category: 1, isActive: 1 } }
        ]
      },
      requestingDepartment: {
        from: "departments", 
        localField: "requestingDepartment",
        foreignField: "_id",
        as: "departmentInfo",
        pipeline: [
          { $project: { code: 1, name: 1, shortName: 1, responsible: 1, isActive: 1 } }
        ]
      },
      currentPhase: {
        from: "contractphases",
        localField: "currentPhase", 
        foreignField: "_id",
        as: "currentPhaseInfo",
        pipeline: [
          { $project: { code: 1, name: 1, shortName: 1, order: 1, category: 1 } }
        ]
      },
      phases: {
        from: "contractphases",
        localField: "phases.phase",
        foreignField: "_id", 
        as: "phasesInfo",
        pipeline: [
          { $project: { code: 1, name: 1, shortName: 1, order: 1, category: 1 } }
        ]
      }
    };
  }

  // ===== MÉTODOS DE BÚSQUEDA ESPECÍFICOS =====

  /**
   * Buscar contrato por número
   */
  async findByContractNumber(contractNumber) {
    try {
      const contract = await this.model.findOne({ 
        contractNumber: contractNumber.toUpperCase(),
        isActive: true
      }).populate([
        { path: 'contractType', select: 'code name category' },
        { path: 'requestingDepartment', select: 'code name shortName' },
        { path: 'currentPhase', select: 'code name order category' }
      ]).lean();

      if (!contract) {
        throw new Error(`Contrato ${contractNumber} no encontrado`);
      }

      return contract;
    } catch (error) {
      throw new Error(`Error buscando contrato: ${error.message}`);
    }
  }

  /**
   * Buscar contratos por tipo de contratación
   */
  async findByContractType(contractTypeId, options = {}) {
    const { page = 1, limit = 20, status } = options;

    const baseQuery = { contractType: contractTypeId };
    if (status) baseQuery.generalStatus = status.toUpperCase();

    return await this.searchWithAggregation({
      filters: baseQuery,
      options: { page, limit, sort: { createdAt: -1 } },
      lookups: [
        this.contractLookups.contractType,
        this.contractLookups.requestingDepartment,
        this.contractLookups.currentPhase
      ]
    });
  }

  /**
   * Buscar contratos por departamento solicitante
   */
  async findByDepartment(departmentId, options = {}) {
    const { page = 1, limit = 20, dateFrom, dateTo, status } = options;

    const baseQuery = { requestingDepartment: departmentId };
    if (status) baseQuery.generalStatus = status.toUpperCase();
    if (dateFrom || dateTo) {
      baseQuery.createdAt = {};
      if (dateFrom) baseQuery.createdAt.$gte = new Date(dateFrom);
      if (dateTo) baseQuery.createdAt.$lte = new Date(dateTo);
    }

    return await this.searchWithAggregation({
      filters: baseQuery,
      options: { page, limit, sort: { createdAt: -1 } },
      lookups: [
        this.contractLookups.contractType,
        this.contractLookups.requestingDepartment,
        this.contractLookups.currentPhase
      ]
    });
  }

  /**
   * Buscar contratos por estado general
   */
  async findByStatus(status, options = {}) {
    const { page = 1, limit = 20, contractType, department } = options;

    const baseQuery = { generalStatus: status.toUpperCase() };
    if (contractType) baseQuery.contractType = contractType;
    if (department) baseQuery.requestingDepartment = department;

    return await this.searchWithAggregation({
      filters: baseQuery,
      options: { page, limit, sort: { createdAt: -1 } },
      lookups: [
        this.contractLookups.contractType,
        this.contractLookups.requestingDepartment,
        this.contractLookups.currentPhase
      ]
    });
  }

  /**
   * Buscar contratos por RUC del contratista
   */
  async findByContractorRuc(ruc, options = {}) {
    const { page = 1, limit = 20 } = options;

    return await this.searchWithAggregation({
      filters: { 'contractor.ruc': ruc },
      options: { page, limit, sort: { createdAt: -1 } },
      lookups: [
        this.contractLookups.contractType,
        this.contractLookups.requestingDepartment
      ]
    });
  }

  /**
   * Buscar contratos por rango de montos
   */
  async findByValueRange(minValue, maxValue, options = {}) {
    const { page = 1, limit = 20, valueType = "estimatedValue" } = options;

    const filters = {};
    filters[`budget.${valueType}`] = {};
    if (minValue !== undefined) filters[`budget.${valueType}`].$gte = minValue;
    if (maxValue !== undefined) filters[`budget.${valueType}`].$lte = maxValue;

    return await this.searchWithAggregation({
      filters,
      options: { page, limit, sort: { [`budget.${valueType}`]: -1 } },
      lookups: [
        this.contractLookups.contractType,
        this.contractLookups.requestingDepartment
      ]
    });
  }

  /**
   * Buscar contratos vencidos
   */
  async findOverdueContracts(options = {}) {
    const { page = 1, limit = 20 } = options;
    const today = new Date();

    const filters = {
      'timeline.executionEndDate': { $lt: today },
      generalStatus: { $nin: ['FINISHED', 'LIQUIDATED', 'CANCELLED'] }
    };

    return await this.searchWithAggregation({
      filters,
      options: { page, limit, sort: { 'timeline.executionEndDate': 1 } },
      lookups: [
        this.contractLookups.contractType,
        this.contractLookups.requestingDepartment,
        this.contractLookups.currentPhase
      ]
    });
  }

  /**
   * Buscar contratos próximos a vencer
   */
  async findContractsNearExpiration(days = 30, options = {}) {
    const { page = 1, limit = 20 } = options;
    const today = new Date();
    const futureDate = new Date();
    futureDate.setDate(today.getDate() + days);

    const filters = {
      'timeline.executionEndDate': { 
        $gte: today, 
        $lte: futureDate 
      },
      generalStatus: { $nin: ['FINISHED', 'LIQUIDATED', 'CANCELLED'] }
    };

    return await this.searchWithAggregation({
      filters,
      options: { page, limit, sort: { 'timeline.executionEndDate': 1 } },
      lookups: [
        this.contractLookups.contractType,
        this.contractLookups.requestingDepartment,
        this.contractLookups.currentPhase
      ]
    });
  }

  // ===== BÚSQUEDAS AVANZADAS =====

  /**
   * Búsqueda avanzada de contratos con múltiples filtros
   */
  async advancedSearch(searchParams, options = {}) {
    try {
      const {
        contractNumber,
        contractType,
        department,
        status,
        contractorRuc,
        contractorName,
        minValue,
        maxValue,
        dateFrom,
        dateTo,
        phase,
        textSearch,
        tags,
        priority
      } = searchParams;

      const {
        page = 1,
        limit = 20,
        sort = { createdAt: -1 },
        includeInactive = false
      } = options;

      // Construir filtros
      const filters = {};
      
      if (!includeInactive) {
        filters.isActive = true;
      }

      if (contractNumber) {
        filters.contractNumber = { $regex: contractNumber, $options: 'i' };
      }

      if (contractType) {
        filters.contractType = new Types.ObjectId(contractType);
      }

      if (department) {
        filters.requestingDepartment = new Types.ObjectId(department);
      }

      if (status && Array.isArray(status)) {
        filters.generalStatus = { $in: status.map(s => s.toUpperCase()) };
      } else if (status) {
        filters.generalStatus = status.toUpperCase();
      }

      if (contractorRuc) {
        filters['contractor.ruc'] = contractorRuc;
      }

      if (contractorName) {
        filters['contractor.businessName'] = { $regex: contractorName, $options: 'i' };
      }

      if (minValue || maxValue) {
        filters['budget.estimatedValue'] = {};
        if (minValue) filters['budget.estimatedValue'].$gte = minValue;
        if (maxValue) filters['budget.estimatedValue'].$lte = maxValue;
      }

      if (dateFrom || dateTo) {
        filters.createdAt = {};
        if (dateFrom) filters.createdAt.$gte = new Date(dateFrom);
        if (dateTo) filters.createdAt.$lte = new Date(dateTo);
      }

      if (phase) {
        filters.currentPhase = new Types.ObjectId(phase);
      }

      if (tags && Array.isArray(tags) && tags.length > 0) {
        filters['metadata.tags'] = { $in: tags };
      }

      if (priority) {
        filters['metadata.priority'] = priority.toUpperCase();
      }

      // Configurar pipeline personalizado para búsqueda de texto
      const customPipeline = [];
      if (textSearch) {
        customPipeline.push({
          $match: {
            $or: [
              { contractNumber: { $regex: textSearch, $options: 'i' } },
              { contractualObject: { $regex: textSearch, $options: 'i' } },
              { detailedDescription: { $regex: textSearch, $options: 'i' } },
              { 'contractor.businessName': { $regex: textSearch, $options: 'i' } },
              { 'contractor.tradeName': { $regex: textSearch, $options: 'i' } },
              { observations: { $regex: textSearch, $options: 'i' } }
            ]
          }
        });
      }

      return await this.searchWithAggregation({
        filters,
        options: { page, limit, sort },
        lookups: [
          this.contractLookups.contractType,
          this.contractLookups.requestingDepartment,
          this.contractLookups.currentPhase
        ],
        customPipeline
      });

    } catch (error) {
      throw new Error(`Error en búsqueda avanzada: ${error.message}`);
    }
  }

  // ===== ESTADÍSTICAS Y REPORTES =====

  /**
   * Obtener estadísticas generales de contratos
   */
  async getGeneralStats() {
    try {
      const pipeline = [
        { $match: { isActive: true } },
        {
          $group: {
            _id: null,
            totalContracts: { $sum: 1 },
            totalEstimatedValue: { $sum: '$budget.estimatedValue' },
            totalAwardedValue: { $sum: '$budget.awardedValue' },
            totalPaidValue: { $sum: '$budget.paidValue' },
            avgEstimatedValue: { $avg: '$budget.estimatedValue' },
            statusBreakdown: {
              $push: '$generalStatus'
            }
          }
        },
        {
          $project: {
            _id: 0,
            totalContracts: 1,
            totalEstimatedValue: 1,
            totalAwardedValue: 1,
            totalPaidValue: 1,
            avgEstimatedValue: 1,
            pendingPayment: { 
              $subtract: ['$totalAwardedValue', '$totalPaidValue'] 
            },
            statusBreakdown: 1
          }
        }
      ];

      const result = await this.model.aggregate(pipeline);
      return result[0] || {};

    } catch (error) {
      throw new Error(`Error obteniendo estadísticas: ${error.message}`);
    }
  }

  /**
   * Estadísticas por departamento
   */
  async getStatsByDepartment() {
    try {
      const pipeline = [
        { $match: { isActive: true } },
        {
          $lookup: {
            from: 'departments',
            localField: 'requestingDepartment',
            foreignField: '_id',
            as: 'department'
          }
        },
        { $unwind: '$department' },
        {
          $group: {
            _id: '$requestingDepartment',
            departmentName: { $first: '$department.name' },
            departmentCode: { $first: '$department.code' },
            contractCount: { $sum: 1 },
            totalValue: { $sum: '$budget.estimatedValue' },
            avgValue: { $avg: '$budget.estimatedValue' },
            statusBreakdown: {
              $push: '$generalStatus'
            }
          }
        },
        { $sort: { contractCount: -1 } }
      ];

      return await this.model.aggregate(pipeline);

    } catch (error) {
      throw new Error(`Error en estadísticas por departamento: ${error.message}`);
    }
  }

  /**
   * Estadísticas por tipo de contratación
   */
  async getStatsByContractType() {
    try {
      const pipeline = [
        { $match: { isActive: true } },
        {
          $lookup: {
            from: 'contracttypes',
            localField: 'contractType',
            foreignField: '_id',
            as: 'contractType'
          }
        },
        { $unwind: '$contractType' },
        {
          $group: {
            _id: '$contractType._id',
            typeName: { $first: '$contractType.name' },
            typeCode: { $first: '$contractType.code' },
            category: { $first: '$contractType.category' },
            contractCount: { $sum: 1 },
            totalValue: { $sum: '$budget.estimatedValue' },
            avgValue: { $avg: '$budget.estimatedValue' },
            minValue: { $min: '$budget.estimatedValue' },
            maxValue: { $max: '$budget.estimatedValue' }
          }
        },
        { $sort: { contractCount: -1 } }
      ];

      return await this.model.aggregate(pipeline);

    } catch (error) {
      throw new Error(`Error en estadísticas por tipo: ${error.message}`);
    }
  }

  /**
   * Estadísticas temporales (por mes/año)
   */
  async getTemporalStats(year = new Date().getFullYear()) {
    try {
      const pipeline = [
        {
          $match: {
            isActive: true,
            createdAt: {
              $gte: new Date(`${year}-01-01`),
              $lte: new Date(`${year}-12-31`)
            }
          }
        },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' }
            },
            contractCount: { $sum: 1 },
            totalValue: { $sum: '$budget.estimatedValue' },
            avgValue: { $avg: '$budget.estimatedValue' },
            statusBreakdown: {
              $push: '$generalStatus'
            }
          }
        },
        { $sort: { '_id.month': 1 } }
      ];

      return await this.model.aggregate(pipeline);

    } catch (error) {
      throw new Error(`Error en estadísticas temporales: ${error.message}`);
    }
  }

  // ===== MANEJO DE FASES =====

  /**
   * Actualizar fase actual del contrato
   */
  async updateCurrentPhase(contractId, newPhaseId, userData, observations = '') {
    try {
      if (!Types.ObjectId.isValid(contractId) || !Types.ObjectId.isValid(newPhaseId)) {
        throw new Error('IDs no válidos');
      }

      const contract = await this.findById(contractId);
      const oldPhaseId = contract.currentPhase;

      // Actualizar la fase actual
      const updatedContract = await this.update(
        contractId,
        {
          currentPhase: newPhaseId,
          'phases.$[elem].status': 'IN_PROGRESS',
          'phases.$[elem].startDate': new Date(),
          'phases.$[elem].observations': observations
        },
        userData,
        {
          arrayFilters: [{ 'elem.phase': newPhaseId }]
        }
      );

      // Marcar fase anterior como completada si existe
      if (oldPhaseId) {
        await this.model.updateOne(
          { _id: contractId },
          {
            $set: {
              'phases.$[elem].status': 'COMPLETED',
              'phases.$[elem].completionDate': new Date()
            }
          },
          {
            arrayFilters: [{ 'elem.phase': oldPhaseId }]
          }
        );
      }

      return updatedContract;

    } catch (error) {
      throw new Error(`Error actualizando fase: ${error.message}`);
    }
  }

  /**
   * Completar fase actual
   */
  async completeCurrentPhase(contractId, userData, observations = '') {
    try {
      const contract = await this.findById(contractId);
      if (!contract.currentPhase) {
        throw new Error('No hay fase actual para completar');
      }

      const updatedContract = await this.model.findOneAndUpdate(
        {
          _id: contractId,
          'phases.phase': contract.currentPhase
        },
        {
          $set: {
            'phases.$.status': 'COMPLETED',
            'phases.$.completionDate': new Date(),
            'phases.$.observations': observations,
            updatedBy: userData.userId,
            updatedAt: new Date()
          }
        },
        { new: true }
      );

      return updatedContract;

    } catch (error) {
      throw new Error(`Error completando fase: ${error.message}`);
    }
  }

  // ===== MÉTODOS DE UTILIDAD =====

  /**
   * Verificar disponibilidad de número de contrato
   */
  async isContractNumberAvailable(contractNumber, excludeId = null) {
    try {
      const query = { 
        contractNumber: contractNumber.toUpperCase(),
        isActive: true
      };

      if (excludeId) {
        query._id = { $ne: excludeId };
      }

      const existingContract = await this.model.findOne(query);
      return !existingContract;

    } catch (error) {
      throw new Error(`Error verificando número de contrato: ${error.message}`);
    }
  }

  /**
   * Generar siguiente número de contrato
   */
  async generateNextContractNumber(departmentCode, year = new Date().getFullYear()) {
    try {
      const prefix = `${departmentCode}-${year}`;
      const regex = new RegExp(`^${prefix}-(\\d+)$`, 'i');

      const lastContract = await this.model
        .findOne({
          contractNumber: { $regex: regex },
          isActive: true
        })
        .sort({ contractNumber: -1 })
        .lean();

      let nextNumber = 1;
      if (lastContract) {
        const match = lastContract.contractNumber.match(regex);
        if (match && match[1]) {
          nextNumber = parseInt(match[1]) + 1;
        }
      }

      const paddedNumber = nextNumber.toString().padStart(4, '0');
      return `${prefix}-${paddedNumber}`;

    } catch (error) {
      throw new Error(`Error generando número de contrato: ${error.message}`);
    }
  }

  /**
   * Obtener dashboard de contratos
   */
  async getDashboard(userId = null, userRole = null) {
    try {
      const matchStage = { isActive: true };

      // Filtrar por usuario/departamento si no es admin
      if (userId && userRole !== 'ADMIN') {
        // Aquí puedes agregar lógica para filtrar por departamento del usuario
        // matchStage.requestingDepartment = userDepartment;
      }

      const pipeline = [
        { $match: matchStage },
        {
          $facet: {
            // Estadísticas por estado
            byStatus: [
              {
                $group: {
                  _id: '$generalStatus',
                  count: { $sum: 1 },
                  totalValue: { $sum: '$budget.estimatedValue' }
                }
              }
            ],
            
            // Contratos recientes
            recent: [
              { $sort: { createdAt: -1 } },
              { $limit: 5 },
              {
                $lookup: {
                  from: 'departments',
                  localField: 'requestingDepartment',
                  foreignField: '_id',
                  as: 'department'
                }
              },
              { $unwind: '$department' },
              {
                $project: {
                  contractNumber: 1,
                  contractualObject: 1,
                  'budget.estimatedValue': 1,
                  generalStatus: 1,
                  'department.name': 1,
                  createdAt: 1
                }
              }
            ],
            
            // Contratos vencidos
            overdue: [
              {
                $match: {
                  'timeline.executionEndDate': { $lt: new Date() },
                  generalStatus: { $nin: ['FINISHED', 'LIQUIDATED', 'CANCELLED'] }
                }
              },
              { $count: 'count' }
            ],
            
            // Total de contratos y valores
            totals: [
              {
                $group: {
                  _id: null,
                  totalContracts: { $sum: 1 },
                  totalEstimatedValue: { $sum: '$budget.estimatedValue' },
                  totalAwardedValue: { $sum: '$budget.awardedValue' }
                }
              }
            ]
          }
        }
      ];

      const result = await this.model.aggregate(pipeline);
      return result[0];

    } catch (error) {
      throw new Error(`Error obteniendo dashboard: ${error.message}`);
    }
  }
}

export default new ContractRepository();