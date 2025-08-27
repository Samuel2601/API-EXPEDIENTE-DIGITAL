// =============================================================================
// src/module/exp-digital/services/contract.service.js
// Servicio para gestión completa de contratos del expediente digital
// GADM Cantón Esmeraldas - Basado en repositorios existentes
// =============================================================================

import { ContractRepository } from "../repositories/contract.repository.js";
import { ContractPhaseRepository } from "../repositories/contract-phase.repository.js";
import { ContractHistoryRepository } from "../repositories/contract-history.repository.js";
import {
  createError,
  createValidationError,
  ERROR_CODES,
} from "../../../utils/error.util.js";
import {
  validateObjectId,
  validateRequiredFields,
} from "../../../utils/validation.util.js";

import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { createObjectCsvWriter } from "csv-writer";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class ContractService {
  constructor() {
    this.contractRepository = new ContractRepository();
    this.contractPhaseRepository = new ContractPhaseRepository();
    this.contractHistoryRepository = new ContractHistoryRepository();
  }

  // =============================================================================
  // OPERACIONES CRUD DE CONTRATOS
  // =============================================================================

  /**
   * Crear nuevo contrato
   * @param {Object} contractData - Datos del contrato
   * @param {Object} options - Opciones adicionales
   * @returns {Promise<Object>} Contrato creado
   */
  async createContract(contractData, options = {}) {
    try {
      console.log("📝 Iniciando creación de contrato");

      // Validar datos básicos
      await this._validateContractData(contractData);

      // Generar número de contrato único
      const contractNumber = await this._generateContractNumber(
        contractData.requestingDepartment,
        contractData.contractType
      );

      // Obtener la primera fase del proceso (PREPARATORIA)
      const initialPhase = await this._getInitialPhase(
        contractData.contractType
      );

      // Preparar datos del contrato
      const contractToCreate = {
        ...contractData,
        contractNumber,
        generalStatus: "DRAFT",
        currentPhase: initialPhase ? initialPhase._id : null,
        phases: initialPhase
          ? [
              {
                phase: initialPhase._id,
                status: "IN_PROGRESS",
                startDate: new Date(),
                assignedTo: contractData.createdBy,
                documents: [],
                observations: [],
              },
            ]
          : [],
        timeline: {
          ...contractData.timeline,
          creationDate: new Date(),
          lastStatusChange: new Date(),
        },
        audit: {
          ...contractData.audit,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      // Crear contrato usando el repositorio base
      const newContract = await this.contractRepository.create(
        contractToCreate,
        { userId: contractData.createdBy }
      );

      // Crear entrada en el historial
      await this._createHistoryEntry(newContract._id, {
        eventType: "CREATION",
        description: "Contrato creado en estado BORRADOR",
        user: {
          userId: contractData.createdBy,
          name: contractData.createdByName || "Usuario",
          email: contractData.createdByEmail || "",
        },
        changeDetails: {
          newStatus: "DRAFT",
          phase: initialPhase
            ? {
                phaseId: initialPhase._id,
                phaseName: initialPhase.name,
              }
            : null,
        },
      });

      console.log(`✅ Contrato creado exitosamente: ${contractNumber}`);

      return await this._populateContractData(newContract);
    } catch (error) {
      console.error(`❌ Error creando contrato: ${error.message}`);
      throw createError(
        ERROR_CODES.CREATE_ERROR,
        `Error al crear contrato: ${error.message}`,
        500
      );
    }
  }

  /**
   * Obtener todos los contratos con filtros y paginación
   * @param {Object} filters - Filtros de búsqueda
   * @returns {Promise<Object>} Lista paginada de contratos
   */
  async getAllContracts(filters = {}) {
    try {
      console.log("📋 Obteniendo contratos con filtros:", filters);

      const {
        page = 1,
        limit = 20,
        status,
        contractType,
        departmentId,
        departmentAccess,
        dateFrom,
        dateTo,
        search,
        sortBy = "createdAt",
        sortOrder = "desc",
        includeInactive = false,
      } = filters;

      // Construir query de búsqueda
      const query = {};

      // Filtros básicos
      if (status) query.generalStatus = status.toUpperCase();
      if (contractType) query.contractType = contractType;
      if (!includeInactive) query.isActive = true;

      // Filtros de acceso departamental
      if (departmentAccess === "department" && departmentId) {
        query.requestingDepartment = departmentId;
      }

      // Filtro por rango de fechas
      if (dateFrom || dateTo) {
        query.createdAt = {};
        if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
        if (dateTo) query.createdAt.$lte = new Date(dateTo);
      }

      // Búsqueda de texto
      if (search) {
        query.$or = [
          { contractNumber: { $regex: search, $options: "i" } },
          { contractualObject: { $regex: search, $options: "i" } },
          { "contractor.name": { $regex: search, $options: "i" } },
          { "contractor.ruc": { $regex: search, $options: "i" } },
        ];
      }

      // Opciones de consulta
      const queryOptions = {
        page: parseInt(page),
        limit: Math.min(parseInt(limit), 100), // Máximo 100
        sort: { [sortBy]: sortOrder === "asc" ? 1 : -1 },
        populate: [
          { path: "contractType", select: "code name category" },
          { path: "requestingDepartment", select: "code name shortName" },
          {
            path: "currentPhase",
            select: "code name shortName order category",
          },
        ],
      };

      // Ejecutar búsqueda
      const result = await this.contractRepository.findAll(query, queryOptions);

      // Enriquecer datos de contratos
      const enrichedContracts = await Promise.all(
        result.docs.map(async (contract) => {
          const enriched = await this._enrichContractSummary(contract);
          return enriched;
        })
      );

      console.log(
        `✅ Contratos obtenidos: ${result.totalDocs} total, ${enrichedContracts.length} en página`
      );

      return {
        contracts: enrichedContracts,
        pagination: {
          currentPage: result.page,
          totalPages: result.totalPages,
          totalContracts: result.totalDocs,
          limit: result.limit,
          hasNext: result.hasNextPage,
          hasPrev: result.hasPrevPage,
        },
        appliedFilters: filters,
      };
    } catch (error) {
      console.error(`❌ Error obteniendo contratos: ${error.message}`);
      throw createError(
        ERROR_CODES.FETCH_ERROR,
        `Error al obtener contratos: ${error.message}`,
        500
      );
    }
  }

  /**
   * Obtener contrato por ID con información detallada
   * @param {String} contractId - ID del contrato
   * @param {Object} options - Opciones de consulta
   * @returns {Promise<Object>} Contrato con información detallada
   */
  async getContractById(contractId, options = {}) {
    try {
      validateObjectId(contractId, "ID del contrato");

      console.log(`👀 Obteniendo contrato por ID: ${contractId}`);

      const {
        includeHistory = false,
        includeDocuments = false,
        includePhases = true,
        userId = null,
      } = options;

      // Obtener contrato con población
      const contract = await this.contractRepository.findById(contractId, {
        populate: [
          { path: "contractType", select: "code name category description" },
          {
            path: "requestingDepartment",
            select: "code name shortName responsible",
          },
          {
            path: "currentPhase",
            select: "code name shortName order category estimatedDuration",
          },
          {
            path: "phases.phase",
            select: "code name shortName order category",
          },
          { path: "audit.createdBy", select: "name email" },
          { path: "audit.lastModifiedBy", select: "name email" },
        ],
      });

      if (!contract) {
        throw createError(ERROR_CODES.NOT_FOUND, "Contrato no encontrado", 404);
      }

      // Construir respuesta detallada
      const response = {
        contract: await this._enrichContractDetails(contract),
        phases: null,
        documents: null,
        history: null,
        statistics: null,
      };

      // Obtener información de fases si se solicita
      if (includePhases) {
        response.phases = await this._getContractPhases(contractId);
      }

      // Obtener historial si se solicita
      if (includeHistory) {
        response.history = await this._getContractHistory(contractId, {
          limit: 50,
        });
      }

      // Obtener documentos si se solicita
      if (includeDocuments) {
        response.documents = await this._getContractDocuments(contractId);
      }

      // Calcular estadísticas del contrato
      response.statistics = await this._calculateContractStatistics(contract);

      console.log(`✅ Contrato obtenido: ${contract.contractNumber}`);

      return response;
    } catch (error) {
      console.error(`❌ Error obteniendo contrato: ${error.message}`);
      throw error;
    }
  }

  /**
   * Actualizar contrato
   * @param {String} contractId - ID del contrato
   * @param {Object} updateData - Datos a actualizar
   * @param {Object} options - Opciones de actualización
   * @returns {Promise<Object>} Contrato actualizado
   */
  async updateContract(contractId, updateData, options = {}) {
    try {
      validateObjectId(contractId, "ID del contrato");

      console.log(`✏️ Actualizando contrato: ${contractId}`);

      const {
        userId,
        createHistory = true,
        validateTransitions = true,
      } = options;

      // Obtener contrato actual
      const currentContract =
        await this.contractRepository.findById(contractId);
      if (!currentContract) {
        throw createError(ERROR_CODES.NOT_FOUND, "Contrato no encontrado", 404);
      }

      // Validar transiciones si está habilitado
      if (validateTransitions && updateData.generalStatus) {
        await this._validateStatusTransition(
          currentContract.generalStatus,
          updateData.generalStatus
        );
      }

      // Preparar datos de actualización
      const dataToUpdate = {
        ...updateData,
        "timeline.lastStatusChange": updateData.generalStatus
          ? new Date()
          : currentContract.timeline?.lastStatusChange,
        "audit.lastModifiedAt": new Date(),
      };

      // Actualizar usando el repositorio
      const updatedContract = await this.contractRepository.update(
        contractId,
        dataToUpdate,
        { userId }
      );

      // Crear entrada en historial si está habilitado
      if (createHistory) {
        await this._createUpdateHistoryEntry(
          contractId,
          currentContract,
          updatedContract,
          userId
        );
      }

      console.log(`✅ Contrato actualizado: ${updatedContract.contractNumber}`);

      return await this._populateContractData(updatedContract);
    } catch (error) {
      console.error(`❌ Error actualizando contrato: ${error.message}`);
      throw error;
    }
  }

  /**
   * Eliminar contrato (soft delete)
   * @param {String} contractId - ID del contrato
   * @param {Object} options - Opciones de eliminación
   * @returns {Promise<Object>} Resultado de la eliminación
   */
  async deleteContract(contractId, options = {}) {
    try {
      validateObjectId(contractId, "ID del contrato");

      console.log(`🗑️ Eliminando contrato: ${contractId}`);

      const {
        reason,
        deletedBy,
        createHistory = true,
        softDelete = true,
      } = options;

      // Obtener contrato antes de eliminar
      const contract = await this.contractRepository.findById(contractId);
      if (!contract) {
        throw createError(ERROR_CODES.NOT_FOUND, "Contrato no encontrado", 404);
      }

      // Validar que se puede eliminar
      if (
        contract.generalStatus === "EXECUTION" ||
        contract.generalStatus === "FINISHED"
      ) {
        throw createError(
          ERROR_CODES.VALIDATION_ERROR,
          "No se puede eliminar un contrato en ejecución o finalizado",
          400
        );
      }

      let result;

      if (softDelete) {
        // Soft delete usando el repositorio base
        result = await this.contractRepository.softDelete(contractId, {
          userId: deletedBy,
        });

        // Agregar información de eliminación
        await this.contractRepository.update(
          contractId,
          {
            deletionReason: reason,
            generalStatus: "CANCELLED",
          },
          { userId: deletedBy }
        );
      } else {
        // Hard delete (solo para administradores)
        result = await this.contractRepository.forceDelete(contractId, {
          userId: deletedBy,
        });
      }

      // Crear entrada en historial
      if (createHistory) {
        await this._createHistoryEntry(contractId, {
          eventType: softDelete ? "STATUS_CHANGE" : "PROCESS_CANCELLATION",
          description: softDelete
            ? `Contrato cancelado. Razón: ${reason}`
            : "Contrato eliminado permanentemente",
          user: {
            userId: deletedBy,
            name: "Usuario",
          },
          changeDetails: {
            previousStatus: contract.generalStatus,
            newStatus: "CANCELLED",
            reason: reason,
          },
        });
      }

      console.log(`✅ Contrato eliminado: ${contract.contractNumber}`);

      return {
        contractNumber: contract.contractNumber,
        deletedAt: new Date(),
        deletionReason: reason,
        type: softDelete ? "soft_delete" : "hard_delete",
      };
    } catch (error) {
      console.error(`❌ Error eliminando contrato: ${error.message}`);
      throw error;
    }
  }

  // =============================================================================
  // GESTIÓN DE FASES Y ESTADOS
  // =============================================================================

  /**
   * Avanzar contrato a la siguiente fase
   * @param {String} contractId - ID del contrato
   * @param {Object} options - Opciones de avance
   * @returns {Promise<Object>} Resultado del avance
   */
  async advanceContractPhase(contractId, options = {}) {
    try {
      validateObjectId(contractId, "ID del contrato");

      console.log(`⏭️ Avanzando fase del contrato: ${contractId}`);

      const {
        notes = "",
        userId,
        skipValidations = false,
        createHistory = true,
        validateDocuments = true,
      } = options;

      // Obtener contrato actual
      const contract = await this.contractRepository.findById(contractId, {
        populate: [{ path: "currentPhase" }, { path: "phases.phase" }],
      });

      if (!contract) {
        throw createError(ERROR_CODES.NOT_FOUND, "Contrato no encontrado", 404);
      }

      // Verificar que puede avanzar de fase
      if (!skipValidations && !contract.canAdvanceToNextPhase()) {
        throw createError(
          ERROR_CODES.VALIDATION_ERROR,
          "El contrato no puede avanzar a la siguiente fase. La fase actual no está completada",
          400
        );
      }

      // Obtener siguiente fase
      const nextPhase = contract.getNextPhase();
      if (!nextPhase) {
        throw createError(
          ERROR_CODES.VALIDATION_ERROR,
          "No hay más fases disponibles para este contrato",
          400
        );
      }

      // Obtener información detallada de la siguiente fase
      const nextPhaseDetails = await this.contractPhaseRepository.findById(
        nextPhase.phase
      );

      // Validar documentos de la fase actual si está habilitado
      if (validateDocuments && contract.currentPhase) {
        await this._validatePhaseDocuments(
          contractId,
          contract.currentPhase._id
        );
      }

      // Marcar fase actual como completada
      const updatedPhases = contract.phases.map((phase) => {
        if (phase.phase.toString() === contract.currentPhase._id.toString()) {
          return {
            ...phase,
            status: "COMPLETED",
            endDate: new Date(),
            completionNotes: notes,
          };
        }
        return phase;
      });

      // Agregar nueva fase en progreso
      updatedPhases.push({
        phase: nextPhase.phase,
        status: "IN_PROGRESS",
        startDate: new Date(),
        assignedTo: userId,
        documents: [],
        observations: [],
      });

      // Actualizar contrato
      const updatedContract = await this.contractRepository.update(
        contractId,
        {
          currentPhase: nextPhase.phase,
          phases: updatedPhases,
          generalStatus: this._getStatusFromPhase(nextPhaseDetails.category),
          "timeline.lastStatusChange": new Date(),
        },
        { userId }
      );

      // Crear entrada en historial
      if (createHistory) {
        await this._createHistoryEntry(contractId, {
          eventType: "PHASE_CHANGE",
          description: `Avance de fase: ${contract.currentPhase?.name} → ${nextPhaseDetails.name}`,
          user: { userId, name: "Usuario" },
          changeDetails: {
            previousPhase: {
              phaseId: contract.currentPhase._id,
              phaseName: contract.currentPhase.name,
            },
            newPhase: {
              phaseId: nextPhaseDetails._id,
              phaseName: nextPhaseDetails.name,
            },
            notes: notes,
          },
        });
      }

      console.log(
        `✅ Fase avanzada: ${contract.currentPhase?.name} → ${nextPhaseDetails.name}`
      );

      return {
        contract: await this._populateContractData(updatedContract),
        previousPhase: {
          id: contract.currentPhase._id,
          name: contract.currentPhase.name,
          completedAt: new Date(),
        },
        currentPhase: {
          id: nextPhaseDetails._id,
          name: nextPhaseDetails.name,
          category: nextPhaseDetails.category,
          estimatedDuration: nextPhaseDetails.estimatedDuration,
        },
        nextSteps: this._getPhaseNextSteps(nextPhaseDetails),
      };
    } catch (error) {
      console.error(`❌ Error avanzando fase: ${error.message}`);
      throw error;
    }
  }

  /**
   * Cambiar estado del contrato
   * @param {String} contractId - ID del contrato
   * @param {Object} statusData - Datos del cambio de estado
   * @returns {Promise<Object>} Resultado del cambio
   */
  async changeContractStatus(contractId, statusData) {
    try {
      validateObjectId(contractId, "ID del contrato");

      console.log(`🔄 Cambiando estado del contrato: ${contractId}`);

      const {
        newStatus,
        reason,
        effectiveDate = new Date(),
        userId,
        createHistory = true,
        validateTransition = true,
      } = statusData;

      // Obtener contrato actual
      const contract = await this.contractRepository.findById(contractId);
      if (!contract) {
        throw createError(ERROR_CODES.NOT_FOUND, "Contrato no encontrado", 404);
      }

      // Validar transición de estado
      if (validateTransition) {
        await this._validateStatusTransition(contract.generalStatus, newStatus);
      }

      // Actualizar estado
      const updatedContract = await this.contractRepository.update(
        contractId,
        {
          generalStatus: newStatus,
          "timeline.lastStatusChange": effectiveDate,
          statusChangeReason: reason,
        },
        { userId }
      );

      // Crear entrada en historial
      if (createHistory) {
        await this._createHistoryEntry(contractId, {
          eventType: "STATUS_CHANGE",
          description: `Cambio de estado: ${contract.generalStatus} → ${newStatus}. Razón: ${reason}`,
          user: { userId, name: "Usuario" },
          changeDetails: {
            previousStatus: contract.generalStatus,
            newStatus: newStatus,
            reason: reason,
            effectiveDate: effectiveDate,
          },
        });
      }

      console.log(
        `✅ Estado cambiado: ${contract.generalStatus} → ${newStatus}`
      );

      return {
        contract: await this._populateContractData(updatedContract),
        previousStatus: contract.generalStatus,
        currentStatus: newStatus,
        effectiveDate,
        reason,
      };
    } catch (error) {
      console.error(`❌ Error cambiando estado: ${error.message}`);
      throw error;
    }
  }

  // =============================================================================
  // CONSULTAS Y REPORTES
  // =============================================================================

  /**
   * Obtener dashboard de contratos
   * @param {Object} options - Opciones del dashboard
   * @returns {Promise<Object>} Datos del dashboard
   */
  async getContractsDashboard(options = {}) {
    try {
      console.log("📊 Generando dashboard de contratos");

      const {
        scope = "department",
        departmentId = null,
        userId = null,
        includeFinancialData = false,
        includeTrends = true,
        includeAlerts = true,
      } = options;

      // Construir filtros base según el alcance
      const baseFilters = {
        isActive: true,
      };

      if (scope === "department" && departmentId) {
        baseFilters.requestingDepartment = departmentId;
      }

      // Usar agregación para obtener estadísticas
      const dashboardData = await this.contractRepository.searchWithAggregation(
        {
          filters: baseFilters,
          customPipeline: [
            {
              $group: {
                _id: null,
                totalContracts: { $sum: 1 },
                totalValue: { $sum: "$budget.estimatedValue" },
                averageValue: { $avg: "$budget.estimatedValue" },
                statusDistribution: {
                  $push: {
                    status: "$generalStatus",
                    value: "$budget.estimatedValue",
                  },
                },
              },
            },
          ],
        }
      );

      // Obtener distribución por estados
      const statusStats = await this._getStatusDistribution(baseFilters);

      // Obtener distribución por fases
      const phaseStats = await this._getPhaseDistribution(baseFilters);

      // Obtener distribución por tipos
      const typeStats = await this._getTypeDistribution(baseFilters);

      // Construir resumen
      const summary = {
        totalContracts: dashboardData.docs[0]?.totalContracts || 0,
        totalValue: dashboardData.docs[0]?.totalValue || 0,
        averageValue: dashboardData.docs[0]?.averageValue || 0,
        activeContracts: statusStats
          .filter((s) =>
            ["PREPARATION", "CALL", "EVALUATION", "EXECUTION"].includes(s._id)
          )
          .reduce((sum, s) => sum + s.count, 0),
      };

      const result = {
        summary,
        statusDistribution: statusStats,
        phaseDistribution: phaseStats,
        typeDistribution: typeStats,
        trends: includeTrends ? await this._getTrendData(baseFilters) : null,
        alerts: includeAlerts ? await this._getAlerts(baseFilters) : null,
        recentActivity: await this._getRecentActivity(baseFilters, 10),
        upcomingDeadlines: await this._getUpcomingDeadlines(baseFilters, 15),
        financialSummary: includeFinancialData
          ? await this._getFinancialSummary(baseFilters)
          : null,
      };

      console.log(
        `✅ Dashboard generado con ${summary.totalContracts} contratos`
      );

      return result;
    } catch (error) {
      console.error(`❌ Error generando dashboard: ${error.message}`);
      throw createError(
        ERROR_CODES.STATISTICS_ERROR,
        `Error generando dashboard: ${error.message}`,
        500
      );
    }
  }

  /**
   * Buscar contratos con criterios avanzados
   * @param {Object} searchCriteria - Criterios de búsqueda
   * @returns {Promise<Object>} Resultados de búsqueda
   */
  async searchContracts(searchCriteria) {
    try {
      console.log("🔍 Ejecutando búsqueda avanzada de contratos");

      const {
        query = {},
        aggregations = {},
        pagination = { page: 1, limit: 20 },
        sorting = { createdAt: -1 },
        accessRestrictions = {},
      } = searchCriteria;

      // Aplicar restricciones de acceso
      const searchFilters = { ...query };
      if (accessRestrictions.scope === "department") {
        searchFilters.requestingDepartment = accessRestrictions.departmentId;
      }

      // Configurar búsqueda con agregación
      const searchConfig = {
        filters: searchFilters,
        options: {
          page: pagination.page,
          limit: pagination.limit,
          sort: sorting,
        },
        enableAutoLookups: true,
        customPipeline: [],
      };

      // Ejecutar búsqueda
      const startTime = Date.now();
      const searchResults =
        await this.contractRepository.searchWithAggregation(searchConfig);
      const searchDuration = Date.now() - startTime;

      // Obtener agregaciones adicionales si se solicitan
      const aggregationResults = {};
      if (aggregations.byStatus) {
        aggregationResults.byStatus =
          await this._getStatusDistribution(searchFilters);
      }
      if (aggregations.byType) {
        aggregationResults.byType =
          await this._getTypeDistribution(searchFilters);
      }

      console.log(
        `✅ Búsqueda completada en ${searchDuration}ms: ${searchResults.totalDocs} resultados`
      );

      return {
        results: searchResults.docs,
        pagination: {
          currentPage: searchResults.page,
          totalPages: searchResults.totalPages,
          totalResults: searchResults.totalDocs,
          limit: searchResults.limit,
        },
        aggregations: aggregationResults,
        appliedFilters: searchFilters,
        searchMetadata: {
          duration: searchDuration,
          query: searchCriteria,
        },
      };
    } catch (error) {
      console.error(`❌ Error en búsqueda: ${error.message}`);
      throw createError(
        ERROR_CODES.FETCH_ERROR,
        `Error en búsqueda de contratos: ${error.message}`,
        500
      );
    }
  }

  /**
   * Obtener estadísticas de contratos
   * @param {Object} statsOptions - Opciones de estadísticas
   * @returns {Promise<Object>} Estadísticas completas
   */
  async getContractStatistics(statsOptions = {}) {
    try {
      console.log("📈 Generando estadísticas de contratos");

      const {
        dateFrom,
        dateTo,
        groupBy = "status",
        includeFinancialData = false,
        includeComparison = false,
        scope = "department",
        departmentId = null,
      } = statsOptions;

      // Construir filtros base
      const baseFilters = { isActive: true };

      if (scope === "department" && departmentId) {
        baseFilters.requestingDepartment = departmentId;
      }

      if (dateFrom || dateTo) {
        baseFilters.createdAt = {};
        if (dateFrom) baseFilters.createdAt.$gte = dateFrom;
        if (dateTo) baseFilters.createdAt.$lte = dateTo;
      }

      // Obtener estadísticas usando agregación
      const stats = await this.contractRepository.getStatsWithAggregation({
        groupBy:
          groupBy === "status"
            ? "$generalStatus"
            : groupBy === "type"
              ? "$contractType"
              : groupBy === "department"
                ? "$requestingDepartment"
                : groupBy === "phase"
                  ? "$currentPhase"
                  : null,
        filters: baseFilters,
        customPipeline: includeFinancialData
          ? [
              {
                $addFields: {
                  budgetValue: { $ifNull: ["$budget.estimatedValue", 0] },
                },
              },
            ]
          : [],
      });

      // Calcular totales
      const summary = {
        totalContracts: stats.reduce((sum, stat) => sum + stat.count, 0),
        totalValue: includeFinancialData
          ? stats.reduce((sum, stat) => sum + (stat.totalValue || 0), 0)
          : null,
        averageValue: includeFinancialData
          ? stats.reduce((sum, stat) => sum + (stat.totalValue || 0), 0) /
            stats.reduce((sum, stat) => sum + stat.count, 0)
          : null,
        dateRange: { from: dateFrom, to: dateTo },
      };

      // Obtener tendencias
      const trends = await this._calculateTrends(baseFilters, dateFrom, dateTo);

      // Obtener comparaciones si se solicita
      const comparisons = includeComparison
        ? await this._calculateComparisons(baseFilters, dateFrom, dateTo)
        : null;

      console.log(
        `✅ Estadísticas generadas para ${summary.totalContracts} contratos`
      );

      return {
        data: stats,
        summary,
        trends,
        comparisons,
        chartData: this._formatChartData(stats, groupBy),
        metadata: {
          generatedAt: new Date(),
          totalContracts: summary.totalContracts,
          groupedBy: groupBy,
          includeFinancialData,
          scope,
        },
      };
    } catch (error) {
      console.error(`❌ Error generando estadísticas: ${error.message}`);
      throw createError(
        ERROR_CODES.STATISTICS_ERROR,
        `Error generando estadísticas: ${error.message}`,
        500
      );
    }
  }

  /**
   * Exportar contratos en diferentes formatos
   * @param {Object} exportOptions - Opciones de exportación
   * @returns {Promise<Object>} Archivo exportado
   */
  async exportContracts(exportOptions) {
    try {
      console.log("📤 Iniciando exportación de contratos");

      const {
        format = "excel",
        filters = {},
        includeDocuments = false,
        includeHistory = false,
        includeFinancialData = false,
        exportedBy,
        exportDate = new Date(),
      } = exportOptions;

      // Obtener contratos para exportar (sin paginación)
      const contractsQuery = await this.contractRepository.findAll(filters, {
        limit: 10000, // Límite alto para exportación
        populate: [
          { path: "contractType", select: "code name category" },
          { path: "requestingDepartment", select: "code name" },
          { path: "currentPhase", select: "code name category" },
        ],
      });

      const contracts = contractsQuery.docs;

      // Formatear datos para exportación
      const exportData = await this._formatContractsForExport(contracts, {
        includeDocuments,
        includeHistory,
        includeFinancialData,
      });

      // Generar archivo según el formato
      let exportResult;
      switch (format.toLowerCase()) {
        case "excel":
          exportResult = await this._generateExcelExport(
            exportData,
            exportOptions
          );
          break;
        case "pdf":
          exportResult = await this._generatePDFExport(
            exportData,
            exportOptions
          );
          break;
        case "csv":
          exportResult = await this._generateCSVExport(
            exportData,
            exportOptions
          );
          break;
        default:
          throw new Error(`Formato de exportación no soportado: ${format}`);
      }

      console.log(
        `✅ Exportación completada: ${contracts.length} contratos en formato ${format}`
      );

      return {
        ...exportResult,
        recordCount: contracts.length,
        exportedAt: exportDate,
        exportedBy,
      };
    } catch (error) {
      console.error(`❌ Error exportando contratos: ${error.message}`);
      throw createError(
        ERROR_CODES.EXPORT_ERROR,
        `Error al exportar contratos: ${error.message}`,
        500
      );
    }
  }

  // =============================================================================
  // MÉTODOS PRIVADOS DE UTILIDAD
  // =============================================================================

  /**
   * Validar datos del contrato antes de crear/actualizar
   * @private
   */
  async _validateContractData(contractData) {
    // Validar campos requeridos
    const requiredFields = [
      "contractualObject",
      "contractType",
      "requestingDepartment",
      "budget",
    ];

    validateRequiredFields(contractData, requiredFields, "datos del contrato");

    // Validaciones específicas
    if (
      !contractData.budget.estimatedValue ||
      contractData.budget.estimatedValue <= 0
    ) {
      throw createValidationError(
        "El valor estimado del presupuesto debe ser mayor a 0"
      );
    }

    // Validar ObjectIds
    validateObjectId(contractData.contractType, "Tipo de contrato");
    validateObjectId(
      contractData.requestingDepartment,
      "Departamento solicitante"
    );

    return true;
  }

  /**
   * Generar número único de contrato
   * @private
   */
  async _generateContractNumber(departmentId, contractTypeId) {
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, "0");

    // Obtener contador de contratos para este año
    const count = await this.contractRepository.model.countDocuments({
      createdAt: {
        $gte: new Date(year, 0, 1),
        $lt: new Date(year + 1, 0, 1),
      },
    });

    const sequence = String(count + 1).padStart(4, "0");
    return `CON-${year}${month}-${sequence}`;
  }

  /**
   * Obtener fase inicial del proceso
   * @private
   */
  async _getInitialPhase(contractTypeId) {
    try {
      // Buscar la primera fase (orden 1)
      const initialPhases = await this.contractPhaseRepository.findAll(
        { order: 1, isActive: true },
        { limit: 1, sort: { order: 1 } }
      );

      return initialPhases.docs[0] || null;
    } catch (error) {
      console.warn("No se pudo obtener fase inicial:", error.message);
      return null;
    }
  }

  /**
   * Poblar datos del contrato con información relacionada
   * @private
   */
  async _populateContractData(contract) {
    if (!contract) return null;

    return await this.contractRepository.findById(contract._id || contract.id, {
      populate: [
        { path: "contractType", select: "code name category" },
        { path: "requestingDepartment", select: "code name shortName" },
        { path: "currentPhase", select: "code name shortName order category" },
      ],
    });
  }

  /**
   * Enriquecer resumen de contrato con datos calculados
   * @private
   */
  async _enrichContractSummary(contract) {
    const enriched = { ...contract };

    // Calcular progreso usando método del esquema
    if (typeof contract.calculateProgress === "function") {
      enriched.progress = contract.calculateProgress();
    } else {
      enriched.progress = 0;
    }

    // Calcular días restantes
    if (typeof contract.getDaysRemaining === "function") {
      enriched.daysRemaining = contract.getDaysRemaining();
      enriched.isOverdue = contract.isOverdue();
    }

    // Información de la fase actual
    if (typeof contract.getCurrentPhaseInfo === "function") {
      enriched.currentPhaseInfo = contract.getCurrentPhaseInfo();
    }

    return enriched;
  }

  /**
   * Enriquecer detalles completos del contrato
   * @private
   */
  async _enrichContractDetails(contract) {
    const enriched = await this._enrichContractSummary(contract);

    // Información adicional para vista detallada
    if (typeof contract.getBudgetUtilization === "function") {
      enriched.budgetUtilization = contract.getBudgetUtilization();
    }

    return enriched;
  }

  /**
   * Crear entrada en el historial
   * @private
   */
  async _createHistoryEntry(contractId, historyData) {
    try {
      const historyEntry = {
        contract: contractId,
        eventType: historyData.eventType,
        description: historyData.description,
        eventDate: new Date(),
        user: historyData.user,
        changeDetails: historyData.changeDetails || {},
        classification: {
          category: this._getHistoryCategory(historyData.eventType),
          severity: this._getHistorySeverity(historyData.eventType),
        },
      };

      await this.contractHistoryRepository.create(historyEntry, {
        userId: historyData.user.userId,
      });
    } catch (error) {
      console.error("Error creando entrada de historial:", error.message);
      // No lanzar error para no interrumpir la operación principal
    }
  }

  /**
   * Crear entrada de historial para actualización
   * @private
   */
  async _createUpdateHistoryEntry(
    contractId,
    originalContract,
    updatedContract,
    userId
  ) {
    // Detectar cambios significativos
    const changes = [];

    if (originalContract.generalStatus !== updatedContract.generalStatus) {
      changes.push(
        `Estado: ${originalContract.generalStatus} → ${updatedContract.generalStatus}`
      );
    }

    if (
      originalContract.budget?.estimatedValue !==
      updatedContract.budget?.estimatedValue
    ) {
      changes.push(
        `Presupuesto: ${originalContract.budget?.estimatedValue} → ${updatedContract.budget?.estimatedValue}`
      );
    }

    if (changes.length > 0) {
      await this._createHistoryEntry(contractId, {
        eventType: "DATA_MODIFICATION",
        description: `Contrato actualizado: ${changes.join(", ")}`,
        user: { userId, name: "Usuario" },
        changeDetails: {
          changes: changes,
        },
      });
    }
  }

  /**
   * Validar transición de estado
   * @private
   */
  async _validateStatusTransition(currentStatus, newStatus) {
    const validTransitions = {
      DRAFT: ["PREPARATION", "CANCELLED"],
      PREPARATION: ["CALL", "CANCELLED"],
      CALL: ["EVALUATION", "CANCELLED"],
      EVALUATION: ["AWARD", "CANCELLED"],
      AWARD: ["CONTRACTING", "CANCELLED"],
      CONTRACTING: ["EXECUTION", "CANCELLED"],
      EXECUTION: ["FINISHED", "SUSPENDED", "CANCELLED"],
      FINISHED: ["LIQUIDATED"],
      SUSPENDED: ["EXECUTION", "CANCELLED"],
      CANCELLED: [], // Estado final
      LIQUIDATED: [], // Estado final
    };

    const allowedTransitions = validTransitions[currentStatus] || [];

    if (!allowedTransitions.includes(newStatus)) {
      throw createError(
        ERROR_CODES.VALIDATION_ERROR,
        `Transición de estado no válida: ${currentStatus} → ${newStatus}`,
        400
      );
    }
  }

  /**
   * Obtener estado general basado en la categoría de fase
   * @private
   */
  _getStatusFromPhase(phaseCategory) {
    const statusMapping = {
      PREPARATORY: "PREPARATION",
      PRECONTRACTUAL: "CALL",
      EXECUTION: "EXECUTION",
      PAYMENT: "EXECUTION",
      RECEPTION: "FINISHED",
    };

    return statusMapping[phaseCategory] || "PREPARATION";
  }

  /**
   * Obtener pasos siguientes para una fase
   * @private
   */
  _getPhaseNextSteps(phase) {
    const nextSteps = {
      PREPARATORY: [
        "Completar certificación presupuestaria",
        "Elaborar términos de referencia",
        "Realizar estudios de mercado",
      ],
      PRECONTRACTUAL: [
        "Publicar proceso en portal de compras",
        "Recibir ofertas de proveedores",
        "Evaluar propuestas técnicas y económicas",
      ],
      EXECUTION: [
        "Suscribir contrato con adjudicatario",
        "Obtener garantías de cumplimiento",
        "Iniciar ejecución de trabajos",
      ],
      PAYMENT: [
        "Procesar facturas del proveedor",
        "Aplicar retenciones tributarias",
        "Autorizar pagos correspondientes",
      ],
      RECEPTION: [
        "Realizar acta de entrega-recepción",
        "Elaborar informe final de fiscalización",
        "Proceder con liquidación del contrato",
      ],
    };

    return nextSteps[phase.category] || ["Seguir procedimientos estándar"];
  }

  /**
   * Obtener categoría de historial para un evento
   * @private
   */
  _getHistoryCategory(eventType) {
    const categories = {
      CREATION: "PROCESS",
      PHASE_CHANGE: "PROCESS",
      STATUS_CHANGE: "PROCESS",
      DOCUMENT_UPLOAD: "DOCUMENT",
      DOCUMENT_APPROVAL: "DOCUMENT",
      DATA_MODIFICATION: "MODIFICATION",
      PAYMENT_MADE: "FINANCIAL",
    };

    return categories[eventType] || "OTHER";
  }

  /**
   * Obtener severidad de historial para un evento
   * @private
   */
  _getHistorySeverity(eventType) {
    const severities = {
      CREATION: "NORMAL",
      PHASE_CHANGE: "IMPORTANT",
      STATUS_CHANGE: "IMPORTANT",
      PROCESS_CANCELLATION: "CRITICAL",
      PAYMENT_MADE: "NORMAL",
    };

    return severities[eventType] || "NORMAL";
  }

  /**
   * Métodos auxiliares para estadísticas (implementaciones simplificadas)
   * @private
   */
  async _getStatusDistribution(filters) {
    return await this.contractRepository.model.aggregate([
      { $match: filters },
      { $group: { _id: "$generalStatus", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
  }

  async _getPhaseDistribution(filters) {
    return await this.contractRepository.model.aggregate([
      { $match: filters },
      {
        $lookup: {
          from: "contractphases",
          localField: "currentPhase",
          foreignField: "_id",
          as: "phaseInfo",
        },
      },
      { $unwind: { path: "$phaseInfo", preserveNullAndEmptyArrays: true } },
      { $group: { _id: "$phaseInfo.name", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
  }

  async _getTypeDistribution(filters) {
    return await this.contractRepository.model.aggregate([
      { $match: filters },
      {
        $lookup: {
          from: "contracttypes",
          localField: "contractType",
          foreignField: "_id",
          as: "typeInfo",
        },
      },
      { $unwind: { path: "$typeInfo", preserveNullAndEmptyArrays: true } },
      { $group: { _id: "$typeInfo.name", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
  }

  async _getTrendData(filters) {
    // Implementación simplificada de tendencias
    return {
      monthly: [],
      status: "stable",
      growth: 0,
    };
  }

  async _getAlerts(filters) {
    // Implementación simplificada de alertas
    return [];
  }

  async _getRecentActivity(filters, limit) {
    return await this.contractHistoryRepository.findAll(
      { ...filters },
      { limit, sort: { eventDate: -1 } }
    );
  }

  async _getUpcomingDeadlines(filters, days) {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    return await this.contractRepository.findAll(
      {
        ...filters,
        "timeline.executionEndDate": { $lte: futureDate },
      },
      { limit: 10 }
    );
  }

  async _getFinancialSummary(filters) {
    const result = await this.contractRepository.model.aggregate([
      { $match: filters },
      {
        $group: {
          _id: null,
          totalEstimated: { $sum: "$budget.estimatedValue" },
          totalAwarded: { $sum: "$budget.awardedValue" },
          avgValue: { $avg: "$budget.estimatedValue" },
        },
      },
    ]);

    return result[0] || { totalEstimated: 0, totalAwarded: 0, avgValue: 0 };
  }

  // Métodos simplificados para funcionalidades avanzadas
  async _validatePhaseDocuments(contractId, phaseId) {
    // Implementación pendiente - validar documentos requeridos
    return true;
  }

  async _getContractPhases(contractId) {
    // Implementación pendiente - obtener fases del contrato
    return [];
  }

  async _getContractHistory(contractId, options) {
    return await this.contractHistoryRepository.findAll(
      { contract: contractId },
      options
    );
  }

  async _getContractDocuments(contractId) {
    // Implementación pendiente - obtener documentos del contrato
    return [];
  }

  async _calculateContractStatistics(contract) {
    return {
      progress: contract.calculateProgress ? contract.calculateProgress() : 0,
      daysRemaining: contract.getDaysRemaining
        ? contract.getDaysRemaining()
        : null,
      isOverdue: contract.isOverdue ? contract.isOverdue() : false,
      budgetUtilization: contract.getBudgetUtilization
        ? contract.getBudgetUtilization()
        : 0,
    };
  }

  async _calculateTrends(filters, dateFrom, dateTo) {
    // Implementación simplificada
    return { direction: "stable", percentage: 0 };
  }

  async _calculateComparisons(filters, dateFrom, dateTo) {
    // Implementación simplificada
    return { previousPeriod: {}, variance: 0 };
  }

  _formatChartData(stats, groupBy) {
    return {
      labels: stats.map((s) => s._id),
      data: stats.map((s) => s.count),
      type: "pie",
    };
  }

  async _formatContractsForExport(contracts, options) {
    // Formatear datos para exportación
    return contracts.map((contract) => ({
      Número: contract.contractNumber,
      "Objeto Contractual": contract.contractualObject,
      Estado: contract.generalStatus,
      Departamento: contract.requestingDepartment?.name,
      "Valor Estimado": contract.budget?.estimatedValue,
      "Fecha Creación": contract.createdAt,
    }));
  }

  // =============================================================================
  // EXPORTACIÓN A EXCEL
  // =============================================================================

  /**
   * Generar exportación a Excel con formato profesional
   * @param {Array} data - Datos de contratos formateados
   * @param {Object} options - Opciones de exportación
   * @returns {Promise<Object>} Buffer y metadatos del archivo Excel
   */
  async _generateExcelExport(data, options = {}) {
    try {
      console.log("📊 Generando exportación a Excel...");

      const {
        includeDocuments = false,
        includeHistory = false,
        includeFinancialData = true,
        exportedBy = "Sistema",
        exportDate = new Date(),
        filters = {},
      } = options;

      // Crear nuevo workbook
      const workbook = new ExcelJS.Workbook();

      // Configurar metadatos del archivo
      workbook.creator = "GADM Cantón Esmeraldas";
      workbook.lastModifiedBy = exportedBy;
      workbook.created = exportDate;
      workbook.modified = exportDate;
      workbook.lastPrinted = exportDate;

      // === HOJA PRINCIPAL: CONTRATOS ===
      const contractsSheet = workbook.addWorksheet("Contratos", {
        pageSetup: {
          paperSize: 9, // A4
          orientation: "landscape",
          fitToPage: true,
          margins: {
            left: 0.7,
            right: 0.7,
            top: 0.75,
            bottom: 0.75,
            header: 0.3,
            footer: 0.3,
          },
        },
      });

      // Configurar columnas principales
      const columns = [
        { header: "N° Contrato", key: "contractNumber", width: 15 },
        { header: "Objeto Contractual", key: "contractualObject", width: 40 },
        { header: "Estado", key: "generalStatus", width: 15 },
        { header: "Tipo", key: "contractType", width: 20 },
        { header: "Departamento", key: "department", width: 25 },
        { header: "Fase Actual", key: "currentPhase", width: 20 },
        { header: "Progreso (%)", key: "progress", width: 12 },
      ];

      // Agregar columnas financieras si se incluyen
      if (includeFinancialData) {
        columns.push(
          { header: "Valor Estimado", key: "estimatedValue", width: 18 },
          { header: "Valor Adjudicado", key: "awardedValue", width: 18 },
          { header: "Moneda", key: "currency", width: 10 }
        );
      }

      columns.push(
        { header: "Fecha Creación", key: "createdAt", width: 15 },
        { header: "Días Restantes", key: "daysRemaining", width: 15 },
        { header: "Estado Tiempo", key: "timeStatus", width: 12 }
      );

      contractsSheet.columns = columns;

      // === ESTILOS DE ENCABEZADO ===
      const headerRow = contractsSheet.getRow(1);
      headerRow.height = 25;

      headerRow.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF2E7D32" }, // Verde oscuro del GADM
        };
        cell.font = {
          name: "Arial",
          size: 11,
          bold: true,
          color: { argb: "FFFFFFFF" },
        };
        cell.alignment = {
          vertical: "middle",
          horizontal: "center",
          wrapText: true,
        };
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });

      // === LLENAR DATOS ===
      data.forEach((contract, index) => {
        const rowIndex = index + 2;
        const row = contractsSheet.getRow(rowIndex);

        row.values = {
          contractNumber: contract.contractNumber || "N/A",
          contractualObject: contract.contractualObject || "N/A",
          generalStatus: this._translateStatus(contract.generalStatus),
          contractType: contract.contractTypeInfo?.name || "N/A",
          department: contract.departmentInfo?.name || "N/A",
          currentPhase: contract.currentPhaseInfo?.name || "N/A",
          progress: contract.progress || 0,
          ...(includeFinancialData && {
            estimatedValue: contract.budget?.estimatedValue || 0,
            awardedValue: contract.budget?.awardedValue || 0,
            currency: contract.budget?.currency || "USD",
          }),
          createdAt: contract.createdAt ? new Date(contract.createdAt) : null,
          daysRemaining: contract.daysRemaining || "N/A",
          timeStatus: this._getTimeStatus(
            contract.daysRemaining,
            contract.isOverdue
          ),
        };

        // Aplicar formato condicional por estado
        this._applyContractRowFormatting(row, contract, includeFinancialData);
      });

      // === HOJA DE RESUMEN ===
      const summarySheet = workbook.addWorksheet("Resumen Ejecutivo");
      await this._generateSummarySheet(
        summarySheet,
        data,
        includeFinancialData
      );

      // === HOJA DE FILTROS APLICADOS ===
      const filtersSheet = workbook.addWorksheet("Filtros Aplicados");
      await this._generateFiltersSheet(
        filtersSheet,
        filters,
        exportDate,
        exportedBy
      );

      // === AGREGAR HOJAS ADICIONALES ===
      if (includeDocuments) {
        const documentsSheet = workbook.addWorksheet("Documentos por Fase");
        await this._generateDocumentsSheet(documentsSheet, data);
      }

      if (includeHistory) {
        const historySheet = workbook.addWorksheet("Historial de Cambios");
        await this._generateHistorySheet(historySheet, data);
      }

      // === GENERAR BUFFER ===
      const buffer = await workbook.xlsx.writeBuffer();
      const filename = `contratos_${new Date().toISOString().split("T")[0]}_${Date.now()}.xlsx`;

      console.log(
        `✅ Excel generado: ${data.length} contratos, ${workbook.worksheets.length} hojas`
      );

      return {
        buffer,
        filename,
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        size: buffer.length,
        sheets: workbook.worksheets.map((ws) => ({
          name: ws.name,
          rowCount: ws.rowCount,
          columnCount: ws.columnCount,
        })),
      };
    } catch (error) {
      console.error("❌ Error generando Excel:", error);
      throw new Error(`Error generando exportación Excel: ${error.message}`);
    }
  }

  // =============================================================================
  // EXPORTACIÓN A PDF
  // =============================================================================

  /**
   * Generar exportación a PDF con diseño profesional
   * @param {Array} data - Datos de contratos formateados
   * @param {Object} options - Opciones de exportación
   * @returns {Promise<Object>} Buffer y metadatos del archivo PDF
   */
  async _generatePDFExport(data, options = {}) {
    try {
      console.log("📄 Generando exportación a PDF...");

      const {
        includeDocuments = false,
        includeFinancialData = true,
        exportedBy = "Sistema",
        exportDate = new Date(),
        filters = {},
      } = options;

      // Crear documento PDF
      const doc = new PDFDocument({
        size: "A4",
        layout: "landscape", // Para mejor visualización de tablas
        margins: {
          top: 50,
          bottom: 50,
          left: 30,
          right: 30,
        },
      });

      // Buffer para almacenar el PDF
      const buffers = [];
      doc.on("data", buffers.push.bind(buffers));

      const pdfPromise = new Promise((resolve) => {
        doc.on("end", () => {
          const pdfBuffer = Buffer.concat(buffers);
          resolve(pdfBuffer);
        });
      });

      // === ENCABEZADO DEL DOCUMENTO ===
      await this._generatePDFHeader(doc, exportDate, exportedBy, data.length);

      // === INFORMACIÓN DE FILTROS ===
      if (Object.keys(filters).length > 0) {
        await this._generatePDFFilters(doc, filters);
      }

      // === TABLA DE CONTRATOS ===
      await this._generatePDFContractsTable(doc, data, includeFinancialData);

      // === RESUMEN ESTADÍSTICO ===
      doc.addPage();
      await this._generatePDFSummary(doc, data, includeFinancialData);

      // === GRÁFICOS ESTADÍSTICOS ===
      if (data.length > 0) {
        doc.addPage();
        await this._generatePDFCharts(doc, data);
      }

      // === PIE DE PÁGINA ===
      this._generatePDFFooter(doc, exportDate);

      // Finalizar documento
      doc.end();

      const buffer = await pdfPromise;
      const filename = `contratos_reporte_${new Date().toISOString().split("T")[0]}.pdf`;

      console.log(
        `✅ PDF generado: ${data.length} contratos, ${buffer.length} bytes`
      );

      return {
        buffer,
        filename,
        mimeType: "application/pdf",
        size: buffer.length,
        pages: doc._pageBuffer.length || 1,
      };
    } catch (error) {
      console.error("❌ Error generando PDF:", error);
      throw new Error(`Error generando exportación PDF: ${error.message}`);
    }
  }

  // =============================================================================
  // EXPORTACIÓN A CSV
  // =============================================================================

  /**
   * Generar exportación a CSV con codificación UTF-8
   * @param {Array} data - Datos de contratos formateados
   * @param {Object} options - Opciones de exportación
   * @returns {Promise<Object>} Buffer y metadatos del archivo CSV
   */
  async _generateCSVExport(data, options = {}) {
    try {
      console.log("📝 Generando exportación a CSV...");

      const {
        includeFinancialData = true,
        exportedBy = "Sistema",
        exportDate = new Date(),
        delimiter = ",",
        encoding = "utf8",
      } = options;

      // Definir estructura de columnas
      const baseHeaders = [
        { id: "contractNumber", title: "Número de Contrato" },
        { id: "contractualObject", title: "Objeto Contractual" },
        { id: "generalStatus", title: "Estado General" },
        { id: "contractType", title: "Tipo de Contratación" },
        { id: "department", title: "Departamento Solicitante" },
        { id: "currentPhase", title: "Fase Actual" },
        { id: "progress", title: "Progreso (%)" },
      ];

      // Agregar columnas financieras si se incluyen
      const financialHeaders = includeFinancialData
        ? [
            { id: "estimatedValue", title: "Valor Estimado" },
            { id: "awardedValue", title: "Valor Adjudicado" },
            { id: "currency", title: "Moneda" },
            { id: "budgetUtilization", title: "Utilización Presupuesto (%)" },
          ]
        : [];

      const timeHeaders = [
        { id: "createdAt", title: "Fecha de Creación" },
        { id: "lastUpdate", title: "Última Actualización" },
        { id: "daysRemaining", title: "Días Restantes" },
        { id: "timeStatus", title: "Estado de Tiempo" },
        { id: "isOverdue", title: "Vencido" },
      ];

      const headers = [...baseHeaders, ...financialHeaders, ...timeHeaders];

      // Crear archivo temporal para CSV
      const tempDir = path.join(__dirname, "../../../temp");
      await fs.mkdir(tempDir, { recursive: true });

      const tempFile = path.join(tempDir, `contracts_${Date.now()}.csv`);

      // Configurar writer CSV
      const csvWriter = createObjectCsvWriter({
        path: tempFile,
        header: headers,
        encoding: encoding,
        fieldDelimiter: delimiter,
      });

      // Formatear datos para CSV
      const csvData = data.map((contract) => {
        const baseData = {
          contractNumber: contract.contractNumber || "N/A",
          contractualObject: this._cleanTextForCSV(contract.contractualObject),
          generalStatus: this._translateStatus(contract.generalStatus),
          contractType: contract.contractTypeInfo?.name || "N/A",
          department: contract.departmentInfo?.name || "N/A",
          currentPhase: contract.currentPhaseInfo?.name || "N/A",
          progress: contract.progress || 0,
        };

        const financialData = includeFinancialData
          ? {
              estimatedValue: contract.budget?.estimatedValue || 0,
              awardedValue: contract.budget?.awardedValue || 0,
              currency: contract.budget?.currency || "USD",
              budgetUtilization: contract.budgetUtilization || 0,
            }
          : {};

        const timeData = {
          createdAt: contract.createdAt
            ? new Date(contract.createdAt).toLocaleDateString("es-EC")
            : "N/A",
          lastUpdate: contract.updatedAt
            ? new Date(contract.updatedAt).toLocaleDateString("es-EC")
            : "N/A",
          daysRemaining: contract.daysRemaining || "N/A",
          timeStatus: this._getTimeStatus(
            contract.daysRemaining,
            contract.isOverdue
          ),
          isOverdue: contract.isOverdue ? "Sí" : "No",
        };

        return { ...baseData, ...financialData, ...timeData };
      });

      // Escribir datos al CSV
      await csvWriter.writeRecords(csvData);

      // Leer el archivo generado
      const csvBuffer = await fs.readFile(tempFile);

      // Agregar BOM para UTF-8 (mejor compatibilidad con Excel)
      const bomBuffer = Buffer.from([0xef, 0xbb, 0xbf]);
      const finalBuffer = Buffer.concat([bomBuffer, csvBuffer]);

      // Limpiar archivo temporal
      await fs.unlink(tempFile);

      const filename = `contratos_${new Date().toISOString().split("T")[0]}.csv`;

      console.log(
        `✅ CSV generado: ${data.length} registros, ${finalBuffer.length} bytes`
      );

      return {
        buffer: finalBuffer,
        filename,
        mimeType: "text/csv; charset=utf-8",
        size: finalBuffer.length,
        recordCount: csvData.length,
        columnCount: headers.length,
      };
    } catch (error) {
      console.error("❌ Error generando CSV:", error);
      throw new Error(`Error generando exportación CSV: ${error.message}`);
    }
  }

  // =============================================================================
  // FUNCIONES AUXILIARES PARA EXCEL
  // =============================================================================

  /**
   * Aplicar formato condicional a filas de contratos
   * @private
   */
  _applyContractRowFormatting(row, contract, includeFinancialData) {
    // Altura de fila
    row.height = 20;

    // Aplicar bordes a todas las celdas
    row.eachCell((cell, colNumber) => {
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
      cell.alignment = { vertical: "middle" };
    });

    // Colorear por estado
    const statusColors = {
      DRAFT: "FFF3E0", // Naranja claro
      PREPARATION: "E8F5E8", // Verde claro
      EXECUTION: "E3F2FD", // Azul claro
      FINISHED: "F1F8E9", // Verde muy claro
      CANCELLED: "FFEBEE", // Rojo claro
    };

    const statusColor = statusColors[contract.generalStatus] || "FFFFFF";
    row.eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: statusColor },
      };
    });

    // Formatear columnas específicas
    if (includeFinancialData) {
      // Formato de moneda para valores
      const estimatedValueCell = row.getCell("estimatedValue");
      const awardedValueCell = row.getCell("awardedValue");

      if (estimatedValueCell.value) {
        estimatedValueCell.numFmt = '"$"#,##0.00';
      }
      if (awardedValueCell.value) {
        awardedValueCell.numFmt = '"$"#,##0.00';
      }
    }

    // Formato de porcentaje para progreso
    const progressCell = row.getCell("progress");
    if (progressCell.value !== undefined) {
      progressCell.numFmt = '0"%"';
    }

    // Formato de fecha
    const dateCell = row.getCell("createdAt");
    if (dateCell.value) {
      dateCell.numFmt = "dd/mm/yyyy";
    }

    // Destacar contratos vencidos
    if (contract.isOverdue) {
      const timeStatusCell = row.getCell("timeStatus");
      if (timeStatusCell) {
        timeStatusCell.font = { color: { argb: "FFFF0000" }, bold: true };
      }
    }
  }

  /**
   * Generar hoja de resumen ejecutivo
   * @private
   */
  async _generateSummarySheet(sheet, data, includeFinancialData) {
    // Título
    sheet.getCell("A1").value = "RESUMEN EJECUTIVO DE CONTRATOS";
    sheet.getCell("A1").font = { size: 16, bold: true };
    sheet.mergeCells("A1:E1");

    let rowIndex = 3;

    // Estadísticas generales
    const stats = this._calculateDataStatistics(data, includeFinancialData);

    sheet.getCell(`A${rowIndex}`).value = "ESTADÍSTICAS GENERALES";
    sheet.getCell(`A${rowIndex}`).font = { size: 12, bold: true };
    rowIndex += 2;

    Object.entries(stats.general).forEach(([key, value]) => {
      sheet.getCell(`A${rowIndex}`).value = key;
      sheet.getCell(`B${rowIndex}`).value = value;
      rowIndex++;
    });

    rowIndex += 2;

    // Distribución por estado
    sheet.getCell(`A${rowIndex}`).value = "DISTRIBUCIÓN POR ESTADO";
    sheet.getCell(`A${rowIndex}`).font = { size: 12, bold: true };
    rowIndex += 2;

    Object.entries(stats.byStatus).forEach(([status, count]) => {
      sheet.getCell(`A${rowIndex}`).value = this._translateStatus(status);
      sheet.getCell(`B${rowIndex}`).value = count;
      rowIndex++;
    });

    // Aplicar formato a la hoja
    sheet.columns = [{ width: 30 }, { width: 20 }];
  }

  /**
   * Generar hoja de filtros aplicados
   * @private
   */
  async _generateFiltersSheet(sheet, filters, exportDate, exportedBy) {
    sheet.getCell("A1").value = "FILTROS APLICADOS EN LA EXPORTACIÓN";
    sheet.getCell("A1").font = { size: 14, bold: true };

    let rowIndex = 3;

    // Información de exportación
    sheet.getCell(`A${rowIndex}`).value = "Exportado por:";
    sheet.getCell(`B${rowIndex}`).value = exportedBy;
    rowIndex++;

    sheet.getCell(`A${rowIndex}`).value = "Fecha de exportación:";
    sheet.getCell(`B${rowIndex}`).value = exportDate.toLocaleString("es-EC");
    rowIndex += 2;

    // Filtros aplicados
    if (Object.keys(filters).length > 0) {
      sheet.getCell(`A${rowIndex}`).value = "FILTROS APLICADOS:";
      sheet.getCell(`A${rowIndex}`).font = { bold: true };
      rowIndex += 2;

      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
          sheet.getCell(`A${rowIndex}`).value = this._translateFilterName(key);
          sheet.getCell(`B${rowIndex}`).value = value.toString();
          rowIndex++;
        }
      });
    } else {
      sheet.getCell(`A${rowIndex}`).value =
        "Sin filtros aplicados - Exportación completa";
    }

    sheet.columns = [{ width: 25 }, { width: 30 }];
  }

  // =============================================================================
  // FUNCIONES AUXILIARES PARA PDF
  // =============================================================================

  /**
   * Generar encabezado del PDF
   * @private
   */
  async _generatePDFHeader(doc, exportDate, exportedBy, recordCount) {
    // Logo y encabezado institucional
    doc
      .fontSize(18)
      .font("Helvetica-Bold")
      .text("GOBIERNO AUTÓNOMO DESCENTRALIZADO MUNICIPAL", 50, 50)
      .fontSize(16)
      .text("CANTÓN ESMERALDAS", 50, 75)
      .fontSize(14)
      .font("Helvetica")
      .text("Sistema de Expediente Digital - Reporte de Contratos", 50, 100);

    // Información del reporte
    doc
      .fontSize(10)
      .text(`Generado el: ${exportDate.toLocaleString("es-EC")}`, 500, 50)
      .text(`Exportado por: ${exportedBy}`, 500, 65)
      .text(`Total de registros: ${recordCount}`, 500, 80);

    // Línea separadora
    doc
      .moveTo(50, 130)
      .lineTo(750, 130)
      .strokeColor("#2E7D32")
      .lineWidth(2)
      .stroke();

    doc.y = 150;
  }

  /**
   * Generar tabla de contratos en PDF
   * @private
   */
  async _generatePDFContractsTable(doc, data, includeFinancialData) {
    const tableTop = doc.y + 20;
    const itemHeight = 20;
    const headers = [
      "N° Contrato",
      "Objeto",
      "Estado",
      "Departamento",
      "Progreso",
    ];

    if (includeFinancialData) {
      headers.push("Valor ($)");
    }

    // Dibujar encabezados
    let x = 50;
    const columnWidths = [80, 200, 80, 150, 60];
    if (includeFinancialData) columnWidths.push(80);

    doc.fontSize(10).font("Helvetica-Bold");
    headers.forEach((header, i) => {
      doc
        .rect(x, tableTop, columnWidths[i], itemHeight)
        .fillAndStroke("#2E7D32", "#000000")
        .fill("#FFFFFF")
        .text(header, x + 5, tableTop + 6, {
          width: columnWidths[i] - 10,
          align: "center",
        });
      x += columnWidths[i];
    });

    // Dibujar filas de datos
    doc.font("Helvetica").fontSize(8);
    data.slice(0, 25).forEach((contract, index) => {
      // Limitar a 25 registros por página
      const y = tableTop + itemHeight * (index + 1);
      x = 50;

      const row = [
        contract.contractNumber || "N/A",
        this._truncateText(contract.contractualObject || "N/A", 30),
        this._translateStatus(contract.generalStatus),
        this._truncateText(contract.departmentInfo?.name || "N/A", 20),
        `${contract.progress || 0}%`,
      ];

      if (includeFinancialData) {
        row.push(`$${(contract.budget?.estimatedValue || 0).toLocaleString()}`);
      }

      row.forEach((cellData, i) => {
        doc
          .rect(x, y, columnWidths[i], itemHeight)
          .stroke("#000000")
          .text(cellData, x + 5, y + 6, {
            width: columnWidths[i] - 10,
            height: itemHeight - 12,
            ellipsis: true,
          });
        x += columnWidths[i];
      });
    });
  }

  // =============================================================================
  // FUNCIONES AUXILIARES GENERALES
  // =============================================================================

  /**
   * Traducir códigos de estado a texto legible
   * @private
   */
  _translateStatus(status) {
    const translations = {
      DRAFT: "Borrador",
      PREPARATION: "Preparación",
      CALL: "Convocatoria",
      EVALUATION: "Evaluación",
      AWARD: "Adjudicación",
      CONTRACTING: "Contratación",
      EXECUTION: "Ejecución",
      FINISHED: "Finalizado",
      LIQUIDATED: "Liquidado",
      CANCELLED: "Cancelado",
      SUSPENDED: "Suspendido",
    };

    return translations[status] || status;
  }

  /**
   * Obtener estado de tiempo basado en días restantes
   * @private
   */
  _getTimeStatus(daysRemaining, isOverdue) {
    if (isOverdue) return "Vencido";
    if (daysRemaining === null || daysRemaining === "N/A")
      return "Sin fecha límite";
    if (daysRemaining <= 0) return "Vencido";
    if (daysRemaining <= 7) return "Próximo a vencer";
    if (daysRemaining <= 30) return "En plazo crítico";
    return "En plazo normal";
  }

  /**
   * Limpiar texto para CSV
   * @private
   */
  _cleanTextForCSV(text) {
    if (!text) return "";
    return text
      .replace(/"/g, '""')
      .replace(/[\r\n]/g, " ")
      .trim();
  }

  /**
   * Truncar texto para PDF
   * @private
   */
  _truncateText(text, maxLength) {
    if (!text) return "";
    return text.length > maxLength
      ? text.substring(0, maxLength) + "..."
      : text;
  }

  /**
   * Traducir nombres de filtros
   * @private
   */
  _translateFilterName(filterKey) {
    const translations = {
      status: "Estado",
      contractType: "Tipo de Contrato",
      departmentId: "Departamento",
      dateFrom: "Fecha desde",
      dateTo: "Fecha hasta",
      search: "Búsqueda de texto",
      includeInactive: "Incluir inactivos",
    };

    return translations[filterKey] || filterKey;
  }

  /**
   * Calcular estadísticas de los datos
   * @private
   */
  _calculateDataStatistics(data, includeFinancialData) {
    const stats = {
      general: {
        "Total de contratos": data.length,
        "Contratos activos": data.filter((c) => c.generalStatus !== "CANCELLED")
          .length,
        "Progreso promedio":
          Math.round(
            data.reduce((sum, c) => sum + (c.progress || 0), 0) / data.length
          ) + "%",
        "Contratos vencidos": data.filter((c) => c.isOverdue).length,
      },
      byStatus: {},
    };

    // Calcular distribución por estado
    data.forEach((contract) => {
      const status = contract.generalStatus;
      stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;
    });

    // Agregar estadísticas financieras si están incluidas
    if (includeFinancialData) {
      const totalEstimated = data.reduce(
        (sum, c) => sum + (c.budget?.estimatedValue || 0),
        0
      );
      const totalAwarded = data.reduce(
        (sum, c) => sum + (c.budget?.awardedValue || 0),
        0
      );

      stats.general["Valor total estimado"] =
        `$${totalEstimated.toLocaleString()}`;
      stats.general["Valor total adjudicado"] =
        `$${totalAwarded.toLocaleString()}`;
      stats.general["Valor promedio"] =
        `$${Math.round(totalEstimated / data.length).toLocaleString()}`;
    }

    return stats;
  }
}
