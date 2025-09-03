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
      dependencies: {
        from: "contractphases",
        localField: "dependencies.requiredPhases.phase",
        foreignField: "_id",
        as: "dependencyDetails",
        pipeline: [
          {
            $project: { code: 1, name: 1, shortName: 1, order: 1, category: 1 },
          },
        ],
      },
      contractTypes: {
        from: "contracttypes",
        localField: "applicableToTypes",
        foreignField: "_id",
        as: "applicableTypes",
        pipeline: [{ $project: { code: 1, name: 1, category: 1 } }],
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
      const {
        page = 1,
        limit = 10,
        includeInactive = false,
        lean = true,
      } = options;

      // ✅ Usar query helper del esquema con ordenamiento secuencial
      let query = this.model.find().byCategory(category).sequential();

      if (!includeInactive) {
        query = query.where({ isActive: true });
      }

      return await this.model.paginate(query, { page, limit });
    } catch (error) {
      throw new Error(`Error buscando fases por categoría: ${error.message}`);
    }
  }

  /**
   * Buscar fases aplicables a tipo de contratación - USA QUERY HELPER
   * ✅ MEJORA: Utiliza el query helper del esquema
   */
  async findForContractType(contractTypeId, options = {}) {
    try {
      const { page = 1, limit = 50, populateDependencies = true } = options;

      let query = this.model.find({
        "typeSpecificConfig.contractType": contractTypeId,
        isActive: true,
      });

      if (populateDependencies) {
        query = query.populate([
          {
            path: "dependencies.requiredPhases.phase",
            select: "code name shortName order",
            match: { isActive: true },
          },
          {
            path: "typeSpecificConfig.contractType",
            select: "code name category",
          },
        ]);
      }

      query = query.sort({ order: 1 });

      if (page && limit) {
        return await this.model.paginate(query, { page, limit });
      }

      return await query;
    } catch (error) {
      throw new Error(
        `Error buscando fases por tipo de contratación: ${error.message}`
      );
    }
  }

  /**
   * Obtener documentos efectivos para un tipo de contrato específico
   */
  async getEffectiveDocuments(phaseId, contractTypeId, options = {}) {
    try {
      const phase = await this.findById(phaseId, { lean: false });
      if (!phase) {
        throw new Error("Fase no encontrada");
      }

      const effectiveDocuments = phase.getEffectiveDocuments(contractTypeId);

      const { mandatoryOnly = false, optionalOnly = false } = options;

      if (mandatoryOnly) {
        return effectiveDocuments.filter((doc) => doc.isMandatory);
      }

      if (optionalOnly) {
        return effectiveDocuments.filter((doc) => !doc.isMandatory);
      }

      return effectiveDocuments;
    } catch (error) {
      throw new Error(
        `Error obteniendo documentos efectivos: ${error.message}`
      );
    }
  }

  /**
   * Obtener duración efectiva para un tipo de contrato específico
   */
  async getEffectiveDuration(phaseId, contractTypeId) {
    try {
      const phase = await this.findById(phaseId, { lean: false });
      if (!phase) {
        throw new Error("Fase no encontrada");
      }

      const effectiveDuration = phase.getEffectiveDuration(contractTypeId);

      return {
        phaseCode: phase.code,
        contractTypeId: contractTypeId?.toString(),
        effectiveDuration,
        baseDuration: phase.phaseConfig.estimatedDays,
        hasSpecificDuration:
          effectiveDuration !== phase.phaseConfig.estimatedDays,
      };
    } catch (error) {
      throw new Error(`Error obteniendo duración efectiva: ${error.message}`);
    }
  }

  /**
   * Agregar o actualizar configuración específica para tipo de contrato
   */
  async upsertTypeSpecificConfig(phaseId, configData, userData) {
    try {
      const phase = await this.findById(phaseId, { lean: false });
      if (!phase) {
        throw new Error("Fase no encontrada");
      }

      const existingIndex = phase.typeSpecificConfig.findIndex(
        (config) =>
          config.contractType.toString() === configData.contractType.toString()
      );

      if (existingIndex >= 0) {
        // Actualizar configuración existente
        phase.typeSpecificConfig[existingIndex] = {
          ...phase.typeSpecificConfig[existingIndex],
          ...configData,
        };
      } else {
        // Agregar nueva configuración
        phase.typeSpecificConfig.push(configData);
      }

      await phase.save();
      return await this.findById(phaseId);
    } catch (error) {
      throw new Error(
        `Error actualizando configuración específica: ${error.message}`
      );
    }
  }

  /**
   * Obtener configuración específica para un tipo de contrato
   */
  async getTypeSpecificConfig(phaseId, contractTypeId) {
    try {
      const phase = await this.findById(phaseId);
      if (!phase) {
        throw new Error("Fase no encontrada");
      }

      const config = phase.typeSpecificConfig.find(
        (config) => config.contractType.toString() === contractTypeId.toString()
      );

      return config || null;
    } catch (error) {
      throw new Error(
        `Error obteniendo configuración específica: ${error.message}`
      );
    }
  }

  /**
   * Agregar excepciones de documentos para un tipo de contrato
   */
  async addDocumentExceptions(
    phaseId,
    contractTypeId,
    documentCodes,
    userData
  ) {
    try {
      const phase = await this.findById(phaseId, { lean: false });
      if (!phase) {
        throw new Error("Fase no encontrada");
      }

      // ✅ Usar método del esquema
      await phase.addDocumentException(contractTypeId, documentCodes);

      // Auditoría manual ya que es operación en Map
      try {
        await this.auditMapOperation(phaseId, "documentsExceptions", {
          operation: "ADD_EXCEPTIONS",
          contractTypeId: contractTypeId.toString(),
          documentCodes,
          userData,
        });
      } catch (auditError) {
        console.warn("Error en auditoría:", auditError.message);
      }

      return await this.findById(phaseId);
    } catch (error) {
      throw new Error(`Error agregando excepciones: ${error.message}`);
    }
  }

  /**
   * Configurar duración específica para un tipo de contrato
   */
  async setDurationForType(phaseId, contractTypeId, duration, userData) {
    try {
      if (duration < 1 || duration > 365) {
        throw new Error("La duración debe estar entre 1 y 365 días");
      }

      const phase = await this.findById(phaseId, { lean: false });
      if (!phase) {
        throw new Error("Fase no encontrada");
      }

      // ✅ Usar método del esquema
      await phase.setDurationForType(contractTypeId, duration);

      // Auditoría manual
      try {
        await this.auditMapOperation(phaseId, "durationByType", {
          operation: "SET_DURATION",
          contractTypeId: contractTypeId.toString(),
          duration,
          userData,
        });
      } catch (auditError) {
        console.warn("Error en auditoría:", auditError.message);
      }

      return await this.findById(phaseId);
    } catch (error) {
      throw new Error(`Error configurando duración: ${error.message}`);
    }
  }

  /**
   * Obtener configuración completa de excepciones y duraciones
   */
  async getPhaseConfiguration(phaseId, contractTypeId = null) {
    try {
      const phase = await this.findById(phaseId, {
        populate: "typeSpecificConfig.contractType",
        lean: false,
      });
      if (!phase) {
        throw new Error("Fase no encontrada");
      }

      const config = {
        phase: {
          code: phase.code,
          name: phase.name,
          category: phase.category,
          order: phase.order,
        },
        baseConfiguration: {
          estimatedDays: phase.phaseConfig.estimatedDays,
          isOptional: phase.phaseConfig.isOptional,
          allowParallel: phase.phaseConfig.allowParallel,
          requiresApproval: phase.phaseConfig.requiresApproval,
          totalDocuments: phase.requiredDocuments.length,
          mandatoryDocuments: phase.requiredDocuments.filter(
            (d) => d.isMandatory
          ).length,
        },
        typeSpecificConfigs: phase.typeSpecificConfig,
      };

      // Si se especifica un tipo de contrato, incluir configuración efectiva
      if (contractTypeId) {
        config.effectiveForType = {
          contractTypeId: contractTypeId.toString(),
          effectiveDocuments: phase.getEffectiveDocuments(contractTypeId),
          effectiveDuration: phase.getEffectiveDuration(contractTypeId),
          hasSpecificConfig: phase.typeSpecificConfig.some(
            (config) =>
              config.contractType.toString() === contractTypeId.toString()
          ),
        };
      }

      return config;
    } catch (error) {
      throw new Error(`Error obteniendo configuración: ${error.message}`);
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

      return await this.model.paginate(query, { page, limit });
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
          {
            path: "typeSpecificConfig.contractType",
            select: "code name category",
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
  async validateApplicabilityToContractType(phaseId, contractTypeId) {
    try {
      const phase = await this.findById(phaseId);
      if (!phase) {
        throw new Error("Fase no encontrada");
      }

      const isApplicable = phase.isApplicableToContractType(contractTypeId);

      return {
        isApplicable,
        phase: {
          code: phase.code,
          name: phase.name,
          category: phase.category,
        },
        typeSpecificConfigs: phase.typeSpecificConfig,
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
  async getMandatoryDocuments(phaseId, contractTypeId = null) {
    try {
      const phase = await this.findById(phaseId);
      if (!phase) {
        throw new Error("Fase no encontrada");
      }

      const mandatoryDocs = phase.getMandatoryDocuments(contractTypeId);

      return {
        phaseCode: phase.code,
        phaseName: phase.name,
        documents: mandatoryDocs,
        totalMandatory: mandatoryDocs.length,
        contractTypeSpecific: contractTypeId !== null,
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
  async getOptionalDocuments(phaseId, contractTypeId = null) {
    try {
      const phase = await this.findById(phaseId);
      if (!phase) {
        throw new Error("Fase no encontrada");
      }

      const optionalDocs = phase.getOptionalDocuments(contractTypeId);

      return {
        phaseCode: phase.code,
        phaseName: phase.name,
        documents: optionalDocs,
        totalOptional: optionalDocs.length,
        contractTypeSpecific: contractTypeId !== null,
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
        isOptional,
        allowParallel,
        searchText,
        minEstimatedDays,
        maxEstimatedDays,
        isActive = true,
      } = criteria;

      // Construir query base
      let query = this.model.find();

      // Aplicar filtros
      if (category) query = query.byCategory(category);
      if (contractType) {
        query = query.where({
          "typeSpecificConfig.contractType": contractType,
        });
      }
      if (order !== undefined) {
        query = query.where({ order });
      }

      if (isActive !== undefined) {
        query = query.where({ isActive });
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
          $or: [
            { name: { $regex: searchText, $options: "i" } },
            { code: { $regex: searchText, $options: "i" } },
            { description: { $regex: searchText, $options: "i" } },
          ],
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
            path: "typeSpecificConfig.contractType",
            select: "code name category",
          },
        ]);
      }

      // Aplicar ordenamiento
      query = query.sort(sort);

      return await this.model.paginate(query, { page, limit });
    } catch (error) {
      throw new Error(`Error en búsqueda avanzada: ${error.message}`);
    }
  }

  // ===== MÉTODOS DE AUDITORÍA PARA OPERACIONES EN MAP =====

  async auditMapOperation(phaseId, mapField, operationData) {
    try {
      // Crear entrada de auditoría personalizada para operaciones en Map
      const auditEntry = {
        documentId: phaseId,
        collection: "contractphases",
        operation: "MAP_UPDATE",
        field: mapField,
        details: operationData,
        timestamp: new Date(),
        userId: operationData.userData?.userId || "system",
      };

      // Aquí se podría integrar con el sistema de auditoría
      console.log("Auditoría Map Operation:", auditEntry);

      return auditEntry;
    } catch (error) {
      throw new Error(`Error en auditoría de Map: ${error.message}`);
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
            phasesWithTypeConfig: {
              $sum: {
                $cond: [{ $gt: [{ $size: "$typeSpecificConfig" }, 0] }, 1, 0],
              },
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
            typeConfigPercentage: {
              $round: [
                {
                  $multiply: [
                    { $divide: ["$phasesWithTypeConfig", "$totalPhases"] },
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

    // Validaciones existentes
    if (data.code) {
      const isAvailable = await this.isCodeAvailable(data.code);
      if (!isAvailable) {
        errors.push("El código ya existe");
      }
    }

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

    // Validar typeSpecificConfig
    if (data.typeSpecificConfig && data.typeSpecificConfig.length > 0) {
      const contractTypeIds = data.typeSpecificConfig.map((config) =>
        config.contractType?.toString()
      );
      const uniqueIds = [...new Set(contractTypeIds)];

      if (contractTypeIds.length !== uniqueIds.length) {
        errors.push(
          "No puede haber configuraciones duplicadas para el mismo tipo de contrato"
        );
      }
    }

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
