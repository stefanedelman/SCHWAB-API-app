const { z } = require('zod');

const TransferInstrumentSchema = z.object({
  assetType: z.string(),
  symbol: z.string(),
  description: z.string().optional().default(''),
});

const TransferItemSchema = z.object({
  instrument: TransferInstrumentSchema,
  amount: z.number(),
  cost: z.number().optional(),
  price: z.number().optional(),
  feeType: z.string().optional(),
  positionEffect: z.string().optional(),
});

const TransactionSchema = z.object({
  activityId: z.number(),
  time: z.string(),
  type: z.string(),
  status: z.string(),
  tradeDate: z.string().optional(),
  settlementDate: z.string().optional(),
  netAmount: z.number().optional(),
  transferItems: z.array(TransferItemSchema).default([]),
});

const TransactionsResponseSchema = z.array(TransactionSchema);

module.exports = {
  TransactionsResponseSchema,
};
