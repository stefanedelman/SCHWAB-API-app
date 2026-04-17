const { z } = require('zod');

const InstrumentSchema = z.object({
  assetType: z.string(),
  cusip: z.string().optional(),
  symbol: z.string(),
  description: z.string().optional().default(''),
});

const PositionSchema = z.object({
  shortQuantity: z.number().default(0),
  averagePrice: z.number().default(0),
  currentDayProfitLoss: z.number().default(0),
  currentDayProfitLossPercentage: z.number().default(0),
  longQuantity: z.number().default(0),
  marketValue: z.number().default(0),
  instrument: InstrumentSchema,
});

const PositionsResponseSchema = z.object({
  securitiesAccount: z.object({
    accountNumber: z.string(),
    currentBalances: z.object({
      liquidationValue: z.number(),
      cashBalance: z.number(),
      availableFunds: z.number(),
    }),
    positions: z.array(PositionSchema).default([]),
  }),
});

module.exports = {
  PositionsResponseSchema,
};
