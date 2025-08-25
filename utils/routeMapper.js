// routeMapper.js
import { Router } from "express";

// Colores para la consola
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",

  // Colores de texto
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",

  // Colores de fondo
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
  bgBlue: "\x1b[44m",
  bgMagenta: "\x1b[45m",
  bgCyan: "\x1b[46m",
};

/**
 * Extrae todas las rutas de una aplicación Express
 * @param {express.Application} app - La aplicación Express
 * @returns {Array} Array de objetos con información de las rutas
 */
function extractRoutes(app) {
  const routes = [];

  // Función para limpiar y normalizar el path
  function cleanPath(path) {
    return (
      path
        .replace(/\\/g, "") // Remover backslashes
        .replace(/\$/, "") // Remover $ del final
        .replace(/\^/, "") // Remover ^ del inicio
        .replace(/\?\?\$/, "") // Remover ??$
        .replace(/\(\?\:\[\\\/\]\)\?\?\$/, "") // Remover patrones complejos
        .replace(/\(\?\=.*?\)/, "") // Remover lookaheads
        .replace(/\(\?\!.*?\)/, "") // Remover negative lookaheads
        .replace(/\.\*/g, "*") // Convertir .* a *
        .replace(/\/+/g, "/") // Múltiples slashes a uno
        .replace(/\/$/, "") || "/"
    ); // Remover slash final excepto para root
  }

  // Función mejorada para extraer el path base de un router
  function extractRouterPath(regexp) {
    const source = regexp.source;

    // Diferentes patrones para extraer el path del router
    const patterns = [
      /\^\\?\/?([^\\()\[\]$?*+.]+)/, // Patrón principal
      /\^([^\\()\[\]$?*+.]+)\\?\/?/, // Patrón alternativo
      /\^\\?\/([^\\()\[\]$?*+.]+)/, // Con slash inicial
    ];

    for (const pattern of patterns) {
      const match = source.match(pattern);
      if (match && match[1]) {
        return "/" + match[1].replace(/\\/g, "");
      }
    }

    // Si no encuentra nada específico, revisar si es un path simple
    if (source.includes("/")) {
      const simpleMatch = source.match(/\/([^\/\\$\(\)\[\]]+)/);
      if (simpleMatch) {
        return "/" + simpleMatch[1];
      }
    }

    return "";
  }

  // Función para procesar un layer (capa) del stack
  function processLayer(layer, basePath = "") {
    if (layer.route) {
      // Es una ruta directa
      const route = layer.route;
      const methods = Object.keys(route.methods).map((m) => m.toUpperCase());

      methods.forEach((method) => {
        const routePath = route.path || "";
        const fullPath = cleanPath(basePath + routePath);
        const middlewares = route.stack || [];
        const hasAuth = checkAuthMiddleware(middlewares);

        routes.push({
          method,
          path: fullPath,
          authenticated: hasAuth,
          middlewares: middlewares.length,
          handler: getHandlerName(middlewares[middlewares.length - 1]),
        });
      });
    } else if (layer.name === "router" && layer.handle && layer.handle.stack) {
      // Es un router - extraer el path base correctamente
      const routerPath = extractRouterPath(layer.regexp);
      const newBasePath = basePath + routerPath;

      // Procesar recursivamente las rutas del router
      layer.handle.stack.forEach((subLayer) => {
        processLayer(subLayer, newBasePath);
      });
    } else if (layer.name === "bound dispatch" && layer.route) {
      // Manejar rutas bound dispatch
      const route = layer.route;
      const methods = Object.keys(route.methods).map((m) => m.toUpperCase());

      methods.forEach((method) => {
        const fullPath = cleanPath(basePath + (route.path || ""));
        const middlewares = route.stack || [];
        const hasAuth = checkAuthMiddleware(middlewares);

        routes.push({
          method,
          path: fullPath,
          authenticated: hasAuth,
          middlewares: middlewares.length,
          handler: getHandlerName(middlewares[middlewares.length - 1]),
        });
      });
    }
  }

  // Procesar el stack principal de la app
  if (app._router && app._router.stack) {
    app._router.stack.forEach((layer) => {
      processLayer(layer);
    });
  }

  return routes;
}

/**
 * Verifica si una ruta tiene middleware de autenticación
 * @param {Array} middlewares - Array de middlewares
 * @returns {boolean} True si tiene autenticación
 */
function checkAuthMiddleware(middlewares) {
  return middlewares.some((middleware) => {
    const name = middleware.name || middleware.handle?.name || "";
    const code = middleware.toString() || middleware.handle?.toString() || "";

    // Patrones comunes de middleware de autenticación
    const authPatterns = [
      /auth/i,
      /token/i,
      /jwt/i,
      /bearer/i,
      /authorization/i,
      /authenticate/i,
      /protected/i,
      /verify/i,
      /middleware.*auth/i,
    ];

    return authPatterns.some(
      (pattern) => pattern.test(name) || pattern.test(code)
    );
  });
}

/**
 * Obtiene el nombre del handler de la ruta
 * @param {Object} layer - Layer del middleware
 * @returns {string} Nombre del handler
 */
function getHandlerName(layer) {
  if (!layer) return "anonymous";

  const handler = layer.handle || layer;
  return handler.name || "anonymous";
}

/**
 * Formatea una ruta para mostrar parámetros de forma más clara
 * @param {string} path - Ruta original
 * @returns {string} Ruta formateada
 */
function formatPath(path) {
  return (
    path
      .replace(/\*/g, "*") // Wildcards
      .replace(/\:([^\/]+)/g, ":$1") // Parámetros
      .replace(/\(\?\:\[.*?\]\)\?\??/g, "(optional)") // Parámetros opcionales complejos
      .replace(/\$/, "") // Fin de string
      .replace(/\^/, "") || // Inicio de string
    "/"
  );
}

/**
 * Imprime las rutas de forma organizada y con colores
 * @param {Array} routes - Array de rutas
 */
function printRoutes(routes) {
  console.log(
    `\n${colors.bright}${colors.cyan}╔════════════════════════════════════════════════════════════════╗${colors.reset}`
  );
  console.log(
    `${colors.bright}${colors.cyan}║                    🗺️  MAPA DE RUTAS API                      ║${colors.reset}`
  );
  console.log(
    `${colors.bright}${colors.cyan}╚════════════════════════════════════════════════════════════════╝${colors.reset}\n`
  );

  // Limpiar rutas duplicadas (puede ocurrir en el mapeo)
  const uniqueRoutes = routes.filter(
    (route, index, self) =>
      index ===
      self.findIndex((r) => r.method === route.method && r.path === route.path)
  );

  // Agrupar rutas por path base de forma más inteligente
  const groupedRoutes = uniqueRoutes.reduce((acc, route) => {
    let basePath = "";

    // Extraer el path base más limpio
    const pathParts = route.path.split("/").filter(Boolean);

    if (pathParts.length === 0) {
      basePath = "root";
    } else if (pathParts[0] === "api" && pathParts.length > 1) {
      // Para rutas de API, usar /api/recurso
      basePath = `api/${pathParts[1]}`;
    } else {
      // Para otras rutas, usar el primer segmento
      basePath = pathParts[0];
    }

    if (!acc[basePath]) acc[basePath] = [];
    acc[basePath].push(route);
    return acc;
  }, {});

  // Estadísticas
  const totalRoutes = uniqueRoutes.length;
  const authenticatedRoutes = uniqueRoutes.filter(
    (r) => r.authenticated
  ).length;
  const publicRoutes = totalRoutes - authenticatedRoutes;

  console.log(`${colors.bright}📊 ESTADÍSTICAS:${colors.reset}`);
  console.log(
    `   Total de rutas: ${colors.bright}${colors.white}${totalRoutes}${colors.reset}`
  );
  console.log(`   ${colors.green}🔓 Públicas: ${publicRoutes}${colors.reset}`);
  console.log(
    `   ${colors.yellow}🔐 Protegidas: ${authenticatedRoutes}${colors.reset}\n`
  );

  // Leyenda
  console.log(`${colors.bright}🎨 LEYENDA:${colors.reset}`);
  console.log(
    `   ${colors.green}🔓 Verde${colors.reset}  = Ruta pública (sin autenticación)`
  );
  console.log(
    `   ${colors.yellow}🔐 Amarillo${colors.reset} = Ruta protegida (requiere autenticación)\n`
  );

  console.log(
    `${colors.bright}${colors.blue}════════════════════════════════════════════════════════════════${colors.reset}\n`
  );

  // Imprimir rutas agrupadas
  Object.keys(groupedRoutes)
    .sort()
    .forEach((group) => {
      const groupRoutes = groupedRoutes[group];
      const groupColor = group === "root" ? colors.magenta : colors.cyan;

      // Formatear el nombre del grupo
      const groupName = group === "root" ? "/" : `/${group}`;

      console.log(
        `${colors.bright}${groupColor}📁 ${groupName}${colors.reset}`
      );
      console.log(`${colors.dim}${"─".repeat(50)}${colors.reset}`);

      groupRoutes
        .sort((a, b) => {
          // Ordenar por método y luego por path
          if (a.method !== b.method) {
            const methodOrder = ["GET", "POST", "PUT", "PATCH", "DELETE"];
            return (
              methodOrder.indexOf(a.method) - methodOrder.indexOf(b.method)
            );
          }
          return a.path.localeCompare(b.path);
        })
        .forEach((route) => {
          const authColor = route.authenticated ? colors.yellow : colors.green;
          const authIcon = route.authenticated ? "🔐" : "🔓";
          const authText = route.authenticated ? "(Autenticado)" : "(Público)";

          // Formatear método con color según el tipo
          const methodColors = {
            GET: colors.green,
            POST: colors.blue,
            PUT: colors.yellow,
            PATCH: colors.magenta,
            DELETE: colors.red,
          };
          const methodColor = methodColors[route.method] || colors.white;

          const formattedPath = formatPath(route.path);
          const methodPadded = route.method.padEnd(7);

          console.log(
            `   ${authIcon} ${methodColor}${colors.bright}${methodPadded}${colors.reset} ` +
              `${colors.bright}${formattedPath}${colors.reset} ` +
              `${authColor}${authText}${colors.reset}`
          );

          // Mostrar información adicional si hay middlewares
          if (route.middlewares > 1) {
            console.log(
              `${colors.dim}      └─ Middlewares: ${route.middlewares}${colors.reset}`
            );
          }
        });

      console.log(""); // Línea en blanco entre grupos
    });

  console.log(
    `${colors.bright}${colors.blue}════════════════════════════════════════════════════════════════${colors.reset}`
  );
  console.log(
    `${colors.dim}💡 Tip: Las rutas protegidas requieren token de autenticación en el header${colors.reset}`
  );
  console.log(
    `${colors.dim}📝 Parámetros: :param = parámetro requerido, (optional) = parámetro opcional${colors.reset}\n`
  );
}

/**
 * Función principal para mapear y mostrar rutas
 * @param {express.Application} app - La aplicación Express
 */
export function mapRoutes(app) {
  try {
    const routes = extractRoutes(app);

    if (routes.length === 0) {
      console.log(
        `${colors.yellow}⚠️  No se encontraron rutas en la aplicación${colors.reset}`
      );
      return;
    }

    printRoutes(routes);

    return routes;
  } catch (error) {
    console.error(
      `${colors.red}❌ Error al mapear rutas:${colors.reset}`,
      error.message
    );
    return [];
  }
}

/**
 * Middleware para agregar automáticamente al iniciar la app
 * @param {express.Application} app - La aplicación Express
 */
export function setupRouteMapper(app) {
  // Esperar a que se carguen todas las rutas
  process.nextTick(() => {
    setTimeout(() => {
      mapRoutes(app);
    }, 100);
  });
}

// Función para usar en desarrollo - mapea rutas cada vez que cambia algo
export function watchRoutes(app) {
  let timeout;

  const originalUse = app.use.bind(app);
  const originalGet = app.get.bind(app);
  const originalPost = app.post.bind(app);
  const originalPut = app.put.bind(app);
  const originalDelete = app.delete.bind(app);
  const originalPatch = app.patch.bind(app);

  const remapRoutes = () => {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      console.clear();
      mapRoutes(app);
    }, 500);
  };

  // Interceptar métodos que agregan rutas
  app.use = function (...args) {
    const result = originalUse(...args);
    remapRoutes();
    return result;
  };

  app.get = function (...args) {
    const result = originalGet(...args);
    remapRoutes();
    return result;
  };

  app.post = function (...args) {
    const result = originalPost(...args);
    remapRoutes();
    return result;
  };

  app.put = function (...args) {
    const result = originalPut(...args);
    remapRoutes();
    return result;
  };

  app.delete = function (...args) {
    const result = originalDelete(...args);
    remapRoutes();
    return result;
  };

  app.patch = function (...args) {
    const result = originalPatch(...args);
    remapRoutes();
    return result;
  };
}

export default { mapRoutes, setupRouteMapper, watchRoutes };
