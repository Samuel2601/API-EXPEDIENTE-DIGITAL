// =============================================================================
// src/module/exp-digital/controllers/department.controller.js
// Controlador para gestión de departamentos organizacionales
// GADM Cantón Esmeraldas - Sistema de Contratación Pública
// =============================================================================

import { DepartmentService } from "../services/department.service.js";
import {
  requirePermission,
  requireAnyPermission,
  requireFlexiblePermissions,
} from "../../../middlewares/permission.middleware.js";
import { auth, verifyModuleAccess } from "../../../middlewares/auth.js";
import {
  createError,
  createValidationError,
  ERROR_CODES,
} from "../../../../utils/error.util.js";
import {
  validateObjectId,
  validateRequiredFields,
} from "../../../../utils/validation.util.js";

export class DepartmentController {
  constructor() {
    this.departmentService = new DepartmentService();
  }

  // =============================================================================
  // OPERACIONES CRUD DE DEPARTAMENTOS
  // =============================================================================

  /**
   * Crear nuevo departamento
   * POST /departments
   * Permisos: special.canManagePermissions (solo administradores)
   */
  createDepartment = [
    auth,
    verifyModuleAccess,
    /*requirePermission({
      category: "special",
      permission: "canManagePermissions",
      errorMessage: "Solo los administradores pueden crear departamentos",
    }),*/
    async (req, res) => {
      try {
        const { body, user } = req;

        console.log(`📝 Usuario ${user.userId} creando nuevo departamento`);

        // Validar campos requeridos
        validateRequiredFields(
          body,
          ["code", "name"],
          "datos del departamento"
        );

        const department = await this.departmentService.createDepartment(body, {
          userId: user.userId,
        });

        console.log(`✅ Departamento creado: ${department.code}`);

        res.status(201).json({
          success: true,
          data: department,
          message: "Departamento creado exitosamente",
          metadata: {
            createdBy: user.userId,
            createdAt: new Date(),
          },
        });
      } catch (error) {
        console.error(`❌ Error creando departamento: ${error.message}`);

        res.status(error.statusCode || 500).json({
          success: false,
          message: error.message || "Error interno del servidor",
          code: error.code || "CREATE_DEPARTMENT_ERROR",
        });
      }
    },
  ];

  /**
   * Obtener todos los departamentos
   * GET /departments
   * Permisos: Acceso básico al módulo (todos los usuarios pueden ver departamentos)
   */
  getAllDepartments = [
    auth,
    verifyModuleAccess,
    async (req, res) => {
      try {
        const { user, query } = req;

        console.log(`📋 Usuario ${user.userId} consultando departamentos`);

        // Extraer parámetros de consulta
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
        } = query;

        // Preparar filtros
        const filters = {
          page: parseInt(page),
          limit: parseInt(limit),
          sortBy,
          sortOrder,
          includeInactive: includeInactive === "true",
          level: level ? parseInt(level) : undefined,
          parentDepartment,
          canApproveContracts:
            canApproveContracts === "true"
              ? true
              : canApproveContracts === "false"
                ? false
                : undefined,
          tags: tags ? tags.split(",").map((tag) => tag.trim()) : undefined,
          searchTerm,
        };

        const result = await this.departmentService.getAllDepartments(filters);

        console.log(
          `✅ Departamentos devueltos: ${result.departments.length}/${result.pagination.totalDepartments}`
        );

        res.status(200).json({
          success: true,
          data: result,
          message: "Departamentos obtenidos exitosamente",
          filters: result.appliedFilters,
          metadata: {
            requestedBy: user.userId,
            requestedAt: new Date(),
          },
        });
      } catch (error) {
        console.error(`❌ Error obteniendo departamentos: ${error.message}`);

        res.status(error.statusCode || 500).json({
          success: false,
          message: error.message || "Error interno del servidor",
          code: error.code || "GET_DEPARTMENTS_ERROR",
        });
      }
    },
  ];

  /**
   * Obtener departamento por ID
   * GET /departments/:id
   * Permisos: Acceso básico al módulo
   */
  getDepartmentById = [
    auth,
    verifyModuleAccess,
    async (req, res) => {
      try {
        const { user, params, query } = req;
        const { id } = params;
        const {
          includeHierarchy = false,
          includeChildren = false,
          includeStats = false,
        } = query;

        console.log(
          `🔍 Usuario ${user.userId} consultando departamento: ${id}`
        );

        validateObjectId(id, "ID del departamento");

        const result = await this.departmentService.getDepartmentById(id, {
          includeHierarchy: includeHierarchy === "true",
          includeChildren: includeChildren === "true",
          includeStats: includeStats === "true",
        });

        if (!result) {
          return res.status(404).json({
            success: false,
            message: "Departamento no encontrado",
            code: "DEPARTMENT_NOT_FOUND",
          });
        }

        console.log(`✅ Departamento encontrado: ${result.department.code}`);

        res.status(200).json({
          success: true,
          data: result,
          metadata: {
            requestedBy: user.userId,
            requestedAt: new Date(),
            options: {
              includeHierarchy: includeHierarchy === "true",
              includeChildren: includeChildren === "true",
              includeStats: includeStats === "true",
            },
          },
        });
      } catch (error) {
        console.error(`❌ Error obteniendo departamento: ${error.message}`);

        res.status(error.statusCode || 500).json({
          success: false,
          message: error.message || "Error interno del servidor",
          code: error.code || "GET_DEPARTMENT_ERROR",
        });
      }
    },
  ];

  /**
   * Actualizar departamento
   * PUT /departments/:id
   * Permisos: special.canManagePermissions (solo administradores)
   */
  updateDepartment = [
    auth,
    verifyModuleAccess,
    requirePermission({
      category: "special",
      permission: "canManagePermissions",
      errorMessage: "Solo los administradores pueden actualizar departamentos",
    }),
    async (req, res) => {
      try {
        const { body, user, params } = req;
        const { id } = params;

        console.log(
          `✏️ Usuario ${user.userId} actualizando departamento: ${id}`
        );

        validateObjectId(id, "ID del departamento");

        const updatedDepartment = await this.departmentService.updateDepartment(
          id,
          body,
          { userId: user.userId }
        );

        console.log(`✅ Departamento actualizado: ${updatedDepartment.code}`);

        res.status(200).json({
          success: true,
          data: updatedDepartment,
          message: "Departamento actualizado exitosamente",
          metadata: {
            updatedBy: user.userId,
            updatedAt: new Date(),
          },
        });
      } catch (error) {
        console.error(`❌ Error actualizando departamento: ${error.message}`);

        res.status(error.statusCode || 500).json({
          success: false,
          message: error.message || "Error interno del servidor",
          code: error.code || "UPDATE_DEPARTMENT_ERROR",
        });
      }
    },
  ];

  /**
   * Eliminar departamento (soft delete)
   * DELETE /departments/:id
   * Permisos: special.canManagePermissions (solo administradores)
   */
  deleteDepartment = [
    auth,
    verifyModuleAccess,
    requirePermission({
      category: "special",
      permission: "canManagePermissions",
      errorMessage: "Solo los administradores pueden eliminar departamentos",
    }),
    async (req, res) => {
      try {
        const { user, params, body } = req;
        const { id } = params;
        const { force = false } = body;

        console.log(`🗑️ Usuario ${user.userId} eliminando departamento: ${id}`);

        validateObjectId(id, "ID del departamento");

        const result = await this.departmentService.deleteDepartment(id, {
          force: force === true,
          userId: user.userId,
        });

        console.log(`✅ Departamento eliminado: ${result.departmentCode}`);

        res.status(200).json({
          success: true,
          data: result,
          message: force
            ? "Departamento y sus descendientes eliminados exitosamente"
            : "Departamento eliminado exitosamente",
          metadata: {
            deletedBy: user.userId,
            deletedAt: new Date(),
            cascadeDelete: force === true,
          },
        });
      } catch (error) {
        console.error(`❌ Error eliminando departamento: ${error.message}`);

        res.status(error.statusCode || 500).json({
          success: false,
          message: error.message || "Error interno del servidor",
          code: error.code || "DELETE_DEPARTMENT_ERROR",
        });
      }
    },
  ];

  // =============================================================================
  // OPERACIONES ESPECÍFICAS PARA CONTRATACIÓN PÚBLICA
  // =============================================================================

  /**
   * Obtener departamentos que pueden aprobar un monto específico
   * GET /departments/approval/:amount
   * Permisos: Acceso básico al módulo
   */
  getDepartmentsForApproval = [
    auth,
    verifyModuleAccess,
    async (req, res) => {
      try {
        const { user, params, query } = req;
        const { amount } = params;
        const { contractType } = query;

        console.log(
          `💰 Usuario ${user.userId} consultando departamentos para aprobación de $${amount}`
        );

        const contractAmount = parseFloat(amount);
        if (isNaN(contractAmount) || contractAmount <= 0) {
          return res.status(400).json({
            success: false,
            message: "El monto debe ser un número válido mayor a 0",
            code: "INVALID_AMOUNT",
          });
        }

        const result = await this.departmentService.getDepartmentsForApproval(
          contractAmount,
          contractType
        );

        console.log(
          `✅ ${result.departments.length} departamentos pueden aprobar este monto`
        );

        res.status(200).json({
          success: true,
          data: result.departments,
          criteria: result.criteria,
          summary: {
            totalEligible: result.departments.length,
            contractAmount: result.contractAmount,
            contractType: result.contractType || "Cualquier tipo",
          },
          metadata: {
            requestedBy: user.userId,
            requestedAt: new Date(),
          },
        });
      } catch (error) {
        console.error(
          `❌ Error obteniendo departamentos para aprobación: ${error.message}`
        );

        res.status(error.statusCode || 500).json({
          success: false,
          message: error.message || "Error interno del servidor",
          code: error.code || "APPROVAL_DEPARTMENTS_ERROR",
        });
      }
    },
  ];

  /**
   * Obtener árbol organizacional
   * GET /departments/organizational-tree
   * Permisos: Acceso básico al módulo
   */
  getOrganizationalTree = [
    auth,
    verifyModuleAccess,
    async (req, res) => {
      try {
        const { user, query } = req;
        const {
          includeInactive = false,
          maxDepth = 10,
          includeStats = false,
        } = query;

        console.log(
          `🌳 Usuario ${user.userId} consultando árbol organizacional`
        );

        const result = await this.departmentService.getOrganizationalTree({
          includeInactive: includeInactive === "true",
          maxDepth: parseInt(maxDepth),
          includeStats: includeStats === "true",
        });

        console.log(
          `✅ Árbol organizacional generado: ${result.metadata.totalNodes} nodos`
        );

        res.status(200).json({
          success: true,
          data: result.tree,
          metadata: {
            ...result.metadata,
            requestedBy: user.userId,
            requestedAt: new Date(),
          },
        });
      } catch (error) {
        console.error(
          `❌ Error obteniendo árbol organizacional: ${error.message}`
        );

        res.status(error.statusCode || 500).json({
          success: false,
          message: error.message || "Error interno del servidor",
          code: error.code || "ORGANIZATIONAL_TREE_ERROR",
        });
      }
    },
  ];

  /**
   * Buscar departamentos con criterios específicos
   * POST /departments/search
   * Permisos: Acceso básico al módulo
   */
  searchDepartments = [
    auth,
    verifyModuleAccess,
    async (req, res) => {
      try {
        const { user, body } = req;

        console.log(
          `🔍 Usuario ${user.userId} realizando búsqueda de departamentos`
        );

        const searchCriteria = {
          searchTerm: body.searchTerm,
          tags: body.tags,
          canApproveAmount: body.canApproveAmount
            ? parseFloat(body.canApproveAmount)
            : undefined,
          level: body.level ? parseInt(body.level) : undefined,
          parentDepartment: body.parentDepartment,
          includeInactive: body.includeInactive === true,
        };

        const result =
          await this.departmentService.searchDepartments(searchCriteria);

        console.log(
          `✅ Búsqueda completada: ${result.totalResults} resultados`
        );

        res.status(200).json({
          success: true,
          data: result.departments,
          searchCriteria: result.searchCriteria,
          summary: {
            totalResults: result.totalResults,
          },
          metadata: {
            requestedBy: user.userId,
            requestedAt: new Date(),
          },
        });
      } catch (error) {
        console.error(
          `❌ Error en búsqueda de departamentos: ${error.message}`
        );

        res.status(error.statusCode || 500).json({
          success: false,
          message: error.message || "Error interno del servidor",
          code: error.code || "SEARCH_DEPARTMENTS_ERROR",
        });
      }
    },
  ];

  // =============================================================================
  // OPERACIONES DE ESTADÍSTICAS Y REPORTES
  // =============================================================================

  /**
   * Obtener estadísticas generales de departamentos
   * GET /departments/statistics
   * Permisos: Acceso básico al módulo
   */
  getDepartmentsStatistics = [
    auth,
    verifyModuleAccess,
    async (req, res) => {
      try {
        const { user } = req;

        console.log(
          `📊 Usuario ${user.userId} consultando estadísticas de departamentos`
        );

        const result = await this.departmentService.getDepartmentsStatistics();

        console.log(`✅ Estadísticas generadas exitosamente`);

        res.status(200).json({
          success: true,
          data: result.statistics,
          metadata: {
            ...result,
            requestedBy: user.userId,
            requestedAt: new Date(),
          },
        });
      } catch (error) {
        console.error(`❌ Error obteniendo estadísticas: ${error.message}`);

        res.status(error.statusCode || 500).json({
          success: false,
          message: error.message || "Error interno del servidor",
          code: error.code || "STATISTICS_ERROR",
        });
      }
    },
  ];

  /**
   * Validar jerarquía de departamentos
   * POST /departments/validate-hierarchy
   * Permisos: special.canManagePermissions (solo administradores)
   */
  validateDepartmentHierarchy = [
    auth,
    verifyModuleAccess,
    requirePermission({
      category: "special",
      permission: "canManagePermissions",
      errorMessage: "Solo los administradores pueden validar jerarquías",
    }),
    async (req, res) => {
      try {
        const { user, body } = req;
        const { departmentId, parentDepartmentId } = body;

        console.log(
          `🔧 Usuario ${user.userId} validando jerarquía de departamento`
        );

        // Validar IDs si se proporcionan
        if (departmentId) {
          validateObjectId(departmentId, "ID del departamento");
        }
        if (parentDepartmentId) {
          validateObjectId(parentDepartmentId, "ID del departamento padre");
        }

        // Usar el repositorio directamente para validación
        const isValid =
          await this.departmentService.departmentRepository.validateHierarchy(
            departmentId,
            parentDepartmentId
          );

        console.log(
          `✅ Validación de jerarquía: ${isValid ? "VÁLIDA" : "INVÁLIDA"}`
        );

        res.status(200).json({
          success: true,
          data: {
            isValidHierarchy: isValid,
            departmentId,
            parentDepartmentId,
            message: isValid
              ? "La jerarquía es válida"
              : "La jerarquía crearía una referencia circular",
          },
          metadata: {
            validatedBy: user.userId,
            validatedAt: new Date(),
          },
        });
      } catch (error) {
        console.error(`❌ Error validando jerarquía: ${error.message}`);

        res.status(error.statusCode || 500).json({
          success: false,
          message: error.message || "Error interno del servidor",
          code: error.code || "VALIDATE_HIERARCHY_ERROR",
        });
      }
    },
  ];

  // =============================================================================
  // OPERACIONES DE UTILIDADES
  // =============================================================================

  /**
   * Obtener tipos de tags disponibles para departamentos
   * GET /departments/available-tags
   * Permisos: Acceso básico al módulo
   */
  getAvailableTags = [
    auth,
    verifyModuleAccess,
    async (req, res) => {
      try {
        const { user } = req;

        console.log(`🏷️ Usuario ${user.userId} consultando tags disponibles`);

        // Obtener todos los departamentos activos para extraer tags únicos
        const allDepartments = await this.departmentService.getAllDepartments({
          includeInactive: false,
          limit: 10000, // Obtener todos
        });

        // Extraer tags únicos
        const allTags = new Set();
        allDepartments.departments.forEach((dept) => {
          if (dept.tags && dept.tags.length > 0) {
            dept.tags.forEach((tag) => allTags.add(tag));
          }
        });

        const availableTags = Array.from(allTags).sort();

        // Agregar tags sugeridos para contratación pública
        const suggestedTags = [
          "obras",
          "bienes",
          "servicios",
          "consultoria",
          "general",
          "construccion",
          "adquisiciones",
          "financiero",
          "juridico",
          "planificacion",
          "talento-humano",
          "tecnologia",
        ];

        const allUniqueTags = Array.from(
          new Set([...availableTags, ...suggestedTags])
        ).sort();

        console.log(`✅ ${allUniqueTags.length} tags disponibles`);

        res.status(200).json({
          success: true,
          data: {
            availableTags: allUniqueTags,
            currentlyUsed: availableTags,
            suggested: suggestedTags,
          },
          summary: {
            totalTags: allUniqueTags.length,
            currentlyUsed: availableTags.length,
            suggested: suggestedTags.length,
          },
          metadata: {
            requestedBy: user.userId,
            requestedAt: new Date(),
          },
        });
      } catch (error) {
        console.error(`❌ Error obteniendo tags disponibles: ${error.message}`);

        res.status(error.statusCode || 500).json({
          success: false,
          message: error.message || "Error interno del servidor",
          code: error.code || "AVAILABLE_TAGS_ERROR",
        });
      }
    },
  ];

  /**
   * Obtener departamentos por nivel específico
   * GET /departments/by-level/:level
   * Permisos: Acceso básico al módulo
   */
  getDepartmentsByLevel = [
    auth,
    verifyModuleAccess,
    async (req, res) => {
      try {
        const { user, params, query } = req;
        const { level } = params;
        const { includeInactive = false } = query;

        console.log(
          `📊 Usuario ${user.userId} consultando departamentos de nivel ${level}`
        );

        const departmentLevel = parseInt(level);
        if (isNaN(departmentLevel) || departmentLevel < 0) {
          return res.status(400).json({
            success: false,
            message: "El nivel debe ser un número entero mayor o igual a 0",
            code: "INVALID_LEVEL",
          });
        }

        const result = await this.departmentService.getAllDepartments({
          level: departmentLevel,
          includeInactive: includeInactive === "true",
          limit: 1000, // Obtener todos del nivel
          sortBy: "name",
          sortOrder: "asc",
        });

        console.log(
          `✅ ${result.departments.length} departamentos de nivel ${level}`
        );

        res.status(200).json({
          success: true,
          data: result.departments,
          summary: {
            level: departmentLevel,
            totalDepartments: result.departments.length,
            includeInactive: includeInactive === "true",
          },
          metadata: {
            requestedBy: user.userId,
            requestedAt: new Date(),
          },
        });
      } catch (error) {
        console.error(
          `❌ Error obteniendo departamentos por nivel: ${error.message}`
        );

        res.status(error.statusCode || 500).json({
          success: false,
          message: error.message || "Error interno del servidor",
          code: error.code || "DEPARTMENTS_BY_LEVEL_ERROR",
        });
      }
    },
  ];

  /**
   * Exportar departamentos
   * GET /departments/export
   * Permisos: special.canExportData
   */
  exportDepartments = [
    auth,
    verifyModuleAccess,
    requirePermission({
      category: "special",
      permission: "canExportData",
      errorMessage: "No tiene permisos para exportar datos",
    }),
    async (req, res) => {
      try {
        const { user, query } = req;
        const {
          format = "xlsx",
          includeInactive = false,
          includeStats = false,
        } = query;

        console.log(
          `📤 Usuario ${user.userId} exportando departamentos en formato: ${format}`
        );

        // Validar formato
        const validFormats = ["xlsx", "csv", "json"];
        if (!validFormats.includes(format)) {
          return res.status(400).json({
            success: false,
            message: `Formato de exportación inválido. Formatos válidos: ${validFormats.join(", ")}`,
            code: "INVALID_FORMAT",
          });
        }

        // Obtener todos los departamentos
        const allDepartments = await this.departmentService.getAllDepartments({
          includeInactive: includeInactive === "true",
          limit: 10000, // Todos los departamentos
          sortBy: "level",
          sortOrder: "asc",
        });

        let exportData = allDepartments.departments;

        // Incluir estadísticas si se solicita
        if (includeStats === "true") {
          const departmentsStats =
            await this.departmentService.getDepartmentsStatistics();
          exportData = exportData.map((dept) => ({
            ...dept,
            globalStats: departmentsStats.statistics,
          }));
        }

        // Preparar datos para exportación
        const exportDataFormatted = exportData.map((dept) => ({
          codigo: dept.code,
          nombre: dept.name,
          nombreCorto: dept.shortName || "",
          descripcion: dept.description || "",
          nivel: dept.level || 0,
          departamentoPadre: dept.parentDepartment?.code || "",
          puedeAprobarContratos: dept.budgetConfig?.canApproveContracts
            ? "Sí"
            : "No",
          montoMaximoAprobacion: dept.budgetConfig?.maxApprovalAmount || 0,
          tags: dept.tags ? dept.tags.join(", ") : "",
          activo: dept.isActive ? "Sí" : "No",
          fechaCreacion: dept.createdAt?.toISOString().split("T")[0] || "",
          hijosDirectos: dept.stats?.directChildren || 0,
          totalDescendientes: dept.stats?.totalDescendants || 0,
        }));

        let result;
        const timestamp = new Date().toISOString().split("T")[0];

        switch (format) {
          case "xlsx":
            // Para Excel, podrías usar una librería como exceljs
            result = {
              data: exportDataFormatted,
              filename: `departamentos_${timestamp}.xlsx`,
              contentType:
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            };
            break;

          case "csv":
            const csvHeaders = Object.keys(exportDataFormatted[0] || {}).join(
              ","
            );
            const csvRows = exportDataFormatted.map((row) =>
              Object.values(row)
                .map((value) => `"${value}"`)
                .join(",")
            );
            const csvContent = [csvHeaders, ...csvRows].join("\n");

            res.setHeader(
              "Content-Disposition",
              `attachment; filename="departamentos_${timestamp}.csv"`
            );
            res.setHeader("Content-Type", "text/csv; charset=utf-8");
            return res.status(200).send(csvContent);

          case "json":
            result = {
              data: exportDataFormatted,
              metadata: {
                exportedBy: user.userId,
                exportedAt: new Date(),
                totalRecords: exportDataFormatted.length,
                includeInactive: includeInactive === "true",
                includeStats: includeStats === "true",
              },
            };

            res.setHeader(
              "Content-Disposition",
              `attachment; filename="departamentos_${timestamp}.json"`
            );
            res.setHeader("Content-Type", "application/json");
            return res.status(200).json(result);
        }

        console.log(
          `✅ Exportación completada: ${exportDataFormatted.length} registros`
        );

        res.status(200).json({
          success: true,
          message: `Datos exportados exitosamente en formato ${format}`,
          data: result.data,
          metadata: {
            exportedBy: user.userId,
            exportedAt: new Date(),
            format,
            totalRecords: exportDataFormatted.length,
            filename: result.filename,
          },
        });
      } catch (error) {
        console.error(`❌ Error exportando departamentos: ${error.message}`);

        res.status(error.statusCode || 500).json({
          success: false,
          message: error.message || "Error interno del servidor",
          code: error.code || "EXPORT_ERROR",
        });
      }
    },
  ];
}
