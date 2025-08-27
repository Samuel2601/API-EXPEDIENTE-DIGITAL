// =============================================================================
// src/module/exp-digital/services/department.service.js
// Servicio de gestión de departamentos organizacionales - Sistema de Contratación Pública
// GADM Cantón Esmeraldas
// =============================================================================

import { DepartmentRepository } from "../repositories/department.repository.js";
import { BaseService } from "../../core/base/services/base.service.js";
import { AppError } from "../../core/middlewares/errorHandler.js";

export class DepartmentService extends BaseService {
  constructor() {
    super();
    this.departmentRepository = new DepartmentRepository();
  }

  // ===== MÉTODOS CRUD EXTENDIDOS =====

  /**
   * Crear nuevo departamento con validaciones específicas
   */
  async createDepartment(departmentData, userData) {
    try {
      // Validaciones de negocio específicas
      await this.validateDepartmentData(departmentData);

      // Normalizar datos antes de crear
      const normalizedData = this.normalizeDepartmentData(departmentData);

      // Crear departamento usando el repositorio
      const newDepartment = await this.departmentRepository.create(
        normalizedData,
        userData
      );

      return {
        success: true,
        data: newDepartment,
        message: "Departamento creado exitosamente",
      };
    } catch (error) {
      throw new AppError(
        `Error creando departamento: ${error.message}`,
        error.statusCode || 400
      );
    }
  }

  /**
   * Obtener departamento por ID con información relacionada
   */
  async getDepartmentById(departmentId, options = {}) {
    try {
      const {
        includeHierarchy = false,
        includeChildren = false,
        includeStats = false,
      } = options;

      let department = await this.departmentRepository.findById(departmentId);

      if (!department) {
        throw new AppError("Departamento no encontrado", 404);
      }

      // Enriquecer datos según opciones solicitadas
      if (includeHierarchy) {
        department.fullHierarchy =
          await this.departmentRepository.getFullHierarchy(departmentId);
      }

      if (includeChildren) {
        department.children = await this.departmentRepository.findChildren(
          departmentId,
          { includeInactive: false }
        );
      }

      if (includeStats) {
        department.stats = await this.getDepartmentStats(departmentId);
      }

      return {
        success: true,
        data: department,
      };
    } catch (error) {
      throw new AppError(
        `Error obteniendo departamento: ${error.message}`,
        error.statusCode || 500
      );
    }
  }

  /**
   * Actualizar departamento con validaciones jerárquicas
   */
  async updateDepartment(departmentId, updateData, userData) {
    try {
      // Validar que el departamento existe
      const existingDepartment =
        await this.departmentRepository.findById(departmentId);
      if (!existingDepartment) {
        throw new AppError("Departamento no encontrado", 404);
      }

      // Validar cambios jerárquicos si aplica
      if (updateData.parentDepartment !== undefined) {
        await this.validateHierarchyChange(departmentId, updateData);
      }

      // Normalizar datos
      const normalizedData = this.normalizeDepartmentData(updateData);

      // Actualizar usando repositorio
      const updatedDepartment = await this.departmentRepository.update(
        departmentId,
        normalizedData,
        userData
      );

      return {
        success: true,
        data: updatedDepartment,
        message: "Departamento actualizado exitosamente",
      };
    } catch (error) {
      throw new AppError(
        `Error actualizando departamento: ${error.message}`,
        error.statusCode || 500
      );
    }
  }

  /**
   * Listar departamentos con filtros y paginación
   */
  async listDepartments(filters = {}, options = {}) {
    try {
      const {
        page = 1,
        limit = 20,
        sortBy = "name",
        sortOrder = "asc",
        includeInactive = false,
      } = options;

      // Construir filtros
      const query = this.buildDepartmentQuery(filters, includeInactive);

      // Configurar opciones de paginación
      const paginationOptions = {
        page: parseInt(page),
        limit: parseInt(limit),
        sort: { [sortBy]: sortOrder === "desc" ? -1 : 1 },
        populate: [
          {
            path: "parentDepartment",
            select: "code name shortName level",
          },
        ],
      };

      const result = await this.departmentRepository.findWithPagination(
        query,
        paginationOptions
      );

      return {
        success: true,
        data: result.docs,
        pagination: {
          currentPage: result.page,
          totalPages: result.totalPages,
          totalDocs: result.totalDocs,
          hasNextPage: result.hasNextPage,
          hasPrevPage: result.hasPrevPage,
        },
      };
    } catch (error) {
      throw new AppError(`Error listando departamentos: ${error.message}`, 500);
    }
  }

  // ===== MÉTODOS ESPECÍFICOS PARA CONTRATACIÓN PÚBLICA =====

  /**
   * Obtener departamentos con capacidad de aprobación por monto
   */
  async getDepartmentsForApproval(contractAmount, contractType = null) {
    try {
      const approvalCapableDepartments =
        await this.departmentRepository.findApprovalCapableDepartments(
          contractAmount
        );

      // Filtrar por tipo de contrato si se especifica
      let filteredDepartments = approvalCapableDepartments.docs;

      if (contractType) {
        filteredDepartments = filteredDepartments.filter((dept) =>
          this.canDepartmentHandleContractType(dept, contractType)
        );
      }

      // Ordenar por nivel jerárquico y capacidad de aprobación
      filteredDepartments.sort((a, b) => {
        if (a.level !== b.level) return a.level - b.level;
        return (
          a.budgetConfig.maxApprovalAmount - b.budgetConfig.maxApprovalAmount
        );
      });

      return {
        success: true,
        data: filteredDepartments,
        contractAmount,
        contractType,
        message: `${filteredDepartments.length} departamentos pueden aprobar este monto`,
      };
    } catch (error) {
      throw new AppError(
        `Error obteniendo departamentos para aprobación: ${error.message}`,
        500
      );
    }
  }

  /**
   * Obtener árbol organizacional para visualización
   */
  async getOrganizationalTree(options = {}) {
    try {
      const { includeInactive = false, maxDepth = 10 } = options;

      const tree = await this.departmentRepository.buildOrganizationalTree({
        includeInactive,
        maxDepth,
      });

      // Enriquecer árbol con estadísticas si es necesario
      const enrichedTree = await this.enrichTreeWithStats(tree);

      return {
        success: true,
        data: enrichedTree,
        metadata: {
          maxDepth,
          includeInactive,
          totalNodes: this.countTreeNodes(enrichedTree),
        },
      };
    } catch (error) {
      throw new AppError(
        `Error construyendo árbol organizacional: ${error.message}`,
        500
      );
    }
  }

  /**
   * Buscar departamentos por criterios específicos de contratación
   */
  async searchDepartmentsForContracting(searchCriteria) {
    try {
      const {
        searchTerm,
        tags,
        canApproveAmount,
        level,
        parentDepartment,
        includeInactive = false,
      } = searchCriteria;

      let results = [];

      // Búsqueda por texto si se proporciona
      if (searchTerm) {
        results = await this.departmentRepository.searchByText(searchTerm, {
          includeInactive,
        });
      }

      // Filtrar por tags
      if (tags && tags.length > 0) {
        const tagResults = await this.departmentRepository.findByTags(tags);
        results = this.mergeSearchResults(results, tagResults.docs);
      }

      // Filtrar por capacidad de aprobación
      if (canApproveAmount) {
        const approvalResults =
          await this.departmentRepository.findApprovalCapableDepartments(
            canApproveAmount
          );
        results = this.mergeSearchResults(results, approvalResults.docs);
      }

      // Aplicar filtros adicionales
      if (level !== undefined) {
        results = results.filter((dept) => dept.level === level);
      }

      if (parentDepartment) {
        results = results.filter(
          (dept) =>
            dept.parentDepartment &&
            dept.parentDepartment._id.toString() === parentDepartment
        );
      }

      return {
        success: true,
        data: results,
        searchCriteria,
        totalResults: results.length,
      };
    } catch (error) {
      throw new AppError(
        `Error en búsqueda de departamentos: ${error.message}`,
        500
      );
    }
  }

  // ===== MÉTODOS DE VALIDACIÓN Y UTILIDADES =====

  /**
   * Validar datos de departamento antes de crear/actualizar
   */
  async validateDepartmentData(data) {
    const errors = [];

    // Validar código requerido y formato
    if (!data.code || data.code.trim().length === 0) {
      errors.push("El código del departamento es requerido");
    } else if (!/^[A-Z0-9_-]+$/.test(data.code.toUpperCase())) {
      errors.push(
        "El código solo puede contener letras mayúsculas, números, guiones y guiones bajos"
      );
    }

    // Validar nombre requerido
    if (!data.name || data.name.trim().length === 0) {
      errors.push("El nombre del departamento es requerido");
    }

    // Validar configuración presupuestaria
    if (data.budgetConfig) {
      if (
        data.budgetConfig.canApproveContracts &&
        (!data.budgetConfig.maxApprovalAmount ||
          data.budgetConfig.maxApprovalAmount <= 0)
      ) {
        errors.push(
          "Si el departamento puede aprobar contratos, debe especificar un monto máximo válido"
        );
      }
    }

    // Validar email si se proporciona
    if (data.contact?.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(data.contact.email)) {
        errors.push("El formato del email es inválido");
      }
    }

    if (errors.length > 0) {
      throw new AppError(
        `Datos de departamento inválidos: ${errors.join(", ")}`,
        400
      );
    }
  }

  /**
   * Validar cambios jerárquicos
   */
  async validateHierarchyChange(departmentId, updateData) {
    if (!updateData.parentDepartment) return; // Sin padre es válido

    // Verificar que el nuevo padre no cree un ciclo
    const isValidHierarchy = await this.departmentRepository.validateHierarchy(
      departmentId,
      updateData.parentDepartment
    );

    if (!isValidHierarchy) {
      throw new AppError(
        "El cambio de jerarquía crearía una referencia circular",
        400
      );
    }
  }

  /**
   * Normalizar datos de departamento
   */
  normalizeDepartmentData(data) {
    const normalized = { ...data };

    // Normalizar código a mayúsculas
    if (normalized.code) {
      normalized.code = normalized.code.toUpperCase().trim();
    }

    // Normalizar nombre y descripción
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

    // Validar y normalizar email
    if (normalized.contact?.email) {
      normalized.contact.email = normalized.contact.email.toLowerCase().trim();
    }

    return normalized;
  }

  /**
   * Construir query para filtros de departamentos
   */
  buildDepartmentQuery(filters, includeInactive) {
    const query = {};

    // Filtro de estado activo
    if (!includeInactive) {
      query.isActive = true;
    }

    // Filtros específicos
    if (filters.level !== undefined) {
      query.level = filters.level;
    }

    if (filters.parentDepartment) {
      query.parentDepartment = filters.parentDepartment;
    }

    if (filters.canApproveContracts !== undefined) {
      query["budgetConfig.canApproveContracts"] = filters.canApproveContracts;
    }

    if (filters.tags && filters.tags.length > 0) {
      query.tags = { $in: filters.tags };
    }

    if (filters.searchTerm) {
      query.$text = { $search: filters.searchTerm };
    }

    return query;
  }

  // ===== MÉTODOS DE UTILIDAD Y ESTADÍSTICAS =====

  /**
   * Obtener estadísticas de un departamento
   */
  async getDepartmentStats(departmentId) {
    try {
      // Aquí se conectaría con otros repositorios para obtener estadísticas
      // Por ejemplo, contratos, procesos, etc.

      const descendants =
        await this.departmentRepository.getAllDescendants(departmentId);

      const children = await this.departmentRepository.findChildren(
        departmentId,
        { includeInactive: false }
      );

      return {
        totalDescendants: descendants.totalCount || 0,
        directChildren: children.totalDocs || 0,
        // contractsCount: await this.getContractsCount(departmentId),
        // activeProcesses: await this.getActiveProcessesCount(departmentId),
        // pendingApprovals: await this.getPendingApprovalsCount(departmentId),
      };
    } catch (error) {
      console.warn(
        `Error calculando estadísticas del departamento ${departmentId}:`,
        error.message
      );
      return {};
    }
  }

  /**
   * Verificar si un departamento puede manejar un tipo de contrato específico
   */
  canDepartmentHandleContractType(department, contractType) {
    // Lógica específica según el tipo de contratación
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
   */
  async enrichTreeWithStats(tree) {
    // Recursivamente enriquecer cada nodo del árbol
    const enrichNode = async (node) => {
      if (node._id) {
        try {
          node.stats = await this.getDepartmentStats(node._id);
        } catch (error) {
          node.stats = {};
        }
      }

      if (node.children && node.children.length > 0) {
        for (const child of node.children) {
          await enrichNode(child);
        }
      }
    };

    for (const rootNode of tree) {
      await enrichNode(rootNode);
    }

    return tree;
  }

  /**
   * Contar nodos en un árbol
   */
  countTreeNodes(tree) {
    let count = 0;
    const countNode = (node) => {
      count++;
      if (node.children) {
        node.children.forEach(countNode);
      }
    };

    tree.forEach(countNode);
    return count;
  }

  /**
   * Fusionar resultados de búsqueda eliminando duplicados
   */
  mergeSearchResults(results1, results2) {
    if (!results1 || results1.length === 0) return results2 || [];
    if (!results2 || results2.length === 0) return results1;

    const merged = [...results1];
    const existingIds = new Set(results1.map((r) => r._id.toString()));

    results2.forEach((result) => {
      if (!existingIds.has(result._id.toString())) {
        merged.push(result);
      }
    });

    return merged;
  }

  // ===== MÉTODOS PARA INTEGRACIÓN CON CONTRATACIÓN =====

  /**
   * Obtener ruta de aprobación para un proceso de contratación
   */
  async getApprovalPath(initiatingDepartmentId, contractAmount, contractType) {
    try {
      const approvalDepartments = await this.getDepartmentsForApproval(
        contractAmount,
        contractType
      );

      if (
        !approvalDepartments.success ||
        approvalDepartments.data.length === 0
      ) {
        throw new AppError(
          "No hay departamentos autorizados para aprobar este monto",
          400
        );
      }

      // Determinar la ruta de aprobación basada en la jerarquía
      const initiatingDept = await this.departmentRepository.findById(
        initiatingDepartmentId
      );

      if (!initiatingDept) {
        throw new AppError("Departamento iniciador no encontrado", 404);
      }

      const approvalPath = this.calculateApprovalPath(
        initiatingDept,
        approvalDepartments.data,
        contractAmount
      );

      return {
        success: true,
        data: {
          initiatingDepartment: initiatingDept,
          approvalPath,
          totalSteps: approvalPath.length,
          estimatedDays: this.estimateApprovalDays(approvalPath),
        },
      };
    } catch (error) {
      throw new AppError(
        `Error calculando ruta de aprobación: ${error.message}`,
        500
      );
    }
  }

  /**
   * Calcular ruta de aprobación específica
   */
  calculateApprovalPath(initiatingDept, approvalDepartments, amount) {
    // Lógica para determinar la secuencia de aprobación
    // basada en jerarquía organizacional y montos

    const path = [];

    // Encontrar el departamento de menor nivel que pueda aprobar
    const capableDept = approvalDepartments
      .filter((dept) => dept.budgetConfig.maxApprovalAmount >= amount)
      .sort((a, b) => a.level - b.level)[0];

    if (capableDept) {
      // Si es el mismo departamento, aprobación directa
      if (capableDept._id.toString() === initiatingDept._id.toString()) {
        path.push({
          department: capableDept,
          step: 1,
          type: "DIRECT_APPROVAL",
          required: true,
        });
      } else {
        // Construir ruta jerárquica
        path.push({
          department: initiatingDept,
          step: 1,
          type: "INITIATION",
          required: true,
        });

        path.push({
          department: capableDept,
          step: 2,
          type: "APPROVAL",
          required: true,
        });
      }
    }

    return path;
  }

  /**
   * Estimar días de aprobación
   */
  estimateApprovalDays(approvalPath) {
    // Estimación basada en el tipo de pasos en la ruta
    const baseDays = {
      INITIATION: 1,
      REVIEW: 2,
      APPROVAL: 3,
      DIRECT_APPROVAL: 1,
    };

    return approvalPath.reduce((total, step) => {
      return total + (baseDays[step.type] || 2);
    }, 0);
  }
}
