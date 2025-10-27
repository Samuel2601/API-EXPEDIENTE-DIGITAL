// =============================================================================
// src/module/exp-digital/repositories/module-permission.repository.js
// Repositorio extendido para gestión de permisos multi-departamentales
// =============================================================================

import { BaseRepository } from "../../core/base/repositories/base.repository.js";
import {
  UserDepartmentAccess,
  PermissionTemplate,
  PermissionHistory,
} from "../models/module-permission.scheme.js";
import {
  ACCESS_LEVELS,
  SYSTEM_ACTIONS,
} from "../models/module-permission.scheme.js";

export class ModulePermissionRepository extends BaseRepository {
  constructor() {
    super(UserDepartmentAccess);
    this.permissionTemplateModel = PermissionTemplate;
    this.permissionHistoryModel = PermissionHistory;
  }

  // ===== MÉTODOS PARA USER DEPARTMENT ACCESS =====

  /**
   * Crear acceso de usuario a departamento con configuración automática de permisos
   */
  async createUserDepartmentAccess(data, userData, options = {}) {
    try {
      // Configurar permisos automáticamente según el nivel de acceso
      if (data.accessLevel && !data.permissions) {
        const permissions = this.getDefaultPermissionsByLevel(data.accessLevel);
        data.permissions = permissions;
      }

      // Si es acceso REPOSITORY, activar acceso global
      if (data.accessLevel === ACCESS_LEVELS.REPOSITORY) {
        data.crossDepartmentAccess = data.crossDepartmentAccess || {};
        data.crossDepartmentAccess.hasGlobalAccess = true;
      }

      if (
        data.assignment?.assignedBy == null ||
        data.assignment?.assignedBy === "" ||
        !data.assignment?.assignedBy
      ) {
        data.assignment = {
          assignedBy: userData.userId,
        };
      }

      const newAccess = await this.create(data, userData, options);

      return await this.findById(newAccess._id, {
        populate: [
          { path: "user", select: "name last_name email telf id" },
          { path: "department", select: "code name shortName tags id" },
        ],
      });
    } catch (error) {
      console.error("Error creando acceso de usuario:", error);
      throw new Error(`Error creando acceso de usuario: ${error.message}`);
    }
  }

  /**
   * Obtener accesos de un usuario específico
   */
  async getUserAccesses(userId, options = {}) {
    try {
      const query = { user: userId };
      const { status = "ACTIVE", includeInactive = false } = options;

      if (status) {
        query.status = status;
      }

      if (!includeInactive) {
        query.isActive = true;
      }

      return await this.findAll(query, {
        ...options,
        populate: "department",
        sort: "-assignment.isPrimary -createdAt",
      });
    } catch (error) {
      console.error("Error obteniendo accesos de usuario:", error);
      throw new Error(`Error obteniendo accesos de usuario: ${error.message}`);
    }
  }

  /**
   * Obtener dashboard completo de permisos de usuario
   */
  async getUserDashboard(userId) {
    try {
      return await UserDepartmentAccess.getUserDashboard(userId);
    } catch (error) {
      console.error("Error obteniendo dashboard de usuario:", error);
      throw new Error(
        `Error obteniendo dashboard de usuario: ${error.message}`
      );
    }
  }

  /**
   * Verificar permisos de usuario para una acción específica
   */
  async checkUserPermission(
    userId,
    departmentId,
    category,
    permission,
    contractId = null
  ) {
    try {
      return await UserDepartmentAccess.checkUserPermission(
        userId,
        departmentId,
        category,
        permission,
        contractId
      );
    } catch (error) {
      console.error("Error verificando permisos:", error);
      throw new Error(`Error verificando permisos: ${error.message}`);
    }
  }

  /**
   * Buscar accesos con filtros avanzados
   */
  async searchAccesses(filters = {}, options = {}) {
    const {
      user,
      department,
      accessLevel,
      status = "ACTIVE",
      isActive = true,
      hasGlobalAccess,
      ...otherFilters
    } = filters;

    const query = { ...otherFilters, status, isActive };

    if (user) query.user = user;
    if (department) query.department = department;
    if (accessLevel) query.accessLevel = accessLevel;
    if (hasGlobalAccess !== undefined) {
      query["crossDepartmentAccess.hasGlobalAccess"] = hasGlobalAccess;
    }

    return await this.searchWithAggregation({
      filters: query,
      options: {
        ...options,
        populate: "user department",
        lookups: [
          {
            from: "users",
            localField: "user",
            foreignField: "_id",
            as: "userInfo",
            unwind: true,
          },
          {
            from: "departments",
            localField: "department",
            foreignField: "_id",
            as: "departmentInfo",
            unwind: true,
          },
        ],
      },
    });
  }

  /**
   * Actualizar acceso de usuario con validación de permisos
   */
  async updateUserAccess(id, updateData, userData, options = {}) {
    try {
      // Obtener el acceso actual para comparar
      const currentAccess = await this.findById(id);

      if (!currentAccess) {
        throw new Error("Acceso no encontrado");
      }

      // Solo reconfigurar permisos si el accessLevel cambió
      if (
        updateData.accessLevel &&
        updateData.accessLevel !== currentAccess.accessLevel
      ) {
        // El nivel de acceso cambió, aplicar permisos por defecto del nuevo nivel
        updateData.permissions = this.getDefaultPermissionsByLevel(
          updateData.accessLevel
        );

        // Actualizar acceso global si el nuevo nivel es REPOSITORY
        if (updateData.accessLevel === ACCESS_LEVELS.REPOSITORY) {
          updateData.crossDepartmentAccess =
            updateData.crossDepartmentAccess || {};
          updateData.crossDepartmentAccess.hasGlobalAccess = true;
        }

        console.log(
          `Nivel de acceso cambió de ${currentAccess.accessLevel} a ${updateData.accessLevel}, aplicando permisos por defecto`
        );
      } else if (
        updateData.accessLevel === currentAccess.accessLevel &&
        updateData.permissions
      ) {
        // El nivel es el mismo y se enviaron permisos personalizados
        console.log(
          "Actualizando permisos personalizados sin cambiar el nivel de acceso"
        );
      }
      // Si no se envía accessLevel, simplemente actualizar lo que venga en updateData

      return await this.update(id, updateData, userData, options);
    } catch (error) {
      console.error("Error actualizando acceso:", error);
      throw new Error(`Error actualizando acceso: ${error.message}`);
    }
  }

  /**
   * Desactivar acceso de usuario (soft delete mejorado)
   */
  async deactivateUserAccess(id, userData, reason = "") {
    try {
      const updateData = {
        status: "REVOKED",
        isActive: false,
        observations: reason
          ? `Acceso revocado: ${reason}`
          : "Acceso revocado sin especificar razón",
      };

      return await this.update(id, updateData, userData);
    } catch (error) {
      console.error("Error desactivando acceso:", error);
      throw new Error(`Error desactivando acceso: ${error.message}`);
    }
  }

  /**
   * Reactivar acceso de usuario previamente desactivado
   */
  async reactivateUserAccess(id, userData, reason = "") {
    try {
      const updateData = {
        status: "ACTIVE",
        isActive: true,
        observations: reason
          ? `Acceso reactivado: ${reason}`
          : "Acceso reactivado",
      };

      return await this.update(id, updateData, userData);
    } catch (error) {
      console.error("Error reactivando acceso:", error);
      throw new Error(`Error reactivando acceso: ${error.message}`);
    }
  }

  // ===== MÉTODOS PARA PERMISSION TEMPLATES =====

  /**
   * Crear plantilla de permisos
   */
  async createPermissionTemplate(data, userData, options = {}) {
    try {
      const template = new this.permissionTemplateModel({
        ...data,
        createdBy: userData.userId,
      });

      return await template.save(options);
    } catch (error) {
      console.error("Error creando plantilla:", error);
      throw new Error(`Error creando plantilla: ${error.message}`);
    }
  }

  /**
   * Buscar plantillas de permisos
   */
  async findTemplates(query = {}, options = {}) {
    try {
      const {
        page = 1,
        limit = 10,
        sort = "-createdAt",
        populate = "applicableRoles applicableDepartments",
        ...otherOptions
      } = options;

      return await this.permissionTemplateModel.paginate(query, {
        page,
        limit,
        sort,
        populate,
        lean: true,
        ...otherOptions,
      });
    } catch (error) {
      console.error("Error buscando plantillas:", error);
      throw new Error(`Error buscando plantillas: ${error.message}`);
    }
  }

  /**
   * Obtener plantillas aplicables para un rol/departamento
   */
  async getApplicableTemplates(
    roleId = null,
    departmentId = null,
    options = {}
  ) {
    try {
      const query = { isActive: true };

      if (roleId) {
        query.applicableRoles = { $in: [roleId] };
      }

      if (departmentId) {
        query.applicableDepartments = { $in: [departmentId] };
      }

      return await this.findTemplates(query, options);
    } catch (error) {
      console.error("Error obteniendo plantillas aplicables:", error);
      throw new Error(
        `Error obteniendo plantillas aplicables: ${error.message}`
      );
    }
  }

  // ===== MÉTODOS PARA PERMISSION HISTORY =====

  /**
   * Obtener historial de cambios de permisos
   */
  async getPermissionHistory(userDepartmentAccessId, options = {}) {
    try {
      const {
        page = 1,
        limit = 20,
        sort = "-changeDate",
        populate = "changedBy",
        ...otherOptions
      } = options;

      const query = { userDepartmentAccess: userDepartmentAccessId };

      return await this.permissionHistoryModel.paginate(query, {
        page,
        limit,
        sort,
        populate,
        lean: true,
        ...otherOptions,
      });
    } catch (error) {
      console.error("Error obteniendo historial:", error);
      throw new Error(`Error obteniendo historial: ${error.message}`);
    }
  }

  /**
   * Registrar cambio en el historial de permisos
   */
  async logPermissionChange(changeData, options = {}) {
    try {
      const historyRecord = new this.permissionHistoryModel(changeData);
      return await historyRecord.save(options);
    } catch (error) {
      console.error("Error registrando cambio:", error);
      throw new Error(`Error registrando cambio: ${error.message}`);
    }
  }

  // ===== MÉTODOS AUXILIARES =====

  /**
   * Obtener permisos por defecto según nivel de acceso
   */
  getDefaultPermissionsByLevel(accessLevel) {
    switch (accessLevel) {
      case ACCESS_LEVELS.OWNER:
        return {
          contracts: {
            canCreate: true,
            canViewOwn: true,
            canViewDepartment: true,
            canViewAll: false,
            canEdit: true,
            canDelete: true,
          },
          documents: {
            canUpload: true,
            canDownload: true,
            canView: true,
            canDelete: true,
            canManageAll: true,
          },
          interactions: {
            canAddObservations: true,
            canEditOwnObservations: true,
            canDeleteOwnObservations: true,
            canViewAllObservations: true,
          },
          special: {
            canViewFinancialData: true,
            canExportData: true,
            canViewCrossDepartment: false,
            canManagePermissions: false,
          },
        };

      case ACCESS_LEVELS.REPOSITORY:
        return {
          contracts: {
            canCreate: false,
            canViewOwn: true,
            canViewDepartment: true,
            canViewAll: true,
            canEdit: false,
            canDelete: false,
          },
          documents: {
            canUpload: false,
            canDownload: true,
            canView: true,
            canDelete: false,
            canManageAll: false,
          },
          interactions: {
            canAddObservations: true,
            canEditOwnObservations: true,
            canDeleteOwnObservations: false,
            canViewAllObservations: true,
          },
          special: {
            canViewFinancialData: true,
            canExportData: true,
            canViewCrossDepartment: true,
            canManagePermissions: false,
          },
        };

      case ACCESS_LEVELS.CONTRIBUTOR:
        return {
          contracts: {
            canCreate: false,
            canViewOwn: true,
            canViewDepartment: true,
            canViewAll: false,
            canEdit: false,
            canDelete: false,
          },
          documents: {
            canUpload: true,
            canDownload: true,
            canView: true,
            canDelete: false,
            canManageAll: false,
          },
          interactions: {
            canAddObservations: true,
            canEditOwnObservations: true,
            canDeleteOwnObservations: false,
            canViewAllObservations: true,
          },
          special: {
            canViewFinancialData: false,
            canExportData: false,
            canViewCrossDepartment: false,
            canManagePermissions: false,
          },
        };

      case ACCESS_LEVELS.OBSERVER:
        return {
          contracts: {
            canCreate: false,
            canViewOwn: true,
            canViewDepartment: true,
            canViewAll: false,
            canEdit: false,
            canDelete: false,
          },
          documents: {
            canUpload: false,
            canDownload: true,
            canView: true,
            canDelete: false,
            canManageAll: false,
          },
          interactions: {
            canAddObservations: true,
            canEditOwnObservations: true,
            canDeleteOwnObservations: false,
            canViewAllObservations: true,
          },
          special: {
            canViewFinancialData: false,
            canExportData: false,
            canViewCrossDepartment: false,
            canManagePermissions: false,
          },
        };

      default:
        return {
          contracts: {
            canCreate: false,
            canViewOwn: true,
            canViewDepartment: true,
            canViewAll: false,
            canEdit: false,
            canDelete: false,
          },
          documents: {
            canUpload: false,
            canDownload: true,
            canView: true,
            canDelete: false,
            canManageAll: false,
          },
          interactions: {
            canAddObservations: false,
            canEditOwnObservations: false,
            canDeleteOwnObservations: false,
            canViewAllObservations: true,
          },
          special: {
            canViewFinancialData: false,
            canExportData: false,
            canViewCrossDepartment: false,
            canManagePermissions: false,
          },
        };
    }
  }

  /**
   * Verificar si un usuario puede realizar una acción del sistema
   */
  async canPerformSystemAction(
    userId,
    departmentId,
    systemAction,
    contractId = null
  ) {
    try {
      // Mapear acción del sistema a categoría y permiso específico
      const actionMapping = this.mapSystemActionToPermission(systemAction);
      if (!actionMapping) {
        return { allowed: false, reason: "Acción del sistema no reconocida" };
      }

      return await this.checkUserPermission(
        userId,
        departmentId,
        actionMapping.category,
        actionMapping.permission,
        contractId
      );
    } catch (error) {
      console.error("Error verificando acción del sistema:", error);
      throw new Error(`Error verificando acción del sistema: ${error.message}`);
    }
  }

  /**
   * Mapear acción del sistema a categoría y permiso específico
   */
  mapSystemActionToPermission(systemAction) {
    const mapping = {
      [SYSTEM_ACTIONS.CREATE_CONTRACT]: {
        category: "contracts",
        permission: "canCreate",
      },
      [SYSTEM_ACTIONS.VIEW_CONTRACT]: {
        category: "contracts",
        permission: "canViewDepartment",
      },
      [SYSTEM_ACTIONS.EDIT_CONTRACT]: {
        category: "contracts",
        permission: "canEdit",
      },
      [SYSTEM_ACTIONS.DELETE_CONTRACT]: {
        category: "contracts",
        permission: "canDelete",
      },
      [SYSTEM_ACTIONS.UPLOAD_DOCUMENT]: {
        category: "documents",
        permission: "canUpload",
      },
      [SYSTEM_ACTIONS.DOWNLOAD_DOCUMENT]: {
        category: "documents",
        permission: "canDownload",
      },
      [SYSTEM_ACTIONS.DELETE_DOCUMENT]: {
        category: "documents",
        permission: "canDelete",
      },
      [SYSTEM_ACTIONS.VIEW_DOCUMENT]: {
        category: "documents",
        permission: "canView",
      },
      [SYSTEM_ACTIONS.ADD_OBSERVATION]: {
        category: "interactions",
        permission: "canAddObservations",
      },
      [SYSTEM_ACTIONS.EDIT_OBSERVATION]: {
        category: "interactions",
        permission: "canEditOwnObservations",
      },
      [SYSTEM_ACTIONS.DELETE_OBSERVATION]: {
        category: "interactions",
        permission: "canDeleteOwnObservations",
      },
      [SYSTEM_ACTIONS.VIEW_FINANCIAL_DATA]: {
        category: "special",
        permission: "canViewFinancialData",
      },
      [SYSTEM_ACTIONS.VIEW_ALL_DEPARTMENTS]: {
        category: "special",
        permission: "canViewCrossDepartment",
      },
      [SYSTEM_ACTIONS.EXPORT_DATA]: {
        category: "special",
        permission: "canExportData",
      },
    };

    return mapping[systemAction];
  }

  /**
   * Obtener estadísticas de permisos por departamento
   */
  async getPermissionStats(departmentId = null) {
    try {
      const matchStage = { status: "ACTIVE", isActive: true };

      if (departmentId) {
        matchStage.department = departmentId;
      }

      const pipeline = [
        { $match: matchStage },
        {
          $group: {
            _id: "$accessLevel",
            count: { $sum: 1 },
            users: { $addToSet: "$user" },
          },
        },
        {
          $project: {
            accessLevel: "$_id",
            count: 1,
            userCount: { $size: "$users" },
            _id: 0,
          },
        },
        { $sort: { count: -1 } },
      ];

      return await this.model.aggregate(pipeline);
    } catch (error) {
      console.error("Error obteniendo estadísticas:", error);
      throw new Error(`Error obteniendo estadísticas: ${error.message}`);
    }
  }

  /**
   * Buscar usuarios con acceso a un departamento específico
   */
  async findUsersWithDepartmentAccess(
    departmentId,
    accessLevel = null,
    options = {}
  ) {
    try {
      const query = {
        department: departmentId,
        status: "ACTIVE",
        isActive: true,
      };

      if (accessLevel) {
        query.accessLevel = accessLevel;
      }

      return await this.searchWithAggregation({
        filters: query,
        options: {
          ...options,
          lookups: [
            {
              from: "users",
              localField: "user",
              foreignField: "_id",
              as: "userInfo",
              unwind: true,
            },
          ],
        },
      });
    } catch (error) {
      console.error("Error buscando usuarios con acceso:", error);
      throw new Error(`Error buscando usuarios con acceso: ${error.message}`);
    }
  }
}

export default new ModulePermissionRepository();
