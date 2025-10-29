// =============================================================================
// src/module/exp-digital/services/sercop-sync.service.js
// Servicio de sincronización con APIs de SERCOP - Datos Abiertos
// Maneja mapeo inteligente y creación automática de tipos de contrato
// =============================================================================

import axios from "axios";
import { ContractTypeRepository } from "../repositories/contract-type.repository.js";
import {
  createError,
  createValidationError,
  ERROR_CODES,
} from "../../../../utils/error.util.js";

export class SercopSyncService {
  constructor() {
    this.contractTypeRepository = new ContractTypeRepository();
    this.baseUrl =
      "https://datosabiertos.compraspublicas.gob.ec/PLATAFORMA/api";

    // Mapeo de internal_type de SERCOP a nuestros tipos de contrato
    this.typeMapping = this._buildTypeMapping();
  }

  /**
   * Construir mapeo entre nombres de SERCOP y nuestros códigos
   * @private
   */
  _buildTypeMapping() {
    return {
      // PROCEDIMIENTOS COMUNES
      "Subasta Inversa Electrónica": {
        code: "SUBASTA_INVERSA",
        category: "COTIZACION",
        regime: "COMUN",
        aliases: ["Subasta Inversa", "SIE"],
      },
      Licitación: {
        code: "LICITACION_PUBLICA",
        category: "LICITACION",
        regime: "COMUN",
        aliases: ["Licitación Pública", "Licitacion"],
      },
      "Licitación de Seguros": {
        code: "LICITACION_SEGUROS",
        category: "LICITACION",
        regime: "COMUN",
        aliases: ["Licitacion de Seguros"],
      },
      Cotización: {
        code: "COTIZACION",
        category: "COTIZACION",
        regime: "COMUN",
        aliases: ["Cotizacion"],
      },
      "Menor Cuantía": {
        code: "MENOR_CUANTIA",
        category: "CONTRATACION_DIRECTA",
        regime: "COMUN",
        aliases: ["Menor Cuantia"],
      },
      "Lista corta": {
        code: "CONSULTORIA_LISTA_CORTA",
        category: "CONSULTORIA",
        regime: "COMUN",
        aliases: ["Lista Corta", "Lista corta"],
      },
      "Lista Corta por Contratación Directa Desierta": {
        code: "LISTA_CORTA_CD_DESIERTA",
        category: "CONSULTORIA",
        regime: "COMUN",
        aliases: [],
      },
      "Concurso publico": {
        code: "CONCURSO_PUBLICO_CONSULTORIA",
        category: "CONCURSO",
        regime: "COMUN",
        aliases: ["Concurso Público", "Concurso público"],
      },
      "Concurso Público por Contratación Directa Desierta": {
        code: "CONCURSO_PUBLICO_CD_DESIERTA",
        category: "CONCURSO",
        regime: "COMUN",
        aliases: [],
      },
      "Concurso Público por Lista Corta Desierta": {
        code: "CONCURSO_PUBLICO_LC_DESIERTA",
        category: "CONCURSO",
        regime: "COMUN",
        aliases: [],
      },

      // CATÁLOGO ELECTRÓNICO
      "Catálogo electrónico - Compra directa": {
        code: "CATALOGO_ELECTRONICO",
        category: "CATALOGO_ELECTRONICO",
        regime: "COMUN",
        aliases: ["Catálogo electrónico - Compra directa en el convenio"],
      },
      "Catálogo electrónico - Mejor oferta": {
        code: "CATALOGO_MEJOR_OFERTA",
        category: "CATALOGO_ELECTRONICO",
        regime: "COMUN",
        aliases: ["Catálogo electrónico - Mejor oferta"],
      },
      "Catálogo electrónico - Gran compra mejor oferta": {
        code: "CATALOGO_GRAN_COMPRA_MEJOR_OFERTA",
        category: "CATALOGO_ELECTRONICO",
        regime: "COMUN",
        aliases: [],
      },
      "Catálogo electrónico - Gran compra puja": {
        code: "CATALOGO_GRAN_COMPRA_PUJA",
        category: "CATALOGO_ELECTRONICO",
        regime: "COMUN",
        aliases: [],
      },

      // PROCEDIMIENTOS ESPECIALES
      "Bienes y Servicios únicos": {
        code: "BIENES_SERVICIOS_UNICOS",
        category: "CONTRATACION_DIRECTA",
        regime: "ESPECIAL",
        aliases: ["Bienes y Servicios Únicos"],
      },
      "Contratacion directa": {
        code: "CONTRATACION_DIRECTA_ESP",
        category: "CONTRATACION_DIRECTA",
        regime: "ESPECIAL",
        aliases: ["Contratación directa", "Contratación Directa"],
      },
      "Contratación Directa por Terminación Unilateral": {
        code: "CD_TERMINACION_UNILATERAL",
        category: "CONTRATACION_DIRECTA",
        regime: "ESPECIAL",
        aliases: [],
      },
      "Asesoría y Patrocinio Jurídico": {
        code: "ASESORIA_PATROCINIO",
        category: "CONTRATACION_DIRECTA",
        regime: "ESPECIAL",
        aliases: ["Asesoría y Patrocinio Jurídico"],
      },
      "Asesoría y Patrocinio Jurídico – Cons. puntuales y específicas": {
        code: "ASESORIA_PATROCINIO_PUNTUAL",
        category: "CONTRATACION_DIRECTA",
        regime: "ESPECIAL",
        aliases: [],
      },
      "Comunicación Social – Contratación Directa": {
        code: "COMUNICACION_SOCIAL_CD",
        category: "CONTRATACION_DIRECTA",
        regime: "ESPECIAL",
        aliases: [],
      },
      "Comunicación Social – Proceso de Selección": {
        code: "COMUNICACION_SOCIAL_PS",
        category: "CONTRATACION_DIRECTA",
        regime: "ESPECIAL",
        aliases: [],
      },
      "Contratación de Seguros": {
        code: "CONTRATACION_SEGUROS_ESP",
        category: "CONTRATACION_DIRECTA",
        regime: "ESPECIAL",
        aliases: [],
      },
      "Contrataciones con empresas públicas internacionales": {
        code: "EMPRESAS_PUBLICAS_INTERNACIONALES",
        category: "CONTRATACION_DIRECTA",
        regime: "ESPECIAL",
        aliases: [],
      },
      "Contratos entre Entidades Públicas o sus subsidiarias": {
        code: "ENTRE_ENTIDADES_PUBLICAS",
        category: "CONTRATACION_DIRECTA",
        regime: "ESPECIAL",
        aliases: [],
      },
      "Obra artística, científica o literaria": {
        code: "OBRAS_ARTISTICAS_ESP",
        category: "CONCURSO",
        regime: "ESPECIAL",
        aliases: [],
      },
      "Repuestos o Accesorios": {
        code: "REPUESTOS_ACCESORIOS",
        category: "CONTRATACION_DIRECTA",
        regime: "ESPECIAL",
        aliases: [],
      },
      "Transporte de correo interno o internacional": {
        code: "TRANSPORTE_CORREO",
        category: "CONTRATACION_DIRECTA",
        regime: "ESPECIAL",
        aliases: [],
      },
    };
  }

  /**
   * Normalizar nombre de tipo para comparación
   * @param {String} name - Nombre a normalizar
   * @returns {String} Nombre normalizado
   * @private
   */
  _normalizeName(name) {
    return name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // Quitar acentos
      .replace(/[^\w\s]/g, "") // Quitar caracteres especiales
      .trim();
  }

  /**
   * Buscar mapeo de tipo por nombre (con normalización y aliases)
   * @param {String} internalType - Nombre del tipo desde SERCOP
   * @returns {Object|null} Configuración del tipo o null
   * @private
   */
  _findTypeMapping(internalType) {
    const normalized = this._normalizeName(internalType);

    // Buscar coincidencia exacta
    for (const [key, config] of Object.entries(this.typeMapping)) {
      if (this._normalizeName(key) === normalized) {
        return { ...config, originalName: key };
      }
    }

    // Buscar en aliases
    for (const [key, config] of Object.entries(this.typeMapping)) {
      for (const alias of config.aliases || []) {
        if (this._normalizeName(alias) === normalized) {
          return { ...config, originalName: key };
        }
      }
    }

    // Si comienza con "Catálogo electrónico", intentar match parcial
    if (internalType.toLowerCase().includes("catálogo electrónico")) {
      return this._findCatalogoMatch(internalType);
    }

    return null;
  }

  /**
   * Buscar match para tipos de catálogo electrónico
   * @param {String} internalType - Tipo desde SERCOP
   * @returns {Object|null} Configuración o null
   * @private
   */
  _findCatalogoMatch(internalType) {
    const lower = internalType.toLowerCase();

    if (lower.includes("gran compra") && lower.includes("puja")) {
      return {
        code: "CATALOGO_GRAN_COMPRA_PUJA",
        category: "CATALOGO_ELECTRONICO",
        regime: "COMUN",
        originalName: internalType,
      };
    }

    if (lower.includes("gran compra") && lower.includes("mejor oferta")) {
      return {
        code: "CATALOGO_GRAN_COMPRA_MEJOR_OFERTA",
        category: "CATALOGO_ELECTRONICO",
        regime: "COMUN",
        originalName: internalType,
      };
    }

    if (lower.includes("mejor oferta")) {
      return {
        code: "CATALOGO_MEJOR_OFERTA",
        category: "CATALOGO_ELECTRONICO",
        regime: "COMUN",
        originalName: internalType,
      };
    }

    // Por defecto, catálogo genérico
    return {
      code: "CATALOGO_ELECTRONICO",
      category: "CATALOGO_ELECTRONICO",
      regime: "COMUN",
      originalName: internalType,
    };
  }

  /**
   * Obtener o crear tipo de contrato basado en internal_type de SERCOP
   * @param {String} internalType - Tipo desde la API de SERCOP
   * @param {Object} options - Opciones adicionales
   * @returns {Promise<Object>} Tipo de contrato (existente o creado)
   */
  async getOrCreateContractType(internalType, options = {}) {
    try {
      const { userData = {}, dryRun = false } = options;
      if (internalType === null) {
        console.log("internalType es null", JSON.stringify(internalType));
        console.log("Opciones", JSON.stringify(options));
        return null;
      }

      console.log(`🔍 Procesando tipo: "${internalType}"`);

      // Buscar mapeo
      const mapping = this._findTypeMapping(internalType);
      //console.log("mapping", mapping);
      if (!mapping) {
        console.warn(`⚠️ No hay mapeo definido para: "${internalType}"`);

        if (dryRun) {
          return {
            status: "unmapped",
            internalType,
            suggestion: this._createDefaultMapping(internalType),
          };
        }

        // Crear mapeo genérico si no existe
        return await this._createGenericType(internalType, userData);
      }

      // Buscar tipo existente por código
      let contractType = await this.contractTypeRepository.findByCode(
        mapping.code
      );

      if (contractType) {
        console.log(
          `✅ Tipo encontrado: ${contractType.name} (${contractType.code})`
        );
        return { status: "existing", contractType };
      }

      // Crear nuevo tipo
      if (dryRun) {
        console.log(`📋 Se crearía nuevo tipo: ${mapping.code}`);
        return { status: "to_create", mapping, internalType };
      }

      console.log(`📝 Creando nuevo tipo: ${mapping.code}`);
      contractType = await this._createContractTypeFromMapping(
        mapping,
        internalType,
        userData
      );

      return { status: "created", contractType };
    } catch (error) {
      console.error(
        `❌ Error procesando tipo "${internalType}":`,
        error.message
      );
      throw createError(
        ERROR_CODES.EXTERNAL_API_ERROR,
        `Error procesando tipo de contrato: ${error.message}`,
        500
      );
    }
  }

  /**
   * Crear tipo de contrato desde mapeo
   * @param {Object} mapping - Configuración del mapeo
   * @param {String} originalName - Nombre original de SERCOP
   * @param {Object} userData - Datos del usuario
   * @returns {Promise<Object>} Tipo creado
   * @private
   */
  async _createContractTypeFromMapping(mapping, originalName, userData) {
    console.log("mapping", mapping);
    const typeData = {
      contractNumber: originalName,
      code: mapping.code,
      name: originalName,
      category: mapping.category,
      regime: mapping.regime,
      description: `Tipo importado desde SERCOP: ${originalName}`,
      applicableObjects: this._inferApplicableObjects(mapping.category),
      isActive: true,
      displayOrder: 999, // Los tipos importados al final
      metadata: {
        source: "SERCOP_API",
        originalName,
        importedAt: new Date(),
        importedBy: userData.userId || null,
      },
    };

    return await this.contractTypeRepository.create(typeData, userData);
  }

  /**
   * Crear tipo genérico para internal_type no mapeado
   * @param {String} internalType - Tipo desde SERCOP
   * @param {Object} userData - Datos del usuario
   * @returns {Promise<Object>} Tipo creado
   * @private
   */
  async _createGenericType(internalType, userData) {
    // Generar código único desde el nombre
    const code = this._generateCodeFromName(internalType);

    // Verificar si ya existe un tipo con ese código
    let existingType = await this.contractTypeRepository.findByCode(code);

    if (existingType) {
      return { status: "existing", contractType: existingType };
    }

    const typeData = {
      code,
      name: internalType,
      category: "CONTRATACION_DIRECTA", // Por defecto
      regime: "COMUN",
      description: `Tipo importado desde SERCOP (sin mapeo definido): ${internalType}`,
      applicableObjects: ["bienes", "servicios"],
      isActive: true,
      displayOrder: 1000,
      metadata: {
        source: "SERCOP_API",
        originalName: internalType,
        importedAt: new Date(),
        importedBy: userData.userId || null,
        requiresReview: true, // Marcar para revisión manual
      },
    };

    const contractType = await this.contractTypeRepository.create(
      typeData,
      userData
    );

    return { status: "created_generic", contractType };
  }

  /**
   * Generar código único desde nombre
   * @param {String} name - Nombre del tipo
   * @returns {String} Código generado
   * @private
   */
  _generateCodeFromName(name) {
    return name
      .toUpperCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w\s]/g, "")
      .replace(/\s+/g, "_")
      .substring(0, 30);
  }

  /**
   * Inferir objetos aplicables según categoría
   * @param {String} category - Categoría del tipo
   * @returns {Array} Objetos aplicables
   * @private
   */
  _inferApplicableObjects(category) {
    const objectsByCategory = {
      CATALOGO_ELECTRONICO: ["bienes_catalogo", "servicios_catalogo"],
      CONSULTORIA: ["consultorias"],
      LICITACION: ["bienes", "servicios", "obras"],
      COTIZACION: ["bienes", "servicios", "obras"],
      CONTRATACION_DIRECTA: ["bienes", "servicios"],
      CONCURSO: ["obras_artisticas", "consultorias"],
    };

    return objectsByCategory[category] || ["bienes", "servicios"];
  }

  /**
   * Crear sugerencia de mapeo para tipo no mapeado
   * @param {String} internalType - Tipo desde SERCOP
   * @returns {Object} Sugerencia de mapeo
   * @private
   */
  _createDefaultMapping(internalType) {
    return {
      internalType,
      suggestedCode: this._generateCodeFromName(internalType),
      suggestedCategory: "CONTRATACION_DIRECTA",
      suggestedRegime: "COMUN",
      requiresReview: true,
      note: "Este mapeo debe ser revisado y ajustado manualmente",
    };
  }

  /**
   * Búsqueda en la API de SERCOP con paginación
   * @param {Object} filters - Filtros de búsqueda
   * @returns {Promise<Object>} Resultados de la API
   */
  async searchContracts(filters = {}) {
    try {
      const {
        year = new Date().getFullYear(),
        buyer = null,
        page = 1,
        limit = 100,
      } = filters;

      const params = new URLSearchParams({
        year,
        page,
        ...(buyer && { buyer }),
      });

      const url = `${this.baseUrl}/search_ocds?${params}`;
      console.log(`🌐 Consultando SERCOP: ${url}`);

      const response = await axios.get(url, {
        timeout: 30000,
        headers: {
          Accept: "application/json",
          "User-Agent": "GADMCE-ExpedienteDigital/1.0",
        },
      });

      return response.data;
    } catch (error) {
      if (error.code === "ECONNABORTED") {
        throw createError(
          ERROR_CODES.EXTERNAL_API_ERROR,
          "Timeout al consultar API de SERCOP",
          504
        );
      }

      throw createError(
        ERROR_CODES.EXTERNAL_API_ERROR,
        `Error consultando API de SERCOP: ${error.message}`,
        error.response?.status || 500
      );
    }
  }

  /**
   * Obtener detalle de un contrato específico por OCID
   * @param {String} ocid - Open Contracting ID
   * @returns {Promise<Object>} Detalle del contrato
   */
  async getContractDetail(ocid) {
    try {
      const url = `${this.baseUrl}/record?ocid=${ocid}`;
      console.log(`🔍 Obteniendo detalle del contrato: ${ocid}`);

      const response = await axios.get(url, {
        timeout: 20000,
        headers: {
          Accept: "application/json",
          "User-Agent": "GADMCE-ExpedienteDigital/1.0",
        },
      });

      return response.data;
    } catch (error) {
      throw createError(
        ERROR_CODES.EXTERNAL_API_ERROR,
        `Error obteniendo detalle del contrato: ${error.message}`,
        error.response?.status || 500
      );
    }
  }

  /**
   * Sincronizar tipos de contrato desde contratos existentes en SERCOP
   * @param {Object} options - Opciones de sincronización
   * @returns {Promise<Object>} Resultado de la sincronización
   */
  async syncContractTypes(options = {}) {
    try {
      const {
        year = new Date().getFullYear(),
        buyer = null,
        dryRun = false,
        userData = {},
      } = options;

      console.log(`🔄 Iniciando sincronización de tipos de contrato...`);
      console.log(`   Año: ${year}, Comprador: ${buyer || "TODOS"}`);
      console.log(
        `   Modo: ${dryRun ? "DRY RUN (sin cambios)" : "PRODUCCIÓN"}`
      );

      const results = {
        processed: 0,
        existing: 0,
        created: 0,
        unmapped: 0,
        errors: 0,
        types: new Set(),
        unmappedTypes: new Set(),
      };

      let currentPage = 1;
      let hasMorePages = true;

      while (hasMorePages) {
        console.log(`\n📄 Procesando página ${currentPage}...`);

        const searchResults = await this.searchContracts({
          year,
          buyer,
          page: currentPage,
          limit: 100,
        });

        if (!searchResults.data || searchResults.data.length === 0) {
          hasMorePages = false;
          break;
        }

        // Procesar cada contrato de la página
        for (const contract of searchResults.data) {
          if (!contract.internal_type) {
            continue;
          }

          results.processed++;
          results.types.add(contract.internal_type);

          try {
            const result = await this.getOrCreateContractType(
              contract.internal_type,
              { userData, dryRun }
            );

            if (result.status === "existing") {
              results.existing++;
            } else if (
              result.status === "created" ||
              result.status === "created_generic"
            ) {
              results.created++;
            } else if (result.status === "unmapped") {
              results.unmapped++;
              results.unmappedTypes.add(contract.internal_type);
            }
          } catch (error) {
            console.error(
              `❌ Error procesando "${contract.internal_type}":`,
              error.message
            );
            results.errors++;
          }
        }

        // Verificar si hay más páginas
        hasMorePages = currentPage < searchResults.pages;
        currentPage++;

        // Límite de seguridad para evitar loops infinitos
        if (currentPage > 50) {
          console.warn("⚠️ Alcanzado límite de 50 páginas");
          break;
        }
      }

      console.log(`\n✅ Sincronización completada:`);
      console.log(`   📊 Contratos procesados: ${results.processed}`);
      console.log(`   ✅ Tipos existentes: ${results.existing}`);
      console.log(`   ➕ Tipos creados: ${results.created}`);
      console.log(`   ⚠️  Tipos sin mapear: ${results.unmapped}`);
      console.log(`   ❌ Errores: ${results.errors}`);
      console.log(`   🏷️  Tipos únicos encontrados: ${results.types.size}`);

      if (results.unmappedTypes.size > 0) {
        console.log(`\n⚠️  Tipos sin mapear:`);
        results.unmappedTypes.forEach((type) => console.log(`   - ${type}`));
      }

      return {
        ...results,
        types: Array.from(results.types),
        unmappedTypes: Array.from(results.unmappedTypes),
      };
    } catch (error) {
      console.error(`❌ Error en sincronización:`, error);
      throw error;
    }
  }
}

export default new SercopSyncService();
