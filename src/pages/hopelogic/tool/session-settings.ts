// Ephemeral UI preferences. This workspace does not persist account or strategy data.
const values = new Map<string, string>();
export const sessionSettings = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
};
