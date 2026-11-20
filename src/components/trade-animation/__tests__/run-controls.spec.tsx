import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import TradeAnimation from '../trade-animation';

const mockRun = {
    contract_stage: 3, is_stop_button_visible: true, is_stop_button_disabled: true, is_paused: false,
    onRunButtonClick: jest.fn(), onStopBotClick: jest.fn(), onResumeBotClick: jest.fn(), onStopButtonClick: jest.fn(),
};
const mockStore = {
    run_panel: mockRun, dashboard: { active_tab: 1 },
    summary_card: { is_contract_completed: false, profit: 0 },
    blockly_store: { has_active_bot: true, has_saved_bots: true, checkForSavedBots: async () => {} },
    load_modal: { dashboard_strategies: [], is_delete_modal_open: false },
};
jest.mock('@/hooks/useStore', () => ({ useStore: () => mockStore }));
jest.mock('mobx-react-lite', () => ({ observer: (component: unknown) => component }));
jest.mock('@deriv-com/ui', () => ({ useDevice: () => ({ isMobile: false }) }));
jest.mock('@deriv/quill-icons/LabelPaired', () => ({ LabelPairedPlayLgFillIcon: () => null, LabelPairedSquareLgFillIcon: () => null }));
jest.mock('@/components/contract-result-overlay', () => ({ __esModule: true, default: () => null }));
jest.mock('../../shared_ui/button', () => ({ __esModule: true, default: ({ children, onClick, is_disabled }: any) => <button disabled={is_disabled} onClick={onClick}>{children}</button> }));
jest.mock('../../shared_ui/tooltip/tooltip', () => ({ __esModule: true, default: () => null }));
jest.mock('../circular-wrapper', () => ({ __esModule: true, default: () => null }));
jest.mock('../contract-stage-text', () => ({ __esModule: true, default: () => null }));

it('offers Stop during purchase and Resume and End session once stopped', () => {
    const { rerender } = render(<TradeAnimation />);
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(mockRun.onStopBotClick).toHaveBeenCalledTimes(1);
    mockRun.is_paused = true;
    rerender(<TradeAnimation />);
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(mockRun.onResumeBotClick).toHaveBeenCalledTimes(1);
    expect(mockRun.onRunButtonClick).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'End session' }));
    expect(mockRun.onStopButtonClick).toHaveBeenCalledTimes(1);
});
