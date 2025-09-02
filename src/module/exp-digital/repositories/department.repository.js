// =============================================================================
// src/module/exp-digital/repositories/department.repository.js
// Repositorio especializado para gestión de departamentos organizacionales - MEJORADO
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
    this.departmentLookups = {
      parentDepartment: {
        from: "departments",
        localField: "parentDepartment",
        foreignField: "_id",
        as: "parentInfo",
        pipeline: [
          {
            $project: { code: 1, name: 1, shortName: 1, level: 1, isActive: 1 },
          },
        ],
      },
      children: {
        from: "departments",
        localField: "_id",
        foreignField: "parentDepartment",
        as: "childrenInfo",
        pipeline: [
          { $match: { isActive: true } },
          {
            $project: {
              code: 1,
              name: 1,
              shortName: 1,
              level: 1,
              displayOrder: 1,
            },
          },
          { $sort: { displayOrder: 1, name: 1 } },
        ],
      },
    };
  }

  // ===== MÉTODOS DE BÚSQUEDA JERÁRQUICOS =====

  /**
   * Buscar departamento por código - UTILIZA QUERY HELPER
   */
  async findByCode(code) {
    try {
      const department = await this.model
        .findOne({
          code: code.toUpperCase(),
          isActive: true,
        })
        .populate({
          path: "parentDepartment",
          select: "code name shortName level",
        });

      return department;
    } catch (error) {
      throw new Error(
        `Error buscando departamento por código: ${error.message}`
      );
    }
  }

  /**
   * Buscar departamentos con capacidad de aprobación - USA QUERY HELPER
   */
  async findDepartmentsWithApprovalCapability(options = {}) {
    try {
      const { page = 1, limit = 10 } = options;

      // ✅ MEJORA: Usar query helper del esquema
      const query = this.model.find().withApprovalCapability();

      const result = await this.model.paginate(query, { page, limit });
      return result;
    } catch (error) {
      throw new Error(
        `Error buscando departamentos con capacidad de aprobación: ${error.message}`
      );
    }
  }

  /**
   * Buscar departamentos por nivel jerárquico - USA QUERY HELPER
   */
  async findByLevel(level, options = {}) {
    try {
      const { page = 1, limit = 10, includeInactive = false } = options;

      // ✅ MEJORA: Usar query helper del esquema
      let query = this.model.find().byLevel(level);

      if (!includeInactive) {
        query = query.where({ isActive: true });
      }

      const result = await this.model.paginate(query, { page, limit });
      return result;
    } catch (error) {
      throw new Error(
        `Error buscando departamentos por nivel: ${error.message}`
      );
    }
  }

  /**
   * Buscar departamentos hijos - USA QUERY HELPER
   */
  async findChildren(parentId, options = {}) {
    try {
      const { page = 1, limit = 10, includeInactive = false } = options;

      // ✅ MEJORA: Usar query helper del esquema
      let query = this.model.find().byParent(parentId);

      if (!includeInactive) {
        query = query.where({ isActive: true });
      }

      query = query.sort({ displayOrder: 1, name: 1 });

      const result = await this.model.paginate(query, { page, limit });
      return result;
    } catch (error) {
      throw new Error(`Error buscando departamentos hijos: ${error.message}`);
    }
  }

  /**
   * Verificar capacidad de aprobación de un departamento para un monto
   * ✅ MEJORA: Usar método del esquema
   */
  async checkApprovalCapability(departmentId, amount) {
    try {
      const department = await this.findById(departmentId);
      if (!department) {
        throw new Error("Departamento no encontrado");
      }

      // ✅ Usar método del esquema
      return department.canApprove(amount);
    } catch (error) {
      throw new Error(
        `Error verificando capacidad de aprobación: ${error.message}`
      );
    }
  }

  /**
   * Obtener jerarquía completa de un departamento
   * ✅ MEJORA: Usar método del esquema cuando sea apropiado
   */
  async getFullHierarchy(departmentId) {
    try {
      const department = await this.findById(departmentId);
      if (!department) {
        throw new Error("Departamento no encontrado");
      }

      // ✅ Usar método del esquema
      return await department.getFullHierarchy();
    } catch (error) {
      throw new Error(`Error obteniendo jerarquía completa: ${error.message}`);
    }
  }

  /**
   * Obtener todos los descendientes usando agregación eficiente
   */
  async getAllDescendants(departmentId) {
    try {
      if (!Types.ObjectId.isValid(departmentId)) {
        throw new Error("ID de departamento no válido");
      }

      const pipeline = [
        {
          $match: {
            _id: new Types.ObjectId(departmentId),
            isActive: true,
          },
        },
        {
          $graphLookup: {
            from: "departments",
            startWith: "$_id",
            connectFromField: "_id",
            connectToField: "parentDepartment",
            as: "descendants",
            maxDepth: 10,
            restrictSearchWithMatch: { isActive: true },
          },
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
                input: "$descendants",
                as: "desc",
                in: {
                  _id: "$$desc._id",
                  code: "$$desc.code",
                  name: "$$desc.name",
                  shortName: "$$desc.shortName",
                  level: "$$desc.level",
                  parentDepartment: "$$desc.parentDepartment",
                  displayOrder: "$$desc.displayOrder",
                },
              },
            },
          },
        },
      ];

      const result = await this.model.aggregate(pipeline);
      return result[0] || null;
    } catch (error) {
      throw new Error(`Error obteniendo descendientes: ${error.message}`);
    }
  }

  /**
   * Crear departamento con validaciones mejoradas
   * ✅ MEJORA: Usar validaciones del repositorio antes de delegar al esquema
   */
  async create(data, userData, options = {}) {
    try {
      // Validaciones previas
      if (!(await this.isCodeAvailable(data.code))) {
        throw new Error("El código ya existe");
      }

      if (data.parentDepartment) {
        if (!(await this.validateHierarchy(null, data.parentDepartment))) {
          throw new Error("Jerarquía inválida");
        }

        // Calcular nivel automáticamente
        data.level = await this.calculateLevel(data.parentDepartment);
      } else {
        data.level = 0;
      }

      return await super.create(data, userData, options);
    } catch (error) {
      throw new Error(`Error creando departamento: ${error.message}`);
    }
  }

  /**
   * Actualizar departamento con validaciones mejoradas
   */
  async update(id, data, userData, options = {}) {
    try {
      // Validar código si se está cambiando
      if (data.code && !(await this.isCodeAvailable(data.code, id))) {
        throw new Error("El código ya existe");
      }

      // Validar jerarquía si se está cambiando el padre
      if (data.parentDepartment !== undefined) {
        if (!(await this.validateHierarchy(id, data.parentDepartment))) {
          throw new Error("Jerarquía inválida - crearía referencia circular");
        }

        if (data.parentDepartment) {
          data.level = await this.calculateLevel(data.parentDepartment);
        } else {
          data.level = 0;
        }
      }

      const result = await super.update(id, data, userData, options);

      // Actualizar niveles de descendientes si cambió la jerarquía
      if (data.parentDepartment !== undefined) {
        await this.updateDescendantLevels(id);
      }

      return result;
    } catch (error) {
      throw new Error(`Error actualizando departamento: ${error.message}`);
    }
  }

  // ===== MÉTODOS DE VALIDACIÓN =====

  /**
   * Verificar si un código está disponible
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

      if (
        departmentId &&
        departmentId.toString() === proposedParentId.toString()
      ) {
        return false; // No puede ser padre de sí mismo
      }

      // Verificar que el departamento propuesto como padre no sea descendiente
      if (departmentId) {
        const descendants = await this.getAllDescendants(departmentId);
        if (descendants && descendants.descendants) {
          const descendantIds = descendants.descendants.map((d) =>
            d._id.toString()
          );
          return !descendantIds.includes(proposedParentId.toString());
        }
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
      return parent ? parent.level + 1 : 0;
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
      if (!department) return;

      const descendants = await this.getAllDescendants(departmentId);

      if (descendants && descendants.descendants) {
        // Actualizar niveles en lotes para mejor performance
        const bulkOps = descendants.descendants.map((desc) => {
          const newLevel = this.calculateLevelFromHierarchy(
            desc,
            descendants.descendants
          );
          return {
            updateOne: {
              filter: { _id: desc._id },
              update: { $set: { level: newLevel } },
            },
          };
        });

        if (bulkOps.length > 0) {
          await this.model.bulkWrite(bulkOps);
        }
      }
    } catch (error) {
      throw new Error(
        `Error actualizando niveles de descendientes: ${error.message}`
      );
    }
  }

  /**
   * Calcular nivel basado en la jerarquía completa
   */
  calculateLevelFromHierarchy(department, allDescendants) {
    let level = 0;
    let currentParent = department.parentDepartment;

    while (currentParent) {
      level++;
      const parent = allDescendants.find(
        (d) => d._id.toString() === currentParent.toString()
      );
      currentParent = parent ? parent.parentDepartment : null;

      // Prevenir bucles infinitos
      if (level > 20) break;
    }

    return level;
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
            from: "departments",
            localField: "parentDepartment",
            foreignField: "_id",
            as: "parent",
          },
        },
        {
          $addFields: {
            isRoot: { $eq: [{ $size: "$parent" }, 0] },
          },
        },
        {
          $sort: {
            level: 1,
            displayOrder: 1,
            name: 1,
          },
        },
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
    departments.forEach((dept) => {
      departmentMap.set(dept._id.toString(), {
        ...dept,
        children: [],
      });
    });

    // Construir árbol
    departments.forEach((dept) => {
      const deptNode = departmentMap.get(dept._id.toString());

      if (dept.parentDepartment) {
        const parent = departmentMap.get(dept.parentDepartment.toString());
        if (parent && dept.level <= maxDepth) {
          parent.children.push(deptNode);
        }
      } else {
        // Es un nodo raíz
        tree.push(deptNode);
      }
    });

    return tree;
  }

  // ===== MÉTODOS DE BÚSQUEDA ESPECIALIZADA =====

  /**
   * Buscar departamentos por capacidad de aprobación y monto
   */
  async findApprovalCapableDepartments(amount, options = {}) {
    try {
      const { page = 1, limit = 10 } = options;

      const query = this.model
        .find({
          "budgetConfig.canApproveContracts": true,
          "budgetConfig.maxApprovalAmount": { $gte: amount },
          isActive: true,
        })
        .sort({ level: 1, "budgetConfig.maxApprovalAmount": 1 });

      return await this.model.paginate(query, { page, limit });
    } catch (error) {
      throw new Error(
        `Error buscando departamentos con capacidad de aprobación: ${error.message}`
      );
    }
  }

  /**
   * Buscar departamentos por tags
   */
  async findByTags(tags, options = {}) {
    try {
      const { page = 1, limit = 10 } = options;

      const query = this.model
        .find({
          tags: { $in: tags },
          isActive: true,
        })
        .sort({ name: 1 });

      return await this.model.paginate(query, { page, limit });
    } catch (error) {
      throw new Error(
        `Error buscando departamentos por tags: ${error.message}`
      );
    }
  }
}
