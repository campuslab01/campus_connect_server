exports.isPrime = (user) => {
  const activePremium = Boolean(user?.isPremium && user?.premiumExpiresAt && new Date(user.premiumExpiresAt) > new Date());
  return (user?.membershipLevel === 'prime') || activePremium;
};

exports.swipeLimitFor = (user) => exports.isPrime(user) ? 50 : 15;
exports.confessionLimitFor = (user) => exports.isPrime(user) ? Number.POSITIVE_INFINITY : 30;

exports.resetIfNeeded = (user) => {
  const now = new Date();
  if (!user.swipesResetAt || now > user.swipesResetAt) {
    user.swipesToday = 0;
    const r = new Date();
    r.setHours(24, 0, 0, 0);
    user.swipesResetAt = r;
  }
  if (!user.confessionResetAt || now > user.confessionResetAt) {
    user.confessionReadsToday = 0;
    const r2 = new Date();
    r2.setHours(24, 0, 0, 0);
    user.confessionResetAt = r2;
  }
};