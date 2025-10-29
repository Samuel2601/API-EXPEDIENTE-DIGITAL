// =============================================================================
// src/module/exp-digital/controllers/sercop-sync.controller.js
// Controlador para endpoints de sincronización con SERCOP
// =============================================================================

import sercopSyncService from "../services/sercop-sync.service.js";
import { validateRequiredFields } from "../../../utils/validation.js";

export class SercopSyncController {
  /**
   * Sincronizar tipos de contrato desde SERCOP
   * POST /expediente-digital/sercop/sync-types
   * Body: { year, buyer, dryRun }
   */
  syncContractTypes = async (req, res) => {
    try {
      const { user, body } = req;
      const {
        year = new Date().getFullYear(),
        buyer = null,
        dryRun = false,
      } = body;

      console.log(
        `🔄 Usuario ${user.userId} iniciando sincronización de tipos`
      );
      console.log(`   Año: ${year}, Comprador: ${buyer || "TODOS"}`);
      console.log(`   DryRun: ${dryRun}`);

      const result = await sercopSyncService.syncContractTypes({
        year,
        buyer,
        dryRun,
        userData: {
          userId: user.userId,
          ip: req.ip,
          userAgent: req.get("user-agent"),
        },
      });

      res.status(200).json({
        success: true,
        message: dryRun
          ? "Simulación completada (no se realizaron cambios)"
          : "Sincronización completada exitosamente",
        data: {
          processed: result.processed,
          existing: result.existing,
          created: result.created,
          unmapped: result.unmapped,
          errors: result.errors,
          uniqueTypesFound: result.types.length,
          unmappedTypes: result.unmappedTypes,
        },
        metadata: {
          year,
          buyer,
          dryRun,
          executedBy: user.userId,
          executedAt: new Date(),
        },
      });
    } catch (error) {
      console.error(`❌ Error en sincronización de tipos:`, error);

      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Error en sincronización",
        code: error.code || "SYNC_ERROR",
      });
    }
  };

  /**
   * Obtener o crear un tipo de contrato específico
   * POST /expediente-digital/sercop/resolve-type
   * Body: { internalType, dryRun }
   */
  resolveContractType = async (req, res) => {
    try {
      const { user, body } = req;

      validateRequiredFields(body, ["internalType"], "datos de tipo");

      const { internalType, dryRun = false } = body;

      console.log(
        `🔍 Usuario ${user.userId} resolviendo tipo: "${internalType}"`
      );

      const result = await sercopSyncService.getOrCreateContractType(
        internalType,
        {
          userData: {
            userId: user.userId,
            ip: req.ip,
            userAgent: req.get("user-agent"),
          },
          dryRun,
        }
      );

      const statusMessages = {
        existing: "Tipo de contrato ya existe",
        created: "Tipo de contrato creado exitosamente",
        created_generic:
          "Tipo de contrato creado (sin mapeo definido - requiere revisión)",
        to_create: "Tipo de contrato sería creado (dry run)",
        unmapped: "Tipo sin mapeo definido",
      };

      res
        .status(
          result.status === "created" || result.status === "created_generic"
            ? 201
            : 200
        )
        .json({
          success: true,
          message: statusMessages[result.status] || "Tipo procesado",
          data: {
            status: result.status,
            contractType: result.contractType || null,
            mapping: result.mapping || null,
            suggestion: result.suggestion || null,
            requiresReview:
              result.status === "created_generic" ||
              result.status === "unmapped",
          },
          metadata: {
            internalType,
            dryRun,
            resolvedBy: user.userId,
            resolvedAt: new Date(),
          },
        });
    } catch (error) {
      console.error(`❌ Error resolviendo tipo:`, error);

      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Error resolviendo tipo",
        code: error.code || "RESOLVE_TYPE_ERROR",
      });
    }
  };

  /**
   * Buscar contratos en SERCOP
   * GET /expediente-digital/sercop/search
   * Query: year, buyer, page, limit
   */
  searchContracts = async (req, res) => {
    try {
      const { user, query } = req;
      const {
        year = new Date().getFullYear(),
        buyer = null,
        page = 1,
        limit = 20,
      } = query;

      console.log(`🔍 Usuario ${user.userId} buscando contratos en SERCOP`);
      console.log(`   Año: ${year}, Página: ${page}`);

      const result = await sercopSyncService.searchContracts({
        year,
        buyer,
        page: parseInt(page),
        limit: parseInt(limit),
      });

      res.status(200).json({
        success: true,
        data: result.data || [],
        pagination: {
          total: result.total || 0,
          page: result.page || 1,
          pages: result.pages || 1,
          hasMore: (result.page || 1) < (result.pages || 1),
        },
        metadata: {
          year,
          buyer,
          source: "SERCOP",
          queriedBy: user.userId,
          queriedAt: new Date(),
        },
      });
    } catch (error) {
      console.error(`❌ Error buscando contratos en SERCOP:`, error);

      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Error buscando contratos",
        code: error.code || "SEARCH_ERROR",
      });
    }
  };

  /**
   * Obtener detalle de un contrato desde SERCOP
   * GET /expediente-digital/sercop/contract/:ocid
   */
  getContractDetail = async (req, res) => {
    try {
      const { user, params } = req;
      const { ocid } = params;

      if (!ocid) {
        return res.status(400).json({
          success: false,
          message: "OCID es requerido",
          code: "MISSING_OCID",
        });
      }

      console.log(
        `🔍 Usuario ${user.userId} obteniendo detalle de contrato: ${ocid}`
      );

      const result = await sercopSyncService.getContractDetail(ocid);

      res.status(200).json({
        success: true,
        data: result,
        metadata: {
          ocid,
          source: "SERCOP",
          queriedBy: user.userId,
          queriedAt: new Date(),
        },
      });
    } catch (error) {
      console.error(`❌ Error obteniendo detalle de contrato:`, error);

      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Error obteniendo detalle",
        code: error.code || "DETAIL_ERROR",
      });
    }
  };

  /**
   * Obtener mapeo de tipos disponible
   * GET /expediente-digital/sercop/type-mapping
   */
  getTypeMapping = async (req, res) => {
    try {
      const { user } = req;

      console.log(`📋 Usuario ${user.userId} consultando mapeo de tipos`);

      // Obtener mapeo desde el servicio
      const mapping = sercopSyncService.typeMapping || {};

      const mappingList = Object.entries(mapping).map(([key, config]) => ({
        sercopName: key,
        code: config.code,
        category: config.category,
        regime: config.regime,
        aliases: config.aliases || [],
      }));

      res.status(200).json({
        success: true,
        data: {
          totalMappings: mappingList.length,
          mappings: mappingList,
        },
        metadata: {
          version: "1.0",
          lastUpdate: new Date(),
          queriedBy: user.userId,
        },
      });
    } catch (error) {
      console.error(`❌ Error obteniendo mapeo:`, error);

      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Error obteniendo mapeo",
        code: error.code || "MAPPING_ERROR",
      });
    }
  };

  /**
   * Validar si un internal_type tiene mapeo
   * POST /expediente-digital/sercop/validate-type
   * Body: { internalType }
   */
  validateType = async (req, res) => {
    try {
      const { user, body } = req;

      validateRequiredFields(body, ["internalType"], "datos de validación");

      const { internalType } = body;

      console.log(
        `🔍 Usuario ${user.userId} validando tipo: "${internalType}"`
      );

      // Usar método privado del servicio para encontrar mapeo
      const mapping = sercopSyncService._findTypeMapping(internalType);

      res.status(200).json({
        success: true,
        data: {
          internalType,
          hasMappinsg: !!mapping,
          mapping: mapping || null,
          suggestion: !mapping
            ? sercopSyncService._createDefaultMapping(internalType)
            : null,
        },
        metadata: {
          validatedBy: user.userId,
          validatedAt: new Date(),
        },
      });
    } catch (error) {
      console.error(`❌ Error validando tipo:`, error);

      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Error validando tipo",
        code: error.code || "VALIDATE_ERROR",
      });
    }
  };
}

export default new SercopSyncController();
