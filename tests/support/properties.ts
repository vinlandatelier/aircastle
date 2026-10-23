const configuredSeed = process.env.AIRCASTLE_TEST_SEED;
const seed = configuredSeed === undefined ? 20261023 : Number(configuredSeed);
if (!Number.isInteger(seed) || seed < 0 || seed > 2147483647) {
  throw new Error("AIRCASTLE_TEST_SEED must be an integer between 0 and 2147483647");
}

export const propertyParameters = {
  seed,
  numRuns: 200,
  verbose: true,
  ...(process.env.AIRCASTLE_TEST_PATH === undefined
    ? {}
    : { path: process.env.AIRCASTLE_TEST_PATH }),
};
