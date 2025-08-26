// =============================================================================
// src/module/exp-digital/controllers/module-permission.controller.js
// Controlador para gestión de permisos multi-departamentales
// =============================================================================

import ModulePermissionService from "../services/module-permission.service.js";
import {
  ACCESS_LEVELS,
  SYSTEM_ACTIONS,
} from "../models/module-permission.scheme.js";

export class ModulePermissionController {
  constructor() {
    this.service = ModulePermissionService;
  }

  // ===== CONTROLADORES PARA USER DEPARTMENT ACCESS =====

  /**
   * Crear acceso de usuario a departamento
   */
  createUserDepartmentAccess = async (req, res) => {
    try {
      const { body, user } = req;

      // Validar datos requeridos
      if (!body.user || !body.department || !body.accessLevel) {
        return res.status(400).json({
          message: "Usuario, departamento y nivel de acceso son requeridos",
        });
      }

      const userData = {
        userId: user.sub,
        userName: user.name,
        userEmail: user.email,
      };

      const access = await this.service.createUserDepartmentAccess(
        body,
        userData
      );

      res.status(201).json({
        success: true,
        data: access,
        message: "Acceso de usuario creado exitosamente",
      });
    } catch (error) {
      console.error("Error en controlador creando acceso:", error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || "Error interno del servidor",
      });
    }
  };

  /**
   * Obtener accesos de usuario
   */
  getUserAccesses = async (req, res) => {
    try {
      const { userId } = req.params;
      const { status, includeInactive, page, limit } = req.query;

      if (!userId) {
        return res.status(400).json({ message: "ID de usuario es requerido" });
      }

      const options = {
        status,
        includeInactive: includeInactive === "true",
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 10,
      };

      const accesses = await this.service.getUserAccesses(userId, options);

      res.status(200).json({
        success: true,
        data: accesses,
        message: "Accesos de usuario obtenidos exitosamente",
      });
    } catch (error) {
      console.error("Error en controlador obteniendo accesos:", error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || "Error interno del servidor",
      });
    }
  };

  /**
   * Obtener dashboard de permisos de usuario
   */
  getUserDashboard = async (req, res) => {
    try {
      const { userId } = req.params;

      if (!userId) {
        return res.status(400).json({ message: "ID de usuario es requerido" });
      }

      const dashboard = await this.service.getUserDashboard(userId);

      res.status(200).json({
        success: true,
        data: dashboard,
        message: "Dashboard de permisos obtenido exitosamente",
      });
    } catch (error) {
      console.error("Error en controlador obteniendo dashboard:", error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || "Error interno del servidor",
      });
    }
  };

  /**
   * Verificar permisos de usuario
   */
  checkUserPermission = async (req, res) => {
    try {
      const { userId, departmentId } = req.params;
      const { category, permission, contractId } = req.query;

      if (!userId || !departmentId || !category || !permission) {
        return res
          .status(400)
          .json({ message: "Parámetros requeridos faltantes" });
      }

      const result = await this.service.checkUserPermission(
        userId,
        departmentId,
        category,
        permission,
        contractId
      );

      res.status(200).json({
        success: true,
        data: result,
        message: "Verificación de permisos completada",
      });
    } catch (error) {
      console.error("Error en controlador verificando permisos:", error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || "Error interno del servidor",
      });
    }
  };

  /**
   * Buscar accesos con filtros
   */
  searchAccesses = async (req, res) => {
    try {
      const filters = req.query;
      const { page, limit, sort } = req.query;

      const options = {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 10,
        sort: sort || "-createdAt",
      };

      const result = await this.service.searchAccesses(filters, options);

      res.status(200).json({
        success: true,
        data: result,
        message: "Búsqueda de accesos completada exitosamente",
      });
    } catch (error) {
      console.error("Error en controlador buscando accesos:", error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || "Error interno del servidor",
      });
    }
  };

  /**
   * Actualizar acceso de usuario
   */
  updateUserAccess = async (req, res) => {
    try {
      const { id } = req.params;
      const { body, user } = req;

      if (!id) {
        return res.status(400).json({ message: "ID de acceso es requerido" });
      }

      const userData = {
        userId: user.sub,
        userName: user.name,
        userEmail: user.email,
      };

      const updatedAccess = await this.service.updateUserAccess(
        id,
        body,
        userData
      );

      res.status(200).json({
        success: true,
        data: updatedAccess,
        message: "Acceso de usuario actualizado exitosamente",
      });
    } catch (error) {
      console.error("Error en controlador actualizando acceso:", error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || "Error interno del servidor",
      });
    }
  };

  /**
   * Desactivar acceso de usuario
   */
  deactivateUserAccess = async (req, res) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const { user } = req;

      if (!id) {
        return res.status(400).json({ message: "ID de acceso es requerido" });
      }

      const userData = {
        userId: user.sub,
        userName: user.name,
        userEmail: user.email,
      };

      const result = await this.service.deactivateUserAccess(
        id,
        userData,
        reason
      );

      res.status(200).json({
        success: true,
        data: result,
        message: "Acceso de usuario desactivado exitosamente",
      });
    } catch (error) {
      console.error("Error en controlador desactivando acceso:", error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || "Error interno del servidor",
      });
    }
  };

  /**
   * Reactivar acceso de usuario
   */
  reactivateUserAccess = async (req, res) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const { user } = req;

      if (!id) {
        return res.status(400).json({ message: "ID de acceso es requerido" });
      }

      const userData = {
        userId: user.sub,
        userName: user.name,
        userEmail: user.email,
      };

      const result = await this.service.reactivateUserAccess(
        id,
        userData,
        reason
      );

      res.status(200).json({
        success: true,
        data: result,
        message: "Acceso de usuario reactivado exitosamente",
      });
    } catch (error) {
      console.error("Error en controlador reactivando acceso:", error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || "Error interno del servidor",
      });
    }
  };

  /**
   * Transferir ownership de departamento
   */
  transferDepartmentOwnership = async (req, res) => {
    try {
      const { departmentId } = req.params;
      const { fromUserId, toUserId } = req.body;
      const { user } = req;

      if (!departmentId || !fromUserId || !toUserId) {
        return res.status(400).json({
          message:
            "Departamento, usuario origen y usuario destino son requeridos",
        });
      }

      const userData = {
        userId: user.sub,
        userName: user.name,
        userEmail: user.email,
      };

      const results = await this.service.transferDepartmentOwnership(
        departmentId,
        fromUserId,
        toUserId,
        userData
      );

      res.status(200).json({
        success: true,
        data: results,
        message: "Transferencia de ownership completada exitosamente",
      });
    } catch (error) {
      console.error("Error en controlador transfiriendo ownership:", error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || "Error interno del servidor",
      });
    }
  };

  // ===== CONTROLADORES PARA PERMISSION TEMPLATES =====

  /**
   * Crear plantilla de permisos
   */
  createPermissionTemplate = async (req, res) => {
    try {
      const { body, user } = req;

      if (!body.name || !body.defaultAccessLevel) {
        return res.status(400).json({
          message: "Nombre y nivel de acceso por defecto son requeridos",
        });
      }

      const userData = {
        userId: user.sub,
        userName: user.name,
        userEmail: user.email,
      };

      const template = await this.service.createPermissionTemplate(
        body,
        userData
      );

      res.status(201).json({
        success: true,
        data: template,
        message: "Plantilla de permisos creada exitosamente",
      });
    } catch (error) {
      console.error("Error en controlador creando plantilla:", error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || "Error interno del servidor",
      });
    }
  };

  /**
   * Buscar plantillas de permisos
   */
  findTemplates = async (req, res) => {
    try {
      const { page, limit, sort, search } = req.query;

      const query = {};
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
        ];
      }

      const options = {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 10,
        sort: sort || "-createdAt",
      };

      const templates = await this.service.findTemplates(query, options);

      res.status(200).json({
        success: true,
        data: templates,
        message: "Plantillas de permisos obtenidas exitosamente",
      });
    } catch (error) {
      console.error("Error en controlador buscando plantillas:", error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || "Error interno del servidor",
      });
    }
  };

  /**
   * Obtener plantillas aplicables
   */
  getApplicableTemplates = async (req, res) => {
    try {
      const { roleId, departmentId } = req.query;
      const { page, limit } = req.query;

      const options = {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 10,
      };

      const templates = await this.service.getApplicableTemplates(
        roleId,
        departmentId,
        options
      );

      res.status(200).json({
        success: true,
        data: templates,
        message: "Plantillas aplicables obtenidas exitosamente",
      });
    } catch (error) {
      console.error(
        "Error en controlador obteniendo plantillas aplicables:",
        error
      );
      res.status(error.status || 500).json({
        success: false,
        message: error.message || "Error interno del servidor",
      });
    }
  };

  /**
   * Aplicar plantilla a múltiples usuarios
   */
  applyTemplateToUsers = async (req, res) => {
    try {
      const { templateId } = req.params;
      const { userIds, departmentId } = req.body;
      const { user } = req;

      if (!templateId || !userIds || !departmentId) {
        return res.status(400).json({
          message: "Template, usuarios y departamento son requeridos",
        });
      }

      if (!Array.isArray(userIds) || userIds.length === 0) {
        return res
          .status(400)
          .json({ message: "Lista de usuarios debe ser un array no vacío" });
      }

      const userData = {
        userId: user.sub,
        userName: user.name,
        userEmail: user.email,
      };

      const results = await this.service.applyTemplateToUsers(
        templateId,
        userIds,
        departmentId,
        userData
      );

      res.status(200).json({
        success: true,
        data: results,
        message: "Plantilla aplicada a usuarios exitosamente",
      });
    } catch (error) {
      console.error("Error en controlador aplicando plantilla:", error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || "Error interno del servidor",
      });
    }
  };

  // ===== CONTROLADORES PARA PERMISSION HISTORY =====

  /**
   * Obtener historial de permisos
   */
  getPermissionHistory = async (req, res) => {
    try {
      const { accessId } = req.params;
      const { page, limit } = req.query;

      if (!accessId) {
        return res.status(400).json({ message: "ID de acceso es requerido" });
      }

      const options = {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 20,
      };

      const history = await this.service.getPermissionHistory(
        accessId,
        options
      );

      res.status(200).json({
        success: true,
        data: history,
        message: "Historial de permisos obtenido exitosamente",
      });
    } catch (error) {
      console.error("Error en controlador obteniendo historial:", error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || "Error interno del servidor",
      });
    }
  };

  /**
   * Obtener historial completo de usuario
   */
  getUserPermissionHistory = async (req, res) => {
    try {
      const { userId } = req.params;
      const { page, limit } = req.query;

      if (!userId) {
        return res.status(400).json({ message: "ID de usuario es requerido" });
      }

      const options = {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 10,
      };

      const history = await this.service.getUserPermissionHistory(
        userId,
        options
      );

      res.status(200).json({
        success: true,
        data: history,
        message: "Historial completo de permisos obtenido exitosamente",
      });
    } catch (error) {
      console.error(
        "Error en controlador obteniendo historial de usuario:",
        error
      );
      res.status(error.status || 500).json({
        success: false,
        message: error.message || "Error interno del servidor",
      });
    }
  };

  // ===== CONTROLADORES DE VERIFICACIÓN DE PERMISOS =====

  /**
   * Verificar si usuario puede realizar acción del sistema
   */
  canPerformSystemAction = async (req, res) => {
    try {
      const { userId, departmentId } = req.params;
      const { systemAction, contractId } = req.query;

      if (!userId || !departmentId || !systemAction) {
        return res.status(400).json({
          message: "Usuario, departamento y acción del sistema son requeridos",
        });
      }

      const result = await this.service.canPerformSystemAction(
        userId,
        departmentId,
        systemAction,
        contractId
      );

      res.status(200).json({
        success: true,
        data: result,
        message: "Verificación de acción del sistema completada",
      });
    } catch (error) {
      console.error(
        "Error en controlador verificando acción del sistema:",
        error
      );
      res.status(error.status || 500).json({
        success: false,
        message: error.message || "Error interno del servidor",
      });
    }
  };

  /**
   * Verificar múltiples permisos en lote
   */
  batchCheckPermissions = async (req, res) => {
    try {
      const { checks } = req.body;

      if (!Array.isArray(checks) || checks.length === 0) {
        return res
          .status(400)
          .json({ message: "Array de verificaciones es requerido" });
      }

      // Validar estructura de cada verificación
      for (const check of checks) {
        if (
          !check.userId ||
          !check.departmentId ||
          !check.category ||
          !check.permission
        ) {
          return res.status(400).json({
            message:
              "Cada verificación debe incluir userId, departmentId, category y permission",
          });
        }
      }

      const results = await this.service.batchCheckPermissions(checks);

      res.status(200).json({
        success: true,
        data: results,
        message: "Verificación de permisos en lote completada",
      });
    } catch (error) {
      console.error(
        "Error en controlador verificando permisos en lote:",
        error
      );
      res.status(error.status || 500).json({
        success: false,
        message: error.message || "Error interno del servidor",
      });
    }
  };

  // ===== CONTROLADORES DE ESTADÍSTICAS Y REPORTES =====

  /**
   * Obtener estadísticas de permisos
   */
  getPermissionStats = async (req, res) => {
    try {
      const { departmentId } = req.query;

      const stats = await this.service.getPermissionStats(departmentId);

      res.status(200).json({
        success: true,
        data: stats,
        message: "Estadísticas de permisos obtenidas exitosamente",
      });
    } catch (error) {
      console.error("Error en controlador obteniendo estadísticas:", error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || "Error interno del servidor",
      });
    }
  };

  /**
   * Obtener reporte de accesos por departamento
   */
  getDepartmentAccessReport = async (req, res) => {
    try {
      const { departmentId } = req.params;
      const { page, limit } = req.query;

      if (!departmentId) {
        return res
          .status(400)
          .json({ message: "ID de departamento es requerido" });
      }

      const options = {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 10,
      };

      const report = await this.service.getDepartmentAccessReport(
        departmentId,
        options
      );

      res.status(200).json({
        success: true,
        data: report,
        message: "Reporte de accesos por departamento obtenido exitosamente",
      });
    } catch (error) {
      console.error("Error en controlador generando reporte:", error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || "Error interno del servidor",
      });
    }
  };

  /**
   * Obtener usuarios con acceso a departamento
   */
  findUsersWithDepartmentAccess = async (req, res) => {
    try {
      const { departmentId } = req.params;
      const { accessLevel, page, limit } = req.query;

      if (!departmentId) {
        return res
          .status(400)
          .json({ message: "ID de departamento es requerido" });
      }

      const options = {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 10,
      };

      const result = await this.service.findUsersWithDepartmentAccess(
        departmentId,
        accessLevel,
        options
      );

      res.status(200).json({
        success: true,
        data: result,
        message: "Usuarios con acceso al departamento obtenidos exitosamente",
      });
    } catch (error) {
      console.error(
        "Error en controlador buscando usuarios con acceso:",
        error
      );
      res.status(error.status || 500).json({
        success: false,
        message: error.message || "Error interno del servidor",
      });
    }
  };

  // ===== CONTROLADORES AUXILIARES =====

  /**
   * Obtener niveles de acceso disponibles
   */
  getAccessLevels = async (req, res) => {
    try {
      const accessLevels = Object.values(ACCESS_LEVELS).map((level) => ({
        value: level,
        label: this.getAccessLevelDisplayName(level),
      }));

      res.status(200).json({
        success: true,
        data: accessLevels,
        message: "Niveles de acceso obtenidos exitosamente",
      });
    } catch (error) {
      console.error(
        "Error en controlador obteniendo niveles de acceso:",
        error
      );
      res.status(error.status || 500).json({
        success: false,
        message: error.message || "Error interno del servidor",
      });
    }
  };

  /**
   * Obtener acciones del sistema disponibles
   */
  getSystemActions = async (req, res) => {
    try {
      const systemActions = Object.values(SYSTEM_ACTIONS).map((action) => ({
        value: action,
        label: this.getSystemActionDisplayName(action),
      }));

      res.status(200).json({
        success: true,
        data: systemActions,
        message: "Acciones del sistema obtenidas exitosamente",
      });
    } catch (error) {
      console.error(
        "Error en controlador obteniendo acciones del sistema:",
        error
      );
      res.status(error.status || 500).json({
        success: false,
        message: error.message || "Error interno del servidor",
      });
    }
  };

  // ===== MÉTODOS AUXILIARES PRIVADOS =====

  /**
   * Obtener nombre display para nivel de acceso
   */
  getAccessLevelDisplayName(level) {
    const displayNames = {
      OWNER: "Gestor Completo",
      CONTRIBUTOR: "Colaborador",
      OBSERVER: "Observador",
      REPOSITORY: "Repositorio General",
    };
    return displayNames[level] || level;
  }

  /**
   * Obtener nombre display para acción del sistema
   */
  getSystemActionDisplayName(action) {
    const displayNames = {
      create_contract: "Crear Contrato",
      view_contract: "Ver Contrato",
      edit_contract: "Editar Contrato",
      delete_contract: "Eliminar Contrato",
      upload_document: "Subir Documento",
      download_document: "Descargar Documento",
      delete_document: "Eliminar Documento",
      view_document: "Ver Documento",
      add_observation: "Agregar Observación",
      edit_observation: "Editar Observación",
      delete_observation: "Eliminar Observación",
      view_financial_data: "Ver Datos Financieros",
      view_all_departments: "Ver Todos los Departamentos",
      export_data: "Exportar Datos",
    };
    return displayNames[action] || action;
  }
}

export default new ModulePermissionController();
