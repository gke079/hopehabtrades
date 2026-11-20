import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import FreeBots from '../free-bots';

const mockStore = {
    load_modal: { loadStrategyToBuilder: jest.fn() },
    dashboard: { setActiveTab: jest.fn() },
    blockly_store: { setActiveTab: jest.fn() },
    run_panel: { is_stop_button_visible: false },
};
jest.mock('@/hooks/useStore', () => ({ useStore: () => mockStore }));
jest.mock('@netlify/identity', () => ({ getUser: async () => null }));
jest.mock('@/components/admin-login', () => ({ __esModule: true, default: () => null }));
jest.mock('@/utils/admin-auth-callback', () => ({ adminCallback: null, clearAdminCallback: jest.fn() }));
const bot = { id: 'library-bot', name: 'Community digit bot', description: 'Published strategy', xml: '<xml><block type="trade_definition" /></xml>' };
const originalFetch = global.fetch;
beforeEach(() => {
    jest.clearAllMocks();
    mockStore.run_panel.is_stop_button_visible = false;
    mockStore.load_modal.loadStrategyToBuilder.mockResolvedValue(undefined);
    Object.defineProperty(global.crypto, 'randomUUID', { configurable: true, value: () => 'local-copy' });
    global.fetch = jest.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('bot-admin') ? { canManage: false } : url.endsWith('free-bots') ? [bot] : bot })) as unknown as typeof fetch;
});
afterEach(() => { global.fetch = originalFetch; });

it('loads a selected bot before opening its Workspace in Bot Builder', async () => {
    let finish: () => void;
    mockStore.load_modal.loadStrategyToBuilder.mockReturnValue(new Promise<void>(resolve => { finish = resolve; }));
    render(<FreeBots />);
    fireEvent.click(await screen.findByRole('button', { name: bot.name }));
    await waitFor(() => expect(mockStore.load_modal.loadStrategyToBuilder).toHaveBeenCalledWith(expect.objectContaining({ name: bot.name, xml: bot.xml, save_type: 'local' })));
    expect(mockStore.dashboard.setActiveTab).not.toHaveBeenCalled();
    finish!();
    await waitFor(() => expect(mockStore.dashboard.setActiveTab).toHaveBeenCalledWith(1));
    expect(mockStore.blockly_store.setActiveTab).toHaveBeenCalledWith('Workspace');
});
it('keeps an invalid import error visible instead of switching to an empty builder', async () => {
    mockStore.load_modal.loadStrategyToBuilder.mockRejectedValue(new Error('Unsupported bot blocks'));
    render(<FreeBots />);
    fireEvent.click(await screen.findByRole('button', { name: 'Load bot' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Unsupported bot blocks');
    expect(mockStore.dashboard.setActiveTab).not.toHaveBeenCalled();
});
it('prevents replacing an active or paused bot session', async () => {
    mockStore.run_panel.is_stop_button_visible = true;
    render(<FreeBots />);
    expect(await screen.findByRole('button', { name: bot.name })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Load bot' })).toBeDisabled();
});
