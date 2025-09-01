// =============================================================================
// src/module/exp-digital/services/contract.service.js
// Servicio para gestión completa de contratos del expediente digital
// GADM Cantón Esmeraldas - Basado en repositorios existentes
// =============================================================================

import { ContractRepository } from "../repositories/contract.repository.js";
import { ContractPhaseRepository } from "../repositories/contract-phase.repository.js";
import { ContractHistoryRepository } from "../repositories/contract-history.repository.js";
import { ContractTypeRepository } from "../repositories/contract-type.repository.js";
import {
  createError,
  createValidationError,
  ERROR_CODES,
} from "#utils/error.util.js";
import {
  validateObjectId,
  validateRequiredFields,
} from "#utils/validation.util.js";
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
    this.contractTypeRepository = new ContractTypeRepository();
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
      console.log("📝 Service: Iniciando creación de contrato");

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
                completedAt: null,
                duration: null,
              },
            ]
          : [],
        timeline: {
          creationDate: new Date(),
          lastStatusChange: new Date(),
          expectedCompletion: this._calculateExpectedCompletion(initialPhase),
        },
        audit: {
          createdBy: contractData.createdBy,
          createdAt: new Date(),
          updatedAt: new Date(),
          version: 1,
        },
      };

      // Crear contrato usando el repositorio
      const newContract =
        await this.contractRepository.create(contractToCreate);

      // Crear entrada en el historial si está habilitado
      if (options.createHistory) {
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
      }

      console.log(
        `✅ Service: Contrato creado exitosamente: ${contractNumber}`
      );

      return await this._populateContractData(newContract);
    } catch (error) {
      console.error(`❌ Service: Error creando contrato: ${error.message}`);
      throw createError(
        ERROR_CODES.CREATION_ERROR,
        `Error al crear contrato: ${error.message}`,
        400
      );
    }
  }

  /**
   * Obtener todos los contratos con filtros y paginación
   * @param {Object} filters - Filtros de búsqueda procesados por el controlador
   * @returns {Promise<Object>} Lista paginada de contratos
   */
  async getAllContracts(filters = {}) {
    try {
      console.log("📋 Service: Obteniendo contratos con filtros:", filters);

      const {
        page = 1,
        limit = 20,
        status,
        contractType,
        requestingDepartment,
        dateFrom,
        dateTo,
        search,
        sortBy = "createdAt",
        sortOrder = "desc",
        includeInactive = false,
        includeDeleted = false,
        populate = [],
        departmentAccess,
      } = filters;

      // Construir query de MongoDB basado en los filtros
      let mongoQuery = {};

      // Filtro de eliminados
      if (!includeDeleted) {
        mongoQuery.isActive = true;
      }

      // Filtros de estado
      if (status) {
        mongoQuery.generalStatus = status;
      }

      // Filtros de tipo de contrato
      if (contractType) {
        validateObjectId(contractType, "ID del tipo de contrato");
        mongoQuery.contractType = contractType;
      }

      // Filtros de departamento según acceso
      if (departmentAccess && departmentAccess.type === "specific") {
        mongoQuery.requestingDepartment = {
          $in: departmentAccess.departmentIds,
        };
      } else if (requestingDepartment) {
        validateObjectId(requestingDepartment, "ID del departamento");
        mongoQuery.requestingDepartment = requestingDepartment;
      }

      // Filtros de fecha
      if (dateFrom || dateTo) {
        mongoQuery.createdAt = {};
        if (dateFrom) mongoQuery.createdAt.$gte = dateFrom;
        if (dateTo) mongoQuery.createdAt.$lte = dateTo;
      }

      // Filtro de búsqueda textual
      if (search) {
        mongoQuery.$or = [
          { contractNumber: { $regex: search, $options: "i" } },
          { contractualObject: { $regex: search, $options: "i" } },
          { "supplier.name": { $regex: search, $options: "i" } },
        ];
      }

      // Configurar opciones de consulta
      const queryOptions = {
        page,
        limit,
        sort: { [sortBy]: sortOrder === "desc" ? -1 : 1 },
        populate: this._buildPopulateArray(populate),
      };

      // Ejecutar consulta usando el repositorio
      const result = await this.contractRepository.findWithPagination(
        mongoQuery,
        queryOptions
      );

      // Enriquecer contratos con información adicional
      const enrichedContracts = await Promise.all(
        result.docs.map((contract) => this._enrichContractSummary(contract))
      );

      // Preparar respuesta
      const response = {
        contracts: enrichedContracts,
        pagination: {
          currentPage: result.page,
          totalPages: result.totalPages,
          totalContracts: result.totalDocs,
          limit: result.limit,
          hasNextPage: result.hasNextPage,
          hasPrevPage: result.hasPrevPage,
        },
        appliedFilters: {
          status,
          contractType,
          requestingDepartment,
          dateRange: dateFrom || dateTo ? { from: dateFrom, to: dateTo } : null,
          search,
          sorting: { field: sortBy, order: sortOrder },
          departmentAccess: departmentAccess
            ? {
                type: departmentAccess.type,
                filterApplied: !!mongoQuery.requestingDepartment,
              }
            : null,
        },
      };

      console.log(
        `✅ Service: Contratos obtenidos: ${enrichedContracts.length}/${result.totalDocs}`
      );

      return response;
    } catch (error) {
      console.error(`❌ Service: Error obteniendo contratos: ${error.message}`);
      throw createError(
        ERROR_CODES.QUERY_ERROR,
        `Error al obtener contratos: ${error.message}`,
        500
      );
    }
  }

  /**
   * Obtener contrato por ID con información completa
   * @param {String} contractId - ID del contrato
   * @param {Object} options - Opciones de consulta
   * @returns {Promise<Object>} Contrato con información detallada
   */
  async getContractById(contractId, options = {}) {
    try {
      validateObjectId(contractId, "ID del contrato");

      console.log(`🔍 Service: Obteniendo contrato por ID: ${contractId}`);

      const {
        includeHistory = false,
        includeDocuments = false,
        includePhases = false,
      } = options;

      // Obtener contrato base con populate
      const contract = await this.contractRepository.findById(contractId, {
        populate: [
          { path: "contractType", select: "code name category" },
          { path: "requestingDepartment", select: "code name shortName" },
          {
            path: "currentPhase",
            select: "code name shortName order category",
          },
          { path: "createdBy", select: "firstName lastName email" },
        ],
      });

      if (!contract) {
        return null;
      }

      const result = {
        contract: await this._enrichContractSummary(contract),
      };

      // Incluir historial si se solicita
      if (includeHistory) {
        result.history = await this.contractHistoryRepository.findByContractId(
          contractId,
          { limit: 50, sort: { createdAt: -1 } }
        );
      }

      // Incluir documentos si se solicita
      if (includeDocuments) {
        result.documents = contract.documents || [];
      }

      // Incluir información de fases si se solicita
      if (includePhases) {
        result.phases = await this._getContractPhases(contract);
      }

      // Calcular estadísticas
      result.statistics = await this._calculateContractStatistics(contract);

      console.log(
        `✅ Service: Contrato detallado obtenido: ${contract.contractNumber}`
      );

      return result;
    } catch (error) {
      console.error(`❌ Service: Error obteniendo contrato: ${error.message}`);
      throw createError(
        ERROR_CODES.QUERY_ERROR,
        `Error al obtener contrato: ${error.message}`,
        500
      );
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

      console.log(`✏️ Service: Actualizando contrato: ${contractId}`);

      const {
        userData,
        createHistory = true,
        validateTransitions = true,
      } = options;

      // Obtener contrato actual
      const currentContract =
        await this.contractRepository.findById(contractId);
      if (!currentContract) {
        throw createError(ERROR_CODES.NOT_FOUND, "Contrato no encontrado", 404);
      }

      // Validar transiciones de estado si está habilitado
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
        "audit.lastModifiedBy": userData?.userId,
        "audit.version": (currentContract.audit?.version || 1) + 1,
      };

      // Remover campos protegidos
      const protectedFields = [
        "_id",
        "contractNumber",
        "createdAt",
        "createdBy",
      ];
      protectedFields.forEach((field) => delete dataToUpdate[field]);

      // Actualizar usando el repositorio
      const updatedContract = await this.contractRepository.updateById(
        contractId,
        dataToUpdate
      );

      // Crear entrada en historial si está habilitado
      if (createHistory) {
        await this._createUpdateHistoryEntry(
          contractId,
          currentContract,
          updatedContract,
          userData?.userId
        );
      }

      console.log(
        `✅ Service: Contrato actualizado: ${updatedContract.contractNumber}`
      );

      return await this._populateContractData(updatedContract);
    } catch (error) {
      console.error(
        `❌ Service: Error actualizando contrato: ${error.message}`
      );
      throw createError(
        ERROR_CODES.UPDATE_ERROR,
        `Error al actualizar contrato: ${error.message}`,
        400
      );
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

      console.log(`🗑️ Service: Eliminando contrato: ${contractId}`);

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
        throw createValidationError(
          "No se puede eliminar un contrato en ejecución o finalizado"
        );
      }

      let result;

      if (softDelete) {
        // Soft delete - marcar como eliminado
        result = await this.contractRepository.updateById(contractId, {
          isActive: false,
          deletedAt: new Date(),
          deletionReason: reason,
          generalStatus: "CANCELLED",
          "audit.deletedBy": deletedBy,
          "audit.deletedAt": new Date(),
        });
      } else {
        // Hard delete (solo para casos excepcionales)
        result = await this.contractRepository.deleteById(contractId);
      }

      // Crear entrada en historial
      if (createHistory && softDelete) {
        await this._createHistoryEntry(contractId, {
          eventType: "DELETION",
          description: `Contrato eliminado. Razón: ${reason}`,
          user: {
            userId: deletedBy,
          },
          changeDetails: {
            previousStatus: contract.generalStatus,
            newStatus: "CANCELLED",
            reason,
          },
        });
      }

      console.log(`✅ Service: Contrato eliminado: ${contract.contractNumber}`);

      return {
        contractNumber: contract.contractNumber,
        deletedAt: new Date(),
        deletionReason: reason,
        type: softDelete ? "soft_delete" : "hard_delete",
      };
    } catch (error) {
      console.error(`❌ Service: Error eliminando contrato: ${error.message}`);
      throw createError(
        ERROR_CODES.DELETE_ERROR,
        `Error al eliminar contrato: ${error.message}`,
        400
      );
    }
  }

  // =============================================================================
  // OPERACIONES DE GESTIÓN DE FASES
  // =============================================================================

  /**
   * Avanzar a la siguiente fase del contrato
   * @param {String} contractId - ID del contrato
   * @param {Object} options - Opciones para el avance
   * @returns {Promise<Object>} Resultado del avance de fase
   */
  async advanceContractPhase(contractId, options = {}) {
    try {
      validateObjectId(contractId, "ID del contrato");

      console.log(`➡️ Service: Avanzando fase del contrato: ${contractId}`);

      const {
        userId,
        observations,
        skipValidations = false,
        createHistory = true,
      } = options;

      // Obtener contrato actual
      const contract = await this.contractRepository.findById(contractId, {
        populate: [
          { path: "currentPhase", select: "code name order category" },
          { path: "phases.phase", select: "code name order category" },
        ],
      });

      if (!contract) {
        throw createError(ERROR_CODES.NOT_FOUND, "Contrato no encontrado", 404);
      }

      // Obtener la siguiente fase
      const nextPhase = await this._getNextPhase(
        contract.currentPhase,
        contract.contractType
      );

      if (!nextPhase) {
        throw createValidationError(
          "No hay siguiente fase disponible para este contrato"
        );
      }

      // Validar que se puede avanzar (si no se saltan las validaciones)
      if (!skipValidations) {
        await this._validatePhaseAdvancement(contract, nextPhase);
      }

      // Completar la fase actual
      const updatedPhases = contract.phases.map((phaseEntry) => {
        if (phaseEntry.phase.toString() === contract.currentPhase.toString()) {
          return {
            ...phaseEntry,
            status: "COMPLETED",
            completedAt: new Date(),
            observations: [
              ...(phaseEntry.observations || []),
              ...(observations ? [observations] : []),
            ],
            duration: Math.floor(
              (new Date() - phaseEntry.startDate) / (1000 * 60 * 60 * 24)
            ), // días
          };
        }
        return phaseEntry;
      });

      // Agregar nueva fase
      updatedPhases.push({
        phase: nextPhase._id,
        status: "IN_PROGRESS",
        startDate: new Date(),
        assignedTo: userId,
        documents: [],
        observations: observations ? [observations] : [],
        completedAt: null,
        duration: null,
      });

      // Actualizar contrato
      const updatedContract = await this.contractRepository.updateById(
        contractId,
        {
          currentPhase: nextPhase._id,
          phases: updatedPhases,
          "timeline.lastStatusChange": new Date(),
          "audit.lastModifiedAt": new Date(),
          "audit.lastModifiedBy": userId,
        }
      );

      // Crear entrada en historial
      if (createHistory) {
        await this._createHistoryEntry(contractId, {
          eventType: "PHASE_ADVANCEMENT",
          description: `Contrato avanzado de ${contract.currentPhase.name} a ${nextPhase.name}`,
          user: { userId },
          changeDetails: {
            previousPhase: {
              id: contract.currentPhase._id,
              name: contract.currentPhase.name,
            },
            newPhase: {
              id: nextPhase._id,
              name: nextPhase.name,
            },
            observations,
          },
        });
      }

      console.log(
        `✅ Service: Fase avanzada: ${contract.currentPhase.name} → ${nextPhase.name}`
      );

      return {
        contract: await this._populateContractData(updatedContract),
        previousPhase: contract.currentPhase,
        currentPhase: nextPhase,
        message: `Contrato avanzado a fase: ${nextPhase.name}`,
      };
    } catch (error) {
      console.error(`❌ Service: Error avanzando fase: ${error.message}`);
      throw createError(
        ERROR_CODES.PHASE_ERROR,
        `Error al avanzar fase del contrato: ${error.message}`,
        400
      );
    }
  }

  /**
   * Actualizar fase específica del contrato
   * @param {String} contractId - ID del contrato
   * @param {String} phaseId - ID de la fase
   * @param {Object} updateData - Datos a actualizar
   * @param {Object} options - Opciones adicionales
   * @returns {Promise<Object>} Fase actualizada
   */
  async updateContractPhase(contractId, phaseId, updateData, options = {}) {
    try {
      validateObjectId(contractId, "ID del contrato");
      validateObjectId(phaseId, "ID de la fase");

      console.log(
        `📝 Service: Actualizando fase ${phaseId} del contrato: ${contractId}`
      );

      const { userId, createHistory = true } = options;

      // Obtener contrato
      const contract = await this.contractRepository.findById(contractId);
      if (!contract) {
        throw createError(ERROR_CODES.NOT_FOUND, "Contrato no encontrado", 404);
      }

      // Encontrar y actualizar la fase específica
      const updatedPhases = contract.phases.map((phaseEntry) => {
        if (phaseEntry.phase.toString() === phaseId) {
          return {
            ...phaseEntry,
            ...updateData,
            lastUpdated: new Date(),
            lastUpdatedBy: userId,
          };
        }
        return phaseEntry;
      });

      // Actualizar contrato
      await this.contractRepository.updateById(contractId, {
        phases: updatedPhases,
        "audit.lastModifiedAt": new Date(),
        "audit.lastModifiedBy": userId,
      });

      // Encontrar la fase actualizada
      const updatedPhase = updatedPhases.find(
        (phase) => phase.phase.toString() === phaseId
      );

      // Crear entrada en historial
      if (createHistory) {
        await this._createHistoryEntry(contractId, {
          eventType: "PHASE_UPDATE",
          description: `Fase actualizada`,
          user: { userId },
          changeDetails: {
            phaseId,
            updates: updateData,
          },
        });
      }

      console.log(`✅ Service: Fase actualizada exitosamente`);

      return updatedPhase;
    } catch (error) {
      console.error(`❌ Service: Error actualizando fase: ${error.message}`);
      throw createError(
        ERROR_CODES.UPDATE_ERROR,
        `Error al actualizar fase del contrato: ${error.message}`,
        400
      );
    }
  }

  // =============================================================================
  // OPERACIONES DE ESTADÍSTICAS Y REPORTES
  // =============================================================================

  /**
   * Obtener estadísticas de contratos
   * @param {Object} options - Opciones para las estadísticas
   * @returns {Promise<Object>} Estadísticas de contratos
   */
  async getContractsStatistics(options = {}) {
    try {
      console.log("📊 Service: Generando estadísticas de contratos");

      const { period = "month", departmentId = null } = options;

      // Construir filtros base
      let matchStage = { isActive: true };

      if (departmentId) {
        validateObjectId(departmentId, "ID del departamento");
        matchStage.requestingDepartment = departmentId;
      }

      // Definir rango de fechas según el período
      const now = new Date();
      let startDate;

      switch (period) {
        case "week":
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case "month":
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case "quarter":
          const quarter = Math.floor(now.getMonth() / 3);
          startDate = new Date(now.getFullYear(), quarter * 3, 1);
          break;
        case "year":
          startDate = new Date(now.getFullYear(), 0, 1);
          break;
        default:
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      }

      matchStage.createdAt = { $gte: startDate };

      // Pipeline de agregación
      const pipeline = [
        { $match: matchStage },
        {
          $lookup: {
            from: "contracttypes",
            localField: "contractType",
            foreignField: "_id",
            as: "contractTypeInfo",
          },
        },
        {
          $group: {
            _id: null,
            totalContracts: { $sum: 1 },
            totalValue: { $sum: "$budget.totalAmount" },
            avgValue: { $avg: "$budget.totalAmount" },
            byStatus: {
              $push: {
                status: "$generalStatus",
                value: "$budget.totalAmount",
              },
            },
            byType: {
              $push: {
                type: { $arrayElemAt: ["$contractTypeInfo.name", 0] },
                value: "$budget.totalAmount",
              },
            },
          },
        },
      ];

      const [stats] = await this.contractRepository.aggregate(pipeline);

      if (!stats) {
        return {
          period,
          departmentId,
          totalContracts: 0,
          totalValue: 0,
          avgValue: 0,
          byStatus: {},
          byType: {},
          trends: [],
        };
      }

      // Procesar estadísticas por estado
      const statusStats = {};
      stats.byStatus.forEach((item) => {
        if (!statusStats[item.status]) {
          statusStats[item.status] = { count: 0, value: 0 };
        }
        statusStats[item.status].count += 1;
        statusStats[item.status].value += item.value || 0;
      });

      // Procesar estadísticas por tipo
      const typeStats = {};
      stats.byType.forEach((item) => {
        if (!typeStats[item.type]) {
          typeStats[item.type] = { count: 0, value: 0 };
        }
        typeStats[item.type].count += 1;
        typeStats[item.type].value += item.value || 0;
      });

      console.log("✅ Service: Estadísticas generadas exitosamente");

      return {
        period,
        departmentId,
        dateRange: {
          from: startDate,
          to: now,
        },
        totalContracts: stats.totalContracts,
        totalValue: stats.totalValue,
        avgValue: stats.avgValue,
        byStatus: statusStats,
        byType: typeStats,
        generatedAt: new Date(),
      };
    } catch (error) {
      console.error(
        `❌ Service: Error generando estadísticas: ${error.message}`
      );
      throw createError(
        ERROR_CODES.STATISTICS_ERROR,
        `Error al generar estadísticas: ${error.message}`,
        500
      );
    }
  }

  /**
   * Exportar contratos en diferentes formatos
   * @param {String} format - Formato de exportación (xlsx, csv, pdf)
   * @param {Object} options - Opciones de exportación
   * @returns {Promise<Object>} Archivo exportado
   */
  async exportContracts(format, options = {}) {
    try {
      console.log(`📤 Service: Exportando contratos en formato: ${format}`);

      const { filters = {}, includeDeleted = false } = options;

      // Obtener contratos para exportar
      const contracts = await this.getAllContracts({
        ...filters,
        includeDeleted,
        limit: 10000, // Límite alto para exportación
        populate: ["contractType", "requestingDepartment", "currentPhase"],
      });

      let result;

      switch (format.toLowerCase()) {
        case "xlsx":
          result = await this._exportToExcel(contracts.contracts);
          break;
        case "csv":
          result = await this._exportToCSV(contracts.contracts);
          break;
        case "pdf":
          result = await this._exportToPDF(contracts.contracts);
          break;
        default:
          throw createValidationError(
            `Formato de exportación no soportado: ${format}`
          );
      }

      console.log(`✅ Service: Exportación completada: ${result.filename}`);

      return result;
    } catch (error) {
      console.error(`❌ Service: Error exportando contratos: ${error.message}`);
      throw createError(
        ERROR_CODES.EXPORT_ERROR,
        `Error al exportar contratos: ${error.message}`,
        500
      );
    }
  }

  // =============================================================================
  // MÉTODOS PRIVADOS Y UTILIDADES
  // =============================================================================

  /**
   * Validar datos del contrato antes de crear/actualizar
   * @param {Object} contractData - Datos del contrato
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
    const missingFields = requiredFields.filter(
      (field) => !contractData[field]
    );

    if (missingFields.length > 0) {
      throw createValidationError(
        `Campos requeridos faltantes: ${missingFields.join(", ")}`
      );
    }

    // Validar ObjectIds
    validateObjectId(contractData.contractType, "Tipo de contrato");
    validateObjectId(
      contractData.requestingDepartment,
      "Departamento solicitante"
    );

    // Validar que el tipo de contrato exista y esté activo
    const contractType = await this.contractTypeRepository.findById(
      contractData.contractType
    );
    if (!contractType || !contractType.isActive) {
      throw createValidationError("Tipo de contrato no encontrado o inactivo");
    }

    // Validar presupuesto
    if (
      !contractData.budget.totalAmount ||
      contractData.budget.totalAmount <= 0
    ) {
      throw createValidationError(
        "El monto total del presupuesto debe ser mayor a 0"
      );
    }
  }

  /**
   * Generar número único de contrato
   * @param {String} departmentId - ID del departamento
   * @param {String} contractTypeId - ID del tipo de contrato
   * @returns {Promise<String>} Número de contrato único
   * @private
   */
  async _generateContractNumber(departmentId, contractTypeId) {
    const year = new Date().getFullYear();

    // Obtener información del departamento y tipo de contrato
    const [department, contractType] = await Promise.all([
      this.contractRepository.findById(departmentId), // Asumiendo que hay un departmentRepository
      this.contractTypeRepository.findById(contractTypeId),
    ]);

    // Generar secuencial
    const count = await this.contractRepository.countDocuments({
      requestingDepartment: departmentId,
      createdAt: {
        $gte: new Date(year, 0, 1),
        $lte: new Date(year, 11, 31),
      },
    });

    const sequential = String(count + 1).padStart(4, "0");

    return `${contractType?.code || "CON"}-${year}-${sequential}`;
  }

  /**
   * Obtener fase inicial según el tipo de contrato
   * @param {String} contractTypeId - ID del tipo de contrato
   * @returns {Promise<Object>} Fase inicial
   * @private
   */
  async _getInitialPhase(contractTypeId) {
    // Obtener todas las fases aplicables al tipo de contrato, ordenadas por order
    const phases = await this.contractPhaseRepository.find(
      {
        isActive: true,
        $or: [
          { applicableContractTypes: { $size: 0 } }, // Aplicable a todos
          { "applicableContractTypes.contractType": contractTypeId },
        ],
      },
      {
        sort: { order: 1 },
        limit: 1,
      }
    );

    return phases.length > 0 ? phases[0] : null;
  }

  /**
   * Obtener siguiente fase del contrato
   * @param {String} currentPhaseId - ID de la fase actual
   * @param {String} contractTypeId - ID del tipo de contrato
   * @returns {Promise<Object>} Siguiente fase
   * @private
   */
  async _getNextPhase(currentPhaseId, contractTypeId) {
    const currentPhase =
      await this.contractPhaseRepository.findById(currentPhaseId);
    if (!currentPhase) return null;

    // Buscar la siguiente fase por orden
    const nextPhases = await this.contractPhaseRepository.find(
      {
        isActive: true,
        order: { $gt: currentPhase.order },
        $or: [
          { applicableContractTypes: { $size: 0 } },
          { "applicableContractTypes.contractType": contractTypeId },
        ],
      },
      {
        sort: { order: 1 },
        limit: 1,
      }
    );

    return nextPhases.length > 0 ? nextPhases[0] : null;
  }

  /**
   * Calcular fecha esperada de finalización
   * @param {Object} initialPhase - Fase inicial
   * @returns {Date} Fecha esperada de finalización
   * @private
   */
  _calculateExpectedCompletion(initialPhase) {
    if (!initialPhase) return null;

    const now = new Date();
    const estimatedDays = initialPhase.estimatedDuration || 30;

    return new Date(now.getTime() + estimatedDays * 24 * 60 * 60 * 1000);
  }

  /**
   * Validar transición de estado
   * @param {String} currentStatus - Estado actual
   * @param {String} newStatus - Nuevo estado
   * @private
   */
  async _validateStatusTransition(currentStatus, newStatus) {
    const validTransitions = {
      DRAFT: ["IN_PROCESS", "CANCELLED"],
      IN_PROCESS: ["EXECUTION", "CANCELLED"],
      EXECUTION: ["FINISHED", "CANCELLED"],
      FINISHED: [], // No se puede cambiar desde finalizado
      CANCELLED: [], // No se puede cambiar desde cancelado
    };

    if (!validTransitions[currentStatus]?.includes(newStatus)) {
      throw createValidationError(
        `Transición de estado no válida: ${currentStatus} → ${newStatus}`
      );
    }
  }

  /**
   * Validar que se puede avanzar de fase
   * @param {Object} contract - Contrato actual
   * @param {Object} nextPhase - Siguiente fase
   * @private
   */
  async _validatePhaseAdvancement(contract, nextPhase) {
    // Validar que la fase actual esté completa (esto depende de la lógica de negocio)
    const currentPhaseEntry = contract.phases.find(
      (p) => p.phase.toString() === contract.currentPhase.toString()
    );

    if (
      currentPhaseEntry?.status !== "COMPLETED" &&
      currentPhaseEntry?.status !== "IN_PROGRESS"
    ) {
      throw createValidationError(
        "La fase actual debe estar completada para poder avanzar"
      );
    }

    // Validar dependencias de la siguiente fase
    if (nextPhase.dependencies?.requiredPhases?.length > 0) {
      // Implementar validación de dependencias según la lógica de negocio
    }
  }

  /**
   * Poblar datos del contrato con información relacionada
   * @param {Object} contract - Contrato base
   * @returns {Promise<Object>} Contrato poblado
   * @private
   */
  async _populateContractData(contract) {
    return await this.contractRepository.findById(contract._id, {
      populate: [
        { path: "contractType", select: "code name category" },
        { path: "requestingDepartment", select: "code name shortName" },
        { path: "currentPhase", select: "code name shortName order category" },
        { path: "createdBy", select: "firstName lastName email" },
      ],
    });
  }

  /**
   * Construir array de populate según los campos solicitados
   * @param {Array} populateFields - Campos a poblar
   * @returns {Array} Array de populate
   * @private
   */
  _buildPopulateArray(populateFields = []) {
    const availablePopulates = {
      requestingDepartment: {
        path: "requestingDepartment",
        select: "code name shortName isActive",
      },
      createdBy: {
        path: "createdBy",
        select: "firstName lastName email",
      },
      contractType: {
        path: "contractType",
        select: "code name category",
      },
      currentPhase: {
        path: "currentPhase",
        select: "code name shortName order category",
      },
    };

    // Si no se especifican campos, usar populate por defecto
    if (populateFields.length === 0) {
      return [
        availablePopulates.requestingDepartment,
        availablePopulates.createdBy,
        availablePopulates.contractType,
        availablePopulates.currentPhase,
      ];
    }

    // Construir array según campos solicitados
    return populateFields
      .map((field) => field.trim())
      .filter((field) => availablePopulates[field])
      .map((field) => availablePopulates[field]);
  }

  /**
   * Enriquecer contrato con información adicional calculada
   * @param {Object} contract - Contrato base
   * @returns {Object} Contrato enriquecido
   * @private
   */
  async _enrichContractSummary(contract) {
    const enriched = contract.toObject ? contract.toObject() : contract;

    // Calcular estadísticas básicas
    enriched.stats = {
      daysActive: contract.createdAt
        ? Math.floor((new Date() - contract.createdAt) / (1000 * 60 * 60 * 24))
        : 0,
      documentsCount: contract.documents ? contract.documents.length : 0,
      phasesCount: contract.phases ? contract.phases.length : 0,
      budgetFormatted: contract.budget?.totalAmount
        ? new Intl.NumberFormat("es-EC", {
            style: "currency",
            currency: "USD",
          }).format(contract.budget.totalAmount)
        : "$0.00",
    };

    return enriched;
  }

  /**
   * Obtener fases del contrato con información detallada
   * @param {Object} contract - Contrato
   * @returns {Promise<Array>} Fases del contrato
   * @private
   */
  async _getContractPhases(contract) {
    if (!contract.phases || contract.phases.length === 0) return [];

    const phaseIds = contract.phases.map((p) => p.phase);
    const phaseDetails = await this.contractPhaseRepository.find({
      _id: { $in: phaseIds },
    });

    return contract.phases.map((phaseEntry) => {
      const phaseDetail = phaseDetails.find(
        (p) => p._id.toString() === phaseEntry.phase.toString()
      );
      return {
        ...phaseEntry,
        phaseDetail,
      };
    });
  }

  /**
   * Calcular estadísticas del contrato
   * @param {Object} contract - Contrato
   * @returns {Promise<Object>} Estadísticas
   * @private
   */
  async _calculateContractStatistics(contract) {
    const completedPhases =
      contract.phases?.filter((p) => p.status === "COMPLETED") || [];
    const totalPhases = contract.phases?.length || 0;

    return {
      completion: {
        completed: completedPhases.length,
        total: totalPhases,
        percentage:
          totalPhases > 0
            ? Math.round((completedPhases.length / totalPhases) * 100)
            : 0,
      },
      timeline: {
        created: contract.createdAt,
        lastUpdate: contract.audit?.lastModifiedAt || contract.createdAt,
        expectedCompletion: contract.timeline?.expectedCompletion,
      },
      budget: {
        total: contract.budget?.totalAmount || 0,
        executed: contract.budget?.executedAmount || 0,
        remaining:
          (contract.budget?.totalAmount || 0) -
          (contract.budget?.executedAmount || 0),
      },
    };
  }

  /**
   * Crear entrada en el historial
   * @param {String} contractId - ID del contrato
   * @param {Object} eventData - Datos del evento
   * @private
   */
  async _createHistoryEntry(contractId, eventData) {
    try {
      await this.contractHistoryRepository.create({
        contract: contractId,
        ...eventData,
        createdAt: new Date(),
      });
    } catch (error) {
      console.warn(`⚠️ Error creando entrada en historial: ${error.message}`);
    }
  }

  /**
   * Crear entrada de historial para actualización
   * @param {String} contractId - ID del contrato
   * @param {Object} oldContract - Contrato anterior
   * @param {Object} newContract - Contrato actualizado
   * @param {String} userId - ID del usuario
   * @private
   */
  async _createUpdateHistoryEntry(
    contractId,
    oldContract,
    newContract,
    userId
  ) {
    try {
      const changes = this._detectChanges(oldContract, newContract);

      if (changes.length === 0) return;

      await this._createHistoryEntry(contractId, {
        eventType: "UPDATE",
        description: `Contrato actualizado - ${changes.length} cambio(s)`,
        user: { userId },
        changeDetails: {
          changes,
          version: newContract.audit?.version || 1,
        },
      });
    } catch (error) {
      console.warn(
        `⚠️ Error creando entrada de actualización: ${error.message}`
      );
    }
  }

  /**
   * Detectar cambios entre dos versiones del contrato
   * @param {Object} oldContract - Contrato anterior
   * @param {Object} newContract - Contrato actualizado
   * @returns {Array} Lista de cambios detectados
   * @private
   */
  _detectChanges(oldContract, newContract) {
    const changes = [];
    const fieldsToWatch = [
      "contractualObject",
      "generalStatus",
      "budget.totalAmount",
      "currentPhase",
    ];

    fieldsToWatch.forEach((field) => {
      const oldValue = this._getNestedValue(oldContract, field);
      const newValue = this._getNestedValue(newContract, field);

      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        changes.push({
          field,
          oldValue,
          newValue,
        });
      }
    });

    return changes;
  }

  /**
   * Obtener valor anidado de un objeto
   * @param {Object} obj - Objeto
   * @param {String} path - Ruta del campo (ej: "budget.totalAmount")
   * @returns {*} Valor del campo
   * @private
   */
  _getNestedValue(obj, path) {
    return path.split(".").reduce((current, key) => current?.[key], obj);
  }

  /**
   * Exportar contratos a Excel
   * @param {Array} contracts - Lista de contratos
   * @returns {Promise<Object>} Archivo Excel
   * @private
   */
  async _exportToExcel(contracts) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Contratos");

    // Definir columnas
    worksheet.columns = [
      { header: "Número", key: "contractNumber", width: 15 },
      { header: "Objeto Contractual", key: "contractualObject", width: 30 },
      { header: "Estado", key: "generalStatus", width: 12 },
      { header: "Tipo", key: "contractType", width: 20 },
      { header: "Departamento", key: "department", width: 20 },
      { header: "Monto Total", key: "totalAmount", width: 15 },
      { header: "Fase Actual", key: "currentPhase", width: 20 },
      { header: "Fecha Creación", key: "createdAt", width: 12 },
    ];

    // Agregar datos
    contracts.forEach((contract) => {
      worksheet.addRow({
        contractNumber: contract.contractNumber,
        contractualObject: contract.contractualObject,
        generalStatus: contract.generalStatus,
        contractType: contract.contractType?.name || "N/A",
        department: contract.requestingDepartment?.name || "N/A",
        totalAmount: contract.budget?.totalAmount || 0,
        currentPhase: contract.currentPhase?.name || "N/A",
        createdAt: contract.createdAt,
      });
    });

    // Generar buffer
    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `contratos_${new Date().toISOString().split("T")[0]}.xlsx`;

    return {
      buffer,
      filename,
      contentType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
  }

  /**
   * Exportar contratos a CSV
   * @param {Array} contracts - Lista de contratos
   * @returns {Promise<Object>} Archivo CSV
   * @private
   */
  async _exportToCSV(contracts) {
    const csvData = contracts.map((contract) => ({
      numero: contract.contractNumber,
      objeto: contract.contractualObject,
      estado: contract.generalStatus,
      tipo: contract.contractType?.name || "N/A",
      departamento: contract.requestingDepartment?.name || "N/A",
      monto: contract.budget?.totalAmount || 0,
      fase: contract.currentPhase?.name || "N/A",
      fecha: contract.createdAt?.toISOString().split("T")[0],
    }));

    const csvString = [
      // Headers
      Object.keys(csvData[0] || {}).join(","),
      // Data
      ...csvData.map((row) => Object.values(row).join(",")),
    ].join("\n");

    const buffer = Buffer.from(csvString, "utf8");
    const filename = `contratos_${new Date().toISOString().split("T")[0]}.csv`;

    return {
      buffer,
      filename,
      contentType: "text/csv",
    };
  }

  /**
   * Exportar contratos a PDF
   * @param {Array} contracts - Lista de contratos
   * @returns {Promise<Object>} Archivo PDF
   * @private
   */
  async _exportToPDF(contracts) {
    const doc = new PDFDocument();
    const buffers = [];

    doc.on("data", buffers.push.bind(buffers));

    // Título
    doc.fontSize(16).text("Reporte de Contratos", { align: "center" });
    doc.moveDown();

    // Información básica
    contracts.forEach((contract) => {
      doc
        .fontSize(12)
        .text(`${contract.contractNumber} - ${contract.contractualObject}`)
        .text(`Estado: ${contract.generalStatus}`)
        .text(`Monto: $${contract.budget?.totalAmount || 0}`)
        .moveDown();
    });

    doc.end();

    return new Promise((resolve) => {
      doc.on("end", () => {
        const buffer = Buffer.concat(buffers);
        const filename = `contratos_${new Date().toISOString().split("T")[0]}.pdf`;

        resolve({
          buffer,
          filename,
          contentType: "application/pdf",
        });
      });
    });
  }
}
