const { z } = require('zod');

const AccountResponseSchema = z.object({
  securitiesAccount: z.object({
    accountNumber: z.string(),
    currentBalances: z.object({
      liquidationValue: z.coerce.number(),
      cashBalance: z.coerce.number(),
      availableFunds: z.coerce.number(),
    }),
  }).passthrough(),
}).passthrough();

module.exports = {
  AccountResponseSchema,
};
