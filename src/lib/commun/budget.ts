/** Keep the saved CAF allocation when it is excluded from the simulation. */
export function commonContributions(base1: number, base2: number, caf1: number, caf2: number, includeCaf = true) {
  const appliedCaf1 = includeCaf ? caf1 : 0;
  const appliedCaf2 = includeCaf ? caf2 : 0;
  return {
    appliedCaf1,
    appliedCaf2,
    contribution1: Math.max(0, base1 - appliedCaf1),
    contribution2: Math.max(0, base2 - appliedCaf2),
  };
}
