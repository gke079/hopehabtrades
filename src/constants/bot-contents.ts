type TTabsTitle = {
    [key: string]: string | number;
};

type TDashboardTabIndex = {
    [key: string]: number;
};

export const tabs_title: TTabsTitle = Object.freeze({
    WORKSPACE: 'Workspace',
    CHART: 'Chart',
});

export const DBOT_TABS: TDashboardTabIndex = Object.freeze({
    DASHBOARD: 0,
    BOT_BUILDER: 1,
    CHART: 2,
    TUTORIAL: 3,
    FREE_BOTS: 4,
    ANALYSIS: 5,
    SIGNAL: 6,
    STRATEGY_BOT: 7,
    HOPELOGIC: 8,
});

export const MAX_STRATEGIES = 10;

export const TAB_IDS = ['id-dbot-dashboard', 'id-bot-builder', 'id-charts', 'id-tutorials', 'id-free-bots', 'id-analysis', 'id-signal', 'id-strategy-bot', 'id-hopelogic'];

export const DEBOUNCE_INTERVAL_TIME = 500;
