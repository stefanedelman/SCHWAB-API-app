const { z } = require('zod');

const InstrumentSchema = z.object({
  assetType: z.string(),
  cusip: z.string().optional(),
  symbol: z.string(),
  description: z.string().optional().default(''),
}).passthrough();

const PositionSchema = z.object({
  shortQuantity: z.coerce.number().default(0),
  averagePrice: z.coerce.number().default(0),
  currentDayProfitLoss: z.coerce.number().default(0),
  currentDayProfitLossPercentage: z.coerce.number().default(0),
  longQuantity: z.coerce.number().default(0),
  marketValue: z.coerce.number().default(0),
  instrument: InstrumentSchema,
}).passthrough();

const PositionsResponseSchema = z.object({
  securitiesAccount: z.object({
    accountNumber: z.string(),
    currentBalances: z.object({
      liquidationValue: z.coerce.number(),
      cashBalance: z.coerce.number(),
      availableFunds: z.coerce.number(),
    }),
    positions: z.array(PositionSchema).default([]),
  }).passthrough(),
}).passthrough();

module.exports = {
  PositionsResponseSchema,
};
