function buildBasicRecommendation(rateData, amount, annualIncome, bankAmount) {
  const { current, history = [] } = rateData;
  const lines = [];

  // Determine fix term from rate trend
  const recentHistory = history.slice(-6);
  let term = '5-year fixed';
  let trendNote = 'rates are stable or rising — locking in with a 5-year fix protects against further increases';

  if (recentHistory.length >= 2) {
    const diff = recentHistory[0].twoYear - recentHistory[recentHistory.length - 1].twoYear;
    if (diff > 0.1) {
      term = '2-year fixed';
      trendNote = 'rates have been falling — a 2-year fix lets you re-fix sooner at potentially lower rates';
    }
  }

  // LTV calculation
  let ltvNote = '';
  let ltvWarning = '';
  let rateQuoted = null;

  if (bankAmount > 0) {
    const propertyValue = amount + bankAmount;
    const ltv = (amount / propertyValue) * 100;

    if (ltv <= 60) {
      rateQuoted = current.twoYear;
      ltvNote = `Your LTV is ${ltv.toFixed(1)}% (≤60%) — you qualify for the best available rates.`;
    } else if (ltv <= 75) {
      rateQuoted = current.threeYear;
      ltvNote = `Your LTV is ${ltv.toFixed(1)}% (≤75%) — you qualify for standard rates.`;
    } else if (ltv <= 85) {
      rateQuoted = current.fiveYear;
      ltvNote = `Your LTV is ${ltv.toFixed(1)}% (≤85%) — expect a higher rate tier.`;
    } else {
      rateQuoted = current.fiveYear;
      ltvNote = `Your LTV is ${ltv.toFixed(1)}% (>85%).`;
      ltvWarning = 'Note: LTV above 85% — lenders may require a larger deposit or impose stricter affordability criteria.';
    }
  }

  // Affordability check
  let affordabilityNote = '';
  let affordabilityWarning = '';
  if (annualIncome > 0) {
    const maxBorrowing = annualIncome * 4.5;
    if (amount > maxBorrowing) {
      affordabilityWarning = `Your requested loan (£${amount.toLocaleString('en-GB')}) exceeds the standard affordability limit of £${maxBorrowing.toLocaleString('en-GB')} (${annualIncome.toLocaleString('en-GB')} × 4.5). You may need a larger deposit or a co-borrower.`;
    } else {
      affordabilityNote = `Your loan amount (£${amount.toLocaleString('en-GB')}) is within standard affordability limits (max £${maxBorrowing.toLocaleString('en-GB')}).`;
    }
  }

  const rateInfo = rateQuoted ? ` at approximately ${rateQuoted}%` : '';

  lines.push('**1. Recommendation**');
  lines.push(`Based on current market conditions, a **${term}**${rateInfo} is recommended.`);
  lines.push('');

  lines.push('**2. Key Supporting Factors**');
  if (affordabilityNote) lines.push(`- ${affordabilityNote}`);
  if (ltvNote) lines.push(`- ${ltvNote}`);
  lines.push(`- Rate trend: ${trendNote}.`);
  lines.push('');

  lines.push('**3. Main Risks**');
  if (affordabilityWarning) lines.push(`- ${affordabilityWarning}`);
  if (ltvWarning) lines.push(`- ${ltvWarning}`);
  lines.push('- Rate movements are unpredictable; consult a qualified mortgage adviser for personalised advice.');
  lines.push('- This analysis is rule-based and does not account for your full financial picture.');
  lines.push('');

  lines.push('**4. Summary**');
  const summaryRate = rateQuoted ? ` The current indicative rate for your profile is ${rateQuoted}%.` : '';
  lines.push(`A ${term} offers the best balance given current market conditions.${summaryRate} Always compare lenders and consider seeking independent financial advice before committing.`);

  return lines.join('\n');
}

module.exports = { buildBasicRecommendation };
