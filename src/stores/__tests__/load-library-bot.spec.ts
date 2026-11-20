import LoadModalStore from '../load-modal-store';

const mockLoad = jest.fn();
jest.mock('@/external/bot-skeleton', () => ({ load: (...args: unknown[]) => mockLoad(...args) }));
jest.mock('@/external/bot-skeleton/scratch/utils', () => ({}));
jest.mock('@/external/bot-skeleton/utils/workspace', () => ({}));
jest.mock('uuid', () => ({ v4: () => 'test-id' }));
const strategy = { id: 'library-copy', name: 'Published bot', xml: '<xml/>', timestamp: 1, save_type: 'local' };
const originalBlockly = window.Blockly;
afterEach(() => { window.Blockly = originalBlockly; jest.useRealTimers(); });

it('waits until the workspace has initialized before importing', async () => {
    jest.useFakeTimers();
    const root = { blockly_store: { is_loading: true } };
    const store = new LoadModalStore(root as any, {});
    (window as any).Blockly = undefined;
    mockLoad.mockReset().mockResolvedValue(undefined);
    const imported = store.loadStrategyToBuilder(strategy);
    expect(mockLoad).not.toHaveBeenCalled();
    (window as any).Blockly = { derivWorkspace: {} };
    root.blockly_store.is_loading = false;
    await jest.advanceTimersByTimeAsync(50);
    await imported;
    expect(mockLoad).toHaveBeenCalledWith(expect.objectContaining({ block_string: strategy.xml, file_name: strategy.name, workspace: window.Blockly.derivWorkspace }));
    expect(window.Blockly.derivWorkspace.strategy_to_load).toBe(strategy.xml);
});
it('propagates import validation errors and does not mark rejected XML as loaded', async () => {
    const store = new LoadModalStore({ blockly_store: { is_loading: false } } as any, {});
    (window as any).Blockly = { derivWorkspace: {} };
    mockLoad.mockReset().mockResolvedValue({ error: 'Unsupported blocks' });
    await expect(store.loadStrategyToBuilder(strategy)).rejects.toThrow('Unsupported blocks');
    expect(window.Blockly.derivWorkspace.strategy_to_load).toBeUndefined();
});
