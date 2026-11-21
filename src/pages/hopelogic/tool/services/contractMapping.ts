import { TradeContractType } from '../types';

export interface LiveContractRequest {
  symbol: string;
  tradeType: TradeContractType;
  prediction?: number | string;
  duration: number;
  durationUnit: 't' | 's' | 'm';
  stake: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(value)));

const digitBarrier = (prediction: number | string | undefined, fallback = 5) => {
  const digit = typeof prediction === 'number' ? prediction : parseInt(String(prediction), 10);
  return String(clamp(Number.isFinite(digit) ? digit : fallback, 0, 9));
};

/**
 * Maps the tool's internal contract types to Deriv WebSocket API proposal
 * parameters. Returns { error } for contract types that have no live equivalent.
 */
export function buildContractParams(
  request: LiveContractRequest,
  currency: string
): { params: Record<string, unknown> } | { error: string } {
  const type = request.tradeType;
  const unit = request.durationUnit || 't';
  const durationRaw = Math.max(1, Math.round(Number(request.duration) || 1));
  const stake = Number(request.stake);

  if (!Number.isFinite(stake) || stake <= 0) return { error: 'Invalid stake' };
  if (!/^[A-Z0-9_]{1,60}$/.test(request.symbol)) return { error: 'Invalid market symbol' };

  const base = {
    amount: Number(stake.toFixed(2)),
    basis: 'stake' as const,
    currency,
    symbol: request.symbol,
  };

  const tickDuration = (min: number, max: number) => ({
    duration: clamp(durationRaw, min, max),
    duration_unit: 't' as const,
  });

  switch (type) {
    case 'OVER':
      return { params: { ...base, ...tickDuration(1, 10), contract_type: 'DIGITOVER', barrier: digitBarrier(request.prediction) } };
    case 'UNDER':
      return { params: { ...base, ...tickDuration(1, 10), contract_type: 'DIGITUNDER', barrier: digitBarrier(request.prediction) } };
    case 'DIFFERS':
      return { params: { ...base, ...tickDuration(1, 10), contract_type: 'DIGITDIFF', barrier: digitBarrier(request.prediction) } };
    case 'MATCHES':
      return { params: { ...base, ...tickDuration(1, 10), contract_type: 'DIGITMATCH', barrier: digitBarrier(request.prediction) } };
    case 'EVEN':
      return { params: { ...base, ...tickDuration(1, 10), contract_type: 'DIGITEVEN' } };
    case 'ODD':
      return { params: { ...base, ...tickDuration(1, 10), contract_type: 'DIGITODD' } };
    case 'RISE':
    case 'HIGHER':
    case 'FALL':
    case 'LOWER': {
      const params: Record<string, unknown> = { ...base, contract_type: type === 'RISE' || type === 'HIGHER' ? 'CALL' : 'PUT' };
      if (unit === 't') Object.assign(params, tickDuration(1, 10));
      else if (unit === 's') { params.duration = clamp(durationRaw, 15, 3600); params.duration_unit = 's'; }
      else { params.duration = clamp(durationRaw, 1, 1440); params.duration_unit = 'm'; }
      return { params };
    }
    case 'ONLY_UP':
    case 'ONLY_DOWN':
      return { params: { ...base, ...tickDuration(2, 5), contract_type: type === 'ONLY_UP' ? 'ONLYUP' : 'ONLYDOWN' } };
    case 'HIGH_TICK':
    case 'LOW_TICK':
      return {
        params: {
          ...base,
          duration: 5,
          duration_unit: 't',
          contract_type: type === 'HIGH_TICK' ? 'TICKHIGH' : 'TICKLOW',
          barrier: String(clamp(Number(request.prediction) || 5, 1, 5)),
        },
      };
    case 'ASIAN_UP':
    case 'ASIAN_DOWN':
      return { params: { ...base, ...tickDuration(3, 5), contract_type: type === 'ASIAN_UP' ? 'ASIANUP' : 'ASIANDOWN' } };
    default:
      return {
        error: `${type.replace(/_/g, ' ')} contracts are not available for live trading yet. Use a digit, Rise/Fall, Only Up/Down, High/Low Tick or Asian contract.`,
      };
  }
}
