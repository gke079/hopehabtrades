import Interpreter from '../interpreter';

const mockLog = jest.fn();
jest.mock('@/components/shared', () => ({ isMultiplierContract: () => false }));
jest.mock('@/utils/clone', () => ({ __esModule: true, default: (value: unknown) => value }));
jest.mock('../../../../utils/observer', () => ({ observer: { emit: jest.fn(), getState: () => [], register: jest.fn() } }));
jest.mock('../../../api/api-base', () => ({ api_base: { clearSubscriptions: jest.fn() } }));
jest.mock('../cliTools', () => ({ createScope: () => ({ observer: { register: jest.fn() }, stopped: false, ticksService: { unsubscribeFromTicksService: () => Promise.resolve() } }) }));
jest.mock('../../Interface', () => ({ __esModule: true, default: () => ({
    tradeEngine: { options: {} },
    getInterface: () => ({
        getTicksInterface: {},
        console: { log: (value: number) => mockLog(value) },
        sleep: () => new Promise(resolve => setTimeout(resolve, 100)),
        start: () => {}, purchase: () => Promise.resolve(), sellAtMarket: () => Promise.resolve(),
    }),
}) }));

beforeEach(() => { jest.useFakeTimers(); mockLog.mockClear(); });
afterEach(() => jest.useRealTimers());
it('stops between async operations and resumes with strategy variables intact', async () => {
    const session = Interpreter();
    const finished = session.run('var stake = 7; sleep(1); stake += 3; console.log(stake); sleep(1); console.log(stake + 1);');
    session.pause();
    await jest.advanceTimersByTimeAsync(100);
    expect(mockLog).not.toHaveBeenCalled();
    session.resume();
    expect(mockLog).toHaveBeenCalledWith(10);
    session.resume(); // Repeated Resume must not run the continuation twice.
    await jest.advanceTimersByTimeAsync(100);
    await finished;
    expect(mockLog.mock.calls).toEqual([[10], [11]]);
});
it('cannot resume a session after termination', async () => {
    const session = Interpreter();
    const finished = session.run('sleep(1); console.log(99);');
    session.pause();
    await session.terminateSession();
    session.resume();
    await jest.advanceTimersByTimeAsync(100);
    await finished;
    expect(mockLog).not.toHaveBeenCalled();
});
it('resumes safely while a previous async request is still pending', async () => {
    const session = Interpreter();
    const finished = session.run('sleep(1); console.log(42);');
    session.pause();
    session.resume();
    expect(mockLog).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(100);
    await finished;
    expect(mockLog.mock.calls).toEqual([[42]]);
});
