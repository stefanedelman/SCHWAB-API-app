const { z } = require('zod');

const QuotePayloadSchema = z.object({
  lastPrice: z.number(),
  netChange: z.number().default(0),
  netPercentChangeInDouble: z.number().default(0),
});

const QuoteSchema = z.object({
  assetMainType: z.string().optional(),
  symbol: z.string().optional(),
  quote: QuotePayloadSchema,
});

const QuotesResponseSchema = z.record(z.string(), QuoteSchema);

module.exports = {
  QuotesResponseSchema,
};
