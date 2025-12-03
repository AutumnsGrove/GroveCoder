// Another intentionally messy file for testing

export class BadCodeExample {
    // Using any types everywhere - no type safety
    private stuff: any;
    public data: any;

    constructor(input: any) {
        this.stuff = input;
        this.data = input;
    }

    // Function with too many parameters and no clear purpose
    doSomething(a: any, b: any, c: any, d: any, e: any, f: any, g: any) {
        // Deeply nested if statements
        if (a) {
            if (b) {
                if (c) {
                    if (d) {
                        if (e) {
                            if (f) {
                                return g;
                            }
                            return f;
                        }
                        return e;
                    }
                    return d;
                }
                return c;
            }
            return b;
        }
        return a;
    }

    // Using var instead of const/let
    badFunction() {
        var x = 10;
        var y = 20;
        var z = 30;

        // Loose equality
        if (x == "10") {
            return true;
        }

        return false;
    }

    // No error handling on async function
    async fetchData(url: string) {
        const response = await fetch(url);
        return await response.json();
    }

    // Magic numbers everywhere
    calculate(val: number) {
        if (val > 100) {
            return val * 2.5 + 42 - 17;
        }
        return val / 3.7 + 99;
    }
}

// Global mutable state
export let counter = 0;

// Unused function
function unused(x: any) {
    return x * 2;
}

// No documentation anywhere
export const transform = (items: any[]) => {
    return items.map(x => x * 2).filter(x => x > 10);
};
