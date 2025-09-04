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
import { FileRepository } from "../repositories/file.repository.js";
import { Types } from "mongoose";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class ContractService {
  constructor() {
    this.contractRepository = new ContractRepository();
    this.contractPhaseRepository = new ContractPhaseRepository();
    this.contractHistoryRepository = new ContractHistoryRepository();
    this.contractTypeRepository = new ContractTypeRepository();
    this.fileRepository = new FileRepository();
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
      const result = await this.contractRepository.findAll(
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

      const [stats] =
        await this.contractRepository.getStatsWithAggregation(pipeline);

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
    const phases = await this.contractPhaseRepository.findAll(
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
    const nextPhases = await this.contractPhaseRepository.findAll(
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
    const phaseDetails = await this.contractPhaseRepository.findAll({
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

  // =============================================================================
  // OPERACIONES MASIVAS
  // =============================================================================

  /**
   * Actualización masiva de contratos
   * @param {Array} contractIds - IDs de contratos a actualizar
   * @param {Object} updateData - Datos a actualizar
   * @param {Object} options - Opciones de la operación
   */
  async bulkUpdateContracts(contractIds, updateData, options = {}) {
    try {
      console.log(
        `📝 Service: Actualizando ${contractIds.length} contratos masivamente`
      );

      const results = {
        successful: [],
        failed: [],
        summary: {
          total: contractIds.length,
          updated: 0,
          failed: 0,
        },
      };

      // Validar permisos para cada contrato
      for (const contractId of contractIds) {
        try {
          validateObjectId(contractId, "ID del contrato");

          // Verificar acceso al contrato
          const contract = await this.contractRepository.findById(contractId);
          if (!contract) {
            results.failed.push({
              contractId,
              error: "Contrato no encontrado",
            });
            continue;
          }

          // Validar permisos del usuario
          if (
            !this._hasContractPermission(contract, options.permissions, "edit")
          ) {
            results.failed.push({
              contractId,
              error: "Sin permisos para editar este contrato",
            });
            continue;
          }

          // Preparar datos de actualización
          const dataToUpdate = {
            ...updateData,
            updatedBy: options.userId,
            updatedAt: new Date(),
          };

          // Actualizar contrato
          const updated = await this.contractRepository.updateById(
            contractId,
            dataToUpdate,
            { new: true }
          );

          // Registrar en historial
          await this._createHistoryEntry(contractId, {
            eventType: "BULK_UPDATE",
            description: "Actualización masiva de contrato",
            user: {
              userId: options.userId,
            },
            changeDetails: updateData,
          });

          results.successful.push({
            contractId,
            contract: updated,
          });
          results.summary.updated++;
        } catch (error) {
          results.failed.push({
            contractId,
            error: error.message,
          });
          results.summary.failed++;
        }
      }

      return results;
    } catch (error) {
      console.error("❌ Service error en bulkUpdateContracts:", error);
      throw error;
    }
  }

  /**
   * Eliminación masiva de contratos
   * @param {Array} contractIds - IDs de contratos a eliminar
   * @param {Object} options - Opciones de la operación
   */
  async bulkDeleteContracts(contractIds, options = {}) {
    try {
      console.log(
        `🗑️ Service: Eliminando ${contractIds.length} contratos masivamente`
      );

      const results = {
        successful: [],
        failed: [],
        summary: {
          total: contractIds.length,
          deleted: 0,
          failed: 0,
        },
      };

      for (const contractId of contractIds) {
        try {
          validateObjectId(contractId, "ID del contrato");

          const contract = await this.contractRepository.findById(contractId);
          if (!contract) {
            results.failed.push({
              contractId,
              error: "Contrato no encontrado",
            });
            continue;
          }

          // Validar permisos
          if (
            !this._hasContractPermission(
              contract,
              options.permissions,
              "delete"
            )
          ) {
            results.failed.push({
              contractId,
              error: "Sin permisos para eliminar este contrato",
            });
            continue;
          }

          // Verificar si el contrato puede eliminarse
          if (contract.generalStatus !== "DRAFT") {
            results.failed.push({
              contractId,
              error: "Solo se pueden eliminar contratos en estado BORRADOR",
            });
            continue;
          }

          // Crear backup antes de eliminar
          await AuditRepository.saveDeleteBackup({
            schema: "Contract",
            documentId: contractId,
            documentToDelete: contract.toObject
              ? contract.toObject()
              : contract,
            userData: {
              userId: options.userId,
            },
          });

          // Eliminar contrato (soft delete)
          await this.contractRepository.softDeleteById(contractId, {
            deletedBy: options.userId,
          });

          results.successful.push({
            contractId,
            contractNumber: contract.contractNumber,
          });
          results.summary.deleted++;
        } catch (error) {
          results.failed.push({
            contractId,
            error: error.message,
          });
          results.summary.failed++;
        }
      }

      return results;
    } catch (error) {
      console.error("❌ Service error en bulkDeleteContracts:", error);
      throw error;
    }
  }

  /**
   * Exportación masiva de contratos
   * @param {Array|null} contractIds - IDs específicos o null para exportar todos
   * @param {Object} options - Opciones de exportación
   */
  async bulkExportContracts(contractIds, options = {}) {
    try {
      console.log("📊 Service: Exportando contratos", {
        contractIds: contractIds ? contractIds.length : "todos",
        format: options.format,
      });

      // Construir filtros
      const filters = { ...options.filters };

      if (contractIds) {
        filters._id = { $in: contractIds.map((id) => new Types.ObjectId(id)) };
      }

      // Aplicar filtros de permisos
      this._applyPermissionFilters(filters, options.permissions);

      // Obtener contratos
      const contracts = await this.contractRepository.find(filters, {
        populate: [
          { path: "contractType", select: "name code" },
          { path: "requestingDepartment", select: "name code" },
          { path: "currentPhase", select: "name code" },
          { path: "createdBy", select: "name email" },
        ],
        lean: true,
      });

      if (contracts.length === 0) {
        throw createError("No se encontraron contratos para exportar", 404);
      }

      // Generar exportación según formato
      switch (options.format) {
        case "excel":
          return await this._exportToExcel(contracts, options);
        case "csv":
          return await this._exportToCSV(contracts, options);
        case "pdf":
          return await this._exportToPDF(contracts, options);
        default:
          return {
            format: "json",
            mimeType: "application/json",
            extension: "json",
            buffer: Buffer.from(JSON.stringify(contracts, null, 2)),
          };
      }
    } catch (error) {
      console.error("❌ Service error en bulkExportContracts:", error);
      throw error;
    }
  }

  // =============================================================================
  // GESTIÓN DE FASES
  // =============================================================================

  /**
   * Cambiar fase de contrato
   * @param {string} contractId - ID del contrato
   * @param {Object} phaseData - Datos del cambio de fase
   */
  async changeContractPhase(contractId, phaseData) {
    try {
      console.log(`🔄 Service: Cambiando fase del contrato ${contractId}`);

      const contract = await this.contractRepository.findById(contractId, {
        populate: ["currentPhase", "contractType"],
      });

      if (!contract) {
        throw createError("Contrato no encontrado", 404);
      }

      // Validar que la nueva fase sea válida
      const newPhase = await this.contractPhaseRepository.findById(
        phaseData.newPhase
      );
      if (!newPhase) {
        throw createError("Fase no válida", 400);
      }

      // Validar transición permitida
      const isValidTransition = await this._validatePhaseTransition(
        contract.currentPhase?._id,
        phaseData.newPhase,
        contract.contractType._id
      );

      if (!isValidTransition) {
        throw createError(
          "Transición de fase no permitida según el flujo establecido",
          400
        );
      }

      // Actualizar fase actual en el array de fases
      const phaseIndex = contract.phases.findIndex(
        (p) => p.phase.toString() === contract.currentPhase?._id.toString()
      );

      if (phaseIndex >= 0) {
        contract.phases[phaseIndex].status = "COMPLETED";
        contract.phases[phaseIndex].completedAt = new Date();
        contract.phases[phaseIndex].duration = this._calculatePhaseDuration(
          contract.phases[phaseIndex].startDate,
          new Date()
        );
      }

      // Agregar nueva fase
      contract.phases.push({
        phase: phaseData.newPhase,
        status: "IN_PROGRESS",
        startDate: new Date(),
        assignedTo: phaseData.userId,
        documents: [],
        observations: phaseData.observations
          ? [
              {
                content: phaseData.observations,
                createdBy: phaseData.userId,
                createdAt: new Date(),
                attachments: phaseData.attachments || [],
              },
            ]
          : [],
        completedAt: null,
        duration: null,
      });

      // Actualizar contrato
      const updatedContract = await this.contractRepository.updateById(
        contractId,
        {
          currentPhase: phaseData.newPhase,
          phases: contract.phases,
          "timeline.lastStatusChange": new Date(),
          updatedBy: phaseData.userId,
          updatedAt: new Date(),
        },
        { new: true, populate: ["currentPhase"] }
      );

      // Registrar en historial
      await this._createHistoryEntry(contractId, {
        eventType: "PHASE_CHANGE",
        description: `Cambio de fase a ${newPhase.name}`,
        user: {
          userId: phaseData.userId,
          name: phaseData.userInfo?.name,
          email: phaseData.userInfo?.email,
        },
        changeDetails: {
          previousPhase: contract.currentPhase?.name || null,
          newPhase: newPhase.name,
          observations: phaseData.observations,
        },
      });

      return updatedContract;
    } catch (error) {
      console.error("❌ Service error en changeContractPhase:", error);
      throw error;
    }
  }

  /**
   * Cambiar estado de contrato
   * @param {string} contractId - ID del contrato
   * @param {Object} statusData - Datos del cambio de estado
   */
  async changeContractStatus(contractId, statusData) {
    try {
      console.log(`🔄 Service: Cambiando estado del contrato ${contractId}`);

      const contract = await this.contractRepository.findById(contractId);
      if (!contract) {
        throw createError("Contrato no encontrado", 404);
      }

      // Validar que el cambio de estado sea permitido
      const isValidTransition = this._validateStatusTransition(
        contract.generalStatus,
        statusData.newStatus
      );

      if (!isValidTransition) {
        throw createError(
          `No es posible cambiar de estado ${contract.generalStatus} a ${statusData.newStatus}`,
          400
        );
      }

      // Registrar estado anterior
      const previousStatus = contract.generalStatus;

      // Actualizar contrato
      const updatedContract = await this.contractRepository.updateById(
        contractId,
        {
          generalStatus: statusData.newStatus,
          "timeline.lastStatusChange": new Date(),
          updatedBy: statusData.userId,
          updatedAt: new Date(),
        },
        { new: true }
      );

      // Agregar observación si se proporciona
      if (statusData.observations) {
        await this.addContractObservation(contractId, {
          content: statusData.observations,
          type: "STATUS_CHANGE",
          userId: statusData.userId,
          userInfo: statusData.userInfo,
        });
      }

      // Registrar en historial
      await this._createHistoryEntry(contractId, {
        eventType: "STATUS_CHANGE",
        description: `Cambio de estado de ${previousStatus} a ${statusData.newStatus}`,
        user: {
          userId: statusData.userId,
          name: statusData.userInfo?.name,
          email: statusData.userInfo?.email,
        },
        changeDetails: {
          previousStatus,
          newStatus: statusData.newStatus,
          reason: statusData.reason,
          observations: statusData.observations,
        },
      });

      return updatedContract;
    } catch (error) {
      console.error("❌ Service error en changeContractStatus:", error);
      throw error;
    }
  }

  /**
   * Obtener fases de un contrato
   * @param {string} contractId - ID del contrato
   */
  async getContractPhases(contractId) {
    try {
      const contract = await this.contractRepository.findById(contractId, {
        populate: [
          {
            path: "phases.phase",
            select: "name code description requiredDocuments",
          },
          { path: "phases.assignedTo", select: "name email" },
        ],
      });

      if (!contract) {
        throw createError("Contrato no encontrado", 404);
      }

      return contract.phases.map((phase) => ({
        _id: phase._id,
        phase: phase.phase,
        status: phase.status,
        startDate: phase.startDate,
        completedAt: phase.completedAt,
        duration: phase.duration,
        assignedTo: phase.assignedTo,
        documentsCount: phase.documents?.length || 0,
        observationsCount: phase.observations?.length || 0,
        progress: this._calculatePhaseProgress(phase),
      }));
    } catch (error) {
      console.error("❌ Service error en getContractPhases:", error);
      throw error;
    }
  }

  /**
   * Obtener transiciones disponibles
   * @param {string} contractId - ID del contrato
   * @param {Object} permissions - Permisos del usuario
   */
  async getAvailableTransitions(contractId, permissions) {
    try {
      const contract = await this.contractRepository.findById(contractId, {
        populate: ["currentPhase", "contractType"],
      });

      if (!contract) {
        throw createError("Contrato no encontrado", 404);
      }

      // Obtener fases disponibles según el tipo de contrato
      const availablePhases = await this.contractPhaseRepository.findAll({
        contractTypes: contract.contractType._id,
        isActive: true,
      });

      // Filtrar transiciones válidas
      const validTransitions = [];

      for (const phase of availablePhases) {
        const isValid = await this._validatePhaseTransition(
          contract.currentPhase?._id,
          phase._id,
          contract.contractType._id
        );

        if (isValid) {
          // Verificar permisos del usuario para esta transición
          const canTransition = this._canUserTransitionToPhase(
            phase,
            permissions,
            contract
          );

          if (canTransition) {
            validTransitions.push({
              phase: {
                _id: phase._id,
                name: phase.name,
                code: phase.code,
                description: phase.description,
                estimatedDuration: phase.estimatedDuration,
              },
              requirements: await this._getPhaseRequirements(
                phase._id,
                contractId
              ),
              canProceed: true,
            });
          }
        }
      }

      // También incluir cambios de estado disponibles
      const statusTransitions = this._getAvailableStatusTransitions(
        contract.generalStatus,
        permissions
      );

      return {
        phases: validTransitions,
        statuses: statusTransitions,
        current: {
          phase: contract.currentPhase,
          status: contract.generalStatus,
        },
      };
    } catch (error) {
      console.error("❌ Service error en getAvailableTransitions:", error);
      throw error;
    }
  }

  // =============================================================================
  // GESTIÓN DE DOCUMENTOS
  // =============================================================================

  /**
   * Subir documentos a un contrato
   * @param {string} contractId - ID del contrato
   * @param {Object} documentData - Datos de los documentos
   */
  async uploadContractDocuments(contractId, documentData) {
    try {
      console.log(`📄 Service: Subiendo documentos al contrato ${contractId}`);

      const contract = await this.contractRepository.findById(contractId);
      if (!contract) {
        throw createError("Contrato no encontrado", 404);
      }

      const results = {
        successful: [],
        failed: [],
      };

      for (const file of documentData.files) {
        try {
          // Crear registro del archivo
          const fileRecord = await this.fileRepository.create({
            originalName: file.originalname,
            filename: file.filename,
            path: file.path,
            size: file.size,
            mimeType: file.mimetype,
            uploadedBy: documentData.userId,
            contractId: contractId,
            documentType: documentData.documentType,
            phase: documentData.phase,
            rsyncStatus: "pending",
          });

          // Agregar documento a la fase correspondiente del contrato
          const phaseIndex = contract.phases.findIndex(
            (p) => p.phase.toString() === documentData.phase
          );

          if (phaseIndex >= 0) {
            contract.phases[phaseIndex].documents.push({
              file: fileRecord._id,
              documentType: documentData.documentType,
              uploadedBy: documentData.userId,
              uploadedAt: new Date(),
              observations: documentData.observations,
              version: 1,
              status: "active",
            });
          }

          results.successful.push({
            file: fileRecord,
            documentType: documentData.documentType,
          });
        } catch (error) {
          results.failed.push({
            filename: file.originalname,
            error: error.message,
          });
        }
      }

      // Actualizar contrato
      if (results.successful.length > 0) {
        await this.contractRepository.updateById(contractId, {
          phases: contract.phases,
          updatedBy: documentData.userId,
          updatedAt: new Date(),
        });

        // Registrar en historial
        await this._createHistoryEntry(contractId, {
          eventType: "DOCUMENT_UPLOAD",
          description: `${results.successful.length} documento(s) subido(s)`,
          user: {
            userId: documentData.userId,
            name: documentData.userInfo?.name,
            email: documentData.userInfo?.email,
          },
          changeDetails: {
            documentCount: results.successful.length,
            phase: documentData.phase,
            documentType: documentData.documentType,
          },
        });
      }

      return results;
    } catch (error) {
      console.error("❌ Service error en uploadContractDocuments:", error);
      throw error;
    }
  }

  /**
   * Obtener documentos de un contrato
   * @param {string} contractId - ID del contrato
   * @param {Object} options - Opciones de filtrado
   */
  async getContractDocuments(contractId, options = {}) {
    try {
      const contract = await this.contractRepository.findById(contractId, {
        populate: [
          {
            path: "phases.documents.file",
            populate: {
              path: "uploadedBy",
              select: "name email",
            },
          },
          { path: "phases.phase", select: "name code" },
        ],
      });

      if (!contract) {
        throw createError("Contrato no encontrado", 404);
      }

      let documents = [];

      // Extraer documentos de todas las fases
      for (const phase of contract.phases) {
        if (options.phase && phase.phase._id.toString() !== options.phase) {
          continue;
        }

        for (const doc of phase.documents) {
          if (
            options.documentType &&
            doc.documentType !== options.documentType
          ) {
            continue;
          }

          documents.push({
            _id: doc._id,
            file: doc.file,
            documentType: doc.documentType,
            phase: phase.phase,
            uploadedBy: doc.uploadedBy,
            uploadedAt: doc.uploadedAt,
            observations: doc.observations,
            version: doc.version,
            status: doc.status,
          });
        }
      }

      // Ordenar por fecha de subida (más recientes primero)
      documents.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));

      return documents;
    } catch (error) {
      console.error("❌ Service error en getContractDocuments:", error);
      throw error;
    }
  }

  /**
   * Obtener documento específico
   * @param {string} contractId - ID del contrato
   * @param {string} documentId - ID del documento
   * @param {Object} options - Opciones
   */
  async getContractDocument(contractId, documentId, options = {}) {
    try {
      const documents = await this.getContractDocuments(contractId);
      const document = documents.find(
        (doc) => doc._id.toString() === documentId
      );

      if (!document) {
        throw createError("Documento no encontrado", 404);
      }

      // Validar permisos
      if (!this._canAccessDocument(document, options.permissions)) {
        throw createError("Sin permisos para acceder a este documento", 403);
      }

      if (options.includeContent) {
        // Leer contenido del archivo
        const fileContent = await this.fileRepository.getFileContent(
          document.file._id
        );
        document.content = fileContent;
      }

      return document;
    } catch (error) {
      console.error("❌ Service error en getContractDocument:", error);
      throw error;
    }
  }

  /**
   * Actualizar documento de contrato
   * @param {string} contractId - ID del contrato
   * @param {string} documentId - ID del documento
   * @param {Object} updateData - Datos a actualizar
   */
  async updateContractDocument(contractId, documentId, updateData) {
    try {
      const contract = await this.contractRepository.findById(contractId);
      if (!contract) {
        throw createError("Contrato no encontrado", 404);
      }

      // Buscar y actualizar el documento en las fases
      let documentFound = false;
      let phaseUpdated = null;

      for (let i = 0; i < contract.phases.length; i++) {
        const docIndex = contract.phases[i].documents.findIndex(
          (doc) => doc._id.toString() === documentId
        );

        if (docIndex >= 0) {
          // Actualizar documento
          contract.phases[i].documents[docIndex] = {
            ...contract.phases[i].documents[docIndex],
            ...updateData,
            updatedAt: new Date(),
          };

          phaseUpdated = contract.phases[i].phase;
          documentFound = true;
          break;
        }
      }

      if (!documentFound) {
        throw createError("Documento no encontrado", 404);
      }

      // Guardar cambios
      const updatedContract = await this.contractRepository.updateById(
        contractId,
        {
          phases: contract.phases,
          updatedBy: updateData.userId,
          updatedAt: new Date(),
        },
        { new: true }
      );

      // Registrar en historial
      await this._createHistoryEntry(contractId, {
        eventType: "DOCUMENT_UPDATE",
        description: "Documento actualizado",
        user: {
          userId: updateData.userId,
        },
        changeDetails: {
          documentId,
          phase: phaseUpdated,
          changes: updateData,
        },
      });

      return updatedContract;
    } catch (error) {
      console.error("❌ Service error en updateContractDocument:", error);
      throw error;
    }
  }

  /**
   * Eliminar documento de contrato
   * @param {string} contractId - ID del contrato
   * @param {string} documentId - ID del documento
   * @param {Object} options - Opciones de eliminación
   */
  async deleteContractDocument(contractId, documentId, options) {
    try {
      const contract = await this.contractRepository.findById(contractId);
      if (!contract) {
        throw createError("Contrato no encontrado", 404);
      }

      // Buscar y marcar como eliminado
      let documentFound = false;

      for (let i = 0; i < contract.phases.length; i++) {
        const docIndex = contract.phases[i].documents.findIndex(
          (doc) => doc._id.toString() === documentId
        );

        if (docIndex >= 0) {
          // Marcar como eliminado (soft delete)
          contract.phases[i].documents[docIndex].status = "deleted";
          contract.phases[i].documents[docIndex].deletedAt = new Date();
          contract.phases[i].documents[docIndex].deletedBy = options.userId;
          contract.phases[i].documents[docIndex].deletionReason =
            options.reason;

          documentFound = true;
          break;
        }
      }

      if (!documentFound) {
        throw createError("Documento no encontrado", 404);
      }

      // Guardar cambios
      await this.contractRepository.updateById(contractId, {
        phases: contract.phases,
        updatedBy: options.userId,
        updatedAt: new Date(),
      });

      // Registrar en historial
      await this._createHistoryEntry(contractId, {
        eventType: "DOCUMENT_DELETE",
        description: "Documento eliminado",
        user: {
          userId: options.userId,
          name: options.userInfo?.name,
          email: options.userInfo?.email,
        },
        changeDetails: {
          documentId,
          reason: options.reason,
        },
      });
    } catch (error) {
      console.error("❌ Service error en deleteContractDocument:", error);
      throw error;
    }
  }

  // =============================================================================
  // HISTORIAL Y AUDITORÍA
  // =============================================================================

  /**
   * Obtener historial de un contrato
   * @param {string} contractId - ID del contrato
   * @param {Object} options - Opciones de filtrado y paginación
   */
  async getContractHistory(contractId, options = {}) {
    try {
      const filters = {
        contractId: new Types.ObjectId(contractId),
        ...(options.filters?.eventType && {
          eventType: options.filters.eventType,
        }),
        ...(options.filters?.dateFrom && {
          createdAt: { $gte: new Date(options.filters.dateFrom) },
        }),
        ...(options.filters?.dateTo && {
          createdAt: {
            ...filters.createdAt,
            $lte: new Date(options.filters.dateTo),
          },
        }),
      };

      const history = await this.contractHistoryRepository.paginate(filters, {
        page: options.page || 1,
        limit: options.limit || 20,
        sort: "-createdAt",
        populate: [{ path: "user.userId", select: "name email" }],
      });

      return history;
    } catch (error) {
      console.error("❌ Service error en getContractHistory:", error);
      throw error;
    }
  }

  /**
   * Obtener timeline de un contrato
   * @param {string} contractId - ID del contrato
   * @param {Object} options - Opciones de inclusión
   */
  async getContractTimeline(contractId, options = {}) {
    try {
      const [contract, history] = await Promise.all([
        this.contractRepository.findById(contractId, {
          populate: [
            { path: "phases.phase", select: "name code" },
            { path: "createdBy", select: "name email" },
          ],
        }),
        this.contractHistoryRepository.find(
          { contractId: new Types.ObjectId(contractId) },
          {
            sort: "createdAt",
            populate: [{ path: "user.userId", select: "name email" }],
          }
        ),
      ]);

      if (!contract) {
        throw createError("Contrato no encontrado", 404);
      }

      const timeline = [];

      // Agregar evento de creación
      timeline.push({
        date: contract.createdAt,
        type: "creation",
        title: "Contrato Creado",
        description: "Se creó el expediente del contrato",
        user: contract.createdBy,
        icon: "plus-circle",
      });

      // Agregar eventos de fases
      for (const phase of contract.phases) {
        timeline.push({
          date: phase.startDate,
          type: "phase_start",
          title: `Inicio de ${phase.phase.name}`,
          description: `Se inició la fase ${phase.phase.name}`,
          phase: phase.phase,
          icon: "play-circle",
        });

        if (phase.completedAt) {
          timeline.push({
            date: phase.completedAt,
            type: "phase_complete",
            title: `Finalización de ${phase.phase.name}`,
            description: `Se completó la fase ${phase.phase.name}`,
            phase: phase.phase,
            duration: phase.duration,
            icon: "check-circle",
          });
        }

        // Incluir documentos si se solicita
        if (options.includeDocuments) {
          for (const doc of phase.documents) {
            timeline.push({
              date: doc.uploadedAt,
              type: "document",
              title: "Documento Agregado",
              description: `Se subió documento: ${doc.documentType}`,
              phase: phase.phase,
              documentType: doc.documentType,
              icon: "document",
            });
          }
        }
      }

      // Agregar eventos del historial
      for (const event of history) {
        timeline.push({
          date: event.createdAt,
          type: event.eventType.toLowerCase(),
          title: this._getTimelineTitle(event.eventType),
          description: event.description,
          user: event.user.userId,
          details: event.changeDetails,
          icon: this._getTimelineIcon(event.eventType),
        });
      }

      // Ordenar por fecha
      timeline.sort((a, b) => new Date(a.date) - new Date(b.date));

      return {
        contract: {
          _id: contract._id,
          contractNumber: contract.contractNumber,
          contractualObject: contract.contractualObject,
          generalStatus: contract.generalStatus,
        },
        timeline,
        summary: {
          totalEvents: timeline.length,
          phasesCompleted: contract.phases.filter(
            (p) => p.status === "COMPLETED"
          ).length,
          totalPhases: contract.phases.length,
          documentsCount: contract.phases.reduce(
            (total, phase) => total + phase.documents.length,
            0
          ),
        },
      };
    } catch (error) {
      console.error("❌ Service error en getContractTimeline:", error);
      throw error;
    }
  }

  /**
   * Obtener auditoría de un contrato
   * @param {string} contractId - ID del contrato
   * @param {Object} options - Opciones de filtrado
   */
  async getContractAudit(contractId, options = {}) {
    try {
      const filters = {
        documentId: new Types.ObjectId(contractId),
        schema: "Contract",
        ...(options.filters?.action && { method: options.filters.action }),
        ...(options.filters?.dateFrom && {
          createdAt: { $gte: new Date(options.filters.dateFrom) },
        }),
        ...(options.filters?.dateTo && {
          createdAt: {
            ...filters.createdAt,
            $lte: new Date(options.filters.dateTo),
          },
        }),
      };

      const audit = await AuditRepository.getDocumentHistory(
        contractId,
        "Contract",
        {
          page: options.page || 1,
          limit: options.limit || 50,
        }
      );

      return audit;
    } catch (error) {
      console.error("❌ Service error en getContractAudit:", error);
      throw error;
    }
  }

  // =============================================================================
  // OBSERVACIONES
  // =============================================================================

  /**
   * Agregar observación a un contrato
   * @param {string} contractId - ID del contrato
   * @param {Object} observationData - Datos de la observación
   */
  async addContractObservation(contractId, observationData) {
    try {
      const contract = await this.contractRepository.findById(contractId);
      if (!contract) {
        throw createError("Contrato no encontrado", 404);
      }

      const observation = {
        _id: new Types.ObjectId(),
        content: observationData.content,
        type: observationData.type || "GENERAL",
        phase: observationData.phase,
        createdBy: observationData.userId,
        createdAt: new Date(),
        attachments: observationData.attachments || [],
        status: "active",
      };

      // Agregar observación a la fase correspondiente o general
      if (observationData.phase) {
        const phaseIndex = contract.phases.findIndex(
          (p) => p.phase.toString() === observationData.phase
        );

        if (phaseIndex >= 0) {
          contract.phases[phaseIndex].observations.push(observation);
        }
      } else {
        // Agregar a observaciones generales del contrato
        if (!contract.observations) {
          contract.observations = [];
        }
        contract.observations.push(observation);
      }

      // Actualizar contrato
      await this.contractRepository.updateById(contractId, {
        phases: contract.phases,
        observations: contract.observations,
        updatedBy: observationData.userId,
        updatedAt: new Date(),
      });

      // Registrar en historial
      await this._createHistoryEntry(contractId, {
        eventType: "OBSERVATION_ADDED",
        description: "Se agregó una observación",
        user: {
          userId: observationData.userId,
          name: observationData.userInfo?.name,
          email: observationData.userInfo?.email,
        },
        changeDetails: {
          observationType: observation.type,
          phase: observationData.phase,
        },
      });

      return observation;
    } catch (error) {
      console.error("❌ Service error en addContractObservation:", error);
      throw error;
    }
  }

  /**
   * Obtener observaciones de un contrato
   * @param {string} contractId - ID del contrato
   * @param {Object} options - Opciones de filtrado
   */
  async getContractObservations(contractId, options = {}) {
    try {
      const contract = await this.contractRepository.findById(contractId, {
        populate: [
          { path: "phases.phase", select: "name code" },
          { path: "phases.observations.createdBy", select: "name email" },
          { path: "observations.createdBy", select: "name email" },
        ],
      });

      if (!contract) {
        throw createError("Contrato no encontrado", 404);
      }

      let observations = [];

      // Observaciones de fases específicas
      if (options.phase) {
        const phase = contract.phases.find(
          (p) => p.phase._id.toString() === options.phase
        );

        if (phase) {
          observations = phase.observations.map((obs) => ({
            ...obs,
            phaseName: phase.phase.name,
            phaseCode: phase.phase.code,
          }));
        }
      } else {
        // Todas las observaciones
        for (const phase of contract.phases) {
          const phaseObservations = phase.observations.map((obs) => ({
            ...obs,
            phaseName: phase.phase.name,
            phaseCode: phase.phase.code,
          }));
          observations = observations.concat(phaseObservations);
        }

        // Agregar observaciones generales
        if (contract.observations) {
          observations = observations.concat(
            contract.observations.map((obs) => ({
              ...obs,
              phaseName: null,
              phaseCode: null,
            }))
          );
        }
      }

      // Filtrar por tipo si se especifica
      if (options.type) {
        observations = observations.filter((obs) => obs.type === options.type);
      }

      // Ordenar por fecha (más recientes primero)
      observations.sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      );

      // Paginar
      const startIndex = (options.page - 1) * options.limit;
      const endIndex = startIndex + options.limit;
      const paginatedObservations = observations.slice(startIndex, endIndex);

      return {
        docs: paginatedObservations,
        totalDocs: observations.length,
        limit: options.limit,
        page: options.page,
        totalPages: Math.ceil(observations.length / options.limit),
        hasNextPage: endIndex < observations.length,
        hasPrevPage: options.page > 1,
      };
    } catch (error) {
      console.error("❌ Service error en getContractObservations:", error);
      throw error;
    }
  }

  /**
   * Actualizar observación
   * @param {string} contractId - ID del contrato
   * @param {string} observationId - ID de la observación
   * @param {Object} updateData - Datos a actualizar
   */
  async updateContractObservation(contractId, observationId, updateData) {
    try {
      const contract = await this.contractRepository.findById(contractId);
      if (!contract) {
        throw createError("Contrato no encontrado", 404);
      }

      // Buscar la observación en las fases o generales
      let observationUpdated = false;

      // Buscar en fases
      for (let i = 0; i < contract.phases.length; i++) {
        const obsIndex = contract.phases[i].observations.findIndex(
          (obs) => obs._id.toString() === observationId
        );

        if (obsIndex >= 0) {
          contract.phases[i].observations[obsIndex] = {
            ...contract.phases[i].observations[obsIndex],
            ...updateData,
            updatedAt: new Date(),
          };
          observationUpdated = true;
          break;
        }
      }

      // Buscar en observaciones generales si no se encontró en fases
      if (!observationUpdated && contract.observations) {
        const obsIndex = contract.observations.findIndex(
          (obs) => obs._id.toString() === observationId
        );

        if (obsIndex >= 0) {
          contract.observations[obsIndex] = {
            ...contract.observations[obsIndex],
            ...updateData,
            updatedAt: new Date(),
          };
          observationUpdated = true;
        }
      }

      if (!observationUpdated) {
        throw createError("Observación no encontrada", 404);
      }

      // Guardar cambios
      const updatedContract = await this.contractRepository.updateById(
        contractId,
        {
          phases: contract.phases,
          observations: contract.observations,
          updatedBy: updateData.userId,
          updatedAt: new Date(),
        },
        { new: true }
      );

      return updatedContract;
    } catch (error) {
      console.error("❌ Service error en updateContractObservation:", error);
      throw error;
    }
  }

  /**
   * Eliminar observación
   * @param {string} contractId - ID del contrato
   * @param {string} observationId - ID de la observación
   * @param {Object} options - Opciones de eliminación
   */
  async deleteContractObservation(contractId, observationId, options) {
    try {
      const contract = await this.contractRepository.findById(contractId);
      if (!contract) {
        throw createError("Contrato no encontrado", 404);
      }

      let observationDeleted = false;

      // Buscar y marcar como eliminada en fases
      for (let i = 0; i < contract.phases.length; i++) {
        const obsIndex = contract.phases[i].observations.findIndex(
          (obs) => obs._id.toString() === observationId
        );

        if (obsIndex >= 0) {
          contract.phases[i].observations[obsIndex].status = "deleted";
          contract.phases[i].observations[obsIndex].deletedAt = new Date();
          contract.phases[i].observations[obsIndex].deletedBy = options.userId;
          contract.phases[i].observations[obsIndex].deletionReason =
            options.reason;
          observationDeleted = true;
          break;
        }
      }

      // Buscar en observaciones generales
      if (!observationDeleted && contract.observations) {
        const obsIndex = contract.observations.findIndex(
          (obs) => obs._id.toString() === observationId
        );

        if (obsIndex >= 0) {
          contract.observations[obsIndex].status = "deleted";
          contract.observations[obsIndex].deletedAt = new Date();
          contract.observations[obsIndex].deletedBy = options.userId;
          contract.observations[obsIndex].deletionReason = options.reason;
          observationDeleted = true;
        }
      }

      if (!observationDeleted) {
        throw createError("Observación no encontrada", 404);
      }

      // Guardar cambios
      await this.contractRepository.updateById(contractId, {
        phases: contract.phases,
        observations: contract.observations,
        updatedBy: options.userId,
        updatedAt: new Date(),
      });
    } catch (error) {
      console.error("❌ Service error en deleteContractObservation:", error);
      throw error;
    }
  }

  // =============================================================================
  // ESTADÍSTICAS Y REPORTES
  // =============================================================================

  /**
   * Obtener estadísticas de contratos
   * @param {Object} options - Opciones de filtrado
   */
  async getContractStatistics(options = {}) {
    try {
      console.log("📊 Service: Generando estadísticas de contratos");

      // Construir filtros base
      const baseFilters = this._buildDateFilters(options.period);
      this._applyPermissionFilters(baseFilters, options.permissions);

      if (options.departmentId) {
        baseFilters.requestingDepartment = new Types.ObjectId(
          options.departmentId
        );
      }

      if (options.contractType) {
        baseFilters.contractType = new Types.ObjectId(options.contractType);
      }

      // Pipeline de agregación para estadísticas generales
      const pipeline = [
        { $match: baseFilters },
        {
          $group: {
            _id: null,
            totalContracts: { $sum: 1 },
            totalBudget: { $sum: "$budget" },
            avgBudget: { $avg: "$budget" },
            statusCounts: {
              $push: "$generalStatus",
            },
          },
        },
        {
          $addFields: {
            statusDistribution: {
              $reduce: {
                input: "$statusCounts",
                initialValue: {},
                in: {
                  $mergeObjects: [
                    "$$value",
                    {
                      $cond: [
                        {
                          $eq: [
                            {
                              $type: {
                                $getField: {
                                  field: "$$this",
                                  input: "$$value",
                                },
                              },
                            },
                            "missing",
                          ],
                        },
                        { $arrayToObject: [[{ k: "$$this", v: 1 }]] },
                        {
                          $arrayToObject: [
                            [
                              {
                                k: "$$this",
                                v: {
                                  $add: [
                                    {
                                      $getField: {
                                        field: "$$this",
                                        input: "$$value",
                                      },
                                    },
                                    1,
                                  ],
                                },
                              },
                            ],
                          ],
                        },
                      ],
                    },
                  ],
                },
              },
            },
          },
        },
      ];

      const [generalStats] = await this.contractRepository.aggregate(pipeline);

      // Estadísticas por tipo de contrato
      const typeStatsPipeline = [
        { $match: baseFilters },
        {
          $lookup: {
            from: "contracttypes",
            localField: "contractType",
            foreignField: "_id",
            as: "typeInfo",
          },
        },
        { $unwind: "$typeInfo" },
        {
          $group: {
            _id: "$contractType",
            typeName: { $first: "$typeInfo.name" },
            count: { $sum: 1 },
            totalBudget: { $sum: "$budget" },
            avgBudget: { $avg: "$budget" },
          },
        },
        { $sort: { count: -1 } },
      ];

      const typeStats =
        await this.contractRepository.aggregate(typeStatspipeline);

      // Estadísticas por departamento
      const departmentStatsQuery = [
        { $match: baseFilters },
        {
          $lookup: {
            from: "departments",
            localField: "requestingDepartment",
            foreignField: "_id",
            as: "deptInfo",
          },
        },
        { $unwind: "$deptInfo" },
        {
          $group: {
            _id: "$requestingDepartment",
            departmentName: { $first: "$deptInfo.name" },
            count: { $sum: 1 },
            totalBudget: { $sum: "$budget" },
          },
        },
        { $sort: { count: -1 } },
      ];

      const departmentStats =
        await this.contractRepository.aggregate(departmentStatsQuery);

      return {
        period: options.period,
        summary: {
          totalContracts: generalStats?.totalContracts || 0,
          totalBudget: generalStats?.totalBudget || 0,
          averageBudget: generalStats?.avgBudget || 0,
          statusDistribution: generalStats?.statusDistribution || {},
        },
        byType: typeStats,
        byDepartment: departmentStats,
        generatedAt: new Date(),
      };
    } catch (error) {
      console.error("❌ Service error en getContractStatistics:", error);
      throw error;
    }
  }

  /**
   * Obtener estadísticas por departamento
   * @param {Object} options - Opciones de filtrado
   */
  async getDepartmentStatistics(options = {}) {
    try {
      const baseFilters = this._buildDateFilters(options.period);
      this._applyPermissionFilters(baseFilters, options.permissions);

      const pipeline = [
        { $match: baseFilters },
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
          $group: {
            _id: "$requestingDepartment",
            departmentName: { $first: "$department.name" },
            totalContracts: { $sum: 1 },
            totalBudget: { $sum: "$budget" },
            averageBudget: { $avg: "$budget" },
            statusDistribution: {
              $push: "$generalStatus",
            },
            contractTypes: {
              $addToSet: "$contractType",
            },
          },
        },
        {
          $addFields: {
            statusCounts: {
              $reduce: {
                input: "$statusDistribution",
                initialValue: {},
                in: {
                  $mergeObjects: [
                    "$$value",
                    {
                      $cond: [
                        {
                          $eq: [
                            {
                              $type: {
                                $getField: {
                                  field: "$$this",
                                  input: "$$value",
                                },
                              },
                            },
                            "missing",
                          ],
                        },
                        { $arrayToObject: [[{ k: "$$this", v: 1 }]] },
                        {
                          $arrayToObject: [
                            [
                              {
                                k: "$$this",
                                v: {
                                  $add: [
                                    {
                                      $getField: {
                                        field: "$$this",
                                        input: "$$value",
                                      },
                                    },
                                    1,
                                  ],
                                },
                              },
                            ],
                          ],
                        },
                      ],
                    },
                  ],
                },
              },
            },
            uniqueContractTypes: { $size: "$contractTypes" },
          },
        },
        { $sort: { totalContracts: -1 } },
      ];

      const departmentStats = await this.contractRepository.aggregate(pipeline);

      return {
        period: options.period,
        departments: departmentStats,
        summary: {
          totalDepartments: departmentStats.length,
          totalContracts: departmentStats.reduce(
            (sum, dept) => sum + dept.totalContracts,
            0
          ),
          totalBudget: departmentStats.reduce(
            (sum, dept) => sum + dept.totalBudget,
            0
          ),
        },
        generatedAt: new Date(),
      };
    } catch (error) {
      console.error("❌ Service error en getDepartmentStatistics:", error);
      throw error;
    }
  }

  /**
   * Obtener estadísticas por fase
   * @param {Object} options - Opciones de filtrado
   */
  async getPhaseStatistics(options = {}) {
    try {
      const baseFilters = this._buildDateFilters(options.period);
      this._applyPermissionFilters(baseFilters, options.permissions);

      if (options.contractType) {
        baseFilters.contractType = new Types.ObjectId(options.contractType);
      }

      const pipeline = [
        { $match: baseFilters },
        { $unwind: "$phases" },
        {
          $lookup: {
            from: "contractphases",
            localField: "phases.phase",
            foreignField: "_id",
            as: "phaseInfo",
          },
        },
        { $unwind: "$phaseInfo" },
        {
          $group: {
            _id: "$phases.phase",
            phaseName: { $first: "$phaseInfo.name" },
            phaseCode: { $first: "$phaseInfo.code" },
            totalContracts: { $sum: 1 },
            completedContracts: {
              $sum: {
                $cond: [{ $eq: ["$phases.status", "COMPLETED"] }, 1, 0],
              },
            },
            inProgressContracts: {
              $sum: {
                $cond: [{ $eq: ["$phases.status", "IN_PROGRESS"] }, 1, 0],
              },
            },
            averageDuration: {
              $avg: {
                $cond: [
                  {
                    $and: [
                      { $ne: ["$phases.duration", null] },
                      { $gt: ["$phases.duration", 0] },
                    ],
                  },
                  "$phases.duration",
                  null,
                ],
              },
            },
            documentsCount: {
              $sum: { $size: { $ifNull: ["$phases.documents", []] } },
            },
          },
        },
        {
          $addFields: {
            completionRate: {
              $multiply: [
                { $divide: ["$completedContracts", "$totalContracts"] },
                100,
              ],
            },
          },
        },
        { $sort: { totalContracts: -1 } },
      ];

      const phaseStats = await this.contractRepository.aggregate(pipeline);

      return {
        period: options.period,
        contractType: options.contractType,
        phases: phaseStats,
        summary: {
          totalPhases: phaseStats.length,
          averageCompletionRate:
            phaseStats.reduce((sum, phase) => sum + phase.completionRate, 0) /
            phaseStats.length,
          totalDocuments: phaseStats.reduce(
            (sum, phase) => sum + phase.documentsCount,
            0
          ),
        },
        generatedAt: new Date(),
      };
    } catch (error) {
      console.error("❌ Service error en getPhaseStatistics:", error);
      throw error;
    }
  }

  /**
   * Obtener estadísticas financieras
   * @param {Object} options - Opciones de filtrado
   */
  async getFinancialStatistics(options = {}) {
    try {
      const baseFilters = this._buildDateFilters(options.period);
      this._applyPermissionFilters(baseFilters, options.permissions);

      if (options.departmentId) {
        baseFilters.requestingDepartment = new Types.ObjectId(
          options.departmentId
        );
      }

      const pipeline = [
        { $match: baseFilters },
        {
          $group: {
            _id: null,
            totalBudget: { $sum: "$budget" },
            averageBudget: { $avg: "$budget" },
            maxBudget: { $max: "$budget" },
            minBudget: { $min: "$budget" },
            contractCount: { $sum: 1 },
            budgetByStatus: {
              $push: {
                status: "$generalStatus",
                budget: "$budget",
              },
            },
          },
        },
        {
          $addFields: {
            budgetDistribution: {
              $reduce: {
                input: "$budgetByStatus",
                initialValue: {},
                in: {
                  $mergeObjects: [
                    "$$value",
                    {
                      $arrayToObject: [
                        [
                          {
                            k: "$$this.status",
                            v: {
                              $add: [
                                {
                                  $ifNull: [
                                    {
                                      $getField: {
                                        field: "$$this.status",
                                        input: "$$value",
                                      },
                                    },
                                    0,
                                  ],
                                },
                                "$$this.budget",
                              ],
                            },
                          },
                        ],
                      ],
                    },
                  ],
                },
              },
            },
          },
        },
      ];

      const [financialStats] =
        await this.contractRepository.aggregate(pipeline);

      // Estadísticas por rango de presupuesto
      const budgetRanges = [
        { label: "0 - $5,000", min: 0, max: 5000 },
        { label: "$5,001 - $50,000", min: 5001, max: 50000 },
        { label: "$50,001 - $200,000", min: 50001, max: 200000 },
        { label: "$200,001 - $500,000", min: 200001, max: 500000 },
        { label: "$500,001+", min: 500001, max: Infinity },
      ];

      const rangeStats = [];

      for (const range of budgetRanges) {
        const rangeFilter = {
          ...baseFilters,
          budget: {
            $gte: range.min,
            ...(range.max !== Infinity ? { $lt: range.max } : {}),
          },
        };

        const count = await this.contractRepository.countDocuments(rangeFilter);
        const sum = await this.contractRepository.aggregate([
          { $match: rangeFilter },
          { $group: { _id: null, total: { $sum: "$budget" } } },
        ]);

        rangeStats.push({
          range: range.label,
          count,
          totalBudget: sum[0]?.total || 0,
        });
      }

      return {
        period: options.period,
        departmentId: options.departmentId,
        summary: {
          totalBudget: financialStats?.totalBudget || 0,
          averageBudget: financialStats?.averageBudget || 0,
          maxBudget: financialStats?.maxBudget || 0,
          minBudget: financialStats?.minBudget || 0,
          contractCount: financialStats?.contractCount || 0,
        },
        budgetDistribution: financialStats?.budgetDistribution || {},
        budgetRanges: rangeStats,
        generatedAt: new Date(),
      };
    } catch (error) {
      console.error("❌ Service error en getFinancialStatistics:", error);
      throw error;
    }
  }

  /**
   * Generar reporte de cumplimiento
   * @param {Object} options - Opciones del reporte
   */
  async getComplianceReport(options = {}) {
    try {
      console.log("📋 Service: Generando reporte de cumplimiento");

      const baseFilters = this._buildDateFilters(options.period);
      this._applyPermissionFilters(baseFilters, options.permissions);

      // Obtener contratos con sus fases
      const contracts = await this.contractRepository.find(baseFilters, {
        populate: [
          { path: "contractType", select: "name code" },
          { path: "currentPhase", select: "name code" },
          { path: "phases.phase", select: "name code requiredDocuments" },
        ],
      });

      const report = {
        period: options.period,
        summary: {
          totalContracts: contracts.length,
          compliantContracts: 0,
          nonCompliantContracts: 0,
          overallComplianceRate: 0,
        },
        complianceByType: {},
        complianceByPhase: {},
        nonCompliantItems: [],
      };

      for (const contract of contracts) {
        const compliance = await this._evaluateContractCompliance(contract);

        if (compliance.isCompliant) {
          report.summary.compliantContracts++;
        } else {
          report.summary.nonCompliantContracts++;
          report.nonCompliantItems.push({
            contractId: contract._id,
            contractNumber: contract.contractNumber,
            issues: compliance.issues,
          });
        }

        // Agrupar por tipo de contrato
        const typeName = contract.contractType.name;
        if (!report.complianceByType[typeName]) {
          report.complianceByType[typeName] = { total: 0, compliant: 0 };
        }
        report.complianceByType[typeName].total++;
        if (compliance.isCompliant) {
          report.complianceByType[typeName].compliant++;
        }

        // Agrupar por fase actual
        const phaseName = contract.currentPhase?.name || "Sin fase";
        if (!report.complianceByPhase[phaseName]) {
          report.complianceByPhase[phaseName] = { total: 0, compliant: 0 };
        }
        report.complianceByPhase[phaseName].total++;
        if (compliance.isCompliant) {
          report.complianceByPhase[phaseName].compliant++;
        }
      }

      // Calcular tasas de cumplimiento
      report.summary.overallComplianceRate =
        (report.summary.compliantContracts / report.summary.totalContracts) *
        100;

      for (const type in report.complianceByType) {
        const data = report.complianceByType[type];
        data.complianceRate = (data.compliant / data.total) * 100;
      }

      for (const phase in report.complianceByPhase) {
        const data = report.complianceByPhase[phase];
        data.complianceRate = (data.compliant / data.total) * 100;
      }

      report.generatedAt = new Date();

      return report;
    } catch (error) {
      console.error("❌ Service error en getComplianceReport:", error);
      throw error;
    }
  }

  /**
   * Generar reporte de desempeño
   * @param {Object} options - Opciones del reporte
   */
  async getPerformanceReport(options = {}) {
    try {
      console.log("📈 Service: Generando reporte de desempeño");

      const baseFilters = this._buildDateFilters(options.period);
      this._applyPermissionFilters(baseFilters, options.permissions);

      if (options.departmentId) {
        baseFilters.requestingDepartment = new Types.ObjectId(
          options.departmentId
        );
      }

      const pipeline = [
        { $match: baseFilters },
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
          $addFields: {
            completedPhases: {
              $size: {
                $filter: {
                  input: "$phases",
                  cond: { $eq: ["$$this.status", "COMPLETED"] },
                },
              },
            },
            totalPhases: { $size: "$phases" },
            avgPhaseDuration: {
              $avg: {
                $map: {
                  input: {
                    $filter: {
                      input: "$phases",
                      cond: { $ne: ["$$this.duration", null] },
                    },
                  },
                  in: "$$this.duration",
                },
              },
            },
          },
        },
        {
          $group: {
            _id: "$requestingDepartment",
            departmentName: { $first: "$department.name" },
            totalContracts: { $sum: 1 },
            completedContracts: {
              $sum: {
                $cond: [{ $eq: ["$generalStatus", "COMPLETED"] }, 1, 0],
              },
            },
            averageCompletionRate: {
              $avg: { $divide: ["$completedPhases", "$totalPhases"] },
            },
            averagePhaseDuration: { $avg: "$avgPhaseDuration" },
            totalBudget: { $sum: "$budget" },
          },
        },
        {
          $addFields: {
            completionRate: {
              $multiply: [
                { $divide: ["$completedContracts", "$totalContracts"] },
                100,
              ],
            },
          },
        },
        { $sort: { completionRate: -1 } },
      ];

      const performanceData = await this.contractRepository.aggregate(pipeline);

      return {
        period: options.period,
        departmentId: options.departmentId,
        performance: performanceData,
        summary: {
          totalDepartments: performanceData.length,
          averageCompletionRate:
            performanceData.reduce(
              (sum, dept) => sum + dept.completionRate,
              0
            ) / performanceData.length,
          bestPerformer: performanceData[0]?.departmentName || null,
          totalBudget: performanceData.reduce(
            (sum, dept) => sum + dept.totalBudget,
            0
          ),
        },
        generatedAt: new Date(),
      };
    } catch (error) {
      console.error("❌ Service error en getPerformanceReport:", error);
      throw error;
    }
  }

  // =============================================================================
  // DASHBOARD Y UTILIDADES
  // =============================================================================

  /**
   * Obtener datos para dashboard
   * @param {Object} options - Opciones de personalización
   */
  async getContractsDashboard(options = {}) {
    try {
      console.log("🏠 Service: Generando datos del dashboard");

      const baseFilters = {};
      this._applyPermissionFilters(baseFilters, options.permissions);

      // Obtener estadísticas rápidas
      const quickStats = await this.contractRepository.getStatsWithAggregation([
        { $match: baseFilters },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            active: {
              $sum: {
                $cond: [
                  { $in: ["$generalStatus", ["ACTIVE", "IN_PROGRESS"]] },
                  1,
                  0,
                ],
              },
            },
            completed: {
              $sum: { $cond: [{ $eq: ["$generalStatus", "COMPLETED"] }, 1, 0] },
            },
            totalBudget: { $sum: "$budget" },
          },
        },
      ]);

      // Contratos recientes
      const recentContracts = await this.contractRepository.findAdvanced(
        baseFilters,
        {
          limit: 10,
          sort: "-createdAt",
          populate: [
            { path: "contractType", select: "name" },
            { path: "currentPhase", select: "name" },
            { path: "requestingDepartment", select: "name" },
          ],
        }
      );
      console.log(
        "🏠 Service: Datos recientes de contratos:",
        recentContracts.totalDocs
      );
      // Contratos por estado
      const statusDistribution =
        await this.contractRepository.getStatsWithAggregation([
          { $match: baseFilters },
          { $group: { _id: "$generalStatus", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ]);

      // Acciones pendientes (básico)
      const pendingActions = await this.getPendingActions({
        userId: options.userId,
        permissions: options.permissions,
        limit: 5,
      });

      return {
        quickStats: quickStats[0] || {
          total: 0,
          active: 0,
          completed: 0,
          totalBudget: 0,
        },
        recentContracts: recentContracts.docs.map((contract) => ({
          _id: contract._id,
          contractNumber: contract.contractNumber,
          contractualObject: contract.contractualObject,
          contractType: contract.contractType?.name,
          currentPhase: contract.currentPhase?.name,
          department: contract.requestingDepartment?.name,
          status: contract.generalStatus,
          createdAt: contract.createdAt,
        })),
        statusDistribution: statusDistribution.map((item) => ({
          status: item._id,
          count: item.count,
        })),
        pendingActions: pendingActions.docs || [],
        generatedAt: new Date(),
      };
    } catch (error) {
      console.error("❌ Service error en getContractsDashboard:", error);
      throw error;
    }
  }

  /**
   * Obtener acciones pendientes para un usuario
   * @param {Object} options - Opciones de filtrado
   */
  async getPendingActions(options = {}) {
    try {
      const filters = {};
      this._applyPermissionFilters(filters, options.permissions);

      // Agregar filtros específicos para acciones pendientes
      filters.$or = [
        // Contratos asignados al usuario
        { "phases.assignedTo": new Types.ObjectId(options.userId) },
        // Contratos en fase que requiere documentos
        { generalStatus: "PENDING_DOCUMENTS" },
        // Contratos con observaciones sin resolver
        { generalStatus: "PENDING_REVIEW" },
      ];

      if (options.priority) {
        // Filtrar por prioridad si se especifica
        switch (options.priority) {
          case "HIGH":
            filters["timeline.expectedCompletion"] = {
              $lt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            }; // 7 días
            break;
          case "MEDIUM":
            filters["timeline.expectedCompletion"] = {
              $gte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
              $lt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            };
            break;
          case "LOW":
            filters["timeline.expectedCompletion"] = {
              $gte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            };
            break;
        }
      }

      const actions = await this.contractRepository.findAdvanced(filters, {
        page: options.page || 1,
        limit: options.limit || 20,
        sort: "timeline.expectedCompletion",
        populate: [
          { path: "contractType", select: "name" },
          { path: "currentPhase", select: "name" },
          { path: "requestingDepartment", select: "name" },
        ],
      });

      // Enriquecer con información de acciones específicas
      const enrichedDocs = actions.docs.map((contract) => {
        const action = this._determineRequiredAction(contract, options.userId);
        return {
          contract: {
            _id: contract._id,
            contractNumber: contract.contractNumber,
            contractualObject: contract.contractualObject,
            contractType: contract.contractType?.name,
            currentPhase: contract.currentPhase?.name,
            department: contract.requestingDepartment?.name,
            status: contract.generalStatus,
          },
          action: action.type,
          description: action.description,
          priority: action.priority,
          dueDate: contract.timeline?.expectedCompletion,
          daysRemaining: action.daysRemaining,
        };
      });

      return {
        ...actions,
        docs: enrichedDocs,
      };
    } catch (error) {
      console.error("❌ Service error en getPendingActions:", error);
      throw error;
    }
  }

  // =============================================================================
  // OPERACIONES ESPECIALES
  // =============================================================================

  /**
   * Duplicar contrato
   * @param {string} contractId - ID del contrato a duplicar
   * @param {Object} newContractData - Datos para el nuevo contrato
   */
  async duplicateContract(contractId, newContractData) {
    try {
      console.log(`📋 Service: Duplicando contrato ${contractId}`);

      const originalContract = await this.contractRepository.findById(
        contractId,
        {
          populate: ["contractType", "currentPhase"],
        }
      );

      if (!originalContract) {
        throw createError("Contrato original no encontrado", 404);
      }

      // Generar nuevo número de contrato
      const newContractNumber = await this._generateContractNumber(
        newContractData.requestingDepartment ||
          originalContract.requestingDepartment,
        originalContract.contractType._id
      );

      // Preparar datos del nuevo contrato
      const duplicatedContractData = {
        // Copiar datos básicos
        contractualObject:
          newContractData.contractualObject ||
          originalContract.contractualObject,
        contractType: originalContract.contractType._id,
        requestingDepartment:
          newContractData.requestingDepartment ||
          originalContract.requestingDepartment,
        budget: newContractData.budget || originalContract.budget,

        // Datos específicos de la duplicación
        contractNumber: newContractNumber,
        generalStatus: "DRAFT",

        // Reiniciar fases (solo la inicial)
        phases: [
          {
            phase: originalContract.phases[0]?.phase,
            status: "IN_PROGRESS",
            startDate: new Date(),
            assignedTo: newContractData.createdBy,
            documents: [],
            observations: [],
            completedAt: null,
            duration: null,
          },
        ],

        // Metadatos
        createdBy: newContractData.createdBy,
        timeline: {
          creationDate: new Date(),
          lastStatusChange: new Date(),
          expectedCompletion: this._calculateExpectedCompletion(
            originalContract.phases[0]?.phase
          ),
        },
        audit: {
          createdBy: newContractData.createdBy,
          createdAt: new Date(),
          duplicatedFrom: originalContract._id,
        },

        // Campos adicionales
        ...newContractData,
      };

      // Crear el nuevo contrato
      const duplicatedContract = await this.contractRepository.create(
        duplicatedContractData
      );

      // Registrar en historial
      await this._createHistoryEntry(duplicatedContract._id, {
        eventType: "CONTRACT_DUPLICATED",
        description: `Contrato duplicado desde ${originalContract.contractNumber}`,
        user: {
          userId: newContractData.createdBy,
          name: newContractData.createdByInfo?.name,
          email: newContractData.createdByInfo?.email,
        },
        changeDetails: {
          originalContractId: originalContract._id,
          originalContractNumber: originalContract.contractNumber,
        },
      });

      return duplicatedContract;
    } catch (error) {
      console.error("❌ Service error en duplicateContract:", error);
      throw error;
    }
  }

  /**
   * Archivar contrato
   * @param {string} contractId - ID del contrato
   * @param {Object} archiveOptions - Opciones de archivado
   */
  async archiveContract(contractId, archiveOptions) {
    try {
      console.log(`📦 Service: Archivando contrato ${contractId}`);

      const contract = await this.contractRepository.findById(contractId);
      if (!contract) {
        throw createError("Contrato no encontrado", 404);
      }

      // Validar que el contrato puede ser archivado
      if (
        !["COMPLETED", "TERMINATED", "CANCELLED"].includes(
          contract.generalStatus
        )
      ) {
        throw createError(
          "Solo se pueden archivar contratos completados, terminados o cancelados",
          400
        );
      }

      // Actualizar estado del contrato
      const archivedContract = await this.contractRepository.updateById(
        contractId,
        {
          generalStatus: "ARCHIVED",
          archivedAt: new Date(),
          archivedBy: archiveOptions.userId,
          archiveReason: archiveOptions.reason,
          "timeline.archiveDate": new Date(),
          updatedBy: archiveOptions.userId,
          updatedAt: new Date(),
        },
        { new: true }
      );

      // Si se solicita archivar documentos
      if (archiveOptions.archiveDocuments) {
        await this._archiveContractDocuments(contractId);
      }

      // Registrar en historial
      await this._createHistoryEntry(contractId, {
        eventType: "CONTRACT_ARCHIVED",
        description: "Contrato archivado",
        user: {
          userId: archiveOptions.userId,
          name: archiveOptions.userInfo?.name,
          email: archiveOptions.userInfo?.email,
        },
        changeDetails: {
          reason: archiveOptions.reason,
          documentsArchived: archiveOptions.archiveDocuments,
        },
      });

      return archivedContract;
    } catch (error) {
      console.error("❌ Service error en archiveContract:", error);
      throw error;
    }
  }

  /**
   * Restaurar contrato archivado
   * @param {string} contractId - ID del contrato
   * @param {Object} restoreOptions - Opciones de restauración
   */
  async restoreContract(contractId, restoreOptions) {
    try {
      console.log(`🔄 Service: Restaurando contrato ${contractId}`);

      const contract = await this.contractRepository.findById(contractId);
      if (!contract) {
        throw createError("Contrato no encontrado", 404);
      }

      if (contract.generalStatus !== "ARCHIVED") {
        throw createError("Solo se pueden restaurar contratos archivados", 400);
      }

      // Determinar el estado anterior al archivo
      const previousStatus = await this._determinePreviousStatus(contractId);

      // Restaurar contrato
      const restoredContract = await this.contractRepository.updateById(
        contractId,
        {
          generalStatus: previousStatus || "ACTIVE",
          archivedAt: null,
          archivedBy: null,
          archiveReason: null,
          restoredAt: new Date(),
          restoredBy: restoreOptions.userId,
          restoreReason: restoreOptions.reason,
          "timeline.restoreDate": new Date(),
          updatedBy: restoreOptions.userId,
          updatedAt: new Date(),
        },
        { new: true }
      );

      // Registrar en historial
      await this._createHistoryEntry(contractId, {
        eventType: "CONTRACT_RESTORED",
        description: "Contrato restaurado desde archivo",
        user: {
          userId: restoreOptions.userId,
          name: restoreOptions.userInfo?.name,
          email: restoreOptions.userInfo?.email,
        },
        changeDetails: {
          reason: restoreOptions.reason,
          previousStatus: "ARCHIVED",
          newStatus: restoredContract.generalStatus,
        },
      });

      return restoredContract;
    } catch (error) {
      console.error("❌ Service error en restoreContract:", error);
      throw error;
    }
  }

  // =============================================================================
  // MÉTODOS AUXILIARES PRIVADOS
  // =============================================================================

  /**
   * Aplicar filtros de permisos según el rol del usuario
   * @private
   */
  _applyPermissionFilters(filters, permissions) {
    if (!permissions) return;

    // Si no es administrador, filtrar por departamento o usuario
    if (permissions.scope !== "all") {
      if (permissions.scope === "department") {
        filters.requestingDepartment = new Types.ObjectId(
          permissions.departmentId
        );
      } else if (permissions.scope === "own") {
        filters.createdBy = new Types.ObjectId(permissions.userId);
      }
    }
  }

  /**
   * Validar permisos de acceso a un contrato específico
   * @private
   */
  _hasContractPermission(contract, permissions, action) {
    if (!permissions) return false;

    // Administradores tienen acceso completo
    if (permissions.scope === "all") return true;

    // Acceso por departamento
    if (permissions.scope === "department") {
      return (
        contract.requestingDepartment.toString() === permissions.departmentId
      );
    }

    // Acceso solo a contratos propios
    if (permissions.scope === "own") {
      return contract.createdBy.toString() === permissions.userId;
    }

    return false;
  }

  /**
   * Construir filtros de fecha según el período
   * @private
   */
  _buildDateFilters(period) {
    const filters = {};

    if (!period) return filters;

    const now = new Date();
    let startDate;

    switch (period) {
      case "today":
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
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
        return filters;
    }

    filters.createdAt = { $gte: startDate, $lte: now };
    return filters;
  }

  /**
   * Crear entrada en el historial del contrato
   * @private
   */
  async _createHistoryEntry(contractId, historyData) {
    try {
      await this.contractHistoryRepository.create({
        contractId: new Types.ObjectId(contractId),
        eventType: historyData.eventType,
        description: historyData.description,
        user: historyData.user,
        changeDetails: historyData.changeDetails,
        createdAt: new Date(),
      });
    } catch (error) {
      console.error("⚠️ Error creando entrada de historial:", error);
      // No lanzar error para no interrumpir la operación principal
    }
  }

  /**
   * Generar número de contrato único
   * @private
   */
  async _generateContractNumber(departmentId, contractTypeId) {
    const year = new Date().getFullYear();
    const department = await this.contractRepository.findById(departmentId, {
      select: "code",
    });
    const contractType = await this.contractTypeRepository.findById(
      contractTypeId,
      { select: "code" }
    );

    // Obtener último número secuencial
    const lastContract = await this.contractRepository.findOne(
      {
        contractNumber: {
          $regex: `^${department.code}-${contractType.code}-${year}`,
        },
      },
      { sort: { contractNumber: -1 } }
    );

    let sequence = 1;
    if (lastContract) {
      const lastSequence =
        parseInt(lastContract.contractNumber.split("-").pop()) || 0;
      sequence = lastSequence + 1;
    }

    return `${department.code}-${contractType.code}-${year}-${sequence.toString().padStart(4, "0")}`;
  }

  /**
   * Calcular progreso de una fase
   * @private
   */
  _calculatePhaseProgress(phase) {
    if (phase.status === "COMPLETED") return 100;
    if (phase.status === "NOT_STARTED") return 0;

    // Calcular progreso basado en documentos requeridos vs subidos
    // Esta lógica puede expandirse según los requisitos específicos
    const documentsUploaded = phase.documents?.length || 0;
    const documentsRequired = phase.requiredDocuments?.length || 1;

    return Math.min((documentsUploaded / documentsRequired) * 100, 95); // Max 95% hasta completar
  }

  /**
   * Otras funciones auxiliares privadas...
   * @private
   */
  _validatePhaseTransition(currentPhaseId, newPhaseId, contractTypeId) {
    // Implementar lógica de validación de transiciones
    // Por ahora retorna true, pero aquí iría la lógica específica
    return true;
  }

  _validateStatusTransition(currentStatus, newStatus) {
    // Matriz de transiciones válidas
    const validTransitions = {
      DRAFT: ["ACTIVE", "CANCELLED"],
      ACTIVE: ["IN_PROGRESS", "SUSPENDED", "CANCELLED"],
      IN_PROGRESS: ["COMPLETED", "SUSPENDED", "TERMINATED"],
      SUSPENDED: ["ACTIVE", "TERMINATED"],
      COMPLETED: ["ARCHIVED"],
      TERMINATED: ["ARCHIVED"],
      CANCELLED: ["ARCHIVED"],
      ARCHIVED: ["ACTIVE"], // Solo con permisos especiales
    };

    return validTransitions[currentStatus]?.includes(newStatus) || false;
  }

  async _exportToExcel(contracts, options) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Contratos");

    // Definir columnas
    worksheet.columns = [
      { header: "Número", key: "contractNumber", width: 20 },
      { header: "Objeto", key: "contractualObject", width: 40 },
      { header: "Tipo", key: "contractType", width: 15 },
      { header: "Departamento", key: "department", width: 20 },
      { header: "Estado", key: "status", width: 15 },
      { header: "Presupuesto", key: "budget", width: 15 },
      { header: "Fase Actual", key: "currentPhase", width: 20 },
      { header: "Fecha Creación", key: "createdAt", width: 15 },
    ];

    // Agregar datos
    contracts.forEach((contract) => {
      worksheet.addRow({
        contractNumber: contract.contractNumber,
        contractualObject: contract.contractualObject,
        contractType: contract.contractType?.name || "",
        department: contract.requestingDepartment?.name || "",
        status: contract.generalStatus,
        budget: contract.budget,
        currentPhase: contract.currentPhase?.name || "",
        createdAt: contract.createdAt,
      });
    });

    // Generar buffer
    const buffer = await workbook.xlsx.writeBuffer();

    return {
      format: "excel",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      extension: "xlsx",
      buffer,
    };
  }

  async _exportToCSV(contracts, options) {
    // Implementación de exportación a CSV
    const csvData = contracts.map((contract) => ({
      contractNumber: contract.contractNumber,
      contractualObject: contract.contractualObject,
      contractType: contract.contractType?.name || "",
      department: contract.requestingDepartment?.name || "",
      status: contract.generalStatus,
      budget: contract.budget,
      currentPhase: contract.currentPhase?.name || "",
      createdAt: contract.createdAt,
    }));

    // Usar biblioteca CSV para generar el archivo
    const csvString = await new Promise((resolve, reject) => {
      // Implementar generación CSV
      resolve("CSV content here");
    });

    return {
      format: "csv",
      mimeType: "text/csv",
      extension: "csv",
      buffer: Buffer.from(csvString),
    };
  }
}
