import { ModelMongoose } from "#src/modules/zoosanitario/models/ExportSchema.js";

// Colores para la consola
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  bgGreen: "\x1b[42m",
  bgRed: "\x1b[41m",
  bgYellow: "\x1b[43m",
  bgBlue: "\x1b[44m",
};

/**
 * Extrae todas las rutas de una aplicación Express con detección de autenticación mejorada
 * @param {express.Application} app - La aplicación Express
 * @returns {Array} Array de objetos con información de las rutas
 */
function extractRoutes(app) {
  const routes = [];

  function processLayer(layer, basePath = "") {
    if (layer.route) {
      // Es una ruta directa
      const route = layer.route;
      const methods = Object.keys(route.methods).map((m) => m.toUpperCase());

      methods.forEach((method) => {
        const routePath = route.path || "";
        const fullPath = cleanPath(basePath + routePath);
        const middlewares = route.stack || [];
        const hasAuth =
          checkAuthMiddleware(middlewares) || !esRutaPublica(fullPath);

        routes.push({
          method: method.toLowerCase(),
          path: fullPath,
          authenticated: hasAuth,
          middlewares: middlewares.length,
        });
      });
    } else if (layer.name === "router" && layer.handle && layer.handle.stack) {
      // Es un router
      const routerPath = extractRouterPath(layer.regexp);
      const newBasePath = basePath + routerPath;

      layer.handle.stack.forEach((subLayer) => {
        processLayer(subLayer, newBasePath);
      });
    }
  }

  if (app._router && app._router.stack) {
    app._router.stack.forEach((layer) => {
      processLayer(layer);
    });
  }

  return routes;
}

function cleanPath(path) {
  return (
    path
      .replace(/\\/g, "")
      .replace(/\$/, "")
      .replace(/\^/, "")
      .replace(/\?\?\$/, "")
      .replace(/\(\?\:\[\\\/\]\)\?\?\$/, "")
      .replace(/\(\?\=.*?\)/, "")
      .replace(/\(\?\!.*?\)/, "")
      .replace(/\.\*/g, "*")
      .replace(/\/+/g, "/")
      .replace(/\/$/, "")
      .toLowerCase() || // Añadir esta línea
    "/"
  );
}

function extractRouterPath(regexp) {
  const source = regexp.source;
  const patterns = [
    /\^\\?\/?([^\\()\[\]$?*+.]+)/,
    /\^([^\\()\[\]$?*+.]+)\\?\/?/,
    /\^\\?\/([^\\()\[\]$?*+.]+)/,
  ];

  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match && match[1]) {
      return "/" + match[1].replace(/\\/g, "");
    }
  }

  if (source.includes("/")) {
    const simpleMatch = source.match(/\/([^\/\\$\(\)\[\]]+)/);
    if (simpleMatch) {
      return "/" + simpleMatch[1];
    }
  }

  return "";
}

function checkAuthMiddleware(middlewares) {
  return middlewares.some((middleware) => {
    const name = middleware.name || middleware.handle?.name || "";
    const code = middleware.toString() || middleware.handle?.toString() || "";

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

// Función auxiliar para identificar rutas públicas
const esRutaPublica = (path) => {
  const rutasPublicas = [
    "/api/docs",
    "/api/system/health",
    "/api/system/info",
    "/api/system/statistics",
    "/api/bovino-status",
    "/api/obtener_imagen",
  ];

  return rutasPublicas.some((rutaPublica) => path.startsWith(rutaPublica));
};

/**
 * Verifica qué permisos ya existen en la base de datos
 * @param {Array} rutasAutenticadas - Array de rutas autenticadas
 * @returns {Object} Objeto con permisos existentes y nuevos
 */
async function verificarPermisosExistentes(rutasAutenticadas) {
  const permisosExistentes = [];
  const permisosNuevos = [];

  /*console.log(
    `${colors.dim}🔍 Verificando ${rutasAutenticadas.length} rutas autenticadas...${colors.reset}`
  );*/

  for (const route of rutasAutenticadas) {
    // Normalizar la ruta a minúsculas y manejar parámetros consistentemente
    let rutaSinApi = route.path.replace(/^\/api/, "");
    rutaSinApi = rutaSinApi.toLowerCase(); // Convertir toda la ruta a minúsculas

    // Normalizar nombres de parámetros (ej: :animalTypeId -> :animaltypeid)
    rutaSinApi = rutaSinApi.replace(/:[a-z]+/gi, (match) =>
      match.toLowerCase()
    );

    try {
      /*console.log(
        `${colors.dim}   Verificando: ${rutaSinApi} [${route.method}]${colors.reset}`
      );*/

      const permisoExistente = await ModelMongoose.Permiso.findOne({
        name: rutaSinApi,
        method: route.method.toLowerCase(), // Asegurar método en minúsculas
      });

      if (permisoExistente) {
        /*console.log(
          `${colors.green}     ✅ Existe: ${permisoExistente._id}${colors.reset}`
        );*/
        permisosExistentes.push({
          name: rutaSinApi,
          method: route.method,
          id: permisoExistente._id,
        });
      } else {
        console.log(`${colors.yellow}     ➕ Nuevo${colors.reset}`);
        permisosNuevos.push({
          name: rutaSinApi,
          method: route.method.toLowerCase(),
          originalPath: route.path, // Opcional: guardar la ruta original para referencia
        });
      }
    } catch (error) {
      console.error(
        `${colors.red}❌ Error verificando permiso ${rutaSinApi} [${route.method}]:${colors.reset}`,
        error.message
      );
      permisosNuevos.push({
        name: rutaSinApi,
        method: route.method.toLowerCase(),
        originalPath: route.path,
      });
    }
  }

  // Debug adicional
  console.log(`${colors.cyan}📊 Resumen verificación:${colors.reset}`);
  console.log(`   Existentes: ${permisosExistentes.length}`);
  console.log(`   Nuevos: ${permisosNuevos.length}`);

  // Mostrar algunos ejemplos de lo que se encontró
  if (permisosExistentes.length > 0) {
    console.log(`${colors.green}✅ Ejemplos existentes:${colors.reset}`);
    permisosExistentes.slice(0, 3).forEach((p) => {
      console.log(`   • ${p.name} [${p.method}]`);
    });
  }

  if (permisosNuevos.length > 0) {
    console.log(`${colors.yellow}➕ Ejemplos nuevos:${colors.reset}`);
    permisosNuevos.slice(0, 3).forEach((p) => {
      console.log(`   • ${p.name} [${p.method}]`);
    });
  }

  return { permisosExistentes, permisosNuevos };
}

/**
 * Imprime estadísticas detalladas del proceso
 * @param {Object} stats - Objeto con todas las estadísticas
 */
function imprimirEstadisticas(stats) {
  console.log(
    `\n${colors.bright}${colors.cyan}╔════════════════════════════════════════════════════════════════╗${colors.reset}`
  );
  console.log(
    `${colors.bright}${colors.cyan}║                   🔐 GENERADOR DE PERMISOS                     ║${colors.reset}`
  );
  console.log(
    `${colors.bright}${colors.cyan}╚════════════════════════════════════════════════════════════════╝${colors.reset}\n`
  );

  // Estadísticas generales
  console.log(`${colors.bright}📊 ANÁLISIS DE RUTAS:${colors.reset}`);
  console.log(
    `   ${colors.white}Total de rutas encontradas: ${colors.bright}${stats.totalRutas}${colors.reset}`
  );
  console.log(
    `   ${colors.green}🔓 Rutas públicas: ${stats.rutasPublicas}${colors.reset}`
  );
  console.log(
    `   ${colors.yellow}🔐 Rutas autenticadas: ${stats.rutasAutenticadas}${colors.reset}`
  );
  console.log(
    `   ${colors.blue}📁 Rutas de API (/api/*): ${stats.rutasApi}${colors.reset}\n`
  );

  // Estadísticas de permisos
  console.log(`${colors.bright}🎯 ANÁLISIS DE PERMISOS:${colors.reset}`);
  console.log(
    `   ${colors.cyan}📋 Permisos ya existentes: ${colors.bright}${stats.permisosExistentes}${colors.reset}`
  );
  console.log(
    `   ${colors.magenta}✨ Permisos nuevos a crear: ${colors.bright}${stats.permisosNuevos}${colors.reset}`
  );

  if (stats.errores > 0) {
    console.log(
      `   ${colors.red}❌ Errores encontrados: ${stats.errores}${colors.reset}`
    );
  }

  console.log(
    `   ${colors.green}✅ Permisos guardados exitosamente: ${colors.bright}${stats.guardados}${colors.reset}\n`
  );

  // Resumen final
  const porcentajeExito =
    stats.permisosNuevos > 0
      ? ((stats.guardados / stats.permisosNuevos) * 100).toFixed(1)
      : 100;
  const porcentajeAutenticadas =
    stats.totalRutas > 0
      ? ((stats.rutasAutenticadas / stats.totalRutas) * 100).toFixed(1)
      : 0;

  console.log(`${colors.bright}📈 RESUMEN:${colors.reset}`);
  console.log(
    `   ${colors.blue}Rutas que requieren autenticación: ${porcentajeAutenticadas}%${colors.reset}`
  );
  console.log(
    `   ${colors.green}Tasa de éxito en creación de permisos: ${porcentajeExito}%${colors.reset}`
  );

  if (stats.permisosExistentes > 0) {
    console.log(
      `   ${colors.yellow}⚠️  ${stats.permisosExistentes} permisos ya existían (se omitieron)${colors.reset}`
    );
  }

  console.log(
    `\n${colors.bright}${colors.blue}════════════════════════════════════════════════════════════════${colors.reset}`
  );

  if (stats.guardados > 0) {
    console.log(
      `${colors.bgGreen}${colors.white}${colors.bright} ✅ PROCESO COMPLETADO EXITOSAMENTE ${colors.reset}`
    );
  } else if (stats.permisosNuevos === 0) {
    console.log(
      `${colors.bgYellow}${colors.white}${colors.bright} ⚠️  TODOS LOS PERMISOS YA EXISTÍAN ${colors.reset}`
    );
  } else {
    console.log(
      `${colors.bgRed}${colors.white}${colors.bright} ❌ PROCESO COMPLETADO CON ERRORES ${colors.reset}`
    );
  }

  console.log(
    `${colors.dim}💡 Tip: Los permisos se generan automáticamente solo para rutas autenticadas${colors.reset}\n`
  );
}

/**
 * Función principal para autoguardar permisos con estadísticas detalladas
 * @param {express.Application} app - La aplicación Express
 * @returns {Object} Estadísticas del proceso
 */
const autoguardarPermisos = async (app) => {
  let contador = 0;
  let errores = [];

  try {
    console.log(
      `${colors.yellow}🔄 Analizando rutas de la aplicación...${colors.reset}`
    );

    // Extraer todas las rutas
    const todasLasRutas = extractRoutes(app);

    // Filtrar rutas autenticadas que empiecen con /api/
    const rutasApi = todasLasRutas.filter((route) =>
      route.path.startsWith("/api/")
    );
    const rutasPublicas = todasLasRutas.filter((route) =>
      esRutaPublica(route.path)
    );
    const rutasAutenticadas = rutasApi.filter(
      (route) => !esRutaPublica(route.path)
    );

    console.log(`${colors.green}✅ Análisis completado${colors.reset}`);
    console.log(
      `${colors.yellow}🔍 Verificando permisos existentes en la base de datos...${colors.reset}`
    );

    // Verificar permisos existentes
    const { permisosExistentes, permisosNuevos } =
      await verificarPermisosExistentes(rutasAutenticadas);

    console.log(`${colors.green}✅ Verificación completada${colors.reset}`);

    if (permisosNuevos.length > 0) {
      console.log(
        `${colors.cyan}💾 Guardando ${permisosNuevos.length} permisos nuevos...${colors.reset}`
      );
    }

    // Crear nuevos permisos
    for (const permisoNuevo of permisosNuevos) {
      try {
        const permiso = new ModelMongoose.Permiso({
          name: permisoNuevo.name,
          method: permisoNuevo.method,
          user: [],
        });

        await permiso.save();
        contador++;
      } catch (error) {
        console.error(error);
        if (error.code === 11000) {
          errores.push(
            `Duplicado: ${permisoNuevo.name} [${permisoNuevo.method}]`
          );
        } else {
          errores.push(
            `Error: ${permisoNuevo.name} [${permisoNuevo.method}]: ${error.message}`
          );
        }
      }
    }

    // Preparar estadísticas
    const stats = {
      totalRutas: todasLasRutas.length,
      rutasPublicas: rutasPublicas.length,
      rutasAutenticadas: rutasAutenticadas.length,
      rutasApi: rutasApi.length,
      permisosExistentes: permisosExistentes.length,
      permisosNuevos: permisosNuevos.length,
      guardados: contador,
      errores: errores.length,
    };

    // Imprimir estadísticas detalladas
    imprimirEstadisticas(stats);

    // Mostrar errores si los hay
    if (errores.length > 0) {
      console.log(`${colors.red}❌ ERRORES ENCONTRADOS:${colors.reset}`);

      // Separar errores por tipo
      const erroresDuplicados = errores.filter((e) => e.includes("Duplicado:"));
      const erroresReales = errores.filter((e) => !e.includes("Duplicado:"));

      if (erroresDuplicados.length > 0) {
        console.log(
          `${colors.yellow}   ⚠️  Intentos de duplicado (${erroresDuplicados.length}):${colors.reset}`
        );
        erroresDuplicados.slice(0, 5).forEach((error) => {
          console.log(`${colors.yellow}   • ${error}${colors.reset}`);
        });
        if (erroresDuplicados.length > 5) {
          console.log(
            `${colors.dim}   ... y ${erroresDuplicados.length - 5} más${colors.reset}`
          );
        }
        console.log();
      }

      if (erroresReales.length > 0) {
        console.log(
          `${colors.red}   ❌ Errores críticos (${erroresReales.length}):${colors.reset}`
        );
        erroresReales.forEach((error) => {
          console.log(`   ${colors.red}• ${error}${colors.reset}`);
        });
        console.log();
      }
    }

    return {
      guardados: contador,
      errores: errores.length,
      total: rutasAutenticadas.length,
      nuevos: permisosNuevos.length,
      existentes: permisosExistentes.length,
      stats,
    };
  } catch (error) {
    console.error(
      `${colors.red}❌ Error crítico en autoguardarPermisos:${colors.reset}`,
      error
    );
    return {
      guardados: 0,
      errores: 1,
      total: 0,
      nuevos: 0,
      existentes: 0,
      stats: null,
    };
  }
};

export { autoguardarPermisos };
