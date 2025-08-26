// =============================================================================
// src/module/exp-digital/repositories/department.repository.js
// Repositorio especializado para gestión de departamentos organizacionales
// =============================================================================

import { Types } from "mongoose";
import { BaseRepository } from "../../core/base/repositories/base.repository.js";
import { Department } from "../models/department.scheme.js";

export class DepartmentRepository extends BaseRepository {
  constructor() {
    super(Department);
    this.setupDepartmentLookups();
  }

  /**
   * Configurar lookups específicos para departamentos
   */
  setupDepartmentLookups() {
    // Lookups específicos para departamentos
    this.departmentLookups = {
      parentDepartment: {
        from: "departments",
        localField: "parentDepartment",
        foreignField: "_id",
        as: "parentInfo",
        pipeline: [
          { $project: { code: 1, name: 1, shortName: 1, level: 1, isActive: 1 } }
        ]
      },
      children: {
        from: "departments",
        localField: "_id",
        foreignField: "parentDepartment",
        as: "childrenInfo",
        pipeline: [
          { $match: { isActive: true } },
          { $project: { code: 1, name: 1, shortName: 1, level: 1, displayOrder: 1 } },
          { $sort: { displayOrder: 1, name: 1 } }
        ]
      }
    };
  }

  // ===== MÉTODOS DE BÚSQUEDA JERÁRQUICOS =====

  /**
   * Buscar departamento por código
   */
  async findByCode(code) {
    try {
      const department = await this.model.findOne({ 
        code: code.toUpperCase(),
        isActive: true
      }).populate([
        { path: 'parentDepartment', select: 'code name shortName level' }
      ]).lean();

      if (!department) {
        throw new Error(`Departamento con código ${code} no encontrado`);
      }

      return department;
    } catch (error) {
      throw new Error(`Error buscando departamento: ${error.message}`);
    }
  }

  /**
   * Obtener departamentos raíz (sin padre)
   */
  async findRootDepartments(options = {}) {
    const { page = 1, limit = 50, includeChildren = false } = options;

    const baseQuery = {
      $or: [
        { parentDepartment: null },
        { parentDepartment: { $exists: false } }
      ]
    };

    const lookups = [];
    if (includeChildren) {
      lookups.push(this.departmentLookups.children);
    }

    return await this.searchWithAggregation({
      filters: baseQuery,
      options: { 
        page, 
        limit, 
        sort: { displayOrder: 1, name: 1 } 
      },
      lookups
    });
  }

  /**
   * Buscar departamentos por nivel jerárquico
   */
  async findByLevel(level, options = {}) {
    const { page = 1, limit = 50, includeChildren = false, includeParent = false } = options;

    if (level < 0 || level > 10) {
      throw new Error('El nivel debe estar entre 0 y 10');
    }

    const lookups = [];
    if (includeChildren) lookups.push(this.departmentLookups.children);
    if (includeParent) lookups.push(this.departmentLookups.parentDepartment);

    return await this.searchWithAggregation({
      filters: { level },
      options: { 
        page, 
        limit, 
        sort: { displayOrder: 1, name: 1 } 
      },
      lookups
    });
  }

  /**
   * Obtener hijos directos de un departamento
   */
  async getChildren(parentId, options = {}) {
    const { page = 1, limit = 50, includeInactive = false } = options;

    const baseQuery = { parentDepartment: parentId };
    if (!includeInactive) {
      baseQuery.isActive = true;
    }

    return await this.searchWithAggregation({
      filters: baseQuery,
      options: { 
        page, 
        limit, 
        sort: { displayOrder: 1, name: 1 } 
      },
      lookups: [this.departmentLookups.children]
    });
  }

  /**
   * Obtener toda la jerarquía descendiente de un departamento
   */
  async getAllDescendants(parentId, maxDepth = 10) {
    try {
      if (!Types.ObjectId.isValid(parentId)) {
        throw new Error('ID de departamento no válido');
      }

      const pipeline = [
        {
          $match: {
            _id: new Types.ObjectId(parentId),
            isActive: true
          }
        },
        {
          $graphLookup: {
            from: 'departments',
            startWith: '$_id',
            connectFromField: '_id',
            connectToField: 'parentDepartment',
            as: 'descendants',
            maxDepth: maxDepth - 1,
            restrictSearchWithMatch: { isActive: true }
          }
        },
        {
          $project: {
            _id: 1,
            code: 1,
            name: 1,
            shortName: 1,
            level: 1,
            descendants: {
              $map: {
                input: '$descendants',
                as: 'desc',
                in: {
                  _id: '$$desc._id',
                  code: '$$desc.code',
                  name: '$$desc.name',
                  shortName: '$$desc.shortName',
                  level: '$$desc.level',
                  parentDepartment: '$$desc.parentDepartment'
                }
              }
            }
          }
        }
      ];

      const result = await this.model.aggregate(pipeline);
      return result[0] || null;

    } catch (error) {
      throw new Error(`Error obteniendo descendientes: ${error.message}`);
    }
  }

  /**
   * Obtener jerarquía completa hacia arriba (ancestros)
   */
  async getAncestors(departmentId) {
    try {
      if (!Types.ObjectId.isValid(departmentId)) {
        throw new Error('ID de departamento no válido');
      }

      const pipeline = [
        {
          $match: {
            _id: new Types.ObjectId(departmentId),
            isActive: true
          }
        },
        {
          $graphLookup: {
            from: 'departments',
            startWith: '$parentDepartment',
            connectFromField: 'parentDepartment',
            connectToField: '_id',
            as: 'ancestors',
            restrictSearchWithMatch: { isActive: true }
          }
        },
        {
          $project: {
            _id: 1,
            code: 1,
            name: 1,
            shortName: 1,
            level: 1,
            parentDepartment: 1,
            ancestors: {
              $map: {
                input: '$ancestors',
                as: 'anc',
                in: {
                  _id: '$$anc._id',
                  code: '$$anc.code',
                  name: '$$anc.name',
                  shortName: '$$anc.shortName',
                  level: '$$anc.level',
                  parentDepartment: '$$anc.parentDepartment'
                }
              }
            }
          }
        }
      ];

      const result = await this.model.aggregate(pipeline);
      return result[0] || null;

    } catch (error) {
      throw new Error(`Error obteniendo ancestros: ${error.message}`);
    }
  }

  /**
   * Construir árbol organizacional completo
   */
  async buildOrganizationalTree(options = {}) {
    try {
      const { includeInactive = false, maxDepth = 10 } = options;

      const matchStage = includeInactive ? {} : { isActive: true };

      const pipeline = [
        { $match: matchStage },
        {
          $lookup: {
            from: 'departments',
            localField: 'parentDepartment',
            foreignField: '_id',
            as: 'parent'
          }
        },
        {
          $addFields: {
            isRoot: { $eq: [{ $size: '$parent' }, 0] }
          }
        },
        {
          $sort: {
            level: 1,
            displayOrder: 1,
            name: 1
          }
        }
      ];

      const departments = await this.model.aggregate(pipeline);
      return this.buildTreeStructure(departments, maxDepth);

    } catch (error) {
      throw new Error(`Error construyendo árbol: ${error.message}`);
    }
  }

  /**
   * Construir estructura de árbol a partir de lista plana
   */
  buildTreeStructure(departments, maxDepth = 10) {
    const departmentMap = new Map();
    const tree = [];

    // Crear mapa de departamentos
    departments.forEach(dept => {
      departmentMap.set(dept._id.toString(), {
        ...dept,
        children: []
      });
    });

    // Construir relaciones padre-hijo
    departments.forEach(dept => {
      if (dept.parentDepartment) {
        const parent = departmentMap.get(dept.parentDepartment.toString());
        if (parent && dept.level <= maxDepth) {
          parent.children.push(departmentMap.get(dept._id.toString()));
        }
      } else {
        // Es un departamento raíz
        tree.push(departmentMap.get(dept._id.toString()));
      }
    });

    return tree;
  }

  // ===== BÚSQUEDAS POR CAPACIDADES PRESUPUESTARIAS =====

  /**
   * Buscar departamentos con capacidad de aprobación
   */
  async findWithApprovalCapability(minAmount = 0, options = {}) {
    const { page = 1, limit = 50 } = options;

    const filters = {
      'budgetConfig.canApproveContracts': true,
      'budgetConfig.maxApprovalAmount': { $gte: minAmount }
    };

    return await this.searchWithAggregation({
      filters,
      options: { 
        page, 
        limit, 
        sort: { 'budgetConfig.maxApprovalAmount': -1 } 
      }
    });
  }

  /**
   * Buscar departamentos por rango de aprobación
   */
  async findByApprovalRange(minAmount, maxAmount, options = {}) {
    const { page = 1, limit = 50 } = options;

    const filters = {
      'budgetConfig.canApproveContracts': true,
      'budgetConfig.maxApprovalAmount': {
        $gte: minAmount,
        $lte: maxAmount
      }
    };

    return await this.searchWithAggregation({
      filters,
      options: { page, limit, sort: { 'budgetConfig.maxApprovalAmount': -1 } }
    });
  }

  /**
   * Encontrar departamento apropiado para monto específico
   */
  async findApproverForAmount(amount, options = {}) {
    const { preferHigherLevel = true } = options;

    try {
      const query = {
        'budgetConfig.canApproveContracts': true,
        'budgetConfig.maxApprovalAmount': { $gte: amount },
        isActive: true
      };

      const sortOrder = preferHigherLevel ? 
        { level: 1, 'budgetConfig.maxApprovalAmount': 1 } : 
        { 'budgetConfig.maxApprovalAmount': 1, level: 1 };

      const department = await this.model
        .findOne(query)
        .sort(sortOrder)
        .populate('parentDepartment', 'code name level')
        .lean();

      return department;

    } catch (error) {
      throw new Error(`Error buscando aprobador: ${error.message}`);
    }
  }

  // ===== BÚSQUEDAS AVANZADAS =====

  /**
   * Búsqueda avanzada de departamentos
   */
  async advancedSearch(searchParams, options = {}) {
    try {
      const {
        code,
        name,
        level,
        parentDepartment,
        hasOwnBudget,
        canApprove,
        minApprovalAmount,
        maxApprovalAmount,
        responsibleName,
        responsibleEmail,
        tags,
        textSearch
      } = searchParams;

      const {
        page = 1,
        limit = 20,
        sort = { displayOrder: 1, name: 1 },
        includeInactive = false,
        includeHierarchy = false
      } = options;

      // Construir filtros
      const filters = {};
      
      if (!includeInactive) {
        filters.isActive = true;
      }

      if (code) {
        filters.code = { $regex: code, $options: 'i' };
      }

      if (name) {
        filters.name = { $regex: name, $options: 'i' };
      }

      if (level !== undefined) {
        filters.level = level;
      }

      if (parentDepartment) {
        filters.parentDepartment = new Types.ObjectId(parentDepartment);
      }

      if (hasOwnBudget !== undefined) {
        filters['budgetConfig.hasOwnBudget'] = hasOwnBudget;
      }

      if (canApprove !== undefined) {
        filters['budgetConfig.canApproveContracts'] = canApprove;
      }

      if (minApprovalAmount !== undefined) {
        filters['budgetConfig.maxApprovalAmount'] = { 
          $gte: minApprovalAmount 
        };
      }

      if (maxApprovalAmount !== undefined) {
        filters['budgetConfig.maxApprovalAmount'] = {
          ...filters['budgetConfig.maxApprovalAmount'],
          $lte: maxApprovalAmount
        };
      }

      if (responsibleName) {
        filters['responsible.name'] = { $regex: responsibleName, $options: 'i' };
      }

      if (responsibleEmail) {
        filters['responsible.email'] = { $regex: responsibleEmail, $options: 'i' };
      }

      if (tags && Array.isArray(tags) && tags.length > 0) {
        filters.tags = { $in: tags };
      }

      // Configurar lookups
      const lookups = [];
      if (includeHierarchy) {
        lookups.push(this.departmentLookups.parentDepartment);
        lookups.push(this.departmentLookups.children);
      }

      // Pipeline personalizado para búsqueda de texto
      const customPipeline = [];
      if (textSearch) {
        customPipeline.push({
          $match: {
            $or: [
              { code: { $regex: textSearch, $options: 'i' } },
              { name: { $regex: textSearch, $options: 'i' } },
              { shortName: { $regex: textSearch, $options: 'i' } },
              { description: { $regex: textSearch, $options: 'i' } },
              { 'responsible.name': { $regex: textSearch, $options: 'i' } },
              { 'contact.address': { $regex: textSearch, $options: 'i' } }
            ]
          }
        });
      }

      return await this.searchWithAggregation({
        filters,
        options: { page, limit, sort },
        lookups,
        customPipeline
      });

    } catch (error) {
      throw new Error(`Error en búsqueda avanzada: ${error.message}`);
    }
  }

  // ===== ESTADÍSTICAS Y REPORTES =====

  /**
   * Estadísticas generales de departamentos
   */
  async getGeneralStats() {
    try {
      const pipeline = [
        { $match: { isActive: true } },
        {
          $group: {
            _id: null,
            totalDepartments: { $sum: 1 },
            departmentsByLevel: {
              $push: '$level'
            },
            withOwnBudget: {
              $sum: { $cond: ['$budgetConfig.hasOwnBudget', 1, 0] }
            },
            canApproveContracts: {
              $sum: { $cond: ['$budgetConfig.canApproveContracts', 1, 0] }
            },
            maxApprovalAmount: { $max: '$budgetConfig.maxApprovalAmount' },
            avgApprovalAmount: { $avg: '$budgetConfig.maxApprovalAmount' }
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
   * Estadísticas por nivel jerárquico
   */
  async getStatsByLevel() {
    try {
      const pipeline = [
        { $match: { isActive: true } },
        {
          $group: {
            _id: '$level',
            count: { $sum: 1 },
            withBudget: {
              $sum: { $cond: ['$budgetConfig.hasOwnBudget', 1, 0] }
            },
            canApprove: {
              $sum: { $cond: ['$budgetConfig.canApproveContracts', 1, 0] }
            },
            avgApprovalAmount: { $avg: '$budgetConfig.maxApprovalAmount' },
            maxApprovalAmount: { $max: '$budgetConfig.maxApprovalAmount' }
          }
        },
        { $sort: { _id: 1 } }
      ];

      return await this.model.aggregate(pipeline);

    } catch (error) {
      throw new Error(`Error en estadísticas por nivel: ${error.message}`);
    }
  }

  /**
   * Mapa de capacidades de aprobación
   */
  async getApprovalCapabilityMap() {
    try {
      const pipeline = [
        {
          $match: {
            isActive: true,
            'budgetConfig.canApproveContracts': true
          }
        },
        {
          $lookup: {
            from: 'departments',
            localField: 'parentDepartment',
            foreignField: '_id',
            as: 'parent'
          }
        },
        {
          $project: {
            code: 1,
            name: 1,
            shortName: 1,
            level: 1,
            'budgetConfig.maxApprovalAmount': 1,
            parentName: { $arrayElemAt: ['$parent.name', 0] },
            parentCode: { $arrayElemAt: ['$parent.code', 0] }
          }
        },
        {
          $sort: {
            level: 1,
            'budgetConfig.maxApprovalAmount': -1
          }
        }
      ];

      return await this.model.aggregate(pipeline);

    } catch (error) {
      throw new Error(`Error obteniendo mapa de aprobación: ${error.message}`);
    }
  }

  // ===== VALIDACIONES Y UTILIDADES =====

  /**
   * Verificar disponibilidad de código
   */
  async isCodeAvailable(code, excludeId = null) {
    try {
      const query = { 
        code: code.toUpperCase(),
        isActive: true
      };

      if (excludeId) {
        query._id = { $ne: excludeId };
      }

      const existingDepartment = await this.model.findOne(query);
      return !existingDepartment;

    } catch (error) {
      throw new Error(`Error verificando código: ${error.message}`);
    }
  }

  /**
   * Validar estructura jerárquica (evitar ciclos)
   */
  async validateHierarchy(departmentId, proposedParentId) {
    try {
      if (!proposedParentId) return true; // Sin padre es válido

      if (departmentId.toString() === proposedParentId.toString()) {
        return false; // No puede ser padre de sí mismo
      }

      // Verificar que el departamento propuesto como padre no sea descendiente
      const descendants = await this.getAllDescendants(departmentId);
      
      if (descendants && descendants.descendants) {
        const descendantIds = descendants.descendants.map(d => d._id.toString());
        return !descendantIds.includes(proposedParentId.toString());
      }

      return true;

    } catch (error) {
      throw new Error(`Error validando jerarquía: ${error.message}`);
    }
  }

  /**
   * Calcular nivel automáticamente basado en el padre
   */
  async calculateLevel(parentDepartmentId) {
    try {
      if (!parentDepartmentId) return 0; // Sin padre = nivel 0

      const parent = await this.findById(parentDepartmentId);
      return parent.level + 1;

    } catch (error) {
      throw new Error(`Error calculando nivel: ${error.message}`);
    }
  }

  /**
   * Actualizar niveles de descendientes después de cambio de jerarquía
   */
  async updateDescendantLevels(departmentId) {
    try {
      const department = await this.findById(departmentId);
      const descendants = await this.getAllDescendants(departmentId);

      if (descendants && descendants.descendants) {
        const updates = descendants.descendants.map(desc => {
          const newLevel = this.calculateLevelFromPath(desc, descendants.descendants);
          return {
            updateOne: {
              filter: { _id: desc._id },
              update: { $set: { level: newLevel } }
            }
          };
        });

        if (updates.length > 0) {
          await this.model.bulkWrite(updates);
        }
      }

    } catch (error) {
      throw new Error(`Error actualizando niveles: ${error.message}`);
    }
  }

  /**
   * Calcular nivel basado en la ruta jerárquica
   */
  calculateLevelFromPath(department, allDescendants) {
    let level = 1; // Nivel mínimo para descendientes
    let current = department;

    while (current.parentDepartment) {
      const parent = allDescendants.find(d => 
        d._id.toString() === current.parentDepartment.toString()
      );
      
      if (parent) {
        level++;
        current = parent;
      } else {
        break;
      }
    }

    return level;
  }

  /**
   * Reordenar departamentos por displayOrder
   */
  async reorderDepartments(departmentIds, startOrder = 1) {
    try {
      const updates = departmentIds.map((id, index) => ({
        updateOne: {
          filter: { _id: new Types.ObjectId(id) },
          update: { $set: { displayOrder: startOrder + index } }
        }
      }));

      await this.model.bulkWrite(updates);
      return true;

    } catch (error) {
      throw new Error(`Error reordenando departamentos: ${error.message}`);
    }
  }

  /**
   * Obtener breadcrumb jerárquico
   */
  async getBreadcrumb(departmentId) {
    try {
      const ancestors = await this.getAncestors(departmentId);
      
      if (!ancestors) return [];

      const breadcrumb = [];
      
      // Agregar ancestros en orden correcto (de raíz a padre)
      if (ancestors.ancestors) {
        const sortedAncestors = ancestors.ancestors.sort((a, b) => a.level - b.level);
        breadcrumb.push(...sortedAncestors);
      }

      // Agregar el departamento actual
      breadcrumb.push({
        _id: ancestors._id,
        code: ancestors.code,
        name: ancestors.name,
        shortName: ancestors.shortName,
        level: ancestors.level
      });

      return breadcrumb;

    } catch (error) {
      throw new Error(`Error obteniendo breadcrumb: ${error.message}`);
    }
  }
}

export default new DepartmentRepository();