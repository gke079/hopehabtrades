import { SiteMarketSocket, HOPELOGIC_TRADE_CHANNEL } from '../site-market-socket';
import { buildContractParams, LiveContractRequest } from './contractMapping';
import { Market, Tick } from '../types';
import { SYNTHETIC_MARKETS, normalizeMarketId } from './markets';

export interface LiveAccountInfo {
  loginid: string;
  currency: string;
  balance: number;
  isVirtual: boolean;
}

export interface LiveTradeOutcome {
  ok: boolean;
  error?: string;
  contractId?: number;
  won?: boolean;
  profit?: number;
  stake?: number;
  payout?: number;
  entrySpot?: number;
  exitSpot?: number;
  balanceAfter?: number;
}

type AccountListener = (account: LiveAccountInfo | null, accounts: LiveAccountInfo[]) => void;
type StatusListener = (status: 'disconnected' | 'connecting' | 'ready') => void;

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface PendingSettlement {
  resolve: (outcome: LiveTradeOutcome) => void;
  reject: (error: Error) => void;
  contractId: number;
  stake: number;
  subId?: string;
  timer: ReturnType<typeof setTimeout>;
}

const REQUEST_TIMEOUT_MS = 20000;
const SETTLEMENT_TIMEOUT_MS = 10 * 60 * 1000;
const RECONNECT_DELAY_MS = 2500;

/**
 * Builds a display tick for a settled real contract. The real exit spot is
 * formatted with the market's pip size so the last digit matches Deriv.
 */
export function makeExitTick(
  entryTick: Tick,
  exitSpot: number | undefined,
  marketId: string,
  fallback: Tick
): Tick {
  if (!Number.isFinite(exitSpot) || !exitSpot) {
    return { ...fallback, quote: fallback.quote };
  }
  const market = SYNTHETIC_MARKETS.find((m) => m.id === normalizeMarketId(marketId));
  const decimals = market
    ? market.decimals
    : fallback.quoteFormatted.includes('.')
    ? fallback.quoteFormatted.split('.')[1]?.length ?? 2
    : 2;
  const quote = Number(exitSpot);
  const quoteFormatted = quote.toFixed(decimals);
  const lastDigit = parseInt(quoteFormatted.charAt(quoteFormatted.length - 1), 10);
  return {
    epoch: fallback.epoch,
    quote,
    quoteFormatted,
    lastDigit: isNaN(lastDigit) ? fallback.lastDigit : lastDigit,
    direction: quote > entryTick.quote ? 'up' : quote < entryTick.quote ? 'down' : 'flat',
    change: quote - entryTick.quote,
  };
}

/**
 * Client for the host site's authorized Deriv connection over the trade
 * bridge. Handles account discovery, live balance updates and the full
 * proposal → buy → settle lifecycle for real contracts.
 */
export class LiveTradeService {
  private socket: SiteMarketSocket | null = null;
  private reqId: number = 0;
  private pendingRequests: Map<number, PendingRequest> = new Map();
  private pendingSettlements: Map<number, PendingSettlement> = new Map();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed: boolean = false;
  private isSocketReady: boolean = false;

  private account: LiveAccountInfo | null = null;
  private accounts: LiveAccountInfo[] = [];
  private accountListeners: Set<AccountListener> = new Set();
  private statusListeners: Set<StatusListener> = new Set();
  private status: 'disconnected' | 'connecting' | 'ready' = 'disconnected';
  private enabled: boolean = false;
  private balanceSubscribed: boolean = false;

  constructor() {
    this.ensureConnection();
  }

  public ensureConnection() {
    if (this.destroyed || this.socket) return;
    this.setStatus('connecting');
    try {
      this.socket = new SiteMarketSocket(HOPELOGIC_TRADE_CHANNEL);
      this.socket.onopen = () => {
        if (this.destroyed) { this.socket?.close(); return; }
        this.isSocketReady = true;
        this.setStatus('ready');
        void this.refreshAccounts();
        void this.subscribeBalance();
      };
      this.socket.onmessage = (event: MessageEvent) => {
        if (this.destroyed) return;
        this.handleMessage(event.data);
      };
      this.socket.onclose = () => {
        if (this.destroyed) return;
        this.handleDisconnect();
      };
      this.socket.onerror = () => {};
    } catch {
      this.socket = null;
      this.handleDisconnect();
    }
  }

  private handleDisconnect() {
    this.isSocketReady = false;
    this.balanceSubscribed = false;
    if (this.socket) {
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onclose = null;
      this.socket.onerror = null;
      try { this.socket.close(); } catch {}
      this.socket = null;
    }
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Trade connection to the site was interrupted'));
    }
    this.pendingRequests.clear();
    for (const pending of this.pendingSettlements.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Trade connection to the site was interrupted'));
    }
    this.pendingSettlements.clear();
    this.setStatus('disconnected');
    if (!this.destroyed) {
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.ensureConnection();
      }, RECONNECT_DELAY_MS);
    }
  }

  private setStatus(status: 'disconnected' | 'connecting' | 'ready') {
    if (this.status === status) return;
    this.status = status;
    this.statusListeners.forEach((listener) => listener(status));
  }

  public getStatus() {
    return this.status;
  }

  public onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => this.statusListeners.delete(listener);
  }

  public onAccounts(listener: AccountListener): () => void {
    this.accountListeners.add(listener);
    listener(this.account, this.accounts);
    return () => this.accountListeners.delete(listener);
  }

  public getAccount(): LiveAccountInfo | null {
    return this.account;
  }

  public getAccounts(): LiveAccountInfo[] {
    return [...this.accounts];
  }

  public getBalance(): number {
    return this.account?.balance ?? 0;
  }

  public setEnabled(enabled: boolean) {
    this.enabled = enabled && Boolean(this.account);
    this.notifyAccounts();
  }

  public isEnabled() {
    return this.enabled && Boolean(this.account);
  }

  public isReady() {
    return this.isEnabled() && this.status === 'ready';
  }

  /** Place a real contract and wait for its settlement on the active account. */
  public async execute(request: LiveContractRequest): Promise<LiveTradeOutcome> {
    if (!this.isReady()) {
      return { ok: false, error: 'Live trading is not connected. Log in on the main site and enable Live mode.' };
    }
    const account = this.account!;
    const built = buildContractParams(request, account.currency);
    if ('error' in built) return { ok: false, error: built.error };

    let proposal: any;
    try {
      proposal = await this.request(built.params);
    } catch (error: any) {
      return { ok: false, error: error?.message || 'Could not get a price for this contract' };
    }
    if (proposal?.error) {
      return { ok: false, error: proposal.error.message || 'Contract request rejected' };
    }
    const proposalId = proposal?.proposal?.id;
    const askPrice = Number(proposal?.proposal?.ask_price);
    if (!proposalId || !Number.isFinite(askPrice) || askPrice <= 0) {
      return { ok: false, error: 'No valid price returned for this contract' };
    }

    let bought: any;
    try {
      bought = await this.request({ buy: proposalId, price: askPrice });
    } catch (error: any) {
      return { ok: false, error: error?.message || 'Contract purchase failed' };
    }
    if (bought?.error) {
      return { ok: false, error: bought.error.message || 'Contract purchase rejected' };
    }
    const contractId = Number(bought?.buy?.contract_id);
    if (!Number.isInteger(contractId) || contractId <= 0) {
      return { ok: false, error: 'Contract purchase did not return a contract id' };
    }

    const stake = Number(bought.buy.buy_price) || askPrice;
    const payout = Number(bought.buy.payout) || 0;
    return this.awaitSettlement(contractId, stake, payout);
  }

  private awaitSettlement(contractId: number, stake: number, payout: number): Promise<LiveTradeOutcome> {
    return new Promise<LiveTradeOutcome>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingSettlements.delete(contractId);
        reject(new Error('Timed out waiting for the contract to settle'));
      }, SETTLEMENT_TIMEOUT_MS);
      this.pendingSettlements.set(contractId, { resolve, reject, contractId, stake, timer });
      void this.request({ proposal_open_contract: 1, contract_id: contractId, subscribe: 1 })
        .then((initial) => {
          const pending = this.pendingSettlements.get(contractId);
          if (pending) pending.subId = initial?.subscription?.id ? String(initial.subscription.id) : undefined;
          const poc = initial?.proposal_open_contract;
          if (poc) this.processContractUpdate(poc);
        })
        .catch((error) => {
          const pending = this.pendingSettlements.get(contractId);
          if (pending) {
            clearTimeout(pending.timer);
            this.pendingSettlements.delete(contractId);
            reject(error instanceof Error ? error : new Error('Failed to track contract settlement'));
          }
        });
    });
  }

  private processContractUpdate(poc: any) {
    const contractId = Number(poc?.contract_id);
    const pending = this.pendingSettlements.get(contractId);
    if (!pending) return;
    const isSettled = Boolean(poc.is_sold || poc.is_expired) || poc.status === 'won' || poc.status === 'lost';
    if (!isSettled) return;
    clearTimeout(pending.timer);
    this.pendingSettlements.delete(contractId);
    if (pending.subId) {
      void this.request({ forget: pending.subId }).catch(() => {});
    }
    const profit = Number(poc.profit);
    const status = String(poc.status || '').toLowerCase();
    const won = status === 'won' || (status !== 'lost' && Number.isFinite(profit) && profit > 0);
    pending.resolve({
      ok: true,
      contractId,
      won,
      profit: Number.isFinite(profit) ? Number(profit.toFixed(2)) : 0,
      stake: Number(poc.buy_price) || pending.stake,
      payout: Number(poc.payout) || 0,
      entrySpot: Number(poc.entry_tick) || undefined,
      exitSpot: Number(poc.exit_tick) || undefined,
      balanceAfter: this.account?.balance,
    });
  }

  public async switchAccount(loginid: string) {
    if (!this.isSocketReady) return false;
    try {
      const reply = await this.request({ hopelogic_switch_account: loginid });
      return Boolean(reply?.hopelogic_switch_account?.ok);
    } catch {
      return false;
    }
  }

  public async refreshAccounts() {
    if (!this.isSocketReady) return;
    try {
      const reply = await this.request({ hopelogic_accounts: 1 });
      const payload = reply?.hopelogic_accounts;
      if (!payload) return;
      this.accounts = (payload.accounts || []).map((a: any) => ({
        loginid: String(a.loginid),
        currency: String(a.currency || 'USD'),
        balance: Number(a.balance) || 0,
        isVirtual: Boolean(a.is_virtual),
      }));
      const current = payload.current
        ? {
            loginid: String(payload.current.loginid),
            currency: String(payload.current.currency || 'USD'),
            balance: Number(payload.current.balance) || 0,
            isVirtual: Boolean(payload.current.is_virtual),
          }
        : null;
      this.account = current;
      this.setEnabled(this.enabled);
      this.notifyAccounts();
    } catch {}
  }

  private async subscribeBalance() {
    if (!this.isSocketReady || this.balanceSubscribed) return;
    this.balanceSubscribed = true;
    try {
      await this.request({ balance: 1, subscribe: 1 });
    } catch {}
  }

  private request(payload: Record<string, unknown>): Promise<any> {
    if (!this.isSocketReady || !this.socket) {
      return Promise.reject(new Error('Trade connection is not open'));
    }
    const reqId = ++this.reqId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(reqId);
        reject(new Error('Trade request timed out'));
      }, REQUEST_TIMEOUT_MS);
      this.pendingRequests.set(reqId, { resolve, reject, timer });
      try {
        this.socket!.send(JSON.stringify({ ...payload, req_id: reqId }));
      } catch (error) {
        clearTimeout(timer);
        this.pendingRequests.delete(reqId);
        reject(new Error('Failed to send trade request'));
      }
    });
  }

  private handleMessage(rawData: string) {
    let data: any;
    try {
      data = JSON.parse(rawData);
    } catch {
      return;
    }
    if (data?.msg_type === 'ping') return;
    const reqId = Number(data?.req_id);
    const pending = this.pendingRequests.get(reqId);
    if (pending) {
      clearTimeout(pending.timer);
      this.pendingRequests.delete(reqId);
      pending.resolve(data);
      // Streamed updates (balance, contract settlement) reuse the subscription
      // request's req_id, so keep the stream alive and only resolve once.
      return;
    }
    if (data?.msg_type === 'balance' && data.balance) {
      this.applyBalanceUpdate(data.balance);
      return;
    }
    if (data?.msg_type === 'proposal_open_contract' && data.proposal_open_contract) {
      this.processContractUpdate(data.proposal_open_contract);
    }
  }

  private applyBalanceUpdate(balance: any) {
    const value = Number(balance.balance);
    const loginid = String(balance.loginid || this.account?.loginid || '');
    if (!Number.isFinite(value)) return;
    const isVirtual = loginid ? /^VR/i.test(loginid) : Boolean(this.account?.isVirtual);
    const next: LiveAccountInfo = {
      loginid: loginid || 'unknown',
      currency: String(balance.currency || this.account?.currency || 'USD'),
      balance: value,
      isVirtual,
    };
    this.account = next;
    if (!this.accounts.some((a) => a.loginid === next.loginid)) {
      this.accounts = [...this.accounts, next];
    } else {
      this.accounts = this.accounts.map((a) => (a.loginid === next.loginid ? next : a));
    }
    this.notifyAccounts();
  }

  private notifyAccounts() {
    this.accountListeners.forEach((listener) => listener(this.account, [...this.accounts]));
  }

  public destroy() {
    this.destroyed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Trade service closed'));
    }
    this.pendingRequests.clear();
    for (const pending of this.pendingSettlements.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Trade service closed'));
    }
    this.pendingSettlements.clear();
    if (this.socket) {
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onclose = null;
      this.socket.onerror = null;
      try { this.socket.close(); } catch {}
      this.socket = null;
    }
    this.statusListeners.clear();
    this.accountListeners.clear();
  }
}
