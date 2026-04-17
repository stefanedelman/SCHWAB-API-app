const { z } = require('zod');

const AccountResponseSchema = z.object({
  securitiesAccount: z.object({
    accountNumber: z.string(),
    currentBalances: z.object({
      liquidationValue: z.number(),
      cashBalance: z.number(),
      availableFunds: z.number(),
    }),
  }),
});

module.exports = {
  AccountResponseSchema,
};
