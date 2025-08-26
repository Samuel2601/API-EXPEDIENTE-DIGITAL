// =============================================================================
// src/module/exp-digital/services/module-permission.service.js
// Servicio para gestión de permisos multi-departamentales
// =============================================================================

import ModulePermissionRepository from "../repositories/module-permission.repository.js";
import {
  ACCESS_LEVELS,
  SYSTEM_ACTIONS,
} from "../models/module-permission.scheme.js";

export class ModulePermissionService {
  constructor() {
    this.repository = ModulePermissionRepository;
  }

  // ===== SERVICIOS PARA USER DEPARTMENT ACCESS =====

  /**
   * Crear acceso de usuario a departamento
   */
  async createUserDepartmentAccess(data, userData, options = {}) {
    try {
      // Validar que el usuario no tenga ya acceso activo al mismo departamento
      const existingAccess = await this.repository.findAll({
        user: data.user,
        department: data.department,
        status: "ACTIVE",
        isActive: true,
      });

      if (existingAccess.docs.length > 0) {
        throw new Error(
          "El usuario ya tiene acceso activo a este departamento"
        );
      }

      // Validar nivel de acceso
      if (!Object.values(ACCESS_LEVELS).includes(data.accessLevel)) {
        throw new Error("Nivel de acceso no válido");
      }

      return await this.repository.createUserDepartmentAccess(
        data,
        userData,
        options
      );
    } catch (error) {
      console.error("Error en servicio creando acceso:", error);
      throw error;
    }
  }

  /**
   * Obtener accesos de usuario con opciones de filtrado
   */
  async getUserAccesses(userId, options = {}) {
    try {
      if (!userId) {
        throw new Error("ID de usuario es requerido");
      }

      return await this.repository.getUserAccesses(userId, options);
    } catch (error) {
      console.error("Error en servicio obteniendo accesos:", error);
      throw error;
    }
  }

  /**
   * Obtener dashboard de permisos de usuario
   */
  async getUserDashboard(userId) {
    try {
      if (!userId) {
        throw new Error("ID de usuario es requerido");
      }

      return await this.repository.getUserDashboard(userId);
    } catch (error) {
      console.error("Error en servicio obteniendo dashboard:", error);
      throw error;
    }
  }

  /**
   * Verificar permisos de usuario
   */
  async checkUserPermission(
    userId,
    departmentId,
    category,
    permission,
    contractId = null
  ) {
    try {
      if (!userId || !departmentId || !category || !permission) {
        throw new Error("Parámetros requeridos faltantes");
      }

      return await this.repository.checkUserPermission(
        userId,
        departmentId,
        category,
        permission,
        contractId
      );
    } catch (error) {
      console.error("Error en servicio verificando permisos:", error);
      throw error;
    }
  }

  /**
   * Buscar accesos con filtros avanzados
   */
  async searchAccesses(filters = {}, options = {}) {
    try {
      // Validar y procesar filtros
      const processedFilters = this.processSearchFilters(filters);

      return await this.repository.searchAccesses(processedFilters, options);
    } catch (error) {
      console.error("Error en servicio buscando accesos:", error);
      throw error;
    }
  }

  /**
   * Actualizar acceso de usuario
   */
  async updateUserAccess(id, updateData, userData, options = {}) {
    try {
      if (!id) {
        throw new Error("ID de acceso es requerido");
      }

      // Validar que el acceso exista y esté activo
      const existingAccess = await this.repository.findById(id);
      if (!existingAccess || !existingAccess.isActive) {
        throw new Error("Acceso no encontrado o inactivo");
      }

      return await this.repository.updateUserAccess(
        id,
        updateData,
        userData,
        options
      );
    } catch (error) {
      console.error("Error en servicio actualizando acceso:", error);
      throw error;
    }
  }

  /**
   * Desactivar acceso de usuario
   */
  async deactivateUserAccess(id, userData, reason = "") {
    try {
      if (!id) {
        throw new Error("ID de acceso es requerido");
      }

      // Validar que el acceso exista y esté activo
      const existingAccess = await this.repository.findById(id);
      if (!existingAccess || !existingAccess.isActive) {
        throw new Error("Acceso no encontrado o ya está inactivo");
      }

      return await this.repository.deactivateUserAccess(id, userData, reason);
    } catch (error) {
      console.error("Error en servicio desactivando acceso:", error);
      throw error;
    }
  }

  /**
   * Reactivar acceso de usuario
   */
  async reactivateUserAccess(id, userData, reason = "") {
    try {
      if (!id) {
        throw new Error("ID de acceso es requerido");
      }

      // Validar que el acceso exista y esté inactivo
      const existingAccess = await this.repository.findById(id);
      if (!existingAccess || existingAccess.isActive) {
        throw new Error("Acceso no encontrado o ya está activo");
      }

      return await this.repository.reactivateUserAccess(id, userData, reason);
    } catch (error) {
      console.error("Error en servicio reactivando acceso:", error);
      throw error;
    }
  }

  /**
   * Transferir ownership de departamento
   */
  async transferDepartmentOwnership(
    departmentId,
    fromUserId,
    toUserId,
    userData,
    options = {}
  ) {
    try {
      if (!departmentId || !fromUserId || !toUserId) {
        throw new Error("Parámetros requeridos faltantes");
      }

      // Encontrar el acceso actual del owner
      const currentOwnerAccess = await this.repository.findAll({
        user: fromUserId,
        department: departmentId,
        accessLevel: ACCESS_LEVELS.OWNER,
        status: "ACTIVE",
        isActive: true,
      });

      if (currentOwnerAccess.docs.length === 0) {
        throw new Error("Usuario actual no es owner del departamento");
      }

      // Verificar si el nuevo usuario ya tiene acceso
      const newUserAccess = await this.repository.findAll({
        user: toUserId,
        department: departmentId,
        status: "ACTIVE",
        isActive: true,
      });

      let transactionResults = [];

      // Si el nuevo usuario ya tiene acceso, actualizarlo a OWNER
      if (newUserAccess.docs.length > 0) {
        const updateResult = await this.repository.updateUserAccess(
          newUserAccess.docs[0]._id,
          { accessLevel: ACCESS_LEVELS.OWNER },
          userData,
          options
        );
        transactionResults.push(updateResult);
      } else {
        // Crear nuevo acceso como OWNER
        const createResult = await this.repository.createUserDepartmentAccess(
          {
            user: toUserId,
            department: departmentId,
            accessLevel: ACCESS_LEVELS.OWNER,
            assignment: {
              assignedBy: userData.userId,
              isPrimary: true,
              assignmentReason: "Transferencia de ownership",
            },
          },
          userData,
          options
        );
        transactionResults.push(createResult);
      }

      // Degradar al owner anterior a CONTRIBUTOR
      const demoteResult = await this.repository.updateUserAccess(
        currentOwnerAccess.docs[0]._id,
        { accessLevel: ACCESS_LEVELS.CONTRIBUTOR },
        userData,
        options
      );
      transactionResults.push(demoteResult);

      return transactionResults;
    } catch (error) {
      console.error("Error en servicio transfiriendo ownership:", error);
      throw error;
    }
  }

  // ===== SERVICIOS PARA PERMISSION TEMPLATES =====

  /**
   * Crear plantilla de permisos
   */
  async createPermissionTemplate(data, userData, options = {}) {
    try {
      // Validar datos de la plantilla
      this.validateTemplateData(data);

      return await this.repository.createPermissionTemplate(
        data,
        userData,
        options
      );
    } catch (error) {
      console.error("Error en servicio creando plantilla:", error);
      throw error;
    }
  }

  /**
   * Buscar plantillas de permisos
   */
  async findTemplates(query = {}, options = {}) {
    try {
      return await this.repository.findTemplates(query, options);
    } catch (error) {
      console.error("Error en servicio buscando plantillas:", error);
      throw error;
    }
  }

  /**
   * Obtener plantillas aplicables
   */
  async getApplicableTemplates(
    roleId = null,
    departmentId = null,
    options = {}
  ) {
    try {
      return await this.repository.getApplicableTemplates(
        roleId,
        departmentId,
        options
      );
    } catch (error) {
      console.error(
        "Error en servicio obteniendo plantillas aplicables:",
        error
      );
      throw error;
    }
  }

  /**
   * Aplicar plantilla a múltiples usuarios
   */
  async applyTemplateToUsers(
    templateId,
    userIds,
    departmentId,
    userData,
    options = {}
  ) {
    try {
      if (
        !templateId ||
        !userIds ||
        !Array.isArray(userIds) ||
        userIds.length === 0
      ) {
        throw new Error("Parámetros requeridos inválidos");
      }

      // Obtener la plantilla
      const template =
        await this.repository.permissionTemplateModel.findById(templateId);
      if (!template || !template.isActive) {
        throw new Error("Plantilla no encontrada o inactiva");
      }

      const results = [];

      for (const userId of userIds) {
        try {
          // Verificar si el usuario ya tiene acceso al departamento
          const existingAccess = await this.repository.findAll({
            user: userId,
            department: departmentId,
            status: "ACTIVE",
            isActive: true,
          });

          if (existingAccess.docs.length > 0) {
            // Actualizar acceso existente
            const updatedAccess = await this.repository.updateUserAccess(
              existingAccess.docs[0]._id,
              {
                accessLevel: template.defaultAccessLevel,
                permissions: template.permissionTemplate,
              },
              userData,
              options
            );
            results.push({ userId, status: "updated", access: updatedAccess });
          } else {
            // Crear nuevo acceso
            const newAccess = await this.repository.createUserDepartmentAccess(
              {
                user: userId,
                department: departmentId,
                accessLevel: template.defaultAccessLevel,
                permissions: template.permissionTemplate,
                assignment: {
                  assignedBy: userData.userId,
                  assignmentReason: `Aplicada plantilla: ${template.name}`,
                },
              },
              userData,
              options
            );
            results.push({ userId, status: "created", access: newAccess });
          }
        } catch (userError) {
          results.push({ userId, status: "error", error: userError.message });
        }
      }

      return results;
    } catch (error) {
      console.error("Error en servicio aplicando plantilla:", error);
      throw error;
    }
  }

  // ===== SERVICIOS PARA PERMISSION HISTORY =====

  /**
   * Obtener historial de permisos
   */
  async getPermissionHistory(userDepartmentAccessId, options = {}) {
    try {
      if (!userDepartmentAccessId) {
        throw new Error("ID de acceso es requerido");
      }

      return await this.repository.getPermissionHistory(
        userDepartmentAccessId,
        options
      );
    } catch (error) {
      console.error("Error en servicio obteniendo historial:", error);
      throw error;
    }
  }

  /**
   * Obtener historial completo de usuario
   */
  async getUserPermissionHistory(userId, options = {}) {
    try {
      if (!userId) {
        throw new Error("ID de usuario es requerido");
      }

      // Obtener todos los accesos del usuario
      const userAccesses = await this.repository.getUserAccesses(userId, {
        includeInactive: true,
      });

      const historyResults = [];

      for (const access of userAccesses.docs) {
        const history = await this.repository.getPermissionHistory(
          access._id,
          options
        );
        historyResults.push({
          accessId: access._id,
          department: access.department,
          history: history.docs,
        });
      }

      return historyResults;
    } catch (error) {
      console.error(
        "Error en servicio obteniendo historial de usuario:",
        error
      );
      throw error;
    }
  }

  // ===== SERVICIOS DE VERIFICACIÓN DE PERMISOS =====

  /**
   * Verificar si usuario puede realizar acción del sistema
   */
  async canPerformSystemAction(
    userId,
    departmentId,
    systemAction,
    contractId = null
  ) {
    try {
      if (!userId || !departmentId || !systemAction) {
        throw new Error("Parámetros requeridos faltantes");
      }

      if (!Object.values(SYSTEM_ACTIONS).includes(systemAction)) {
        throw new Error("Acción del sistema no reconocida");
      }

      return await this.repository.canPerformSystemAction(
        userId,
        departmentId,
        systemAction,
        contractId
      );
    } catch (error) {
      console.error("Error en servicio verificando acción del sistema:", error);
      throw error;
    }
  }

  /**
   * Verificar múltiples permisos en lote
   */
  async batchCheckPermissions(checks = []) {
    try {
      if (!Array.isArray(checks) || checks.length === 0) {
        throw new Error("Array de verificaciones es requerido");
      }

      const results = [];

      for (const check of checks) {
        try {
          const result = await this.checkUserPermission(
            check.userId,
            check.departmentId,
            check.category,
            check.permission,
            check.contractId || null
          );
          results.push({ ...check, result });
        } catch (error) {
          results.push({
            ...check,
            result: {
              allowed: false,
              reason: error.message,
            },
          });
        }
      }

      return results;
    } catch (error) {
      console.error("Error en servicio verificando permisos en lote:", error);
      throw error;
    }
  }

  // ===== SERVICIOS DE ESTADÍSTICAS Y REPORTES =====

  /**
   * Obtener estadísticas de permisos
   */
  async getPermissionStats(departmentId = null) {
    try {
      return await this.repository.getPermissionStats(departmentId);
    } catch (error) {
      console.error("Error en servicio obteniendo estadísticas:", error);
      throw error;
    }
  }

  /**
   * Obtener reporte de accesos por departamento
   */
  async getDepartmentAccessReport(departmentId, options = {}) {
    try {
      if (!departmentId) {
        throw new Error("ID de departamento es requerido");
      }

      const accesses = await this.repository.findUsersWithDepartmentAccess(
        departmentId,
        null,
        options
      );

      // Procesar datos para el reporte
      const report = {
        department: departmentId,
        totalUsers: accesses.totalDocs,
        accessLevels: {},
        activeUsers: 0,
        inactiveUsers: 0,
      };

      // Contar por nivel de acceso
      for (const access of accesses.docs) {
        const level = access.accessLevel;
        if (!report.accessLevels[level]) {
          report.accessLevels[level] = 0;
        }
        report.accessLevels[level]++;

        if (access.isActive && access.status === "ACTIVE") {
          report.activeUsers++;
        } else {
          report.inactiveUsers++;
        }
      }

      return report;
    } catch (error) {
      console.error("Error en servicio generando reporte:", error);
      throw error;
    }
  }

  /**
   * Obtener usuarios con acceso a departamento
   */
  async findUsersWithDepartmentAccess(
    departmentId,
    accessLevel = null,
    options = {}
  ) {
    try {
      if (!departmentId) {
        throw new Error("ID de departamento es requerido");
      }

      return await this.repository.findUsersWithDepartmentAccess(
        departmentId,
        accessLevel,
        options
      );
    } catch (error) {
      console.error("Error en servicio buscando usuarios con acceso:", error);
      throw error;
    }
  }

  // ===== MÉTODOS AUXILIARES PRIVADOS =====

  /**
   * Procesar y validar filtros de búsqueda
   */
  processSearchFilters(filters) {
    const processed = { ...filters };

    // Convertir strings a ObjectId cuando sea necesario
    if (processed.user && typeof processed.user === "string") {
      processed.user = processed.user;
    }

    if (processed.department && typeof processed.department === "string") {
      processed.department = processed.department;
    }

    // Validar status
    if (
      processed.status &&
      !["ACTIVE", "SUSPENDED", "EXPIRED", "REVOKED", "PENDING"].includes(
        processed.status
      )
    ) {
      throw new Error("Status no válido");
    }

    // Validar accessLevel
    if (
      processed.accessLevel &&
      !Object.values(ACCESS_LEVELS).includes(processed.accessLevel)
    ) {
      throw new Error("Nivel de acceso no válido");
    }

    return processed;
  }

  /**
   * Validar datos de plantilla
   */
  validateTemplateData(data) {
    if (!data.name || data.name.trim().length < 3) {
      throw new Error("Nombre de plantilla debe tener al menos 3 caracteres");
    }

    if (
      !data.defaultAccessLevel ||
      !Object.values(ACCESS_LEVELS).includes(data.defaultAccessLevel)
    ) {
      throw new Error("Nivel de acceso por defecto no válido");
    }

    if (!data.permissionTemplate) {
      throw new Error("Template de permisos es requerido");
    }

    // Validar estructura básica del template de permisos
    const requiredSections = [
      "contracts",
      "documents",
      "interactions",
      "special",
    ];
    for (const section of requiredSections) {
      if (!data.permissionTemplate[section]) {
        throw new Error(
          `Sección ${section} es requerida en el template de permisos`
        );
      }
    }
  }

  /**
   * Validar datos de acceso de usuario
   */
  validateUserAccessData(data) {
    if (!data.user) {
      throw new Error("Usuario es requerido");
    }

    if (!data.department) {
      throw new Error("Departamento es requerido");
    }

    if (
      !data.accessLevel ||
      !Object.values(ACCESS_LEVELS).includes(data.accessLevel)
    ) {
      throw new Error("Nivel de acceso no válido");
    }

    // Validar fechas de vigencia
    if (data.validity && data.validity.endDate) {
      const startDate = data.validity.startDate
        ? new Date(data.validity.startDate)
        : new Date();
      const endDate = new Date(data.validity.endDate);

      if (endDate <= startDate) {
        throw new Error("Fecha de fin debe ser posterior a fecha de inicio");
      }
    }
  }
}

export default new ModulePermissionService();
