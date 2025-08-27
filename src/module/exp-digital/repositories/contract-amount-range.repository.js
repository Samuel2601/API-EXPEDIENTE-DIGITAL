import { Types } from "mongoose";
import { BaseRepository } from "../../core/base/repositories/base.repository.js";
import { ContractAmountRange } from "../models/contract-amount-range.schema.js";

export class ContractAmountRangeRepository extends BaseRepository {
  constructor() {
    super(ContractAmountRange);
  }

  /**
   * Buscar rangos por tipo de objeto de contratación
   * @param {String} contractObject - Tipo de objeto (bienes, servicios, obras, consultoria)
   * @param {Boolean} isActive - Filtro por estado activo
   * @returns {Promise<Array>} Lista de rangos
   */
  async findByContractObject(contractObject, isActive = true) {
    return await this.model
      .find({
        contractObject,
        isActive,
      })
      .sort({ priority: 1, minAmount: 1 });
  }

  /**
   * Buscar rangos aplicables para un monto específico
   * @param {String} contractObject - Tipo de objeto
   * @param {Number} amount - Monto del contrato
   * @returns {Promise<Array>} Rangos aplicables
   */
  async findApplicableRanges(contractObject, amount) {
    return await this.model
      .find({
        contractObject,
        isActive: true,
        minAmount: { $lte: amount },
        $or: [{ maxAmount: null }, { maxAmount: { $gte: amount } }],
      })
      .sort({ priority: 1 });
  }

  /**
   * Buscar por código de tipo de contratación
   * @param {String} contractTypeCode - Código del tipo
   * @param {Boolean} isActive - Filtro por estado activo
   * @returns {Promise<Array>} Lista de rangos
   */
  async findByContractTypeCode(contractTypeCode, isActive = true) {
    return await this.model
      .find({
        contractTypeCode,
        isActive,
      })
      .sort({ contractObject: 1, minAmount: 1 });
  }

  /**
   * Verificar solapamiento de rangos
   * @param {String} contractObject - Tipo de objeto
   * @param {String} contractTypeCode - Código del tipo
   * @param {Number} minAmount - Monto mínimo
   * @param {Number} maxAmount - Monto máximo
   * @param {String} excludeId - ID a excluir de la verificación
   * @returns {Promise<Array>} Rangos que se solapan
   */
  async findOverlappingRanges(
    contractObject,
    contractTypeCode,
    minAmount,
    maxAmount,
    excludeId = null
  ) {
    const query = {
      contractObject,
      contractTypeCode,
      isActive: true,
      $or: [
        // Casos de solapamiento
        {
          minAmount: { $lte: minAmount },
          $or: [{ maxAmount: null }, { maxAmount: { $gte: minAmount } }],
        },
        {
          minAmount: { $lte: maxAmount || Number.MAX_SAFE_INTEGER },
          $or: [{ maxAmount: null }, { maxAmount: { $gte: minAmount } }],
        },
      ],
    };

    if (excludeId) {
      query._id = { $ne: excludeId };
    }

    return await this.model.find(query);
  }

  /**
   * Obtener rangos agrupados por tipo de objeto
   * @returns {Promise<Object>} Rangos agrupados
   */
  async findAllGroupedByObject() {
    return await this.model.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: "$contractObject",
          ranges: {
            $push: {
              contractTypeCode: "$contractTypeCode",
              minAmount: "$minAmount",
              maxAmount: "$maxAmount",
              priority: "$priority",
              description: "$description",
            },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]);
  }

  /**
   * Actualizar múltiples rangos
   * @param {Array} updates - Array de objetos con id y datos a actualizar
   * @returns {Promise<Object>} Resultado de la operación
   */
  async updateMultiple(updates) {
    const operations = updates.map((update) => ({
      updateOne: {
        filter: { _id: update.id },
        update: { $set: { ...update.data, updatedAt: new Date() } },
      },
    }));

    return await this.model.bulkWrite(operations);
  }

  /**
   * Buscar rangos con paginación
   * @param {Object} filter - Filtros de búsqueda
   * @param {Object} options - Opciones de paginación
   * @returns {Promise<Object>} Resultado paginado
   */
  async findWithPagination(filter = {}, options = {}) {
    const {
      page = 1,
      limit = 10,
      sortBy = "priority",
      sortOrder = "asc",
    } = options;

    const query = this.model.find(filter);
    const sortOption = { [sortBy]: sortOrder === "asc" ? 1 : -1 };

    return await this.paginate(query, { page, limit, sort: sortOption });
  }

  /**
   * Buscar rangos por múltiples tipos de objeto
   * @param {Array} contractObjects - Tipos de objeto
   * @param {Boolean} isActive - Filtro por estado activo
   * @returns {Promise<Array>} Lista de rangos
   */
  async findByMultipleContractObjects(contractObjects, isActive = true) {
    return await this.model
      .find({
        contractObject: { $in: contractObjects },
        isActive,
      })
      .sort({ contractObject: 1, priority: 1, minAmount: 1 });
  }

  /**
   * Desactivar rangos por tipo de objeto y código
   * @param {String} contractObject - Tipo de objeto
   * @param {String} contractTypeCode - Código del tipo
   * @returns {Promise<Object>} Resultado de la operación
   */
  async deactivateByType(contractObject, contractTypeCode) {
    return await this.model.updateMany(
      {
        contractObject,
        contractTypeCode,
        isActive: true,
      },
      {
        $set: {
          isActive: false,
          updatedAt: new Date(),
        },
      }
    );
  }
}

export default ContractAmountRangeRepository;
