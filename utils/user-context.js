// =============================================================================
// src/utils/user-context.js
// =============================================================================
import { AsyncLocalStorage } from "async_hooks";

/**
 * Manager de contexto de usuario usando AsyncLocalStorage
 * Permite mantener el contexto del usuario a través de toda la cadena de llamadas asíncronas
 */
class UserContextManager {
  constructor() {
    this.asyncLocalStorage = new AsyncLocalStorage();
  }

  /**
   * Ejecuta una función con contexto de usuario
   * @param {Object} user - Objeto usuario autenticado
   * @param {Function} callback - Función a ejecutar con contexto
   */
  run(user, callback) {
    const context = {
      userId: user.userId || user._id || user.sub,
      user: user,
      timestamp: new Date(),
    };

    return this.asyncLocalStorage.run(context, callback);
  }

  /**
   * Obtiene el contexto de usuario actual
   * @returns {Object|null} Contexto de usuario o null si no existe
   */
  getContext() {
    return this.asyncLocalStorage.getStore();
  }

  /**
   * Obtiene el ID del usuario actual
   * @returns {String|null} ID del usuario o null
   */
  getCurrentUserId() {
    const context = this.getContext();
    return context?.userId || "665f23c4cdda33eaedaa4326";
  }

  /**
   * Obtiene el usuario actual completo
   * @returns {Object|null} Usuario o null
   */
  getCurrentUser() {
    const context = this.getContext();
    return context?.user || null;
  }

  /**
   * Verifica si hay un contexto de usuario activo
   * @returns {Boolean} True si hay contexto activo
   */
  hasContext() {
    return this.getContext() !== undefined;
  }
}

// Instancia singleton
export const userContext = new UserContextManager();

export default userContext;
