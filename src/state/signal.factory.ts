export function signal<T>(initialValue: T) {
    let value = initialValue;
    const listeners: Array<(value: T) => void> = [];

    return {
        get() {
            return value;
        },
        set(newValue: T) {
            value = newValue;
            listeners.forEach(listener => listener(value));
        },
        subscribe(listener: (value: T) => void) {
            listeners.push(listener);
            return () => {
                const index = listeners.indexOf(listener);
                if (index !== -1) {
                    listeners.splice(index, 1);
                }
            };
        }
    };
}

export interface Signal<T> {
    get(): T;
    set(newValue: T): void;
    subscribe(listener: (value: T) => void): () => void;
}