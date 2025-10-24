import { Contract } from "#src/module/exp-digital/models/contract.scheme.js";
import { File } from "#src/module/exp-digital/models/file.scheme.js";
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
  try {
    const result = await UserDepartmentAccess.checkUserPermission(
      userId,
      departmentId,
      category,
      permission
    );
    return result.allowed;
  } catch (error) {
    console.error("Error verificando permiso:", error);
    return false;
  }
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
    console.log("Configurando middleware de permisos:", options);
    try {
      // Obtener información del usuario autenticado
      const userId = req.user.userId;

      // Determinar el departamento objetivo
      let departmentId =
        req.params[departmentParam] || req.body[departmentParam];
      console.log("🔍 Verificando permisos de usuario:", userId, departmentId);
      if (category === "documents") {
        console.log(
          "🔍 Verificando permisos de usuario:",
          userId,
          req.params.id
        );
        const file = await File.findById(req.params.id).populate("contract");
        // console.log("file", file);
        if (!file) {
          return res.status(404).json({
            success: false,
            message: "Archivo no encontrado",
          });
        }

        departmentId = file.contract.requestingDepartment;
      }
      // Si no se proporciona departmentId, intentar obtenerlo del contrato
      if (!departmentId && requireContractAccess) {
        const contractId = req.params[contractParam] || req.body[contractParam];
        if (contractId) {
          const contract = await Contract.findById(contractId).select(
            "requestingDepartment"
          );
          console.log("contract", contract);
          if (contract) {
            departmentId = contract.requestingDepartment;
          }
        }
      }
      console.log("departmentId", departmentId);
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
      console.log("permissionCheck", permissionCheck);
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
        // Añadir el método hasPermission
        hasPermission: (cat, perm) => {
          if (!permissionCheck.permissions) return false;
          return (
            permissionCheck.permissions[cat] &&
            permissionCheck.permissions[cat][perm]
          );
        },
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
      const userId = req.user.sub;
      const contractId = req.params[contractParam] || req.body[contractParam];

      if (!contractId) {
        return res.status(400).json({
          success: false,
          message: "ID de contrato no proporcionado",
        });
      }

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

      // Buscar todos los accesos activos del usuario
      const userAccesses = await UserDepartmentAccess.getUserAccesses(
        userId,
        "ACTIVE",
        contract.requestingDepartment
      );

      console.log("contract", contract);
      console.log("userAccesses", userAccesses);
      // Verificar si el usuario tiene acceso al departamento del contrato
      const hasAccess = userAccesses.some((access) =>
        access.canAccessContract(contract)
      );
      console.log("Has access?", hasAccess);
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: "No tiene acceso a este contrato",
        });
      }
      req.permissions = {
        ...userAccesses[0].permissions,
        hasPermission: (cat, perm) => {
          if (!userAccesses[0].permissions) return false;
          return (
            userAccesses[0].permissions[cat] &&
            userAccesses[0].permissions[cat][perm]
          );
        },
      };
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

/**
 * Middleware para verificar permisos globales/multi-departamentales
 * Útil para endpoints como getAllContracts donde el usuario puede tener acceso a múltiples departamentos
 * @param {Array} permissions - Array de permisos requeridos [{category, permission}]
 * @returns {Function} Middleware de Express
 */
export const requireGlobalPermissions = (permissions = []) => {
  return async (req, res, next) => {
    try {
      const userId = req.user.userId;

      // Obtener todos los accesos activos del usuario
      const userAccesses = await UserDepartmentAccess.getUserAccesses(userId);

      if (!userAccesses || userAccesses.length === 0) {
        return res.status(403).json({
          success: false,
          message: "No tiene acceso a ningún departamento",
        });
      }

      let hasValidAccess = false;
      const userPermissions = {
        accesses: [],
        hasGlobalAccess: false,
        accessibleDepartments: [],
        validPermissions: [],
      };

      // Verificar permisos en cada acceso del usuario
      for (const access of userAccesses) {
        for (const { category, permission } of permissions) {
          if (access.hasPermission(category, permission)) {
            hasValidAccess = true;

            userPermissions.accesses.push({
              departmentId: access.department._id,
              departmentName: access.department.name,
              accessLevel: access.accessLevel,
              permission: `${category}.${permission}`,
            });

            userPermissions.accessibleDepartments.push(access.department._id);
            userPermissions.validPermissions.push(`${category}.${permission}`);

            // Verificar si tiene acceso global
            if (
              permission === "canViewAll" &&
              access.hasPermission(category, permission)
            ) {
              userPermissions.hasGlobalAccess = true;
            }
          }
        }
      }

      if (!hasValidAccess) {
        return res.status(403).json({
          success: false,
          message: "No tiene los permisos necesarios para realizar esta acción",
          requiredPermissions: permissions.map(
            (p) => `${p.category}.${p.permission}`
          ),
        });
      }

      // Remover duplicados
      userPermissions.accessibleDepartments = [
        ...new Set(userPermissions.accessibleDepartments),
      ];
      userPermissions.validPermissions = [
        ...new Set(userPermissions.validPermissions),
      ];

      // Almacenar información de permisos para uso en el controlador
      req.globalPermissions = userPermissions;

      next();
    } catch (error) {
      console.error("Error en middleware de permisos globales:", error);
      res.status(500).json({
        success: false,
        message: "Error al validar permisos globales",
      });
    }
  };
};

/**
 * Middleware híbrido que funciona con o sin departmentId específico
 * @param {Array} permissions - Array de permisos requeridos [{category, permission}]
 * @param {Object} options - Opciones del middleware
 * @returns {Function} Middleware de Express
 */
export const requireFlexiblePermissions = (permissions = [], options = {}) => {
  const { allowGlobal = true, requireDepartment = false } = options;

  return async (req, res, next) => {
    try {
      const userId = req.user.userId;
      const departmentId = req.params.departmentId || req.body.departmentId;

      console.log(`🔐 Verificando permisos flexibles para usuario ${userId}`, {
        departmentId,
        allowGlobal,
        requireDepartment,
        permissions,
      });

      // Si se especifica un departamento específico, usar lógica tradicional
      if (departmentId) {
        console.log(
          `🎯 Verificando acceso específico al departamento: ${departmentId}`
        );
        for (const { category, permission } of permissions) {
          const permissionCheck =
            await UserDepartmentAccess.checkUserPermission(
              userId,
              departmentId,
              category,
              permission
            );

          if (permissionCheck.allowed) {
            req.permissions = {
              ...permissionCheck,
              departmentId,
              scope: "specific",
            };
            return next();
          }
        }

        return res.status(403).json({
          success: false,
          message: "No tiene permisos para acceder a este departamento",
          departmentId,
          requiredPermissions: permissions.map(
            (p) => `${p.category}.${p.permission}`
          ),
        });
      }

      // Si no hay departmentId y allowGlobal es true, verificar permisos globales
      if (allowGlobal) {
        const userAccesses = await UserDepartmentAccess.getUserAccesses(userId);
        console.log(
          `🎯 Accesos globales para usuario ${userId}:`,
          userAccesses
        );
        if (!userAccesses || userAccesses.length === 0) {
          return res.status(403).json({
            success: false,
            message: "No tiene acceso a ningún departamento",
          });
        }

        let hasValidAccess = false;
        const globalPermissions = {
          accesses: [],
          hasGlobalAccess: false,
          accessibleDepartments: [],
          validPermissions: [],
          scope: "global",
        };

        for (const access of userAccesses) {
          for (const { category, permission } of permissions) {
            console.log("Consultando permiso en la categoria de:" + category);
            console.log("Consultando permiso en la categoria de:" + permission);
            console.log(
              "El acceso tiene permiso:" +
                access.hasPermission(category, permission)
            );
            if (access.hasPermission(category, permission)) {
              hasValidAccess = true;

              globalPermissions.accesses.push({
                departmentId: access.department._id,
                departmentName: access.department.name,
                accessLevel: access.accessLevel,
                permission: `${category}.${permission}`,
              });

              globalPermissions.accessibleDepartments.push(
                access.department._id
              );
              globalPermissions.validPermissions.push(
                `${category}.${permission}`
              );

              if (permission === "canViewAll") {
                globalPermissions.hasGlobalAccess = true;
              }
            }
          }
        }

        if (hasValidAccess) {
          globalPermissions.accessibleDepartments = [
            ...new Set(globalPermissions.accessibleDepartments),
          ];
          globalPermissions.validPermissions = [
            ...new Set(globalPermissions.validPermissions),
          ];

          console.log(`✅ Acceso global concedido`, {
            hasGlobalAccess: globalPermissions.hasGlobalAccess,
            departmentsCount: globalPermissions.accessibleDepartments.length,
            permissions: globalPermissions.validPermissions,
          });

          req.permissions = globalPermissions;
          return next();
        }
      }

      // Si se requiere departamento pero no se proporcionó
      if (requireDepartment && !departmentId) {
        return res.status(400).json({
          success: false,
          message: "Se requiere un departamento para validar permisos",
        });
      }

      // Si ningún permiso es válido
      return res.status(403).json({
        success: false,
        message: "No tiene los permisos necesarios para realizar esta acción",
        requiredPermissions: permissions.map(
          (p) => `${p.category}.${p.permission}`
        ),
        context: {
          userId,
          departmentId,
          allowGlobal,
          requireDepartment,
        },
      });
    } catch (error) {
      console.error("Error en middleware de permisos flexibles:", error);
      res.status(500).json({
        success: false,
        message: "Error al validar permisos",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };
};
