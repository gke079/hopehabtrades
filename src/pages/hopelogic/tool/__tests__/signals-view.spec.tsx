import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { SignalsView } from '../components/SignalsView';
import { NormalBotConfig } from '../types';

const scannerStub = () =>
  ({
    subscribe: jest.fn(() => jest.fn()),
    destroy: jest.fn(),
    getIsConnected: jest.fn(() => false),
    getSnapshots: jest.fn(() => []),
    resetMarketWindows: jest.fn(),
  } as never);

jest.mock('../services/signalScannerEngine', () => ({
  ...jest.requireActual('../services/signalScannerEngine'),
  MultiMarketSignalScanner: jest.fn(() => scannerStub()),
}));

const config: NormalBotConfig = {
  name: 'Normal Bot',
  active: false,
  marketId: 'R_10',
  contractType: 'EVEN',
  prediction: 'EVEN',
  stake: 0.35,
  initialStake: 0.35,
  martingale: 1.5,
  takeProfit: 0.7,
  stopLoss: 20,
  duration: 1,
  durationUnit: 't',
} as unknown as NormalBotConfig;

const baseProps = {
  normalBotConfig: config,
  onUpdateNormalBotConfig: jest.fn(),
  onRunSignalOnNormalBot: jest.fn(),
  onStopNormalBot: jest.fn(),
  onResetNormalBot: jest.fn(),
  normalBotRunning: false,
  normalBotStake: 0.35,
  normalBotMetrics: {
    totalTrades: 2,
    wins: 1,
    losses: 1,
    totalProfit: 0.2,
    sessionProfit: 0.2,
    lastStopReason: '',
  } as never,
  activeSignal: null,
};

const panelProps = {
  normalBotPaused: false,
  normalBotCurrentStep: 0,
  normalBotActiveContract: null,
  normalBotTrades: [],
  normalBotBalance: 100,
  digitStats: [],
  onStartNormalBot: jest.fn(),
  onPauseNormalBot: jest.fn(),
  onResumeNormalBot: jest.fn(),
  onResetNormalBotStats: jest.fn(),
  onResetNormalBotStake: jest.fn(),
};

it('keeps the run buttons connected to the normal bot with an embedded panel', () => {
  const { container } = render(<SignalsView {...baseProps} {...panelProps} theme='light' />);
  expect(screen.getByText('Normal Bot')).toBeInTheDocument();
  expect(screen.getAllByText('Idle').length).toBeGreaterThan(0);
  // collapsed by default when idle (panel-only controls absent)
  expect(screen.queryByTitle('Reset trade history and Session P/L')).not.toBeInTheDocument();
  // expands to show the bot controls
  fireEvent.click(screen.getByRole('button', { name: /Normal Bot/ }));
  expect(screen.getByTitle('Reset trade history and Session P/L')).toBeInTheDocument();
  expect(container.firstChild).not.toBeNull();
});

it('auto-opens the normal bot panel while the bot is running', () => {
  render(<SignalsView {...baseProps} {...panelProps} normalBotRunning normalBotWaitingForEntry normalBotEntryStatus='Waiting entry' theme='light' />);
  expect(screen.getByText('Waiting for entry')).toBeInTheDocument();
  expect(screen.getByTitle('Reset trade history and Session P/L')).toBeInTheDocument();
});
