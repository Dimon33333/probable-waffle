import { Decimal, floorToStep, ceilToStep, ceilDp, floorDp } from './rounding';
import { walkAsks, walkBids } from './orderbook';
import { reject, type Outcome } from './rejections';
import { ageSeconds, type RouteInput, type RouteResult } from './types';
import { computeConfidence } from './confidence';

const BPS = new Decimal(10_000);
const ZERO = new Decimal(0);

/**
 * Prices one buy-transfer-sell route against real order-book depth, or returns
 * a typed rejection. Pure function: no I/O, no clock reads beyond `input.now`.
 */
export function calculateRoute(input: RouteInput): Outcome<RouteResult> {
  const { asset, buy, sell, transferBuySide, transferSellSide, quoteConversion, budget, options, now } = input;

  // ---- 0. freshness and status gates -------------------------------------
  const buyBookAge = ageSeconds(buy.fetchedAt, now);
  const sellBookAge = ageSeconds(sell.fetchedAt, now);
  const transferBuyAge = ageSeconds(transferBuySide.fetchedAt, now);
  const transferSellAge = ageSeconds(transferSellSide.fetchedAt, now);
  const bookAge = Math.max(buyBookAge, sellBookAge);
  const transferAge = Math.max(transferBuyAge, transferSellAge);
  const oldestAge = Math.max(bookAge, transferAge);

  if (bookAge > options.maxDataAgeSec) {
    return reject('STALE_DATA', `order book is ${bookAge.toFixed(0)}s old (limit ${options.maxDataAgeSec}s)`);
  }
  if (transferAge > options.maxTransferDataAgeSec) {
    return reject(
      'STALE_DATA',
      `network/withdrawal data is ${transferAge.toFixed(0)}s old (limit ${options.maxTransferDataAgeSec}s)`,
    );
  }

  if (transferBuySide.withdrawEnabled === null) {
    return reject('STATUS_UNKNOWN', `withdrawal status for ${asset.buyCode} on ${buy.exchange} is unknown`);
  }
  if (transferBuySide.withdrawEnabled !== true) {
    return reject('WITHDRAW_DISABLED', `withdrawals for ${asset.buyCode} on ${buy.exchange} are disabled`);
  }
  if (transferSellSide.depositEnabled === null) {
    return reject('STATUS_UNKNOWN', `deposit status for ${asset.sellCode} on ${sell.exchange} is unknown`);
  }
  if (transferSellSide.depositEnabled !== true) {
    return reject('DEPOSIT_DISABLED', `deposits for ${asset.sellCode} on ${sell.exchange} are disabled`);
  }

  const feeSourceIsUnknown = (source: string, rate: Decimal | null) =>
    rate === null || (options.strictMode && source === 'assumed');

  if (feeSourceIsUnknown(buy.takerFee.source, buy.takerFee.rate)) {
    return reject('FEE_UNKNOWN', `taker fee on ${buy.exchange}/${buy.symbol} is unknown`);
  }
  if (feeSourceIsUnknown(sell.takerFee.source, sell.takerFee.rate)) {
    return reject('FEE_UNKNOWN', `taker fee on ${sell.exchange}/${sell.symbol} is unknown`);
  }
  if (feeSourceIsUnknown(transferBuySide.source, transferBuySide.withdrawFeeFixed)) {
    return reject('FEE_UNKNOWN', `withdrawal fee for ${asset.buyCode} on ${buy.exchange} is unknown`);
  }

  const buyFeeRate = buy.takerFee.rate as Decimal;
  const sellFeeRate = sell.takerFee.rate as Decimal;
  const withdrawFeeFixed = transferBuySide.withdrawFeeFixed as Decimal;
  const withdrawFeePercent = transferBuySide.withdrawFeePercent ?? ZERO;
  const depositFeeAmount = transferSellSide.depositFee ?? ZERO;

  // ---- 1. buy leg: walk the asks ------------------------------------------
  const spendable = buy.takerFee.chargedIn === 'quote' ? budget.div(buyFeeRate.plus(1)) : budget;
  const bought = walkAsks(buy.asks, spendable);
  if (bought.exhausted) {
    return reject(
      'INSUFFICIENT_BUY_DEPTH',
      `book on ${buy.exchange} covers ${bought.quoteSpent.toFixed(2)} of ${spendable.toFixed(2)} requested`,
      { fillableQuote: bought.quoteSpent.toString() },
    );
  }

  const adverseBufferBps = options.adverseBufferBps;
  // The adverse buffer already pushes this worse (higher) than the book's raw VWAP,
  // which is the "round against the user" direction for a buy price.
  const buyVWAP = bought.vwap.mul(adverseBufferBps.div(BPS).plus(1));
  const baseGross = bought.quoteSpent.div(buyVWAP);

  const buyFee = buy.takerFee.chargedIn === 'base'
    ? ceilToStep(baseGross.mul(buyFeeRate), buy.limits.amountPrecisionStep)
    : budget.minus(bought.quoteSpent); // quote-charged fee already left out of `spendable`
  const baseAcquired = floorToStep(
    buy.takerFee.chargedIn === 'base' ? baseGross.minus(buyFee) : baseGross,
    buy.limits.amountPrecisionStep,
  );

  if (baseAcquired.lt(buy.limits.minAmount) || bought.quoteSpent.lt(buy.limits.minNotional)) {
    return reject('BELOW_MIN_ORDER', `buy fill ${baseAcquired.toString()} ${asset.buyCode} below exchange minimum`);
  }

  // ---- 2. transfer leg -----------------------------------------------------
  const baseWithdrawn = floorToStep(baseAcquired, transferBuySide.withdrawPrecisionStep);
  if (baseWithdrawn.lt(transferBuySide.minWithdraw)) {
    return reject(
      'BELOW_MIN_WITHDRAWAL',
      `${baseWithdrawn.toString()} < minimum withdrawal ${transferBuySide.minWithdraw.toString()}`,
    );
  }
  if (transferBuySide.maxWithdraw !== null && baseWithdrawn.gt(transferBuySide.maxWithdraw)) {
    return reject(
      'ABOVE_MAX_WITHDRAWAL',
      `${baseWithdrawn.toString()} > maximum withdrawal ${transferBuySide.maxWithdraw.toString()}`,
    );
  }
  const withdrawFeeTotal = ceilToStep(
    withdrawFeeFixed.plus(baseWithdrawn.mul(withdrawFeePercent)),
    transferBuySide.withdrawPrecisionStep,
  );
  const baseArriving = baseWithdrawn.minus(withdrawFeeTotal).minus(depositFeeAmount);
  if (baseArriving.lte(0)) {
    return reject('NEGATIVE_NET_RETURN', 'withdrawal and deposit fees consume the entire position', {
      withdrawFeeTotal: withdrawFeeTotal.toString(),
      depositFeeAmount: depositFeeAmount.toString(),
    });
  }

  // ---- 3. sell leg: walk the bids ------------------------------------------
  const baseToSell = floorToStep(baseArriving, sell.limits.amountPrecisionStep);
  const dust = baseArriving.minus(baseToSell);
  if (baseToSell.lt(sell.limits.minAmount)) {
    return reject('BELOW_MIN_ORDER', `sell amount ${baseToSell.toString()} below exchange minimum`);
  }

  const sold = walkBids(sell.bids, baseToSell);
  if (sold.exhausted) {
    return reject(
      'INSUFFICIENT_SELL_DEPTH',
      `book on ${sell.exchange} absorbs ${sold.baseSold.toString()} of ${baseToSell.toString()} requested`,
      { absorbableBase: sold.baseSold.toString() },
    );
  }

  // The adverse buffer already pushes this worse (lower) than the book's raw VWAP,
  // which is the "round against the user" direction for a sell price.
  const sellVWAP = sold.vwap.mul(new Decimal(1).minus(adverseBufferBps.div(BPS)));
  const grossProceeds = baseToSell.mul(sellVWAP);
  if (grossProceeds.lt(sell.limits.minNotional)) {
    return reject('BELOW_MIN_ORDER', 'sell notional below exchange minimum');
  }

  const sellFee = sell.takerFee.chargedIn === 'quote'
    ? ceilDp(grossProceeds.mul(sellFeeRate))
    : ceilDp(baseToSell.mul(sellFeeRate).mul(sellVWAP));
  let netProceeds = floorDp(grossProceeds.minus(sellFee));

  // ---- 3b. quote conversion, if the two legs settle in different currencies
  let quoteConversionCost = ZERO;
  if (quoteConversion) {
    if (quoteConversion.fee.rate === null || (options.strictMode && quoteConversion.fee.source === 'assumed')) {
      return reject('FEE_UNKNOWN', 'quote-conversion trading fee is unknown');
    }
    const convFeeRate = quoteConversion.fee.rate;
    const beforeConversion = netProceeds;
    if (quoteConversion.side === 'buy') {
      const convSpendable = quoteConversion.fee.chargedIn === 'quote'
        ? netProceeds.div(convFeeRate.plus(1))
        : netProceeds;
      const converted = walkAsks(quoteConversion.asks, convSpendable);
      if (converted.exhausted) {
        return reject('INSUFFICIENT_SELL_DEPTH', 'quote-conversion book cannot absorb the full proceeds');
      }
      const convFee = quoteConversion.fee.chargedIn === 'base'
        ? converted.baseFilled.mul(convFeeRate)
        : ZERO;
      netProceeds = floorDp(converted.baseFilled.minus(convFee));
    } else {
      const converted = walkBids(quoteConversion.bids, netProceeds);
      if (converted.exhausted) {
        return reject('INSUFFICIENT_SELL_DEPTH', 'quote-conversion book cannot absorb the full proceeds');
      }
      const convFee = quoteConversion.fee.chargedIn === 'quote'
        ? converted.quoteReceived.mul(convFeeRate)
        : ZERO;
      netProceeds = floorDp(converted.quoteReceived.minus(convFee));
    }
    quoteConversionCost = beforeConversion.minus(netProceeds);
  }

  // ---- 4. result -------------------------------------------------------------
  const netProfit = netProceeds.minus(budget);
  const netProfitPct = netProfit.div(budget).mul(100);

  if (netProfit.lte(0)) {
    return reject('NEGATIVE_NET_RETURN', `net ${netProfit.toFixed(4)} after all costs`, {
      buyVWAP: buyVWAP.toString(),
      sellVWAP: sellVWAP.toString(),
      withdrawFeeTotal: withdrawFeeTotal.toString(),
      sellFee: sellFee.toString(),
      netProceeds: netProceeds.toString(),
      netProfit: netProfit.toString(),
    });
  }

  if (netProfitPct.lt(options.minNetProfitPct)) {
    return reject(
      'BELOW_MIN_PROFIT',
      `net profit ${netProfitPct.toFixed(3)}% below the requested minimum ${options.minNetProfitPct.toString()}%`,
    );
  }

  const grossSpreadPct = sellVWAP.minus(buyVWAP).div(buyVWAP).mul(100);

  const confidence = computeConfidence({
    buyFeeSource: buy.takerFee.source,
    sellFeeSource: sell.takerFee.source,
    transferSource: transferBuySide.source,
    identityEvidence: asset.identityEvidence,
    oldestAgeSec: oldestAge,
    maxDataAgeSec: options.maxDataAgeSec,
    buyBookLevelsTotal: buy.asks.length,
    buyBookLevelsConsumed: bought.fills.length,
    sellBookLevelsTotal: sell.bids.length,
    sellBookLevelsConsumed: sold.fills.length,
    requiresMemo: transferBuySide.requiresMemo || transferSellSide.requiresMemo,
  });

  const warnings: string[] = [];
  if (transferBuySide.requiresMemo || transferSellSide.requiresMemo) {
    warnings.push('Destination requires a memo/destination tag. A transfer without it may be unrecoverable.');
  }
  if (dust.gt(0)) {
    warnings.push(`${dust.toString()} ${asset.sellCode} left over as dust after precision rounding.`);
  }

  return {
    ok: true,
    value: {
      buyVWAP,
      sellVWAP,
      grossSpreadPct,
      buyFee,
      buyFeeCurrency: buy.takerFee.chargedIn,
      withdrawFeeFixed,
      withdrawFeePercent,
      withdrawFeeTotal,
      depositFee: depositFeeAmount,
      sellFee,
      sellFeeCurrency: sell.takerFee.chargedIn,
      quoteConversionCost,
      adverseBufferBps,
      baseAcquired,
      baseWithdrawn,
      baseArriving,
      baseSold: sold.baseSold,
      dust,
      netProceeds,
      netProfit,
      netProfitPct,
      maxCapacity: null, // filled in by computeCapacity()
      buyFills: bought.fills,
      sellFills: sold.fills,
      dataAges: {
        buyBookSec: buyBookAge,
        sellBookSec: sellBookAge,
        transferBuySideSec: transferBuyAge,
        transferSellSideSec: transferSellAge,
      },
      confidence,
      warnings,
    },
  };
}

