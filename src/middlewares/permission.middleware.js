import { Contract } from "#src/module/exp-digital/models/contract.scheme.js";
import { UserDepartmentAccess } from "#src/module/exp-digital/models/module-permission.scheme.js";
import mongoose from "mongoose";

/*
 * Verificar si un usuario tiene un permiso específico
 * @param {string} userId - ID del usuario
 * @param {string} departmentId - ID del departamento
 * @param {string} category - Categoría del permiso
 * @param {string} permission - Permiso específico
 * @returns {boolean} True si tiene el permiso
 */
export const hasPermission = async (
  userId,
  departmentId = null,
  category,
  permission
) => {
  const result = await UserDepartmentAccess.checkUserPermission(
    userId,
    departmentId,
    category,
    permission
  );
  return result.allowed;
};

/**
 * Middleware para validar permisos de usuario
 * @param {Object} options - Opciones de configuración
 * @returns {Function} Middleware de Express
 */
export const requirePermission = (options = {}) => {
  const {
    category,
    permission,
    requireContractAccess = false,
    contractParam = "contractId",
    departmentParam = "departmentId",
    errorMessage = "No tiene permisos para realizar esta acción",
  } = options;

  return async (req, res, next) => {
    try {
      // Obtener información del usuario autenticado
      const userId = req.user._id;

      // Determinar el departamento objetivo
      let departmentId =
        req.params[departmentParam] || req.body[departmentParam];

      // Si no se proporciona departmentId, intentar obtenerlo del contrato
      if (!departmentId && requireContractAccess) {
        const contractId = req.params[contractParam] || req.body[contractParam];
        if (contractId) {
          const contract = await Contract.findById(contractId).select(
            "requestingDepartment"
          );
          if (contract) {
            departmentId = contract.requestingDepartment;
          }
        }
      }

      if (!departmentId) {
        return res.status(400).json({
          success: false,
          message: "Se requiere un departamento para validar permisos",
        });
      }

      // Verificar permisos
      const permissionCheck = await UserDepartmentAccess.checkUserPermission(
        userId,
        departmentId,
        category,
        permission,
        requireContractAccess
          ? req.params[contractParam] || req.body[contractParam]
          : null
      );

      if (!permissionCheck.allowed) {
        return res.status(403).json({
          success: false,
          message: errorMessage,
          reason: permissionCheck.reason,
          requiredPermission: `${category}.${permission}`,
        });
      }

      // Almacenar información de permisos en la request para uso posterior
      req.permissions = {
        ...permissionCheck,
        departmentId,
        userId,
      };

      next();
    } catch (error) {
      console.error("Error en middleware de permisos:", error);
      res.status(500).json({
        success: false,
        message: "Error al validar permisos",
      });
    }
  };
};

/**
 * Middleware para verificar acceso a un contrato específico
 * @param {string} contractParam - Nombre del parámetro que contiene el ID del contrato
 * @returns {Function} Middleware de Express
 */
export const requireContractAccess = (contractParam = "contractId") => {
  return async (req, res, next) => {
    try {
      const userId = req.user._id;
      const contractId = req.params[contractParam] || req.body[contractParam];

      if (!contractId) {
        return res.status(400).json({
          success: false,
          message: "ID de contrato no proporcionado",
        });
      }

      // Buscar todos los accesos activos del usuario
      const userAccesses = await UserDepartmentAccess.getUserAccesses(userId);

      // Obtener información del contrato
      const contract = await Contract.findById(contractId).select(
        "requestingDepartment"
      );

      if (!contract) {
        return res.status(404).json({
          success: false,
          message: "Contrato no encontrado",
        });
      }

      // Verificar si el usuario tiene acceso al departamento del contrato
      const hasAccess = userAccesses.some((access) =>
        access.canAccessContract(contract)
      );

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: "No tiene acceso a este contrato",
        });
      }

      // Almacenar información del contrato para uso posterior
      req.contract = contract;
      next();
    } catch (error) {
      console.error("Error en middleware de acceso a contrato:", error);
      res.status(500).json({
        success: false,
        message: "Error al validar acceso al contrato",
      });
    }
  };
};

/**
 * Middleware para verificar múltiples permisos (al menos uno requerido)
 * @param {Array} permissions - Array de permisos requeridos [{category, permission}]
 * @returns {Function} Middleware de Express
 */
export const requireAnyPermission = (permissions = []) => {
  return async (req, res, next) => {
    try {
      const userId = req.user.userId;

      // Obtener departmentId de los parámetros o body
      const departmentId = req.params.departmentId || req.body.departmentId;

      if (!departmentId) {
        return res.status(400).json({
          success: false,
          message: "Se requiere un departamento para validar permisos",
        });
      }

      // Verificar cada permiso hasta encontrar uno válido
      for (const { category, permission } of permissions) {
        const permissionCheck = await UserDepartmentAccess.checkUserPermission(
          userId,
          departmentId,
          category,
          permission
        );

        if (permissionCheck.allowed) {
          req.permissions = permissionCheck;
          return next();
        }
      }

      // Si ninguno de los permisos es válido
      return res.status(403).json({
        success: false,
        message: "No tiene los permisos necesarios para realizar esta acción",
        requiredPermissions: permissions.map(
          (p) => `${p.category}.${p.permission}`
        ),
      });
    } catch (error) {
      console.error("Error en middleware de permisos múltiples:", error);
      res.status(500).json({
        success: false,
        message: "Error al validar permisos",
      });
    }
  };
};
