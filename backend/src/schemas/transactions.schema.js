const { z } = require('zod');

const TransferInstrumentSchema = z.object({
  assetType: z.string(),
  symbol: z.string(),
  description: z.string().optional().default(''),
}).passthrough();

const TransferItemSchema = z.object({
  instrument: TransferInstrumentSchema,
  amount: z.coerce.number(),
  cost: z.coerce.number().optional(),
  price: z.coerce.number().optional(),
  feeType: z.string().optional(),
  positionEffect: z.string().optional(),
}).passthrough();

const TransactionSchema = z.object({
  activityId: z.coerce.number(),
  time: z.string(),
  type: z.string(),
  status: z.string(),
  tradeDate: z.string().optional(),
  settlementDate: z.string().optional(),
  netAmount: z.coerce.number().optional(),
  transferItems: z.array(TransferItemSchema).default([]),
}).passthrough();

const TransactionsResponseSchema = z.array(TransactionSchema);

module.exports = {
  TransactionsResponseSchema,
};
