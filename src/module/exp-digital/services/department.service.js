// =============================================================================
// src/module/exp-digital/services/department.service.js
// Servicio de gestión de departamentos organizacionales - Sistema de Contratación Pública
// GADM Cantón Esmeraldas
// =============================================================================

import { DepartmentRepository } from "../repositories/department.repository.js";
import {
  createError,
  createValidationError,
  ERROR_CODES,
} from "../../../../utils/error.util.js";
import {
  validateObjectId,
  validateRequiredFields,
} from "../../../../utils/validation.util.js";
import { UserDepartmentAccess } from "../models/module-permission.scheme.js";

export class DepartmentService {
  constructor() {
    this.departmentRepository = new DepartmentRepository();
  }

  // =============================================================================
  // OPERACIONES CRUD DE DEPARTAMENTOS
  // =============================================================================

  /**
   * Crear nuevo departamento
   * @param {Object} departmentData - Datos del departamento
   * @param {Object} options - Opciones adicionales
   * @returns {Promise<Object>} Departamento creado
   */
  async createDepartment(departmentData, options = {}) {
    try {
      console.log("📝 Service: Creando nuevo departamento");

      // Validar datos requeridos
      await this._validateDepartmentData(departmentData);

      // Verificar que el código no exista
      const existingDepartment = await this.departmentRepository.findByCode(
        departmentData.code
      );
      if (existingDepartment) {
        throw createValidationError(
          `Ya existe un departamento con el código: ${departmentData.code}`
        );
      }

      // Normalizar datos
      const normalizedData = this._normalizeDepartmentData(departmentData);

      // Calcular nivel si tiene departamento padre
      if (normalizedData.parentDepartment) {
        validateObjectId(normalizedData.parentDepartment, "Departamento padre");

        // Validar que el padre exista
        const parentDept = await this.departmentRepository.findById(
          normalizedData.parentDepartment
        );
        if (!parentDept) {
          throw createValidationError("El departamento padre no existe");
        }

        // Validar jerarquía circular
        const isValidHierarchy =
          await this.departmentRepository.validateHierarchy(
            null,
            normalizedData.parentDepartment
          );
        if (!isValidHierarchy) {
          throw createValidationError("La jerarquía especificada es inválida");
        }

        // Calcular nivel automáticamente
        normalizedData.level = (parentDept.level || 0) + 1;
      } else {
        normalizedData.level = 0; // Departamento raíz
      }

      // Crear departamento
      const newDepartment = await this.departmentRepository.create(
        normalizedData,
        { userId: options.userId }
      );

      console.log(`✅ Service: Departamento creado: ${newDepartment.code}`);

      return newDepartment;
    } catch (error) {
      console.error(`❌ Service: Error creando departamento: ${error.message}`);
      throw createError(
        ERROR_CODES.CREATION_ERROR,
        `Error al crear departamento: ${error.message}`,
        400
      );
    }
  }

  /**
   * Obtener todos los departamentos con filtros
   * @param {Object} filters - Filtros de búsqueda
   * @param {String} userId - ID del usuario autenticado (requerido cuando canApproveContracts=true)
   * @returns {Promise<Object>} Lista de departamentos
   */
  async getAllDepartments(filters = {}, userId = null) {
    try {
      console.log("📋 Service: Obteniendo departamentos con filtros:", filters);

      const {
        page = 1,
        limit = 20,
        sortBy = "name",
        sortOrder = "asc",
        includeInactive = false,
        level,
        parentDepartment,
        canApproveContracts,
        tags,
        searchTerm,
      } = filters;

      // ✅ NUEVA LÓGICA: Si canApproveContracts=true, filtrar por permisos del usuario
      let allowedDepartmentIds = null;

      if (canApproveContracts === true && userId) {
        console.log(
          `🔐 Filtrando departamentos donde el usuario ${userId} puede crear contratos`
        );

        // Obtener todos los accesos activos del usuario
        const userAccesses = await UserDepartmentAccess.getUserAccesses(
          userId,
          "ACTIVE",
          null
        );

        // Filtrar solo los departamentos donde el usuario tiene permiso para crear contratos
        allowedDepartmentIds = userAccesses
          .filter((access) => access.permissions?.contracts?.canCreate === true)
          .map((access) => access.department._id || access.department);

        console.log(
          `✅ Usuario tiene permiso para crear contratos en ${allowedDepartmentIds.length} departamentos`
        );

        // Si no tiene permisos en ningún departamento, retornar lista vacía
        if (allowedDepartmentIds.length === 0) {
          return {
            departments: [],
            pagination: {
              currentPage: 1,
              totalPages: 0,
              totalDepartments: 0,
              limit: limit,
              hasNextPage: false,
              hasPrevPage: false,
            },
            appliedFilters: {
              level,
              parentDepartment,
              canApproveContracts,
              tags,
              searchTerm,
              includeInactive,
              sorting: { field: sortBy, order: sortOrder },
              userFiltered: true,
              allowedDepartments: allowedDepartmentIds.length,
            },
          };
        }
      }

      // Construir query de MongoDB
      const query = this._buildDepartmentQuery({
        includeInactive,
        level,
        parentDepartment,
        canApproveContracts,
        tags,
        searchTerm,
        allowedDepartmentIds, // ✅ Pasar los IDs permitidos al query builder
      });

      // Configurar opciones de consulta
      const queryOptions = {
        page,
        limit,
        sort: { [sortBy]: sortOrder === "desc" ? -1 : 1 },
        populate: [
          {
            path: "parentDepartment",
            select: "code name shortName level isActive",
          },
        ],
      };

      console.log("query", query, "queryOptions", queryOptions);

      // Ejecutar consulta
      const result = await this.departmentRepository.findAll(
        query,
        queryOptions
      );

      console.log("result", result);

      // Enriquecer datos
      const enrichedDepartments = await Promise.all(
        result.docs.map(async (dept) => {
          const enriched = dept.toObject ? dept.toObject() : dept;

          // Agregar estadísticas básicas
          enriched.stats = await this._calculateDepartmentStats(dept._id);

          return enriched;
        })
      );

      console.log(
        `✅ Service: Departamentos obtenidos: ${enrichedDepartments.length}/${result.totalDocs}`
      );

      return {
        departments: enrichedDepartments,
        pagination: {
          currentPage: result.page,
          totalPages: result.totalPages,
          totalDepartments: result.totalDocs,
          limit: result.limit,
          hasNextPage: result.hasNextPage,
          hasPrevPage: result.hasPrevPage,
        },
        appliedFilters: {
          level,
          parentDepartment,
          canApproveContracts,
          tags,
          searchTerm,
          includeInactive,
          sorting: { field: sortBy, order: sortOrder },
          userFiltered: canApproveContracts === true && userId ? true : false,
          allowedDepartments: allowedDepartmentIds
            ? allowedDepartmentIds.length
            : null,
        },
      };
    } catch (error) {
      console.error(
        `❌ Service: Error obteniendo departamentos: ${error.message}`
      );
      throw createError(
        ERROR_CODES.QUERY_ERROR,
        `Error al obtener departamentos: ${error.message}`,
        500
      );
    }
  }

  /**
   * Obtener departamento por ID
   * @param {String} departmentId - ID del departamento
   * @param {Object} options - Opciones de consulta
   * @returns {Promise<Object>} Departamento con información detallada
   */
  async getDepartmentById(departmentId, options = {}) {
    try {
      validateObjectId(departmentId, "ID del departamento");

      console.log(
        `🔍 Service: Obteniendo departamento por ID: ${departmentId}`
      );

      const {
        includeHierarchy = false,
        includeChildren = false,
        includeStats = false,
      } = options;

      // Obtener departamento base
      const department = await this.departmentRepository.findById(
        departmentId,
        {
          populate: [
            {
              path: "parentDepartment",
              select: "code name shortName level isActive",
            },
          ],
        }
      );

      if (!department) {
        return null;
      }

      const result = {
        department: department,
      };

      // Incluir jerarquía completa si se solicita
      if (includeHierarchy) {
        result.hierarchy = await this._getDepartmentHierarchy(departmentId);
      }

      // Incluir hijos directos si se solicita
      if (includeChildren) {
        result.children = await this.departmentRepository.findChildren(
          departmentId,
          { includeInactive: false }
        );
      }

      // Incluir estadísticas si se solicita
      if (includeStats) {
        result.statistics = await this._calculateDepartmentStats(departmentId);
      }

      console.log(`✅ Service: Departamento obtenido: ${department.code}`);

      return result;
    } catch (error) {
      console.error(
        `❌ Service: Error obteniendo departamento: ${error.message}`
      );
      throw createError(
        ERROR_CODES.QUERY_ERROR,
        `Error al obtener departamento: ${error.message}`,
        500
      );
    }
  }

  /**
   * Actualizar departamento
   * @param {String} departmentId - ID del departamento
   * @param {Object} updateData - Datos a actualizar
   * @param {Object} options - Opciones adicionales
   * @returns {Promise<Object>} Departamento actualizado
   */
  async updateDepartment(
    departmentId,
    updateData,
    options = {},
    userData = {}
  ) {
    try {
      validateObjectId(departmentId, "ID del departamento");

      console.log(`✏️ Service: Actualizando departamento: ${departmentId}`);

      // Obtener departamento actual
      const existingDepartment =
        await this.departmentRepository.findById(departmentId);
      if (!existingDepartment) {
        throw createError(
          ERROR_CODES.NOT_FOUND,
          "Departamento no encontrado",
          404
        );
      }

      // Validar cambios si es necesario
      if (updateData.code && updateData.code !== existingDepartment.code) {
        const duplicateDept = await this.departmentRepository.findByCode(
          updateData.code
        );
        if (duplicateDept && duplicateDept._id.toString() !== departmentId) {
          throw createValidationError(
            `Ya existe otro departamento con el código: ${updateData.code}`
          );
        }
      }

      // Validar cambios jerárquicos
      if (updateData.parentDepartment !== undefined) {
        await this._validateHierarchyChange(departmentId, updateData);
      }

      // Normalizar datos
      const normalizedData = this._normalizeDepartmentData(updateData);

      // Recalcular nivel si cambió el padre
      if (normalizedData.parentDepartment !== undefined) {
        if (normalizedData.parentDepartment) {
          const parentDept = await this.departmentRepository.findById(
            normalizedData.parentDepartment
          );
          if (!parentDept) {
            throw createValidationError("El departamento padre no existe");
          }
          normalizedData.level = (parentDept.level || 0) + 1;
        } else {
          normalizedData.level = 0;
        }

        // Si cambió la jerarquía, actualizar descendientes
        await this._updateDescendantsLevel(
          departmentId,
          normalizedData.level,
          userData
        );
      }

      // Actualizar departamento
      const updatedDepartment = await this.departmentRepository.update(
        departmentId,
        normalizedData,
        userData
      );

      console.log(
        `✅ Service: Departamento actualizado: ${updatedDepartment.code}`
      );

      return updatedDepartment;
    } catch (error) {
      console.error(
        `❌ Service: Error actualizando departamento: ${error.message}`
      );
      throw createError(
        ERROR_CODES.UPDATE_ERROR,
        `Error al actualizar departamento: ${error.message}`,
        400
      );
    }
  }

  /**
   * Eliminar departamento (soft delete)
   * @param {String} departmentId - ID del departamento
   * @param {Object} options - Opciones de eliminación
   * @returns {Promise<Object>} Resultado de la eliminación
   */
  async deleteDepartment(departmentId, options = {}, userData = {}) {
    try {
      validateObjectId(departmentId, "ID del departamento");

      console.log(`🗑️ Service: Eliminando departamento: ${departmentId}`);
      //updateById
      const { force = false } = options;

      // Obtener departamento
      const department = await this.departmentRepository.findById(departmentId);
      if (!department) {
        throw createError(
          ERROR_CODES.NOT_FOUND,
          "Departamento no encontrado",
          404
        );
      }

      // Verificar si tiene hijos activos
      const children = await this.departmentRepository.findChildren(
        departmentId,
        {
          includeInactive: false,
        }
      );

      if (children.length > 0 && !force) {
        throw createValidationError(
          "No se puede eliminar un departamento que tiene hijos activos. Use force: true para eliminar en cascada."
        );
      }

      // Verificar si está siendo usado en contratos activos
      // TODO: Implementar verificación de uso en contratos

      // Si tiene hijos y force = true, eliminar en cascada
      if (children.length > 0 && force) {
        for (const child of children) {
          await this.deleteDepartment(
            child._id.toString(),
            { force: true },
            userData
          );
        }
      }

      // Realizar soft delete
      const deletedDepartment = await this.departmentRepository.update(
        departmentId,
        {
          isActive: false,
          deletedAt: new Date(),
        },
        userData
      );

      console.log(`✅ Service: Departamento eliminado: ${department.code}`);

      return {
        departmentCode: department.code,
        departmentName: department.name,
        deletedAt: new Date(),
        childrenDeleted: children.length,
      };
    } catch (error) {
      console.error(
        `❌ Service: Error eliminando departamento: ${error.message}`
      );
      throw createError(
        ERROR_CODES.DELETE_ERROR,
        `Error al eliminar departamento: ${error.message}`,
        400
      );
    }
  }

  // =============================================================================
  // OPERACIONES ESPECÍFICAS PARA CONTRATACIÓN PÚBLICA
  // =============================================================================

  /**
   * Obtener departamentos con capacidad de aprobación por monto
   * @param {Number} contractAmount - Monto del contrato
   * @param {String} contractType - Tipo de contrato
   * @returns {Promise<Object>} Departamentos que pueden aprobar
   */
  async getDepartmentsForApproval(contractAmount, contractType = null) {
    try {
      console.log(
        `💰 Service: Buscando departamentos para aprobación de $${contractAmount}`
      );

      if (!contractAmount || contractAmount <= 0) {
        throw createValidationError("El monto del contrato debe ser mayor a 0");
      }

      // Obtener departamentos con capacidad de aprobación
      const approvalCapableDepartments =
        await this.departmentRepository.findApprovalCapableDepartments(
          contractAmount
        );

      let filteredDepartments =
        approvalCapableDepartments.docs || approvalCapableDepartments;

      // Filtrar por tipo de contrato si se especifica
      if (contractType) {
        filteredDepartments = filteredDepartments.filter((dept) =>
          this._canDepartmentHandleContractType(dept, contractType)
        );
      }

      // Ordenar por nivel jerárquico y capacidad de aprobación
      filteredDepartments.sort((a, b) => {
        // Primero por nivel (menor nivel = mayor autoridad)
        if (a.level !== b.level) return a.level - b.level;
        // Luego por capacidad de aprobación (mayor capacidad primero)
        return (
          (b.budgetConfig?.maxApprovalAmount || 0) -
          (a.budgetConfig?.maxApprovalAmount || 0)
        );
      });

      console.log(
        `✅ Service: ${filteredDepartments.length} departamentos pueden aprobar este monto`
      );

      return {
        departments: filteredDepartments,
        contractAmount,
        contractType,
        criteria: {
          minApprovalAmount: contractAmount,
          contractTypeFilter: contractType,
        },
      };
    } catch (error) {
      console.error(
        `❌ Service: Error obteniendo departamentos para aprobación: ${error.message}`
      );
      throw createError(
        ERROR_CODES.QUERY_ERROR,
        `Error al obtener departamentos para aprobación: ${error.message}`,
        500
      );
    }
  }

  /**
   * Obtener árbol organizacional
   * @param {Object} options - Opciones del árbol
   * @returns {Promise<Object>} Árbol organizacional
   */
  async getOrganizationalTree(options = {}) {
    try {
      console.log("🌳 Service: Construyendo árbol organizacional");

      const {
        includeInactive = false,
        maxDepth = 10,
        includeStats = false,
      } = options;

      // Construir árbol usando el repositorio
      const tree = await this.departmentRepository.buildOrganizationalTree({
        includeInactive,
        maxDepth,
      });

      // Enriquecer con estadísticas si se solicita
      let enrichedTree = tree;
      if (includeStats) {
        enrichedTree = await this._enrichTreeWithStats(tree);
      }

      // Calcular metadatos del árbol
      const metadata = {
        maxDepth,
        includeInactive,
        includeStats,
        totalNodes: this._countTreeNodes(enrichedTree),
        maxLevel: this._getMaxTreeLevel(enrichedTree),
      };

      console.log(
        `✅ Service: Árbol organizacional construido: ${metadata.totalNodes} nodos`
      );

      return {
        tree: enrichedTree,
        metadata,
      };
    } catch (error) {
      console.error(
        `❌ Service: Error construyendo árbol organizacional: ${error.message}`
      );
      throw createError(
        ERROR_CODES.QUERY_ERROR,
        `Error al construir árbol organizacional: ${error.message}`,
        500
      );
    }
  }

  /**
   * Buscar departamentos por criterios específicos
   * @param {Object} searchCriteria - Criterios de búsqueda
   * @returns {Promise<Object>} Resultados de búsqueda
   */
  async searchDepartments(searchCriteria) {
    try {
      console.log(
        "🔍 Service: Buscando departamentos con criterios:",
        searchCriteria
      );

      const {
        searchTerm,
        tags,
        canApproveAmount,
        level,
        parentDepartment,
        includeInactive = false,
      } = searchCriteria;

      let results = [];

      // Búsqueda por texto
      if (searchTerm) {
        const textResults = await this.departmentRepository.searchByText(
          searchTerm,
          {
            includeInactive,
          }
        );
        results = textResults.docs || textResults;
      } else {
        // Si no hay búsqueda por texto, obtener todos
        const allResults = await this.departmentRepository.findAll(
          { isActive: !includeInactive ? true : undefined },
          { sort: { level: 1, name: 1 } }
        );
        results = allResults;
      }

      // Aplicar filtros adicionales
      if (tags && tags.length > 0) {
        results = results.filter((dept) =>
          dept.tags?.some((tag) => tags.includes(tag))
        );
      }

      if (level !== undefined) {
        results = results.filter((dept) => dept.level === level);
      }

      if (parentDepartment) {
        validateObjectId(parentDepartment, "ID del departamento padre");
        results = results.filter(
          (dept) =>
            dept.parentDepartment &&
            dept.parentDepartment.toString() === parentDepartment
        );
      }

      if (canApproveAmount) {
        results = results.filter(
          (dept) =>
            dept.budgetConfig?.canApproveContracts &&
            (dept.budgetConfig?.maxApprovalAmount || 0) >= canApproveAmount
        );
      }

      // Enriquecer resultados
      const enrichedResults = await Promise.all(
        results.map(async (dept) => {
          const enriched = dept.toObject ? dept.toObject() : dept;
          enriched.stats = await this._calculateDepartmentStats(enriched._id);
          return enriched;
        })
      );

      console.log(
        `✅ Service: Búsqueda completada: ${enrichedResults.length} resultados`
      );

      return {
        departments: enrichedResults,
        searchCriteria,
        totalResults: enrichedResults.length,
      };
    } catch (error) {
      console.error(
        `❌ Service: Error en búsqueda de departamentos: ${error.message}`
      );
      throw createError(
        ERROR_CODES.QUERY_ERROR,
        `Error en búsqueda de departamentos: ${error.message}`,
        500
      );
    }
  }

  /**
   * Obtener estadísticas generales de departamentos usando agregación
   * @returns {Promise<Object>} Estadísticas generales
   */
  async getDepartmentsStatistics() {
    try {
      console.log(
        "📊 Service: Generando estadísticas de departamentos con agregación"
      );

      const pipeline = [
        {
          $match: {
            isActive: true,
            $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
          },
        },
        {
          $group: {
            _id: null,
            totalDepartments: { $sum: 1 },
            byLevel: { $push: "$level" },
            withApprovalCapacity: {
              $sum: {
                $cond: [
                  { $eq: ["$budgetConfig.canApproveContracts", true] },
                  1,
                  0,
                ],
              },
            },
            withoutParent: {
              $sum: {
                $cond: [{ $not: "$parentDepartment" }, 1, 0],
              },
            },
            totalChildren: {
              $sum: {
                $cond: ["$parentDepartment", 1, 0],
              },
            },
            totalApprovalCapacity: {
              $sum: {
                $cond: [
                  { $eq: ["$budgetConfig.canApproveContracts", true] },
                  "$budgetConfig.maxApprovalAmount",
                  0,
                ],
              },
            },
            maxLevel: { $max: "$level" },
            allTags: { $push: "$tags" },
          },
        },
      ];

      const result =
        await this.departmentRepository.getStatsWithAggregation(pipeline);
      const aggregationResult = result[0] || {};

      // Procesar niveles
      const byLevel = {};
      if (aggregationResult.byLevel) {
        aggregationResult.byLevel.forEach((level) => {
          byLevel[level] = (byLevel[level] || 0) + 1;
        });
      }

      // Procesar tags
      const byTags = {};
      if (aggregationResult.allTags) {
        aggregationResult.allTags.flat().forEach((tag) => {
          if (tag) byTags[tag] = (byTags[tag] || 0) + 1;
        });
      }

      const stats = {
        totalDepartments: aggregationResult.totalDepartments || 0,
        byLevel,
        withApprovalCapacity: aggregationResult.withApprovalCapacity || 0,
        withoutParent: aggregationResult.withoutParent || 0,
        averageChildrenPerDepartment:
          aggregationResult.withoutParent > 0
            ? Math.round(
                (aggregationResult.totalChildren /
                  (aggregationResult.totalDepartments -
                    aggregationResult.withoutParent)) *
                  100
              ) / 100
            : 0,
        maxLevel: aggregationResult.maxLevel || 0,
        totalApprovalCapacity: aggregationResult.totalApprovalCapacity || 0,
        byTags,
      };

      console.log(
        "✅ Service: Estadísticas generadas exitosamente con agregación"
      );

      return {
        statistics: stats,
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
   * Obtener estadísticas específicas de un departamento por ID usando agregación
   * @param {string} departmentId - ID del departamento
   * @returns {Promise<Object>} Estadísticas del departamento específico
   */
  async getDepartmentStatisticsById(departmentId) {
    try {
      console.log(
        `📊 Service: Generando estadísticas del departamento ${departmentId} con agregación`
      );

      // Primero validar que el departamento existe
      const department = await this.departmentRepository.findById(departmentId);
      if (!department) {
        throw createError(
          ERROR_CODES.DEPARTMENT_NOT_FOUND,
          `Departamento con ID ${departmentId} no encontrado`,
          404
        );
      }

      const pipeline = [
        {
          $match: {
            _id: new mongoose.Types.ObjectId(departmentId),
            isActive: true,
            $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
          },
        },
        {
          $lookup: {
            from: "departments", // nombre de la colección de departamentos
            localField: "_id",
            foreignField: "parentDepartment",
            as: "childrenDepartments",
          },
        },
        {
          $project: {
            name: 1,
            level: 1,
            description: 1,
            tags: 1,
            "budgetConfig.canApproveContracts": 1,
            "budgetConfig.maxApprovalAmount": 1,
            parentDepartment: 1,
            totalChildren: { $size: "$childrenDepartments" },
            activeChildren: {
              $size: {
                $filter: {
                  input: "$childrenDepartments",
                  as: "child",
                  cond: {
                    $and: [
                      { $eq: ["$$child.isActive", true] },
                      {
                        $or: [
                          { $eq: ["$$child.deletedAt", null] },
                          { $eq: ["$$child.deletedAt", { $exists: false }] },
                        ],
                      },
                    ],
                  },
                },
              },
            },
            hasApprovalCapacity: {
              $cond: [
                { $eq: ["$budgetConfig.canApproveContracts", true] },
                true,
                false,
              ],
            },
            approvalAmount: {
              $cond: [
                { $eq: ["$budgetConfig.canApproveContracts", true] },
                "$budgetConfig.maxApprovalAmount",
                0,
              ],
            },
            hasParent: {
              $cond: [{ $ne: ["$parentDepartment", null] }, true, false],
            },
          },
        },
      ];

      const result =
        await this.departmentRepository.getStatsWithAggregation(pipeline);
      const departmentStats = result[0];

      if (!departmentStats) {
        throw createError(
          ERROR_CODES.DEPARTMENT_NOT_FOUND,
          `Departamento con ID ${departmentId} no encontrado o inactivo`,
          404
        );
      }

      // Obtener estadísticas de los hijos
      const childrenPipeline = [
        {
          $match: {
            parentDepartment: new mongoose.Types.ObjectId(departmentId),
            isActive: true,
            $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
          },
        },
        {
          $group: {
            _id: null,
            totalChildrenApprovalCapacity: {
              $sum: {
                $cond: [
                  { $eq: ["$budgetConfig.canApproveContracts", true] },
                  "$budgetConfig.maxApprovalAmount",
                  0,
                ],
              },
            },
            childrenWithApprovalCapacity: {
              $sum: {
                $cond: [
                  { $eq: ["$budgetConfig.canApproveContracts", true] },
                  1,
                  0,
                ],
              },
            },
            maxChildLevel: { $max: "$level" },
            childrenTags: { $push: "$tags" },
          },
        },
      ];

      const childrenStatsResult =
        await this.departmentRepository.getStatsWithAggregation(
          childrenPipeline
        );
      const childrenStats = childrenStatsResult[0] || {};

      // Procesar tags de hijos
      const childrenByTags = {};
      if (childrenStats.childrenTags) {
        childrenStats.childrenTags.flat().forEach((tag) => {
          if (tag) childrenByTags[tag] = (childrenByTags[tag] || 0) + 1;
        });
      }

      const stats = {
        departmentInfo: {
          id: departmentId,
          name: departmentStats.name,
          level: departmentStats.level,
          description: departmentStats.description,
          tags: departmentStats.tags || [],
        },
        hierarchy: {
          hasParent: departmentStats.hasParent,
          totalChildren: departmentStats.totalChildren || 0,
          activeChildren: departmentStats.activeChildren || 0,
          maxChildLevel: childrenStats.maxChildLevel || 0,
        },
        budget: {
          hasApprovalCapacity: departmentStats.hasApprovalCapacity || false,
          approvalAmount: departmentStats.approvalAmount || 0,
          childrenWithApprovalCapacity:
            childrenStats.childrenWithApprovalCapacity || 0,
          totalChildrenApprovalCapacity:
            childrenStats.totalChildrenApprovalCapacity || 0,
          totalApprovalCapacity:
            (departmentStats.approvalAmount || 0) +
            (childrenStats.totalChildrenApprovalCapacity || 0),
        },
        childrenStatistics: {
          byTags: childrenByTags,
        },
      };

      console.log(
        `✅ Service: Estadísticas del departamento ${departmentId} generadas exitosamente`
      );

      return {
        statistics: stats,
        generatedAt: new Date(),
      };
    } catch (error) {
      console.error(
        `❌ Service: Error generando estadísticas del departamento: ${error.message}`
      );

      // Si el error ya es uno personalizado, lo relanzamos
      if (error.code && error.statusCode) {
        throw error;
      }

      throw createError(
        ERROR_CODES.STATISTICS_ERROR,
        `Error al generar estadísticas del departamento: ${error.message}`,
        500
      );
    }
  }

  // =============================================================================
  // MÉTODOS PRIVADOS Y UTILIDADES
  // =============================================================================

  /**
   * Validar datos del departamento
   * @param {Object} data - Datos del departamento
   * @private
   */
  async _validateDepartmentData(data) {
    const requiredFields = ["code", "name"];
    const missingFields = requiredFields.filter((field) => !data[field]);

    if (missingFields.length > 0) {
      throw createValidationError(
        `Campos requeridos faltantes: ${missingFields.join(", ")}`
      );
    }

    // Validar formato del código
    if (!/^[A-Z0-9_-]+$/.test(data.code.toUpperCase())) {
      throw createValidationError(
        "El código solo puede contener letras mayúsculas, números, guiones y guiones bajos"
      );
    }

    // Validar configuración presupuestaria
    if (data.budgetConfig?.canApproveContracts) {
      if (
        !data.budgetConfig.maxApprovalAmount ||
        data.budgetConfig.maxApprovalAmount <= 0
      ) {
        throw createValidationError(
          "Si el departamento puede aprobar contratos, debe especificar un monto máximo válido"
        );
      }
    }

    // Validar email si se proporciona
    if (data.contact?.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(data.contact.email)) {
        throw createValidationError("El formato del email es inválido");
      }
    }
  }

  /**
   * Normalizar datos del departamento
   * @param {Object} data - Datos a normalizar
   * @returns {Object} Datos normalizados
   * @private
   */
  _normalizeDepartmentData(data) {
    const normalized = { ...data };

    // Normalizar código a mayúsculas
    if (normalized.code) {
      normalized.code = normalized.code.toUpperCase().trim();
    }

    // Normalizar nombres
    if (normalized.name) {
      normalized.name = normalized.name.trim();
    }
    if (normalized.shortName) {
      normalized.shortName = normalized.shortName.trim();
    }
    if (normalized.description) {
      normalized.description = normalized.description.trim();
    }

    // Normalizar tags
    if (normalized.tags) {
      normalized.tags = normalized.tags
        .map((tag) => tag.toLowerCase().trim())
        .filter((tag) => tag.length > 0);
    }

    // Normalizar email
    if (normalized.contact?.email) {
      normalized.contact.email = normalized.contact.email.toLowerCase().trim();
    }

    return normalized;
  }

  /**
   * Construir query para filtros de departamentos
   * @param {Object} filters - Filtros aplicados
   * @returns {Object} Query de MongoDB
   * @private
   */
  _buildDepartmentQuery(filters) {
    const query = {};

    // Filtro de estado activo
    if (!filters.includeInactive) {
      query.isActive = true;
    }

    // ✅ NUEVO: Filtro por departamentos permitidos según permisos del usuario
    if (
      filters.allowedDepartmentIds &&
      Array.isArray(filters.allowedDepartmentIds) &&
      filters.allowedDepartmentIds.length > 0
    ) {
      query._id = { $in: filters.allowedDepartmentIds };
    }

    // Filtros específicos
    if (filters.level !== undefined) {
      query.level = filters.level;
    }

    if (filters.parentDepartment) {
      validateObjectId(filters.parentDepartment, "ID del departamento padre");
      query.parentDepartment = filters.parentDepartment;
    }

    if (filters.canApproveContracts !== undefined) {
      query["budgetConfig.canApproveContracts"] = filters.canApproveContracts;
    }

    if (filters.tags && filters.tags.length > 0) {
      query.tags = { $in: filters.tags };
    }

    // Búsqueda por texto
    if (filters.searchTerm) {
      query.$or = [
        { code: { $regex: filters.searchTerm, $options: "i" } },
        { name: { $regex: filters.searchTerm, $options: "i" } },
        { shortName: { $regex: filters.searchTerm, $options: "i" } },
        { description: { $regex: filters.searchTerm, $options: "i" } },
      ];
    }

    return query;
  }

  /**
   * Validar cambios jerárquicos
   * @param {String} departmentId - ID del departamento
   * @param {Object} updateData - Datos de actualización
   * @private
   */
  async _validateHierarchyChange(departmentId, updateData) {
    if (updateData.parentDepartment === undefined) return;

    if (updateData.parentDepartment) {
      validateObjectId(updateData.parentDepartment, "Departamento padre");

      // Verificar que el padre exista
      const parentExists = await this.departmentRepository.findById(
        updateData.parentDepartment
      );
      if (!parentExists) {
        throw createValidationError(
          "El departamento padre especificado no existe"
        );
      }

      // Verificar que no cree una referencia circular
      const isValidHierarchy =
        await this.departmentRepository.validateHierarchy(
          departmentId,
          updateData.parentDepartment
        );
      if (!isValidHierarchy) {
        throw createValidationError(
          "El cambio de jerarquía crearía una referencia circular"
        );
      }
    }
  }

  /**
   * Actualizar nivel de descendientes
   * @param {String} departmentId - ID del departamento padre
   * @param {Number} newLevel - Nuevo nivel del padre
   * @private
   */
  async _updateDescendantsLevel(departmentId, newLevel, userData = {}) {
    try {
      const descendants =
        await this.departmentRepository.getAllDescendants(departmentId);

      if (descendants && descendants.descendants) {
        for (const desc of descendants.descendants) {
          // Calcular nuevo nivel del descendiente
          const levelDiff = desc.level - (newLevel - 1);
          const newDescendantLevel = newLevel + levelDiff;

          await this.departmentRepository.update(
            desc._id,
            {
              level: newDescendantLevel,
            },
            userData
          );
        }
      }
    } catch (error) {
      console.warn(
        `⚠️ Error actualizando niveles de descendientes: ${error.message}`
      );
    }
  }

  /**
   * Calcular estadísticas de un departamento
   * @param {String} departmentId - ID del departamento
   * @returns {Promise<Object>} Estadísticas del departamento
   * @private
   */
  async _calculateDepartmentStats(departmentId) {
    try {
      // Obtener descendientes y hijos directos
      const [descendants, children] = await Promise.all([
        this.departmentRepository.getAllDescendants(departmentId),
        this.departmentRepository.findChildren(departmentId, {
          includeInactive: false,
        }),
      ]);

      return {
        totalDescendants: descendants?.descendants?.length || 0,
        directChildren: children?.length || 0,
        // TODO: Agregar estadísticas de contratos cuando estén disponibles
        // contractsCount: await this._getContractsCount(departmentId),
        // activeProcesses: await this._getActiveProcessesCount(departmentId),
      };
    } catch (error) {
      console.warn(
        `⚠️ Error calculando estadísticas del departamento ${departmentId}: ${error.message}`
      );
      return {
        totalDescendants: 0,
        directChildren: 0,
      };
    }
  }

  /**
   * Obtener jerarquía completa del departamento
   * @param {String} departmentId - ID del departamento
   * @returns {Promise<Object>} Jerarquía completa
   * @private
   */
  async _getDepartmentHierarchy(departmentId) {
    try {
      // Obtener ancestros (hacia arriba)
      const ancestors = await this._getAncestors(departmentId);

      // Obtener descendientes (hacia abajo)
      const descendants =
        await this.departmentRepository.getAllDescendants(departmentId);

      return {
        ancestors: ancestors.reverse(), // Mostrar desde raíz hacia el departamento
        current: departmentId,
        descendants: descendants?.descendants || [],
      };
    } catch (error) {
      console.warn(`⚠️ Error obteniendo jerarquía: ${error.message}`);
      return { ancestors: [], current: departmentId, descendants: [] };
    }
  }

  /**
   * Obtener ancestros de un departamento
   * @param {String} departmentId - ID del departamento
   * @returns {Promise<Array>} Lista de ancestros
   * @private
   */
  async _getAncestors(departmentId) {
    const ancestors = [];
    let currentId = departmentId;

    while (currentId) {
      const dept = await this.departmentRepository.findById(currentId, {
        populate: { path: "parentDepartment", select: "code name level" },
      });

      if (dept && dept.parentDepartment) {
        ancestors.push(dept.parentDepartment);
        currentId = dept.parentDepartment._id.toString();
      } else {
        break;
      }
    }

    return ancestors;
  }

  /**
   * Verificar si un departamento puede manejar un tipo de contrato
   * @param {Object} department - Departamento
   * @param {String} contractType - Tipo de contrato
   * @returns {Boolean} Puede manejar el tipo
   * @private
   */
  _canDepartmentHandleContractType(department, contractType) {
    const contractTypeHandling = {
      OBRA: ["OBRAS", "GENERAL", "CONSTRUCCION"],
      BIEN: ["BIENES", "GENERAL", "ADQUISICIONES"],
      SERVICIO: ["SERVICIOS", "GENERAL", "CONSULTORIA"],
      CONSULTORIA: ["CONSULTORIA", "SERVICIOS", "GENERAL"],
    };

    const allowedTags = contractTypeHandling[contractType.toUpperCase()] || [];

    return (
      !department.tags ||
      department.tags.length === 0 ||
      department.tags.some((tag) =>
        allowedTags.some((allowed) =>
          tag.toUpperCase().includes(allowed.toUpperCase())
        )
      )
    );
  }

  /**
   * Enriquecer árbol con estadísticas
   * @param {Object} tree - Árbol organizacional
   * @returns {Promise<Object>} Árbol enriquecido
   * @private
   */
  async _enrichTreeWithStats(tree) {
    const enrichNode = async (node) => {
      if (node._id) {
        try {
          node.stats = await this._calculateDepartmentStats(node._id);
        } catch (error) {
          node.stats = { totalDescendants: 0, directChildren: 0 };
        }
      }

      if (node.children && node.children.length > 0) {
        for (let child of node.children) {
          await enrichNode(child);
        }
      }
    };

    const enrichedTree = { ...tree };
    if (Array.isArray(enrichedTree)) {
      for (let node of enrichedTree) {
        await enrichNode(node);
      }
    } else {
      await enrichNode(enrichedTree);
    }

    return enrichedTree;
  }

  /**
   * Contar nodos del árbol
   * @param {Object} tree - Árbol organizacional
   * @returns {Number} Total de nodos
   * @private
   */
  _countTreeNodes(tree) {
    const countNodes = (node) => {
      let count = 1;
      if (node.children && node.children.length > 0) {
        for (let child of node.children) {
          count += countNodes(child);
        }
      }
      return count;
    };

    if (Array.isArray(tree)) {
      return tree.reduce((total, node) => total + countNodes(node), 0);
    }
    return countNodes(tree);
  }

  /**
   * Obtener nivel máximo del árbol
   * @param {Object} tree - Árbol organizacional
   * @returns {Number} Nivel máximo
   * @private
   */
  _getMaxTreeLevel(tree) {
    const getMaxLevel = (node, currentLevel = 0) => {
      let maxLevel = currentLevel;
      if (node.children && node.children.length > 0) {
        for (let child of node.children) {
          const childMaxLevel = getMaxLevel(child, currentLevel + 1);
          if (childMaxLevel > maxLevel) {
            maxLevel = childMaxLevel;
          }
        }
      }
      return maxLevel;
    };

    if (Array.isArray(tree)) {
      return Math.max(...tree.map((node) => getMaxLevel(node)));
    }
    return getMaxLevel(tree);
  }
}
