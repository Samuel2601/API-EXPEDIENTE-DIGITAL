// =============================================================================
// src/module/exp-digital/repositories/contract-phase.repository.js
// Repositorio especializado para gestión de fases de contratación pública
// =============================================================================

import { Types } from "mongoose";
import { BaseRepository } from "../../core/base/repositories/base.repository.js";
import { ContractPhase } from "../models/contract-phase.scheme.js";

export class ContractPhaseRepository extends BaseRepository {
  constructor() {
    super(ContractPhase);
    this.setupContractPhaseLookups();
  }

  /**
   * Configurar lookups específicos para fases de contratación
   */
  setupContractPhaseLookups() {
    this.contractPhaseLookups = {
      // Lookup para dependencias de fases
      dependencies: {
        from: "contractphases",
        localField: "dependencies.requiredPhases.phase",
        foreignField: "_id",
        as: "dependencyDetails",
        pipeline: [
          {
            $project: {
              code: 1,
              name: 1,
              shortName: 1,
              order: 1,
              category: 1,
            },
          },
        ],
      },

      // Lookup para fases bloqueantes
      blockedBy: {
        from: "contractphases",
        localField: "dependencies.blockedBy",
        foreignField: "_id",
        as: "blockingPhases",
        pipeline: [
          {
            $project: {
              code: 1,
              name: 1,
              shortName: 1,
              order: 1,
            },
          },
        ],
      },

      // Lookup para estadísticas de uso en contratos
      usageStats: {
        from: "contracts",
        localField: "_id",
        foreignField: "phases.phase",
        as: "contractUsage",
        pipeline: [
          { $match: { isActive: true } },
          {
            $group: {
              _id: null,
              totalContracts: { $sum: 1 },
              avgDuration: { $avg: "$phases.duration" },
            },
          },
        ],
      },
    };
  }

  // ===== MÉTODOS USANDO QUERY HELPERS DEL ESQUEMA =====

  /**
   * Buscar fases por categoría - USA QUERY HELPER
   * ✅ MEJORA: Utiliza el query helper del esquema
   */
  async findByCategory(category, options = {}) {
    try {
      const { page = 1, limit = 10, includeInactive = false } = options;

      // ✅ Usar query helper del esquema con ordenamiento secuencial
      let query = this.model.find().byCategory(category).sequential();

      if (!includeInactive) {
        query = query.where({ isActive: true });
      }

      return await this.paginate(query, { page, limit });
    } catch (error) {
      throw new Error(`Error buscando fases por categoría: ${error.message}`);
    }
  }

  /**
   * Buscar fases aplicables a tipo de contratación - USA QUERY HELPER
   * ✅ MEJORA: Utiliza el query helper del esquema
   */
  async findForContractType(contractTypeCode, options = {}) {
    try {
      const { page = 1, limit = 10, populateDependencies = true } = options;

      // ✅ Usar query helper del esquema
      let query = this.model
        .find()
        .forContractType(contractTypeCode)
        .sequential()
        .where({ isActive: true });

      if (populateDependencies) {
        query = query.populate([
          {
            path: "dependencies.requiredPhases.phase",
            select: "code name shortName order",
          },
          {
            path: "dependencies.blockedBy",
            select: "code name shortName order",
          },
        ]);
      }

      return await this.paginate(query, { page, limit });
    } catch (error) {
      throw new Error(
        `Error buscando fases por tipo de contratación: ${error.message}`
      );
    }
  }

  /**
   * Buscar fases por orden específico - USA QUERY HELPER
   * ✅ MEJORA: Utiliza el query helper del esquema
   */
  async findByOrder(order, options = {}) {
    try {
      const { category, includeInactive = false } = options;

      // ✅ Usar query helper del esquema
      let query = this.model.find().withOrder(order);

      if (category) {
        query = query.byCategory(category);
      }

      if (!includeInactive) {
        query = query.where({ isActive: true });
      }

      const phases = await query;
      return phases;
    } catch (error) {
      throw new Error(`Error buscando fases por orden: ${error.message}`);
    }
  }

  // ===== MÉTODOS USANDO MÉTODOS ESTÁTICOS DEL ESQUEMA =====

  /**
   * Obtener secuencia completa de fases para un tipo - USA MÉTODO ESTÁTICO
   * ✅ MEJORA: Utiliza el método estático del esquema
   */
  async getPhaseSequence(contractTypeCode, options = {}) {
    try {
      const { includeDocuments = true, includeDependencies = true } = options;

      // ✅ Usar método estático del esquema
      let phases = await this.model.getPhaseSequence(contractTypeCode);

      // Enriquecer con información adicional si se solicita
      if (includeDocuments || includeDependencies) {
        const populateOptions = [];

        if (includeDependencies) {
          populateOptions.push({
            path: "dependencies.blockedBy",
            select: "code name shortName order",
          });
        }

        if (populateOptions.length > 0) {
          phases = await this.model.populate(phases, populateOptions);
        }
      }

      return phases;
    } catch (error) {
      throw new Error(`Error obteniendo secuencia de fases: ${error.message}`);
    }
  }

  /**
   * Buscar fases que contienen un documento específico - USA MÉTODO ESTÁTICO
   * ✅ MEJORA: Utiliza el método estático del esquema
   */
  async findWithDocumentCode(documentCode, options = {}) {
    try {
      const { page = 1, limit = 10 } = options;

      // ✅ Usar método estático del esquema
      const query = this.model.findWithDocumentCode(documentCode);

      return await this.paginate(query, { page, limit });
    } catch (error) {
      throw new Error(`Error buscando fases con documento: ${error.message}`);
    }
  }

  // ===== MÉTODOS ESPECÍFICOS DEL REPOSITORIO =====

  /**
   * Buscar fase por código
   */
  async findByCode(code) {
    try {
      const phase = await this.model
        .findOne({
          code: code.toUpperCase(),
          isActive: true,
        })
        .populate([
          {
            path: "dependencies.requiredPhases.phase",
            select: "code name shortName order",
          },
          {
            path: "dependencies.blockedBy",
            select: "code name shortName order",
          },
        ]);

      return phase;
    } catch (error) {
      throw new Error(`Error buscando fase por código: ${error.message}`);
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

      const existingPhase = await this.model.findOne(query);
      return !existingPhase;
    } catch (error) {
      throw new Error(`Error verificando código: ${error.message}`);
    }
  }

  // ===== MÉTODOS USANDO FUNCIONES DEL ESQUEMA PARA VALIDACIONES =====

  /**
   * Validar aplicabilidad a tipo de contratación usando método del esquema
   * ✅ MEJORA: Utiliza el método del esquema para validaciones
   */
  async validateApplicabilityToContractType(phaseId, contractTypeCode) {
    try {
      const phase = await this.findById(phaseId);
      if (!phase) {
        throw new Error("Fase no encontrada");
      }

      // ✅ Usar método del esquema
      const isApplicable = phase.isApplicableToContractType(contractTypeCode);

      return {
        isApplicable,
        phase: {
          code: phase.code,
          name: phase.name,
          category: phase.category,
        },
        applicableToTypes: phase.applicableToTypes,
      };
    } catch (error) {
      throw new Error(`Error validando aplicabilidad: ${error.message}`);
    }
  }

  /**
   * Verificar permisos de usuario para trabajar en fase
   * ✅ MEJORA: Utiliza el método del esquema para validaciones
   */
  async canUserWorkOnPhase(phaseId, userRole) {
    try {
      const phase = await this.findById(phaseId);
      if (!phase) {
        throw new Error("Fase no encontrada");
      }

      // ✅ Usar método del esquema
      const canWork = phase.canUserWork(userRole);

      return {
        canWork,
        phase: {
          code: phase.code,
          name: phase.name,
        },
        allowedRoles: phase.allowedRoles,
      };
    } catch (error) {
      throw new Error(
        `Error verificando permisos de usuario: ${error.message}`
      );
    }
  }

  /**
   * Validar tipo de archivo para documento específico
   * ✅ MEJORA: Utiliza los métodos del esquema para gestión de documentos
   */
  async validateFileTypeForDocument(phaseId, documentCode, fileType) {
    try {
      const phase = await this.findById(phaseId);
      if (!phase) {
        throw new Error("Fase no encontrada");
      }

      // ✅ Usar métodos del esquema
      const document = phase.getDocumentByCode(documentCode);
      if (!document) {
        throw new Error(`Documento ${documentCode} no encontrado en la fase`);
      }

      const isValidFileType = phase.validateFileType(documentCode, fileType);

      return {
        isValid: isValidFileType,
        document: {
          code: document.code,
          name: document.name,
          isMandatory: document.isMandatory,
        },
        allowedFileTypes: document.allowedFileTypes,
      };
    } catch (error) {
      throw new Error(`Error validando tipo de archivo: ${error.message}`);
    }
  }

  // ===== MÉTODOS DE GESTIÓN DE DOCUMENTOS =====

  /**
   * Obtener documentos obligatorios de una fase
   * ✅ MEJORA: Utiliza el método del esquema
   */
  async getMandatoryDocuments(phaseId) {
    try {
      const phase = await this.findById(phaseId);
      if (!phase) {
        throw new Error("Fase no encontrada");
      }

      // ✅ Usar método del esquema
      const mandatoryDocs = phase.getMandatoryDocuments();

      return {
        phaseCode: phase.code,
        phaseName: phase.name,
        documents: mandatoryDocs,
        totalMandatory: mandatoryDocs.length,
      };
    } catch (error) {
      throw new Error(
        `Error obteniendo documentos obligatorios: ${error.message}`
      );
    }
  }

  /**
   * Obtener documentos opcionales de una fase
   * ✅ MEJORA: Utiliza el método del esquema
   */
  async getOptionalDocuments(phaseId) {
    try {
      const phase = await this.findById(phaseId);
      if (!phase) {
        throw new Error("Fase no encontrada");
      }

      // ✅ Usar método del esquema
      const optionalDocs = phase.getOptionalDocuments();

      return {
        phaseCode: phase.code,
        phaseName: phase.name,
        documents: optionalDocs,
        totalOptional: optionalDocs.length,
      };
    } catch (error) {
      throw new Error(
        `Error obteniendo documentos opcionales: ${error.message}`
      );
    }
  }

  /**
   * Obtener resumen completo de documentos de una fase
   */
  async getDocumentsSummary(phaseId) {
    try {
      const phase = await this.findById(phaseId);
      if (!phase) {
        throw new Error("Fase no encontrada");
      }

      // ✅ Usar métodos del esquema y virtuales
      const mandatoryDocs = phase.getMandatoryDocuments();
      const optionalDocs = phase.getOptionalDocuments();

      return {
        phase: {
          code: phase.code,
          name: phase.name,
          category: phase.category,
        },
        summary: {
          totalDocuments: phase.documentCount, // Virtual del esquema
          mandatoryCount: phase.mandatoryDocumentCount, // Virtual del esquema
          optionalCount: optionalDocs.length,
        },
        documents: {
          mandatory: mandatoryDocs,
          optional: optionalDocs,
          all: phase.requiredDocuments,
        },
      };
    } catch (error) {
      throw new Error(
        `Error obteniendo resumen de documentos: ${error.message}`
      );
    }
  }

  // ===== MÉTODOS DE BÚSQUEDA AVANZADA =====

  /**
   * Búsqueda avanzada de fases
   */
  async findAdvanced(criteria, options = {}) {
    try {
      const {
        page = 1,
        limit = 10,
        sort = { order: 1, name: 1 },
        populateDependencies = false,
      } = options;

      const {
        category,
        contractType,
        order,
        userRole,
        documentCode,
        isOptional,
        allowParallel,
        searchText,
        minEstimatedDays,
        maxEstimatedDays,
        isActive = true,
      } = criteria;

      // Construir query base
      let query = this.model.find();

      // Aplicar filtros usando query helpers cuando sea apropiado
      if (category) query = query.byCategory(category);
      if (contractType) query = query.forContractType(contractType);
      if (order !== undefined) query = query.withOrder(order);

      // Filtros adicionales
      if (isActive !== undefined) {
        query = query.where({ isActive });
      }

      if (userRole) {
        query = query.where({
          $or: [
            { allowedRoles: { $size: 0 } }, // Sin restricción de roles
            { allowedRoles: userRole },
          ],
        });
      }

      if (documentCode) {
        query = query.where({
          "requiredDocuments.code": documentCode.toUpperCase(),
        });
      }

      if (isOptional !== undefined) {
        query = query.where({ "phaseConfig.isOptional": isOptional });
      }

      if (allowParallel !== undefined) {
        query = query.where({ "phaseConfig.allowParallel": allowParallel });
      }

      if (minEstimatedDays !== undefined || maxEstimatedDays !== undefined) {
        const daysQuery = {};
        if (minEstimatedDays !== undefined) daysQuery.$gte = minEstimatedDays;
        if (maxEstimatedDays !== undefined) daysQuery.$lte = maxEstimatedDays;
        query = query.where({ "phaseConfig.estimatedDays": daysQuery });
      }

      if (searchText) {
        query = query.where({
          $text: { $search: searchText },
        });
      }

      // Población condicional
      if (populateDependencies) {
        query = query.populate([
          {
            path: "dependencies.requiredPhases.phase",
            select: "code name shortName order",
          },
          {
            path: "dependencies.blockedBy",
            select: "code name shortName order",
          },
        ]);
      }

      // Aplicar ordenamiento
      query = query.sort(sort);

      return await this.paginate(query, { page, limit });
    } catch (error) {
      throw new Error(`Error en búsqueda avanzada: ${error.message}`);
    }
  }

  // ===== MÉTODOS DE ANÁLISIS Y REPORTES =====

  /**
   * Obtener estadísticas de fases por categoría
   */
  async getStatsByCategory() {
    try {
      const pipeline = [
        { $match: { isActive: true } },
        {
          $group: {
            _id: "$category",
            totalPhases: { $sum: 1 },
            avgEstimatedDays: { $avg: "$phaseConfig.estimatedDays" },
            avgDocuments: { $avg: { $size: "$requiredDocuments" } },
            avgMandatoryDocs: {
              $avg: {
                $size: {
                  $filter: {
                    input: "$requiredDocuments",
                    cond: { $eq: ["$$this.isMandatory", true] },
                  },
                },
              },
            },
            optionalPhasesCount: {
              $sum: { $cond: ["$phaseConfig.isOptional", 1, 0] },
            },
            parallelPhasesCount: {
              $sum: { $cond: ["$phaseConfig.allowParallel", 1, 0] },
            },
          },
        },
        {
          $project: {
            category: "$_id",
            totalPhases: 1,
            avgEstimatedDays: { $round: ["$avgEstimatedDays", 1] },
            avgDocuments: { $round: ["$avgDocuments", 1] },
            avgMandatoryDocs: { $round: ["$avgMandatoryDocs", 1] },
            optionalPercentage: {
              $round: [
                {
                  $multiply: [
                    { $divide: ["$optionalPhasesCount", "$totalPhases"] },
                    100,
                  ],
                },
                1,
              ],
            },
            parallelPercentage: {
              $round: [
                {
                  $multiply: [
                    { $divide: ["$parallelPhasesCount", "$totalPhases"] },
                    100,
                  ],
                },
                1,
              ],
            },
          },
        },
        { $sort: { category: 1 } },
      ];

      return await this.model.aggregate(pipeline);
    } catch (error) {
      throw new Error(
        `Error obteniendo estadísticas por categoría: ${error.message}`
      );
    }
  }

  /**
   * Obtener reporte de dependencias entre fases
   */
  async getDependenciesReport() {
    try {
      const pipeline = [
        { $match: { isActive: true } },
        {
          $lookup: {
            from: "contractphases",
            localField: "dependencies.requiredPhases.phase",
            foreignField: "_id",
            as: "requiredPhaseDetails",
          },
        },
        {
          $lookup: {
            from: "contractphases",
            localField: "dependencies.blockedBy",
            foreignField: "_id",
            as: "blockingPhaseDetails",
          },
        },
        {
          $project: {
            code: 1,
            name: 1,
            category: 1,
            order: 1,
            hasDependencies: {
              $gt: [{ $size: "$dependencies.requiredPhases" }, 0],
            },
            dependencyCount: { $size: "$dependencies.requiredPhases" },
            blockingCount: { $size: "$dependencies.blockedBy" },
            requiredPhases: {
              $map: {
                input: "$requiredPhaseDetails",
                as: "req",
                in: {
                  code: "$$req.code",
                  name: "$$req.name",
                  order: "$$req.order",
                },
              },
            },
            blockingPhases: {
              $map: {
                input: "$blockingPhaseDetails",
                as: "block",
                in: {
                  code: "$$block.code",
                  name: "$$block.name",
                  order: "$$block.order",
                },
              },
            },
          },
        },
        { $sort: { order: 1 } },
      ];

      return await this.model.aggregate(pipeline);
    } catch (error) {
      throw new Error(
        `Error generando reporte de dependencias: ${error.message}`
      );
    }
  }

  // ===== VALIDACIONES ESPECÍFICAS =====

  /**
   * Validar datos antes de crear fase
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

    // Validar orden único por categoría
    if (data.order !== undefined && data.category) {
      const existingPhase = await this.model.findOne({
        order: data.order,
        category: data.category.toUpperCase(),
        isActive: true,
      });

      if (existingPhase) {
        errors.push(
          `Ya existe una fase con orden ${data.order} en la categoría ${data.category}`
        );
      }
    }

    // Validar códigos únicos en documentos requeridos
    if (data.requiredDocuments && data.requiredDocuments.length > 0) {
      const codes = data.requiredDocuments.map((doc) =>
        doc.code?.toUpperCase()
      );
      const uniqueCodes = [...new Set(codes)];

      if (codes.length !== uniqueCodes.length) {
        errors.push("Los códigos de documentos requeridos deben ser únicos");
      }
    }

    if (errors.length > 0) {
      throw new Error(`Validación fallida: ${errors.join(", ")}`);
    }

    return true;
  }

  /**
   * Crear fase con validaciones
   */
  async create(data, userData, options = {}) {
    try {
      await this.validateBeforeCreate(data);

      // Normalizar campos
      if (data.code) {
        data.code = data.code.toUpperCase().trim();
      }

      if (data.category) {
        data.category = data.category.toUpperCase();
      }

      // Normalizar documentos requeridos
      if (data.requiredDocuments) {
        data.requiredDocuments = data.requiredDocuments.map((doc) => ({
          ...doc,
          code: doc.code?.toUpperCase().trim(),
        }));
      }

      return await super.create(data, userData, options);
    } catch (error) {
      throw new Error(`Error creando fase: ${error.message}`);
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

      if (data.requiredDocuments) {
        data.requiredDocuments = data.requiredDocuments.map((doc) => ({
          ...doc,
          code: doc.code?.toUpperCase().trim(),
        }));
      }

      return await super.update(id, data, userData, options);
    } catch (error) {
      throw new Error(`Error actualizando fase: ${error.message}`);
    }
  }
}

export default new ContractPhaseRepository();
