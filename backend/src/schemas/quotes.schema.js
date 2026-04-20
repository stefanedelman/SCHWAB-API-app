const { z } = require('zod');

const QuotePayloadSchema = z.object({
  lastPrice: z.coerce.number().optional(),
  netChange: z.coerce.number().default(0),
  netPercentChangeInDouble: z.coerce.number().default(0),
}).passthrough();

const QuoteSchema = z.object({
  assetMainType: z.string().optional(),
  symbol: z.string().optional(),
  quote: QuotePayloadSchema,
}).passthrough();

const QuotesResponseSchema = z.record(z.string(), QuoteSchema);

module.exports = {
  QuotesResponseSchema,
};
